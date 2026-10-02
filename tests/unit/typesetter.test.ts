import { describe, expect, it } from "vitest";
import { buildPageBlocks, buildUnits, type TranslationManifest } from "../../lib/paperflow/translation/manifest";
import { typesetPage, unitTextForPage } from "../../lib/paperflow/typeset/page-typesetter";
import { LineFeeder, justify, tokenize, type Measure } from "../../lib/paperflow/typeset/line-breaker";
import type { PdfTextItem } from "../../lib/paperflow/pdf/pdf-adapter";

const W = 600, H = 800;
const measure: Measure = text => [...text].reduce((sum, char) => sum + (/[가-힣]/.test(char) ? .95 : /[A-Z]/.test(char) ? .66 : /[a-z]/.test(char) ? .46 : char === " " ? .25 : .5), 0);
function item(text: string, x: number, baseline: number, width = 240, size = 9): PdfTextItem {
  return { text, x, y: baseline - size * .8, width, height: size, fontName: "f1", fontFamily: "serif", hasEOL: true, baseline };
}
const lines = (x: number, top: number, count: number, seed: string, last = "") => Array.from({ length: count }, (_, index) => item(index === count - 1 && last ? last : `${seed} ${index} sentence about slagging and alkali chloride deposition in boilers`, x, top + index * 11, index === count - 1 && last ? 120 : 240));
const korean = (length: number) => Array.from({ length }, (_, index) => index % 4 === 3 ? "slagging은" : "연소과정에서").join(" ") + " 발생한다.";

async function manifestOf(items: PdfTextItem[][]): Promise<TranslationManifest> {
  const blocks = (await Promise.all(items.map((page, index) => buildPageBlocks("doc", index, page, W, H)))).flat().map((block, readingOrder) => ({ ...block, readingOrder }));
  const units = await buildUnits("doc", blocks);
  return { documentId: "doc", version: "test", createdAt: "t", pageCount: items.length, pages: items.map(() => ({ width: W, height: H })), blocks, units, keywords: [], extractedPages: items.length, ocrPages: 0 };
}

describe("translation units", () => {
  it("joins a paragraph continued across a column and a page, but not across an equation", async () => {
    const page0 = [...lines(40, 100, 6, "left"), ...lines(320, 100, 6, "right", "and the deposit keeps")];
    const page1 = [...lines(40, 100, 3, "continues", "growing over time."), item("Q = h A (T_w − T_g) (3)", 120, 150, 120), ...lines(40, 170, 3, "where")];
    const manifest = await manifestOf([page0, page1]);
    const spanning = manifest.units.find(unit => unit.pages.length === 2)!;
    expect(spanning.text).toContain("and the deposit keeps continues 0");
    expect(manifest.units.some(unit => unit.text.startsWith("where 0"))).toBe(true);
    expect(manifest.units.every(unit => !unit.text.includes("T_w"))).toBe(true);
  });
  it("splits a two-page translation at a sentence end near the page boundary", () => {
    const unit = { id: "u", role: "BODY" as const, blockIds: ["a", "b"], pages: [0, 1], text: "", pageChars: { 0: 100, 1: 100 } };
    const text = "첫 문장은 slagging을 다룬다. 둘째 문장은 corrosion을 다룬다. 셋째 문장은 결론이다.";
    const first = unitTextForPage(unit, text, 0), second = unitTextForPage(unit, text, 1);
    expect(`${first} ${second}`).toBe(text);
    expect(first.endsWith("다.")).toBe(true);
  });
});

describe("line breaker", () => {
  it("never breaks an English term and fills justified lines to the edge", () => {
    const feeder = new LineFeeder(tokenize("silicate melt-induced slagging 현상은 고온 영역에서 alkali chloride와 함께 빠르게 성장하는 경향을 보인다", measure), measure);
    const lines = [];
    while (!feeder.done) lines.push(feeder.next(60, 4));
    expect(lines.flatMap(line => line.text.split(" ")).filter(word => /[a-z]/.test(word))).toEqual(expect.arrayContaining(["melt-induced", "slagging", "alkali"]));
    for (const line of lines.slice(0, -1)) {
      const spacing = justify(line, 60, 4, false);
      const filled = line.natural + spacing.wordSpacing * line.spaces + spacing.letterSpacing * (line.chars - 1);
      expect(filled).toBeLessThanOrEqual(60.01);
      expect(filled).toBeGreaterThan(60 * .93);
    }
  });
});

describe("page typesetter", () => {
  it("sets one body size per page, keeps indents, fits the original columns and masks only translated text", async () => {
    const page = [item("1. Introduction", 40, 90, 80), ...lines(40, 105, 10, "left"), item("Q = h A (T_w − T_g) (3)", 110, 225, 120), ...lines(320, 100, 12, "right")];
    const manifest = await manifestOf([page]);
    const translations = new Map(manifest.units.map(unit => [unit.id, unit.role === "HEADING" ? "1. 서론" : korean(Math.round(unit.text.length / 11))]));
    const layout = typesetPage({ manifest, pageIndex: 0, measure, translations });
    expect(layout.unfit).toEqual([]);
    const bodySizes = new Set(layout.lines.filter(line => line.kind === "body").map(line => line.fontSize.toFixed(3)));
    expect(bodySizes.size).toBe(1);
    expect(layout.bodyScale).toBeGreaterThanOrEqual(.8);
    for (const line of layout.lines) {
      expect(line.y).toBeGreaterThan(80); expect(line.y).toBeLessThan(H * .95);
      expect(line.x + line.width).toBeLessThanOrEqual(560.5);
    }
    // The equation stays artwork: no mask covers it and no line is set across it.
    expect(layout.masks.some(mask => mask.y < 225 && mask.y + mask.height > 220 && mask.x < 230 && mask.x + mask.width > 110)).toBe(false);
    expect(layout.lines.some(line => line.kind === "heading" && line.runs[0].text === "1. 서론")).toBe(true);
  });
  it("leaves untranslated paragraphs in the original and reports a paragraph that cannot fit", async () => {
    const manifest = await manifestOf([[...lines(40, 100, 4, "short", "ends the first paragraph."), ...lines(320, 100, 4, "other", "ends the second paragraph.")]]);
    const [first, second] = manifest.units;
    const layout = typesetPage({ manifest, pageIndex: 0, measure, translations: new Map([[first.id, korean(400)]]) });
    expect(layout.units.map(unit => unit.unitId)).toEqual([first.id]);
    expect(layout.unfit).toEqual([first.id]);
    expect(layout.lines.every(line => line.unitId !== second.id)).toBe(true);
  });
});

it("builds a glossary from keywords and the technical words of the title", async () => {
  const { paperGlossary } = await import("../../lib/paperflow/translation/glossary");
  const manifest = { keywords: ["Biomass ash", "Slagging"], blocks: [{ role: "TITLE", text: "Methane Gas Cofiring Effects on Combustion and NOx Emission in 550 MW Tangentially Fired Pulverized-Coal Boiler" }] } as unknown as TranslationManifest;
  const glossary = paperGlossary(manifest);
  expect(glossary).toEqual(expect.arrayContaining(["biomass ash", "slagging", "methane", "cofiring", "combustion", "NOx", "MW", "pulverized-coal", "boiler"]));
  expect(glossary).not.toContain("effects");
  expect(glossary).not.toContain("550");
});
