import type { IngestWalletStats, RiskReport } from "@/lib/risk/api";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Icon from "@/components/ui/Icon";
import { SectionHeading } from "@/components/ui/SectionHeading";
import AiRiskReport from "./AiRiskReport";
import FindingsPanel from "./FindingsPanel";
import HistoricalComparison from "./HistoricalComparison";
import InvestigationTrace from "./InvestigationTrace";
import ReportOverview from "./ReportOverview";
import RiskActionBanner from "./RiskActionBanner";
import RiskGraphCard from "./RiskGraphCard";

interface ReportDashboardProps {
  report: RiskReport;
  ingestion?: IngestWalletStats | null;
  mode?: "real" | "demo";
}

export default function ReportDashboard({
  report,
  ingestion,
  mode = "real",
}: ReportDashboardProps) {
  const evidence = report.graph_evidence ?? [];
  const transactions = report.transaction_graph ?? [];
  const structured = report.structured_report;
  const participants =
    report.cycle_participant_count ?? report.wallets_flagged ?? 0;

  return (
    <div className="space-y-6">
      <RiskActionBanner report={report} />
      <ReportOverview report={report} ingestion={ingestion} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.65fr)]">
        <RiskGraphCard
          evidence={evidence}
          transactions={transactions}
          rootAddress={report.address}
          mode={mode}
        />

        <div className="space-y-6">
          <Card>
            <SectionHeading
              icon="file"
              tone="emerald"
              title="Summary"
              className="mb-4"
            />
            <p className="text-sm leading-7 text-slate-600">
              {structured?.summary ?? "No summary available."}
            </p>
          </Card>

          <Card>
            <SectionHeading
              icon="layers"
              tone="violet"
              title="Evidence at a glance"
              className="mb-4"
            />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  Cycle paths
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {evidence.length}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                  Persisted edges
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {transactions.length}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                  Cycle participants
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {participants}
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="rose" dot>
                Cycle
              </Badge>
              <Badge tone="slate" dot>
                Transfer
              </Badge>
              <Badge tone="indigo" dot>
                Investigated wallet
              </Badge>
            </div>
          </Card>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-indigo-800">
              <Icon name="shield" size={14} />
              Interpretation
            </p>
            <p className="mt-1.5 text-xs leading-5 text-indigo-700/80">
              A circular-transfer pattern is a risk signal, not proof of
              wrongdoing. The deterministic action rule uses cycle evidence only;
              the AI narrative is explanatory.
            </p>
          </div>
        </div>
      </section>

      <FindingsPanel report={report} />
      {report.investigation_diff && (
        <HistoricalComparison diff={report.investigation_diff} />
      )}
      <InvestigationTrace trace={report.investigation_trace ?? []} />
      <AiRiskReport report={report.ai_risk_report ?? null} />
    </div>
  );
}
