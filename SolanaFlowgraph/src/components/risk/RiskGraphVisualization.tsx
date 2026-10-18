'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Graph, Node, Link } from '@/lib/dataProcessor';
import { riskEvidenceToGraph } from './riskGraphAdapter';

export interface RiskGraphVisualizationProps {
  evidence: { wallet: string; hop_count: number; path_wallets: string[] }[];
  height?: number;
}

export default function RiskGraphVisualization({
  evidence,
  height = 420,
}: RiskGraphVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);

  useEffect(() => {
    if (!evidence || evidence.length === 0) {
      setGraph(null);
      return;
    }
    setGraph(riskEvidenceToGraph(evidence));
  }, [evidence]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svgEl = svgRef.current;
    d3.select(svgEl).selectAll('*').remove();

    if (!graph) return;

    const width = svgEl.clientWidth;
    const heightLocal = height;

    const svg = d3.select(svgEl)
      .attr('width', width)
      .attr('height', heightLocal);

    if (!zoomRef.current) {
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.25, 5])
        .on('zoom', (event) => {
          gRef.current?.attr('transform', event.transform);
        });
      zoomRef.current = zoom;
      svg.call(zoom) as any;
    }

    const g = svg.append('g');
    gRef.current = g;

    g.append('rect')
      .attr('width', width * 3)
      .attr('height', heightLocal * 3)
      .attr('x', -width)
      .attr('y', -heightLocal)
      .attr('fill', 'none')
      .attr('pointer-events', 'all');

    const simulation = d3
      .forceSimulation(graph.nodes as d3.SimulationNodeDatum[])
      .force(
        'link',
        d3
          .forceLink(graph.links)
          .id((d: any) => d.id)
          .distance(90)
      )
      .force('charge', d3.forceManyBody().strength(-320))
      .force('center', d3.forceCenter(width / 2, heightLocal / 2))
      .force('x', d3.forceX(width / 2).strength(0.1))
      .force('y', d3.forceY(heightLocal / 2).strength(0.1));

    const links = g
      .append('g')
      .selectAll('line')
      .data(graph.links)
      .enter()
      .append('line')
      .attr('stroke', '#94a3b8')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', (d: Link) => Math.sqrt(d.value));

    const nodesGroup = g.append('g');

    const nodes = nodesGroup
      .selectAll('circle')
      .data(graph.nodes)
      .enter()
      .append('circle')
      .attr('r', (d: Node) => Math.sqrt(d.value) + 2)
      .attr('fill', (d: Node) => {
        const colors = ['#0ea5e9', '#14b8a6', '#f59e0b'];
        return colors[d.group % colors.length];
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .call(
        d3.drag<SVGCircleElement, Node>()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended) as any
      )
      .on('click', (event: MouseEvent) => {
        event.stopPropagation();
      });

    nodes.append('title').text((d: Node) => d.label);

    const labels = nodesGroup
      .selectAll('text')
      .data(graph.nodes)
      .enter()
      .append('text')
      .text((d: Node) => d.label)
      .attr('font-size', 10)
      .attr('dx', 14)
      .attr('dy', 4)
      .attr('pointer-events', 'none')
      .attr('fill', '#334155');

    simulation.on('tick', () => {
      links
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      nodes.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);

      labels.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y);
    });

    function dragstarted(event: d3.D3DragEvent<SVGCircleElement, Node, any>, d: Node & d3.SimulationNodeDatum) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGCircleElement, Node, any>, d: Node & d3.SimulationNodeDatum) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGCircleElement, Node, any>, d: Node & d3.SimulationNodeDatum) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [graph, height]);

  return (
    <div className="w-full relative" style={{ height }}>
      <svg ref={svgRef} className="w-full h-full bg-white rounded-lg border border-slate-200" />
      {graph && (
        <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm text-xs text-slate-600 px-2 py-1 rounded border border-slate-200">
          {graph.nodes.length} nodes · {graph.links.length} links
        </div>
      )}
    </div>
  );
}