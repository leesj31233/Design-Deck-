/**
 * A small force simulation for the research map, in the spirit of Obsidian's graph view: nodes repel,
 * links pull like springs, everything drifts gently to the centre, and nodes never overlap. It runs
 * while it has energy (alpha) and sleeps when the layout is still; dragging or changing a setting
 * warms it up again. An arrange mode adds a pull toward a target place per node (field clusters,
 * a size ring, a year axis) so the same graph can be tidied without losing its motion.
 */
export interface SimNode { id: string; x: number; y: number; vx: number; vy: number; r: number; mass: number; fx?: number | null; fy?: number | null; tx?: number; ty?: number }
export interface SimLink { source: number; target: number; distance: number; strength: number }
export interface Forces { repel: number; linkDistance: number; linkStrength: number; gravity: number; arrange: number }

export const DEFAULT_FORCES: Forces = { repel: 1, linkDistance: 1, linkStrength: 1, gravity: 1, arrange: 0 };

export class Simulation {
  alpha = 1;
  private readonly decay = .0228; // ~300 ticks from 1 to the floor, like d3
  private readonly floor = .002;
  constructor(public nodes: SimNode[], public links: SimLink[], public forces: Forces = DEFAULT_FORCES) {}

  get asleep() { return this.alpha < this.floor; }
  reheat(alpha = .6) { this.alpha = Math.max(this.alpha, alpha); }

  tick() {
    if (this.asleep) return false;
    const { nodes, links, forces } = this, alpha = this.alpha, count = nodes.length;
    // Repulsion: every pair, scaled by size (a big field pushes harder); soft beyond 600 px.
    for (let a = 0; a < count; a++) {
      const p = nodes[a];
      for (let b = a + 1; b < count; b++) {
        const q = nodes[b];
        let dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
        if (d2 > 360000) continue;
        if (d2 < .01) { dx = (Math.random() - .5) * .1; dy = (Math.random() - .5) * .1; d2 = dx * dx + dy * dy; }
        const strength = -42 * forces.repel * alpha * (1 + (p.r + q.r) * .06) / d2;
        const fx = dx * strength, fy = dy * strength;
        p.vx += fx / p.mass; p.vy += fy / p.mass; q.vx -= fx / q.mass; q.vy -= fy / q.mass;
      }
    }
    // Links: springs toward a rest length that grows with the two nodes' size.
    for (const link of links) {
      const s = nodes[link.source], t = nodes[link.target];
      const dx = t.x + t.vx - s.x - s.vx, dy = t.y + t.vy - s.y - s.vy, distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const rest = (link.distance + s.r + t.r) * forces.linkDistance;
      const pull = (distance - rest) / distance * alpha * link.strength * forces.linkStrength * .5;
      const share = s.mass / (s.mass + t.mass);
      s.vx += dx * pull * (1 - share); s.vy += dy * pull * (1 - share);
      t.vx -= dx * pull * share; t.vy -= dy * pull * share;
    }
    for (const node of nodes) {
      // Gravity toward the centre, or toward the node's place in the current arrangement.
      const gx = forces.arrange > 0 && node.tx !== undefined ? node.tx : 0, gy = forces.arrange > 0 && node.ty !== undefined ? node.ty : 0;
      const pull = forces.arrange > 0 && node.tx !== undefined ? .08 * forces.arrange : .012 * forces.gravity;
      node.vx += (gx - node.x) * pull * alpha; node.vy += (gy - node.y) * pull * alpha;
    }
    // Collision: spheres keep their own space, with a little air between them.
    for (let a = 0; a < count; a++) {
      const p = nodes[a];
      for (let b = a + 1; b < count; b++) {
        // Big spheres keep room for their label below; dots only need a hair of air.
        const q = nodes[b], gap = p.r + q.r + 3 + Math.min(18, Math.max(p.r, q.r) * .45);
        let dx = q.x + q.vx - p.x - p.vx, dy = q.y + q.vy - p.y - p.vy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= gap * gap) continue;
        const d = Math.sqrt(d2) || .01; if (d2 < .0001) { dx = .01; dy = 0; }
        const push = (gap - d) / d * .5, share = p.mass / (p.mass + q.mass);
        p.vx -= dx * push * (1 - share); p.vy -= dy * push * (1 - share);
        q.vx += dx * push * share; q.vy += dy * push * share;
      }
    }
    for (const node of nodes) {
      if (node.fx != null) { node.x = node.fx; node.vx = 0; } else { node.vx *= .6; node.x += node.vx; }
      if (node.fy != null) { node.y = node.fy; node.vy = 0; } else { node.vy *= .6; node.y += node.vy; }
    }
    this.alpha += (0 - this.alpha) * this.decay;
    return true;
  }
}

/** Places for the arrange modes, in simulation space around (0, 0). */
export type Arrange = "free" | "fields" | "ring" | "years";
export function arrangeTargets(nodes: { kind: string; domain?: string; group?: string; weight: number; year?: number }[], mode: Arrange) {
  const targets: ({ x: number; y: number } | undefined)[] = nodes.map(() => undefined);
  if (mode === "free") return targets;
  if (mode === "fields") {
    // Each field gets a sector of a wide circle; its topics and papers gather there.
    const groups = [...new Set(nodes.map(node => node.group ?? node.domain ?? "other"))];
    const weights = groups.map(group => nodes.filter(node => (node.group ?? node.domain ?? "other") === group).reduce((sum, node) => sum + node.weight, 0));
    const total = weights.reduce((sum, value) => sum + value, 0) || 1;
    let start = -Math.PI / 2;
    const centre = new Map<string, { x: number; y: number }>();
    groups.forEach((group, index) => {
      const span = Math.PI * 2 * Math.max(.06, weights[index] / total), mid = start + span / 2, radius = groups.length === 1 ? 0 : 340;
      centre.set(group, { x: Math.cos(mid) * radius, y: Math.sin(mid) * radius }); start += span;
    });
    nodes.forEach((node, index) => { targets[index] = centre.get(node.group ?? node.domain ?? "other"); });
    return targets;
  }
  if (mode === "ring") {
    // Most-read first: the heaviest topics in the middle, lighter ones on wider rings.
    const order = nodes.map((node, index) => ({ node, index })).filter(entry => entry.node.kind !== "paper").sort((a, b) => b.node.weight - a.node.weight);
    order.forEach((entry, rank) => {
      const ring = rank === 0 ? 0 : Math.ceil(Math.sqrt(rank)), slots = Math.max(1, ring * 6), slot = rank - (ring - 1) * (ring - 1);
      const angle = slot / slots * Math.PI * 2;
      targets[entry.index] = { x: Math.cos(angle) * ring * 150, y: Math.sin(angle) * ring * 150 };
    });
    return targets;
  }
  // Years: papers on a time axis; topics float above their papers' mean year.
  const years = nodes.map(node => node.year).filter((year): year is number => Boolean(year));
  if (!years.length) return targets;
  const min = Math.min(...years), max = Math.max(...years), span = Math.max(1, max - min);
  nodes.forEach((node, index) => { if (node.year) targets[index] = { x: -600 + (node.year - min) / span * 1200, y: node.kind === "paper" ? 160 : -120 }; });
  return targets;
}
