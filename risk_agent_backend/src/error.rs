use axum::{Json, http::StatusCode};
use serde_json::Value;

pub fn api_error<E: std::fmt::Display + std::fmt::Debug>(error: E) -> (StatusCode, Json<Value>) {
    eprintln!("Backend Error: {error:#?}");

    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({
            "status": "error",
            "error": error.to_string()
        })),
    )
}
