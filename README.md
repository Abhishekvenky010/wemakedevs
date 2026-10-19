# AgentX - DeFi Risk Agent



An automated DeFi risk investigation system that uses graph analytics and multi-hop reasoning to detect fraud, triage security findings, and act on connected data.

## Core Architecture

### Multi-Hop Reasoning Pipeline

The agent follows a structured pipeline to investigate suspicious activities:

1. **Trace Phase** – Use `trace_wallet` tool to detect circular-transfer paths for a given wallet address.
2. **Context Enrichment** – Use `find_related_cases` tool to locate historical investigations linked to the same wallet.
3. **Comparison Phase** – Leverage the graph engine (`compare_paths`) to compare current paths with historical records, identifying recurring vs. novel cycles.

### Graph-Based Decision Engine

The graph module (`risk_agent_backend/src/graph/`) provides the analytical backbone:

- **Canonical Cycle Detection** – Normalizes circular-transfer paths into a canonical representation, enabling reliable comparison across different traversal lengths.
- **Path Comparison** – Compares current wallet paths with historical ones, computing recurrence metrics (recurring vs. new cycles) and novelty status.
- **Evidence Weighting** – Quantifies confidence, recency, and completeness of historical evidence.

### MCP-Driven Tool Selection

The agent's investigative tool calls are mediated through Model Context Protocol (MCP):

- **Tool Discovery** – The `tools.rs` module defines approved read-only tools (`trace_wallet`, `find_related_cases`, `compare_investigations`).
- **Dynamic Invocation** – The orchestrator selects and executes tools based on the current state and available data sources.
- **Fallback Reporting** – When tools fail or return incomplete results, a structured fallback report is generated from graph evidence.

## Key Capabilities

### Fraud Detection
Detects circular-transfer paths (potential money laundering or rug-pull indicators) and correlates them with historical investigation cases.

### Security Triage
Compares current activity against historical patterns to identify recurring threats, novel anomalies, or gaps in evidence.
### Actionable Insights

Produces explainable reports that distinguish:

- **Confirmed risks** – Cyclic paths with strong evidence
- **Potential risks** – New cycles not yet seen historically
- **Uncertain cases** – Incomplete historical evidence
- **Safe activities** – No detectable patterns

### Deterministic Action Rule

When `POST /api/generate-risk-report` is called, the backend applies a
deterministic rule on actual graph evidence (never the LLM):

- If ≥1 circular-transfer path (3–6 hops) exists → `action_taken = "flag_for_review"`.
  An investigation case is created or updated in FalkorDB with status `needs_review`
  and a stable `case_id`. Repeated reports for the same address + data source reuse
  the existing case — no duplicates are created.
- If no cycle is found → `action_taken = "no_action"`, no case is persisted.

Real and synthetic evidence remain strictly separated — the rule only counts
paths matching the requested `data_source`.
## System Flow

```
1. Receive wallet address + data source (real/demo)
2. Ingest wallet transfers → persist edges
3. Trace wallet → detect cycles + load persisted transfer edges for the graph
4. Find related cases → historical investigations
5. Compare paths → recurrence/novelty analysis
6. Deterministic action rule → flag_for_review or no_action
7. Create/update investigation case when rule is satisfied
8. Generate explainable report with action outcome
```

## Graph Algorithms

### Canonical Cycle Normalization
Normalizes arbitrary-length cyclic paths into a minimal canonical form, ensuring consistent comparison regardless of traversal depth.

### Path Comparison
Compares current and historical paths, computing:
- **Unique cycles** – Count of distinct cycle structures
- **Recurring cycles** – Cycles seen in both current and historical data
- **New cycles** – Novel cycle structures emerging now
- **Novelty status** – Indicates whether the activity represents a new threat pattern

### Persisted Transfer Graph
The risk report also returns `transaction_graph`: persisted `TRANSFERRED_TO`
edges in the investigated wallet's bounded neighborhood, scoped to the depth
actually reached by ingestion (1–3 hops). This is deliberately separate from
cycle detection. Cycle paths are a strict subset of the transfer graph and are
the only input to the deterministic action rule. The UI renders persisted
transfers even when they do not form a cycle, so normal on-chain activity is not
mistaken for missing evidence.

## Tool Integration

| Tool | Purpose | Data Source |
|------|---------|-------------|
| `trace_wallet` | Detect circular-transfer paths | Real/Demo mainnet |
| `find_related_cases` | Locate historical investigations | Falkor DB |
| `compare_investigations` | Compare current cycles with historical evidence | Falkor DB |

