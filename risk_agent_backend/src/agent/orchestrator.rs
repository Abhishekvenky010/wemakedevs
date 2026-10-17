use axum::{Json, http::StatusCode};
use serde_json::{Value, json};
use std::collections::HashSet;

use crate::{
    agent::{groq::chat_completion, tools},
    error::api_error,
    state::AppState,
};

const MAX_TOOL_ROUNDS: usize = 1;

pub async fn run_groq_agent(
    state: &AppState,
    cycles: &[Value],
    memories: &[Value],
    comparison: &Value,
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
        "Investigate this DeFi activity using the supplied evidence. \
         When wallet addresses are available, use trace_wallet to check \
         current graph paths and find_related_cases to inspect historical \
         investigations. Avoid repeating the same lookup. Use no more than \
         the available tool-call rounds. Treat graph data as evidence, not \
         proof of wrongdoing. Never invent amounts, timestamps, ownership, \
         or transactions. Distinguish observations, hypotheses, and \
         limitations. Missing historical paths mean a match cannot be verified.\n\
         CURRENT PATHS: {}\n\
         HISTORICAL CASES: {}\n\
         GRAPH COMPARISON: {}",
        serde_json::to_string(&compact_cycles).map_err(api_error)?,
        serde_json::to_string(&compact_memories).map_err(api_error)?,
        serde_json::to_string(comparison).map_err(api_error)?
    );

    let mut messages = vec![
        json!({
            "role": "system",
            "content": "You are a concise DeFi security investigation agent. \
        Use the approved read-only graph tools when relevant. \
        Circular transfers alone do not prove wash trading. \
        Base conclusions only on supplied evidence and successful tool results. \
        If a tool result contains status=\"error\", treat that tool call as failed. \
        Never present failed tool output as evidence or infer missing facts from it. \
        Clearly state when required evidence could not be retrieved, and qualify \
        conclusions accordingly. Distinguish observed facts from hypotheses."
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

    // Allow at most three rounds with tools, followed by a final
    // request without tools to keep the investigation bounded.
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
            let _ = mcp_client.close().await;
            return message
                .get("content")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .filter(|content| !content.trim().is_empty())
                .ok_or_else(|| api_error("Groq returned no final report text"));
        }

        // The final round has no tools available. Never execute
        // unexpected tool calls if the provider returns them anyway.
        if round == MAX_TOOL_ROUNDS {
            let _ = mcp_client.close().await;
            return Err(api_error("Agent reached its tool-call limit"));
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

            let result = tools::execute_via_mcp(&mcp_client, name, arguments).await;

            let compact_result = compact_tool_result(&result);

            messages.push(json!({
                "role": "tool",
                "tool_call_id": id,
                "content": compact_result.to_string()
            }));
        }
    }

    let _ = mcp_client.close().await;

    Err(api_error("Agent finished without a final report"))
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
