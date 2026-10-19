import type { IngestWalletStats } from "@/lib/risk/api";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Alert from "@/components/ui/Alert";
import { SectionHeading } from "@/components/ui/SectionHeading";
import StatTile from "@/components/ui/StatTile";

interface IngestionResultsProps {
  ingestion: IngestWalletStats;
}

const stats: Array<{
  key: keyof IngestWalletStats;
  label: string;
  hint?: string;
}> = [
  { key: "max_depth", label: "Requested depth" },
  { key: "max_depth_reached", label: "Depth reached" },
  { key: "wallets_visited", label: "Wallets visited" },
  { key: "signatures_fetched", label: "Signatures fetched" },
  { key: "transactions_fetched", label: "Transactions fetched" },
  { key: "transactions_processed", label: "Transactions processed" },
  { key: "transfers_persisted", label: "Transfers persisted" },
  { key: "duplicates_skipped", label: "Duplicates skipped" },
  { key: "failed_transactions", label: "Failed transactions" },
  { key: "persistence_errors", label: "Persistence errors" },
];

export default function IngestionResults({ ingestion }: IngestionResultsProps) {
  const failed = ingestion.status === "error";

  return (
    <Card>
      <SectionHeading
        icon="database"
        tone={failed ? "rose" : "indigo"}
        title={failed ? "Partial ingestion before failure" : "Ingestion results"}
        description="Real Solana transfers persisted to FalkorDB for this investigation."
        action={
          <Badge
            tone={failed || ingestion.incomplete ? "amber" : "emerald"}
            dot
          >
            {failed
              ? "Failed"
              : ingestion.incomplete
                ? "Incomplete coverage"
                : "Complete"}
          </Badge>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Wallet
        </span>
        <span className="break-all font-mono text-xs text-slate-800">
          {ingestion.address}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat) => (
          <StatTile
            key={stat.key}
            label={stat.label}
            value={String(ingestion[stat.key] ?? "—")}
          />
        ))}
      </dl>

      <div className="mt-5 space-y-3">
        {ingestion.rate_limited && (
          <Alert>
            Solana RPC rate limiting occurred. Some transaction evidence could not
            be fetched.
          </Alert>
        )}
        {ingestion.signatures_fetched === 0 && (
          <Alert>
            No transaction signatures were returned for this wallet at the
            requested depth.
          </Alert>
        )}
        {ingestion.incomplete && (
          <Alert title="Coverage is incomplete">
            The report is limited to evidence successfully fetched and saved.
            Absence of a detected pattern does not establish that the wallet is
            safe.
          </Alert>
        )}
      </div>
    </Card>
  );
}
