import { describe, expect, it } from "vitest";
import { ocrLineItems, textHealth, type OcrLine } from "../../lib/paperflow/pdf/ocr";
import { buildTextLines } from "../../lib/paperflow/layout/text-lines";
import { analyzePage } from "../../lib/paperflow/layout/page-blocks";
import { buildPageBlocks, isKorean } from "../../lib/paperflow/translation/manifest";
import type { PdfTextItem } from "../../lib/paperflow/pdf/pdf-adapter";

const W = 600, H = 800;
function item(text: string, x: number, baseline: number, width = text.length * 4.2, size = 9): PdfTextItem {
  return { text, x, y: baseline - size * .8, width, height: size, fontName: "f1", fontFamily: "serif", hasEOL: true, baseline };
}
const word = (text: string, x0: number, top: number, bottom: number, confidence = 90) => ({ text, confidence, bbox: { x0, y0: top, x1: x0 + text.length * 10, y1: bottom } });

describe("OCR lines", () => {
  // "CO2 is a gas": per-word boxes differ in height ("is", "a" have no ascenders).
  const line: OcrLine = {
    words: [word("CO2", 0, 100, 130), word("is", 40, 108, 130), word("a", 70, 112, 130), word("gas", 90, 112, 137)],
    bbox: { x0: 0, y0: 100, x1: 120, y1: 137 }, baseline: { x0: 0, y0: 130, x1: 120, y1: 130, has_baseline: true }, rowAttributes: { ascenders: 8, descenders: -7, row_height: 30 }
  };
  it("emits one item per line with a shared size, so short words never read as subscripts", () => {
    const items = ocrLineItems(line, .5);
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("CO2 is a gas");
    expect(items[0].baseline).toBe(65);
    expect(buildTextLines(items).map(value => value.text)).toEqual(["CO2 is a gas"]);
  });
  it("splits a line at a wide gap (table cells) and drops lines Tesseract is unsure of", () => {
    expect(ocrLineItems({ ...line, words: [word("Inlet", 0, 100, 130), word("20", 300, 100, 130)] }, 1).map(value => value.text)).toEqual(["Inlet", "20"]);
    expect(ocrLineItems({ ...line, words: line.words.map(value => ({ ...value, confidence: 40 })) }, 1)).toEqual([]);
  });
  it("tells empty, garbled and healthy embedded text apart", () => {
    expect(textHealth([item("p. 3", 0, 10)])).toBe("empty");
    expect(textHealth([item("\ue001\ue002\ue003".repeat(40), 0, 10)])).toBe("garbled");
    expect(textHealth([item("Table 3 12.5 0.84 1,250 (±3.2%) 98.1 – 47.0 15.3 0.62 2,100 (±1.9%) 97.4 – 51.2 18.0 0.71 3,050 (±2.4%) 96.8 – 55.9", 0, 10)])).toBe("ok");
    expect(textHealth([item("Carbon dioxide is absorbed into propylene carbonate in a packed column at elevated pressure. ".repeat(2), 0, 10)])).toBe("ok");
  });
});

describe("reference lists", () => {
  it("keeps unnumbered author-year entries in the reference list", async () => {
    const blocks = await buildPageBlocks("doc", 9, [
      item("References", 40, 100, 60, 11),
      item("Smith, J., Lee, K., 2019. Absorption of CO2 in amine solvents. Chem. Eng. J. 12, 101–109.", 40, 130, 420),
      item("Wang, L., Chen, Y., 2021. Packed column design. Ind. Eng. Chem. Res. 60 (4), 33–41.", 40, 160, 420)
    ], W, H);
    expect(blocks.every(block => !block.translatable)).toBe(true);
  });
  it("ends the reference list where a new chapter and its prose begin (books, theses, patents)", async () => {
    const prose = "The absorber operates at elevated pressure so that carbon dioxide dissolves readily in the solvent. The rich solvent then flows to a flash drum where most of the dissolved gas is released again and recovered for compression, which keeps the regeneration energy low.";
    const blocks = await buildPageBlocks("doc", 9, [
      item("References", 40, 100, 60, 11),
      item("[1] A. Researcher, Journal of Combustion 12 (2020) 1–9.", 40, 130, 300),
      item("Chapter 3 Process Description", 40, 220, 220, 14),
      item(prose.slice(0, 130), 40, 260, 480), item(prose.slice(130), 40, 272, 480)
    ], W, H);
    expect(blocks.find(block => block.text.startsWith("[1]"))?.translatable).toBe(false);
    expect(blocks.find(block => block.text.startsWith("Chapter 3"))?.translatable).toBe(true);
    expect(blocks.find(block => block.text.startsWith("The absorber"))?.translatable).toBe(true);
  });
});

