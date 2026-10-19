export type Tone =
  | "indigo"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "cyan"
  | "slate";

export const toneStyles: Record<
  Tone,
  {
    icon: string;
    dot: string;
    badge: string;
    surface: string;
    text: string;
  }
> = {
  indigo: {
    icon: "bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100",
    dot: "bg-indigo-500",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
    surface: "border-indigo-100 bg-indigo-50/60",
    text: "text-indigo-700",
  },
  violet: {
    icon: "bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100",
    dot: "bg-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    surface: "border-violet-100 bg-violet-50/60",
    text: "text-violet-700",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100",
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    surface: "border-emerald-100 bg-emerald-50/60",
    text: "text-emerald-700",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100",
    dot: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    surface: "border-amber-100 bg-amber-50/60",
    text: "text-amber-700",
  },
  rose: {
    icon: "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100",
    dot: "bg-rose-500",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    surface: "border-rose-100 bg-rose-50/60",
    text: "text-rose-700",
  },
  cyan: {
    icon: "bg-cyan-50 text-cyan-600 ring-1 ring-inset ring-cyan-100",
    dot: "bg-cyan-500",
    badge: "border-cyan-200 bg-cyan-50 text-cyan-700",
    surface: "border-cyan-100 bg-cyan-50/60",
    text: "text-cyan-700",
  },
  slate: {
    icon: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
    dot: "bg-slate-500",
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    surface: "border-slate-200 bg-slate-50/60",
    text: "text-slate-700",
  },
};
