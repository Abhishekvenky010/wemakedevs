import type { RiskReport } from "@/lib/risk/api";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import StatTile from "@/components/ui/StatTile";
import Icon from "@/components/ui/Icon";
import { SectionHeading } from "@/components/ui/SectionHeading";

interface HistoricalComparisonProps {
  diff: RiskReport["investigation_diff"];
}

function humanize(value: string | undefined) {
  return (value ?? "unknown").replaceAll("_", " ");
}

export default function HistoricalComparison({
  diff,
}: HistoricalComparisonProps) {
  const hasLimitations = (diff.limitations?.length ?? 0) > 0;

  return (
    <Card>
      <SectionHeading
        icon="history"
        tone="violet"
        title="Historical comparison"
        description="How the current circular-transfer evidence compares with related cases."
        action={
          <Badge
            tone={
              diff.novelty_status === "novel"
                ? "violet"
                : diff.novelty_status === "recurring"
                  ? "amber"
                  : "slate"
            }
            dot
          >
            {humanize(diff.novelty_status)}
          </Badge>
        }
      />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Current cycles"
          value={diff.current_unique_cycles ?? 0}
          hint="Unique cycle structures now"
          icon="graph"
          tone="indigo"
        />
        <StatTile
          label="Historical cycles"
          value={diff.historical_unique_cycles ?? 0}
          hint="Seen in related cases"
          icon="history"
          tone="violet"
        />
        <StatTile
          label="Recurring cycles"
          value={diff.recurring_cycles?.length ?? 0}
          hint="Present in both periods"
          icon="refresh"
          tone="amber"
        />
        <StatTile
          label="New cycles"
          value={diff.new_cycles?.length ?? 0}
          hint="Not seen historically"
          icon="sparkles"
          tone="rose"
        />
      </dl>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Novelty status
          </p>
          <p className="mt-1.5 text-sm font-semibold capitalize text-slate-900">
            {humanize(diff.novelty_status)}
          </p>
          {(diff.uncomparable_historical_records ?? 0) > 0 && (
            <p className="mt-1 text-xs leading-5 text-amber-700">
              {diff.uncomparable_historical_records} historical record
              {diff.uncomparable_historical_records === 1 ? "" : "s"} lack usable
              graph evidence, so novelty is uncertain.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Comparison limitations
          </p>
          {hasLimitations ? (
            <ul className="mt-2 space-y-1.5">
              {diff.limitations.map((limitation, index) => (
                <li
                  key={`${limitation}-${index}`}
                  className="flex items-start gap-2 text-xs leading-5 text-slate-600"
                >
                  <Icon
                    name="info"
                    size={13}
                    className="mt-0.5 shrink-0 text-amber-500"
                  />
                  {limitation}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700">
              <Icon name="check" size={13} />
              No comparison limitations recorded.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
