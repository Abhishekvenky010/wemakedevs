use axum::{Json, extract::State};
use futures::TryStreamExt;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;
use std::sync::Arc;

use crate::agent::orchestrator::run_groq_agent;
use crate::error::api_error;
use crate::graph::comparison::compare_paths;
use crate::graph::investigations::{
    create_or_update_investigation_case, evaluate_action_rule, evidence_summary,
    InvestigationAction,
};
use crate::graph::provenance::{DataSource, PROP_DATA_SOURCE};
use crate::state::AppState;
use serde::Serialize;

#[derive(Deserialize)]
pub struct GenerateRiskReportRequest {
    pub address: String,
    #[serde(default)]
    pub data_source: String,
    #[serde(default)]
    pub ingestion: Option<IngestionCoverage>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct IngestionCoverage {
    pub max_depth: usize,
    pub max_depth_reached: usize,
    pub wallets_visited: usize,
    pub signatures_fetched: usize,
    pub transactions_fetched: usize,
    pub transactions_processed: usize,
    pub transfers_persisted: usize,
    pub duplicates_skipped: usize,
    pub failed_transactions: usize,
    pub persistence_errors: usize,
    pub rate_limited: bool,
    pub incomplete: bool,
}

fn ingestion_coverage_details(ingestion: &IngestionCoverage) -> (bool, Vec<String>) {
    let mut limitations = Vec::new();
    let incomplete = ingestion.incomplete
        || ingestion.rate_limited
        || ingestion.failed_transactions > 0
        || ingestion.persistence_errors > 0;

    if ingestion.incomplete {
        limitations.push(
            "Transaction ingestion was incomplete; findings cover only evidence successfully fetched and persisted."
                .to_string(),
        );
    }
    if ingestion.rate_limited {
        limitations.push(
            "Solana RPC rate limiting prevented retrieval of some transaction evidence."
                .to_string(),
        );
    }
    if ingestion.failed_transactions > 0 {
        limitations.push(format!(
            "{} transaction(s) failed to fetch or process.",
            ingestion.failed_transactions
        ));
    }
    if ingestion.persistence_errors > 0 {
        limitations.push(format!(
            "{} transfer(s) could not be persisted to FalkorDB.",
            ingestion.persistence_errors
        ));
    }
    if ingestion.signatures_fetched == 0 {
        limitations.push(
            "No transaction signatures were returned by the RPC for this investigation."
                .to_string(),
        );
    }

    (incomplete, limitations)
}

/// Generate an AI-powered risk report based on graph data for a specific wallet address.
pub async fn generate_risk_report(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<GenerateRiskReportRequest>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, axum::Json<serde_json::Value>)> {
    let address = payload.address.trim();
    let data_source = DataSource::from_request(&payload.data_source);

    if address.is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "status": "error",
                "error": "Wallet address cannot be empty"
            })),
        ));
    }

    // Demo/synthetic data sources use seeded wallet labels (e.g.
    // `demo_wallet_1`) that are not real Solana base58 keys, so skip the
    // strict public-key validation for those requests.
    if data_source == DataSource::Real && !crate::ingestion::is_valid_wallet_address(address) {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "status": "error",
                "error": "Invalid Solana wallet address. Provide a base58 public key that decodes to 32 bytes."
            })),
        ));
    }

    // Fetch circular-transfer evidence from FalkorDB with Cypher-level source
    // filtering. The WHERE ALL(r IN relationships(path) WHERE ...) clause
    // ensures that only edges matching the requested provenance are traversed.
    let mut graph = state.falkor_client.select_graph("defi_risk");

    let edge_filter = data_source.edge_filter();

    let cycle_query = format!(
        r#"MATCH path =
            (start:Wallet {{address: $address}})
            -[:TRANSFERRED_TO*3..6]->(start)
        WHERE ALL(r IN relationships(path) WHERE {edge_filter})
        RETURN DISTINCT
            coalesce(start.address, 'unknown_wallet') AS wallet,
            length(path) AS hop_count,
            [node IN nodes(path) | node.address] AS path_wallets
        LIMIT 10"#,
        edge_filter = edge_filter
    );

    let mut result = graph
        .ro_query(&cycle_query)
        .with_param("address", address.to_string())
        .execute()
        .await
        .map_err(api_error)?;

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

    // Retrieve previous investigations linked to wallets participating in the
    // (source-scoped) cycles. Filter by investigation data_source so synthetic
    // investigations never support a real report and vice versa.
    let cycle_wallets: Vec<String> = cycles
        .iter()
        .flat_map(|c| {
            c.get("path_wallets")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|v| v.as_str().map(String::from))
        })
        .collect();

    let memory_query = format!(
        r#"MATCH (i:Investigation)-[:INVOLVES]->(w:Wallet)
        WHERE w.address IN $wallet_addresses AND i.{data_source_prop} = $data_source
        RETURN DISTINCT
            coalesce(i.id, 'unknown') AS id,
            coalesce(i.finding, 'Unknown finding') AS finding,
            i.confidence AS confidence,
            coalesce(i.created_at, 0) AS created_at,
            coalesce(i.status, 'needs_review') AS status,
            w.address AS matched_wallet,
            i.graph_evidence_json AS graph_evidence_json
        ORDER BY created_at DESC
        LIMIT 20"#,
        data_source_prop = PROP_DATA_SOURCE
    );

    let mut memory_result = graph
        .ro_query(&memory_query)
        .with_param("wallet_addresses", cycle_wallets)
        .with_param(
            "data_source",
            data_source.as_investigation_value().to_string(),
        )
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

    let mut comparison = compare_paths(&cycles, &memories);
    let mut coverage_limitations = Vec::<String>::new();
    let mut coverage_incomplete = false;
    if let Some(ingestion) = &payload.ingestion {
        (coverage_incomplete, coverage_limitations) = ingestion_coverage_details(ingestion);

        if let Some(limitations) = comparison
            .get_mut("limitations")
            .and_then(Value::as_array_mut)
        {
            limitations.extend(coverage_limitations.iter().cloned().map(Value::String));
        }
    }

    let novelty_status = comparison
        .get("novelty_status")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("uncertain_incomplete_history");

    let structured_report = serde_json::json!({
        "summary": if cycles.is_empty() {
            if coverage_incomplete {
                "No circular-transfer paths were detected in the available graph evidence, but transaction coverage was incomplete."
            } else {
                "No circular-transfer paths were detected in the available graph evidence."
            }
        } else {
            if coverage_incomplete {
                "Circular-transfer paths were detected in incomplete evidence; this is a risk signal, not proof of wrongdoing."
            } else {
                "Circular-transfer paths were detected; this is a risk signal, not proof of wrongdoing."
            }
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
    let mut report = run_groq_agent(
        &state,
        &cycles,
        &memories,
        &comparison,
        address,
        data_source,
    )
    .await?;
    if cycles.is_empty() {
        report.push_str(
            "\n\nNo cycle was found in the available graph evidence; this does not establish that the wallet is safe.",
        );
    }
    if coverage_incomplete {
        report.push_str(
            "\n\n### Coverage limitation\nTransaction ingestion was incomplete. This report reflects only evidence successfully retrieved and persisted; absence of a detected pattern does not establish that the wallet is safe.",
        );
    }

    // Deterministic action rule: any detected circular-transfer path in the
    // requested data source triggers a flag-for-review action. The LLM never
    // decides whether to act — this is pure Rust logic on actual graph evidence.
    let action = evaluate_action_rule(&cycles);
    let evidence_summary_text = evidence_summary(&cycles);

    // Persist or update an investigation case when the action rule is satisfied.
    // When no qualifying pattern exists, no case is created or updated.
    let case_result: Option<Value> = if action == InvestigationAction::FlagForReview {
        match create_or_update_investigation_case(
            &state.falkor_client,
            address,
            data_source,
            &action,
            &cycles,
            &report,
        )
        .await
        {
            Ok(result) => Some(result),
            Err(e) => {
                eprintln!("Failed to persist investigation case: {e}");
                None
            }
        }
    } else {
        None
    };

    let mut participant_set: HashSet<String> = HashSet::new();
    for cycle in &cycles {
        if let Some(path) = cycle.get("path_wallets").and_then(Value::as_array) {
            for wallet in path.iter().filter_map(Value::as_str) {
                participant_set.insert(wallet.to_string());
            }
        }
    }
    let cycle_participant_count = participant_set.len();

    let finding = match &action {
        InvestigationAction::FlagForReview => {
            if coverage_incomplete {
                "Circular transfer pattern detected in incomplete evidence"
            } else {
                "Circular transfer pattern detected"
            }
        }
        InvestigationAction::NoAction => {
            if coverage_incomplete {
                "No cycle detected in incomplete available evidence"
            } else {
                "No circular-transfer pattern detected"
            }
        }
    };

    let action_reason = match &action {
        InvestigationAction::FlagForReview => {
            format!("Circular transfer pattern detected in graph evidence; flagged for human review. {evidence_summary_text}")
        }
        InvestigationAction::NoAction => {
            "No qualifying circular transfer pattern found; no action taken.".to_string()
        }
    };

    let case_id = case_result
        .as_ref()
        .and_then(|r| r.get("case_id").and_then(Value::as_str))
        .map(String::from);

    Ok(Json(serde_json::json!({
        "status": "success",
        "address": address,
        "data_source": data_source.as_investigation_value(),
        "finding": finding,
        "graph_evidence": cycles,
        "evidence_summary": evidence_summary_text,
        "action_taken": action.as_str(),
        "action_reason": action_reason,
        "case_id": case_id,
        "case": case_result,
        "cycle_participant_count": cycle_participant_count,
        "wallets_flagged": cycle_participant_count,
        "investigation_diff": comparison,
        "structured_report": structured_report,
        "ai_risk_report": report,
        "coverage": payload.ingestion.as_ref().map(|ingestion| serde_json::json!({
            "incomplete": coverage_incomplete,
            "requested_depth": ingestion.max_depth,
            "depth_reached": ingestion.max_depth_reached,
            "limitations": coverage_limitations,
        })),
        "investigation": {
            "id": case_id.unwrap_or_default(),
            "finding": finding,
            "created_at": case_result
                .as_ref()
                .and_then(|r| r.get("created_at").and_then(Value::as_i64))
                .unwrap_or(0),
            "status": if action == InvestigationAction::FlagForReview {
                "needs_review"
            } else {
                "no_action"
            }
        }
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn complete_coverage() -> IngestionCoverage {
        IngestionCoverage {
            max_depth: 2,
            max_depth_reached: 2,
            wallets_visited: 3,
            signatures_fetched: 10,
            transactions_fetched: 10,
            transactions_processed: 10,
            transfers_persisted: 4,
            duplicates_skipped: 0,
            failed_transactions: 0,
            persistence_errors: 0,
            rate_limited: false,
            incomplete: false,
        }
    }

    #[test]
    fn rate_limiting_marks_report_coverage_incomplete() {
        let mut coverage = complete_coverage();
        coverage.rate_limited = true;
        let (incomplete, limitations) = ingestion_coverage_details(&coverage);

        assert!(incomplete);
        assert!(
            limitations
                .iter()
                .any(|limitation| limitation.contains("rate limiting"))
        );
    }

    #[test]
    fn failed_partial_ingestion_is_disclosed_in_report_coverage() {
        let mut coverage = complete_coverage();
        coverage.incomplete = true;
        coverage.failed_transactions = 2;
        coverage.persistence_errors = 1;
        let (incomplete, limitations) = ingestion_coverage_details(&coverage);

        assert!(incomplete);
        assert_eq!(limitations.len(), 3);
        assert!(
            limitations
                .iter()
                .any(|limitation| limitation.contains("incomplete"))
        );
        assert!(
            limitations
                .iter()
                .any(|limitation| limitation.contains("2 transaction"))
        );
        assert!(
            limitations
                .iter()
                .any(|limitation| limitation.contains("FalkorDB"))
        );
    }

    #[test]
    fn empty_history_is_a_coverage_limitation() {
        let mut coverage = complete_coverage();
        coverage.signatures_fetched = 0;
        let (incomplete, limitations) = ingestion_coverage_details(&coverage);

        assert!(!incomplete);
        assert!(
            limitations
                .iter()
                .any(|limitation| limitation.contains("No transaction signatures"))
        );
    }
}

// Detects directed transfer paths that return to their starting wallet.
pub async fn detect_wash_trading(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, axum::Json<serde_json::Value>)> {
    let data_source = DataSource::from_request(
        payload
            .get("data_source")
            .and_then(Value::as_str)
            .unwrap_or("live"),
    );
    let edge_filter = data_source.edge_filter();

    let mut graph = state.falkor_client.select_graph("defi_risk");

    let query = format!(
        r#"MATCH path = (start:Wallet)-[:TRANSFERRED_TO*3..6]->(start)
        WHERE ALL(r IN relationships(path) WHERE {edge_filter})
        RETURN start.address AS wallet,
               length(path) AS hop_count
        LIMIT 100"#,
        edge_filter = edge_filter
    );

    let mut result = graph.ro_query(&query).execute().await.map_err(api_error)?;

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
    SET t1.source = 'demo',
        t1.amount = 250.0,
        t1.token = 'USDC'

    MERGE (w2)-[t2:TRANSFERRED_TO {demo_id: 'demo_transfer_2'}]->(w3)
    SET t2.source = 'demo',
        t2.amount = 248.5,
        t2.token = 'USDC'

    MERGE (w3)-[t3:TRANSFERRED_TO {demo_id: 'demo_transfer_3'}]->(w1)
    SET t3.source = 'demo',
        t3.amount = 247.0,
        t3.token = 'USDC'

    MERGE (w1)-[s:SWAPPED {demo_id: 'demo_swap_1'}]->(p)
    SET s.source = 'demo',
        s.amount = 1000.0
"#;

    graph.query(query).execute().await.map_err(api_error)?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "Demo wallet cycle created",
        "graph": "defi_risk"
    })))
}
