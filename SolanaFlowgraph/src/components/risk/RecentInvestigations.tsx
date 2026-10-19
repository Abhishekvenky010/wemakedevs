import type { Investigation } from "@/lib/risk/api";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Alert from "@/components/ui/Alert";
import { SectionHeading } from "@/components/ui/SectionHeading";

interface RecentInvestigationsProps {
  investigations: Investigation[];
  count: number;
  loading: boolean;
  error: string | null;
  emptyMessage?: string;
}

function statusTone(status: string) {
  if (status === "needs_review") return "amber" as const;
  if (status === "no_action") return "emerald" as const;
  return "slate" as const;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default function RecentInvestigations({
  investigations,
  count,
  loading,
  error,
  emptyMessage = "No recent investigations found.",
}: RecentInvestigationsProps) {
  return (
    <Card>
      <SectionHeading
        icon="history"
        tone="slate"
        title="Recent investigations"
        description="Cases created or updated by previous graph investigations."
        action={
          !loading && !error ? (
            <Badge tone="slate">
              {count} {count === 1 ? "case" : "cases"}
            </Badge>
          ) : null
        }
      />

      {loading && (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/60 py-10 text-sm text-slate-500">
          Loading investigations…
        </div>
      )}

      {!loading && error && <Alert tone="rose">{error}</Alert>}

      {!loading && !error && investigations.length === 0 && (
        <EmptyState
          icon="file"
          title="No investigations yet"
          description={emptyMessage}
        />
      )}

      {!loading && !error && investigations.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                {["Case", "Finding", "Confidence", "Created", "Status"].map(
                  (heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
                    >
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {investigations.map((investigation) => (
                <tr
                  key={investigation.id}
                  className="transition-colors hover:bg-slate-50/70"
                >
                  <td className="max-w-[160px] truncate px-4 py-3.5 font-mono text-xs text-slate-700">
                    {investigation.id}
                  </td>
                  <td className="max-w-[280px] truncate px-4 py-3.5 text-slate-700">
                    {investigation.finding}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    {investigation.confidence == null ||
                    investigation.confidence === 0 ? (
                      <span className="text-xs text-slate-400">Not rated</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{
                              width: `${Math.round(
                                Math.min(1, investigation.confidence) * 100
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-medium text-slate-700">
                          {investigation.confidence.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-500">
                    {new Date(investigation.created_at).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <Badge tone={statusTone(investigation.status)} dot>
                      {statusLabel(investigation.status)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
