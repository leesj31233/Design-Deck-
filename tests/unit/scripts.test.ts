import { describe, expect, it } from "vitest";
import { buildTextLines } from "@/lib/paperflow/layout/text-lines";
import type { PdfTextItem } from "@/lib/paperflow/pdf/pdf-adapter";
import { buildScriptTable, chemicalMarkup, coreOf, scriptSegments, scriptedMeasure } from "@/lib/paperflow/typeset/scripts";

const item = (text: string, x: number, width: number, baseline: number, size = 10): PdfTextItem => ({ text, x, y: baseline - size * .8, width, height: size, fontName: "f", fontFamily: "serif", hasEOL: false, baseline });
const shown = (text: string, table?: Parameters<typeof scriptSegments>[1]) => scriptSegments(text, table).map(segment => segment.kind === "sub" ? `_${segment.text}` : segment.kind === "sup" ? `^${segment.text}` : segment.text).join("|");

describe("sub- and superscripts in translated text", () => {
  it("recognises chemical formulas but not labels", () => {
    expect(chemicalMarkup("CO2")).toBe("CO_{2}");
    expect(chemicalMarkup("H2O")).toBe("H_{2}O");
    expect(chemicalMarkup("0.5O2")).toBe("0.5O_{2}");
    expect(chemicalMarkup("NOx")).toBe("NO_{x}");
    expect(chemicalMarkup("B2")).toBeNull();
    expect(chemicalMarkup("PM2")).toBeNull();
    expect(chemicalMarkup("Fig")).toBeNull();
  });
  it("splits Korean prose into scripted segments", () => {
    expect(shown("CO2와 H2O가 생성된다.")).toBe("CO|_2|와 H|_2|O가 생성된다.");
    expect(shown("K_i 값과 m^2 단위")).toBe("K|_i| 값과 m|^2| 단위");
    expect(shown("(CO2), 그리고")).toBe("(CO|_2|), 그리고");
    expect(shown("CO-O2 혼합물")).toBe("CO-O|_2| 혼합물");
    expect(shown("co-firing과 W/(m2K)")).toBe("co-firing과 W/(m2K)");
  });
  it("uses the paper's own symbols and raised citations", () => {
    const table = { tokens: { Tp: "T_{p}", "m2/kg": "m^{2}/kg" }, superCitations: true };
    expect(shown("Tp는 입자 온도이며 1.2e05 m2/kg이다[13].", table)).toBe("T|_p|는 입자 온도이며 1.2e05 m|^2|/kg이다|^13|.");
    expect(shown("하였다[4,5].", { tokens: {}, superCitations: false })).toBe("하였다[4,5].");
  });
  it("measures scripts at their painted size", () => {
    const measure = scriptedMeasure(text => text.length);
    expect(measure("CO2", false)).toBeCloseTo(2.7);
    expect(measure("가나", false)).toBe(2);
  });
  it("strips sentence punctuation around symbols", () => {
    expect(coreOf("(Vy),")).toEqual(["(", "Vy", "),"]);
    expect(coreOf("k2[CmHn]")[1]).toBe("k2[CmHn]");
  });
});

describe("script capture from PDF glyph positions", () => {
  it("marks subscripts, keeps the word space after them, and raises citations", () => {
    const [line] = buildTextLines([item("where m", 10, 34, 100), item("p ", 44, 6, 102, 6.7), item("is the particle mass,", 50, 90, 100), item("boilers", 145, 30, 100), item("13", 175, 6, 96, 6.7)]);
    expect(line.text).toBe("where mp is the particle mass, boilers[13]");
    expect(line.marks).toContain("m_{p}");
    expect(line.raised).toBe(1);
  });
  it("joins a citation range set as separate raised glyphs", () => {
    const [line] = buildTextLines([item("are needed", 10, 45, 100), item("53", 55, 6, 96, 6.7), item("–", 61, 3, 96, 6.7), item("56", 64, 6, 96, 6.7), item(". The", 71, 20, 100)]);
    expect(line.text).toBe("are needed[53–56]. The");
  });
  it("keeps symbols the paper prints with scripts more often than without", () => {
    const table = buildScriptTable(["CO_{2}", "CO_{2}", "T_{p}"], ["CO2 and CO2 and CO2", "Tp Tp Tp Tp Tp"], { raised: 5, total: 6 });
    expect(table.tokens).toEqual({ CO2: "CO_{2}" });
    expect(table.superCitations).toBe(true);
  });
});
