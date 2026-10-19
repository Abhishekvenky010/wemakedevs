'use client';

import type { RiskReport } from '@/lib/risk/api';

interface RiskActionBannerProps {
  report: RiskReport | null;
}

export default function RiskActionBanner({
  report,
}: RiskActionBannerProps) {
  if (!report) {
    return null;
  }

  const flagged = report.action_taken === 'flag_for_review';

  return (
    <div className="rounded-xl border p-4 mb-4 shadow-sm">
      {flagged ? (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
              Flagged for Review
            </span>
            {report.case_id && (
              <span className="text-xs font-medium text-slate-700">
                Case {report.case_id.slice(0, 8)}…
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-slate-900 mb-1">
            {report.action_reason}
          </p>
          <p className="text-sm text-slate-600 mb-3">
            {report.evidence_summary}
          </p>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-500">
              Status: {report.investigation.status}
            </span>
            <span className="text-slate-500">
              Source: {report.data_source}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              No Action Taken
            </span>
          </div>
          <p className="text-sm text-slate-600">
            {report.evidence_summary}
          </p>
          {report.coverage?.incomplete && (
            <p className="text-sm text-amber-600 mt-2">
              Coverage incomplete: {report.coverage.limitations.join('; ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
