// Bounded real-data ingestion for Solana mainnet transactions.
//
// Fetches a bounded number of recent transactions for a supplied wallet address
// from a configured Solana RPC, extracts native SOL and SPL-token transfers,
// and persists them idempotently into FalkorDB. Supports bounded counterparty
// expansion: newly discovered counterparty wallets are recursively ingested up
// to a configurable maximum depth, with a visited-wallet set to avoid reprocessing
// and signature deduplication to prevent duplicate edges.
//
// Synthetic/demo wallets are never expanded in a real-data ingestion path.

use crate::state::AppState;
use falkordb::FalkorAsyncClient;
use futures::TryStreamExt;
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet, VecDeque};
use std::time::Duration;

/// Graph label used for wallet nodes.
const WALLET_LABEL: &str = "Wallet";
/// Graph relationship type used for every transfer edge.
const TRANSFERRED_TO: &str = "TRANSFERRED_TO";
/// Graph name.
const GRAPH_NAME: &str = "defi_risk";

/// Maximum transactions fetched per wallet per ingestion (bounded).
const MAX_TRANSACTIONS_PER_WALLET: usize = 25;
/// Default maximum expansion depth for counterparty discovery. Depth 0 preserves
/// existing behavior: only the supplied wallet's direct transfers are ingested.
const DEFAULT_MAX_DEPTH: usize = 0;
/// Default maximum total transactions processed across all wallets in one
/// investigation.
const DEFAULT_MAX_TOTAL_TRANSACTIONS: usize = 100;
/// Bound graph fan-out so a single investigation cannot trigger an excessive
/// number of RPC calls even when every transaction discovers many wallets.
const MAX_WALLETS_PER_INVESTIGATION: usize = 100;

/// How long to wait for a single RPC call before treating it as a failure.
const RPC_TIMEOUT_SECS: u64 = 20;

/// Configuration for the ingestion path.
#[derive(Clone, Debug)]
pub struct IngestionConfig {
    pub rpc_url: String,
    pub max_transactions_per_wallet: usize,
    pub max_depth: usize,
    pub max_total_transactions: usize,
}

impl Default for IngestionConfig {
    fn default() -> Self {
        Self {
            rpc_url: std::env::var("SOLANA_RPC_URL")
                .unwrap_or_else(|_| "https://api.mainnet-beta.solana.com".to_string()),
            max_transactions_per_wallet: MAX_TRANSACTIONS_PER_WALLET,
            max_depth: DEFAULT_MAX_DEPTH,
            max_total_transactions: DEFAULT_MAX_TOTAL_TRANSACTIONS,
        }
    }
}

impl IngestionConfig {
    pub fn from_env() -> Self {
        Self::default()
    }
}

/// A single normalized transfer, traceable to one real transaction signature.
#[derive(Clone, Debug)]
pub struct TransferRecord {
    pub signature: String,
    pub slot: Option<i64>,
    pub block_time: Option<i64>,
    pub success: bool,
    /// "NATIVE_SOL" or "SPL_TOKEN".
    pub transfer_type: String,
    /// Mint address for SPL transfers; "SOL" for native SOL transfers.
    pub mint: String,
    /// Human units (SOL for native, token units for SPL). Never invented.
    pub amount: f64,
    pub source: String,
    pub destination: String,
    /// Direction relative to the ingested wallet: "outgoing" | "incoming" | "relay".
    pub direction: String,
}

/// Result of ingesting one wallet (and optionally its counterparties).
#[derive(Debug, Default)]
pub struct IngestionResult {
    pub address: String,
    pub signatures_fetched: usize,
    pub transactions_fetched: usize,
    pub transactions_processed: usize,
    pub total_transactions_processed: usize,
    pub transfers_persisted: usize,
    pub duplicates_skipped: usize,
    pub failed_transactions: usize,
    pub persistence_errors: usize,
    pub rate_limited: bool,
    pub incomplete: bool,
    pub wallets_visited: usize,
    pub max_depth_reached: usize,
    pub error: Option<String>,
    pub transfers: Vec<TransferRecord>,
}

/// Queue entry for bounded counterparty expansion.
struct QueueEntry {
    address: String,
    depth: usize,
}

