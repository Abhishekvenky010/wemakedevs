use axum::{Json, http::StatusCode};
use serde_json::{Value, json};

use crate::state::AppState;

pub async fn chat_completion(
    state: &AppState,
    messages: &[Value],
    tools: &Value,
) -> Result<Value, (StatusCode, Json<Value>)> {
    let request_body = json!({
        "model": "qwen/qwen3.8-27b",
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "temperature": 0.2
    });

    let response = state
        .http_client
        .post("https://api.groq.com/openai/v1/chat/completions")
        .bearer_auth(&state.groq_api_key)
        .json(&request_body)
        .send()
        .await
        .map_err(|error| {
            eprintln!("Groq request failed: {error}");
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({
                    "status": "error",
                    "error": "Could not reach the Groq API."
                })),
            )
        })?;

    let status = response.status();

    let body: Value = response.json().await.map_err(|error| {
        eprintln!("Could not parse Groq response: {error}");
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "status": "error",
                "error": "Groq returned an invalid response."
            })),
        )
    })?;

    if !status.is_success() {
        eprintln!("Groq API returned HTTP {status}: {body}");

        return Err((
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "status": "error",
                "error": "Groq could not generate the risk report."
            })),
        ));
    }

    Ok(body)
}
