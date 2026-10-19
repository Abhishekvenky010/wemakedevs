"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { Graph } from "@/lib/graph/types";
import type { GraphEvidence, TransactionEdge } from "@/lib/risk/api";
import { riskEvidenceToGraph } from "./riskGraphAdapter";
import Icon from "@/components/ui/Icon";

export interface RiskGraphVisualizationProps {
  evidence: GraphEvidence[];
  transactions?: TransactionEdge[];
  rootAddress?: string;
  height?: number;
}

export default function RiskGraphVisualization({
  evidence,
  transactions,
  rootAddress,
  height = 420,
}: RiskGraphVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(
    null
  );
  const [width, setWidth] = useState(0);
  const [graph, setGraph] = useState<Graph | null>(null);

  useEffect(() => {
    if (
      (!evidence || evidence.length === 0) &&
      (!transactions || transactions.length === 0)
    ) {
      setGraph(null);
      return;
    }
    setGraph(riskEvidenceToGraph(evidence ?? [], transactions ?? [], rootAddress));
  }, [evidence, transactions, rootAddress]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = (nextWidth: number) => {
      if (nextWidth > 0) setWidth(nextWidth);
    };

    updateWidth(element.clientWidth);
    const observer = new ResizeObserver((entries) => {
      updateWidth(entries[0]?.contentRect.width ?? element.clientWidth);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const resetView = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(450)
      .call(zoomRef.current.transform, d3.zoomIdentity);
  }, []);

  useEffect(() => {
    if (!svgRef.current || !graph || width === 0) return;

    const svgEl = svgRef.current;
    d3.select(svgEl).selectAll("*").remove();

    const svg = d3
      .select(svgEl)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);

    const defs = svg.append("defs");

    const rootGradient = defs
      .append("linearGradient")
      .attr("id", "risk-root-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "100%");
    rootGradient.append("stop").attr("offset", "0%").attr("stop-color", "#6366f1");
    rootGradient.append("stop").attr("offset", "100%").attr("stop-color", "#4338ca");

    const cycleGradient = defs
      .append("linearGradient")
      .attr("id", "risk-cycle-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "100%");
    cycleGradient.append("stop").attr("offset", "0%").attr("stop-color", "#fb7185");
    cycleGradient.append("stop").attr("offset", "100%").attr("stop-color", "#e11d48");

    defs
      .append("pattern")
      .attr("id", "risk-dot-grid")
      .attr("width", 24)
      .attr("height", 24)
      .attr("patternUnits", "userSpaceOnUse")
      .append("circle")
      .attr("cx", 1.5)
      .attr("cy", 1.5)
      .attr("r", 1)
      .attr("fill", "#cbd5e1")
      .attr("opacity", 0.6);

    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "#f8fafc");
    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "url(#risk-dot-grid)");

    const addArrowMarker = (id: string, color: string) => {
      defs
        .append("marker")
        .attr("id", id)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 24)
        .attr("refY", 0)
        .attr("markerWidth", 7)
        .attr("markerHeight", 7)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", color);
    };

    addArrowMarker("risk-arrow-cycle", "#e11d48");
    addArrowMarker("risk-arrow-transfer", "#94a3b8");

    if (!zoomRef.current) {
      zoomRef.current = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.35, 5])
        .on("zoom", (event) => {
          gRef.current?.attr("transform", event.transform);
        });
    }
    svg.call(zoomRef.current);

    const g = svg.append("g");
    gRef.current = g;

    const simulation = d3
      .forceSimulation(graph.nodes as d3.SimulationNodeDatum[])
      .force(
        "link",
        d3
          .forceLink(graph.links as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
          .id((datum) => (datum as { id: string }).id)
          .distance(120)
          .strength(0.75)
      )
      .force("charge", d3.forceManyBody().strength(-520))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.08))
      .force("y", d3.forceY(height / 2).strength(0.08))
      .force(
        "collision",
        d3.forceCollide<d3.SimulationNodeDatum>().radius(44)
      );

    const linkGroup = g.append("g").attr("class", "links");

    const links = linkGroup
      .selectAll("line")
      .data(graph.links)
      .enter()
      .append("line")
      .attr("stroke", (datum) => datum.style?.color ?? "#94a3b8")
      .attr("stroke-opacity", (datum) => datum.style?.opacity ?? 0.55)
      .attr("stroke-width", (datum) => datum.style?.width ?? 1.5)
      .attr("stroke-dasharray", (datum) => datum.style?.dasharray ?? null)
      .attr("marker-end", (datum) =>
        datum.kind === "cycle"
          ? "url(#risk-arrow-cycle)"
          : "url(#risk-arrow-transfer)"
      )
      .attr("stroke-linecap", "round");

    links
      .append("title")
      .text((datum) =>
        typeof datum.tooltip === "string" ? datum.tooltip : "Transfer edge"
      );

    const nodeGroup = g.append("g").attr("class", "nodes");

    const radiusFor = (datum: { value: number; role?: unknown }) =>
      Math.min(12 + Math.sqrt(datum.value) * 1.25, 28);

    const nodeElements = nodeGroup
      .selectAll("g.node")
      .data(graph.nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .style("cursor", "grab");

    nodeElements
      .append("circle")
      .attr("r", (datum) => radiusFor(datum))
      .attr("fill", (datum) =>
        datum.role === "cycle"
          ? "url(#risk-cycle-gradient)"
          : datum.role === "root"
            ? "url(#risk-root-gradient)"
            : "#64748b"
      )
      .attr("stroke", (datum) =>
        datum.role === "cycle"
          ? "#be123c"
          : datum.role === "root"
            ? "#3730a3"
            : "#475569"
      )
      .attr("stroke-width", (datum) => (datum.isRoot ? 3 : 2))
      .attr("filter", "drop-shadow(0 6px 10px rgba(15, 23, 42, 0.18))")
      .on("mouseover", function (_, datum) {
        d3.select(this)
          .transition()
          .duration(120)
          .attr("r", radiusFor(datum) + 3)
          .attr("stroke-width", 3.5);
      })
      .on("mouseout", function (_, datum) {
        d3.select(this)
          .transition()
          .duration(120)
          .attr("r", radiusFor(datum))
          .attr("stroke-width", datum.isRoot ? 3 : 2);
      });

    nodeElements
      .append("title")
      .text((datum) =>
        typeof datum.tooltip === "string" ? datum.tooltip : datum.id
      );

    const labelGroup = g.append("g").attr("class", "labels");
    const labelElements = labelGroup
      .selectAll("g.label")
      .data(graph.nodes)
      .enter()
      .append("g")
      .attr("class", "label")
      .attr("pointer-events", "none");

    labelElements
      .append("rect")
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", "#ffffff")
      .attr("stroke", "#e2e8f0")
      .attr("stroke-width", 1)
      .attr("opacity", 0.95);

    labelElements
      .append("text")
      .text((datum) => datum.label)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-family", "ui-sans-serif, system-ui, sans-serif")
      .attr("font-weight", 600)
      .attr("font-size", 10.5)
      .attr("fill", "#475569");

    labelElements.each(function () {
      const label = d3.select(this);
      const text = label.select<SVGTextElement>("text").node();
      if (!text) return;
      const bounds = text.getBBox();
      label
        .select("rect")
        .attr("x", bounds.x - 6)
        .attr("y", bounds.y - 3)
        .attr("width", bounds.width + 12)
        .attr("height", bounds.height + 6);
    });

    const drag = d3
      .drag<SVGGElement, (typeof graph.nodes)[number]>()
      .on("start", (event, datum) => {
        if (!event.active) simulation.alphaTarget(0.2).restart();
        datum.fx = datum.x;
        datum.fy = datum.y;
      })
      .on("drag", (event, datum) => {
        datum.fx = event.x;
        datum.fy = event.y;
      })
      .on("end", (event, datum) => {
        if (!event.active) simulation.alphaTarget(0);
        datum.fx = null;
        datum.fy = null;
      });

    nodeElements.call(drag);

    simulation.on("tick", () => {
      links
        .attr(
          "x1",
          (datum) => (datum.source as unknown as { x: number }).x
        )
        .attr(
          "y1",
          (datum) => (datum.source as unknown as { y: number }).y
        )
        .attr(
          "x2",
          (datum) => (datum.target as unknown as { x: number }).x
        )
        .attr(
          "y2",
          (datum) => (datum.target as unknown as { y: number }).y
        );

      nodeElements.attr(
        "transform",
        (datum) => `translate(${datum.x},${datum.y})`
      );
      labelElements.attr("transform", (datum) => {
        const x = (datum as unknown as { x?: number }).x ?? 0;
        const y = (datum as unknown as { y?: number }).y ?? 0;
        return `translate(${x},${y + radiusFor(datum) + 15})`;
      });
    });

    return () => {
      simulation.stop();
    };
  }, [graph, height, width]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm"
      style={{ height }}
    >
      <svg
        ref={svgRef}
        className="h-full w-full"
        role="img"
        aria-label="Risk graph showing persisted transfers and detected cycles"
      />

      {graph ? (
        <>
          <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {graph.nodes.length} nodes · {graph.links.length} links
          </div>

          <div className="pointer-events-none absolute right-3 top-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 text-[11px] text-slate-600 shadow-sm backdrop-blur">
            <p className="mb-1.5 font-semibold text-slate-700">Legend</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Detected cycle
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                Investigated wallet
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-500" />
                Transfer counterparty
              </div>
              <div className="flex items-center gap-2">
                <span className="h-px w-2 bg-slate-400" />
                Persisted transfer
              </div>
            </div>
          </div>

          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <span className="pointer-events-none hidden rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-[10px] text-slate-500 shadow-sm backdrop-blur sm:inline-flex">
              Scroll to zoom · drag to pan
            </span>
            <button
              type="button"
              onClick={resetView}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-slate-900"
            >
              <Icon name="refresh" size={12} />
              Reset view
            </button>
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          No graph data
        </div>
      )}
    </div>
  );
}
