# WEMAKEDEVS - DeFi Risk Agent

Automated DeFi risk investigation system that uses graph analytics and multi-hop reasoning to detect fraud, triage security findings, and act on connected data.

## Project Structure

```
wemakedevs/
├── risk_agent_backend/          # Backend (Rust/Axum)
│   ├── src/
│   │   ├── agent/              # Agent tools, orchestrator, MCP client
│   │   ├── graph/              # Graph algorithms (canonical cycles, path comparison)
│   │   └── main.rs             # Entry point
│   ├── Cargo.toml              # Dependencies (axum, falkordb, remcp, etc.)
│   └── README.md               # Backend-specific documentation
├── SolanaFlowgraph/            # Graph visualization component
└── README.md                   # Global project documentation
```

## Quick Start

### Prerequisites
- Rust (≥1.53) with Cargo
- Node.js/NPM (for frontend)
- Docker (optional, for containerized deployment)

### Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd risk_agent_backend
   ```

2. **Install dependencies**
   ```bash
   cargo build --release
   ```

3. **Run the backend**
   ```bash
   cargo run --release
   ```
   The server will start on `http://localhost:3000`.

### Frontend Setup

The frontend is designed to consume the backend API. Follow these steps:

1. **Clone/initialize frontend** (assuming a separate frontend repo or monorepo structure)
   ```bash
   # If frontend is in a separate repo, clone it first
   git clone <frontend-repo-url>
   cd <frontend-repo>
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Start the frontend development server**
   ```bash
   npm run dev
   ```

4. **Build for production** (when ready)
   ```bash
   npm run build
   ```

## API Endpoints

### Backend API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/run` | Run investigation for a wallet address |
| POST | `/api/run` | Alternative endpoint for investigation |
| GET | `/api/report/{id}` | Get investigation report by ID |

**Request Body (GET /api/run)**
```json
{
  "address": "0x...",
  "data_source": "real|demo"
}
```

**Response**
```json
{
  "status": "success|error",
  "wallet": "...",
  "data_source": "...",
  "detected_cycles": [...],
  "cases_found": [...]
}
```

### Graph Analysis

- **`trace_wallet`** – Detects circular-transfer paths for a wallet
- **`find_related_cases`** – Locates historical investigations by wallet
- **`compare_paths`** – Compares current paths with historical records

## Running Tests

### Backend Tests
```bash
cd risk_agent_backend
cargo test
```

### Frontend Tests
```bash
# Depending on your frontend framework
npm test
```

## Development Workflow

1. **Backend Changes**
   - Modify `risk_agent_backend/src/agent/` for new tools
   - Update `risk_agent_backend/src/graph/` for new algorithms
   - Run `cargo test` to verify changes

2. **Frontend Changes**
   - Modify components in the frontend codebase
   - Ensure API contracts remain stable
   - Run `npm run dev` to see changes

3. **Integration Testing**
   - Start backend in release mode
   - Run frontend in development mode
   - Verify API responses and UI updates

## Configuration

### Environment Variables (Backend)

| Variable | Description | Default |
|----------|-------------|---------|
| `RISK_AGENT_DATABASE_URL` | Connection string for Falkor DB | `falkor://localhost:8080` |
| `RISK_AGENT_API_PORT` | Backend port | `3000` |
| `RISK_AGENT_WALLET_CACHE_TTL` | Cache TTL for wallet addresses | `3600` |

### Environment Variables (Frontend)

| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_RISK_API_URL` | Backend API base URL | `http://localhost:3000` |
| `REACT_APP_WALLET_CACHE_TTL` | Frontend cache TTL | `3600` |

## Security Considerations

- All graph comparisons are based on verified graph evidence
- Tools are read-only and auditable
- Reports include explicit limitations and uncertainty markers
- No sensitive data is logged or exposed

## Monitoring & Logging

- Backend logs are written to stdout/stderr
- Frontend sends activity events to the backend
- Error rates are monitored via Grafana/Prometheus (see `Cargo.toml` for metrics)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make changes and ensure tests pass
4. Submit a pull request

## License

MIT - see individual files for license details.

## Support

For issues or questions, reference the global README and project-specific documents:
- `risk_agent_backend/README.md` – Backend architecture and setup
- `SolanaFlowgraph/` – Graph visualization component
- Individual service READMEs in respective directories
