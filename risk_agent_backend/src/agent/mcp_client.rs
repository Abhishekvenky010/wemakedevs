use rmcp::{
    RoleClient, ServiceExt, model::CallToolRequestParams, service::RunningService,
    transport::child_process::TokioChildProcess,
};
use serde_json::Value;
use std::{borrow::Cow, process::Stdio};
use tokio::process::Command;

pub struct McpClient {
    inner: RunningService<RoleClient, ()>,
}

impl McpClient {
    pub async fn connect() -> Result<Self, String> {
        let executable = std::env::current_exe()
            .map_err(|error| format!("Cannot locate backend executable: {error}"))?;

        let mut command = Command::new(&executable);
        command
            .arg("--mcp")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        let transport = TokioChildProcess::new(command)
            .map_err(|error| format!("Cannot start MCP server process: {error}"))?;

        let inner = ()
            .serve(transport)
            .await
            .map_err(|error| format!("MCP client initialization failed: {error}"))?;

        Ok(Self { inner })
    }

    pub async fn call_tool(&self, name: &str, arguments: Value) -> Result<Value, String> {
        let arguments = arguments
            .as_object()
            .cloned()
            .ok_or_else(|| "MCP tool arguments must be a JSON object".to_string())?;

        let params =
            CallToolRequestParams::new(Cow::Owned(name.to_string())).with_arguments(arguments);

        let result = self
            .inner
            .call_tool(params)
            .await
            .map_err(|error| format!("MCP tool call failed: {error}"))?;

        if result.is_error.unwrap_or(false) {
            return Err(format!("MCP tool returned an error: {:?}", result.content));
        }

        let text = result
            .content
            .iter()
            .filter_map(|block| block.as_text())
            .map(|block| block.text.as_str())
            .collect::<Vec<_>>()
            .join("\n");

        if let Some(structured) = result.structured_content {
            return Ok(structured);
        }

        serde_json::from_str(&text)
            .map_err(|error| format!("MCP tool returned invalid JSON: {error}; output: {text}"))
    }

    pub async fn close(&mut self) -> Result<(), String> {
        self.inner
            .close()
            .await
            .map(|_| ())
            .map_err(|error| format!("Failed to close MCP client: {error}"))
    }
}
