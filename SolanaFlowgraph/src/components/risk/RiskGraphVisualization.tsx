'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Graph, Node, Link } from '@/lib/dataProcessor';
import { riskEvidenceToGraph } from './riskGraphAdapter';

export interface RiskGraphVisualizationProps {
  evidence: { wallet: string; hop_count: number; path_wallets: string[] }[];
  height?: number;
}

const NODE_GRADIENT_IDS = ['nodeGradient-blue', 'nodeGradient-indigo', 'nodeGradient-purple', 'nodeGradient-emerald'];

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

    // Define gradients for nodes
    const defs = svg.append('defs');

    NODE_GRADIENT_IDS.forEach((id, index) => {
      const gradient = defs.append('linearGradient')
        .attr('id', id)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '100%');

      const colors = [
        ['#3b82f6', '#1e40af'],
        ['#6366f1', '#4338ca'],
        ['#a855f7', '#7e22ce'],
        ['#10b981', '#047857'],
      ];
      const [from, to] = colors[index % colors.length];

      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', from);
      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', to);
    });

    // Define link gradients
    defs.append('linearGradient')
      .attr('id', 'linkGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '100%')
      .selectAll('stop')
      .data([
        { offset: '0%', color: '#94a3b8' },
        { offset: '100%', color: '#64748b' },
      ])
      .enter()
      .append('stop')
      .attr('offset', (d: any) => d.offset)
      .attr('stop-color', (d: any) => d.color);

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

    // Background rect for zoom area
    g.append('rect')
      .attr('width', width * 3)
      .attr('height', heightLocal * 3)
      .attr('x', -width)
      .attr('y', -heightLocal)
      .attr('fill', '#f8fafc')
      .attr('pointer-events', 'all');

    const simulation = d3
      .forceSimulation(graph.nodes as d3.SimulationNodeDatum[])
      .force(
        'link',
        d3
          .forceLink(graph.links)
          .id((d: any) => d.id)
          .distance(100)
          .strength(0.8)
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, heightLocal / 2))
      .force('x', d3.forceX(width / 2).strength(0.1))
      .force('y', d3.forceY(heightLocal / 2).strength(0.1));

    // Links with gradient
    const linkGroup = g.append('g').attr('class', 'links');

    const links = linkGroup
      .selectAll('line')
      .data(graph.links)
      .enter()
      .append('line')
      .attr('stroke', 'url(#linkGradient)')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', (d: any) => Math.min(Math.sqrt(d.value) * 1.5, 6))
      .attr('stroke-linecap', 'round');

    // Add link arrow markers
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 15)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#94a3b8');

    // Create nodes using simpler approach - just append all fresh
    const nodeGroup = g.append('g').attr('class', 'nodes');
    
    const nodeElements = nodeGroup
      .selectAll('g.node')
      .data((graph.nodes as any) as any, (d: any) => d.id)
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('cursor', 'pointer')
      .style('cursor', 'pointer');

    nodeElements.append('circle')
      .attr('r', (d: any) => Math.min(Math.sqrt(d.value) + 3, 22))
      .attr('fill', (d: any, i: number) => `url(#${NODE_GRADIENT_IDS[i % NODE_GRADIENT_IDS.length]})`)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2.5)
      .attr('filter', 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))')
      .on('mouseover', function(event: any, d: any) {
        d3.select(this)
          .attr('r', Math.min(Math.sqrt(d.value) + 3, 22) + 3)
          .attr('stroke-width', 3)
          .attr('filter', 'drop-shadow(0 8px 12px rgba(0, 0, 0, 0.15))');
      })
      .on('mouseout', function(event: any, d: any) {
        d3.select(this)
          .attr('r', Math.min(Math.sqrt(d.value) + 3, 22))
          .attr('stroke-width', 2.5)
          .attr('filter', 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))');
      });

    // Labels
    const labelGroup = g.append('g').attr('class', 'labels');
    
    const labelElements = labelGroup
      .selectAll('g.label')
      .data((graph.nodes as any) as any, (d: any) => d.id)
      .enter()
      .append('g')
      .attr('class', 'label')
      .attr('pointer-events', 'none')
      .attr('font-family', 'system-ui, -apple-system, sans-serif')
      .attr('font-weight', '600')
      .attr('font-size', '11px')
      .attr('fill', '#475569');

    labelElements.append('rect')
      .attr('x', -4)
      .attr('y', -14)
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', '#ffffff')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1);

    labelElements.append('text')
      .text((d: any) => d.label)
      .attr('dx', 2)
      .attr('dy', -4)
      .attr('text-anchor', 'start')
      .attr('pointer-events', 'none');

    simulation.on('tick', () => {
      links
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      nodeElements.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
      labelElements.attr('transform', (d: any) => `translate(${d.x + 14},${d.y + 4})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graph, height]);

  return (
    <div className="w-full relative" style={{ height }}>
      <svg ref={svgRef} className="w-full h-full bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl border border-slate-200 shadow-sm" />
      <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm text-xs font-medium text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
        {graph ? `${graph.nodes.length} nodes · ${graph.links.length} links` : ''}
      </div>
    </div>
  );
}