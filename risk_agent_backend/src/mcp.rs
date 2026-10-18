use std::sync::Arc;

use rmcp::{ServiceExt, handler::server::wrapper::Parameters, tool, tool_router, transport::stdio};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::json;

use crate::{
    graph::{
        comparison::compare_paths, investigations::find_related_cases, provenance::DataSource,
        wallet::trace_wallet_data,
    },
    state::AppState,
};

#[derive(Clone)]
pub struct RiskMcpServer {
    state: Arc<AppState>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct WalletParams {
    /// Wallet address to investigate.
    pub address: String,
    /// Provenance source; defaults to real evidence.
    #[serde(default = "default_data_source")]
    pub data_source: String,
}

fn default_data_source() -> String {
    "real".to_string()
}

#[tool_router(server_handler)]
impl RiskMcpServer {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }

    #[tool(description = "Trace a Solana wallet's transfer cycles from the FalkorDB graph.")]
    async fn trace_wallet(
        &self,
        Parameters(WalletParams {
            address,
            data_source,
        }): Parameters<WalletParams>,
    ) -> String {
        let data_source = DataSource::from_request(&data_source);
        match trace_wallet_data(&self.state.falkor_client, &address, data_source).await {
            Ok(cycles) => json!({
                "status": "success",
                "address": address,
                "data_source": data_source.as_edge_source(),
                "cycles": cycles
            })
            .to_string(),
            Err(error) => json!({
                "status": "error",
                "error": error
            })
            .to_string(),
        }
    }

    #[tool(description = "Retrieve historical investigations linked to a Solana wallet.")]
    async fn find_related_cases(
        &self,
        Parameters(WalletParams {
            address,
            data_source,
        }): Parameters<WalletParams>,
    ) -> String {
        let data_source = DataSource::from_request(&data_source);
        match find_related_cases(&self.state.falkor_client, &address, data_source).await {
            Ok(cases) => json!({
                "status": "success",
                "address": address,
                "data_source": data_source.as_investigation_value(),
                "cases": cases
            })
            .to_string(),
            Err(error) => json!({
                "status": "error",
                "error": error
            })
            .to_string(),
        }
    }

    #[tool(
        description = "Compare a wallet's current transfer cycles against historical investigation evidence. Reports recurring cycles, potentially new cycles, and incomplete history."
    )]
    async fn compare_investigations(
        &self,
        Parameters(WalletParams {
            address,
            data_source,
        }): Parameters<WalletParams>,
    ) -> String {
        let data_source = DataSource::from_request(&data_source);
        let current_cycles =
            match trace_wallet_data(&self.state.falkor_client, &address, data_source).await {
                Ok(cycles) => cycles,
                Err(error) => {
                    return json!({
                        "status": "error",
                        "step": "trace_wallet",
                        "error": error
                    })
                    .to_string();
                }
            };

        let historical_cases =
            match find_related_cases(&self.state.falkor_client, &address, data_source).await {
                Ok(cases) => cases,
                Err(error) => {
                    return json!({
                        "status": "error",
                        "step": "find_related_cases",
                        "error": error
                    })
                    .to_string();
                }
            };

        let mut result = compare_paths(&current_cycles, &historical_cases);

        if let Some(object) = result.as_object_mut() {
            object.insert("address".to_string(), json!(address));
            object.insert("current_cycles".to_string(), json!(current_cycles));
            object.insert(
                "historical_cases_checked".to_string(),
                json!(historical_cases.len()),
            );
        }

        result.to_string()
    }
}

pub async fn run_mcp(state: Arc<AppState>) -> Result<(), Box<dyn std::error::Error>> {
    let service = RiskMcpServer::new(state).serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}
