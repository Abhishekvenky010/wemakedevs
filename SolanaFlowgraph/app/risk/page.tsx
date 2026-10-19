"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import PageShell from "@/components/layout/PageShell";
import PageHero from "@/components/ui/PageHero";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Icon from "@/components/ui/Icon";
import InvestigationForm from "@/components/risk/InvestigationForm";
import InvestigationProgress from "@/components/risk/InvestigationProgress";
import IngestionResults from "@/components/risk/IngestionResults";
import RecentInvestigations from "@/components/risk/RecentInvestigations";
import ReportDashboard from "@/components/risk/ReportDashboard";
import {
  getInvestigations,
  getIngestionFailure,
  InvestigationDepth,
  investigateWallet,
  IngestWalletStats,
  Investigation,
  RiskReport,
} from "@/lib/risk/api";

interface ReportData {
  report: RiskReport | null;
  loading: boolean;
  error: string | null;
  errorStage: "ingestion" | "report" | null;
}

interface InvestigationsData {
  investigations: Investigation[];
  count: number;
  loading: boolean;
  error: string | null;
}

export default function RiskPage() {
  const [address, setAddress] = useState("");
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
    setInvestigations((previous) => ({
      ...previous,
      loading: true,
      error: null,
    }));
    try {
      const data = await getInvestigations("real");
      setInvestigations({
        investigations: data.investigations,
        count: data.count,
        loading: false,
        error: null,
      });
    } catch (error) {
      setInvestigations({
        investigations: [],
        count: 0,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load investigations",
      });
    }
  }, []);

  useEffect(() => {
    void fetchInvestigations();
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
      setValidationError("Enter a valid public Solana wallet address.");
      setFailedStage(0);
      setActiveStage(null);
      setReport({
        report: null,
        loading: false,
        error: "The wallet address is not a valid Solana public key.",
        errorStage: "ingestion",
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
      setCompletedStages(6);
      setActiveStage(null);
      setReport({
        report: result.report,
        loading: false,
        error: null,
        errorStage: null,
      });
      void fetchInvestigations();
    } catch (error) {
      if (!ingestionCompleted) {
        const failedIngestion = getIngestionFailure(error, trimmed, depth);
        if (failedIngestion) setIngestion(failedIngestion);
      }
      setFailedStage(ingestionCompleted ? 4 : 1);
      setActiveStage(null);
      setReport({
        report: null,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : ingestionCompleted
              ? "Risk report generation failed."
              : "Wallet ingestion failed.",
        errorStage: ingestionCompleted ? "report" : "ingestion",
      });
    }
  };

  const handleGenerate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runInvestigation();
  };

  const handleAddressChange = (value: string) => {
    setAddress(value);
    setValidationError(null);
    setReport((previous) =>
      previous.report
        ? previous
        : { ...previous, error: null, errorStage: null }
    );
  };

  const isEmpty =
    report.report === null && !report.loading && report.error === null;
  const showProgress =
    report.loading || completedStages > 0 || failedStage !== null;

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <PageHero
          eyebrow="Solana risk intelligence"
          title="Investigate wallet risk with graph evidence"
          description="Follow real Solana transfers into FalkorDB, detect circular-transfer patterns, and get an explainable, evidence-backed risk decision."
          icon="shield"
          badge={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Live mainnet evidence
            </span>
          }
          aside={
            <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 shadow-inner backdrop-blur">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-cyan-200">
                <Icon name="activity" size={19} />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Network
                </p>
                <p className="text-sm font-semibold text-white">Solana mainnet</p>
              </div>
            </div>
          }
        />

        <div className="mt-8 space-y-6">
          <InvestigationForm
            address={address}
            onAddressChange={handleAddressChange}
            depth={depth}
            onDepthChange={setDepth}
            loading={report.loading}
            validationError={validationError}
            error={report.error}
            errorStage={report.errorStage}
            onSubmit={handleGenerate}
            onRetry={runInvestigation}
          />

          {showProgress && (
            <InvestigationProgress
              completedStages={completedStages}
              activeStage={activeStage}
              failedStage={failedStage}
              ingestion={ingestion}
            />
          )}

          {ingestion && <IngestionResults ingestion={ingestion} />}

          {report.report && (
            <ReportDashboard report={report.report} ingestion={ingestion} />
          )}

          {isEmpty && (
            <Card>
              <EmptyState
                icon="graph"
                title="Ready to investigate"
                description="Enter a public wallet address to fetch real Solana transactions, persist the transfer graph, and generate a risk report."
              />
            </Card>
          )}

          <RecentInvestigations
            investigations={investigations.investigations}
            count={investigations.count}
            loading={investigations.loading}
            error={investigations.error}
          />
        </div>
      </div>
    </PageShell>
  );
}
