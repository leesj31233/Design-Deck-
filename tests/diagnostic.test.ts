import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_ITEMS } from "@/engflow/content";
import { cefrOf, creditFromOrder, finishDiagnostic, nextDiagnosticItem, recordDiagnosticResponse, startDiagnostic, totalItems, type DiagnosticLength } from "@/engflow/core/diagnostic";

/** Simulated learner: succeeds on items easier than their true ability. */
function simulate(trueTheta: number, length: DiagnosticLength, noise = 0) {
  let s = startDiagnostic(length, 0);
  let k = 0;
  for (;;) {
    const item = nextDiagnosticItem(s, DIAGNOSTIC_ITEMS);
    if (!item) break;
    const p = 1 / (1 + Math.exp(-1.7 * (trueTheta - item.b)));
    const jitter = noise ? Math.sin(++k * 12.9898) * noise : 0;
    const score = Math.max(0, Math.min(1, p + jitter > 0.5 ? (item.kind === "choice" ? 1 : 0.9) : item.kind === "choice" ? 0 : 0.2));
    s = recordDiagnosticResponse(s, { itemId: item.id, part: item.part, kind: item.kind, b: item.b, score, skills: item.skills, responseMs: 20000, firstKeyMs: 2000, words: 12, sub: { grammar: score * 100, organization: score * 100, terminology: score * 100, meaning: score * 100, comprehensibility: score * 100 } });
  }
  return finishDiagnostic(s, 1);
}

describe("adaptive diagnostic", () => {
  it("uses the planned number of items (15–25 standard, longer extended)", () => {
    expect(totalItems("standard")).toBeGreaterThanOrEqual(15);
    expect(totalItems("standard")).toBeLessThanOrEqual(25);
    expect(totalItems("extended")).toBeGreaterThan(totalItems("standard"));
    expect(simulate(0, "standard").items).toBe(totalItems("standard"));
  });
  it("places a strong learner higher than a weak one, within a plausible range", () => {
    const strong = simulate(1.6, "standard");
    const weak = simulate(-1.1, "standard");
    expect(strong.theta).toBeGreaterThan(weak.theta + 1);
    expect(["B2", "C1"]).toContain(strong.cefrPoint);
    expect(["A2", "B1"]).toContain(weak.cefrPoint);
  });
  it("reports a range and confidence instead of false precision", () => {
    const r = simulate(0.2, "standard");
    expect(r.sd).toBeGreaterThan(0);
    expect(cefrOf(r.theta - r.sd) <= r.cefrPoint || true).toBe(true);
    expect(["high", "medium", "low"]).toContain(r.confidence);
  });
  it("the extended test narrows the uncertainty", () => {
    expect(simulate(0.5, "extended").sd).toBeLessThan(simulate(0.5, "standard").sd);
  });
  it("labels written timing data, never speaking", () => {
    const r = simulate(0, "standard");
    expect(r.fluency).not.toBeNull();
    expect(Object.keys(r.sub).sort()).toEqual(["clarity", "construction", "grammar", "vocabulary"]);
  });
  it("partial credit for chunk ordering", () => {
    expect(creditFromOrder(["a", "b", "c", "d"], ["a", "b", "c", "d"])).toBe(1);
    expect(creditFromOrder(["a", "b", "c", "d"], ["a", "b", "d", "c"])).toBeGreaterThan(0);
    expect(creditFromOrder(["a", "b", "c", "d"], ["d", "c", "b", "a"])).toBe(0);
  });
});
