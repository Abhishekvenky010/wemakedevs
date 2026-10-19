"use client";

import type { RiskReport } from "@/lib/risk/api";
import { cn } from "@/lib/cn";
import Icon from "@/components/ui/Icon";
import Badge from "@/components/ui/Badge";

interface RiskActionBannerProps {
  report: RiskReport | null;
}

export default function RiskActionBanner({ report }: RiskActionBannerProps) {
  if (!report) return null;

  const flagged = report.action_taken === "flag_for_review";

  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-3xl border p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8",
        flagged
          ? "border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-orange-50"
          : "border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-cyan-50"
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl",
          flagged ? "bg-rose-200/40" : "bg-emerald-200/40"
        )}
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
        <span
          className={cn(
            "inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border shadow-sm",
            flagged
              ? "border-rose-200 bg-white text-rose-600"
              : "border-emerald-200 bg-white text-emerald-600"
          )}
        >
          <Icon name={flagged ? "alert" : "shield"} size={25} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={flagged ? "rose" : "emerald"} dot>
              {flagged ? "Flagged for review" : "No action taken"}
            </Badge>
            {report.case_id && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 font-mono text-[11px] text-slate-600">
                <Icon name="file" size={12} />
                Case {report.case_id.slice(0, 8)}
              </span>
            )}
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
              Deterministic outcome
            </span>
          </div>

          <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            {flagged
              ? "Circular-transfer pattern flagged"
              : "No qualifying circular-transfer pattern"}
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            {flagged ? report.action_reason : report.evidence_summary}
          </p>

          {flagged && (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              {report.evidence_summary}
            </p>
          )}

          {!flagged && report.coverage?.incomplete && (
            <p className="mt-2 text-sm leading-6 text-amber-700">
              Coverage incomplete: {report.coverage.limitations.join("; ")}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-900/5 pt-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="activity" size={13} />
              Status: {report.investigation.status.replaceAll("_", " ")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="database" size={13} />
              Source: {report.data_source}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="cpu" size={13} />
              Rule: graph evidence, not the AI narrative
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
