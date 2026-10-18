
const API_BASE =
  process.env.NEXT_PUBLIC_RISK_API_URL ?? "http://localhost:8080";

export interface Investigation {
  id: string;
  finding: string;
  confidence: number | null;
  created_at: number;
  status: string;
}

export type DataSource = "real" | "live" | "simulation";
export type InvestigationDepth = 0 | 1 | 2 | 3;

export interface IngestionCoverage {
  max_depth: InvestigationDepth;
  max_depth_reached: number;
  wallets_visited: number;
  signatures_fetched: number;
  transactions_fetched: number;
  transactions_processed: number;
  transfers_persisted: number;
  duplicates_skipped: number;
  failed_transactions: number;
  persistence_errors: number;
  rate_limited: boolean;
  incomplete: boolean;
}

export interface GraphEvidence {
  wallet: string;
  hop_count: number;
  path_wallets: string[];
}

export interface RiskReport {
  status: string;
  address: string;
  data_source: string;
  graph_evidence: GraphEvidence[];
  investigation_diff: {
    current_unique_cycles: number;
    historical_unique_cycles: number;
    recurring_cycles: string[][];
    new_cycles: string[][];
    novelty_status: string;
    uncomparable_historical_records: number;
    limitations: string[];
  };
  structured_report: {
    summary: string;
    observations: Record<string, unknown>;
    recommended_actions: string[];
    limitations: string[];
  };
  ai_risk_report: string;
  wallets_flagged: number;
  cycle_participant_count: number;
  coverage?: {
    incomplete: boolean;
    limitations: string[];
  };
}

export class BackendRequestError extends Error {
  readonly body: Record<string, unknown> | null;

  constructor(message: string, body: Record<string, unknown> | null) {
    super(message);
    this.name = 'BackendRequestError';
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    if (!response.ok) {
      throw new BackendRequestError(`Backend returned HTTP ${response.status}`, null);
    }
    throw new BackendRequestError('Backend returned an invalid JSON response', null);
  }

  const errorBody = isRecord(body) ? body : null;
  if (!response.ok || errorBody?.status === 'error') {
    const message =
      (typeof errorBody?.error === 'string' && errorBody.error) ||
      (typeof errorBody?.message === 'string' && errorBody.message) ||
      `Backend returned HTTP ${response.status}`;
    throw new BackendRequestError(message, errorBody);
  }

  if (!isRecord(body) || body.status !== 'success') {
    throw new Error('Backend response did not confirm success');
  }

  return body as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function getInvestigations(dataSource: DataSource = 'real') {
  const sourceFilter = dataSource === 'simulation' ? 'demo' : 'real';
  return request<{ count: number; investigations: Investigation[] }>(
    `/api/investigations?data_source=${sourceFilter}`
  );
}

export interface IngestWalletStats {
  status: 'success' | 'error';
  address: string;
  data_source: 'real';
  max_depth: InvestigationDepth;
  max_depth_reached: number;
  wallets_visited: number;
  signatures_fetched: number;
  transfers_persisted: number;
  transactions_fetched: number;
  transactions_processed: number;
  total_transactions_processed: number;
  duplicates_skipped: number;
  failed_transactions: number;
  persistence_errors: number;
  rate_limited: boolean;
  incomplete: boolean;
  error: string | null;
}

export interface IngestWalletResult extends IngestWalletStats {
  status: 'success';
}

export interface SeedDemoResult {
  status: string;
  message: string;
}

export function generateRiskReport(
  address: string,
  dataSource: DataSource = 'real',
  ingestion?: IngestionCoverage
): Promise<RiskReport> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  return request("/api/generate-risk-report", {
    method: "POST",
    headers,
    body: JSON.stringify({ address, data_source: dataSource, ingestion }),
  }).then((body) => {
    const expectedDataSource = dataSource === 'simulation' ? 'demo' : 'real';
    if (
      !isRecord(body) ||
      body.address !== address ||
      body.data_source !== expectedDataSource ||
      !Array.isArray(body.graph_evidence) ||
      !isRecord(body.structured_report) ||
      typeof body.ai_risk_report !== 'string'
    ) {
      throw new Error('Risk report response is missing required report fields');
    }
    return body as unknown as RiskReport;
  });
}

