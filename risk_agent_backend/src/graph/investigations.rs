use crate::graph::provenance::{DataSource, PROP_DATA_SOURCE};
use falkordb::FalkorAsyncClient;
use futures::TryStreamExt;
use serde_json::{Value, json};
use std::collections::HashSet;

/// Deterministic action rule outcome.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InvestigationAction {
    FlagForReview,
    NoAction,
}

impl InvestigationAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            InvestigationAction::FlagForReview => "flag_for_review",
            InvestigationAction::NoAction => "no_action",
        }
    }
}

/// Deterministic evidence threshold: any detected circular-transfer path in
/// the requested data source triggers a flag-for-review action.
///
/// This is pure Rust logic — the LLM never decides whether to act.
pub fn evaluate_action_rule(cycles: &[Value]) -> InvestigationAction {
    if cycles.is_empty() {
        InvestigationAction::NoAction
    } else {
        InvestigationAction::FlagForReview
    }
}

/// Human-readable summary of the detected graph evidence.
pub fn evidence_summary(cycles: &[Value]) -> String {
    if cycles.is_empty() {
        return "No circular transfer paths detected.".to_string();
    }

    let cycle_count = cycles.len();
    let mut wallets = HashSet::new();
    for cycle in cycles {
        if let Some(path) = cycle.get("path_wallets").and_then(Value::as_array) {
            for wallet in path.iter().filter_map(Value::as_str) {
                wallets.insert(wallet.to_string());
            }
        }
    }

    format!(
        "{} circular transfer path(s) detected involving {} unique wallet(s).",
        cycle_count,
        wallets.len()
    )
}

/// Look up the most recent investigation involving `address` for `data_source`.
///
/// Used for deduplication: repeated report requests for the same wallet and
/// data source reuse the existing case instead of creating a new one.
pub async fn find_existing_investigation(
    client: &FalkorAsyncClient,
    address: &str,
    data_source: DataSource,
) -> Result<Option<Value>, String> {
    let mut graph = client.select_graph("defi_risk");
    let source = data_source.as_investigation_value();

    let query = format!(
        r#"MATCH (i:Investigation)-[:INVOLVES]->(w:Wallet)
        WHERE w.address = $address AND i.{prop} = $data_source
        RETURN DISTINCT
            i.id AS id,
            i.finding AS finding,
            i.report AS report,
            i.graph_evidence_json AS graph_evidence_json,
            i.created_at AS created_at,
            i.status AS status,
            i.action_taken AS action_taken,
            i.action_reason AS action_reason
        ORDER BY i.created_at DESC
        LIMIT 10"#,
        prop = PROP_DATA_SOURCE
    );

    let mut result = graph
        .ro_query(&query)
        .with_param("address", address.to_string())
        .with_param("data_source", source.to_string())
        .execute()
        .await
        .map_err(|e| e.to_string())?;

    while let Some(row) = result.data.try_next().await.map_err(|e| e.to_string())? {
        let id: String = row.try_get("id").map_err(|e| e.to_string())?;
        let finding: String = row.try_get("finding").map_err(|e| e.to_string())?;
        let report: Option<String> = row.try_get("report").map_err(|e| e.to_string())?;
        let graph_evidence_json: Option<String> = row
            .try_get("graph_evidence_json")
            .map_err(|e| e.to_string())?;
        let created_at: i64 = row.try_get("created_at").map_err(|e| e.to_string())?;
        let status: String = row.try_get("status").map_err(|e| e.to_string())?;
        let action_taken: Option<String> = row.try_get("action_taken").map_err(|e| e.to_string())?;
        let action_reason: Option<String> = row.try_get("action_reason").map_err(|e| e.to_string())?;

        return Ok(Some(json!({
            "id": id,
            "finding": finding,
            "report": report,
            "graph_evidence_json": graph_evidence_json,
            "created_at": created_at,
            "status": status,
            "action_taken": action_taken,
            "action_reason": action_reason,
        })));
    }

    Ok(None)
}