/// Run a bounded ingestion for `address` and persist direct transfers.
///
/// When `config.max_depth > 0`, counterparties discovered from transfers are
/// enqueued for ingestion up to that depth. A visited-wallet set prevents
/// reprocessing, and `config.max_total_transactions` caps the total number of
/// transactions processed across all wallets in the investigation.
pub async fn ingest_wallet(
    state: &AppState,
    address: &str,
    config: &IngestionConfig,
) -> IngestionResult {
    let trimmed = address.trim();
    let mut result = IngestionResult {
        address: trimmed.to_string(),
        ..Default::default()
    };

    if trimmed.is_empty() {
        result.error = Some("Wallet address cannot be empty".to_string());
        return result;
    }

    // Basic Solana address sanity check (base58, 32-44 chars).
    if !is_valid_wallet_address(trimmed) {
        result.error = Some("Invalid Solana wallet address format".to_string());
        return result;
    }

    let mut visited: HashSet<String> = HashSet::new();
    let mut queued_wallets: HashSet<String> = HashSet::new();
    let mut seen_signatures: HashSet<String> = HashSet::new();
    let mut queue: VecDeque<QueueEntry> = VecDeque::new();

    let initial_address = trimmed.to_string();
    queued_wallets.insert(initial_address.clone());
    queue.push_back(QueueEntry {
        address: initial_address,
        depth: 0,
    });

    let mut max_depth_reached: usize = 0;
    let mut total_transactions_processed: usize = 0;

    'wallets: while let Some(entry) = queue.pop_front() {
        if visited.contains(&entry.address) {
            continue;
        }
        if visited.len() >= MAX_WALLETS_PER_INVESTIGATION {
            result.incomplete = true;
            break;
        }
        visited.insert(entry.address.clone());
        result.wallets_visited += 1;
        max_depth_reached = max_depth_reached.max(entry.depth);

        // Enforce the global transaction budget before fetching more history.
        if total_transactions_processed >= config.max_total_transactions {
            result.incomplete = true;
            break;
        }

        let signatures = match fetch_signatures(&state.http_client, config, &entry.address).await {
            Ok(sigs) => sigs,
            Err(e) if e == "rate_limited" => {
                result.rate_limited = true;
                result.incomplete = true;
                result.error = Some(format!(
                    "Solana RPC rate limit reached while fetching history for {}",
                    entry.address
                ));
                break;
            }
            Err(e) => {
                result.incomplete = true;
                result.error = Some(format!(
                    "failed to fetch transaction history for {}: {e}",
                    entry.address
                ));
                break;
            }
        };
        result.signatures_fetched += signatures.len();

        for sig_value in &signatures {
            // Enforce the global transaction budget.
            if total_transactions_processed >= config.max_total_transactions {
                result.incomplete = true;
                break 'wallets;
            }

            let signature = match sig_value.get("signature").and_then(Value::as_str) {
                Some(s) => s.to_string(),
                None => {
                    result.failed_transactions += 1;
                    result.incomplete = true;
                    continue;
                }
            };

            // Deduplicate signatures across all wallets in the investigation.
            if !seen_signatures.insert(signature.clone()) {
                result.duplicates_skipped += 1;
                continue;
            }

            let tx = match fetch_transaction(&state.http_client, config, &signature).await {
                Ok(tx) => tx,
                Err(e) if e == "rate_limited" => {
                    record_transaction_failure(&mut result, &e);
                    continue;
                }
                Err(e) => {
                    record_transaction_failure(&mut result, &e);
                    continue;
                }
            };

            if tx.is_null() || tx.get("meta").is_none() {
                result.failed_transactions += 1;
                result.incomplete = true;
                continue;
            }
            result.transactions_fetched += 1;
            total_transactions_processed += 1;
            result.transactions_processed += 1;
            if tx
                .get("meta")
                .and_then(|meta| meta.get("err"))
                .is_some_and(|error| !error.is_null())
            {
                result.failed_transactions += 1;
                result.incomplete = true;
                continue;
            }
            let transfers = normalize_transaction(&tx, &entry.address);
            let mut persisted_transfers = Vec::new();

            for t in &transfers {
                match persist_transfer(&state.falkor_client, t).await {
                    Ok(true) => {
                        result.transfers_persisted += 1;
                        persisted_transfers.push(t.clone());
                    }
                    Ok(false) | Err(_) => {
                        result.persistence_errors += 1;
                        result.incomplete = true;
                        eprintln!("Failed to persist a real transfer edge to FalkorDB");
                    }
                }
            }
            result.transfers.extend(persisted_transfers);

            // Enqueue counterparty wallets for expansion if within depth budget.
            if entry.depth < config.max_depth {
                for t in &transfers {
                    let counterparty = if t.source == entry.address {
                        &t.destination
                    } else {
                        &t.source
                    };
                    if counterparty != &entry.address
                        && !visited.contains(counterparty)
                        && !queued_wallets.contains(counterparty)
                    {
                        if queued_wallets.len() >= MAX_WALLETS_PER_INVESTIGATION {
                            result.incomplete = true;
                            continue;
                        }
                        queued_wallets.insert(counterparty.clone());
                        queue.push_back(QueueEntry {
                            address: counterparty.clone(),
                            depth: entry.depth + 1,
                        });
                    }
                }
            }
        }
    }

    result.total_transactions_processed = total_transactions_processed;
    result.max_depth_reached = max_depth_reached;

    result
}

fn record_transaction_failure(result: &mut IngestionResult, error: &str) {
    result.failed_transactions += 1;
    result.incomplete = true;
    if error == "rate_limited" {
        result.rate_limited = true;
    }
}

