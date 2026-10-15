use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use falkordb::{FalkorAsyncClient, FalkorClientBuilder, FalkorConnectionInfo};
use futures::TryStreamExt;
use serde_json::{json, Value};
use std::{env, sync::Arc};
use tower_http::cors::CorsLayer;

struct AppState {
    falkor_client: FalkorAsyncClient,
    groq_api_key: String,
    http_client: reqwest::Client,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    let connection_string = env::var("FALKORDB_URL")?;

    let conn_info: FalkorConnectionInfo = connection_string
        .as_str()
        .try_into()
        .map_err(|e| format!("Invalid FalkorDB connection URL: {e}"))?;

    println!("Connecting to FalkorDB Cloud...");

    let client = FalkorClientBuilder::new_async()
        .with_connection_info(conn_info)
        .with_connect_timeout(Some(std::time::Duration::from_secs(30)))
        .build()
        .await?;

    // Verify that the graph database responds.
    let graphs = client.list_graphs().await?;
    println!("Connected to FalkorDB Cloud.");
    println!("Existing graphs: {:?}", graphs);

    let groq_api_key = env::var("GROQ_API_KEY")
        .map_err(|_| "GROQ_API_KEY must be set in .env")?;

    let state = Arc::new(AppState {
        falkor_client: client,
        groq_api_key,
        http_client: reqwest::Client::new(),
    });

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/detect-wash-trading", post(detect_wash_trading))
        .route("/api/seed-demo", post(seed_demo))
        .route("/api/generate-risk-report", post(generate_risk_report))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;

    println!("Axum backend listening on http://localhost:8080");

    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "OK"
}

// Seeds a disposable demonstration graph.
// It does not delete existing nodes.
async fn seed_demo(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let mut graph = state.falkor_client.select_graph("defi_risk");

    let query = r#"
        CREATE
          (w1:Wallet {
              address: 'demo_wallet_1',
              risk_score: 0.15
          }),
          (w2:Wallet {
              address: 'demo_wallet_2',
              risk_score: 0.20
          }),
          (w3:Wallet {
              address: 'demo_wallet_3',
              risk_score: 0.10
          }),
          (p:LiquidityPool {
              pair: 'SOL/USDC',
              address: 'DemoPool'
          }),
          (w1)-[:TRANSFERRED_TO {amount: 250.0}]->(w2),
          (w2)-[:TRANSFERRED_TO {amount: 248.5}]->(w3),
          (w3)-[:TRANSFERRED_TO {amount: 247.0}]->(w1),
          (w1)-[:SWAPPED {amount: 1000.0}]->(p)
    "#;

    graph
        .query(query)
        .execute()
        .await
        .map_err(api_error)?;

    Ok(Json(json!({
        "status": "success",
        "message": "Demo wallet cycle created",
        "graph": "defi_risk"
    })))
}

// Detects directed transfer paths that return to their starting wallet.
async fn detect_wash_trading(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let mut graph = state.falkor_client.select_graph("defi_risk");

    let query = r#"
        MATCH path = (start:Wallet)-[:TRANSFERRED_TO*3..6]->(start)
        RETURN start.address AS wallet,
               length(path) AS hop_count
        LIMIT 100
    "#;

    let mut result = graph
        .ro_query(query)
        .execute()
        .await
        .map_err(api_error)?;

    let mut cycles = Vec::new();

    while let Ok(Some(row)) = result.data.try_next().await {

        let wallet: String = row
            .try_get("wallet")
            .map_err(api_error)?;

        let hop_count: i64 = row
            .try_get("hop_count")
            .map_err(api_error)?;

        cycles.push(json!({
            "wallet": wallet,
            "hop_count": hop_count
        }));
    }

    let count = cycles.len();

    Ok(Json(json!({
        "status": "success",
        "detected_cycles": count,
        "cycles": cycles,
        "message": "Circular transfer patterns found; these are risk signals, not proof of wash trading."
    })))
}

// Generate an AI-powered risk report based on graph data
async fn generate_risk_report(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Fetch circular-transfer evidence from FalkorDB.
    let mut graph = state.falkor_client.select_graph("defi_risk");

    let query = r#"
        MATCH path =
            (start:Wallet)-[:TRANSFERRED_TO*3..6]->(start)
        RETURN DISTINCT
            start.address AS wallet,
            length(path) AS hop_count
        LIMIT 10
    "#;

    let mut result = graph
        .ro_query(query)
        .execute()
        .await
        .map_err(api_error)?;

    let mut cycles = Vec::<Value>::new();

    while let Ok(Some(row)) = result.data.try_next().await {

        let wallet: String =
            row.try_get("wallet").map_err(api_error)?;

        let hop_count: i64 =
            row.try_get("hop_count").map_err(api_error)?;

        cycles.push(json!({
            "wallet": wallet,
            "hop_count": hop_count
        }));
    }

    // Ask Groq to analyze the observed evidence.
    let request_body = json!({
        "model": "qwen/qwen3.8-27b",
        "messages": [
            {
                "role": "system",
                "content": "You are a DeFi security analyst. \
                Analyze only the supplied graph evidence. \
                Distinguish observations from hypotheses. \
                Circular transfers alone do not prove wash trading. \
                Do not invent transaction amounts, timestamps, \
                wallet ownership, or other missing evidence."
            },
            {
                "role": "user",
                "content": format!(
                    "Analyze these circular transfer patterns: {}",
                    serde_json::to_string(&cycles)
                        .map_err(api_error)?
                )
            }
        ],
        "temperature": 0.2
    });

    let response = state
        .http_client
        .post("https://api.groq.com/openai/v1/chat/completions")
        .bearer_auth(&state.groq_api_key)
        .json(&request_body)
        .send()
        .await
        .map_err(api_error)?;

    let status = response.status();

    // Read the body as JSON, regardless of Groq's service_tier value.
    let body: Value = response
        .json()
        .await
        .map_err(api_error)?;

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

    let report = body
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            api_error("Groq response did not contain message content")
        })?;

    Ok(Json(json!({
        "status": "success",
        "wallets_flagged": cycles.len(),
        "graph_evidence": cycles,
        "ai_risk_report": report
    })))
}

fn api_error<E: std::fmt::Display>(
    error: E,
) -> (StatusCode, Json<Value>) {
    eprintln!("Backend Error: {error}");

    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({
            "status": "error",
            "error": error.to_string()
        })),
    )
}