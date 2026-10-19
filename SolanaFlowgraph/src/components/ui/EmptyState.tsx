import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import Icon, { type IconName } from "./Icon";
import { toneStyles, type Tone } from "./tone";

interface EmptyStateProps {
  icon?: IconName;
  tone?: Tone;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon = "info",
  tone = "slate",
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center",
        className
      )}
    >
      <span
        className={cn(
          "mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl",
          toneStyles[tone].icon
        )}
      >
        <Icon name={icon} size={22} />
      </span>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-500">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