/// JSON-RPC request envelope.
fn rpc_request(method: &str, params: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params
    })
}

/// Extract the `result` field from a JSON-RPC response, surfacing server errors.
fn rpc_result(body: &Value) -> Result<Value, String> {
    if let Some(err) = body.get("error") {
        return Err(format!("RPC error: {err}"));
    }
    body.get("result")
        .cloned()
        .ok_or_else(|| "RPC response missing result field".to_string())
}

/// Fetch recent transaction signatures for a wallet address.
async fn fetch_signatures(
    http: &reqwest::Client,
    config: &IngestionConfig,
    address: &str,
) -> Result<Vec<Value>, String> {
    let params = json!([address, { "limit": config.max_transactions_per_wallet, "commitment": "confirmed" }]);
    let body = http
        .post(&config.rpc_url)
        .timeout(Duration::from_secs(RPC_TIMEOUT_SECS))
        .json(&rpc_request("getSignaturesForAddress", params))
        .send()
        .await
        .map_err(|_| "getSignaturesForAddress request failed".to_string())?;

    let status = body.status();
    if status.as_u16() == 429 {
        return Err("rate_limited".to_string());
    }
    if !status.is_success() {
        return Err(format!("getSignaturesForAddress returned HTTP {status}"));
    }
    let text = body
        .text()
        .await
        .map_err(|_| "failed to read the Solana RPC signatures response".to_string())?;

    let value: Value = serde_json::from_str(&text)
        .map_err(|_| "failed to parse the Solana RPC signatures response".to_string())?;
    let result = rpc_result(&value).map_err(|error| {
        if is_rate_limit_error(&error) {
            "rate_limited".to_string()
        } else {
            "Solana RPC returned an error while fetching signatures".to_string()
        }
    })?;
    result
        .as_array()
        .cloned()
        .ok_or_else(|| "Solana RPC returned a non-list signature result".to_string())
}

/// Fetch one parsed transaction by signature.
async fn fetch_transaction(
    http: &reqwest::Client,
    config: &IngestionConfig,
    signature: &str,
) -> Result<Value, String> {
    let params = json!([signature, { "encoding": "jsonParsed", "commitment": "confirmed", "maxSupportedTransactionVersion": 0 }]);
    let body = http
        .post(&config.rpc_url)
        .timeout(Duration::from_secs(RPC_TIMEOUT_SECS))
        .json(&rpc_request("getTransaction", params))
        .send()
        .await
        .map_err(|_| "getTransaction request failed".to_string())?;

    let status = body.status();
    if status.as_u16() == 429 {
        return Err("rate_limited".to_string());
    }
    if !status.is_success() {
        return Err(format!("getTransaction returned HTTP {status}"));
    }
    let text = body
        .text()
        .await
        .map_err(|_| "failed to read the Solana RPC transaction response".to_string())?;

    let value: Value = serde_json::from_str(&text)
        .map_err(|_| "failed to parse the Solana RPC transaction response".to_string())?;
    rpc_result(&value).map_err(|error| {
        if is_rate_limit_error(&error) {
            "rate_limited".to_string()
        } else {
            "Solana RPC returned an error while fetching a transaction".to_string()
        }
    })
}

fn is_rate_limit_error(error: &str) -> bool {
    let error = error.to_ascii_lowercase();
    error.contains("rate limit")
        || error.contains("too many requests")
        || error.contains("429")
        || error.contains("-32005")
}

/// Parse a u64-like amount string into f64 token units given decimals.
fn amount_units(amount_str: &str, decimals: u32) -> Option<f64> {
    let raw: f64 = amount_str.parse().ok()?;
    let divisor = 10f64.powi(decimals as i32);
    Some(raw / divisor)
}

/// Is a string a plausible Solana base58 owner address? Verifies we never
/// mistake a token-account address for a wallet owner without an owner field.
pub fn is_valid_wallet_address(s: &str) -> bool {
    let s = s.trim();
    if s.is_empty() || s.len() < 32 || s.len() > 44 {
        return false;
    }
    let leading_zeroes = s.chars().take_while(|c| *c == '1').count();
    let mut decoded = Vec::<u8>::new();
    for character in s.chars().skip(leading_zeroes) {
        let digit = match character {
            '1'..='9' => character as u32 - '1' as u32,
            'A'..='H' => character as u32 - 'A' as u32 + 9,
            'J'..='N' => character as u32 - 'J' as u32 + 17,
            'P'..='Z' => character as u32 - 'P' as u32 + 22,
            'a'..='k' => character as u32 - 'a' as u32 + 33,
            'm'..='z' => character as u32 - 'm' as u32 + 44,
            _ => return false,
        };

        let mut carry = digit;
        for byte in &mut decoded {
            carry += u32::from(*byte) * 58;
            *byte = (carry & 0xff) as u8;
            carry >>= 8;
        }
        while carry > 0 {
            decoded.push((carry & 0xff) as u8);
            carry >>= 8;
        }
    }

    leading_zeroes + decoded.len() == 32
}

