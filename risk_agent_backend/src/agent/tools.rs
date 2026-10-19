// Tool schemas and utility functions for Groq agent tool calls.
use crate::graph::provenance::DataSource;
use serde_json::{Value, json};

/// Tools the agent is allowed to select. Keep this list in sync with the
/// `#[tool]` methods exposed by the MCP server in `src/mcp.rs`.
const APPROVED_TOOLS: [&str; 3] = [
    "trace_wallet",
    "find_related_cases",
    "compare_investigations",
];

fn is_approved_tool(name: &str) -> bool {
    APPROVED_TOOLS.contains(&name)
}

pub fn definitions() -> Value {
    json!([
        {
            "type": "function",
            "function": {
                "name": "trace_wallet",
                "description": "Read circular-transfer paths involving one wallet address.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "address": {
                            "type": "string",
                            "description": "Wallet address to trace."
                        },
                        "data_source": {
                            "type": "string",
                            "description": "Data source: 'real' for verified mainnet transfers or 'demo' for synthetic evidence. Defaults to 'real'."
                        }
                    },
                    "required": ["address"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "find_related_cases",
                "description": "Read historical investigations linked to a wallet address.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "address": {
                            "type": "string",
                            "description": "Wallet address to look up."
                        },
                        "data_source": {
                            "type": "string",
                            "description": "Data source: 'real' for verified investigations or 'demo' for synthetic investigations. Defaults to 'real'."
                        }
                    },
                    "required": ["address"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "compare_investigations",
                "description": "Compare a wallet's current transfer cycles against historical investigation evidence. Returns recurring cycles, new cycles, and novelty status.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "address": {
                            "type": "string",
                            "description": "Wallet address to compare."
                        },
                        "data_source": {
                            "type": "string",
                            "description": "Data source: 'real' for verified evidence or 'demo' for synthetic evidence. Defaults to 'real'."
                        }
                    },
                    "required": ["address"],
                    "additionalProperties": false
                }
            }
        }
    ])
}

fn validate_address(arguments: &Value) -> Result<String, String> {
    let object = arguments
        .as_object()
        .ok_or_else(|| "Tool arguments must be a JSON object".to_string())?;

    let address = object
        .get("address")
        .and_then(Value::as_str)
        .ok_or_else(|| "The address argument must be a string".to_string())?
        .trim();

    if address.is_empty() {
        return Err("Address cannot be empty".to_string());
    }

    if address.len() > 256 || address.chars().any(char::is_control) {
        return Err("Address has an invalid length or contains control characters".to_string());
    }

    Ok(address.to_string())
}

pub async fn execute_via_mcp(
    client: &crate::agent::mcp_client::McpClient,
    name: &str,
    raw_arguments: &str,
    data_source: DataSource,
) -> Value {
    if !is_approved_tool(name) {
        return json!({
            "status": "error",
            "error": "Unknown tool. Only approved read-only tools are available."
        });
    }

    let arguments = match serde_json::from_str::<Value>(raw_arguments) {
        Ok(arguments) => arguments,
        Err(_) => {
            return json!({
                "status": "error",
                "error": "Tool arguments were not valid JSON."
            });
        }
    };

    let address = match validate_address(&arguments) {
        Ok(address) => address,
        Err(error) => {
            return json!({
                "status": "error",
                "error": error
            });
        }
    };

    match client
        .call_tool(
            name,
            json!({
                "address": address,
                "data_source": data_source.as_investigation_value()
            }),
        )
        .await
    {
        Ok(result) => result,
        Err(error) => {
            eprintln!("MCP tool call failed: {error}");
            json!({
                "status": "error",
                "error": "MCP tool execution failed."
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn validate_tool_input(name: &str, raw_arguments: &str) -> Value {
        if !is_approved_tool(name) {
            return json!({
                "status": "error",
                "error": "Unknown tool. Only approved read-only tools are available."
            });
        }

        let arguments = match serde_json::from_str::<Value>(raw_arguments) {
            Ok(arguments) => arguments,
            Err(_) => {
                return json!({
                    "status": "error",
                    "error": "Tool arguments were not valid JSON."
                });
            }
        };

        match validate_address(&arguments) {
            Ok(_) => json!({"status": "success"}),
            Err(error) => json!({"status": "error", "error": error}),
        }
    }

    #[test]
    fn rejects_unapproved_tool_without_calling_mcp() {
        let result = validate_tool_input("delete_wallet", r#"{"address":"demo_wallet_1"}"#);

        assert_eq!(result["status"], "error");
        assert_eq!(
            result["error"],
            "Unknown tool. Only approved read-only tools are available."
        );
    }

    #[test]
    fn rejects_invalid_json_without_calling_mcp() {
        let result = validate_tool_input("trace_wallet", "not-json");

        assert_eq!(result["status"], "error");
        assert_eq!(result["error"], "Tool arguments were not valid JSON.");
    }

    #[test]
    fn approves_compare_investigations_tool() {
        let result = validate_tool_input(
            "compare_investigations",
            r#"{"address":"demo_wallet_1","data_source":"demo"}"#,
        );

        assert_eq!(result["status"], "success");
    }
}
