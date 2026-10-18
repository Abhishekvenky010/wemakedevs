use axum::{Json, http::StatusCode};
use serde_json::{Value, json};
use std::collections::HashSet;

use crate::{
    agent::{groq::chat_completion, tools},
    error::api_error,
    graph::provenance::DataSource,
    state::AppState,
};

/// Maximum rounds where tools are available, followed by one final text-only round.
const MAX_TOOL_ROUNDS: usize = 3;

/// Strip raw tool-call markup from text so it is never presented as the final AI report.
/// Removes XML-style ``...`` blocks and
/// function-call style ``...`` blocks.
fn strip_tool_call_markup(text: &str) -> String {
    let mut out = text.to_string();

    let lt: char = char::from_u32(60).unwrap();
    let gt: char = char::from_u32(62).unwrap();

    // Build  and  patterns.
    let open_tc: String = lt.to_string() + "tool_call" + &gt.to_string();
    let close_tc: String = lt.to_string() + "/" + "tool_call" + &gt.to_string();

    // Remove  ...  blocks.
    let mut pos = 0;
    while let Some(start) = out[pos..].find(&open_tc) {
        let abs = pos + start;
        if let Some(end) = out[abs..].find(&close_tc) {
            let end_abs = abs + end + close_tc.len();
            out.replace_range(abs..end_abs, "");
            pos = abs;
        } else {
            out.replace_range(abs.., "");
            break;
        }
    }

    // Build  and  patterns.
    let open_fn: String = lt.to_string() + "function=";
    let close_fn: String = lt.to_string() + "/" + "function" + &gt.to_string();

    // Remove  ...  blocks.
    pos = 0;
    while let Some(start) = out[pos..].find(&open_fn) {
        let abs = pos + start;
        if let Some(end) = out[abs..].find(&close_fn) {
            let end_abs = abs + end + close_fn.len();
            out.replace_range(abs..end_abs, "");
            pos = abs;
        } else {
            out.replace_range(abs.., "");
            break;
        }
    }

    out
}

/// Build a grounded fallback report from the available graph evidence when the
/// agent loop cannot produce a final text report. Never fabricates findings.
fn build_fallback_report(
    cycles: &[Value],
    _memories: &[Value],
    comparison: &Value,
    address: &str,
) -> String {
    let mut lines: Vec<String> = Vec::new();

    lines.push(format!("## DeFi Risk Investigation Report\n"));
    lines.push(format!("**Address:** {}\n", address));

    if cycles.is_empty() {
        lines.push(
            "No circular-transfer paths were detected in the available graph evidence.\n"
                .to_string(),
        );
    } else {
        lines.push(format!("**Cycle roots flagged:** {}\n", cycles.len()));
        lines.push("**Finding:** Circular-transfer paths were detected; this is a risk signal, not proof of wrongdoing.\n".to_string());
        lines.push("### Detected Paths\n".to_string());
        for (i, cycle) in cycles.iter().enumerate().take(10) {
            let wallet = cycle
                .get("wallet")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let hop_count = cycle.get("hop_count").and_then(Value::as_i64).unwrap_or(0);
            let path = cycle
                .get("path_wallets")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str())
                        .collect::<Vec<_>>()
                        .join(" -> ")
                })
                .unwrap_or_default();
            lines.push(format!(
                "{}. {} ({} hops): {}",
                i + 1,
                wallet,
                hop_count,
                path
            ));
        }
        lines.push(String::new());
    }

    let current_unique = comparison
        .get("current_unique_cycles")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let historical_unique = comparison
        .get("historical_unique_cycles")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let recurring = comparison
        .get("recurring_cycles")
        .and_then(Value::as_array)
        .map(|a| a.len())
        .unwrap_or(0);
    let new_cycles = comparison
        .get("new_cycles")
        .and_then(Value::as_array)
        .map(|a| a.len())
        .unwrap_or(0);
    let novelty = comparison
        .get("novelty_status")
        .and_then(Value::as_str)
        .unwrap_or("unknown");

    lines.push("### Historical Comparison\n".to_string());
    lines.push(format!("- Current unique cycles: {}", current_unique));
    lines.push(format!("- Historical unique cycles: {}", historical_unique));
    lines.push(format!("- Recurring cycles: {}", recurring));
    lines.push(format!("- New cycles: {}", new_cycles));
    lines.push(format!("- Novelty status: {}\n", novelty));

    if let Some(limitations) = comparison.get("limitations").and_then(Value::as_array) {
        lines.push("### Limitations\n".to_string());
        for lim in limitations.iter().take(5) {
            if let Some(text) = lim.as_str() {
                lines.push(format!("- {}", text));
            }
        }
    }

    lines.push(
        "\n---\n*This is a prototype risk signal, not a calibrated fraud assessment.*".to_string(),
    );

    lines.join("\n")
}

