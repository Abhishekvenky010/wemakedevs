import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import Icon, { type IconName } from "./Icon";
import { toneStyles, type Tone } from "./tone";

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: IconName;
  tone?: Tone;
  className?: string;
}

export default function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "slate",
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-white/80 p-4",
        toneStyles[tone].surface,
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          {label}
        </dt>
        {icon && <Icon name={icon} size={15} className={toneStyles[tone].text} />}
      </div>
      <dd className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
        {value}
      </dd>
      {hint && <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>}
    </div>
  );
}
