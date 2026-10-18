
import type { Graph, Node, Link } from "@/lib/dataProcessor";

export interface GraphEvidence {
  wallet: string;
  hop_count: number;
  path_wallets: string[];
}

export function riskEvidenceToGraph(evidence: GraphEvidence[]): Graph {
  const nodes = new Map<string, Node>();
  const links = new Map<string, Link>();

  for (const item of evidence) {
    const path = item.path_wallets;

    // Add each wallet as a node, even if it appears in multiple paths.
    for (const wallet of path) {
      if (!nodes.has(wallet)) {
        nodes.set(wallet, {
          id: wallet,
          group: 1,
          label: `${wallet.slice(0, 6)}...${wallet.slice(-4)}`,
          value: 80,
        });
      }
    }

    // Create a directed link for every consecutive pair.
    for (let i = 0; i < path.length - 1; i++) {
      const source = path[i];
      const target = path[i + 1];

      if (!source || !target) continue;

      const key = `${source}->${target}`;

      if (!links.has(key)) {
        links.set(key, { source, target, value: 2 });
      } else {
        // Wider links indicate that the same directed edge appears
        // in multiple evidence paths; this is not a transfer amount.
        links.get(key)!.value += 1;
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    links: Array.from(links.values()),
  };
}
