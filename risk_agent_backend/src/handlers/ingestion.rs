use axum::{Json, extract::State};
use serde::{Deserialize, Deserializer, de};
use serde_json::Value;
use std::sync::Arc;

use crate::ingestion::{IngestionConfig, ingest_wallet};
use crate::state::AppState;

/// Maximum counterparty expansion depth allowed for a user-initiated
/// real ingestion. Prevents unbounded recursion and RPC request volume.
pub const MAX_ALLOWED_DEPTH: i64 = 3;

#[derive(Deserialize)]
pub struct IngestWalletRequest {
    pub address: String,
    #[serde(default, deserialize_with = "deserialize_max_depth")]
    pub max_depth: i64,
    #[serde(default)]
    pub data_source: String,
}

fn deserialize_max_depth<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    value
        .as_i64()
        .ok_or_else(|| de::Error::custom("max_depth must be an integer between 0 and 3"))
}

/// Validate the client-requested expansion depth. The bound keeps the
/// investigation bounded: 0..=3 are accepted, anything above is rejected
/// with a clear HTTP error before any RPC call is made.
pub fn validate_max_depth(max_depth: i64) -> Result<(), String> {
    if !(0..=MAX_ALLOWED_DEPTH).contains(&max_depth) {
        return Err(format!(
            "max_depth must be between 0 and {MAX_ALLOWED_DEPTH}, got {max_depth}"
        ));
    }
    Ok(())
}

pub fn apply_requested_depth(config: &mut IngestionConfig, max_depth: i64) -> Result<(), String> {
    validate_max_depth(max_depth)?;
    config.max_depth = max_depth as usize;
    Ok(())
}

// Ingest recent real Solana mainnet transfers for a wallet into FalkorDB.
// This is the explicit real-data path. Mock data is only ever created by
// /api/seed-demo and is never mixed into this flow.
pub async fn ingest_wallet_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<IngestWalletRequest>,
) -> Result<Json<Value>, (axum::http::StatusCode, Json<Value>)> {
    let address = payload.address.trim();

    if address.is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "status": "error",
                "error": "Wallet address cannot be empty"
            })),
        ));
    }

    if !crate::ingestion::is_valid_wallet_address(address) {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "status": "error",
                "error": "Invalid Solana wallet address. Provide a base58 public key that decodes to 32 bytes."
            })),
        ));
    }

    // Reject synthetic data source on the real ingestion path: demo wallets
    // must never be ingested through /api/ingest-wallet.
    let request_source = payload.data_source.trim().to_ascii_lowercase();
    if matches!(
        request_source.as_str(),
        "simulation" | "demo" | "synthetic" | "test"
    ) {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "status": "error",
                "error": "synthetic data source is not supported on the real ingestion path; use /api/seed-demo for demo data"
            })),
        ));
    }
    if !matches!(request_source.as_str(), "" | "real" | "live") {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "status": "error",
                "error": "data_source must be 'real' for wallet ingestion"
            })),
        ));
    }

    let mut config = IngestionConfig::from_env();
    apply_requested_depth(&mut config, payload.max_depth).map_err(|error| {
        (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "status": "error",
                "error": error.to_string(),
                "max_depth": payload.max_depth,
                "max_allowed_depth": MAX_ALLOWED_DEPTH,
            })),
        )
    })?;

    let result = ingest_wallet(&state, address, &config).await;

    if let Some(err) = result.error {
        let status = if result.rate_limited {
            axum::http::StatusCode::TOO_MANY_REQUESTS
        } else {
            axum::http::StatusCode::BAD_GATEWAY
        };
        return Err((
            status,
            Json(serde_json::json!({
                "status": "error",
                "address": result.address,
                "provider": "solana_rpc",
                "data_source": "real",
                "max_depth": config.max_depth,
                "max_depth_reached": result.max_depth_reached,
                "signatures_fetched": result.signatures_fetched,
                "transactions_fetched": result.transactions_fetched,
                "transactions_processed": result.transactions_processed,
                "total_transactions_processed": result.total_transactions_processed,
                "transfers_persisted": result.transfers_persisted,
                "duplicates_skipped": result.duplicates_skipped,
                "failed_transactions": result.failed_transactions,
                "persistence_errors": result.persistence_errors,
                "rate_limited": result.rate_limited,
                "incomplete": true,
                "wallets_visited": result.wallets_visited,
                "transfers": [],
                "error": err,
            })),
        ));
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "address": result.address,
        "provider": "solana_rpc",
        "data_source": "real",
        "max_depth": config.max_depth,
        "max_depth_reached": result.max_depth_reached,
        "signatures_fetched": result.signatures_fetched,
        "transactions_fetched": result.transactions_fetched,
        "transactions_processed": result.transactions_processed,
        "total_transactions_processed": result.total_transactions_processed,
        "transfers_persisted": result.transfers_persisted,
        "duplicates_skipped": result.duplicates_skipped,
        "failed_transactions": result.failed_transactions,
        "persistence_errors": result.persistence_errors,
        "rate_limited": result.rate_limited,
        "incomplete": result.incomplete,
        "wallets_visited": result.wallets_visited,
        "transfers": result.transfers.iter().map(|t| serde_json::json!({
            "signature": t.signature,
            "slot": t.slot,
            "block_time": t.block_time,
            "success": t.success,
            "transfer_type": t.transfer_type,
            "mint": t.mint,
            "amount": t.amount,
            "source": t.source,
            "destination": t.destination,
            "direction": t.direction,
            "provenance": "real"
        })).collect::<Vec<_>>(),
        "error": null,
    })))
}