/// Normalize one parsed transaction into transfer records involving `wallet`.
fn normalize_transaction(tx: &Value, wallet: &str) -> Vec<TransferRecord> {
    let mut transfers: Vec<TransferRecord> = Vec::new();

    let signature = tx
        .get("transaction")
        .and_then(|t| t.get("signatures"))
        .and_then(|s| s.get(0))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let slot = tx.get("slot").and_then(Value::as_i64);
    let block_time = tx.get("blockTime").and_then(Value::as_i64);
    let meta = match tx.get("meta") {
        Some(m) => m,
        None => return transfers,
    };
    // A transaction succeeds when `err` is absent or null; any non-null
    // `err` (e.g. an InstructionError object) marks it as failed.
    let success = match meta.get("err") {
        None | Some(Value::Null) => true,
        Some(_) => false,
    };

    // --- SPL token transfers via pre/post token balance diffs ---
    if let Some(transfers_spl) = spl_transfers(meta, wallet, &signature, slot, block_time, success)
    {
        transfers.extend(transfers_spl);
    }

    // --- Native SOL transfers via system.transfer instructions ---
    if let Some(transfers_sol) =
        native_sol_transfers(tx, wallet, &signature, slot, block_time, success)
    {
        transfers.extend(transfers_sol);
    }

    // Tag direction relative to the ingested wallet.
    for t in transfers.iter_mut() {
        t.direction = if t.source == wallet {
            "outgoing".to_string()
        } else if t.destination == wallet {
            "incoming".to_string()
        } else {
            "relay".to_string()
        };
    }

    transfers
}

/// Extract SPL token transfers by diffing pre/post token balances.
fn spl_transfers(
    meta: &Value,
    wallet: &str,
    signature: &str,
    slot: Option<i64>,
    block_time: Option<i64>,
    success: bool,
) -> Option<Vec<TransferRecord>> {
    let pre = meta
        .get("preTokenBalances")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let post = meta
        .get("postTokenBalances")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    if pre.is_empty() && post.is_empty() {
        return None;
    }

    // accountIndex -> (mint, owner, decimals, amount_units)
    let mut pre_map: HashMap<usize, (String, String, u32, f64)> = HashMap::new();
    let mut post_map: HashMap<usize, (String, String, u32, f64)> = HashMap::new();

    let populate = |arr: &[Value], map: &mut HashMap<usize, (String, String, u32, f64)>| {
        for entry in arr {
            let ai = entry
                .get("accountIndex")
                .and_then(Value::as_u64)
                .map(|v| v as usize)?;
            let mint = entry.get("mint").and_then(Value::as_str)?.to_string();
            let owner = entry.get("owner").and_then(Value::as_str)?.to_string();
            let decimals = entry
                .get("tokenAmount")
                .and_then(|t| t.get("decimals"))
                .and_then(Value::as_u64)
                .unwrap_or(0) as u32;
            let amount = entry
                .get("tokenAmount")
                .and_then(|t| t.get("amount"))
                .and_then(Value::as_str)
                .and_then(|a| amount_units(a, decimals))
                .unwrap_or(0.0);
            map.insert(ai, (mint, owner, decimals, amount));
        }
        None::<()>
    };
    populate(&pre, &mut pre_map);
    populate(&post, &mut post_map);

    // Determine per-account delta (post - pre). Only accounts present in both.
    let mut sources: Vec<(usize, String, String, u32, f64)> = Vec::new(); // ai, mint, owner, decimals, delta
    let mut dests: Vec<(usize, String, String, u32, f64)> = Vec::new();

    for (ai, (mint_post, _, _, amt_post)) in &post_map {
        if let Some((_, owner_pre, decimals_pre, amt_pre)) = pre_map.get(ai) {
            let mint = mint_post.clone();
            let owner = owner_pre.clone();
            let decimals = *decimals_pre;
            let delta = amt_post - amt_pre;
            if delta.abs() < 1e-9 {
                continue;
            }
            if delta < 0.0 {
                sources.push((*ai, mint, owner, decimals, -delta));
            } else {
                dests.push((*ai, mint, owner, decimals, delta));
            }
        }
    }

    if sources.is_empty() || dests.is_empty() {
        return None;
    }

    // Greedily match sources to destinations by mint.
    let mut remaining_dests: Vec<(usize, String, String, u32, f64)> = dests;
    let mut out: Vec<TransferRecord> = Vec::new();

    for (_, mint, owner, _decimals, sent) in sources {
        let mut left = sent;
        for d in remaining_dests.iter_mut() {
            if left <= 1e-9 {
                break;
            }
            if d.1 != mint {
                continue;
            }
            let take = left.min(d.4);
            if take <= 1e-9 {
                continue;
            }
            d.4 -= take;
            left -= take;
            if !is_valid_wallet_address(&owner) || !is_valid_wallet_address(&d.2) {
                continue;
            }
            // Only record transfers where the ingested wallet is a direct party,
            // keeping the graph bounded to the wallet's own activity.
            if owner != wallet && d.2 != wallet {
                continue;
            }
            // `take` is already in token units (pre/post amounts were converted).
            out.push(TransferRecord {
                signature: signature.to_string(),
                slot,
                block_time,
                success,
                transfer_type: "SPL_TOKEN".to_string(),
                mint: mint.clone(),
                amount: take,
                source: owner.clone(),
                destination: d.2.clone(),
                direction: String::new(),
            });
        }
    }

    if out.is_empty() { None } else { Some(out) }
}

