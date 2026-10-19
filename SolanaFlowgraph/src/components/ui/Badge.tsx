import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toneStyles, type Tone } from "./tone";

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}

export default function Badge({
  children,
  tone = "slate",
  dot = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        toneStyles[tone].badge,
        className
      )}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", toneStyles[tone].dot)} />
      )}
      {children}
    </span>
  );
}