#[cfg(test)]
mod handler_tests {
    use super::*;
    use crate::state::AppState;
    use falkordb::{FalkorClientBuilder, FalkorConnectionInfo};
    use serde_json::{Value, json};
    use std::collections::VecDeque;
    use std::env;
    use std::net::SocketAddr;
    use std::sync::Mutex;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    const WALLET: &str = "11111111111111111111111111111111";
    const CP1: &str = "Vote111111111111111111111111111111111111111";
    const CP2: &str = "Stake11111111111111111111111111111111111111";
    const MINT: &str = "So11111111111111111111111111111111111111112";
    const SIG1: &str = "sig_handler_test_1";
    const SIG2: &str = "sig_handler_test_2";

    fn transfer_tx(signature: &str, slot: i64, source: &str, destination: &str) -> Value {
        json!({
            "slot": slot,
            "blockTime": 1_700_000_000,
            "transaction": {
                "signatures": [signature],
                "message": { "accountKeys": [], "instructions": [] }
            },
            "meta": {
                "err": null,
                "preTokenBalances": [
                    {"accountIndex": 0, "mint": MINT, "owner": source, "tokenAmount": {"amount": "1000", "decimals": 2}},
                    {"accountIndex": 1, "mint": MINT, "owner": destination, "tokenAmount": {"amount": "0", "decimals": 2}}
                ],
                "postTokenBalances": [
                    {"accountIndex": 0, "mint": MINT, "owner": source, "tokenAmount": {"amount": "700", "decimals": 2}},
                    {"accountIndex": 1, "mint": MINT, "owner": destination, "tokenAmount": {"amount": "300", "decimals": 2}}
                ]
            }
        })
    }

    fn http_response(status: &str, body: &Value) -> String {
        let body = serde_json::to_string(&body).unwrap();
        format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
    }

    async fn mock_rpc_queue(listener: TcpListener, queue: std::sync::Arc<Mutex<VecDeque<String>>>) {
        while let Ok((mut stream, _)) = listener.accept().await {
            let queue = queue.clone();
            tokio::spawn(async move {
                let mut buf = [0u8; 8192];
                let mut leftover = Vec::new();
                loop {
                    let headers_end = String::from_utf8_lossy(&leftover)
                        .find("\r\n\r\n")
                        .map(|i| i + 4);
                    let Some(headers_end) = headers_end else {
                        let n = stream.read(&mut buf).await.unwrap_or(0);
                        if n == 0 {
                            break;
                        }
                        leftover.extend_from_slice(&buf[..n]);
                        continue;
                    };
                    let mut content_length: usize = 0;
                    for line in String::from_utf8_lossy(&leftover[..headers_end]).lines() {
                        if let Some((name, value)) = line.split_once(':') {
                            if name.eq_ignore_ascii_case("content-length") {
                                content_length = value.trim().parse().unwrap_or(0);
                            }
                        }
                    }
                    if leftover.len() < headers_end + content_length {
                        let n = stream.read(&mut buf).await.unwrap_or(0);
                        if n == 0 {
                            break;
                        }
                        leftover.extend_from_slice(&buf[..n]);
                        continue;
                    }
                    let _request_body = String::from_utf8_lossy(
                        &leftover[headers_end..headers_end + content_length],
                    );
                    leftover.drain(..headers_end + content_length);
                    let response = queue.lock().unwrap().pop_front().unwrap_or_else(|| {
                        http_response("200 OK", &json!({"jsonrpc": "2.0", "id": 1, "result": []}))
                    });
                    if stream.write_all(response.as_bytes()).await.is_err() {
                        break;
                    }
                    if stream.flush().await.is_err() {
                        break;
                    }
                }
            });
        }
    }

