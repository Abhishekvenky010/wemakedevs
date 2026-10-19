import type { Graph, Node, Link, GraphStyle, NodeStyle } from "@/lib/graph/types";
import type { TransactionEdge } from "@/lib/risk/api";

export interface GraphEvidence {
  wallet: string;
  hop_count: number;
  path_wallets: string[];
}

/**
 * Theme configuration for risk graph visualization.
 * Provides consistent visual styling across the graph.
 */
export interface RiskGraphTheme {
  colors: {
    low: string;
    medium: string;
    high: string;
    default: string;
    background: string;
    linkDefault: string;
    linkHighFrequency: string;
  };
  sizes: {
    nodeMin: number;
    nodeMax: number;
    borderWidth: number;
    fontSize: number;
  };
  animation: {
    duration: number;
    easing: string;
  };
}

export const DEFAULT_RISK_THEME: RiskGraphTheme = {
  colors: {
    low: "#10b981",      // Emerald 500 - Safe
    medium: "#f59e0b",    // Amber 500 - Moderate Risk
    high: "#e11d48",     // Rose 600 - High Risk
    default: "#4f46e5",   // Indigo 600 - Default
    background: "#f8fafc", // Slate 50 - Light background
    linkDefault: "#94a3b8", // Slate 400 - Light gray links
    linkHighFrequency: "#fbbf24", // Amber 300 - Highlight high-frequency paths
  },
  sizes: {
    nodeMin: 60,
    nodeMax: 120,
    borderWidth: 2,
    fontSize: 14,
  },
  animation: {
    duration: 750,
    easing: "easeInOutQuad",
  },
};

/**
 * Visual style for risk graph nodes.
 */
export interface RiskNodeStyle extends NodeStyle {
  fontSize?: number;
  shape?: "circle" | "square" | "diamond" | "triangle";
  pulse?: boolean; // Animation for high-risk nodes
}

/**
 * Converts risk evidence and persisted transactions into a visually-styled
 * graph representation.
 *
 * - Cycle paths are rendered as red, emphasised edges.
 * - Persisted real transfers are rendered as muted slate edges, even when they
 *   do not form a cycle.
 * - The investigated wallet is blue; cycle participants are red; other
 *   counterparties are neutral.
 */
export function riskEvidenceToGraph(
  evidence: GraphEvidence[],
  transactions: TransactionEdge[] = [],
  rootAddress?: string,
  theme: RiskGraphTheme = DEFAULT_RISK_THEME
): Graph {
  const nodes = new Map<string, Node>();
  const links = new Map<string, Link>();
  const cycleWallets = new Set<string>();

  for (const item of evidence) {
    for (const wallet of item.path_wallets ?? []) {
      cycleWallets.add(wallet);
    }
  }

  const ensureNode = (address: string) => {
    if (!address || nodes.has(address)) return;

    const role = getNodeRole(address, cycleWallets, rootAddress);
    const style = getRoleStyle(role, theme);

    nodes.set(address, {
      id: address,
      group: role === "cycle" ? 3 : role === "root" ? 2 : 1,
      label: `${address.slice(0, 6)}...${address.slice(-4)}`,
      value: role === "cycle" ? 90 : role === "root" ? 72 : 42,
      style,
      role,
      riskLevel: role === "cycle" ? "high" : "default",
      cycleParticipant: role === "cycle",
      isRoot: role === "root",
      tooltip: nodeTooltip(address, role, address === rootAddress),
    });
  };

  // Add persisted transfers first. They are the actual on-chain evidence and
  // are shown even when no cycle exists.
  for (const tx of transactions) {
    ensureNode(tx.source);
    ensureNode(tx.destination);

    const key = `${tx.source}->${tx.destination}`;
    const existing = links.get(key);

    if (existing) {
      existing.value += 1;
      existing.transactionCount = Number(existing.transactionCount ?? 1) + 1;
      existing.tooltip = buildTransactionTooltip(
        tx,
        Number(existing.transactionCount)
      );
      continue;
    }

    links.set(key, {
      source: tx.source,
      target: tx.destination,
      value: 1,
      kind: "transaction",
      transactionCount: 1,
      tooltip: buildTransactionTooltip(tx, 1),
      style: {
        color: "#94a3b8",
        width: 1.8,
        opacity: 0.6,
        arrow: true,
        arrowColor: "#94a3b8",
      },
    });
  }

  // Overlay detected cycles on top of the transaction graph.
  for (const item of evidence) {
    const path = item.path_wallets ?? [];
    for (const wallet of path) ensureNode(wallet);

    for (let i = 0; i < path.length - 1; i++) {
      const source = path[i];
      const target = path[i + 1];
      if (!source || !target) continue;

      const key = `${source}->${target}`;
      const existing = links.get(key);

      if (existing) {
        existing.kind = "cycle";
        existing.value += 1;
        existing.cycleCount = Number(existing.cycleCount ?? 0) + 1;
        existing.style = {
          color: "#e11d48",
          width: Math.min(8, 3 + existing.value),
          opacity: 1,
          arrow: true,
          arrowColor: "#e11d48",
        };
        existing.tooltip = `Detected cycle edge\n${source} → ${target}\nSeen in ${existing.cycleCount} returned cycle path(s)`;
      } else {
        links.set(key, {
          source,
          target,
          value: 1,
          kind: "cycle",
          cycleCount: 1,
          tooltip: `Detected cycle edge\n${source} → ${target}`,
          style: {
            color: "#e11d48",
            width: 3,
            opacity: 1,
            arrow: true,
            arrowColor: "#e11d48",
          },
        });
      }
    }
  }

  // Recompute roles after all cycle paths are known. This matters when a node
  // was first added from a transaction and later turned out to be in a cycle.
  for (const node of nodes.values()) {
    const role = getNodeRole(node.id, cycleWallets, rootAddress);
    node.role = role;
    node.group = role === "cycle" ? 3 : role === "root" ? 2 : 1;
    node.riskLevel = role === "cycle" ? "high" : "default";
    node.style = getRoleStyle(role, theme);
    node.value = role === "cycle" ? 90 : role === "root" ? 72 : 42;
    node.cycleParticipant = role === "cycle";
    node.isRoot = role === "root";
    node.tooltip = nodeTooltip(node.id, role, node.id === rootAddress);
  }

  const graphStyle: GraphStyle = {
    backgroundColor: theme.colors.background,
    linkDistance: 100,
    nodeRepulsion: 800,
    fontSize: theme.sizes.fontSize,
  };

  return {
    nodes: Array.from(nodes.values()),
    links: Array.from(links.values()),
    style: graphStyle,
  };
}

