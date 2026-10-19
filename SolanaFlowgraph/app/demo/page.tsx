"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell from "@/components/layout/PageShell";
import PageHero from "@/components/ui/PageHero";
import Card from "@/components/ui/Card";
import Alert from "@/components/ui/Alert";
import EmptyState from "@/components/ui/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import Icon from "@/components/ui/Icon";
import DemoLauncher from "@/components/demo/DemoLauncher";
import RecentInvestigations from "@/components/risk/RecentInvestigations";
import ReportDashboard from "@/components/risk/ReportDashboard";
import {
  generateRiskReport,
  getInvestigations,
  Investigation,
  RiskReport,
  seedDemo,
} from "@/lib/risk/api";

export default function DemoPage() {
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [report, setReport] = useState<{
    report: RiskReport | null;
    loading: boolean;
    error: string | null;
  }>({
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

  const fetchInvestigations = useCallback(async () => {
    setInvestigations((previous) => ({
      ...previous,
      loading: true,
      error: null,
    }));
    try {
      const data = await getInvestigations("simulation");
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

  const handleSeedDemo = useCallback(async () => {
    setSeeding(true);
    setSeedError(null);
    try {
      await seedDemo();
      setSeeded(true);
      setReport({ report: null, loading: true, error: null });
      const result = await generateRiskReport("demo_wallet_1", "simulation");
      setReport({ report: result, loading: false, error: null });
      void fetchInvestigations();
    } catch (error) {
      setSeedError(
        error instanceof Error ? error.message : "Failed to seed demo data"
      );
      setReport((previous) => ({
        ...previous,
        loading: false,
        error:
          error instanceof Error ? error.message : "Failed to generate report",
      }));
    } finally {
      setSeeding(false);
    }
  }, [fetchInvestigations]);

  useEffect(() => {
    void fetchInvestigations();
  }, [fetchInvestigations]);

  const isEmpty =
    seeded &&
    report.report === null &&
    !report.loading &&
    report.error === null;

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <PageHero
          eyebrow="Simulation lab"
          title="Explore a seeded circular-transfer cycle"
          description="Run the full investigation pipeline against deterministic synthetic evidence. Demo graphs stay isolated from real mainnet data."
          icon="sparkles"
          badge={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/20 bg-violet-400/10 px-2.5 py-1 text-[11px] font-medium text-violet-200">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              Synthetic evidence only
            </span>
          }
          aside={
            <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 shadow-inner backdrop-blur">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-violet-200">
                <Icon name="layers" size={19} />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Mode
                </p>
                <p className="text-sm font-semibold text-white">3-wallet loop</p>
              </div>
            </div>
          }
        />

        <div className="mt-8 space-y-6">
          <DemoLauncher
            seeding={seeding}
            seeded={seeded}
            error={seedError}
            onSeed={handleSeedDemo}
          />

          {report.loading && (
            <LoadingState
              label="Generating demo risk report…"
              hint="Seeding evidence, tracing cycles, and running the MCP investigation."
            />
          )}

          {report.error && !report.loading && (
            <Alert tone="rose" title="Demo report failed">
              <p>{report.error}</p>
              <button
                type="button"
                onClick={handleSeedDemo}
                disabled={seeding}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 underline decoration-rose-300 underline-offset-2 hover:decoration-rose-600 disabled:opacity-50"
              >
                <Icon name="refresh" size={13} />
                Retry demo
              </button>
            </Alert>
          )}

          {isEmpty && (
            <Card>
              <EmptyState
                icon="sparkles"
                tone="violet"
                title="Demo data seeded"
                description="The cycle is ready. Generate the report to inspect the graph evidence, action rule, and AI narrative."
              />
            </Card>
          )}

          {report.report && (
            <ReportDashboard report={report.report} mode="demo" />
          )}

          <RecentInvestigations
            investigations={investigations.investigations}
            count={investigations.count}
            loading={investigations.loading}
            error={investigations.error}
            emptyMessage="Seed demo data and generate a report to see investigations here."
          />
        </div>
      </div>
    </PageShell>
  );
}