describe("papers in Japanese, Chinese and Korean", () => {
  const japanese = ["既存石炭火力発電設備を有効活用できる固体燃料として期待", "されている脱炭素燃料の一つに半炭化バイオマスペレットがあ", "る。半炭化バイオマスペレットは，未加熱のバイオマスペレッ", "ト（ホワイトペレット）と比較して，水に濡れても崩壊しない", "ため，屋外貯蔵が可能である。"];
  const korean = ["흡수탑은 높은 압력에서 운전되므로 이산화탄소가 용매에 쉽게", "용해된다. 이후 농후 용액은 플래시 드럼으로 이동하여 대부분의", "용존 기체가 다시 방출되고, 압축을 위해 회수된다."];
  it("keeps Japanese prose as translatable body text instead of noise, fragments or table columns", async () => {
    const blocks = await buildPageBlocks("doc", 2, japanese.map((text, index) => item(text, 60, 300 + index * 12, 230, 8)), W, H);
    expect(blocks.map(block => [block.role, block.translatable])).toEqual([["BODY", true]]);
    expect(blocks[0].text.startsWith("既存石炭火力発電設備を有効活用できる固体燃料として期待されている")).toBe(true);
  });
  it("recognises Korean prose but never spends credits translating it into Korean", async () => {
    const blocks = await buildPageBlocks("doc", 2, korean.map((text, index) => item(text, 60, 300 + index * 12, 230, 8)), W, H);
    expect(blocks.map(block => [block.role, block.exclusionReason])).toEqual([["BODY", "korean-source"]]);
    expect(isKorean("slagging은 fouling과 함께 boiler의 효율을 낮춘다.")).toBe(true);
    expect(isKorean("Bituminous coal(역청탄) is blended with torrefied biomass at ratios up to 30% on an energy basis.")).toBe(false);
  });
  it("drops the spaces letter-spaced justification puts between Japanese characters, never Korean word spaces", () => {
    const spaced = "み に お け る 温 度 を 測 定 し た".split(" ").map((char, index) => item(char, 60 + index * 12, 100, 8, 8));
    expect(buildTextLines(spaced)[0].text).toBe("みにおける温度を測定した");
    expect(buildTextLines([item("흡수탑은 높은 압력에서", 60, 100, 90, 8)])[0].text).toBe("흡수탑은 높은 압력에서");
  });
});

describe("MDPI-style reference lists", () => {
  it("stays in the list through hanging-indent pieces of entries with journal abbreviations and [CrossRef]", async () => {
    const blocks = await buildPageBlocks("doc", 28, [
      item("References", 40, 100, 60, 11),
      item("1. Ahmad, A.L.; Ismail, S.; Bhatia, S. Water recycling from palm oil mill effluent (POME) using membrane technology.", 40, 130, 480),
      item("wastewater (OMW): A brief review of the treatment of olive mill effluent and the recovery of value from it. Environ. Technol. Innov. 2019, 15, 100377. [CrossRef]", 40, 160, 480),
      item("and feasibility of renewable energy generation from palm oil mill effluent in the region: A short review of the options. J. Clean. Prod. 2019, 233, 209–225.", 40, 190, 480)
    ], W, H);
    expect(blocks.filter(block => block.translatable)).toEqual([]);
  });
});

describe("reference lists across pages", () => {
  it("is not ended by a running head set larger than the reference type (Nature 'Article')", async () => {
    const blocks = await buildPageBlocks("doc", 11, [
      item("Article", 40, 24, 40, 10),
      item("37. Casson, A., Muliastra, Y. I. K. D. & Obidzinski, K. Large-Scale Plantations, Bioenergy Developments and Land Use Change in Indonesia. (CIFOR, 2014).", 40, 60, 480, 8),
      item("38. Abdullah, K. Biomass energy potentials and utilization in Indonesia. Lab. Energy Agric. Electrif. 2, 1–12 (2002).", 40, 80, 480, 8)
    ], W, H, "references");
    expect(blocks.filter(block => block.translatable)).toEqual([]);
  });
});

