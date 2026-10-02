import { describe, expect, it } from "vitest";
import { analyzePage, isEquationLine } from "../../lib/paperflow/layout/page-blocks";
import { buildTextLines, findGutter } from "../../lib/paperflow/layout/text-lines";
import { buildPageBlocks } from "../../lib/paperflow/translation/manifest";
import { extractKeywords } from "../../lib/paperflow/layout/classify";
import type { PdfTextItem } from "../../lib/paperflow/pdf/pdf-adapter";

const W = 600, H = 800;
function item(text: string, x: number, baseline: number, width = text.length * 4.2, size = 9): PdfTextItem {
  return { text, x, y: baseline - size * .8, width, height: size, fontName: "f1", fontFamily: "serif", hasEOL: true, baseline };
}
/** n lines of justified prose in a column. */
function column(x: number, top: number, lines: string[], width = 240, pitch = 11, size = 9) {
  return lines.map((text, index) => item(text, x, top + index * pitch, width, size));
}
const prose = (seed: string, count: number) => Array.from({ length: count }, (_, index) => `${seed} line ${index} carries ordinary prose about boiler combustion and ash deposition`);

describe("text lines", () => {
  it("joins ligature glyphs that sit on the same baseline in another font", () => {
    const items = [item("Methane Gas Co", 50, 100, 70), { ...item("fi", 120, 100, 7), y: 88, height: 12 }, item("ring Effects", 127, 100, 60)];
    expect(buildTextLines(items).map(line => line.text)).toEqual(["Methane Gas Cofiring Effects"]);
  });
  it("turns a superscript citation into a bracketed reference", () => {
    const items = [item("controlling the local", 50, 100, 90), item("16", 140.5, 96.5, 6, 6), item(" The ratio", 147, 100, 45)];
    expect(buildTextLines(items)[0].text).toBe("controlling the local[16] The ratio");
  });
  it("finds an off-centre gutter such as Elsevier's ARTICLE INFO / ABSTRACT split", () => {
    const left = column(42, 300, ["Article history:", "Received 9 April 2015", "Accepted 2 May 2015", "Keywords:", "Biomass ash", "Slagging"], 110, 9);
    const right = column(210, 300, prose("abstract", 8), 340, 9);
    const lines = buildTextLines([...left, ...right]);
    const gutter = findGutter(lines, W)!;
    expect(gutter.center).toBeGreaterThan(152);
    expect(gutter.center).toBeLessThan(210);
  });
});

describe("page analysis", () => {
  it("reads each column top to bottom and never fuses the columns", () => {
    const blocks = analyzePage([...column(40, 100, prose("left", 6)), ...column(320, 100, prose("right", 6))], 2, W, H);
    const body = blocks.filter(block => block.kind === "body");
    expect(body).toHaveLength(2);
    expect(body[0].text.startsWith("left line 0")).toBe(true);
    expect(body[1].text.startsWith("right line 0")).toBe(true);
  });
  it("starts a paragraph at a first-line indent and keeps the indent", () => {
    const lines = [...column(40, 100, prose("first", 3)), item("Second paragraph begins with an indent and continues", 52, 133, 228), ...column(40, 144, prose("second", 2))];
    const blocks = analyzePage([...lines, ...column(320, 100, prose("right", 6))], 2, W, H).filter(block => block.pageIndex === 2 && block.x < .5);
    expect(blocks).toHaveLength(2);
    expect(blocks[1].indent).toBeGreaterThan(8);
  });
  it("does not let inline-math operator glyphs split a paragraph", () => {
    const left = column(40, 100, prose("math", 5));
    left.splice(2, 0, { ...item("+ + +", 90, 116, 60), y: 109 });
    const blocks = analyzePage([...left, ...column(320, 100, prose("right", 6))], 3, W, H).filter(block => block.kind === "body" && block.x < .5);
    expect(blocks).toHaveLength(1);
  });
  it("splits a run-in heading from the prose on the same line", () => {
    const lines = [item("2.2. Boiler Operating Conditions. For boundary conditions we used plant data", 40, 100, 240), ...column(40, 111, prose("after", 3))];
    const blocks = analyzePage([...lines, ...column(320, 100, prose("right", 6))], 2, W, H).filter(block => block.x < .5);
    expect(blocks[0]).toMatchObject({ kind: "title", text: "2.2. Boiler Operating Conditions." });
    expect(blocks[1].text.startsWith("For boundary conditions")).toBe(true);
  });
  it("keeps mathematical lines outside translatable prose", () => {
    expect(isEquationLine("k_d = D_ref / R_p (T_p + T_g) (5)")).toBe(true);
    expect(isEquationLine("C(s) + O₂(g) → CO₂(g). (4)")).toBe(true);
    expect(isEquationLine("The oxidation reaction is described as:")).toBe(false);
    expect(isEquationLine("posed (Na + K+2Mg+2Ca)/S, (K + Na)/(Ca + Mg), and S/Cl as evaluation", .95)).toBe(false);
  });
});

