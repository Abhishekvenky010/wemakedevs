import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import Icon, { type IconName } from "./Icon";

interface PageHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  icon: IconName;
  badge?: ReactNode;
  aside?: ReactNode;
  className?: string;
}

export default function PageHero({
  eyebrow,
  title,
  description,
  icon,
  badge,
  aside,
  className,
}: PageHeroProps) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-10 text-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.7)] sm:px-10 sm:py-12",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(99,102,241,0.38),transparent_38%),radial-gradient(circle_at_85%_20%,rgba(6,182,212,0.22),transparent_35%),radial-gradient(circle_at_55%_120%,rgba(139,92,246,0.28),transparent_45%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
      />

      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-inner backdrop-blur">
              <Icon name={icon} size={20} />
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-200">
              {eyebrow}
            </span>
            {badge}
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            {description}
          </p>
        </div>

        {aside && <div className="shrink-0">{aside}</div>}
      </div>
    </section>
  );
}
