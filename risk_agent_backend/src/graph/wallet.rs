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
