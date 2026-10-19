"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import Icon, { type IconName } from "@/components/ui/Icon";

const navigation: Array<{ name: string; href: string; icon: IconName }> = [
  { name: "Investigate", href: "/risk", icon: "search" },
  { name: "Demo", href: "/demo", icon: "sparkles" },
];

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  const isActive = (path: string) => pathname === path;

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/risk" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/25">
            <Icon name="graph" size={21} strokeWidth={1.9} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight text-slate-950">
              AgentX
            </span>
            <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
              Risk intelligence
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50/80 p-1 sm:flex">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all",
                isActive(item.href)
                  ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <Icon name={item.icon} size={15} />
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <a
            href="https://github.com/Abhishekvenky010/wemakedevs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            <Icon name="external" size={15} />
            GitHub
          </a>
          <Link
            href="/risk"
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
          >
            Open app
            <Icon name="arrow-right" size={15} />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 sm:hidden"
          aria-expanded={isMenuOpen}
          aria-controls="mobile-navigation"
        >
          <span className="sr-only">Toggle main menu</span>
          <Icon name={isMenuOpen ? "x" : "menu"} size={20} />
        </button>
      </div>

      {isMenuOpen && (
        <div
          id="mobile-navigation"
          className="border-t border-slate-200/70 bg-white/95 px-4 pb-4 pt-3 backdrop-blur-xl sm:hidden"
        >
          <nav className="space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive(item.href)
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon name={item.icon} size={17} />
                {item.name}
              </Link>
            ))}
            <a
              href="https://github.com/Abhishekvenky010/wemakedevs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <Icon name="external" size={17} />
              GitHub
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
