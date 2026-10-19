"use client";

import type { InvestigationTraceStep } from "@/lib/risk/api";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Icon from "@/components/ui/Icon";
import { SectionHeading } from "@/components/ui/SectionHeading";

interface InvestigationTraceProps {
  trace: InvestigationTraceStep[];
}

const toolLabels: Record<string, string> = {
  trace_wallet: "Traced circular-transfer paths",
  find_related_cases: "Looked up related historical cases",
  compare_investigations: "Compared current vs. historical cycles",
};

const toolIcons: Record<string, "graph" | "history" | "layers"> = {
  trace_wallet: "graph",
  find_related_cases: "history",
  compare_investigations: "layers",
};

export default function InvestigationTrace({ trace }: InvestigationTraceProps) {
  return (
    <Card>
      <SectionHeading
        icon="cpu"
        tone="cyan"
        title="Investigation trace"
        description="MCP tool calls made by the agent. The structured evidence and action above remain authoritative."
        action={
          <Badge tone="cyan">
            {trace.length} tool call{trace.length === 1 ? "" : "s"}
          </Badge>
        }
      />

      {trace.length === 0 ? (
        <EmptyState
          icon="cpu"
          tone="cyan"
          title="No additional tool calls"
          description="The agent used the precomputed graph evidence for this report."
        />
      ) : (
        <ol className="space-y-3">
          {trace.map((step, index) => {
            const success = step.status === "success";
            return (
              <li
                key={`${step.round}-${step.tool}-${index}`}
                className="relative flex gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm">
                  <Icon name={toolIcons[step.tool] ?? "cpu"} size={16} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {step.tool}
                    </span>
                    <Badge tone={success ? "emerald" : "rose"} dot>
                      {step.status}
                    </Badge>
                    <span className="text-[11px] text-slate-400">
                      Round {step.round + 1}
                    </span>
                  </div>

                  <p className="mt-1.5 text-sm text-slate-600">
                    {toolLabels[step.tool] ?? "Called an approved graph tool"}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="break-all font-mono">
                      {step.arguments.address || "no address supplied"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Icon name="database" size={12} />
                      {step.arguments.data_source}
                    </span>
                  </div>

                  <details className="group mt-3">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800">
                      <Icon
                        name="chevron-right"
                        size={13}
                        className="transition-transform group-open:rotate-90"
                      />
                      Result summary
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 text-[11px] leading-5 text-slate-700">
                      {JSON.stringify(step.result_summary, null, 2)}
                    </pre>
                  </details>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
