'use client';

import { useState, useCallback, useEffect } from 'react';
import Header from '../components/Header';
import RiskGraphVisualization from '@/components/risk/RiskGraphVisualization';
import { seedDemo, generateRiskReport, RiskReport, GraphEvidence, getInvestigations, Investigation } from '@/lib/risk/api';

export default function DemoPage() {
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [report, setReport] = useState<{ report: RiskReport | null; loading: boolean; error: string | null }>({
    report: null,
    loading: false,
    error: null,
  });
  const [investigations, setInvestigations] = useState<{
    investigations: Investigation[];
    count: number;
    loading: boolean;
    error: string | null;
  }>({
    investigations: [],
    count: 0,
    loading: false,
    error: null,
  });

  const handleSeedDemo = useCallback(async () => {
    setSeeding(true);
    setSeedError(null);
    try {
      await seedDemo();
      setSeeded(true);
      setReport({ report: null, loading: true, error: null });
      const result = await generateRiskReport('demo_wallet_1', 'simulation');
      setReport({ report: result, loading: false, error: null });
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : 'Failed to seed demo data');
      setSeeding(false);
    } finally {
      setSeeding(false);
    }
  }, []);

  const fetchInvestigations = useCallback(async () => {
    setInvestigations((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await getInvestigations('simulation');
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

  const graphEvidence = report.report?.graph_evidence ?? [];
  const structured = report.report?.structured_report;
  const aiReport = report.report?.ai_risk_report;
  const walletsFlagged = report.report?.cycle_participant_count ?? report.report?.wallets_flagged ?? 0;
  const diff = report.report?.investigation_diff;

  const isEmpty = report.report === null && !report.loading && !report.error && seeded;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <Header />

      <div className="container mx-auto px-4 py-6">
        <header className="mb-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-gradient-primary mb-2">Demo Investigation</h1>
              <p className="text-slate-600 text-lg max-w-2xl">
                Explore a pre-seeded circular-transfer cycle with synthetic demo data.
              </p>
            </div>
            <div className="flex items-center gap-3 px-6 py-4 rounded-2xl border border-white/50 bg-white/70 backdrop-blur-sm shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <span className="text-sm font-medium text-slate-600">SIMULATION MODE</span>
            </div>
          </div>
        </header>

        <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-8 mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center text-sm font-bold">
              1
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Seed Demo Data</h2>
          </div>
          <div className="max-w-2xl flex flex-col gap-4">
            <button
              type="button"
              disabled={seeding || seeded}
              onClick={handleSeedDemo}
              className="btn-primary px-8 py-3.5 rounded-xl text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5"
            >
              {seeding ? 'Seeding demo data...' : seeded ? 'Demo data seeded' : 'Seed Demo Data'}
            </button>
            {seedError && (
              <div className="p-4 rounded-xl border border-red-100 bg-red-50 text-red-700 text-sm shadow-sm">
                {seedError}
              </div>
            )}
            {seeded && (
              <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-800 text-sm shadow-sm flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Demo cycle created: demo_wallet_1 → demo_wallet_2 → demo_wallet_3 → demo_wallet_1
              </div>
            )}
          </div>
        </section>

        {report.loading && (
          <section className="flex justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="animate-spin absolute h-12 w-12 border-4 border-slate-200 rounded-full border-t-primary"></div>
                <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></div>
              </div>
              <div className="text-center">
                <p className="text-slate-600 text-sm font-medium">Generating demo risk report...</p>
              </div>
            </div>
          </section>
        )}

        {report.error && !report.report && (
          <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-8 mb-10">
            <div role="alert" className="p-4 rounded-xl border border-red-100 bg-red-50 text-red-700 text-sm shadow-sm">
              {report.error}
            </div>
            <button
              type="button"
              onClick={handleSeedDemo}
              disabled={seeding}
              className="mt-4 btn-primary px-6 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              Retry
            </button>
          </section>
        )}

        {isEmpty && seeded && (
          <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-12 mb-10 text-center">
            <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Demo data seeded</h3>
            <p className="text-slate-500 max-w-md mx-auto">
              Click "Generate Risk Report" to analyze the demo cycle.
            </p>
          </section>
        )}

        {report.report && (
          <>
            <section className="mb-10 rounded-2xl border border-white/50 bg-white/80 backdrop-blur-sm shadow-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
                  📊
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Investigation coverage</h2>
              </div>
              <p className="mb-4 break-all text-sm text-slate-600">
                <strong className="text-slate-900">Wallet:</strong> <span className="font-mono text-primary">demo_wallet_1</span>
                {' · '}<strong className="text-slate-900">Data source:</strong> Demo (simulation)
              </p>
              {report.report.coverage?.limitations.map((limitation) => (
                <p key={limitation} className="mt-2 text-sm text-amber-700 flex items-start gap-2">
                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  {limitation}
                </p>
              ))}
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
              <div className="lg:col-span-2">
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-slate-900">Risk Graph</h2>
                  </div>
                  <p className="text-sm text-slate-600 mb-6">
                    Circular-transfer path from seeded demo data. This demonstrates the graph
                    visualization with a synthetic 3-wallet cycle.
                  </p>
                  <RiskGraphVisualization evidence={graphEvidence} height={500} />
                  {graphEvidence.length === 0 && (
                    <div className="mt-6 p-6 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-sm text-center shadow-sm">
                      <svg className="w-8 h-8 mx-auto mb-2 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      No cycle was found in the available graph evidence.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-5">
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Summary
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {structured?.summary ?? 'A 3-wallet circular USDC transfer cycle was detected in the demo graph.'}
                  </p>
                </div>

                <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-5">
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary"></span> Cycle participants
                  </h3>
                  <p className="text-3xl font-bold text-slate-900 mb-1">{walletsFlagged}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Distinct wallet addresses in the demo cycle path.
                  </p>
                </div>
              </div>
            </section>

            {structured && (
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
                <div className="lg:col-span-2">
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h2 className="text-lg font-semibold text-slate-900">Findings &amp; Observations</h2>
                    </div>
                    <div className="space-y-3">
                      {Object.keys(structured.observations).length > 0 ? (
                        <>
                          <ul className="space-y-3">
                            {Object.entries(structured.observations as Record<string, unknown>).map(
                              ([key, value]) => (
                                <li key={key} className="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                  <span className="font-medium text-slate-900 w-20 text-sm">{key}:</span>
                                  <span className="text-slate-600 text-sm">{String(value)}</span>
                                </li>
                              )
                            )}
                          </ul>
                        </>
                      ) : (
                        <p className="text-sm text-slate-500 text-center py-4">No observations available.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-5">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span> Recommended Actions
                    </h3>
                    <ul className="space-y-2 text-sm text-slate-700">
                      {(structured.recommended_actions as string[] ?? []).map((action, i) => (
                        <li key={i} className="flex items-start gap-2 pl-4 relative">
                          <span className="absolute left-1 top-1 w-1.5 h-1.5 rounded-full bg-primary"></span>
                          {action}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-5">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span> Limitations
                    </h3>
                    <ul className="space-y-2 text-sm text-slate-700">
                      {(structured.limitations as string[] ?? []).map((lim, i) => (
                        <li key={i} className="flex items-start gap-2 pl-4 relative">
                          <span className="absolute left-1 top-1 w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          {lim}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )}

            {diff && (
              <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-8 mb-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center text-sm font-bold">
                    📈
                  </div>
                  <h2 className="text-xl font-semibold text-slate-900">Historical Comparison</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 rounded-2xl border border-white/50 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-2 h-2 rounded-full bg-primary"></div>
                      <h3 className="font-medium text-slate-900">Current Cycles</h3>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">
                      {diff.current_unique_cycles ?? 0}
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl border border-white/50 bg-gradient-to-br from-indigo-50 to-purple-50 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                      <h3 className="font-medium text-slate-900">Historical Cycles</h3>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">
                      {diff.historical_unique_cycles ?? 0}
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl border border-white/50 bg-gradient-to-br from-purple-50 to-pink-50 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                      <h3 className="font-medium text-slate-900">Recurring Cycles</h3>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">
                      {diff.recurring_cycles?.length ?? 0}
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl border border-white/50 bg-gradient-to-br from-pink-50 to-rose-50 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                      <h3 className="font-medium text-slate-900">New Cycles</h3>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">
                      {diff.new_cycles?.length ?? 0}
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl border border-white/50 bg-gradient-to-br from-slate-50 to-slate-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                      <h3 className="font-medium text-slate-900">Novelty Status</h3>
                    </div>
                    <p className="text-sm font-medium text-slate-700 capitalize mb-1">
                      {diff.novelty_status ?? 'unknown'}
                    </p>
                    {diff.uncomparable_historical_records != null &&
                      diff.uncomparable_historical_records > 0 && (
                      <p className="text-xs text-amber-700 mt-1">
                        Novelty status is uncertain because some historical records lack usable graph evidence.
                      </p>
                    )}
                  </div>
                  <div className="p-6 rounded-2xl border border-white/50 bg-gradient-to-br from-amber-50 to-amber-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                      <h3 className="font-medium text-slate-900">Data Limitations</h3>
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-xs text-amber-700">
                      {(diff.limitations as string[] ?? []).map((lim, i) => (
                        <li key={i}>{lim}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )}

            <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-8 mb-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-bold">
                  🤖
                </div>
                <h2 className="text-xl font-semibold text-slate-900">AI Risk Report</h2>
              </div>
              <p className="text-xs text-amber-700 mb-6 flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                This AI-generated report is explanatory and may contain errors or omissions. The structured
                comparison and evidence fields above are authoritative for counts and novelty status.
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap shadow-sm">
                {aiReport ?? 'No AI-generated report available (Groq API not configured for demo).'}
              </div>
            </section>
          </>
        )}

        <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-8">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">
                📋
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Recent Investigations</h2>
            </div>
            {investigations.loading ? (
              <span className="text-xs text-slate-500">Loading...</span>
            ) : investigations.error ? (
              <span className="text-xs text-red-600">{investigations.error}</span>
            ) : (
              <span className="text-xs text-slate-500">{investigations.count} investigation(s)</span>
            )}
          </div>
          {investigations.loading && !investigations.error && (
            <div className="h-32 flex items-center justify-center text-slate-500 text-sm">
              Loading investigations...
            </div>
          )}
          {investigations.error && !investigations.loading && (
            <div className="p-4 rounded-xl border border-red-100 bg-red-50 text-sm text-red-700 shadow-sm">
              {investigations.error}
            </div>
          )}
          {investigations.investigations.length > 0 && (
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full border border-slate-200 rounded-xl shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider text-xs px-6">ID</th>
                      <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider text-xs px-6">Finding</th>
                      <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider text-xs px-6">Confidence</th>
                      <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider text-xs px-6">Created</th>
                      <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider text-xs px-6">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {investigations.investigations.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 text-slate-900 font-mono text-xs truncate max-w-[140px] px-6">
                          {inv.id}
                        </td>
                        <td className="py-3 text-slate-700 truncate max-w-[240px] px-6">{inv.finding}</td>
                        <td className="py-3 text-slate-700 px-6">
                          {inv.confidence == null || inv.confidence == 0 ? (
                            <span className="text-slate-400">Not rated</span>
                          ) : (
                            <span className="font-medium">{inv.confidence.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="py-3 text-slate-700 px-6">
                          {new Date(inv.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-6">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                              inv.status === 'needs_review'
                                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
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
            </div>
          )}
          {investigations.investigations.length === 0 && !investigations.loading && !investigations.error && (
            <div className="p-8 text-center text-slate-500 text-sm">
              No recent investigations found. Seed demo data and generate a report to see investigations here.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
