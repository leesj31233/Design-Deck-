import { describe, expect, it } from "vitest";
import { clearHistory, recordStep, redo, undo } from "@/lib/paperflow/state/history";
import { creditsForUsage } from "@/lib/paperflow/cloud/plans";
import { guideCreditEstimate } from "@/lib/paperflow/guide/cost";

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
    // A whole guide (gpt-5.1 brief + gpt-5-mini page groups) for a 12-page paper: a few hundred credits.
    expect(guideCreditEstimate(40000)).toBeGreaterThan(150);
    expect(guideCreditEstimate(40000)).toBeLessThan(700);
    expect(creditsForUsage("gpt-5.1-2025-11-13", { input: 11000, output: 3600 })).toBe(166);
  });
});
