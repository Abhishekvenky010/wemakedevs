import type { IngestWalletStats, RiskReport } from "@/lib/risk/api";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Alert from "@/components/ui/Alert";
import StatTile from "@/components/ui/StatTile";
import { SectionHeading } from "@/components/ui/SectionHeading";

interface ReportOverviewProps {
  report: RiskReport;
  ingestion?: IngestWalletStats | null;
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

export default function ReportOverview({
  report,
  ingestion,
}: ReportOverviewProps) {
  const transferEdges = report.transaction_graph?.length ?? 0;
  const participants =
    report.cycle_participant_count ?? report.wallets_flagged ?? 0;
  const incomplete = report.coverage?.incomplete ?? false;
  const depth =
    ingestion != null
      ? `${ingestion.max_depth_reached} / ${ingestion.max_depth}`
      : "—";

  return (
    <Card>
      <SectionHeading
        icon="layers"
        title="Investigation overview"
        description="Scope and evidence volume for this graph investigation."
        action={
          <Badge tone={report.data_source === "demo" ? "violet" : "indigo"} dot>
            {report.data_source === "demo" ? "Demo evidence" : "Real mainnet evidence"}
          </Badge>
        }
      />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Investigated wallet
          </dt>
          <dd className="mt-2 break-all font-mono text-xs leading-6 text-slate-800">
            {report.address}
          </dd>
        </div>
        <StatTile
          label="Depth reached"
          value={depth}
          hint="Reached / requested"
          icon="layers"
          tone="indigo"
        />
        <StatTile
          label="Cycle participants"
          value={participants}
          hint="Distinct wallets in cycle paths"
          icon="graph"
          tone={participants > 0 ? "rose" : "slate"}
        />
        <StatTile
          label="Transfer edges"
          value={transferEdges}
          hint="Persisted neighborhood edges"
          icon="database"
          tone="violet"
        />
        <StatTile
          label="Novelty"
          value={
            <span className="text-base capitalize text-slate-800">
              {humanize(report.investigation_diff?.novelty_status ?? "unknown")}
            </span>
          }
          hint="Compared with historical cases"
          icon="history"
          tone="cyan"
        />
        <StatTile
          label="Coverage"
          value={
            <span className={incomplete ? "text-amber-700" : "text-emerald-700"}>
              {incomplete ? "Incomplete" : "Complete"}
            </span>
          }
          hint={
            report.coverage == null
              ? "No coverage details supplied"
              : incomplete
                ? "Treat findings as bounded evidence"
                : "All requested evidence assessed"
          }
          icon="shield"
          tone={incomplete ? "amber" : "emerald"}
        />
        <StatTile
          label="Action"
          value={
            <span className="text-base capitalize text-slate-800">
              {humanize(report.action_taken)}
            </span>
          }
          hint="Deterministic rule outcome"
          icon="cpu"
          tone={report.action_taken === "flag_for_review" ? "rose" : "emerald"}
        />
      </dl>

      {report.coverage?.limitations && report.coverage.limitations.length > 0 && (
        <Alert tone="amber" className="mt-4">
          <p className="font-semibold">Coverage limitations</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {report.coverage.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </Alert>
      )}
    </Card>
  );
}
