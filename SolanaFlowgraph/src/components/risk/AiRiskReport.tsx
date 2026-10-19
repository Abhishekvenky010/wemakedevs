"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Icon from "@/components/ui/Icon";
import { SectionHeading } from "@/components/ui/SectionHeading";

interface AiRiskReportProps {
  report: string | null;
}

export default function AiRiskReport({ report }: AiRiskReportProps) {
  const content = report?.trim() ?? "";

  return (
    <Card>
      <SectionHeading
        icon="sparkles"
        tone="violet"
        title="AI risk report"
        description="Narrative explanation generated from the graph evidence."
        action={
          <Badge tone="violet" dot>
            AI-generated narrative
          </Badge>
        }
      />

      <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-800">
        <Icon name="info" size={16} className="mt-0.5 shrink-0 text-amber-500" />
        <span>
          This narrative is explanatory and may contain errors or omissions. The
          structured comparison, evidence, and action fields above are
          authoritative for counts, novelty, and the decision.
        </span>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50/40 p-6 shadow-inner sm:p-8">
        {content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="mb-3 mt-8 border-b border-slate-200 pb-2 text-2xl font-bold tracking-tight text-slate-900 first:mt-0">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="mb-3 mt-8 border-b border-slate-200 pb-2 text-lg font-semibold tracking-tight text-slate-900 first:mt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mb-2 mt-6 text-base font-semibold text-slate-900">
                  {children}
                </h3>
              ),
              h4: ({ children }) => (
                <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-slate-700">
                  {children}
                </h4>
              ),
              p: ({ children }) => (
                <p className="mb-4 text-sm leading-7 text-slate-700 last:mb-0">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="mb-5 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-700 marker:text-indigo-500">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-5 list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-700 marker:font-medium marker:text-indigo-500">
                  {children}
                </ol>
              ),
              li: ({ children }) => <li className="pl-1">{children}</li>,
              strong: ({ children }) => (
                <strong className="font-semibold text-slate-900">
                  {children}
                </strong>
              ),
              em: ({ children }) => (
                <em className="italic text-slate-700">{children}</em>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-600"
                >
                  {children}
                </a>
              ),
              blockquote: ({ children }) => (
                <blockquote className="mb-5 border-l-4 border-amber-300 bg-amber-50/70 px-4 py-2 text-sm italic text-amber-900">
                  {children}
                </blockquote>
              ),
              hr: () => <hr className="my-8 border-slate-200" />,
              code: ({ className, children }) => {
                const isCodeBlock = Boolean(
                  className?.startsWith("language-")
                );
                return isCodeBlock ? (
                  <code
                    className={`${className ?? ""} font-mono text-xs text-slate-100`}
                  >
                    {children}
                  </code>
                ) : (
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800">
                    {children}
                  </code>
                );
              },
              pre: ({ children }) => (
                <pre className="mb-5 overflow-x-auto rounded-xl bg-slate-900 p-4 text-slate-100 shadow-sm">
                  {children}
                </pre>
              ),
              table: ({ children }) => (
                <div className="mb-5 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-slate-50">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border-t border-slate-100 px-4 py-2.5 text-slate-700">
                  {children}
                </td>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            <Icon name="file" size={18} className="text-slate-400" />
            No AI-generated report is available for this investigation.
          </div>
        )}
      </div>
    </Card>
  );
}