/// Create a new investigation or update an existing one for `address`.
///
/// When an existing case is found for the same address + data source, it is
/// updated in place (preserving `created_at`) rather than duplicating it.
/// Participant wallets are (re)linked via idempotent MERGE.
pub async fn create_or_update_investigation_case(
    client: &FalkorAsyncClient,
    address: &str,
    data_source: DataSource,
    action: &InvestigationAction,
    cycles: &[Value],
    ai_report: &str,
) -> Result<Value, String> {
    let action_str = action.as_str();
    let (finding, reason) = match action {
        InvestigationAction::FlagForReview => (
            "Circular transfer pattern detected",
            format!(
                "Circular transfer pattern detected in graph evidence; flagged for human review. {}",
                evidence_summary(cycles)
            ),
        ),
        InvestigationAction::NoAction => (
            "No circular transfer pattern detected",
            "No qualifying circular transfer pattern found; no action taken.".to_string(),
        ),
    };

    let graph_evidence_json = serde_json::to_string(cycles).map_err(|e| e.to_string())?;

    let mut participant_set: HashSet<String> = HashSet::new();
    for cycle in cycles {
        if let Some(path) = cycle.get("path_wallets").and_then(Value::as_array) {
            for wallet in path.iter().filter_map(Value::as_str) {
                participant_set.insert(wallet.to_string());
            }
        }
    }
    let participant_addresses: Vec<String> = participant_set.into_iter().collect();

    let mut graph = client.select_graph("defi_risk");
    let source = data_source.as_investigation_value();

    // Try to find an existing case for this address + data source.
    let existing = find_existing_investigation(client, address, data_source).await?;

    let (case_id, created_at) = if let Some(existing) = existing {
        let existing_id = existing
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let existing_created_at: i64 = existing
            .get("created_at")
            .and_then(Value::as_i64)
            .unwrap_or(0);

        // Update in place: preserve created_at, add updated_at.
        let update_query = format!(
            r#"MATCH (i:Investigation {{id: $id}})
            SET i.finding = $finding,
                i.report = $report,
                i.graph_evidence_json = $graph_evidence_json,
                i.status = $status,
                i.action_taken = $action_taken,
                i.action_reason = $action_reason,
                i.updated_at = timestamp()
            RETURN i.id AS id, i.created_at AS created_at"#
        );

        let mut result = graph
            .query(&update_query)
            .with_param("id", &existing_id)
            .with_param("finding", finding.to_string())
            .with_param("report", ai_report.to_string())
            .with_param("graph_evidence_json", graph_evidence_json.clone())
            .with_param("status", "needs_review")
            .with_param("action_taken", action_str.to_string())
            .with_param("action_reason", reason.clone())
            .execute()
            .await
            .map_err(|e| e.to_string())?;

        let row = result
            .data
            .try_next()
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Updated investigation was not returned".to_string())?;

        let id: String = row.try_get("id").map_err(|e| e.to_string())?;
        let _created_at: i64 = row.try_get("created_at").map_err(|e| e.to_string())?;

        // Re-link participant wallets (idempotent MERGE, no duplicates).
        let link_query = format!(
            r#"MATCH (i:Investigation {{id: $id}})
            WITH i, $wallets AS addresses
            UNWIND CASE WHEN size(addresses) = 0 THEN [null] ELSE addresses END AS address
            OPTIONAL MATCH (w:Wallet {{address: address}})
            WITH i, collect(w) AS matched_wallets
            FOREACH (w IN matched_wallets | MERGE (i)-[:INVOLVES]->(w))"#
        );

        let _ = graph
            .query(&link_query)
            .with_param("id", &existing_id)
            .with_param("wallets", participant_addresses)
            .execute()
            .await
            .map_err(|e| e.to_string())?;

        (id, existing_created_at)
    } else {
        // Create a new investigation case.
        let create_query = format!(
            r#"CREATE (i:Investigation {{
                id: randomUUID(),
                finding: $finding,
                report: $report,
                graph_evidence_json: $graph_evidence_json,
                created_at: timestamp(),
                status: $status,
                action_taken: $action_taken,
                action_reason: $action_reason,
                {prop}: $data_source
            }})
            WITH i, $wallets AS addresses
            UNWIND CASE WHEN size(addresses) = 0 THEN [null] ELSE addresses END AS address
            OPTIONAL MATCH (w:Wallet {{address: address}})
            WITH i, collect(w) AS matched_wallets
            FOREACH (w IN matched_wallets | MERGE (i)-[:INVOLVES]->(w))
            RETURN i.id AS id, i.created_at AS created_at"#,
            prop = PROP_DATA_SOURCE
        );

        let mut result = graph
            .query(&create_query)
            .with_param("finding", finding.to_string())
            .with_param("report", ai_report.to_string())
            .with_param("graph_evidence_json", graph_evidence_json)
            .with_param("status", "needs_review")
            .with_param("action_taken", action_str.to_string())
            .with_param("action_reason", reason.clone())
            .with_param("wallets", participant_addresses)
            .with_param("data_source", source.to_string())
            .execute()
            .await
            .map_err(|e| e.to_string())?;

        let row = result
            .data
            .try_next()
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Created investigation was not returned".to_string())?;

        let id: String = row.try_get("id").map_err(|e| e.to_string())?;
        let created_at: i64 = row.try_get("created_at").map_err(|e| e.to_string())?;

        (id, created_at)
    };

    Ok(json!({
        "case_id": case_id,
        "created_at": created_at,
        "action_taken": action_str,
        "action_reason": reason,
        "finding": finding,
        "status": "needs_review",
        "data_source": data_source.as_investigation_value(),
    }))
}

