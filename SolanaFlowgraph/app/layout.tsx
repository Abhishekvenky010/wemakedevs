import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AgentX — Wallet risk intelligence',
  description:
    'Investigate Solana wallets with graph-backed circular-transfer detection, explainable evidence, and deterministic risk actions.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50">
        {children}
      </body>
    </html>
  );
} 