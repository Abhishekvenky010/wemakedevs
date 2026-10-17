use crate::graph::comparison::canonical_cycle;
use falkordb::FalkorAsyncClient;
use futures::TryStreamExt;
use serde_json::{Value, json};
use std::collections::HashSet;

pub async fn trace_wallet_data(
    client: &FalkorAsyncClient,
    address: &str,
) -> Result<Vec<Value>, String> {
    let mut graph = client.select_graph("defi_risk");

    let query = r#"
        MATCH path =
            (start:Wallet {address: $address})
            -[:TRANSFERRED_TO*3..6]->(start)
        RETURN DISTINCT
            start.address AS wallet,
            length(path) AS hop_count,
            [node IN nodes(path) | node.address] AS path_wallets
        LIMIT 50
    "#;

    let mut result = graph
        .ro_query(query)
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
