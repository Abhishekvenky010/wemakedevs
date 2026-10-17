use falkordb::FalkorAsyncClient;

pub struct AppState {
    pub falkor_client: FalkorAsyncClient,
    pub groq_api_key: String,
    pub http_client: reqwest::Client,
}
