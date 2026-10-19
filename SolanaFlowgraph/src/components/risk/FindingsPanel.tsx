import type { RiskReport } from "@/lib/risk/api";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { SectionHeading } from "@/components/ui/SectionHeading";

interface FindingsPanelProps {
  report: RiskReport;
}

function humanizeKey(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "None";
  }
  if (value != null && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value ?? "—");
}

export default function FindingsPanel({ report }: FindingsPanelProps) {
  const observations = Object.entries(report.structured_report?.observations ?? {});
  const actions = report.structured_report?.recommended_actions ?? [];
  const limitations = report.structured_report?.limitations ?? [];

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
      <Card>
        <SectionHeading
          icon="file"
          tone="emerald"
          title="Findings & observations"
          description="Structured counts produced from the current graph evidence."
        />

        {observations.length > 0 ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            {observations.map(([key, value]) => (
              <div
                key={key}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {humanizeKey(key)}
                </dt>
                <dd className="mt-1.5 text-sm font-semibold leading-6 text-slate-900">
                  {formatValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-500">
            No structured observations were returned.
          </p>
        )}
      </Card>

      <div className="space-y-6">
        <Card>
          <SectionHeading
            icon="arrow-right"
            tone="indigo"
            title="Recommended actions"
            className="mb-4"
          />
          {actions.length > 0 ? (
            <ol className="space-y-3">
              {actions.map((action, index) => (
                <li key={`${action}-${index}`} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-100">
                    {index + 1}
                  </span>
                  <span className="text-sm leading-6 text-slate-600">{action}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">No actions recommended.</p>
          )}
        </Card>

        <Card>
          <SectionHeading
            icon="alert"
            tone="amber"
            title="Limitations"
            className="mb-4"
          />
          {limitations.length > 0 ? (
            <ul className="space-y-3">
              {limitations.map((limitation, index) => (
                <li
                  key={`${limitation}-${index}`}
                  className="flex items-start gap-2.5 text-sm leading-6 text-slate-600"
                >
                  <Icon
                    name="info"
                    size={15}
                    className="mt-1 shrink-0 text-amber-500"
                  />
                  {limitation}
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Icon name="check" size={15} className="text-emerald-500" />
              No limitations recorded.
            </p>
          )}
        </Card>
      </div>
    </section>
  );
}
