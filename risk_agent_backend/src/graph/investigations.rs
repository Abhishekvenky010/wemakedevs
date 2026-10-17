use falkordb::FalkorAsyncClient;
use futures::TryStreamExt;
use serde_json::{Value, json};

pub async fn find_related_cases(
    client: &FalkorAsyncClient,
    address: &str,
) -> Result<Vec<Value>, String> {
    let mut graph = client.select_graph("defi_risk");

    let query = r#"
        MATCH (i:Investigation)-[:INVOLVES]->(w:Wallet)
        WHERE w.address = $address
        RETURN DISTINCT
            coalesce(i.id, 'unknown') AS id,
            coalesce(i.finding, 'Unknown finding') AS finding,
            i.confidence AS confidence,
            coalesce(i.created_at, 0) AS created_at,
            coalesce(i.status, 'needs_review') AS status,
            w.address AS matched_wallet,
            i.report AS report,
            i.graph_evidence_json AS graph_evidence_json,
            (
                i.id IS NOT NULL
                AND i.finding IS NOT NULL
                AND i.created_at IS NOT NULL
                AND i.status IS NOT NULL
            ) AS record_complete
        ORDER BY created_at DESC
        LIMIT 20
    "#;

    let mut result = graph
        .ro_query(query)
        .with_param("address", address.to_string())
        .execute()
        .await
        .map_err(|e| e.to_string())?;

    let mut cases = Vec::new();

    while let Some(row) = result.data.try_next().await.map_err(|e| e.to_string())? {
        let id: String = row.try_get("id").map_err(|e| e.to_string())?;
        let finding: String = row.try_get("finding").map_err(|e| e.to_string())?;
        let confidence: Option<f64> = row.try_get("confidence").map_err(|e| e.to_string())?;
        let created_at: i64 = row.try_get("created_at").map_err(|e| e.to_string())?;
        let status: String = row.try_get("status").map_err(|e| e.to_string())?;
        let matched_wallet: String = row.try_get("matched_wallet").map_err(|e| e.to_string())?;
        let report: Option<String> = row.try_get("report").map_err(|e| e.to_string())?;
        let graph_evidence_json: Option<String> = row
            .try_get("graph_evidence_json")
            .map_err(|e| e.to_string())?;
        let record_complete: bool = row.try_get("record_complete").map_err(|e| e.to_string())?;

        let graph_evidence = match graph_evidence_json {
            Some(raw) => Some(serde_json::from_str::<Value>(&raw).map_err(|e| e.to_string())?),
            None => None,
        };

        cases.push(json!({
            "id": id,
            "finding": finding,
            "confidence": confidence,
            "created_at": created_at,
            "status": status,
            "matched_wallet": matched_wallet,
            "report": report,
            "graph_evidence": graph_evidence,
            "has_graph_evidence": graph_evidence.is_some(),
            "has_report": report.is_some(),
            "record_complete": record_complete
        }));
    }

    Ok(cases)
}
