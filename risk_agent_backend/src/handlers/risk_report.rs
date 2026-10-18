use axum::{Json, extract::State};
use serde::Deserialize;
use futures::TryStreamExt;
use serde_json::Value;
use std::collections::HashSet;
use std::sync::Arc;

use crate::agent::orchestrator::run_groq_agent;
use crate::error::api_error;
use crate::graph::comparison::compare_paths;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct GenerateRiskReportRequest {
    pub address: String,
}

// Generate an AI-powered risk report based on graph data for a specific wallet address.
pub async fn generate_risk_report(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<GenerateRiskReportRequest>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, axum::Json<serde_json::Value>)> {
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

    // Fetch circular-transfer evidence from FalkorDB, filtered by the requested address.
    let mut graph = state.falkor_client.select_graph("defi_risk");

    let query = r#"
        MATCH path =
            (start:Wallet {address: $address})
            -[:TRANSFERRED_TO*3..6]->(start)
        RETURN DISTINCT
            coalesce(start.address, 'unknown_wallet') AS wallet,
            length(path) AS hop_count,
            [node IN nodes(path) | node.address] AS path_wallets
        LIMIT 10
    "#;

    let mut result = graph
        .ro_query(query)
        .with_param("address", address.to_string())
        .execute()
        .await.map_err(api_error)?;

    let mut cycles = Vec::<serde_json::Value>::new();

    while let Some(row) = result.data.try_next().await.map_err(api_error)? {
        let wallet: String = row.try_get("wallet").map_err(api_error)?;
        let hop_count: i64 = row.try_get("hop_count").map_err(api_error)?;
        let path_wallets: Vec<String> = row.try_get("path_wallets").map_err(api_error)?;

        cycles.push(serde_json::json!({
            "wallet": wallet,
            "hop_count": hop_count,
            "path_wallets": path_wallets
        }));
    }

    // Retrieve previous investigations linked to wallets
    // participating in cycles for the requested address.
    let memory_query = r#"
        MATCH path =
            (start:Wallet {address: $address})
            -[:TRANSFERRED_TO*3..6]->(start)
        WITH collect(DISTINCT start.address) AS cycle_wallets
        UNWIND cycle_wallets AS wallet_address
        MATCH (i:Investigation)-[:INVOLVES]->(w:Wallet)
        WHERE w.address = wallet_address
        RETURN DISTINCT
            coalesce(i.id, 'unknown') AS id,
            coalesce(i.finding, 'Unknown finding') AS finding,
            i.confidence AS confidence,
            coalesce(i.created_at, 0) AS created_at,
            coalesce(i.status, 'needs_review') AS status,
            w.address AS matched_wallet,
            i.graph_evidence_json AS graph_evidence_json
        ORDER BY created_at DESC
        LIMIT 20
    "#;

    let mut memory_result = graph
        .ro_query(memory_query)
        .with_param("address", address.to_string())
        .execute()
        .await
        .map_err(api_error)?;

    let mut memories = Vec::<serde_json::Value>::new();

    while let Some(row) = memory_result.data.try_next().await.map_err(api_error)? {
        let id: String = row.try_get("id").map_err(api_error)?;
        let finding: String = row.try_get("finding").map_err(api_error)?;
        let status: String = row.try_get("status").map_err(api_error)?;
        let matched_wallet: String = row.try_get("matched_wallet").map_err(api_error)?;
        let confidence: Option<f64> = row.try_get("confidence").map_err(api_error)?;
        let created_at: i64 = row.try_get("created_at").map_err(api_error)?;
        let graph_evidence_json: Option<String> =
            row.try_get("graph_evidence_json").map_err(api_error)?;

        let graph_evidence = match graph_evidence_json {
            Some(raw) => match serde_json::from_str::<serde_json::Value>(&raw) {
                Ok(value) => Some(value),
                Err(error) => {
                    eprintln!("Historical graph evidence is invalid JSON for case {id}: {error}");
                    None
                }
            },
            None => None,
        };

        memories.push(serde_json::json!({
            "id": id,
            "finding": finding,
            "confidence": confidence,
            "created_at": created_at,
            "status": status,
            "matched_wallet": matched_wallet,
            "graph_evidence": graph_evidence
        }));
    }

    let comparison = compare_paths(&cycles, &memories);

    let novelty_status = comparison
        .get("novelty_status")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("uncertain_incomplete_history");

    let structured_report = serde_json::json!({
        "summary": if cycles.is_empty() {
            "No circular-transfer paths were detected."
        } else {
            "Circular-transfer paths were detected; this is a risk signal, not proof of wrongdoing."
        },
        "observations": {
            "current_unique_cycles": comparison["current_unique_cycles"],
            "historical_unique_cycles": comparison["historical_unique_cycles"],
            "recurring_cycles": comparison["recurring_cycles"]
        },
        "novelty_status": novelty_status,
        "limitations": comparison["limitations"],
        "recommended_actions": [
            "Review the underlying transfer paths.",
            "Retrieve missing historical graph evidence.",
            "Obtain transaction details before drawing conclusions."
        ]
    });

    // Let Groq choose and execute approved read-only graph tools.
    let report = run_groq_agent(&state, &cycles, &memories, &comparison, address).await?;

    let mut participant_set: HashSet<String> = HashSet::new();
    for cycle in &cycles {
        if let Some(path) = cycle.get("path_wallets").and_then(Value::as_array) {
            for wallet in path.iter().filter_map(Value::as_str) {
                participant_set.insert(wallet.to_string());
            }
        }
    }
    let cycle_participant_count = participant_set.len();

    let finding = if cycle_participant_count > 0 {
        "Circular-transfer pattern detected"
    } else {
        "No circular-transfer pattern detected"
    };

    let graph_evidence_json = serde_json::to_string(&cycles).map_err(api_error)?;

    let mut participant_addresses: Vec<String> = participant_set.into_iter().collect();
    participant_addresses.sort();

    let save_query = r#"
    CREATE (i:Investigation {
        id: randomUUID(),
        finding: $finding,
        report: $report,
        graph_evidence_json: $graph_evidence_json,
        created_at: timestamp(),
        status: 'needs_review'
    })
    WITH i, $wallets AS addresses
    UNWIND CASE
        WHEN size(addresses) = 0 THEN [null]
        ELSE addresses
    END AS address
    OPTIONAL MATCH (w:Wallet {address: address})
    WITH i, collect(w) AS matched_wallets
    FOREACH (
        w IN matched_wallets |
        MERGE (i)-[:INVOLVES]->(w)
    )
    RETURN i.id AS id, i.created_at AS created_at
"#;

    let mut save_result = graph
        .query(save_query)
        .with_param("finding", finding.to_string())
        .with_param("report", report.clone())
        .with_param("graph_evidence_json", graph_evidence_json)
        .with_param("wallets", participant_addresses)
        .execute()
        .await
        .map_err(api_error)?;

    let saved_row = save_result
        .data
        .try_next()
        .await
        .map_err(api_error)?
        .ok_or_else(|| api_error("Investigation was not returned after saving"))?;

    let investigation_id: String = saved_row.try_get("id").map_err(api_error)?;

    let created_at: i64 = saved_row.try_get("created_at").map_err(api_error)?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "cycle_participant_count": cycle_participant_count,
        "wallets_flagged": cycle_participant_count,
        "graph_evidence": cycles,
        "investigation_diff": comparison,
        "structured_report": structured_report,
        "ai_risk_report": report,
        "investigation": {
            "id": investigation_id,
            "finding": finding,
            "created_at": created_at,
            "status": "needs_review"
        }
    })))
}

