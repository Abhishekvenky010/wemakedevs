#![recursion_limit = "256"]

mod agent;
mod error;
mod graph;
mod handlers;
mod ingestion;
mod mcp;
mod state;

use axum::{
    Router,
    routing::{get, post},
};
use falkordb::{FalkorClientBuilder, FalkorConnectionInfo};
use std::{env, sync::Arc};
use tower_http::cors::CorsLayer;

use crate::state::AppState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    let connection_string = env::var("FALKORDB_URL")?;

    let conn_info: FalkorConnectionInfo = connection_string
        .as_str()
        .try_into()
        .map_err(|e| format!("Invalid FalkorDB connection URL: {e}"))?;

    eprintln!("Connecting to FalkorDB Cloud...");

    let client = FalkorClientBuilder::new_async()
        .with_connection_info(conn_info)
        .with_connect_timeout(Some(std::time::Duration::from_secs(30)))
        .build()
        .await?;

    // Verify that the graph database responds.
    let graphs = client.list_graphs().await?;
    eprintln!("Connected to FalkorDB Cloud.");
    eprintln!("Existing graphs: {:?}", graphs);

    let groq_api_key = env::var("GROQ_API_KEY").map_err(|_| "GROQ_API_KEY must be set in .env")?;

    let state = Arc::new(AppState {
        falkor_client: client,
        groq_api_key,
        http_client: reqwest::Client::new(),
    });

    if env::args().any(|arg| arg == "--mcp") {
        return mcp::run_mcp(state).await;
    }

    let app = Router::new()
        .route("/health", get(health_check))
        .route(
            "/api/detect-wash-trading",
            post(handlers::risk_report::detect_wash_trading),
        )
        .route("/api/seed-demo", post(handlers::risk_report::seed_demo))
        .route(
            "/api/generate-risk-report",
            post(handlers::risk_report::generate_risk_report),
        )
        .route(
            "/api/investigations",
            post(handlers::investigations::save_investigation),
        )
        .route(
            "/api/investigations",
            get(handlers::investigations::list_investigations),
        )
        .route(
            "/api/memory",
            get(handlers::investigations::retrieve_memory),
        )
        .route("/api/trace-wallet", post(handlers::wallet::trace_wallet))
        .route(
            "/api/ingest-wallet",
            post(handlers::ingestion::ingest_wallet_handler),
        )
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;

    eprintln!("Axum backend listening on http://localhost:8080");

    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "OK"
}
