import { describe, expect, it } from "vitest";
import { arrangeTargets, Simulation, type SimNode } from "../../lib/paperflow/map/physics";

const node = (id: string, r: number, x = 0, y = 0): SimNode => ({ id, x, y, vx: 0, vy: 0, r, mass: 1 + r / 6 });
const overlaps = (nodes: SimNode[]) => { let worst = 0; for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) worst = Math.max(worst, nodes[a].r + nodes[b].r - Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y)); return worst; };

describe("research map physics", () => {
  it("settles a crowded graph without spheres overlapping, then sleeps", () => {
    const nodes = [node("a", 46), node("b", 40, 5), node("c", 30, -5, 3), ...Array.from({ length: 40 }, (_, at) => node(`p${at}`, 4, Math.cos(at) * 10, Math.sin(at) * 10))];
    const links = nodes.slice(3).map((_, at) => ({ source: at % 3, target: at + 3, distance: 18, strength: .7 }));
    const sim = new Simulation(nodes, links);
    let ticks = 0;
    while (sim.tick() && ticks < 2000) ticks++;
    expect(sim.asleep).toBe(true);
    expect(overlaps(nodes)).toBeLessThan(1.5);
  });
  it("places fields in their own sectors when arranged by field", () => {
    const targets = arrangeTargets([{ kind: "field", group: "a", weight: 3 }, { kind: "field", group: "b", weight: 1 }, { kind: "paper", group: "a", weight: 1 }], "fields");
    expect(targets[0]).toEqual(targets[2]);
    expect(targets[0]).not.toEqual(targets[1]);
  });
});
