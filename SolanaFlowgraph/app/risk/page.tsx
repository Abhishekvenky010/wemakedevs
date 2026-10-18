'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '../components/Header';
import RiskGraphVisualization from '@/components/risk/RiskGraphVisualization';
import {
  generateRiskReport,
  getInvestigations,
  Investigation,
  RiskReport,
} from '@/lib/risk/api';

interface ReportData {
  report: RiskReport | null;
  loading: boolean;
  error: string | null;
}

interface InvestigationsData {
  investigations: Investigation[];
  count: number;
  loading: boolean;
  error: string | null;
}

export default function RiskPage() {
  const [address, setAddress] = useState('');
  const [report, setReport] = useState<ReportData>({
    report: null,
    loading: false,
    error: null,
  });
  const [investigations, setInvestigations] = useState<InvestigationsData>({
    investigations: [],
    count: 0,
    loading: false,
    error: null,
  });

  const fetchInvestigations = useCallback(async () => {
    setInvestigations((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await getInvestigations();
      setInvestigations({
        investigations: data.investigations,
        count: data.count,
        loading: false,
        error: null,
      });
    } catch (err) {
      setInvestigations({
        investigations: [],
        count: 0,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load investigations',
      });
    }
  }, []);

  useEffect(() => {
    fetchInvestigations();
  }, [fetchInvestigations]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) return;

    setReport({ report: null, loading: true, error: null });

    try {
      const result = await generateRiskReport(trimmed);
      setReport({
        report: result,
        loading: false,
        error: null,
      });
    } catch (err) {
      setReport({
        report: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to generate risk report',
      });
    }
  };

  const graphEvidence = report.report?.graph_evidence ?? [];
  const diff = report.report?.investigation_diff;
  const structured = report.report?.structured_report;
  const aiReport = report.report?.ai_risk_report;
  const walletsFlagged = report.report?.cycle_participant_count ?? report.report?.wallets_flagged ?? 0;

  const isEmpty = report.report === null && !report.loading && !report.error;

  return (
    <main className="min-h-screen bg-gray-50">
      <Header />

      <div className="container mx-auto px-4 py-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">DeFi Risk Investigation</h1>
          <p className="text-gray-600 mt-2">
            Analyze circular-transfer risk patterns on Solana. Graph patterns are risk signals,
            not proof of wrongdoing.
          </p>
        </header>

        <section className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-8">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">Investigate a Wallet</h2>
          <form onSubmit={handleGenerate} className="max-w-md flex flex-col gap-4">
            <div>
              <label htmlFor="wallet-address" className="block text-sm font-medium text-gray-700 mb-1">
                Wallet address
              </label>
              <input
                id="wallet-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. demo_wallet_1"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                disabled={report.loading}
              />
            </div>
            <button
              type="submit"
              disabled={report.loading || !address.trim()}
              className="btn-primary px-6 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {report.loading ? 'Generating...' : 'Generate Risk Report'}
            </button>
            {report.error && (
              <div className="p-3 bg-red-50 text-red-700 rounded border border-red-100 text-sm">
                {report.error}
              </div>
            )}
          </form>
        </section>

        {isEmpty && (
          <section className="bg-white p-8 rounded-lg shadow-sm border border-slate-200 text-center">
            <p className="text-gray-500">Enter a wallet address above to generate a risk report.</p>
          </section>
        )}

        {report.loading && !report.report && !report.error && (
          <section className="flex justify-center py-12">
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-gray-600 text-sm">Generating risk report...</p>
            </div>
          </section>
        )}

        {report.report && (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-2">
                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                  <h2 className="text-lg font-semibold mb-4 text-gray-900">Risk Graph</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Circular-transfer paths detected from FalkorDB evidence. Link thickness shows how
                    often an edge appears across returned paths (path recurrence), not transaction volume.
                  </p>
                  <RiskGraphVisualization evidence={graphEvidence} height={500} />
                  {graphEvidence.length === 0 && (
                    <div className="mt-4 p-4 bg-amber-50 rounded border border-amber-200 text-amber-800 text-sm">
                      No circular-transfer paths detected for this address.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                  <h3 className="font-semibold text-gray-900 mb-3">Summary</h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {structured?.summary ?? 'No summary available.'}
                  </p>
                </div>

                <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                  <h3 className="font-semibold text-gray-900 mb-3">Cycle participants</h3>
                  <p className="text-2xl font-bold text-gray-900">{walletsFlagged}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Distinct wallet addresses appearing in returned cycle paths for this address.
                    Not a count of confirmed malicious wallets.
                  </p>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-2">
                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                  <h2 className="text-lg font-semibold mb-4 text-gray-900">Findings &amp; Observations</h2>
                  <div className="space-y-3">
                    {(structured?.observations && Object.keys(structured.observations).length > 0) ? (
                      <>
                        <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                          {Object.entries(structured.observations as Record<string, unknown>).map(
                            ([key, value]) => (
                              <li key={key} className="flex gap-2">
                                <span className="font-medium text-gray-900">{key}:</span>
                                <span>{String(value)}</span>
                              </li>
                            )
                          )}
                        </ul>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">No observations available.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                  <h3 className="font-semibold text-gray-900 mb-3">Recommended Actions</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                    {(structured?.recommended_actions as string[] ?? []).map((action, i) => (
                      <li key={i}>{action}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                  <h3 className="font-semibold text-gray-900 mb-3">Limitations</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                    {(structured?.limitations as string[] ?? []).map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <section className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-8">
              <h2 className="text-lg font-semibold mb-4 text-gray-900">Historical Comparison</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 p-4 rounded border border-slate-200">
                  <h3 className="font-medium text-gray-900 mb-2">Current Cycles</h3>
                  <p className="text-xl font-bold text-gray-900">
                    {diff?.current_unique_cycles ?? 0}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded border border-slate-200">
                  <h3 className="font-medium text-gray-900 mb-2">Historical Cycles</h3>
                  <p className="text-xl font-bold text-gray-900">
                    {diff?.historical_unique_cycles ?? 0}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded border border-slate-200">
                  <h3 className="font-medium text-gray-900 mb-2">Recurring Cycles</h3>
                  <p className="text-xl font-bold text-gray-900">
                    {diff?.recurring_cycles.length ?? 0}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded border border-slate-200">
                  <h3 className="font-medium text-gray-900 mb-2">New Cycles</h3>
                  <p className="text-xl font-bold text-gray-900">
                    {diff?.new_cycles.length ?? 0}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded border border-slate-200">
                  <h3 className="font-medium text-gray-900 mb-2">Novelty Status</h3>
                  <p className="text-sm font-medium text-gray-700 capitalize">
                    {diff?.novelty_status ?? 'unknown'}
                  </p>
                  {diff?.uncomparable_historical_records != null &&
                    diff.uncomparable_historical_records > 0 && (
                      <p className="text-xs text-amber-700 mt-1">
                        Novelty status is uncertain because some historical records lack usable graph evidence.
                      </p>
                    )}
                </div>
                <div className="bg-amber-50 p-4 rounded border border-amber-200">
                  <h3 className="font-medium text-gray-900 mb-2">Data Limitations</h3>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-gray-600">
                    {(diff?.limitations as string[] ?? []).map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <section className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-8">
              <h2 className="text-lg font-semibold mb-4 text-gray-900">AI Risk Report</h2>
              <p className="text-xs text-amber-700 mb-3">
                This AI-generated report is explanatory and may contain errors or omissions. The structured
                comparison and evidence fields above are authoritative for counts and novelty status.
              </p>
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap border-t border-slate-200 pt-4">
                {aiReport ?? 'No AI-generated report available.'}
              </div>
            </section>

            <section className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Recent Investigations</h2>
                {investigations.loading ? (
                  <span className="text-xs text-gray-500">Loading...</span>
                ) : investigations.error ? (
                  <span className="text-xs text-red-600">{investigations.error}</span>
                ) : (
                  <span className="text-xs text-gray-500">{investigations.count} investigation(s)</span>
                )}
              </div>
              {investigations.loading && !investigations.error && (
                <div className="h-24 flex items-center justify-center text-gray-500 text-sm">
                  Loading investigations...
                </div>
              )}
              {investigations.error && !investigations.loading && (
                <div className="p-4 bg-red-50 rounded border border-red-100 text-sm text-red-700">
                  {investigations.error}
                </div>
              )}
              {investigations.investigations.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="pb-2 font-medium text-gray-500 uppercase tracking-wider">ID</th>
                        <th className="pb-2 font-medium text-gray-500 uppercase tracking-wider">Finding</th>
                        <th className="pb-2 font-medium text-gray-500 uppercase tracking-wider">Confidence</th>
                        <th className="pb-2 font-medium text-gray-500 uppercase tracking-wider">Created</th>
                        <th className="pb-2 font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {investigations.investigations.map((inv) => (
                        <tr key={inv.id}>
                          <td className="py-3 text-gray-900 font-mono text-xs truncate max-w-[120px]">
                            {inv.id}
                          </td>
                          <td className="py-3 text-gray-700 truncate max-w-[200px]">{inv.finding}</td>
                          <td className="py-3 text-gray-700">
                            {inv.confidence == null || inv.confidence == 0 ? (
                              <span className="text-gray-500">Not rated</span>
                            ) : (
                              <span>{inv.confidence.toFixed(2)}</span>
                            )}
                          </td>
                          <td className="py-3 text-gray-700">
                            {new Date(inv.created_at).toLocaleString()}
                          </td>
                          <td className="py-3">
                            <span
                              className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                                inv.status === 'needs_review'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {inv.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {investigations.investigations.length === 0 && !investigations.loading && !investigations.error && (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No recent investigations found.
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
