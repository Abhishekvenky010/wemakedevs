import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent",
        className
      )}
      aria-hidden="true"
    />
  );
}

interface LoadingStateProps {
  label?: string;
  hint?: string;
  className?: string;
}

export default function LoadingState({
  label = "Loading",
  hint,
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200/80 bg-white/80 px-6 py-16 text-center shadow-sm backdrop-blur-sm",
        className
      )}
      aria-live="polite"
    >
      <div className="relative flex h-12 w-12 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-indigo-400/20" />
        <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-indigo-100 bg-white">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-r-transparent" />
        </span>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}
