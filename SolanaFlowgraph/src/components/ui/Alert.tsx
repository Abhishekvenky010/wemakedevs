import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import Icon, { type IconName } from "./Icon";
import { toneStyles, type Tone } from "./tone";

interface AlertProps {
  children: ReactNode;
  title?: string;
  tone?: Extract<Tone, "amber" | "rose" | "emerald" | "indigo">;
  icon?: IconName;
  className?: string;
}

export default function Alert({
  children,
  title,
  tone = "amber",
  icon,
  className,
}: AlertProps) {
  const resolvedIcon =
    icon ?? (tone === "rose" ? "alert" : tone === "emerald" ? "check" : "info");

  return (
    <div
      role={tone === "rose" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4 text-sm",
        toneStyles[tone].surface,
        className
      )}
    >
      <Icon
        name={resolvedIcon}
        size={18}
        className={cn("mt-0.5", toneStyles[tone].text)}
      />
      <div className={cn("min-w-0 leading-6", toneStyles[tone].text)}>
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5 opacity-90" : undefined}>{children}</div>
      </div>
    </div>
  );
}
