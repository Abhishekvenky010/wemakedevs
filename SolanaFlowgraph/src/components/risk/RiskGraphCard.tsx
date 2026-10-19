import type { GraphEvidence, TransactionEdge } from "@/lib/risk/api";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Alert from "@/components/ui/Alert";
import EmptyState from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import RiskGraphVisualization from "./RiskGraphVisualization";

interface RiskGraphCardProps {
  evidence: GraphEvidence[];
  transactions: TransactionEdge[];
  rootAddress?: string;
  mode?: "real" | "demo";
}

export default function RiskGraphCard({
  evidence,
  transactions,
  rootAddress,
  mode = "real",
}: RiskGraphCardProps) {
  const hasGraph = evidence.length > 0 || transactions.length > 0;

  return (
    <Card>
      <SectionHeading
        icon="graph"
        tone="indigo"
        title="Risk graph"
        description={
          mode === "demo"
            ? "Seeded demo transfers in the ingested neighborhood. The detected circular path is highlighted in red."
            : "Persisted transfer edges in the investigated wallet’s ingested neighborhood (up to 3 hops). Cycle paths are highlighted in red."
        }
        action={
          hasGraph ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="slate">{transactions.length} edge{transactions.length === 1 ? "" : "s"}</Badge>
              {evidence.length > 0 && (
                <Badge tone="rose" dot>
                  {evidence.length} cycle path{evidence.length === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
          ) : null
        }
      />

      {hasGraph ? (
        <>
          <RiskGraphVisualization
            evidence={evidence}
            transactions={transactions}
            rootAddress={rootAddress}
            height={480}
          />
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Red edges are returned cycle paths; slate edges are persisted transfers.
            Link thickness reflects cycle-path frequency, not transaction volume.
            Scroll to zoom and drag to pan.
          </p>
          {evidence.length === 0 && transactions.length > 0 && (
            <Alert tone="indigo" className="mt-4">
              No cycle was found in this evidence. This does not establish that the
              wallet is safe.
            </Alert>
          )}
        </>
      ) : (
        <EmptyState
          icon="graph"
          title="No persisted transfer edges"
          description={
            mode === "demo"
              ? "No transfer edges were found for the demo wallet. Seed the demo data and try again."
              : "No persisted transfer edges were found for this wallet at the requested depth. No cycle can be assessed from an empty graph."
          }
        />
      )}
    </Card>
  );
}
