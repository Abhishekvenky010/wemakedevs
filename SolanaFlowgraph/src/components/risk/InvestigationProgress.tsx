import type { IngestWalletStats } from "@/lib/risk/api";
import { cn } from "@/lib/cn";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Icon from "@/components/ui/Icon";
import { SectionHeading } from "@/components/ui/SectionHeading";

export const INVESTIGATION_STAGES = [
  "Validating wallet",
  "Fetching and parsing transactions",
  "Expanding counterparties to the selected depth",
  "Saving transfers to FalkorDB",
  "Investigating graph evidence through the AI/MCP pipeline",
  "Generating the report",
];

interface InvestigationProgressProps {
  completedStages: number;
  activeStage: number | null;
  failedStage: number | null;
  ingestion: IngestWalletStats | null;
  className?: string;
}

export default function InvestigationProgress({
  completedStages,
  activeStage,
  failedStage,
  ingestion,
  className,
}: InvestigationProgressProps) {
  const finished =
    completedStages >= INVESTIGATION_STAGES.length && failedStage === null;
  const needsAttention =
    failedStage !== null || (ingestion?.incomplete === true && !finished);

  return (
    <Card className={className} aria-live="polite">
      <SectionHeading
        icon="activity"
        tone={failedStage !== null ? "rose" : "indigo"}
        title="Investigation progress"
        description="Live status for ingestion, graph persistence, and report generation."
        action={
          <Badge
            tone={
              failedStage !== null
                ? "rose"
                : needsAttention
                  ? "amber"
                  : finished
                    ? "emerald"
                    : "indigo"
            }
            dot
          >
            {failedStage !== null
              ? "Failed"
              : needsAttention
                ? "Attention needed"
                : finished
                  ? "Complete"
                  : "In progress"}
          </Badge>
        }
      />

      <ol className="space-y-1">
        {INVESTIGATION_STAGES.map((stage, index) => {
          const complete = index < completedStages;
          const active =
            index === activeStage ||
            (activeStage === 1 && index >= 2 && index <= 3) ||
            (activeStage === 4 && index === 5);
          const partial =
            ingestion?.incomplete === true &&
            ingestion?.status === "success" &&
            index >= 1 &&
            index <= 3;
          const failed = index === failedStage;
          const last = index === INVESTIGATION_STAGES.length - 1;

          return (
            <li key={stage} className="relative flex gap-3 pb-4 last:pb-0">
              {!last && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[15px] top-8 h-[calc(100%-16px)] w-px",
                    complete ? "bg-emerald-200" : "bg-slate-200"
                  )}
                />
              )}

              <span
                className={cn(
                  "relative z-10 mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold shadow-sm",
                  failed
                    ? "border-rose-200 bg-rose-50 text-rose-600"
                    : partial
                      ? "border-amber-200 bg-amber-50 text-amber-600"
                      : complete
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                        : active
                          ? "border-indigo-500 bg-indigo-600 text-white ring-4 ring-indigo-500/15"
                          : "border-slate-200 bg-slate-50 text-slate-400"
                )}
              >
                {failed ? (
                  <Icon name="alert" size={14} />
                ) : partial ? (
                  <Icon name="alert" size={14} />
                ) : complete ? (
                  <Icon name="check" size={14} />
                ) : active ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-r-transparent" />
                ) : (
                  index + 1
                )}
              </span>

              <div className="min-w-0 pt-1">
                <p
                  className={cn(
                    "text-sm leading-5",
                    failed
                      ? "font-medium text-rose-700"
                      : partial
                        ? "font-medium text-amber-700"
                        : complete
                          ? "text-slate-700"
                          : active
                            ? "font-semibold text-indigo-700"
                            : "text-slate-400"
                  )}
                >
                  {stage}
                </p>
                {(active || failed || partial) && (
                  <p
                    className={cn(
                      "mt-0.5 text-[11px]",
                      failed
                        ? "text-rose-500"
                        : partial
                          ? "text-amber-600"
                          : "text-indigo-500"
                    )}
                  >
                    {failed
                      ? "Stopped here"
                      : partial
                        ? "Coverage limited"
                        : "Working…"}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