describe("reference lists without a usable heading", () => {
  const block = (text: string) => ({ text, translatable: true, role: "BODY", exclusionReason: null }) as unknown as import("../../lib/paperflow/translation/manifest").ManifestBlock;
  it("marks a run of author-year entries (Frontiers, no heading) and their wrapped tails as references", async () => {
    const { markReferenceRuns } = await import("../../lib/paperflow/translation/manifest");
    const blocks = [
      block("The Supplementary Material for this article can be found online at the journal website."),
      block("Dave, N., Do, T., Palfreyman, D., and Feron, P. (2011). Impact of post combustion capture of CO2 on existing and new Australian coal-fired power plants."),
      block("Duan, L., Zhao, M., and Yang, Y. (2012). Integration and optimization study on the coal-fired power plant with CO2 capture."),
      block("England, 2004; pp 89-160."),
      block("Dubois, L., and Thomas, D. (2018). Comparison of various configurations of the absorption-regeneration process. Int. J. Greenh. Gas Control 69, 20–35.")
    ];
    markReferenceRuns(blocks);
    expect(blocks.map(item => item.translatable)).toEqual([true, false, false, false, false]);
  });
  it("leaves body paragraphs that cite a few authors alone", async () => {
    const { markReferenceRuns } = await import("../../lib/paperflow/translation/manifest");
    const prose = "Torrefaction raises the heating value of empty fruit bunch pellets and lowers their moisture uptake, which makes outdoor storage feasible for longer periods than for untreated biomass (Acharya, B., 2015; Chen, W.H., 2012). The mass yield falls as the temperature increases, so the operating window is narrow and must be chosen with the downstream boiler in mind.";
    const blocks = [block(prose), block(prose + " A second paragraph."), block(prose + " A third paragraph.")];
    markReferenceRuns(blocks);
    expect(blocks.every(item => item.translatable)).toBe(true);
  });
  it("recognises reference headings in other languages, also run together with the first entry", async () => {
    const blocks = await buildPageBlocks("doc", 9, [
      item("Daftar Pustaka Acharya, B., Dutta, A. and Minaret, J., 2015, Review on comparative study of dry and wet torrefaction.", 40, 100, 480, 11),
      item("Akbar, A., Paidoman, R., and dan Coniwanti, P. 2013. Pengaruh Variabel Waktu dan Temperatur. Jurnal Teknik Kimia 19, 1–8.", 40, 130, 480, 11)
    ], W, H);
    expect(blocks.filter(item => item.translatable)).toEqual([]);
  });
});

describe("patent line numbers in the gutter", () => {
  it("never fuse a left-column line with the right-column line beside it", () => {
    const rows = [5, 10, 15].flatMap((number, index) => {
      const baseline = 100 + index * 60;
      return [item("the amount of nitrogen removed from the combustion air rises", 50, baseline, 240, 10), item(String(number), 296, baseline, 8, 8), item("air guide. The outside surface of the guide tapers", 310, baseline, 240, 10)];
    });
    const lines = buildTextLines(rows.filter(row => row.text.length > 2));
    expect(lines.length).toBe(6);
    const analyzed = analyzePage(rows, 7, W, H).map(block => block.text);
    expect(analyzed.some(text => /removed.*\d.*air guide/.test(text))).toBe(false);
  });
});

describe("scanned patents with an OCR text layer", () => {
  it("split a scan line that runs across both columns at its gutter line number", () => {
    const line = "perature exceeds 2800F, the amount of nitrogen removed from air rises45 airguide. Approximately the outside surface of the air guide tapers inward.";
    const left = Array.from({ length: 10 }, (_, index) => item(`left column line ${index} describes the burner tip and the fuel nozzle in detail`, 52, 120 + index * 15, 240, 12));
    const right = Array.from({ length: 10 }, (_, index) => item(`right column line ${index} explains how the air guide swirls the secondary air`, 320, 120 + index * 15, 240, 12));
    const blocks = analyzePage([...left, ...right, item(line, 52, 270, 508, 12)], 7, 612, 792);
    const texts = blocks.map(block => block.text);
    expect(texts.some(text => text.includes("rises") && text.includes("airguide"))).toBe(false);
    expect(texts.join(" ")).not.toMatch(/\b45\b/);
  });
});