describe("translation scope", () => {
  it("excludes the paper title, authors, labels, contact and references; keeps abstract and body", async () => {
    const items = [
      item("Progress in Energy and Combustion Science", 160, 60, 280, 14),
      item("Ash-related issues during biomass combustion: alkali slagging and corrosion", 42, 150, 430, 13.5),
      item("Yanqing Niu, Houzhang Tan, Shi’en Hui", 42, 180, 230, 10.5),
      item("Key Laboratory of Thermo-Fluid Science, Xi’an Jiaotong University, China", 42, 196, 400, 6.4),
      item("A R T I C L E I N F O", 42, 240, 90, 7), item("A B S T R A C T", 210, 240, 70, 7),
      ...column(42, 262, ["Article history:", "Received 9 April 2015", "Keywords:", "Biomass ash", "Slagging"], 100, 6.4),
      ...column(210, 262, prose("Biomass is available from many sources", 8), 340, 7.2),
      item("* Corresponding author. E-mail address: someone@example.edu", 42, 700, 300, 6.4)
    ];
    const blocks = await buildPageBlocks("doc", 0, items, W, H);
    const role = (start: string) => blocks.find(block => block.text.startsWith(start))?.role;
    expect(role("Ash-related")).toBe("TITLE");
    expect(role("Yanqing")).toBe("AUTHOR");
    expect(role("A R T I C L E")).toBe("OTHER");
    expect(blocks.find(block => block.text.includes("Keywords:"))?.role).toBe("KEYWORDS");
    expect(role("* Corresponding")).toBe("CONTACT");
    const abstract = blocks.find(block => block.text.startsWith("Biomass is available"))!;
    expect(abstract.translatable).toBe(true);
    expect(blocks.filter(block => block.translatable).every(block => block.x > .3)).toBe(true);
    expect(extractKeywords(blocks.find(block => block.role === "KEYWORDS")!)).toEqual(["Biomass ash", "Slagging"]);
  });
  it("excludes everything after the References heading", async () => {
    const blocks = await buildPageBlocks("doc", 5, [item("References", 40, 200, 60), item("[1] A. Researcher, Journal of Combustion 12 (2020) 1–9.", 40, 230, 240)], W, H);
    expect(blocks.every(block => !block.translatable)).toBe(true);
  });
});

it("keeps chemical reactions and table abbreviation keys out of translation", async () => {
  const blocks = await buildPageBlocks("doc", 4, [
    item("M SO24( )g + (2SiO2 + Al O23)( , ;s l Oxides or compounds) → 2MAlSiO4(s,, )l + SO3( )g", 150, 300, 300),
    item("FA: Fly ash; FYM: farmyard manure; CF: chemical fertilizer; PFS: paper factory sludge;", 42, 500, 420, 6.4)
  ], 600, 800);
  expect(blocks.every(block => !block.translatable)).toBe(true);
});

it("splits two run-in headings even when only one word of prose follows on the line", () => {
  const lines = [item("3.2. Computational Models. 3.2.1. General Models. The", 320, 360, 240), ...Array.from({ length: 5 }, (_, index) => item(`CFD analysis was conducted with Fluent and line ${index} of the paragraph`, 320, 371 + index * 11, 240))];
  const blocks = analyzePage([...column(40, 300, prose("left", 8)), ...lines], 3, W, H).filter(block => block.x > .5);
  expect(blocks.slice(0, 2).map(block => [block.kind, block.text])).toEqual([["title", "3.2. Computational Models."], ["title", "3.2.1. General Models."]]);
  expect(blocks[2].text.startsWith("The CFD analysis")).toBe(true);
});

describe("publisher quirks", () => {
  it("finds text that a pasted PDF figure clips away", async () => {
    const { clippedFormFonts } = await import("../../lib/paperflow/pdf/pdf-adapter");
    const OPS = { beginGroup: 1, paintFormXObjectBegin: 2, paintFormXObjectEnd: 3, setFont: 4, showText: 5 };
    const fnArray = [4, 5, 1, 2, 4, 5, 4, 5, 3];
    const argsArray = [["visible", 10], [], [{ bbox: { 0: 120, 1: 180, 2: 470, 3: 440 }, matrix: null }], [null, null], ["pasted", 10], [], ["visible", 10], [], []];
    const forms = clippedFormFonts(fnArray, argsArray as unknown[][], OPS);
    expect([...forms.keys()]).toEqual(["pasted"]);
    expect(forms.get("pasted")![0]).toEqual([120, 180, 470, 440]);
  });
  it("ignores manuscript line numbers and reads double-spaced paragraphs", async () => {
    const lines = Array.from({ length: 8 }, (_, index) => [item(String(430 + index), 30, 100 + index * 26, 14, 11), item(`manuscript prose line ${index} about bed agglomeration in fluidized bed combustors here`, 72, 100 + index * 26, 420, 11)]).flat();
    const blocks = await buildPageBlocks("doc", 19, lines, W, H);
    const body = blocks.filter(block => block.translatable);
    expect(body).toHaveLength(1);
    expect(body[0].text.startsWith("manuscript prose line 0")).toBe(true);
  });
  it("reads a front-matter band with its own column split before the body below", async () => {
    const info = ["Article history:", "Received 16 January 2017", "Accepted 27 April 2017", "Keywords:", "Corrosion monitoring", "Boilers"].map((text, index) => item(text, 33, 400 + index * 9.6 + 4, 100, 6.4));
    const abstract = Array.from({ length: 8 }, (_, index) => item(`abstract line ${index} explains corrosion risk monitoring with CO and O2 measurements`, 200, 400 + index * 9.6, 360, 7.2));
    const body = [...column(33, 560, prose("left", 6), 255, 10.5, 8), ...column(310, 560, prose("right", 6), 255, 10.5, 8)];
    const blocks = await buildPageBlocks("doc", 0, [item("Development of a corrosion monitoring system for pulverized coal boilers", 33, 200, 480, 13.4), ...info, ...abstract, ...body], W, H);
    const abstractBlocks = blocks.filter(block => block.text.includes("abstract line"));
    expect(abstractBlocks).toHaveLength(1);
    expect(abstractBlocks[0].translatable).toBe(true);
    expect(blocks.findIndex(block => block.text.startsWith("abstract line 0"))).toBeLessThan(blocks.findIndex(block => block.text.startsWith("left line 0")));
  });
});