type NodeRole = "cycle" | "root" | "counterparty";

function getNodeRole(
  address: string,
  cycleWallets: Set<string>,
  rootAddress?: string
): NodeRole {
  if (cycleWallets.has(address)) return "cycle";
  if (address === rootAddress) return "root";
  return "counterparty";
}

function nodeTooltip(address: string, role: NodeRole, isRoot: boolean): string {
  const roleLabel =
    role === "cycle"
      ? isRoot
        ? "investigated wallet (cycle participant)"
        : "cycle participant"
      : role === "root"
        ? "investigated wallet"
        : "transfer counterparty";

  return `Address: ${address}\nRole: ${roleLabel}`;
}

function getRoleStyle(role: NodeRole, theme: RiskGraphTheme): RiskNodeStyle {
  if (role === "cycle") {
    return {
      color: "#e11d48",
      borderColor: "#be123c",
      borderWidth: 3,
      opacity: 1,
      shadow: true,
      fontSize: theme.sizes.fontSize,
      shape: "diamond",
      pulse: true,
    };
  }

  if (role === "root") {
    return {
      color: "#4f46e5",
      borderColor: "#3730a3",
      borderWidth: 3,
      opacity: 1,
      shadow: true,
      fontSize: theme.sizes.fontSize,
      shape: "circle",
    };
  }

  return {
    color: "#64748b",
    borderColor: "#475569",
    borderWidth: 2,
    opacity: 0.95,
    shadow: true,
    fontSize: theme.sizes.fontSize,
    shape: "circle",
  };
}

function buildTransactionTooltip(tx: TransactionEdge, count: number): string {
  const directionLabel =
    tx.direction === "outgoing"
      ? "outgoing from investigated wallet"
      : tx.direction === "incoming"
        ? "incoming to investigated wallet"
        : "between counterparties";

  const lines = [
    `${count} transfer${count === 1 ? "" : "s"} ${directionLabel}`,
    `${tx.source} → ${tx.destination}`,
    formatAmount(tx.amount, tx.mint),
    `Signature: ${tx.signature || "unknown"}`,
  ];

  if (!tx.success) {
    lines.push("Status: failed transaction");
  }

  if (tx.block_time) {
    lines.push(`Block time: ${new Date(tx.block_time * 1000).toISOString()}`);
  }

  return lines.join("\n");
}

function formatAmount(amount: number, mint: string): string {
  if (!Number.isFinite(amount)) return mint || "unknown amount";

  const formatted =
    amount >= 1
      ? amount.toLocaleString(undefined, { maximumFractionDigits: 4 })
      : amount.toPrecision(4);

  return `${formatted} ${mint || ""}`.trim();
}


