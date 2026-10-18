'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  const navigation = [
    { name: 'Home', href: '/' },
    { name: 'Risk', href: '/risk' },
    { name: 'Demo', href: '/demo' },
  ];

  const isActive = (path: string) => pathname === path;

  return (
    <header className="relative sticky top-0 z-[100] border-b border-slate-200 bg-white/80 backdrop-blur-md shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex justify-between h-16 items-center">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="flex items-center gap-3">
                <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="text-gradient-primary font-bold text-xl tracking-tight">SolanaFlowGraph</span>
              </Link>
            </div>

            {/* Desktop navigation */}
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-1 px-1 pt-1 border-b-2 text-sm font-medium transition-all ${
                    isActive(item.href)
                      ? 'border-primary text-gray-900 shadow-lg shadow-primary/20'
                      : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
              aria-expanded="false"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <span className="sr-only">Open main menu</span>
              {isMenuOpen ? (
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>

          {/* CTA buttons - desktop */}
          <div className="hidden sm:flex sm:items-center">
            <Link href="/risk" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-lg hover:-translate-y-0.5 transition-all">
              Investigate Wallet
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="sm:hidden border-t border-slate-200 bg-white/90 backdrop-blur-md">
          <div className="px-3 pt-2 pb-3 space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`block pl-3 pr-4 py-2 border-l-3 rounded-r-lg text-base font-medium ${
                  isActive(item.href)
                    ? 'bg-primary/5 border-primary text-primary shadow-sm'
                    : 'border-transparent text-gray-600 hover:bg-slate-50 hover:border-gray-200 hover:text-gray-900'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}

            <a
              href="https://github.com/Zeddli/SolanaFlowgraph"
              target="_blank"
              rel="noopener noreferrer"
              className="block pl-3 pr-4 py-2 border-l-3 border-transparent rounded-r-lg text-base font-medium text-gray-600 hover:bg-slate-50 hover:border-gray-200 hover:text-gray-900"
            >
              GitHub
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
