import { describe, expect, it } from "vitest";
import { analyzeNativePage } from "../../lib/paperflow/translation/native-layout";
import { buildPageBlocks, buildTranslationManifest, manifestCounts, stableBlockId, type TranslationManifest } from "../../lib/paperflow/translation/manifest";
import type { PdfDocumentHandle } from "../../lib/paperflow/pdf/pdf-adapter";
import { validateTranslationResults } from "../../lib/paperflow/translation/block-contract";
import { makeTranslationBatches, runTranslationScheduler } from "../../lib/paperflow/translation/scheduler";
import { ResearchHttpError } from "../../lib/paperflow/translation/research-api";
import { planColumnReflow } from "../../lib/paperflow/translation/column-reflow";
import type { PdfTextItem } from "../../lib/paperflow/pdf/pdf-adapter";

function item(text: string, x: number, y: number, width = 150): PdfTextItem {
  return { text, x, y, width, height: 10, fontName: "Times", fontFamily: "serif", hasEOL: true };
}

describe("native PDF manifest", () => {
  it("keeps left and right columns separate and reads each column top to bottom", () => {
    const items = [
      item("First left paragraph explains boiler combustion.", 45, 90),
      item("First right paragraph explains emissions.", 320, 90),
      item("Its next sentence discusses fuel particles.", 45, 103),
      item("Its next sentence discusses heat flux.", 320, 103),
      item("Second left paragraph reviews results.", 45, 135),
      item("Second right paragraph reviews conclusions.", 320, 135)
    ];
    const paragraphs = analyzeNativePage(items.reverse(), 1, 560, 750);
    expect(paragraphs.map(block => block.text)).toEqual([
      "First left paragraph explains boiler combustion. Its next sentence discusses fuel particles.",
      "Second left paragraph reviews results.",
      "First right paragraph explains emissions. Its next sentence discusses heat flux.",
      "Second right paragraph reviews conclusions."
    ]);
  });
  it("normalizes stable IDs and excludes the reference section", async () => {
    const a = await stableBlockId("doc", 0, "BODY", "Boiler   heat", { x: .1, y: .2, width: .3, height: .1 });
    const b = await stableBlockId("doc", 0, "BODY", "Boiler heat", { x: .1001, y: .2001, width: .3001, height: .1001 });
    expect(a).toBe(b);
    const blocks = await buildPageBlocks("doc", 1, [item("References", 45, 200), item("[1] Author Paper Journal 2020", 45, 230)], 560, 750);
    expect(blocks.every(block => !block.translatable)).toBe(true);
    const manifest: TranslationManifest = { documentId: "doc", version: "test", createdAt: "", pageCount: 1, blocks, extractedPages: 1, ocrPages: 0 };
    expect(manifestCounts(manifest, new Set()).complete).toBe(true);
  });
  it("does not call an image-only page complete without OCR", async () => {
    const pdf: PdfDocumentHandle = { pageCount: 1, readMetadata: async () => ({ text: "", info: {} }), destroy: async () => {}, getPage: async () => ({ width: 600, height: 800, getTextItems: async () => [], getRasterImageCount: async () => 1, render: async () => {}, renderText: async () => {} }) };
    const manifest = await buildTranslationManifest("scan", pdf);
    expect(manifest.ocrCandidates).toEqual([0]);
    expect(manifestCounts(manifest, new Set()).complete).toBe(false);
    expect(manifestCounts(manifest, new Set()).ocrCandidatePages).toBe(1);
  });
});

describe("translation mapping and scheduler", () => {
  const passages = Array.from({ length: 21 }, (_, index) => ({ id: index.toString(16).padStart(32, "0"), text: `Technical sentence ${index}.` }));
  it("batches 8–12 passages and remaps reordered IDs", () => {
    expect(makeTranslationBatches(passages).map(batch => batch.passages.length)).toEqual([10, 10, 1]);
    const source = passages.slice(0, 2);
    expect(validateTranslationResults(source, [{ id: source[1].id, text: "둘째" }, { id: source[0].id, text: "첫째" }]).map(item => item.text)).toEqual(["첫째", "둘째"]);
    expect(() => validateTranslationResults(source, [{ id: source[0].id, text: "첫째" }, { id: source[0].id, text: "중복" }])).toThrow();
    expect(() => validateTranslationResults(source, [{ id: source[0].id, text: "첫째" }])).toThrow();
    expect(() => validateTranslationResults(source, [{ id: source[0].id, text: "첫째" }, { id: "f".repeat(32), text: "추가" }])).toThrow();
  });
  it("does not split a 429 batch and reduces concurrency", async () => {
    const controller = new AbortController();
    let once = false;
    const batches: number[] = [], saved: string[] = [];
    const result = await runTranslationScheduler(passages.slice(0, 10), controller.signal, async group => {
      batches.push(group.length);
      if (!once) { once = true; throw new ResearchHttpError("limit", 429, 1); }
      return group.map(item => ({ id: item.id, text: "번역 결과" }));
    }, async item => { saved.push(item.id); }, () => { throw new Error("unexpected failure"); });
    expect(batches).toEqual([10, 10]);
    expect(result.rateLimitHits).toBe(1);
    expect(result.completed).toBe(10);
    expect(saved).toHaveLength(10);
  });
  it("retries transient outages without splitting or marking blocks failed", async () => {
    const sizes: number[] = [], saved: string[] = [];
    let attempts = 0;
    const state = await runTranslationScheduler(passages.slice(0, 10), new AbortController().signal, async group => {
      sizes.push(group.length);
      if (attempts++ === 0) throw new ResearchHttpError("server unavailable", 503, 1, "transient");
      return group.map(item => ({ id: item.id, text: "한국어 번역" }));
    }, async item => { saved.push(item.id); }, () => { throw new Error("must stay pending"); });
    expect(sizes).toEqual([10, 10]);
    expect(state.failed).toBe(0);
    expect(saved).toHaveLength(10);
  });
});

it("reflows within a column without crossing an equation obstacle", () => {
  const blocks = [
    { id: "a", x: 50, y: 100, width: 220, height: 30, lineHeight: 12, column: 0 },
    { id: "b", x: 50, y: 135, width: 220, height: 30, lineHeight: 12, column: 0 },
    { id: "c", x: 330, y: 100, width: 220, height: 30, lineHeight: 12, column: 1 },
  ];
  const placed = planColumnReflow(blocks, [{ x: 50, y: 210, width: 220, height: 25 }], 700, block => ({ usedHeight: block.id === "a" ? 70 : 40, output: block.id }));
  expect(placed.find(item => item.id === "b")!.top).toBeGreaterThan(135);
  expect(placed.find(item => item.id === "c")!.top).toBe(100);
  expect(placed.find(item => item.id === "b")!.top + placed.find(item => item.id === "b")!.availableHeight).toBeLessThan(210);
});

it("reserves room for later column paragraphs", () => {
  const blocks = Array.from({ length: 3 }, (_, index) => ({ id: `${index}`, x: 40, y: 100 + index * 35, width: 200, height: 30, lineHeight: 12, column: 0 }));
  const result = planColumnReflow(blocks, [], 300, () => ({ usedHeight: 1000, output: null }));
  expect(result[0].availableHeight).toBeLessThan(150);
  expect(result[1].top).toBeGreaterThan(result[0].top);
  expect(result[2].availableHeight).toBeGreaterThanOrEqual(0);
});
