export interface NodeStyle {
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
  shadow?: boolean;
  gradient?: { from: string; to: string };
}

export interface Node {
  id: string;
  group: number;
  label: string;
  value: number;
  style?: NodeStyle;
  [key: string]: unknown;
}

export interface LinkStyle {
  color?: string;
  width?: number;
  opacity?: number;
  dasharray?: string;
  arrow?: boolean;
  arrowColor?: string;
  arrowSize?: number;
}

export interface Link {
  source: string;
  target: string;
  value: number;
  style?: LinkStyle;
  [key: string]: unknown;
}

export interface GraphStyle {
  backgroundColor?: string;
  linkDistance?: number;
  nodeRepulsion?: number;
  fontSize?: number;
  fontFamily?: string;
  animationDuration?: number;
}

export interface Graph {
  nodes: Node[];
  links: Link[];
  style?: GraphStyle;
}
