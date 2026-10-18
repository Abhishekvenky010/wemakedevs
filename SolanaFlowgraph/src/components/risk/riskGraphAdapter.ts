import type { Graph, Node, Link, GraphStyle, NodeStyle, LinkStyle } from "@/lib/dataProcessor";

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
    high: "#ef4444",     // Red 500 - High Risk
    default: "#3b82f6",   // Blue 500 - Default
    background: "#0f172a", // Slate 900 - Dark background
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
 * Converts risk evidence into a visually-styled graph representation.
 * Nodes are colored and sized by risk level.
 * Links are styled with arrows and frequency-based thickness.
 */
export function riskEvidenceToGraph(
  evidence: GraphEvidence[],
  theme: RiskGraphTheme = DEFAULT_RISK_THEME
): Graph {
  const nodes = new Map<string, Node>();
  const links = new Map<string, Link>();

  // Track how many paths each wallet appears in
  const walletFrequency = new Map<string, number>();
  
  for (const item of evidence) {
    const path = item.path_wallets;
    for (const wallet of path) {
      walletFrequency.set(wallet, (walletFrequency.get(wallet) || 0) + 1);
    }
  }

  for (const item of evidence) {
    const path = item.path_wallets;

    // Add each wallet as a node, even if it appears in multiple paths
    for (const wallet of path) {
      if (!nodes.has(wallet)) {
        const riskLevel = getRiskLevel(wallet);
        const nodeStyle: RiskNodeStyle = getNodeStyle(riskLevel, wallet, theme);
        const frequency = walletFrequency.get(wallet) || 1;
        
        nodes.set(wallet, {
          id: wallet,
          group: getGroup(riskLevel),
          label: `${wallet.slice(0, 6)}...${wallet.slice(-4)}`,
          value: getNodeSize(frequency, theme),
          style: nodeStyle,
          tooltip: `Address: ${wallet}\nRisk: ${riskLevel}\nIn ${frequency} path(s)\nMax hop: ${item.hop_count}`,
          frequency,
          riskLevel,
        });
      }
    }

    // Create directed links for every consecutive pair in the path
    for (let i = 0; i < path.length - 1; i++) {
      const source = path[i];
      const target = path[i + 1];

      if (!source || !target) continue;

      const key = `${source}->${target}`;

      if (!links.has(key)) {
        const linkStyle: LinkStyle = {
          color: theme.colors.linkDefault,
          width: 2,
          opacity: 0.7,
          arrow: true,
          arrowColor: theme.colors.linkDefault,
          arrowSize: 6,
        };
        links.set(key, { source, target, value: 2, style: linkStyle });
      } else {
        // Increase thickness and color for high-frequency paths
        const existingLink = links.get(key)!;
        existingLink.value += 1;
        if (existingLink.style) {
          existingLink.style.width = Math.min(8, 2 + existingLink.value);
          existingLink.style.color = theme.colors.linkHighFrequency;
          existingLink.style.arrowColor = theme.colors.linkHighFrequency;
          existingLink.style.opacity = Math.min(1, 0.7 + existingLink.value * 0.1);
        }
      }
    }
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

/**
 * Generates visual styling for risk nodes based on risk level.
 */
function getNodeStyle(riskLevel: string, _wallet: string, theme: RiskGraphTheme): RiskNodeStyle {
  const colors = {
    low: theme.colors.low,
    medium: theme.colors.medium,
    high: theme.colors.high,
  }[riskLevel] || theme.colors.default;

  const borderColor = getBorderColor(riskLevel, theme);
  const borderWidth = theme.sizes.borderWidth;

  const style: RiskNodeStyle = {
    color: colors,
    borderColor,
    borderWidth,
    opacity: 1,
    shadow: true,
    fontSize: theme.sizes.fontSize,
    shape: getShape(riskLevel),
    gradient: {
      from: colors,
      to: adjustBrightness(colors, -20),
    },
  };

  // Add pulse animation for high-risk nodes
  if (riskLevel === "high") {
    style.pulse = true;
  }

  return style;
}

/**
 * Determines border color based on risk level.
 */
function getBorderColor(riskLevel: string, theme: RiskGraphTheme): string {
  switch (riskLevel) {
    case "high":
      return theme.colors.high;
    case "medium":
      return theme.colors.medium;
    case "low":
      return theme.colors.low;
    default:
      return theme.colors.default;
  }
}

/**
 * Maps risk levels to node groups for graph layout.
 */
function getGroup(riskLevel: string): number {
  switch (riskLevel) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
    default:
      return 0;
  }
}

/**
 * Determines node shape based on risk level.
 * Different shapes aid visual distinction and accessibility.
 */
function getShape(riskLevel: string): "circle" | "square" | "diamond" | "triangle" {
  switch (riskLevel) {
    case "low":
      return "circle";
    case "medium":
      return "square";
    case "high":
      return "diamond";
    default:
      return "circle";
  }
}

/**
 * Calculates node size based on frequency and theme.
 */
function getNodeSize(frequency: number, theme: RiskGraphTheme): number {
  return Math.min(
    theme.sizes.nodeMax,
    theme.sizes.nodeMin + (frequency - 1) * 15
  );
}

/**
 * Adjusts the brightness of a hex color by a given percentage.
 */
function adjustBrightness(hex: string, percent: number): string {
  const R = parseInt(hex.slice(1, 3), 16);
  const G = parseInt(hex.slice(3, 5), 16);
  const B = parseInt(hex.slice(5, 7), 16);

  const newR = Math.min(255, Math.max(0, R + (R * percent) / 100));
  const newG = Math.min(255, Math.max(0, G + (G * percent) / 100));
  const newB = Math.min(255, Math.max(0, B + (B * percent) / 100));

  return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
}

/**
 * Determines risk level based on wallet identifier characteristics.
 * Longer identifiers are considered lower risk (more established projects).
 * Medium-length identifiers suggest potential risk.
 * Short identifiers may indicate newer/experimental projects.
 */
function getRiskLevel(wallet: string): string {
  if (wallet.length >= 10) return "low";
  if (wallet.length >= 7) return "medium";
  return "high";
}

/**
 * Generates a legend object for the graph visualization.
 * This helps users understand color coding.
 */
function generateLegend(theme: RiskGraphTheme = DEFAULT_RISK_THEME): Record<string, string> {
  return {
    low: `Low Risk (${theme.colors.low}) - Established projects`,
    medium: `Medium Risk (${theme.colors.medium}) - Moderate risk`,
    high: `High Risk (${theme.colors.high}) - Potential risk`,
    default: `Default (${theme.colors.default}) - Unknown risk`,
    links: `Links represent transfer paths; thickness = frequency of appearance`,
  };
}

/**
 * Generates a style configuration for interactive graph visualization.
 * Includes hover states, selection states, and transition animations.
 */
export function getInteractiveGraphConfig(theme: RiskGraphTheme = DEFAULT_RISK_THEME) {
  return {
    style: {
      backgroundColor: theme.colors.background,
      nodeSize: { min: theme.sizes.nodeMin, max: theme.sizes.nodeMax },
      fontSize: theme.sizes.fontSize,
    },
    interactions: {
      hover: {
        node: {
          scale: 1.2,
          borderWidth: 4,
          opacity: 1,
        },
        link: {
          width: 4,
          opacity: 1,
        },
      },
      select: {
        node: {
          scale: 1.3,
          borderWidth: 6,
          opacity: 1,
        },
      },
      focus: {
        opacity: 0.3,
        highlightConnectedLinks: true,
      },
    },
    transitions: {
      duration: theme.animation.duration,
      easing: theme.animation.easing,
    },
    layout: {
      type: "force",
      linkDistance: 120,
      nodeRepulsion: 1000,
      iterations: 300,
    },
    labels: {
      visible: true,
      fontSize: theme.sizes.fontSize,
      offset: 12,
      background: "rgba(0, 0, 0, 0.7)",
      padding: 4,
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
  };
}

export { generateLegend };