pub async fn find_related_cases(
    client: &FalkorAsyncClient,
    address: &str,
    data_source: DataSource,
) -> Result<Vec<Value>, String> {
    let mut graph = client.select_graph("defi_risk");

    let data_source_value = data_source.as_investigation_value();

    let query = format!(
        r#"MATCH (i:Investigation)-[:INVOLVES]->(w:Wallet)
        WHERE w.address = $address AND i.{data_source_prop} = $data_source
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
        LIMIT 20"#,
        data_source_prop = PROP_DATA_SOURCE
    );

    let mut result = graph
        .ro_query(&query)
        .with_param("address", address.to_string())
        .with_param("data_source", data_source_value.to_string())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evaluate_action_rule_flags_when_cycles_exist() {
        let cycles = vec![json!({
            "path_wallets": ["A", "B", "C", "A"],
            "hop_count": 3
        })];
        assert_eq!(
            evaluate_action_rule(&cycles),
            InvestigationAction::FlagForReview
        );
    }

    #[test]
    fn evaluate_action_rule_no_action_when_no_cycles() {
        let cycles: Vec<Value> = vec![];
        assert_eq!(
            evaluate_action_rule(&cycles),
            InvestigationAction::NoAction
        );
    }

    #[test]
    fn action_as_str_values() {
        assert_eq!(
            InvestigationAction::FlagForReview.as_str(),
            "flag_for_review"
        );
        assert_eq!(InvestigationAction::NoAction.as_str(), "no_action");
    }

    #[test]
    fn evidence_summary_empty() {
        let cycles: Vec<Value> = vec![];
        assert_eq!(
            evidence_summary(&cycles),
            "No circular transfer paths detected."
        );
    }

    #[test]
    fn evidence_summary_with_cycles() {
        let cycles = vec![
            json!({
                "path_wallets": ["A", "B", "C", "A"],
                "hop_count": 3
            }),
            json!({
                "path_wallets": ["D", "E", "D"],
                "hop_count": 2
            }),
        ];
        let summary = evidence_summary(&cycles);
        assert!(summary.contains("2 circular transfer path(s)"));
        assert!(summary.contains("5 unique wallet(s)"));
    }

    #[test]
    fn real_and_synthetic_data_sources_remain_distinct() {
        assert_eq!(
            DataSource::from_request("real"),
            DataSource::Real
        );
        assert_eq!(
            DataSource::from_request("demo"),
            DataSource::Synthetic
        );
        assert_ne!(
            DataSource::Real.as_investigation_value(),
            DataSource::Synthetic.as_investigation_value()
        );
    }

    #[test]
    fn real_edge_filter_excludes_demo() {
        assert_eq!(
            DataSource::Real.edge_filter(),
            "r.source = 'real' AND r.demo_id IS NULL"
        );
    }

    #[test]
    fn synthetic_edge_filter_excludes_real() {
        assert_eq!(
            DataSource::Synthetic.edge_filter(),
            "r.source = 'demo' OR r.demo_id IS NOT NULL"
        );
    }
}
