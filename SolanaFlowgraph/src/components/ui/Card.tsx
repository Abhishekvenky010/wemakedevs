import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export default function Card({
  className,
  padded = true,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-slate-200/80 bg-white/90 shadow-[0_1px_1px_rgba(15,23,42,0.03),0_18px_45px_-28px_rgba(15,23,42,0.25)] backdrop-blur-sm",
        padded && "p-6 sm:p-8",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
