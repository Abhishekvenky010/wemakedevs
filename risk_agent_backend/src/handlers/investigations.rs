use axum::{Json, extract::State};
use futures::TryStreamExt;
use std::sync::Arc;

use crate::error::api_error;
use crate::state::AppState;

pub async fn save_investigation(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, axum::Json<serde_json::Value>)> {
    let mut graph = state.falkor_client.select_graph("defi_risk");

    let query = r#"
        MATCH (w:Wallet)
        WHERE w.address = 'demo_wallet_1'
        CREATE (i:Investigation {
            id: randomUUID(),
            finding: 'Circular transfer pattern',
            confidence: 0.65,
            created_at: timestamp(),
            status: 'needs_review'
        })
        CREATE (i)-[:INVOLVES]->(w)
        RETURN i.id AS id,
               i.finding AS finding,
               i.created_at AS created_at
    "#;

    let mut result = graph.query(query).execute().await.map_err(api_error)?;

    let row = result.data.try_next().await.map_err(api_error)?;

    match row {
        Some(row) => {
            let id: String = row.try_get("id").map_err(api_error)?;
            let finding: String = row.try_get("finding").map_err(api_error)?;
            let created_at: i64 = row.try_get("created_at").map_err(api_error)?;

            Ok(Json(serde_json::json!({
                "status": "success",
                "investigation": {
                    "id": id,
                    "finding": finding,
                    "created_at": created_at
                }
            })))
        }
        None => Err((
            axum::http::StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "status": "error",
                "error": "Demo wallet not found. Seed the demo graph first."
            })),
        )),
    }
}

// Returns saved investigations from FalkorDB.
pub async fn list_investigations(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, axum::Json<serde_json::Value>)> {
    let mut graph = state.falkor_client.select_graph("defi_risk");

    let query = r#"
        MATCH (i:Investigation)
         RETURN
            coalesce(i.id, 'unknown') AS id,
            coalesce(i.finding, 'Unknown finding') AS finding,
            coalesce(i.confidence, 0.0) AS confidence,
            coalesce(i.created_at, 0) AS created_at,
            coalesce(i.status, 'needs_review') AS status
        ORDER BY i.created_at DESC
        LIMIT 50
    "#;

    let mut result = graph.ro_query(query).execute().await.map_err(api_error)?;

    let mut investigations = Vec::new();

    while let Some(row) = result.data.try_next().await.map_err(api_error)? {
        let id: String = row.try_get("id").map_err(api_error)?;
        let finding: String = row.try_get("finding").map_err(api_error)?;
        let confidence: Option<f64> = row.try_get("confidence").map_err(api_error)?;
        let created_at: i64 = row.try_get("created_at").map_err(api_error)?;
        let status: String = row.try_get("status").map_err(api_error)?;

        investigations.push(serde_json::json!({
            "id": id,
            "finding": finding,
            "confidence": confidence,
            "created_at": created_at,
            "status": status
        }));
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "count": investigations.len(),
        "investigations": investigations
    })))
}

pub async fn retrieve_memory(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, axum::Json<serde_json::Value>)> {
    let mut graph = state.falkor_client.select_graph("defi_risk");

    let query = r#"
        MATCH path =
            (start:Wallet)-[:TRANSFERRED_TO*3..6]->(start)
        WITH collect(DISTINCT start.address) AS cycle_wallets
        UNWIND cycle_wallets AS wallet_address
        MATCH (i:Investigation)-[:INVOLVES]->(w:Wallet)
        WHERE w.address = wallet_address
        WITH
            i,
            collect(DISTINCT w.address) AS matched_wallets
        RETURN
            coalesce(i.id, 'unknown') AS id,
            coalesce(i.finding, 'Unknown finding') AS finding,
            i.confidence AS confidence,
            coalesce(i.created_at, 0) AS created_at,
            coalesce(i.status, 'needs_review') AS status,
            matched_wallets,
            i.report AS report,
            i.graph_evidence_json AS graph_evidence_json
        ORDER BY created_at DESC
        LIMIT 50
    "#;

    let mut result = graph.ro_query(query).execute().await.map_err(api_error)?;

    let mut memories = Vec::new();

    while let Some(row) = result.data.try_next().await.map_err(api_error)? {
        let id: String = row.try_get("id").map_err(api_error)?;
        let finding: String = row.try_get("finding").map_err(api_error)?;
        let created_at: i64 = row.try_get("created_at").map_err(api_error)?;
        let status: String = row.try_get("status").map_err(api_error)?;

        let confidence: Option<f64> = row.try_get("confidence").map_err(api_error)?;

        let matched_wallets: Vec<String> = row.try_get("matched_wallets").map_err(api_error)?;

        let report: Option<String> = row.try_get("report").map_err(api_error)?;

        let graph_evidence_json: Option<String> =
            row.try_get("graph_evidence_json").map_err(api_error)?;

        let graph_evidence = match graph_evidence_json {
            Some(raw) => Some(serde_json::from_str::<serde_json::Value>(&raw).map_err(api_error)?),
            None => None,
        };

        memories.push(serde_json::json!({
            "id": id,
            "finding": finding,
            "confidence": confidence,
            "created_at": created_at,
            "status": status,
            "matched_wallets": matched_wallets,
            "report": report,
            "graph_evidence": graph_evidence
        }));
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "count": memories.len(),
        "memories": memories
    })))
}
