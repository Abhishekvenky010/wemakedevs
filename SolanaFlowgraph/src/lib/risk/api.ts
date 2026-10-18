
const API_BASE =
  process.env.NEXT_PUBLIC_RISK_API_URL ?? "http://localhost:8080";

export interface Investigation {
  id: string;
  finding: string;
  confidence: number | null;
  created_at: number;
  status: string;
}

export interface GraphEvidence {
  wallet: string;
  hop_count: number;
  path_wallets: string[];
}

export interface RiskReport {
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
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);

  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getInvestigations() {
  return request<{ count: number; investigations: Investigation[] }>(
    "/api/investigations"
  );
}

export function generateRiskReport(address: string) {
  return request<RiskReport>("/api/generate-risk-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
}
