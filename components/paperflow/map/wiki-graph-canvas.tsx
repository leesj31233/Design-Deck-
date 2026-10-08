"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { arrangeTargets, Simulation, type Arrange, type Forces, type SimLink, type SimNode } from "@/lib/paperflow/map/physics";
import type { WikiEdge, WikiNode } from "@/lib/paperflow/map/wiki-graph";

/** The map is drawn on a light ground only (the dark universe and ivory grounds were removed). */
export type MapTheme = "paper";
export interface WikiGraphHandle { fit: () => void; flyTo: (id: string) => void; shake: () => void }
interface Props { nodes: WikiNode[]; edges: WikiEdge[]; theme: MapTheme; arrange: Arrange; forces: Forces; labels: "auto" | "all" | "fields"; selected: string | null; query: string; onSelect: (id: string | null) => void }

const THEMES = {
  paper: { top: "#fcfcfb", bottom: "#f1f3f2", edge: "rgba(30,40,50,", label: "#1d232b", sub: "rgba(29,35,43,.62)", halo: false, stroke: "rgba(255,255,255,.95)", tip: "rgba(255,255,255,.97)", tipInk: "#1d232b" }
} as const;
const FONT = "Pretendard, 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif";
const LINK_DISTANCE: Record<WikiEdge["kind"], number> = { tree: 46, paper: 18, related: 210, author: 26, journal: 30 };
const LINK_STRENGTH: Record<WikiEdge["kind"], number> = { tree: .9, paper: .7, related: .04, author: .25, journal: .2 };

/**
 * The research map, drawn like Obsidian's graph view: a living force layout on a canvas. Drag a
 * sphere and its neighbours follow and settle back; scroll to zoom around the pointer; drag the sky
 * to pan. Pointing at a sphere lights its neighbourhood and fades the rest; paper dots show their
 * title on hover only.
 */