    async fn test_state() -> Arc<AppState> {
        dotenvy::dotenv().ok();
        let falkor_url =
            env::var("FALKORDB_URL").expect("FALKORDB_URL must be set for handler tests");
        let conn_info: FalkorConnectionInfo =
            falkor_url.as_str().try_into().expect("valid falkor url");
        let client = FalkorClientBuilder::new_async()
            .with_connection_info(conn_info)
            .with_connect_timeout(Some(std::time::Duration::from_secs(15)))
            .build()
            .await
            .expect("connect to falkordb");
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .expect("http client");
        Arc::new(AppState {
            falkor_client: client,
            groq_api_key: "test".to_string(),
            http_client: http,
        })
    }

    async fn cleanup_test_edges(state: &Arc<AppState>) {
        let mut graph = state.falkor_client.select_graph("defi_risk");
        for sig in [SIG1, SIG2] {
            let _ = graph
                .query("MATCH ()-[r:TRANSFERRED_TO {signature: $sig}]->() DELETE r")
                .with_param("signature", sig)
                .execute()
                .await;
        }
        let _ = graph
            .query("MATCH (n:Wallet) WHERE NOT (n)--() DELETE n")
            .execute()
            .await;
    }

    #[test]
    fn validate_max_depth_accepts_allowed_range() {
        for depth in 0..=MAX_ALLOWED_DEPTH {
            assert!(
                validate_max_depth(depth).is_ok(),
                "depth {depth} must be accepted"
            );
        }
    }

    #[test]
    fn validate_max_depth_rejects_out_of_range() {
        for depth in [-1, MAX_ALLOWED_DEPTH + 1, 10, 100, 1_000] {
            let err = validate_max_depth(depth).unwrap_err();
            assert!(
                err.contains(&depth.to_string()),
                "error must mention the rejected depth: {err}"
            );
            assert!(
                err.contains(&MAX_ALLOWED_DEPTH.to_string()),
                "error must state the bound: {err}"
            );
        }
    }

    #[test]
    fn request_deserializer_rejects_non_integer_depth_with_clear_error() {
        let error = match serde_json::from_value::<IngestWalletRequest>(json!({
            "address": WALLET,
            "max_depth": 1.5
        })) {
            Ok(_) => panic!("fractional depth must be rejected"),
            Err(error) => error.to_string(),
        };
        assert!(error.contains("max_depth must be an integer between 0 and 3"));
    }

    #[test]
    fn applies_requested_depth_to_ingestion_config() {
        for depth in 0..=MAX_ALLOWED_DEPTH {
            let mut config = IngestionConfig::default();
            apply_requested_depth(&mut config, depth).unwrap();
            assert_eq!(config.max_depth, depth as usize);
        }
        let mut config = IngestionConfig::default();
        assert!(apply_requested_depth(&mut config, -1).is_err());
        assert!(apply_requested_depth(&mut config, MAX_ALLOWED_DEPTH + 1).is_err());
    }

    #[tokio::test]
    async fn handler_rejects_depth_above_allowed_bound() {
        let state = test_state().await;
        let err = ingest_wallet_handler(
            State(state),
            Json(IngestWalletRequest {
                address: WALLET.to_string(),
                max_depth: MAX_ALLOWED_DEPTH + 1,
                data_source: "live".to_string(),
            }),
        )
        .await
        .unwrap_err();

        assert_eq!(err.0, axum::http::StatusCode::BAD_REQUEST);
        let Json(err_body) = err.1;
        let body = serde_json::to_string(&err_body).unwrap();
        assert!(
            body.contains("max_depth"),
            "400 body must name the invalid field: {body}"
        );
    }

