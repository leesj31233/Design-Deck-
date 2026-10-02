import { describe, expect, it } from "vitest";
import { makeTranslationBatches, runTranslationScheduler } from "../../lib/paperflow/translation/scheduler";
import { partitionTranslationResults } from "../../lib/paperflow/translation/block-contract";
import { ResearchHttpError } from "../../lib/paperflow/translation/research-api";
import { manifestCounts, type TranslationManifest } from "../../lib/paperflow/translation/manifest";

const passages = Array.from({ length: 13 }, (_, index) => ({ id: `u${index}`, text: `Technical sentence number ${index} describes alkali slagging in boilers.` }));
const ok = (group: { id: string }[]) => ({ results: group.map(item => ({ id: item.id, text: "한국어 번역이다." })), missing: [] });
const options = { maxPassages: 6, maxChars: 4200, concurrency: 3, maxConcurrency: 4 };

describe("result contract", () => {
  it("keeps valid items, drops unknown or duplicate ids, and rejects untranslated prose", () => {
    const source = passages.slice(0, 3);
    const result = partitionTranslationResults(source, [{ id: "u0", text: "첫째이다." }, { id: "u0", text: "중복" }, { id: "zz", text: "추가" }, { id: "u1", text: "Technical sentence left in English." }]);
    expect(result.results).toEqual([{ id: "u0", text: "첫째이다." }]);
    expect(result.missing).toEqual(["u1", "u2"]);
  });
  it("accepts a heading made only of technical terms", () => {
    const heading = [{ id: "h", text: "2.2. Silicate melt-induced slagging (ash fusion)", role: "heading" as const }];
    expect(partitionTranslationResults(heading, [{ id: "h", text: "2.2. Silicate melt-induced slagging (ash fusion)" }]).missing).toEqual([]);
  });
  it("accepts a short label that legitimately stays in English", () => {
    expect(partitionTranslationResults([{ id: "h", text: "CFD" }], [{ id: "h", text: "CFD" }]).missing).toEqual([]);
  });
});

describe("scheduler", () => {
  it("batches by passage count and character budget", () => {
    expect(makeTranslationBatches(passages, 6, 4200).map(batch => batch.passages.length)).toEqual([6, 6, 1]);
  });
  it("saves the valid part of a response and retries only the missing passage", async () => {
    const calls: string[][] = [], saved: string[] = [];
    let first = true;
    const state = await runTranslationScheduler(passages.slice(0, 6), new AbortController().signal, async group => {
      calls.push(group.map(item => item.id));
      if (first) { first = false; return { results: group.slice(1).map(item => ({ id: item.id, text: "번역이다." })), missing: [group[0].id] }; }
      return ok(group);
    }, async results => { saved.push(...results.map(item => item.id)); }, () => { throw new Error("must recover"); }, undefined, options);
    expect(calls).toEqual([["u0", "u1", "u2", "u3", "u4", "u5"], ["u0"]]);
    expect(saved.sort()).toEqual(["u0", "u1", "u2", "u3", "u4", "u5"]);
    expect(state.failed).toBe(0);
  });
  it("reports a passage that keeps failing by id, after bounded retries", async () => {
    const failed: string[] = [];
    let calls = 0;
    await runTranslationScheduler(passages.slice(0, 2), new AbortController().signal, async group => { calls++; return { results: group.filter(item => item.id !== "u1").map(item => ({ id: item.id, text: "번역이다." })), missing: group.some(item => item.id === "u1") ? ["u1"] : [] }; }, async () => {}, passage => failed.push(passage.id), undefined, options);
    expect(failed).toEqual(["u1"]);
    expect(calls).toBeLessThanOrEqual(4);
  });
  it("does not split a 429 batch, pauses, and lowers concurrency", async () => {
    const sizes: number[] = [];
    let once = false;
    const state = await runTranslationScheduler(passages.slice(0, 6), new AbortController().signal, async group => {
      sizes.push(group.length);
      if (!once) { once = true; throw new ResearchHttpError("limit", 429, 1); }
      return ok(group);
    }, async () => {}, () => { throw new Error("unexpected"); }, undefined, options);
    expect(sizes).toEqual([6, 6]);
    expect(state.rateLimitHits).toBe(1);
    expect(state.completed).toBe(6);
  });
  it("retries a transient outage without marking anything failed", async () => {
    let attempts = 0;
    const state = await runTranslationScheduler(passages.slice(0, 6), new AbortController().signal, async group => { if (attempts++ === 0) throw new ResearchHttpError("down", 503, 1, "transient"); return ok(group); }, async () => {}, () => { throw new Error("must stay pending"); }, undefined, options);
    expect(state.failed).toBe(0);
    expect(state.completed).toBe(6);
  });
});

it("counts translated + failed + pending = units and never calls partial work complete", () => {
  const manifest = { units: [{ id: "a" }, { id: "b" }, { id: "c" }], blocks: [], ocrCandidates: [] } as unknown as TranslationManifest;
  const counts = manifestCounts(manifest, new Set(["a"]), new Set(["b"]));
  expect(counts).toMatchObject({ translatableBlocks: 3, translatedBlocks: 1, failedBlocks: 1, pendingBlocks: 1, complete: false });
  expect(manifestCounts(manifest, new Set(["a", "b", "c"])).complete).toBe(true);
});
