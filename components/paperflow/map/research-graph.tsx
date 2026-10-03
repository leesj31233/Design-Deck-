"use client";
import { useEffect, useRef } from "react";
import type { MapEdge, MapNode } from "@/lib/paperflow/scholar/profile";

/**
 * The research map: Sigma.js (WebGL) on a graphology graph laid out by ForceAtlas2 — the same
 * engine family as the NAYSOR knowledge graph. Sphere size is how much of the library a topic,
 * author or journal holds, weighted by actual reading. Hover lights up a node's neighbourhood;
 * labels appear by importance as you zoom in.
 */
export function ResearchGraph({ nodes, edges, selected, onSelect, query }: { nodes: MapNode[]; edges: MapEdge[]; selected: string | null; onSelect: (id: string | null) => void; query: string }) {
  const container = useRef<HTMLDivElement>(null);
  const state = useRef<{ hovered: string | null; selected: string | null; query: string }>({ hovered: null, selected, query });
  const renderer = useRef<{ refresh: () => void; kill: () => void; getCamera: () => { animatedReset: (options?: object) => void } } | null>(null);
  const graphRef = useRef<{ neighbors: (node: string) => string[]; hasNode: (node: string) => boolean; getNodeAttribute: (node: string, key: string) => unknown } | null>(null);

  useEffect(() => {
    if (!container.current || !nodes.length) return;
    let cancelled = false, kill = () => {};
    void (async () => {
      const [{ default: Graph }, { default: Sigma }, { default: forceAtlas2 }] = await Promise.all([import("graphology"), import("sigma"), import("graphology-layout-forceatlas2")]);
      if (cancelled || !container.current) return;
      const graph = new Graph({ type: "undirected", multi: false });
      // Seed positions on rings by level so the layout converges into readable clusters.
      const ring: Record<MapNode["kind"], number> = { domain: 1, field: 3, subfield: 6, topic: 10, journal: 13, author: 15, paper: 18 };
      const domains = [...new Set(nodes.map(node => node.domain).filter(Boolean))];
      nodes.forEach((node, index) => {
        const sector = domains.indexOf(node.domain ?? "") + 1, angle = (sector / (domains.length + 1)) * Math.PI * 2 + index * .37;
        graph.addNode(node.id, { label: node.label, size: node.size, color: node.color, kind: node.kind, x: Math.cos(angle) * ring[node.kind], y: Math.sin(angle) * ring[node.kind], forceLabel: node.kind === "domain" || node.kind === "field" });
      });
      for (const edge of edges) if (graph.hasNode(edge.source) && graph.hasNode(edge.target) && edge.source !== edge.target && !graph.hasEdge(edge.source, edge.target)) graph.addEdge(edge.source, edge.target, { weight: edge.weight, size: Math.max(.4, Math.min(2.2, edge.weight)) });
      const settings = { ...forceAtlas2.inferSettings(graph), gravity: 1.1, scalingRatio: 18, strongGravityMode: false, barnesHutOptimize: graph.order > 400 };
      forceAtlas2.assign(graph, { iterations: graph.order > 600 ? 180 : 320, settings: { ...settings, adjustSizes: false } });
      // A second pass that accounts for sphere size, so neighbouring labels and spheres do not collide.
      forceAtlas2.assign(graph, { iterations: 80, settings: { ...settings, adjustSizes: true, scalingRatio: 26 } });
      const css = getComputedStyle(container.current), ink = css.getPropertyValue("--foreground").trim() || "#111", line = css.getPropertyValue("--line").trim() || "rgba(0,0,0,.1)";
      // Sigma parses hex/rgb only: fade a node by giving its colour a low alpha.
      const dim = (color: string) => { const hex = color.replace("#", ""); if (!/^[0-9a-f]{6}$/i.test(hex)) return "rgba(148,163,184,.18)"; const [r, g, b] = [0, 2, 4].map(at => parseInt(hex.slice(at, at + 2), 16)); return `rgba(${r},${g},${b},.16)`; };
      const sigma = new Sigma(graph, container.current, {
        renderEdgeLabels: false, labelRenderedSizeThreshold: 7, labelDensity: .9, labelGridCellSize: 90,
        labelFont: "Pretendard, 'Noto Sans KR', system-ui, sans-serif", labelSize: 12, labelWeight: "600", labelColor: { color: ink },
        defaultEdgeColor: line, zIndex: true, minCameraRatio: .08, maxCameraRatio: 4,
        nodeReducer: (node, data) => {
          const { hovered, selected: picked, query: text } = state.current, focus = hovered ?? picked;
          const result = { ...data } as Record<string, unknown>;
          if (text && String(data.label).toLowerCase().includes(text.toLowerCase())) { result.highlighted = true; result.forceLabel = true; result.zIndex = 2; }
          if (focus) {
            const near = node === focus || graph.areNeighbors(node, focus);
            if (!near) { result.color = dim(String(data.color)); result.label = ""; result.zIndex = 0; }
            else { result.forceLabel = true; result.zIndex = 1; if (node === focus) result.highlighted = true; }
          }
          return result;
        },
        edgeReducer: (edge, data) => {
          const { hovered, selected: picked } = state.current, focus = hovered ?? picked, result = { ...data } as Record<string, unknown>;
          if (focus && !graph.extremities(edge).includes(focus)) result.hidden = true;
          else if (focus) { result.color = "rgba(10,132,255,.55)"; result.size = Number(data.size ?? 1) + .6; }
          return result;
        }
      });
      sigma.on("enterNode", ({ node }) => { state.current.hovered = node; container.current?.style.setProperty("cursor", "pointer"); sigma.refresh(); });
      sigma.on("leaveNode", () => { state.current.hovered = null; container.current?.style.removeProperty("cursor"); sigma.refresh(); });
      sigma.on("clickNode", ({ node }) => onSelect(node));
      sigma.on("clickStage", () => onSelect(null));
      renderer.current = sigma as unknown as typeof renderer.current;
      graphRef.current = graph as unknown as typeof graphRef.current;
      kill = () => sigma.kill();
    })();
    return () => { cancelled = true; kill(); renderer.current = null; graphRef.current = null; };
  }, [nodes, edges, onSelect]);

  useEffect(() => { state.current.selected = selected; state.current.query = query; renderer.current?.refresh(); }, [selected, query]);

  return <div className="pf-graph-wrap">
    <div ref={container} className="pf-graph-canvas" role="img" aria-label={`연구맵: 노드 ${nodes.length}개, 연결 ${edges.length}개`}/>
    <button type="button" className="pf-graph-reset" onClick={() => renderer.current?.getCamera().animatedReset({ duration: 400 })}>전체 보기</button>
  </div>;
}