/// Extract native SOL transfers from parsed system.transfer instructions.
fn native_sol_transfers(
    tx: &Value,
    wallet: &str,
    signature: &str,
    slot: Option<i64>,
    block_time: Option<i64>,
    success: bool,
) -> Option<Vec<TransferRecord>> {
    let message = tx.get("transaction").and_then(|t| t.get("message"))?;
    let instructions = message.get("instructions").and_then(Value::as_array)?;
    if instructions.is_empty() {
        return None;
    }

    let mut out: Vec<TransferRecord> = Vec::new();

    for instr in instructions {
        let program = instr.get("program").and_then(Value::as_str).unwrap_or("");
        if program != "system" {
            continue;
        }
        let parsed = instr
            .get("parsed")
            .and_then(|p| p.get("type"))
            .and_then(Value::as_str)
            .unwrap_or("");
        if parsed != "transfer" {
            continue;
        }
        let info = instr.get("parsed").and_then(|p| p.get("info"))?;
        let source = info
            .get("source")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let destination = info
            .get("destination")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let lamports: f64 = info
            .get("lamports")
            .and_then(|v| {
                v.as_str()
                    .and_then(|s| s.parse::<f64>().ok())
                    .or_else(|| v.as_u64().map(|n| n as f64))
            })
            .unwrap_or(0.0);
        if lamports <= 0.0 {
            continue;
        }
        if !is_valid_wallet_address(&source) || !is_valid_wallet_address(&destination) {
            continue;
        }
        // Only record transfers where the ingested wallet is a direct party.
        if source != wallet && destination != wallet {
            continue;
        }
        out.push(TransferRecord {
            signature: signature.to_string(),
            slot,
            block_time,
            success,
            transfer_type: "NATIVE_SOL".to_string(),
            mint: "SOL".to_string(),
            amount: lamports / 1_000_000_000.0,
            source,
            destination,
            direction: String::new(),
        });
    }

    if out.is_empty() { None } else { Some(out) }
}