export const WikiGraphCanvas = forwardRef<WikiGraphHandle, Props>(function WikiGraphCanvas({ nodes, edges, theme, arrange, forces, labels, selected, query, onSelect }, handle) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ theme, labels, selected, query, onSelect });
  live.current = { theme, labels, selected, query, onSelect };
  const world = useRef<{ sim: Simulation; data: WikiNode[]; index: Map<string, number>; neighbours: Set<number>[]; links: (SimLink & { kind: WikiEdge["kind"]; weight: number })[]; fade: number[] } | null>(null);
  const camera = useRef({ x: 0, y: 0, k: 1, tx: 0, ty: 0, tk: 1 });
  const pointer = useRef<{ hover: number; drag: number; panning: boolean; moved: boolean; sx: number; sy: number; cx: number; cy: number }>({ hover: -1, drag: -1, panning: false, moved: false, sx: 0, sy: 0, cx: 0, cy: 0 });
  const wake = useRef<() => void>(() => {});
  // Fit the camera once the layout has (nearly) settled: on first show and after a rearrangement.
  const refit = useRef(true);
  const stars = useRef<{ x: number; y: number; r: number; phase: number }[]>([]);

  // Build (or rebuild) the simulation; spheres that survive a change keep their place.
  useEffect(() => {
    const previous = world.current, old = new Map(previous?.data.map((node, index) => [node.id, previous.sim.nodes[index]]) ?? []);
    const index = new Map(nodes.map((node, at) => [node.id, at]));
    const simNodes: SimNode[] = nodes.map((node, at) => {
      const kept = old.get(node.id);
      if (kept) return { ...kept, r: node.r, mass: 1 + node.r / 6, fx: null, fy: null };
      // A new sphere starts beside a neighbour, so it grows out of the graph instead of flying in.
      const anchor = edges.find(edge => edge.target === node.id && old.has(edge.source)) ?? edges.find(edge => edge.source === node.id && old.has(edge.target));
      const near = anchor ? old.get(anchor.source === node.id ? anchor.target : anchor.source) : undefined;
      const angle = at * 2.39996, spread = near ? 30 : 60 + Math.sqrt(at) * 26;
      return { id: node.id, x: (near?.x ?? 0) + Math.cos(angle) * spread, y: (near?.y ?? 0) + Math.sin(angle) * spread, vx: 0, vy: 0, r: node.r, mass: 1 + node.r / 6 };
    });
    const links = edges.map(edge => ({ source: index.get(edge.source)!, target: index.get(edge.target)!, distance: LINK_DISTANCE[edge.kind], strength: LINK_STRENGTH[edge.kind] * Math.min(2, edge.weight || 1), kind: edge.kind, weight: edge.weight }));
    const neighbours = nodes.map(() => new Set<number>());
    for (const link of links) { neighbours[link.source].add(link.target); neighbours[link.target].add(link.source); }
    const sim = new Simulation(simNodes, links, forces);
    sim.alpha = previous ? .5 : 1;
    world.current = { sim, data: nodes, index, neighbours, links, fade: nodes.map(() => 1) };
    wake.current();
  }, [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  // Forces and arrangement change in place: the graph flows to its new shape.
  useEffect(() => {
    const state = world.current;
    if (!state) return;
    const targets = arrangeTargets(state.data.map(node => ({ kind: node.kind, group: node.field || undefined, weight: node.weight, year: node.year })), arrange);
    state.sim.nodes.forEach((node, at) => { node.tx = targets[at]?.x; node.ty = targets[at]?.y; });
    state.sim.forces = { ...forces, arrange: arrange === "free" ? 0 : 1 };
    state.sim.reheat(arrange === "free" ? .35 : .8);
    if (arrange !== "free") refit.current = true;
    wake.current();
  }, [arrange, forces, nodes]);

  useEffect(() => { wake.current(); }, [theme, labels, selected, query]);

  useImperativeHandle(handle, () => ({
    fit: () => fit(),
    flyTo: id => { const state = world.current, at = state?.index.get(id); if (!state || at === undefined) return; const node = state.sim.nodes[at]; Object.assign(camera.current, { tx: node.x, ty: node.y, tk: Math.max(1.1, Math.min(2.2, 60 / node.r)) }); wake.current(); },
    shake: () => { const state = world.current; if (!state) return; for (const node of state.sim.nodes) { node.vx += (Math.random() - .5) * 30; node.vy += (Math.random() - .5) * 30; } state.sim.reheat(.9); wake.current(); }
  }));

  // The panels laid over the map (pool, controls, hint, inspector), in canvas pixels; read at most every 400 ms.
  const panelCache = useRef<{ at: number; rects: { left: number; right: number; top: number; bottom: number }[] }>({ at: -1e9, rects: [] });
  function panelRects(fresh = false) {
    const element = canvas.current, now = performance.now();
    if (!element || (!fresh && now - panelCache.current.at < 400)) return panelCache.current.rects;
    const frame = element.getBoundingClientRect();
    const rects = [...(element.parentElement?.querySelectorAll<HTMLElement>(".pf-wm-pool, .pf-wm-controls, .pf-wm-hint, .pf-map-inspector") ?? [])]
      .map(panel => panel.getBoundingClientRect()).filter(rect => rect.width && rect.height)
      .map(rect => ({ left: rect.left - frame.left - 8, right: rect.right - frame.left + 8, top: rect.top - frame.top - 8, bottom: rect.bottom - frame.top + 8 }));
    panelCache.current = { at: now, rects };
    return rects;
  }

  function fit() {
    const state = world.current, element = canvas.current;
    if (!state || !element || !state.sim.nodes.length) return;
    const xs = state.sim.nodes.map(node => node.x), ys = state.sim.nodes.map(node => node.y);
    const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 60, minY = Math.min(...ys) - 60, maxY = Math.max(...ys) + 60;
    // Leave room for the research-pool panel on the left (wide screens only).
    const width = element.clientWidth, height = element.clientHeight, side = width > 900 ? 290 : 0;
    let k = Math.max(.15, Math.min(2, Math.min((width - side) / (maxX - minX), (height - 40) / (maxY - minY))));
    const tx = (minX + maxX) / 2, ty = (minY + maxY) / 2;
    // The panels over the map (pool, controls, hint, inspector): zoom out until no sphere sits under one.
    const panels = panelRects(true);
    // At each zoom (largest first) try the plain centre, then small pans (nearest first): the first view
    // where every sphere is on screen and none sits under a panel wins.
    const fits = (scale: number, dx: number, dy: number) => state.sim.nodes.every(node => {
      const sx = (node.x - tx) * scale + width / 2 + side / 2 + dx, sy = (node.y - ty) * scale + height / 2 + dy, r = node.r * scale;
      if (sx - r < 4 || sx + r > width - 4 || sy - r < 4 || sy + r > height - 4) return false;
      return !panels.some(panel => sx + r > panel.left && sx - r < panel.right && sy + r > panel.top && sy - r < panel.bottom);
    });
    const shifts = [0, -1, 1, -2, 2, -3, 3, -4, 4].flatMap(i => [0, 1, -1, 2, -2, 3, -3].map(j => ({ dx: i * width / 24, dy: j * height / 20 })))
      .sort((p, q) => Math.hypot(p.dx, p.dy) - Math.hypot(q.dx, q.dy));
    let shift = { dx: 0, dy: 0 };
    for (let step = 0; step < 14; step++) {
      const found = shifts.find(candidate => fits(k, candidate.dx, candidate.dy));
      if (found) { shift = found; break; }
      if (k <= .15) break;
      k = Math.max(.15, k * .93);
    }
    Object.assign(camera.current, { tx: tx - (side / 2 + shift.dx) / k, ty: ty - shift.dy / k, tk: k });
    wake.current();
  }

  // The frame loop: runs while the simulation, the camera or a fade is moving, then sleeps.
  useEffect(() => {
    const element = canvas.current!, context = element.getContext("2d")!;
    let frame = 0, running = false, fitted = false, width = 0, height = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1); width = element.clientWidth; height = element.clientHeight;
      element.width = Math.round(width * dpr); element.height = Math.round(height * dpr);
      stars.current = Array.from({ length: Math.round(width * height / 5200) }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + .2, phase: Math.random() * Math.PI * 2 }));
      wake.current();
    };
    const observer = new ResizeObserver(resize); observer.observe(element);
    const toWorld = (sx: number, sy: number) => { const c = camera.current; return { x: (sx - width / 2) / c.k + c.x, y: (sy - height / 2) / c.k + c.y }; };
    const hit = (sx: number, sy: number) => {
      const state = world.current; if (!state) return -1;
      const point = toWorld(sx, sy); let best = -1, distance = Infinity;
      state.sim.nodes.forEach((node, at) => { const d = Math.hypot(node.x - point.x, node.y - point.y) - node.r - 4 / camera.current.k; if (d < 0 && d < distance) { distance = d; best = at; } });
      return best;
    };
    const draw = (time: number) => {
      const state = world.current, look = THEMES[live.current.theme], c = camera.current;
      let busy = false;
      if (state) {
        for (let step = 0; step < 2; step++) if (state.sim.tick()) busy = true;
        if (refit.current && state.sim.alpha < .12) { refit.current = false; fit(); }
        else if (!fitted && state.sim.alpha < .35) { fitted = true; fit(); }
      }
      // Camera eases toward its target (fly-to, fit).
      const ease = .14;
      if (Math.abs(c.tx - c.x) + Math.abs(c.ty - c.y) > .05 || Math.abs(c.tk - c.k) > .0005) { c.x += (c.tx - c.x) * ease; c.y += (c.ty - c.y) * ease; c.k += (c.tk - c.k) * ease; busy = true; }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const background = context.createRadialGradient(width * .5, height * .42, 0, width * .5, height * .5, Math.max(width, height) * .75);
      background.addColorStop(0, look.top); background.addColorStop(1, look.bottom);
      context.fillStyle = background; context.fillRect(0, 0, width, height);
      if (look.halo) {
        busy = true; // the sky twinkles
        for (const star of stars.current) { context.globalAlpha = .25 + .45 * (0.5 + 0.5 * Math.sin(time / 1400 + star.phase)); context.fillStyle = "#cdd6ff"; context.beginPath(); context.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2); context.fill(); }
        context.globalAlpha = 1;
      }
      if (!state) { if (busy) schedule(); else running = false; return; }
      const { sim, data, neighbours, links, fade } = state, { hover, drag } = pointer.current;
      const focus = hover >= 0 ? hover : drag >= 0 ? drag : state.index.get(live.current.selected ?? "") ?? -1;
      const text = live.current.query.trim().toLowerCase();
      for (let at = 0; at < data.length; at++) {
        const goal = focus < 0 || at === focus || neighbours[focus].has(at) ? 1 : .1;
        if (Math.abs(fade[at] - goal) > .01) { fade[at] += (goal - fade[at]) * .2; busy = true; } else fade[at] = goal;
      }
      context.setTransform(dpr * c.k, 0, 0, dpr * c.k, dpr * (width / 2 - c.x * c.k), dpr * (height / 2 - c.y * c.k));
      // Links: related fields as soft arcs, the tree as fine lines, papers as hairlines.
      for (const link of links) {
        const s = sim.nodes[link.source], t = sim.nodes[link.target], alpha = Math.min(fade[link.source], fade[link.target]);
        const lit = focus >= 0 && (link.source === focus || link.target === focus);
        const base = link.kind === "related" ? .16 : link.kind === "tree" ? .3 : .16;
        context.strokeStyle = lit ? data[focus].color : `${look.edge}${(base * alpha).toFixed(3)})`;
        context.globalAlpha = lit ? .85 : 1;
        context.lineWidth = (lit ? 1.6 : link.kind === "related" ? Math.min(3, .6 + link.weight * .4) : link.kind === "tree" ? 1.1 : .7) / Math.sqrt(c.k);
        context.beginPath(); context.moveTo(s.x, s.y);
        if (link.kind === "related") { const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2, dx = t.x - s.x, dy = t.y - s.y; context.setLineDash([5 / c.k, 6 / c.k]); context.quadraticCurveTo(mx - dy * .18, my + dx * .18, t.x, t.y); }
        else context.lineTo(t.x, t.y);
        context.stroke(); context.setLineDash([]); context.globalAlpha = 1;
      }
      // Spheres: big fields first, so dots sit on top of them.
      const order = data.map((_, at) => at).sort((a, b) => data[b].r - data[a].r);
      for (const at of order) {
        const node = data[at], p = sim.nodes[at], alpha = fade[at];
        context.globalAlpha = alpha;
        if (look.halo && node.kind !== "paper") {
          const glow = context.createRadialGradient(p.x, p.y, node.r * .4, p.x, p.y, node.r * 2.4);
          glow.addColorStop(0, `${node.color}66`); glow.addColorStop(1, `${node.color}00`);
          context.fillStyle = glow; context.beginPath(); context.arc(p.x, p.y, node.r * 2.4, 0, Math.PI * 2); context.fill();
        }
        const fill = context.createRadialGradient(p.x - node.r * .35, p.y - node.r * .35, node.r * .1, p.x, p.y, node.r);
        fill.addColorStop(0, mix(node.color, "#ffffff", node.kind === "paper" ? .15 : .35)); fill.addColorStop(1, node.color);
        context.fillStyle = node.kind === "paper" ? node.color : fill;
        context.beginPath(); context.arc(p.x, p.y, node.r, 0, Math.PI * 2); context.fill();
        if (node.kind !== "paper") { context.strokeStyle = look.stroke; context.lineWidth = 1.2 / c.k; context.stroke(); }
        if (at === focus || node.id === live.current.selected) { context.strokeStyle = node.color; context.lineWidth = 2.4 / c.k; context.beginPath(); context.arc(p.x, p.y, node.r + 5 / c.k, 0, Math.PI * 2); context.stroke(); }
        if (text && node.label.toLowerCase().includes(text)) { context.strokeStyle = look.label; context.lineWidth = 1.6 / c.k; context.setLineDash([3 / c.k, 3 / c.k]); context.beginPath(); context.arc(p.x, p.y, node.r + 8 / c.k, 0, Math.PI * 2); context.stroke(); context.setLineDash([]); }
      }
      context.globalAlpha = 1;
      // Labels: fields always; subfields and topics as you zoom in or point at them; papers never.
      context.textAlign = "center"; context.textBaseline = "top";
      const mode = live.current.labels;
      // Labels are placed most important first (the pointed-at node and its neighbours, fields, then by
      // size); each tries below, right, left and above of its sphere and takes the first spot that hits
      // no placed label and no other sphere or dot. A minor label with no free spot waits for zoom or hover.
      type Box = { x0: number; y0: number; x1: number; y1: number };
      // The panels are obstacles too (in world units at the current camera).
      const placed: Box[] = panelRects().map(rect => { const a = toWorld(rect.left, rect.top), b = toWorld(rect.right, rect.bottom); return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }; }), gap = 4 / c.k;
      const clear = (box: Box, own: number) => !placed.some(other => box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0)
        && !sim.nodes.some((other, index) => index !== own && fade[index] > .3 && other.x + other.r > box.x0 && other.x - other.r < box.x1 && other.y + other.r > box.y0 && other.y - other.r < box.y1);
      const wanted = order.flatMap(at => {
        const node = data[at];
        if (node.kind === "paper" || fade[at] < .3) return [];
        const near = focus >= 0 && (at === focus || neighbours[focus].has(at)), searched = Boolean(text && node.label.toLowerCase().includes(text));
        const show = node.kind === "field" || node.kind === "unsorted" || near || searched || (mode === "all") || (mode === "auto" && (node.kind === "subfield" ? c.k > .75 : node.kind === "topic" ? c.k > 1.25 : c.k > 1));
        if (!show) return [];
        const rank = (near || searched ? 0 : node.kind === "field" || node.kind === "unsorted" ? 1 : 2) * 1e6 - sim.nodes[at].r;
        return [{ at, node, near, must: near || searched || node.kind === "field" || node.kind === "unsorted", rank }];
      }).sort((a, b) => a.rank - b.rank);
      for (const { at, node, near, must } of wanted) {
        const p = sim.nodes[at];
        const size = (node.kind === "field" ? 13.5 : node.kind === "subfield" ? 11.5 : 10.5) / Math.max(.75, Math.min(1.6, c.k));
        context.font = `${node.kind === "field" ? 700 : 600} ${size}px ${FONT}`;
        const label = node.label.length > 34 ? `${node.label.slice(0, 33)}…` : node.label;
        const w = context.measureText(label).width, h = size * 1.25, off = node.r + 5 / c.k;
        const spots: (Box & { align: CanvasTextAlign; x: number; y: number })[] = [
          { x0: p.x - w / 2, y0: p.y + off, x1: p.x + w / 2, y1: p.y + off + h, align: "center", x: p.x, y: p.y + off },
          { x0: p.x + off, y0: p.y - h / 2, x1: p.x + off + w, y1: p.y + h / 2, align: "left", x: p.x + off, y: p.y - h / 2 },
          { x0: p.x - off - w, y0: p.y - h / 2, x1: p.x - off, y1: p.y + h / 2, align: "right", x: p.x - off, y: p.y - h / 2 },
          { x0: p.x - w / 2, y0: p.y - off - h, x1: p.x + w / 2, y1: p.y - off, align: "center", x: p.x, y: p.y - off - h }
        ];
        const spot = spots.find(candidate => clear({ x0: candidate.x0 - gap, y0: candidate.y0 - gap, x1: candidate.x1 + gap, y1: candidate.y1 + gap }, at)) ?? (must ? spots[0] : null);
        if (!spot) continue;
        placed.push(spot);
        context.textAlign = spot.align;
        context.globalAlpha = fade[at];
        if (look.halo) { context.shadowColor = "rgba(0,0,0,.7)"; context.shadowBlur = 6; } else { context.lineWidth = 3 / c.k; context.strokeStyle = look.top; context.strokeText(label, spot.x, spot.y); }
        context.fillStyle = node.kind === "field" || near ? look.label : look.sub;
        context.fillText(label, spot.x, spot.y);
        context.shadowBlur = 0;
      }
      context.textAlign = "center";
      context.globalAlpha = 1;
      // A paper's title appears beside its dot on hover.
      if (hover >= 0 && data[hover].kind === "paper") {
        const p = sim.nodes[hover], sx = (p.x - c.x) * c.k + width / 2, sy = (p.y - c.y) * c.k + height / 2;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.font = `600 12px ${FONT}`;
        const title = data[hover].label.length > 70 ? `${data[hover].label.slice(0, 69)}…` : data[hover].label, w = context.measureText(title).width + 20;
        const x = Math.min(width - w - 8, sx + 12), y = Math.max(8, sy - 34);
        context.fillStyle = look.tip; context.beginPath(); context.roundRect(x, y, w, 26, 8); context.fill();
        context.fillStyle = look.tipInk; context.textAlign = "left"; context.textBaseline = "middle"; context.fillText(title, x + 10, y + 13);
      }
      if (busy || pointer.current.drag >= 0) schedule(); else running = false;
    };
    const schedule = () => { frame = requestAnimationFrame(draw); };
    wake.current = () => { if (!running) { running = true; schedule(); } };

    const position = (event: PointerEvent | WheelEvent) => { const bounds = element.getBoundingClientRect(); return { sx: event.clientX - bounds.left, sy: event.clientY - bounds.top }; };
    const down = (event: PointerEvent) => {
      const { sx, sy } = position(event), at = hit(sx, sy), state = world.current;
      element.setPointerCapture(event.pointerId);
      Object.assign(pointer.current, { drag: at, panning: at < 0, moved: false, sx, sy, cx: camera.current.x, cy: camera.current.y });
      if (at >= 0 && state) { const node = state.sim.nodes[at]; node.fx = node.x; node.fy = node.y; state.sim.reheat(.3); }
      wake.current();
    };
    const move = (event: PointerEvent) => {
      const { sx, sy } = position(event), state = world.current, p = pointer.current;
      if (p.drag >= 0 && state) {
        const point = toWorld(sx, sy), node = state.sim.nodes[p.drag];
        node.fx = point.x; node.fy = point.y; state.sim.reheat(.3);
        if (Math.hypot(sx - p.sx, sy - p.sy) > 3) p.moved = true;
      } else if (p.panning) {
        const c = camera.current; c.tx = c.x = p.cx - (sx - p.sx) / c.k; c.ty = c.y = p.cy - (sy - p.sy) / c.k;
        if (Math.hypot(sx - p.sx, sy - p.sy) > 3) p.moved = true;
      } else {
        const at = hit(sx, sy);
        if (at !== p.hover) { p.hover = at; element.style.cursor = at >= 0 ? "pointer" : "grab"; }
      }
      wake.current();
    };
    const up = (event: PointerEvent) => {
      const p = pointer.current, state = world.current;
      if (p.drag >= 0 && state) {
        const node = state.sim.nodes[p.drag];
        // Let go and it rejoins the flow (Obsidian-style); a click selects.
        node.fx = null; node.fy = null; state.sim.reheat(.25);
        if (!p.moved) live.current.onSelect(state.data[p.drag].id);
      } else if (p.panning && !p.moved) live.current.onSelect(null);
      element.releasePointerCapture?.(event.pointerId);
      Object.assign(p, { drag: -1, panning: false });
      wake.current();
    };
    const leave = () => { pointer.current.hover = -1; wake.current(); };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const { sx, sy } = position(event), c = camera.current, before = toWorld(sx, sy);
      const k = Math.max(.12, Math.min(4, c.tk * Math.exp(-event.deltaY * .0015)));
      c.k = c.tk = k;
      const after = toWorld(sx, sy);
      c.x = c.tx = c.x + before.x - after.x; c.y = c.ty = c.y + before.y - after.y;
      wake.current();
    };
    element.addEventListener("pointerdown", down); element.addEventListener("pointermove", move); element.addEventListener("pointerup", up);
    element.addEventListener("pointerleave", leave); element.addEventListener("wheel", wheel, { passive: false });
    resize();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); wake.current = () => {};
      element.removeEventListener("pointerdown", down); element.removeEventListener("pointermove", move); element.removeEventListener("pointerup", up);
      element.removeEventListener("pointerleave", leave); element.removeEventListener("wheel", wheel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={canvas} className="pf-wiki-canvas" role="img" aria-label={`연구맵: 노드 ${nodes.length}개, 연결 ${edges.length}개`} style={{ cursor: "grab" }}/>;
});

function mix(a: string, b: string, amount: number) {
  const parse = (hex: string) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return a;
  const [x, y] = [parse(a), parse(b)];
  return `#${x.map((value, at) => Math.round(value + (y[at] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}