export function ingestWallet(
  address: string,
  maxDepth: InvestigationDepth
): Promise<IngestWalletResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  return request<IngestWalletResult>("/api/ingest-wallet", {
    method: "POST",
    headers,
    body: JSON.stringify({ address, max_depth: maxDepth, data_source: 'real' }),
  }).then((result) => {
    const numericFields = [
      result.max_depth,
      result.max_depth_reached,
      result.wallets_visited,
      result.signatures_fetched,
      result.transactions_fetched,
      result.transactions_processed,
      result.total_transactions_processed,
      result.transfers_persisted,
      result.duplicates_skipped,
      result.failed_transactions,
      result.persistence_errors,
    ];
    if (
      result.address !== address ||
      result.status !== 'success' ||
      result.data_source !== 'real' ||
      result.max_depth !== maxDepth ||
      numericFields.some((field) => !isNonNegativeInteger(field)) ||
      typeof result.rate_limited !== 'boolean' ||
      typeof result.incomplete !== 'boolean' ||
      result.error !== null
    ) {
      throw new Error('Ingestion response did not include valid investigation statistics');
    }
    return result;
  });
}

export function getIngestionFailure(
  error: unknown,
  address: string,
  maxDepth: InvestigationDepth
): IngestWalletStats | null {
  if (!(error instanceof BackendRequestError) || !error.body) return null;
  const body = error.body;
  const numericFields = [
    body.max_depth,
    body.max_depth_reached,
    body.wallets_visited,
    body.signatures_fetched,
    body.transactions_fetched,
    body.transactions_processed,
    body.total_transactions_processed,
    body.transfers_persisted,
    body.duplicates_skipped,
    body.failed_transactions,
    body.persistence_errors,
  ];
  if (
    body.status !== 'error' ||
    body.address !== address ||
    body.data_source !== 'real' ||
    body.max_depth !== maxDepth ||
    numericFields.some((field) => !isNonNegativeInteger(field)) ||
    typeof body.rate_limited !== 'boolean'
  ) {
    return null;
  }

  return {
    status: 'error',
    address,
    data_source: 'real',
    max_depth: maxDepth,
    max_depth_reached: body.max_depth_reached as number,
    wallets_visited: body.wallets_visited as number,
    signatures_fetched: body.signatures_fetched as number,
    transactions_fetched: body.transactions_fetched as number,
    transactions_processed: body.transactions_processed as number,
    total_transactions_processed: body.total_transactions_processed as number,
    transfers_persisted: body.transfers_persisted as number,
    duplicates_skipped: body.duplicates_skipped as number,
    failed_transactions: body.failed_transactions as number,
    persistence_errors: body.persistence_errors as number,
    rate_limited: body.rate_limited,
    incomplete: true,
    error: typeof body.error === 'string' ? body.error : error.message,
  };
}

export async function investigateWallet(
  address: string,
  maxDepth: InvestigationDepth,
  onIngested?: (result: IngestWalletResult) => void
): Promise<{ ingestion: IngestWalletResult; report: RiskReport }> {
  const ingestion = await ingestWallet(address, maxDepth);
  onIngested?.(ingestion);

  const coverage: IngestionCoverage = {
    max_depth: ingestion.max_depth,
    max_depth_reached: ingestion.max_depth_reached,
    wallets_visited: ingestion.wallets_visited,
    signatures_fetched: ingestion.signatures_fetched,
    transactions_fetched: ingestion.transactions_fetched,
    transactions_processed: ingestion.transactions_processed,
    transfers_persisted: ingestion.transfers_persisted,
    duplicates_skipped: ingestion.duplicates_skipped,
    failed_transactions: ingestion.failed_transactions,
    persistence_errors: ingestion.persistence_errors,
    rate_limited: ingestion.rate_limited,
    incomplete: ingestion.incomplete,
  };
  const report = await generateRiskReport(address, 'real', coverage);
  return { ingestion, report };
}

export function seedDemo(): Promise<SeedDemoResult> {
  return request("/api/seed-demo", {
    method: "POST",
  }) as unknown as Promise<SeedDemoResult>;
}