describe("line breaking", () => {
  it("never cuts a short English word to fill a narrow slot", async () => {
    const { LineFeeder } = await import("../../lib/paperflow/typeset/line-breaker");
    const measure = (text: string) => [...text].length * .5;
    const feeder = new LineFeeder([{ text: "burner", bold: false, width: 3 }, { text: "tip", bold: false, width: 1.5 }], measure);
    expect(feeder.next(15, 10).text).toBe("");
    expect(feeder.next(200, 10).text).toBe("burner tip");
  });
});

describe("key terms", () => {
  it("retries a translation that transliterated a glossary term", async () => {
    const { partitionTranslationResults, droppedTerms } = await import("../../lib/paperflow/translation/block-contract");
    const passages = [{ id: "p0", text: "Torrefaction of the biomass improves its grindability and the energy density of the fuel.", role: "body" as const }];
    expect(droppedTerms(passages[0].text, "토리팩션은 바이오매스의 분쇄성을 개선한다.", ["torrefaction"])).toEqual(["torrefaction"]);
    expect(partitionTranslationResults(passages, [{ id: "p0", text: "바이오매스의 토리팩션은 분쇄성과 에너지 밀도를 개선한다." }], ["torrefaction"]).missing).toEqual(["p0"]);
    expect(partitionTranslationResults(passages, [{ id: "p0", text: "바이오매스의 torrefaction은 분쇄성과 에너지 밀도를 개선한다." }], ["torrefaction"]).results).toHaveLength(1);
  });
});

describe("ruled tables from the page's own strokes", () => {
  const rule = (x: number, y: number, width: number) => ({ x, y, width, height: .5 });
  it("never lets a caption run on into the rows of a ruled table", async () => {
    const found = { tables: [] as { x: number; y: number; width: number; height: number }[] };
    const blocks = await buildPageBlocks("doc", 6, [
      item("Table 2: Total hits of multiple large models on each abstract concept.", 100, 400, 380, 10),
      item("Gravity Newton First Law Universal Gravity", 100, 425, 380, 10),
      item("CDDA 6 almost 5 1 NtM 24 CDDA 3 6 4 almost 4", 100, 440, 380, 10),
      item("Embed 2 37 2 8 1 1 9 1 NtM 24 Qwen3 VL 2B 38", 100, 455, 380, 10)
    ], W, H, "none", [rule(95, 412, 400), rule(95, 430, 400), rule(95, 462, 400)], found);
    expect(found.tables).toHaveLength(1);
    expect(blocks.find(block => block.text.startsWith("Table 2"))?.translatable).toBe(true);
    // The rows are table cells: kept out of the whole-paper run, translatable on request.
    const cells = blocks.filter(block => /CDDA|Embed/.test(block.text));
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every(block => block.role === "TABLE")).toBe(true);
    const { buildUnits } = await import("../../lib/paperflow/translation/manifest");
    const units = await buildUnits("doc", blocks);
    expect(units.filter(unit => unit.role === "TABLE").every(unit => unit.manual)).toBe(true);
    // Every cell carries the box it may fill, inside the table.
    expect(cells.every(block => block.cell && block.cell.x >= 95 / W - .001 && block.cell.x + block.cell.width <= 495 / W + .001 && block.cell.y >= 412 / H - .001)).toBe(true);
  });
  it("names a table after its caption, and a captionless table on the next page as its continuation", async () => {
    const { manualTargets } = await import("../../lib/paperflow/translation/manual-targets");
    const cell = (id: string, pageIndex: number, y: number) => ({ id, pageIndex, text: "Image sensor", role: "TABLE", translatable: true, unitId: `u-${id}`, x: .2, y, width: .2, height: .02, lines: [] });
    const manifest = {
      units: [], pages: [{ width: W, height: H, tables: [{ x: .1, y: .2, width: .8, height: .5 }] }, { width: W, height: H, tables: [{ x: .1, y: .1, width: .8, height: .4 }] }],
      blocks: [{ id: "c", pageIndex: 0, text: "Table 1: Comparison of camera components", role: "CAPTION", translatable: true, x: .2, y: .16, width: .6, height: .02, lines: [] }, cell("a", 0, .3), cell("b", 1, .2)]
    } as unknown as import("../../lib/paperflow/translation/manifest").TranslationManifest;
    expect(manualTargets(manifest, 0).map(target => target.label)).toEqual(["Table 1"]);
    expect(manualTargets(manifest, 1).map(target => target.label)).toEqual(["Table 1 (계속)"]);
  });
  it("keeps a running-head rule, a table and a footer rule apart when body text lies between them", async () => {
    const { tableRegions } = await import("../../lib/paperflow/layout/graphics");
    const prose = (band: { y: number; height: number }) => band.y < .5 && band.y + band.height > .6;
    const regions = tableRegions([rule(50, 60, 500), rule(50, 120, 500), rule(50, 140, 500), rule(50, 200, 500), rule(50, 760, 500)], 600, 800, prose);
    expect(regions.length).toBe(1);
    expect(regions[0].y * 800).toBeGreaterThanOrEqual(59);
    expect((regions[0].y + regions[0].height) * 800).toBeLessThan(250);
  });
});

