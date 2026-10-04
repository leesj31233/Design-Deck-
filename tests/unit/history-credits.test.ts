import { describe, expect, it } from "vitest";
import { clearHistory, recordStep, redo, undo } from "@/lib/paperflow/state/history";
import { creditsForUsage } from "@/lib/paperflow/cloud/plans";
import { guideCreditEstimate } from "@/lib/paperflow/guide/cost";
import { validateGuide } from "@/lib/paperflow/guide/guide";

describe("undo / redo", () => {
  it("reverses steps in order and replays them, and a new step clears the redo list", async () => {
    clearHistory();
    const state: string[] = [];
    const push = (value: string) => recordStep({ label: value, undo: () => { state.pop(); }, redo: () => { state.push(value); } });
    state.push("a"); push("a"); state.push("b"); push("b");
    expect(await undo()).toBe("b"); expect(state).toEqual(["a"]);
    expect(await redo()).toBe("b"); expect(state).toEqual(["a", "b"]);
    await undo(); state.push("c"); push("c");
    expect(await redo()).toBeNull();
    expect(state).toEqual(["a", "c"]);
  });
});

describe("credits by real usage", () => {
  it("prices the guide model higher than translation and never charges zero", () => {
    expect(creditsForUsage("gpt-4.1-mini-2025-04-14", { input: 1000, output: 400 })).toBe(4);
    expect(creditsForUsage("gpt-4.1-2025-04-14", { input: 20000, output: 4000 })).toBe(240);
    expect(creditsForUsage("gpt-4.1", { input: 1, output: 0 })).toBe(1);
    expect(guideCreditEstimate(60000)).toBeGreaterThan(150);
  });
});

describe("AI guide v2", () => {
  it("keeps margin notes, kinds, the storyline and key numbers", () => {
    const byWire = new Map([["u0", { unitId: "a", page: 1, text: "Methane cofiring reduced NOx by 69.8% at a 40% cofiring rate." }]]);
    const guide = validateGuide({ overview: "개요", flow: ["석탄 NOx 문제", "메탄 혼소", "70%↓"], takeaway: "40% 혼소가 핵심", contributions: [], method: "",
      findings: [{ point: "NOx 69.8% 감소", unit: "u0", quote: "reduced NOx by 69.8% at a 40% cofiring rate", why: "", note: "40% → NOx 70%↓", kind: "number" }, { point: "x", unit: "u0", quote: "", why: "", note: "", kind: "weird" }],
      metrics: [{ label: "NOx 저감", value: "69.8%", unit: "u0" }], terms: [], limitations: [], questions: [] }, byWire)!;
    expect(guide.flow).toEqual(["석탄 NOx 문제", "메탄 혼소", "70%↓"]);
    expect(guide.findings[0]).toMatchObject({ note: "40% → NOx 70%↓", kind: "number" });
    expect(guide.findings[1].kind).toBe("result");
    expect(guide.metrics[0]).toMatchObject({ label: "NOx 저감", value: "69.8%", page: 1 });
  });
});
