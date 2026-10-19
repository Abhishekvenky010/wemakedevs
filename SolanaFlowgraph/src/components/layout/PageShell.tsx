import type { ReactNode } from "react";
import Header from "@/components/layout/Header";

export default function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-slate-50">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(99,102,241,0.10),transparent_30%),radial-gradient(circle_at_90%_5%,rgba(6,182,212,0.08),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#f3f5fb_45%,#f8fafc_100%)]"
      />
      <Header />
      <main className="relative">{children}</main>
    </div>
  );
}
