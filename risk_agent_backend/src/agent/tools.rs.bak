// Tool schemas and utility functions for Groq agent tool calls.use serde_json::{json, Value};
use crate::state::AppState;
use serde_json::{Value, json};

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

    if object.len() != 1 {
        return Err("Expected exactly one argument: address".to_string());
    }

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

pub async fn execute(state: &AppState, name: &str, raw_arguments: &str) -> Value {
    if name != "trace_wallet" && name != "find_related_cases" {
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

    match name {
        "trace_wallet" => {
            match crate::graph::wallet::trace_wallet_data(&state.falkor_client, &address).await {
                Ok(cycles) => json!({
                    "status": "success",
                    "wallet": address,
                    "detected_cycles": cycles.len(),
                    "cycles": cycles
                }),
                Err(error) => {
                    eprintln!("trace_wallet tool failed: {error}");
                    json!({
                        "status": "error",
                        "error": "Wallet tracing failed."
                    })
                }
            }
        }

        "find_related_cases" => {
            match crate::graph::investigations::find_related_cases(&state.falkor_client, &address)
                .await
            {
                Ok(cases) => json!({
                    "status": "success",
                    "wallet": address,
                    "cases_found": cases.len(),
                    "cases": cases
                }),
                Err(error) => {
                    eprintln!("find_related_cases tool failed: {error}");
                    json!({
                        "status": "error",
                        "error": "Historical case lookup failed."
                    })
                }
            }
        }

        _ => unreachable!("Tool name was checked above"),
    }
}
