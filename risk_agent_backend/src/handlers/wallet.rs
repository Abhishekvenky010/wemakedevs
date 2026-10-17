use axum::{Json, extract::State};
use std::sync::Arc;

use crate::error::api_error;
use crate::graph::wallet::trace_wallet_data;
use crate::state::AppState;

#[derive(serde::Deserialize)]
pub struct TraceWalletRequest {
    pub address: String,
}

pub async fn trace_wallet(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<TraceWalletRequest>,
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

    let cycles = trace_wallet_data(&state.falkor_client, address)
        .await
        .map_err(api_error)?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "wallet": address,
        "detected_cycles": cycles.len(),
        "cycles": cycles,
        "message": "Circular transfer patterns are risk signals, not proof of wrongdoing."
    })))
}