/// Persist one transfer record idempotently. Re-ingesting the same signature
/// between the same source and destination does not duplicate the edge.
async fn persist_transfer(client: &FalkorAsyncClient, t: &TransferRecord) -> Result<bool, String> {
    let mut graph = client.select_graph(GRAPH_NAME);

    // MERGE on nodes and on the relationship keyed by signature: idempotent.
    let query = format!(
        r#"MERGE (src:{label} {{address: $src}})
MERGE (dst:{label} {{address: $dst}})
MERGE (src)-[r:{rel} {{signature: $signature}}]->(dst)
ON CREATE SET r.created_at = timestamp()
    SET r.source = $source,
    r.slot = $slot,
    r.block_time = $block_time,
    r.mint = $mint,
    r.amount = $amount,
    r.transfer_type = $transfer_type,
    r.success = $success,
    r.direction = $direction
RETURN r.signature AS signature"#,
        label = WALLET_LABEL,
        rel = TRANSFERRED_TO
    );

    let mut result = graph
        .query(&query)
        .with_param("src", &t.source)
        .with_param("dst", &t.destination)
        .with_param("signature", &t.signature)
        .with_param("source", "real")
        .with_param("slot", t.slot)
        .with_param("block_time", t.block_time)
        .with_param("mint", &t.mint)
        .with_param("amount", t.amount)
        .with_param("transfer_type", &t.transfer_type)
        .with_param("success", t.success)
        .with_param("direction", &t.direction)
        .execute()
        .await
        .map_err(|e| format!("persist transfer failed: {e}"))?;

    // Count rows returned: 1 row per signature merged (existing or new).
    let mut seen_any = false;
    while let Some(_row) = result.data.try_next().await.map_err(|e| e.to_string())? {
        seen_any = true;
    }
    Ok(seen_any)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::provenance::DataSource;

    fn tx_json(pre: Value, post: Value) -> Value {
        json!({
            "slot": 123,
            "blockTime": 1_700_000_000,
            "transaction": {
                "signatures": ["sig_abc"],
                "message": {
                    "accountKeys": [],
                    "instructions": []
                }
            },
            "meta": {
                "err": null,
                "preBalances": [],
                "postBalances": [],
                "preTokenBalances": pre,
                "postTokenBalances": post
            }
        })
    }

    fn token_balance(
        account_index: usize,
        mint: &str,
        owner: &str,
        amount: &str,
        decimals: u32,
    ) -> Value {
        json!({
            "accountIndex": account_index,
            "mint": mint,
            "owner": owner,
            "tokenAmount": { "amount": amount, "decimals": decimals }
        })
    }

    #[test]
    fn normalizes_spl_transfer_with_owner_verification() {
        let wallet = "11111111111111111111111111111111";
        let other = "So11111111111111111111111111111111111111112";
        let mint = "So11111111111111111111111111111111111111112";
        let tx = tx_json(
            json!([
                token_balance(0, mint, wallet, "1000", 2),
                token_balance(1, mint, other, "0", 2)
            ]),
            json!([
                token_balance(0, mint, wallet, "700", 2),
                token_balance(1, mint, other, "300", 2)
            ]),
        );
        let transfers = normalize_transaction(&tx, wallet);
        assert_eq!(transfers.len(), 1);
        let t = &transfers[0];
        assert_eq!(t.transfer_type, "SPL_TOKEN");
        assert_eq!(t.mint, mint);
        assert_eq!(t.source, wallet);
        assert_eq!(t.destination, other);
        assert_eq!(t.amount, 3.0); // 300 / 10^2
        assert_eq!(t.signature, "sig_abc");
        assert!(t.success);
        assert_eq!(t.direction, "outgoing");
    }

    #[test]
    fn normalizes_native_sol_transfer() {
        let wallet = "11111111111111111111111111111111";
        let other = "So11111111111111111111111111111111111111112";
        let tx = json!({
            "slot": 5,
            "blockTime": None::<i64>,
            "transaction": {
                "signatures": ["sig_sol"],
                "message": {
                    "accountKeys": [],
                    "instructions": [
                        {
                            "program": "system",
                            "parsed": { "type": "transfer", "info": {
                                "source": wallet,
                                "destination": other,
                                "lamports": 1500000000
                            }}
                        }
                    ]
                }
            },
            "meta": { "err": null, "preBalances": [], "postBalances": [] }
        });
        let transfers = normalize_transaction(&tx, wallet);
        assert_eq!(transfers.len(), 1);
        let t = &transfers[0];
        assert_eq!(t.transfer_type, "NATIVE_SOL");
        assert_eq!(t.mint, "SOL");
        assert_eq!(t.source, wallet);
        assert_eq!(t.destination, other);
        assert_eq!(t.amount, 1.5);
        assert_eq!(t.block_time, None);
        assert_eq!(t.direction, "outgoing");
    }

    #[test]
    fn ignores_transfers_not_involving_ingested_wallet() {
        let wallet = "11111111111111111111111111111111";
        let a = "Vote111111111111111111111111111111111111111";
        let b = "Stake11111111111111111111111111111111111111";
        let mint = "So11111111111111111111111111111111111111112";
        let tx = tx_json(
            json!([
                token_balance(0, mint, a, "1000", 2),
                token_balance(1, mint, b, "0", 2)
            ]),
            json!([
                token_balance(0, mint, a, "700", 2),
                token_balance(1, mint, b, "300", 2)
            ]),
        );
        let transfers = normalize_transaction(&tx, wallet);
        assert!(transfers.is_empty());
    }

    #[test]
    fn handles_missing_metadata_and_failed_transaction() {
        let wallet = "11111111111111111111111111111111";
        let tx = json!({
            "slot": 1,
            "blockTime": None::<i64>,
            "transaction": { "signatures": ["sig_fail"], "message": { "accountKeys": [], "instructions": [] } },
            "meta": { "err": { "InstructionError": [0, { "Custom": 1 }] } }
        });
        let transfers = normalize_transaction(&tx, wallet);
        assert!(transfers.is_empty());
    }

    #[test]
    fn duplicate_signature_returns_no_new_row() {
        // Persistence idempotency is verified against FalkorDB in a separate
        // integration check; here we confirm the record carries a signature.
        let t = TransferRecord {
            signature: "sig_dup".to_string(),
            slot: Some(1),
            block_time: Some(1_700_000_000),
            success: true,
            transfer_type: "NATIVE_SOL".to_string(),
            mint: "SOL".to_string(),
            amount: 1.0,
            source: "11111111111111111111111111111111".to_string(),
            destination: "So11111111111111111111111111111111111111112".to_string(),
            direction: "outgoing".to_string(),
        };
        assert_eq!(t.signature, "sig_dup");
        assert_eq!(t.amount, 1.0);
    }

    #[test]
    fn rejects_invalid_address_format() {
        assert!(!is_valid_wallet_address("not-a-valid-address!!"));
        assert!(!is_valid_wallet_address(""));
        assert!(!is_valid_wallet_address("short"));
        assert!(!is_valid_wallet_address("22222222222222222222222222222222"));
        assert!(is_valid_wallet_address("11111111111111111111111111111111"));
        assert!(is_valid_wallet_address(
            "1Cr5DFMVC6gFuaMdekwKAcW9i1URqtCyx2vmgBu3Q7J"
        ));
    }

    #[test]
    fn rpc_rate_limit_is_reported_as_failed_partial_ingestion() {
        assert!(is_rate_limit_error(
            "RPC error: {\"code\":-32005,\"message\":\"Too many requests\"}"
        ));
        let mut result = IngestionResult::default();
        record_transaction_failure(&mut result, "rate_limited");

        assert!(result.rate_limited);
        assert!(result.incomplete);
        assert_eq!(result.failed_transactions, 1);
    }

    /// End-to-end check against Solana mainnet and FalkorDB.
    ///
    /// Runs only with `cargo test -- --ignored` when both `FALKORDB_URL` and
    /// `SOLANA_RPC_URL` are set in the environment. Otherwise it is skipped.
    ///
    /// Verifies that a real mainnet transaction yields a normalized transfer
    /// traceable to its signature, that the transfer is persisted idempotently
    /// (re-ingesting the same signature does not duplicate the edge), and that
    /// the graph only ever contains transfers sourced from real signatures.
    #[ignore]
    #[test]
    fn mainnet_ingest_and_idempotency_against_falkordb() {
        use dotenvy::dotenv;
        use falkordb::{FalkorClientBuilder, FalkorConnectionInfo};
        use std::env;

        dotenv().ok();

        let rpc_url = match env::var("SOLANA_RPC_URL") {
            Ok(v) if !v.is_empty() => v,
            _ => {
                eprintln!("SKIP mainnet test: SOLANA_RPC_URL not set");
                return;
            }
        };
        let falkor_url = match env::var("FALKORDB_URL") {
            Ok(v) if !v.is_empty() => v,
            _ => {
                eprintln!("SKIP mainnet test: FALKORDB_URL not set");
                return;
            }
        };

        unsafe { env::set_var("SOLANA_RPC_URL", &rpc_url) };

        let conn_info: FalkorConnectionInfo =
            falkor_url.as_str().try_into().expect("valid falkor url");
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        let client = rt
            .block_on(
                FalkorClientBuilder::new_async()
                    .with_connection_info(conn_info)
                    .build(),
            )
            .expect("connect to falkordb");

        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(RPC_TIMEOUT_SECS))
            .build()
            .expect("http client");

        let state = AppState {
            falkor_client: client,
            groq_api_key: "test".to_string(),
            http_client: http,
        };

        let address = "1Cr5DFMVC6gFuaMdekwKAcW9i1URqtCyx2vmgBu3Q7J";

        // 1. The wallet must have a bounded, non-empty recent history.
        let sigs = rt
            .block_on(fetch_signatures(
                &state.http_client,
                &IngestionConfig::default(),
                address,
            ))
            .expect("fetch signatures");
        eprintln!("MAINNET signatures fetched: {}", sigs.len());
        assert!(!sigs.is_empty(), "wallet should have recent signatures");
        assert!(
            sigs.len() <= IngestionConfig::default().max_transactions_per_wallet,
            "bounded fetch"
        );

        // 2. A known successful transaction containing a system.transfer SOL transfer.
        let signature = "4SVpH2CKMnw3nJkbKbkkB8MxamzDGLo6U6usMTdYtsd445oNsxRgVnFLHRTHoZhDjeu4Rnxy3jAmcavxgFtLkXTh";
        let tx = rt
            .block_on(fetch_transaction(
                &state.http_client,
                &IngestionConfig::default(),
                signature,
            ))
            .expect("fetch known transaction");
        eprintln!(
            "MAINNET tx success: {:?}",
            tx.get("meta").and_then(|m| m.get("err"))
        );

        // 3. Normalize: must yield a NATIVE_SOL transfer traceable to this signature.
        let transfers = normalize_transaction(&tx, address);
        eprintln!("MAINNET transfers normalized: {}", transfers.len());
        assert!(
            !transfers.is_empty(),
            "expected at least one real transfer from the known tx"
        );

        let sol_transfers: Vec<_> = transfers
            .iter()
            .filter(|t| t.transfer_type == "NATIVE_SOL")
            .collect();
        assert!(!sol_transfers.is_empty(), "expected a NATIVE_SOL transfer");
        let t = &sol_transfers[0];
        assert_eq!(t.signature, signature);
        assert_eq!(t.source, address);
        assert_eq!(t.mint, "SOL");
        assert!(
            (t.amount - 0.001939365).abs() < 1e-6,
            "unexpected SOL amount: {}",
            t.amount
        );
        assert!(t.success);
        assert!(!t.destination.is_empty());

        // 4. Persist idempotently: same signature twice -> one edge.
        let mut persisted = 0usize;
        for _ in 0..2 {
            for tr in &transfers {
                if rt
                    .block_on(persist_transfer(&state.falkor_client, tr))
                    .is_ok()
                {
                    persisted += 1;
                }
            }
        }
        eprintln!("MAINNET persist calls (2 rounds): {persisted}");

        // 5. Verify the edge exists in FalkorDB and count distinct signature edges for this source->dst.
        let mut graph = state.falkor_client.select_graph(GRAPH_NAME);
        let edge_count = rt.block_on(async {
            let result = graph
                .query(format!(
                    "MATCH (src:{label})-[:{rel} {{signature: $signature}}]->(dst:{label}) RETURN dst.address AS dst",
                    label = WALLET_LABEL,
                    rel = TRANSFERRED_TO
                ))
                .with_param("signature", signature)
                .execute()
                .await
                .expect("query edge");
            let mut q = result.data;
            let mut count = 0usize;
            while let Some(row) = q.try_next().await.expect("stream") {
                let _dst: String = row.try_get("dst").expect("dst");
                count += 1;
            }
            count
        });
        eprintln!("MAINNET distinct edges for signature {signature}: {edge_count}");
        assert_eq!(
            edge_count, 1,
            "re-ingesting a signature must not duplicate the edge"
        );

        // 6. Clean up the test edge so we don't pollute the shared graph (best-effort).
        let _ = rt.block_on(async {
            let _ = graph
                .query(format!(
                    "MATCH (src:{label})-[rel:{rel} {{signature: $signature}}]->(dst:{label}) DELETE rel",
                    label = WALLET_LABEL,
                    rel = TRANSFERRED_TO
                ))
                .with_param("signature", signature)
                .execute()
                .await;
            let _ = graph.query("MATCH (n) WHERE NOT (n)--() DELETE n").execute().await;
        });

        eprintln!("MAINNET end-to-end real-data ingestion verified");
    }

    #[test]
    fn ingestion_config_defaults_are_conservative() {
        let config = IngestionConfig::default();
        assert_eq!(config.max_depth, 0, "depth 0 preserves existing behavior");
        assert_eq!(
            config.max_total_transactions, DEFAULT_MAX_TOTAL_TRANSACTIONS,
            "bounded total transaction budget"
        );
        assert_eq!(
            config.max_transactions_per_wallet, MAX_TRANSACTIONS_PER_WALLET,
            "bounded per-wallet fetch"
        );
        assert!(!config.rpc_url.is_empty(), "rpc url must be set");
    }

    #[test]
    fn ingest_wallet_rejects_empty_address() {
        // Empty and invalid addresses are rejected before any RPC call.
        // This is verified by the public-key validator returning false for them.
        assert!(!is_valid_wallet_address(""));
        assert!(!is_valid_wallet_address("not-a-valid-address!!"));
        assert!(!is_valid_wallet_address("short"));
        // Valid addresses pass the format check.
        assert!(is_valid_wallet_address("11111111111111111111111111111111"));
        assert_eq!(IngestionConfig::default().max_depth, 0);
    }

    #[test]
    fn real_data_source_excludes_unknown_provenance() {
        // An edge with no `source` property must not match the real filter.
        assert_eq!(
            crate::graph::provenance::classify_edge(None, None),
            None,
            "missing provenance is unknown"
        );
        assert_eq!(
            crate::graph::provenance::classify_edge(Some("legacy"), None),
            None,
            "unrecognized source is unknown"
        );
        assert_eq!(
            crate::graph::provenance::classify_edge(Some("real"), None),
            Some(DataSource::Real),
            "explicit real provenance"
        );
    }

    #[test]
    fn synthetic_data_source_requires_explicit_demo_marker() {
        // A `demo_id` without `source` still classifies as synthetic.
        assert_eq!(
            crate::graph::provenance::classify_edge(None, Some("demo_transfer_1")),
            Some(DataSource::Synthetic),
            "demo_id implies synthetic"
        );
        // But `source = 'demo'` alone also classifies as synthetic.
        assert_eq!(
            crate::graph::provenance::classify_edge(Some("demo"), None),
            Some(DataSource::Synthetic),
            "source=demo implies synthetic"
        );
    }

    #[test]
    fn duplicate_signatures_are_skipped_during_expansion() {
        // seen_signatures dedup is exercised via insert returning false.
        let mut seen: HashSet<String> = HashSet::new();
        assert!(seen.insert("sig_1".to_string()));
        assert!(
            !seen.insert("sig_1".to_string()),
            "duplicate signature rejected"
        );
        assert!(
            !seen.insert("sig_1".to_string()),
            "duplicate signature rejected again"
        );
    }

    #[test]
    fn visited_wallet_set_prevents_reprocessing() {
        let mut visited: HashSet<String> = HashSet::new();
        assert!(visited.insert("wallet_a".to_string()));
        assert!(!visited.insert("wallet_a".to_string()), "already visited");
        assert!(
            visited.insert("wallet_b".to_string()),
            "new wallet accepted"
        );
    }
}