These tools are invoked through MCP and their results feed directly into the graph comparison engine.
## Explainability

All reports include:

- **Cycle Roots** – Identified circular paths with hop counts
- **Persisted Transfers** – Real/demo transfer edges rendered in the graph even when no cycle exists
- **Historical Context** – Related cases with findings and confidence scores
- **Novelty Assessment** – Whether the activity is new or recurring
- **Investigation Trace** – Ordered MCP tool calls, their effective arguments, status, and result counts
- **Limitations** – Clear statements about evidence quality and incompleteness
- **Action Outcome** – `action_taken` (`flag_for_review` or `no_action`), `action_reason`,
  `evidence_summary`, and `case_id` when a case was created or updated

## Usage

```bash
# Run the agent
cargo run --release

# Execute a specific investigation
curl http://localhost:3000/api/run?address=0xabc...&data_source=real
```

## Design Principles

- **Multi-hop reasoning** – Each phase builds on the previous, combining graph evidence with tool outputs.
- **Graph-first decision making** – All conclusions derive from analyzed graph structures, not ad-hoc heuristics.
- **MCP tool abstraction** – Tool selection is decoupled from business logic, enabling easy addition of new investigative capabilities.
- **Transparent outcomes** – Every report cites the underlying graph evidence and tool results.

## Extensibility

New investigative capabilities can be added by:
1. Adding a new tool definition in `tools.rs`
2. Registering it in the orchestrator's tool registry
3. Updating the graph comparison logic in `graph/`
4. Ensuring the tool integrates with the MCP client



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
├── SolanaFlowgraph/            # Next.js graph visualization frontend
│   ├── app/                    # Route shells (/risk, /demo) and layout
│   ├── src/components/ui/      # Reusable design-system primitives
│   ├── src/components/layout/  # Header and page shell
│   ├── src/components/risk/    # Report, graph, trace, and form components
│   ├── src/components/demo/    # Demo seed launcher
│   └── src/lib/                # API client and graph types
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
| POST | `/api/ingest-wallet` | Ingest real Solana mainnet transfers for a wallet into FalkorDB |
| POST | `/api/generate-risk-report` | Generate a risk report with deterministic action outcome |
| GET | `/api/investigations` | List saved investigations |
| POST | `/api/trace-wallet` | Trace circular-transfer paths for a wallet |
| POST | `/api/seed-demo` | Seed a disposable demonstration graph |

**Request Body (POST /api/generate-risk-report)**
```json
{
  "address": "<solana-base58-address>",
  "data_source": "real|demo",
  "ingestion": {
    "max_depth": 0,
    "max_depth_reached": 0,
    "wallets_visited": 1,
    "signatures_fetched": 0,
    "transactions_fetched": 0,
    "transactions_processed": 0,
    "transfers_persisted": 0,
    "duplicates_skipped": 0,
    "failed_transactions": 0,
    "persistence_errors": 0,
    "rate_limited": false,
    "incomplete": false
  }
}
```

**Response**
```json
{
  "status": "success",
  "address": "...",
  "data_source": "real",
  "finding": "Circular transfer pattern detected",
  "graph_evidence": [...],
  "transaction_graph": [
    {
      "source": "...",
      "destination": "...",
      "direction": "incoming",
      "signature": "...",
      "amount": 0.25,
      "mint": "SOL",
      "slot": 123,
      "block_time": 1700000000,
      "transfer_type": "NATIVE_SOL",
      "success": true
    }
  ],
  "evidence_summary": "1 circular transfer path(s) detected involving 3 unique wallet(s).",
  "action_taken": "flag_for_review",
  "action_reason": "Circular transfer pattern detected in graph evidence; flagged for human review. ...",
  "case_id": "<uuid>",
  "investigation": { "id": "<uuid>", "finding": "...", "status": "needs_review" },
  "cycle_participant_count": 3,
  "investigation_diff": { ... },
  "structured_report": { ... },
  "investigation_trace": [
    {
      "round": 0,
      "tool": "trace_wallet",
      "arguments": { "address": "...", "data_source": "real" },
      "status": "success",
      "result_summary": { "status": "success", "cycles_count": 1 }
    }
  ],
  "ai_risk_report": "...",
  "coverage": { ... }
}
```

When `action_taken` is `"no_action"`, `case_id` is `null` and no case is persisted.

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
cd SolanaFlowgraph
npm run test:risk
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

 FALKORDB_URL = falkor://wemakedevs:wemakedev@r-6jissuruar.instance-097s9plkr.hc-7up0crkyn.ap-south-1.aws.f2e0a955bb84.cloud:52331
![alt text](image.png)