// Detects directed transfer paths that return to their starting wallet.
pub async fn detect_wash_trading(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, axum::Json<serde_json::Value>)> {
    let mut graph = state.falkor_client.select_graph("defi_risk");

    let query = r#"
        MATCH path = (start:Wallet)-[:TRANSFERRED_TO*3..6]->(start)
        RETURN start.address AS wallet,
               length(path) AS hop_count
        LIMIT 100
    "#;

    let mut result = graph.ro_query(query).execute().await.map_err(api_error)?;

    let mut cycles = Vec::new();

    while let Some(row) = result.data.try_next().await.map_err(api_error)? {
        let wallet: String = row.try_get("wallet").map_err(api_error)?;

        let hop_count: i64 = row.try_get("hop_count").map_err(api_error)?;

        cycles.push(serde_json::json!({
            "wallet": wallet,
            "hop_count": hop_count
        }));
    }

    let count = cycles.len();

    Ok(Json(serde_json::json!({
        "status": "success",
        "detected_cycles": count,
        "cycles": cycles,
        "message": "Circular transfer patterns found; these are risk signals, not proof of wash trading."
    })))
}

// Seeds a disposable demonstration graph.
// It does not delete existing nodes.
pub async fn seed_demo(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, axum::Json<serde_json::Value>)> {
    let mut graph = state.falkor_client.select_graph("defi_risk");

    let query = r#"
    MERGE (w1:Wallet {address: 'demo_wallet_1'})
    SET w1.risk_score = 0.15

    MERGE (w2:Wallet {address: 'demo_wallet_2'})
    SET w2.risk_score = 0.20

    MERGE (w3:Wallet {address: 'demo_wallet_3'})
    SET w3.risk_score = 0.10

    MERGE (p:LiquidityPool {address: 'DemoPool'})
    SET p.pair = 'SOL/USDC'

    MERGE (w1)-[t1:TRANSFERRED_TO {demo_id: 'demo_transfer_1'}]->(w2)
    SET t1.amount = 250.0,
        t1.token = 'USDC'

    MERGE (w2)-[t2:TRANSFERRED_TO {demo_id: 'demo_transfer_2'}]->(w3)
    SET t2.amount = 248.5,
        t2.token = 'USDC'

    MERGE (w3)-[t3:TRANSFERRED_TO {demo_id: 'demo_transfer_3'}]->(w1)
    SET t3.amount = 247.0,
        t3.token = 'USDC'

    MERGE (w1)-[s:SWAPPED {demo_id: 'demo_swap_1'}]->(p)
    SET s.amount = 1000.0
"#;

    graph.query(query).execute().await.map_err(api_error)?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "Demo wallet cycle created",
        "graph": "defi_risk"
    })))
}