describe("initials-first reference lists", () => {
  it("marks [n] C. Name and n. M. J. Name entries as references", async () => {
    const { markReferenceRuns } = await import("../../lib/paperflow/translation/manifest");
    const block = (text: string) => ({ text, translatable: true, role: "BODY", exclusionReason: null }) as unknown as import("../../lib/paperflow/translation/manifest").ManifestBlock;
    const blocks = [block("[43] C. Maes, “Frenesy: Time-symmetric dynamical activity in nonequilibria,” Phys. Rep. 850, 1–33 (2020)."), block("[44] A. Strang, “A theoretical review of area production rates,” J. Stat. Phys. 180 (2020)."), block("16. M. J. Silvapulle, P. K. Sen, Constrained statistical inference (Wiley, 2005)."), block("M. C. Kelley, The Earth’s ionosphere: Plasma physics and electrodynamics (Academic Press, 2009).")];
    markReferenceRuns(blocks);
    expect(blocks.every(item => !item.translatable)).toBe(true);
  });
});

describe("justified numbered headings", () => {
  it("reads a wrapped, letter-spaced numbered capital heading as a heading, not table data", async () => {
    const { classifyBlock } = await import("../../lib/paperflow/layout/classify");
    const paragraph = (text: string, size: number) => ({ id: "p", pageIndex: 3, text, kind: "body", x: .24, y: .56, width: .64, height: .05, lines: [{ x: .24, y: .56, width: .64, height: .02 }, { x: .24, y: .59, width: .3, height: .02 }], fontFamily: "sans-serif", fontWeight: 700, fontStyle: "normal", fontSize: size, hint: "table", column: { left: .12, right: .88 } }) as import("../../lib/paperflow/layout/types").PdfParagraph;
    const context = { pageIndex: 3, bodySize: 10, titleIndex: -1, abstractIndex: -1 };
    expect(classifyBlock(paragraph("4. UNRAVEL THE ATMOSPHERE AND PHENOMENA OF PHOTOGRAPHY", 12), 5, context, "none").role).toBe("HEADING");
    // A numbered table row with figures stays a table row.
    expect(classifyBlock(paragraph("4 Panchromatic 12 MP 35 mm 1.8", 10), 5, context, "none").role).toBe("TABLE");
  });
});

describe("running heads", () => {
  it("keeps a line repeated at the top of three pages as printed, and a heading used once", async () => {
    const { markRunningHeads } = await import("../../lib/paperflow/translation/manifest");
    const block = (pageIndex: number, text: string, y: number) => ({ id: `${pageIndex}-${y}`, pageIndex, text, y, height: .015, lines: [{}], translatable: true, role: "BODY", exclusionReason: null }) as unknown as import("../../lib/paperflow/translation/manifest").ManifestBlock;
    const blocks = [0, 1, 2].map(page => block(page, "Smart Engineering Technology and Management", .068)).concat(block(1, "Advancement in Digital Cameras", .07));
    markRunningHeads(blocks);
    expect(blocks.slice(0, 3).every(item => !item.translatable && item.role === "HEADER")).toBe(true);
    expect(blocks[3].translatable).toBe(true);
  });
});

describe("table entries", () => {
  it("end in a noun, not a sentence", async () => {
    const { tableEnding } = await import("../../lib/paperflow/translation/document-job");
    expect(tableEnding("광원과 결합하여 향상 기술을 제공한다")).toBe("광원과 결합하여 향상 기술을 제공함");
    expect(tableEnding("최대 256 GB까지 지원할 수 있다")).toBe("최대 256 GB까지 지원할 수 있음");
    expect(tableEnding("전용 이미지 처리 칩")).toBe("전용 이미지 처리 칩");
  });
});