    #[tokio::test]
    async fn handler_applies_requested_depth_through_ingestion() {
        let state = test_state().await;
        let queue: std::sync::Arc<Mutex<VecDeque<String>>> =
            std::sync::Arc::new(Mutex::new(VecDeque::new()));

        // Signatures for the root wallet, then one transaction per signature,
        // then empty signature lists for the two discovered counterparties.
        queue.lock().unwrap().push_back(http_response(
            "200 OK",
            &json!({"jsonrpc": "2.0", "id": 1, "result": [{"signature": SIG1}, {"signature": SIG2}]}),
        ));
        queue.lock().unwrap().push_back(http_response(
            "200 OK",
            &json!({"jsonrpc": "2.0", "id": 1, "result": transfer_tx(SIG1, 100, WALLET, CP1)}),
        ));
        queue.lock().unwrap().push_back(http_response(
            "200 OK",
            &json!({"jsonrpc": "2.0", "id": 1, "result": transfer_tx(SIG2, 101, WALLET, CP2)}),
        ));
        queue.lock().unwrap().push_back(http_response(
            "200 OK",
            &json!({"jsonrpc": "2.0", "id": 1, "result": []}),
        ));
        queue.lock().unwrap().push_back(http_response(
            "200 OK",
            &json!({"jsonrpc": "2.0", "id": 1, "result": []}),
        ));

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind mock rpc port");
        let addr: SocketAddr = listener.local_addr().expect("mock rpc local addr");
        let rpc_url = format!("http://{addr}");
        let previous_rpc = env::var("SOLANA_RPC_URL").ok();
        unsafe { env::set_var("SOLANA_RPC_URL", &rpc_url) };
        let queue_clone = queue.clone();
        let _server = tokio::spawn(async move { mock_rpc_queue(listener, queue_clone).await });

        let result = ingest_wallet_handler(
            State(state.clone()),
            Json(IngestWalletRequest {
                address: WALLET.to_string(),
                max_depth: 1,
                data_source: "live".to_string(),
            }),
        )
        .await;

        let (status, body) = match result {
            Ok(Json(body)) => (axum::http::StatusCode::OK, body),
            Err((status, Json(body))) => {
                panic!(
                    "ingestion with mock RPC failed unexpectedly: status={status}, body={body:?}"
                )
            }
        };
        assert_eq!(status, axum::http::StatusCode::OK);
        assert_eq!(body["max_depth"], 1);
        assert_eq!(body["max_depth_reached"], 1);
        assert_eq!(body["data_source"], "real");
        assert_eq!(body["incomplete"], false);
        assert!(body["error"].is_null());
        assert_eq!(
            body["wallets_visited"], 3,
            "root wallet plus both counterparties"
        );
        assert_eq!(body["transactions_fetched"], 2);
        assert_eq!(body["transactions_processed"], 2);
        assert_eq!(body["total_transactions_processed"], 2);
        assert_eq!(body["transfers_persisted"], 2);
        assert_eq!(body["duplicates_skipped"], 0);
        assert_eq!(body["failed_transactions"], 0);
        assert_eq!(body["rate_limited"], false);

        // Depth 0 keeps ingestion at the initial wallet: counterparties are
        // discovered but never expanded, so only the root wallet is visited.
        queue.lock().unwrap().clear();
        queue.lock().unwrap().push_back(http_response(
            "200 OK",
            &json!({"jsonrpc": "2.0", "id": 1, "result": [{"signature": SIG1}]}),
        ));
        queue.lock().unwrap().push_back(http_response(
            "200 OK",
            &json!({"jsonrpc": "2.0", "id": 1, "result": transfer_tx(SIG1, 100, WALLET, CP1)}),
        ));

        let result_depth0 = ingest_wallet_handler(
            State(state.clone()),
            Json(IngestWalletRequest {
                address: WALLET.to_string(),
                max_depth: 0,
                data_source: "live".to_string(),
            }),
        )
        .await;

        // Restore env before any assertions/panics.
        match previous_rpc {
            Some(v) => unsafe { env::set_var("SOLANA_RPC_URL", &v) },
            None => unsafe { env::remove_var("SOLANA_RPC_URL") },
        }

        let (status0, body0) = match result_depth0 {
            Ok(Json(body)) => (axum::http::StatusCode::OK, body),
            Err((status, Json(body))) => {
                panic!("depth-0 ingestion failed unexpectedly: status={status}, body={body:?}")
            }
        };
        assert_eq!(status0, axum::http::StatusCode::OK);
        assert_eq!(body0["max_depth"], 0);
        assert_eq!(body0["max_depth_reached"], 0);
        assert_eq!(
            body0["wallets_visited"], 1,
            "depth 0 visits only the initial wallet"
        );
        assert_eq!(body0["transactions_processed"], 1);

        cleanup_test_edges(&state).await;
    }
}