pub async fn run_groq_agent(
    state: &AppState,
    cycles: &[Value],
    memories: &[Value],
    comparison: &Value,
    address: &str,
    data_source: DataSource,
) -> Result<String, (StatusCode, Json<Value>)> {
    let mut seen_cycles = HashSet::<Vec<String>>::new();

    let compact_cycles: Vec<Value> = cycles
        .iter()
        .filter_map(|cycle| {
            let wallets = cycle
                .get("path_wallets")?
                .as_array()?
                .iter()
                .map(|wallet| wallet.as_str().map(str::to_owned))
                .collect::<Option<Vec<_>>>()?;

            let canonical = crate::graph::comparison::canonical_cycle(&wallets)?;

            if !seen_cycles.insert(canonical.clone()) {
                return None;
            }

            let mut closed_path = canonical.clone();
            closed_path.push(canonical[0].clone());

            Some(json!({
                "path_wallets": closed_path,
                "hop_count": canonical.len()
            }))
        })
        .collect();

    let mut seen_cases = HashSet::<String>::new();

    let compact_memories: Vec<Value> = memories
        .iter()
        .filter_map(|memory| {
            let id = memory.get("id")?.as_str()?.to_owned();

            if !seen_cases.insert(id.clone()) {
                return None;
            }

            let compact_evidence: Vec<Value> = memory
                .get("graph_evidence")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .take(2)
                        .map(|item| {
                            json!({
                                "wallet": item.get("wallet"),
                                "hop_count": item.get("hop_count"),
                                "path_wallets": item.get("path_wallets")
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();

            Some(json!({
                "id": id,
                "finding": memory.get("finding"),
                "status": memory.get("status"),
                "matched_wallet": memory.get("matched_wallet"),
                "graph_evidence": compact_evidence
            }))
        })
        .take(5)
        .collect();

    let user_content = format!(
        "Investigate this DeFi activity for wallet {address} using the supplied evidence. \
         The investigation data source is '{data_source}'. Pass that exact source to graph tools. \
         When wallet addresses are available, use trace_wallet to check \
         current graph paths and find_related_cases to inspect historical \
         investigations. Avoid repeating the same lookup. Use no more than \
         the available tool-call rounds. Treat graph data as evidence, not \
         proof of wrongdoing. Never invent amounts, timestamps, ownership, \
         or transactions. Distinguish observations, hypotheses, and \
         limitations. Missing historical paths mean a match cannot be verified. \
         If coverage limitations are present, explicitly state them and do not present \
         the findings as complete or conclude that the wallet is safe.\n\
         CURRENT PATHS: {current_paths}\n\
         HISTORICAL CASES: {historical_cases}\n\
         GRAPH COMPARISON: {comparison}",
        address = address,
        data_source = data_source.as_investigation_value(),
        current_paths = serde_json::to_string(&compact_cycles).map_err(api_error)?,
        historical_cases = serde_json::to_string(&compact_memories).map_err(api_error)?,
        comparison = serde_json::to_string(comparison).map_err(api_error)?
    );

    let mut messages = vec![
        json!({
            "role": "system",
            "content": "You are a concise DeFi security investigation agent. \
        Use only the supplied tool results and structured evidence for factual claims. \
        Never invent case IDs, record counts, hop counts, timestamps, transaction details, \
        token amounts, ownership relationships, or any ownership relationships. \
        Distinguish current graph paths from historical investigation paths. \
        Treat graph data as evidence, not proof of wrongdoing. \
        Base conclusions only on supplied evidence and successful tool results. \
        If a tool result contains status=\"error\", treat that tool call as failed. \
        Never present failed tool output as evidence or infer missing facts from it. \
        Clearly state when required evidence could not be retrieved, and qualify \
        conclusions accordingly. Distinguish observed facts from hypotheses; \
        do not present hypotheses as observed facts."
        }),
        json!({
            "role": "user",
            "content": user_content
        }),
    ];

    let mut mcp_client = crate::agent::mcp_client::McpClient::connect()
        .await
        .map_err(|error| {
            eprintln!("MCP client initialization failed: {error}");
            api_error("Unable to initialize MCP tools")
        })?;

    // Allow at most MAX_TOOL_ROUNDS with tools, followed by one final text-only round.
    for round in 0..=MAX_TOOL_ROUNDS {
        let available_tools = if round < MAX_TOOL_ROUNDS {
            tools::definitions()
        } else {
            json!([])
        };

        eprintln!(
            "Agent round {round}: messages={} bytes, tools={} bytes",
            serde_json::to_string(&messages).unwrap_or_default().len(),
            serde_json::to_string(&available_tools)
                .unwrap_or_default()
                .len()
        );

        let body = chat_completion(state, &messages, &available_tools).await?;

        let message = body
            .pointer("/choices/0/message")
            .cloned()
            .ok_or_else(|| api_error("Groq response did not contain a message"))?;

        let tool_calls = message
            .get("tool_calls")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        if tool_calls.is_empty() {
            let content = message
                .get("content")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .unwrap_or_default();

            let sanitized = strip_tool_call_markup(&content);

            if !sanitized.trim().is_empty() {
                let _ = mcp_client.close().await;
                return Ok(sanitized);
            }

            // Content was empty or only tool-call markup. Fall through to fallback.
            let _ = mcp_client.close().await;
            return Ok(build_fallback_report(
                &compact_cycles,
                &compact_memories,
                comparison,
                address,
            ));
        }

        // The final round has no tools available. Never execute
        // unexpected tool calls if the provider returns them anyway.
        if round == MAX_TOOL_ROUNDS {
            let _ = mcp_client.close().await;
            return Ok(build_fallback_report(
                &compact_cycles,
                &compact_memories,
                comparison,
                address,
            ));
        }

        // Preserve Groq's assistant message, including tool-call IDs.
        messages.push(message);

        for call in tool_calls {
            let id = call
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| api_error("Tool call is missing its ID"))?
                .to_owned();

            let function = call
                .get("function")
                .ok_or_else(|| api_error("Tool call is missing its function"))?;

            let name = function
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| api_error("Tool call is missing its name"))?;

            let arguments = function
                .get("arguments")
                .and_then(Value::as_str)
                .ok_or_else(|| api_error("Tool call arguments are missing"))?;

            let result = tools::execute_via_mcp(&mcp_client, name, arguments, data_source).await;

            let compact_result = compact_tool_result(&result);

            messages.push(json!({
                "role": "tool",
                "tool_call_id": id,
                "content": compact_result.to_string()
            }));
        }
    }

    let _ = mcp_client.close().await;

    Ok(build_fallback_report(
        &compact_cycles,
        &compact_memories,
        comparison,
        address,
    ))
}

/// Shrink tool results before echoing them back into the message history so
/// the prompt stays within the model's input-token budget.
fn compact_tool_result(result: &Value) -> Value {
    let mut out = result.clone();

    if let Some(obj) = out.as_object_mut() {
        // trace_wallet returns a "cycles" array; find_related_cases returns "cases".
        for key in ["cycles", "cases"] {
            if let Some(arr) = obj.get(key).and_then(Value::as_array) {
                let trimmed: Vec<Value> = arr
                    .iter()
                    .take(3)
                    .map(|item| compact_case_item(item))
                    .collect();
                obj.insert(key.to_string(), Value::Array(trimmed));
            }
        }

        if let Some(report) = obj.get("report").and_then(Value::as_str) {
            if report.len() > 500 {
                obj.insert("report".to_string(), json!(&report[..500].to_string()));
            }
        }
    }

    out
}

/// Keep only the small fields needed for comparison within a single case/cycle.
fn compact_case_item(item: &Value) -> Value {
    let mut out = json!({});

    if let Some(obj) = out.as_object_mut() {
        if let Some(wallet) = item.get("wallet") {
            obj.insert("wallet".to_string(), wallet.clone());
        }
        if let Some(hop_count) = item.get("hop_count") {
            obj.insert("hop_count".to_string(), hop_count.clone());
        }
        if let Some(path) = item.get("path_wallets").and_then(Value::as_array) {
            let trimmed: Vec<Value> = path.iter().take(8).cloned().collect();
            obj.insert("path_wallets".to_string(), Value::Array(trimmed));
        }
        if let Some(evidence) = item.get("graph_evidence").and_then(Value::as_array) {
            let trimmed: Vec<Value> = evidence.iter().take(2).cloned().collect();
            obj.insert("graph_evidence".to_string(), Value::Array(trimmed));
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lt() -> char {
        char::from_u32(60).unwrap()
    }
    fn gt() -> char {
        char::from_u32(62).unwrap()
    }

    fn tc_open() -> String {
        lt().to_string() + "tool_call" + &gt().to_string()
    }
    fn tc_close() -> String {
        lt().to_string() + "/" + "tool_call" + &gt().to_string()
    }

    #[test]
    fn strip_tool_call_markup_removes_xml_blocks() {
        let open = tc_open();
        let close = tc_close();
        let input = format!("Preamble {}{}content {}{}suffix", open, close, open, close);
        let result = strip_tool_call_markup(&input);
        assert!(!result.contains("tool_call"));
        assert!(result.contains("Preamble"));
        assert!(result.contains("content"));
        assert!(result.contains("suffix"));
    }

    #[test]
    fn strip_tool_call_markup_leaves_plain_text() {
        let input = "This is a normal risk report with no markup.";
        let result = strip_tool_call_markup(input);
        assert_eq!(result, input);
    }

    #[test]
    fn strip_tool_call_markup_handles_multiple_blocks() {
        let open = tc_open();
        let close = tc_close();
        let input = format!("A {}{}B {}{}C", open, close, open, close);
        let result = strip_tool_call_markup(&input);
        assert_eq!(result, "A B C");
    }

    #[test]
    fn build_fallback_report_includes_address_and_cycles() {
        let cycles: Vec<Value> = vec![json!({
            "wallet": "demo_wallet_1",
            "hop_count": 3,
            "path_wallets": ["demo_wallet_1", "demo_wallet_2", "demo_wallet_3", "demo_wallet_1"]
        })];
        let memories: Vec<Value> = vec![];
        let comparison = json!({
            "current_unique_cycles": 1,
            "historical_unique_cycles": 1,
            "recurring_cycles": [["demo_wallet_1", "demo_wallet_2", "demo_wallet_3"]],
            "new_cycles": [],
            "novelty_status": "no_new_cycles_detected",
            "limitations": ["Only saved wallet paths are compared."]
        });

        let report = build_fallback_report(&cycles, &memories, &comparison, "demo_wallet_1");

        assert!(report.contains("demo_wallet_1"));
        assert_eq!(
            report.contains("No circular-transfer paths were detected"),
            false
        );
        assert!(report.contains("**Cycle roots flagged:** 1"));
        assert!(report.contains("risk signal, not proof of wrongdoing"));
        assert!(report.contains("Novelty status: no_new_cycles_detected"));
    }

    #[test]
    fn build_fallback_report_empty_cycles() {
        let cycles: Vec<Value> = vec![];
        let memories: Vec<Value> = vec![];
        let comparison = json!({
            "current_unique_cycles": 0,
            "historical_unique_cycles": 0,
            "recurring_cycles": [],
            "new_cycles": [],
            "novelty_status": "no_new_cycles_detected",
            "limitations": []
        });

        let report = build_fallback_report(&cycles, &memories, &comparison, "demo_wallet_1");

        assert!(report.contains("No circular-transfer paths were detected"));
        assert!(report.contains("demo_wallet_1"));
    }
}
