use crate::graph::comparison::canonical_cycle;
use crate::graph::provenance::DataSource;
use falkordb::FalkorAsyncClient;
use futures::TryStreamExt;
use serde_json::{Value, json};
use std::collections::HashSet;

/// Source-scoped cycle detection.
///
/// Only relationships whose provenance marker matches the requested data
/// source are traversed, so real and synthetic edges can never be mixed in a
/// single returned path.
pub async fn trace_wallet_data(
    client: &FalkorAsyncClient,
    address: &str,
    data_source: DataSource,
) -> Result<Vec<Value>, String> {
    let mut graph = client.select_graph("defi_risk");

    let edge_filter = data_source.edge_filter();

    // `WHERE ALL(r IN relationships(path) WHERE ...)` filters each individual
    // relationship in the variable-length path to the requested source, so a
    // path containing even one edge of the wrong (or unknown) provenance is
    // excluded at query time.
    let query = format!(
        r#"MATCH path =
            (start:Wallet {{address: $address}})
            -[:TRANSFERRED_TO*3..6]->(start)
        WHERE ALL(r IN relationships(path) WHERE {edge_filter})
        RETURN DISTINCT
            start.address AS wallet,
            length(path) AS hop_count,
            [node IN nodes(path) | node.address] AS path_wallets
        LIMIT 50"#,
        edge_filter = edge_filter
    );

    let mut result = graph
        .ro_query(&query)
        .with_param("address", address.to_string())
        .execute()
        .await
        .map_err(|e| e.to_string())?;

    let mut cycles = Vec::new();

    while let Some(row) = result.data.try_next().await.map_err(|e| e.to_string())? {
        let wallet: String = row.try_get("wallet").map_err(|e| e.to_string())?;

        let hop_count: i64 = row.try_get("hop_count").map_err(|e| e.to_string())?;

        let path_wallets: Vec<String> = row.try_get("path_wallets").map_err(|e| e.to_string())?;

        cycles.push(json!({
            "wallet": wallet,
            "hop_count": hop_count,
            "path_wallets": path_wallets
        }));
    }

    let mut seen: HashSet<Vec<String>> = HashSet::new();

    let unique_cycles = cycles
        .into_iter()
        .filter_map(|cycle| {
            let path: Vec<String> = cycle
                .get("path_wallets")?
                .as_array()?
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect();

            let canonical = canonical_cycle(&path)?;

            if !seen.insert(canonical.clone()) {
                return None;
            }

            Some(json!({
                "wallet": address,
                "hop_count": canonical.len(),
                "path_wallets": canonical
            }))
        })
        .collect();

    Ok(unique_cycles)
}

/// Fetch persisted transfer edges in a wallet's bounded neighborhood.
///
/// This is intentionally broader than [`trace_wallet_data`]: it returns the
/// real (or demo) transaction edges themselves so the UI can render the wallet
/// graph even when those transfers do not form a cycle. The neighborhood is
/// capped at the depth actually reached by ingestion (minimum 1 so direct
/// counterparties are always visible). Cycle detection stays a separate,
/// stricter query and remains the only input to the action rule.
pub async fn fetch_wallet_transfers(
    client: &FalkorAsyncClient,
    address: &str,
    data_source: DataSource,
    max_depth_reached: usize,
) -> Result<Vec<Value>, String> {
    let mut graph = client.select_graph("defi_risk");

    let edge_filter = data_source.edge_filter();

    // First collect every wallet reachable through same-source edges within the
    // ingested depth. Filtering the path relationships (not just the final
    // edge query) prevents a demo edge from pulling a wallet into a real
    // investigation and vice versa.
    let depth = max_depth_reached.clamp(1, 3);

    let query = format!(
        r#"MATCH path =
            (root:Wallet {{address: $address}})
            -[:TRANSFERRED_TO*1..{depth}]-(n:Wallet)
        WHERE ALL(r IN relationships(path) WHERE {edge_filter})
        WITH collect(DISTINCT n.address) AS neighbor_addresses
        WITH [$address] + neighbor_addresses AS nodes
        MATCH (src:Wallet)-[r:TRANSFERRED_TO]->(dst:Wallet)
        WHERE src.address IN nodes
          AND dst.address IN nodes
          AND {edge_filter}
        RETURN src.address AS source,
               dst.address AS destination,
               r.signature AS signature,
               r.amount AS amount,
               r.mint AS mint,
               r.slot AS slot,
               r.block_time AS block_time,
               r.transfer_type AS transfer_type,
               r.success AS success
        ORDER BY r.slot DESC
        LIMIT 300"#,
        depth = depth,
        edge_filter = edge_filter
    );

    let mut result = graph
        .ro_query(&query)
        .with_param("address", address.to_string())
        .execute()
        .await
        .map_err(|e| e.to_string())?;

    let mut transfers = Vec::new();

    while let Some(row) = result.data.try_next().await.map_err(|e| e.to_string())? {
        let source: String = row.try_get("source").map_err(|e| e.to_string())?;
        let destination: String = row.try_get("destination").map_err(|e| e.to_string())?;
        let signature: Option<String> = row.try_get("signature").ok();
        let amount: Option<f64> = row.try_get("amount").ok();
        let mint: Option<String> = row.try_get("mint").ok();
        let slot: Option<i64> = row.try_get("slot").ok();
        let block_time: Option<i64> = row.try_get("block_time").ok();
        let transfer_type: Option<String> = row.try_get("transfer_type").ok();
        let success: Option<bool> = row.try_get("success").ok();

        let direction = if source == address {
            "outgoing"
        } else if destination == address {
            "incoming"
        } else {
            "internal"
        };

        transfers.push(json!({
            "source": source,
            "destination": destination,
            "direction": direction,
            "signature": signature.unwrap_or_default(),
            "amount": amount.unwrap_or(0.0),
            "mint": mint.unwrap_or_default(),
            "slot": slot,
            "block_time": block_time,
            "transfer_type": transfer_type.unwrap_or_default(),
            "success": success.unwrap_or(true)
        }));
    }

    Ok(transfers)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::provenance::SOURCE_REAL;

    // Helpers mirroring classification used in `risk_report.rs` isolation logic,
    // verified against the shared provenance module so real and demo edges are
    // never confused.
    #[test]
    fn real_demo_and_unknown_provenance_classify_correctly() {
        assert_eq!(
            crate::graph::provenance::classify_edge(Some(SOURCE_REAL), None),
            Some(DataSource::Real)
        );
        assert_eq!(
            crate::graph::provenance::classify_edge(None, Some("demo_transfer_1")),
            Some(DataSource::Synthetic)
        );
        assert_eq!(
            crate::graph::provenance::classify_edge(Some("legacy"), None),
            None
        );
    }
}
