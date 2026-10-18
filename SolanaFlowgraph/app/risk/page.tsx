'use client';

import { useCallback, useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import Header from '../components/Header';
import RiskGraphVisualization from '@/components/risk/RiskGraphVisualization';
import {
  getInvestigations,
  getIngestionFailure,
  InvestigationDepth,
  investigateWallet,
  IngestWalletStats,
  Investigation,
  RiskReport,
} from '@/lib/risk/api';

const investigationStages = [
  'Validating wallet',
  'Fetching and parsing transactions',
  'Expanding counterparties to the selected depth',
  'Saving transfers to FalkorDB',
  'Investigating graph evidence through the AI/MCP pipeline',
  'Generating the report',
];
const depthOptions = [0, 1, 2, 3] as const;

interface ReportData {
  report: RiskReport | null;
  loading: boolean;
  error: string | null;
  errorStage: 'ingestion' | 'report' | null;
}

interface InvestigationsData {
  investigations: Investigation[];
  count: number;
  loading: boolean;
  error: string | null;
}

export default function RiskPage() {
  const [address, setAddress] = useState('');
  const [depth, setDepth] = useState<InvestigationDepth>(2);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [ingestion, setIngestion] = useState<IngestWalletStats | null>(null);
  const [completedStages, setCompletedStages] = useState(0);
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const [failedStage, setFailedStage] = useState<number | null>(null);
  const [report, setReport] = useState<ReportData>({
    report: null,
    loading: false,
    error: null,
    errorStage: null,
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
      const data = await getInvestigations('real');
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

  const runInvestigation = async () => {
    const trimmed = address.trim();
    setValidationError(null);
    setIngestion(null);
    setCompletedStages(0);
    setActiveStage(0);
    setFailedStage(null);
    setReport({ report: null, loading: true, error: null, errorStage: null });

    try {
      new PublicKey(trimmed);
    } catch {
      setValidationError('Enter a valid public Solana wallet address.');
      setFailedStage(0);
      setActiveStage(null);
      setReport({
        report: null,
        loading: false,
        error: 'The wallet address is not a valid Solana public key.',
        errorStage: 'ingestion',
      });
      return;
    }

    setCompletedStages(1);
    setActiveStage(1);
    let ingestionCompleted = false;
    try {
      const result = await investigateWallet(trimmed, depth, (ingestionResult) => {
        ingestionCompleted = true;
        setIngestion(ingestionResult);
        setCompletedStages(ingestionResult.incomplete ? 1 : 4);
        setActiveStage(4);
      });
      setCompletedStages(investigationStages.length);
      setActiveStage(null);
      setReport({
        report: result.report,
        loading: false,
        error: null,
        errorStage: null,
      });
    } catch (err) {
      if (!ingestionCompleted) {
        const failedIngestion = getIngestionFailure(err, trimmed, depth);
        if (failedIngestion) setIngestion(failedIngestion);
      }
      setFailedStage(ingestionCompleted ? 4 : 1);
      setActiveStage(null);
      setReport({
        report: null,
        loading: false,
        error: err instanceof Error
          ? err.message
          : ingestionCompleted ? 'Risk report generation failed.' : 'Wallet ingestion failed.',
        errorStage: ingestionCompleted ? 'report' : 'ingestion',
      });
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    await runInvestigation();
  };

  const graphEvidence = report.report?.graph_evidence ?? [];
  const diff = report.report?.investigation_diff;
  const structured = report.report?.structured_report;
  const aiReport = report.report?.ai_risk_report;
  const walletsFlagged = report.report?.cycle_participant_count ?? report.report?.wallets_flagged ?? 0;

  const isEmpty = report.report === null && !report.loading && !report.error;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <Header />

      <div className="container mx-auto px-4 py-6">
        <header className="mb-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-gradient-primary mb-2">DeFi Risk Investigation</h1>
              <p className="text-slate-600 text-lg max-w-2xl">
                Analyze circular-transfer risk patterns on Solana. Graph patterns are risk signals,
                not proof of wrongdoing.
              </p>
            </div>
            <div className="flex items-center gap-3 px-6 py-4 rounded-2xl border border-white/50 bg-white/70 backdrop-blur-sm shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-slate-600">SOLANA NETWORK</span>
            </div>
          </div>
        </header>

        <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-8 mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center text-sm font-bold">
              1
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Investigate a Wallet</h2>
          </div>
          <form onSubmit={handleGenerate} className="max-w-2xl flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label htmlFor="wallet-address" className="text-sm font-semibold text-slate-700">
                  Public Solana wallet address
                </label>
                <span className="text-xs text-primary font-medium">REQUIRED</span>
              </div>
              <input
                id="wallet-address"
                type="text"
                required
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setValidationError(null);
                }}
                placeholder="Enter Solana wallet address..."
                autoComplete="off"
                spellCheck={false}
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={report.loading}
                aria-describedby="wallet-address-help"
              />
              <p id="wallet-address-help" className="mt-2 text-xs text-slate-500">
                Public addresses only. Never enter a private key or seed phrase.
              </p>
              {validationError && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  {validationError}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label htmlFor="investigation-depth" className="text-sm font-semibold text-slate-700">
                  Investigation depth
                </label>
                <span className="text-xs text-secondary font-medium">OPTIONAL</span>
              </div>
              <select
                id="investigation-depth"
                value={depth}
                onChange={(e) => {
                  const selected = depthOptions.find((option) => option.toString() === e.target.value);
                  if (selected !== undefined) setDepth(selected);
                }}
                disabled={report.loading}
                className="w-full sm:w-64 px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value={0}>0 — Initial wallet only</option>
                <option value={1}>1 — Direct counterparties</option>
                <option value={2}>2 — Expand one additional level</option>
                <option value={3}>3 — Expand one further level</option>
              </select>
              <ul className="mt-3 space-y-1 text-xs text-slate-500">
                <li><span className="font-medium text-slate-900">0:</span> initial wallet only</li>
                <li><span className="font-medium text-slate-900">1:</span> initial wallet and directly discovered counterparties</li>
                <li><span className="font-medium text-slate-900">2:</span> expand one additional level</li>
                <li><span className="font-medium text-slate-900">3:</span> expand one further level</li>
              </ul>
            </div>
            <button
              type="submit"
              disabled={report.loading || !address.trim()}
              className="btn-primary px-8 py-3.5 rounded-xl text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5"
            >
              {report.loading ? 'Investigation in progress...' : 'Investigate Wallet'}
            </button>
            {report.error && (
              <div role="alert" className="p-4 rounded-xl border border-red-100 bg-red-50 text-red-700 text-sm shadow-sm">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="font-medium">
                      {report.errorStage === 'ingestion' ? 'Wallet ingestion failed: ' : 'Risk report generation failed: '}
                      {report.error}
                    </p>
                    <button
                      type="button"
                      onClick={runInvestigation}
                      disabled={report.loading || !address.trim()}
                      className="mt-2 font-medium text-primary underline disabled:opacity-50"
                    >
                      Retry investigation
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>
        </section>

        {(report.loading || completedStages > 0 || failedStage !== null) && (
          <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-8 mb-10" aria-live="polite">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center text-sm font-bold">
                2
              </div>
              <h2 className="text-xl font-semibold text-slate-900">Investigation progress</h2>
            </div>
            <ol className="space-y-3">
              {investigationStages.map((stage, index) => {
                const complete = index < completedStages;
                const active =
                  index === activeStage ||
                  (activeStage === 1 && index >= 2 && index <= 3) ||
                  (activeStage === 4 && index === 5);
                const partial =
                  ingestion?.incomplete === true &&
                  ingestion?.status === 'success' &&
                  index >= 1 &&
                  index <= 3;
                const failed = index === failedStage;
                return (
                  <li key={stage} className="flex items-start gap-4 text-sm">
                    <div className={`relative mt-1 shrink-0 ${
                      failed ? 'text-red-500' :
                      partial ? 'text-amber-500' :
                      complete ? 'text-green-500' :
                      active ? 'text-primary' : 'text-slate-300'
                    }`}>
                      <div className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-full text-xs font-bold border ${
                        failed ? 'border-red-200 bg-red-50 text-red-600' :
                        partial ? 'border-amber-200 bg-amber-50 text-amber-600' :
                        complete ? 'border-green-200 bg-green-50 text-green-600' :
                        active ? 'border-primary bg-primary text-white ring-4 ring-primary/20' : 'border-slate-200 bg-slate-50 text-slate-400'
                      } shadow-sm`}
                      >
                        {failed ? '!' : partial ? '!' : complete ? '✓' : active ? '…' : index + 1}
                      </div>
                      {!complete && !failed && (
                        <div className="absolute left-2.5 top-7 w-px h-4 bg-slate-200" />
                      )}
                    </div>
                    <div className={failed ? 'text-red-600' : partial ? 'text-amber-700' : complete ? 'text-slate-700' : active ? 'font-medium text-primary' : 'text-slate-500'}>
                      {stage}{active ? ' — in progress' : failed ? ' — failed' : partial ? ' — incomplete coverage' : ''}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {isEmpty && (
          <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-12 mb-10 text-center">
            <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Ready to investigate</h3>
            <p className="text-slate-500 max-w-md mx-auto">
              Enter a public wallet address to fetch real Solana transactions and generate a risk report.
            </p>
          </section>
        )}

        {report.loading && !report.report && !report.error && (
          <section className="flex justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="animate-spin absolute h-12 w-12 border-4 border-slate-200 rounded-full border-t-primary"></div>
                <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></div>
              </div>
              <div className="text-center">
                <p className="text-slate-600 text-sm font-medium">
                  {activeStage !== null
                    ? investigationStages[activeStage]
                    : 'Investigation in progress...'}
                </p>
              </div>
            </div>
          </section>
        )}

        {ingestion && (
          <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-8 mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center text-sm font-bold">
                3
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                {ingestion.status === 'error' ? 'Partial ingestion before failure' : 'Ingestion results'}
              </h2>
            </div>
            <p className="mb-6 break-all text-sm text-slate-600">
              <strong className="text-slate-900">Submitted wallet:</strong> <span className="font-mono text-primary">{ingestion.address}</span>
            </p>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-xs text-slate-500 uppercase tracking-wider mb-1">Requested depth</dt>
                <dd className="font-semibold text-slate-900">{ingestion.max_depth}</dd>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-xs text-slate-500 uppercase tracking-wider mb-1">Actual depth reached</dt>
                <dd className="font-semibold text-slate-900">{ingestion.max_depth_reached}</dd>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-xs text-slate-500 uppercase tracking-wider mb-1">Wallets visited</dt>
                <dd className="font-semibold text-slate-900">{ingestion.wallets_visited}</dd>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-xs text-slate-500 uppercase tracking-wider mb-1">Signatures fetched</dt>
                <dd className="font-semibold text-slate-900">{ingestion.signatures_fetched}</dd>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-xs text-slate-500 uppercase tracking-wider mb-1">Transactions fetched</dt>
                <dd className="font-semibold text-slate-900">{ingestion.transactions_fetched}</dd>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-xs text-slate-500 uppercase tracking-wider mb-1">Transactions processed</dt>
                <dd className="font-semibold text-slate-900">{ingestion.transactions_processed}</dd>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-xs text-slate-500 uppercase tracking-wider mb-1">Transfers persisted</dt>
                <dd className="font-semibold text-slate-900">{ingestion.transfers_persisted}</dd>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-xs text-slate-500 uppercase tracking-wider mb-1">Duplicates skipped</dt>
                <dd className="font-semibold text-slate-900">{ingestion.duplicates_skipped}</dd>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-xs text-slate-500 uppercase tracking-wider mb-1">Failed transactions</dt>
                <dd className="font-semibold text-slate-900">{ingestion.failed_transactions}</dd>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-xs text-slate-500 uppercase tracking-wider mb-1">Persistence errors</dt>
                <dd className="font-semibold text-slate-900">{ingestion.persistence_errors}</dd>
              </div>
            </dl>
            {ingestion.rate_limited && (
              <p role="status" className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
                Solana RPC rate limiting occurred. Some transaction evidence could not be fetched.
              </p>
            )}
            {ingestion.signatures_fetched === 0 && (
              <p role="status" className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
                No transaction signatures were returned for this wallet at the requested depth.
              </p>
            )}
            {ingestion.incomplete && (
              <p role="status" className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
                Ingestion was incomplete. The report is limited to evidence successfully fetched and saved;
                absence of a detected pattern does not establish that the wallet is safe.
              </p>
            )}
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
                <strong className="text-slate-900">Wallet:</strong> <span className="font-mono text-primary">{ingestion?.address}</span>
                {' · '}<strong className="text-slate-900">Requested depth:</strong> {ingestion?.max_depth}
                {' · '}<strong className="text-slate-900">Reached:</strong> {ingestion?.max_depth_reached}
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
                    Circular-transfer paths detected from FalkorDB evidence. Link thickness shows how
                    often an edge appears across returned paths (path recurrence), not transaction volume.
                  </p>
                  <RiskGraphVisualization evidence={graphEvidence} height={500} />
                  {graphEvidence.length === 0 && (
                    <div className="mt-6 p-6 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-sm text-center shadow-sm">
                      <svg className="w-8 h-8 mx-auto mb-2 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      No cycle was found in the available graph evidence. This does not establish that the wallet is safe.
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
                    {structured?.summary ?? 'No summary available.'}
                  </p>
                </div>

                <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-5">
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary"></span> Cycle participants
                  </h3>
                  <p className="text-3xl font-bold text-slate-900 mb-1">{walletsFlagged}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Distinct wallet addresses appearing in returned cycle paths for this address.
                    Not a count of confirmed malicious wallets.
                  </p>
                </div>
              </div>
            </section>

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
                    {(structured?.observations && Object.keys(structured.observations).length > 0) ? (
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
                    {(structured?.recommended_actions as string[] ?? []).map((action, i) => (
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
                    {(structured?.limitations as string[] ?? []).map((lim, i) => (
                      <li key={i} className="flex items-start gap-2 pl-4 relative">
                        <span className="absolute left-1 top-1 w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        {lim}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

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
                    {diff?.current_unique_cycles ?? 0}
                  </p>
                </div>
                <div className="p-6 rounded-2xl border border-white/50 bg-gradient-to-br from-indigo-50 to-purple-50 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                    <h3 className="font-medium text-slate-900">Historical Cycles</h3>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">
                    {diff?.historical_unique_cycles ?? 0}
                  </p>
                </div>
                <div className="p-6 rounded-2xl border border-white/50 bg-gradient-to-br from-purple-50 to-pink-50 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                    <h3 className="font-medium text-slate-900">Recurring Cycles</h3>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">
                    {diff?.recurring_cycles?.length ?? 0}
                  </p>
                </div>
                <div className="p-6 rounded-2xl border border-white/50 bg-gradient-to-br from-pink-50 to-rose-50 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                    <h3 className="font-medium text-slate-900">New Cycles</h3>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">
                    {diff?.new_cycles?.length ?? 0}
                  </p>
                </div>
                <div className="p-6 rounded-2xl border border-white/50 bg-gradient-to-br from-slate-50 to-slate-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                    <h3 className="font-medium text-slate-900">Novelty Status</h3>
                  </div>
                  <p className="text-sm font-medium text-slate-700 capitalize mb-1">
                    {diff?.novelty_status ?? 'unknown'}
                  </p>
                  {diff?.uncomparable_historical_records != null &&
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
                    {(diff?.limitations as string[] ?? []).map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

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
                {aiReport ?? 'No AI-generated report available.'}
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
              No recent investigations found.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
