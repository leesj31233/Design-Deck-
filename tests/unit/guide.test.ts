import { describe, expect, it } from "vitest";
import { guideSchema, guideUnits, validateGuide } from "@/lib/paperflow/guide/guide";
import { quoteLines } from "@/components/paperflow/reader/guide-marks";
import type { TranslationManifest } from "@/lib/paperflow/translation/manifest";

const unit = (id: string, role: string, page: number, text: string) => ({ id, role, blockIds: [], pages: [page], text, pageChars: {} });
const manifest = { units: [unit("a", "ABSTRACT", 0, "Methane cofiring reduced NOx by 69.8% at a 40% cofiring rate."), unit("h", "HEADING", 0, "2. Methods"), unit("b", "BODY", 1, "The realizable k-epsilon model was used with the DO radiation model."), unit("r", "REFERENCE", 9, "[1] Someone 2020.")] } as unknown as TranslationManifest;

describe("AI paper guide", () => {
  it("sends prose, headings and captions as short wire ids, never references", () => {
    const { wire, byWire } = guideUnits(manifest);
    expect(wire.map(item => [item.id, item.role, item.page])).toEqual([["u0", "abstract", 1], ["u1", "heading", 1], ["u2", "body", 2]]);
    expect(byWire.get("u2")?.unitId).toBe("b");
    expect(guideSchema(["u0", "u1"]).format.schema.properties.pages.items.properties.points.items.properties.unit.enum).toEqual(["u0", "u1"]);
  });
  it("keeps only quotes that occur in their paragraph and maps findings back to units", () => {
    const { byWire } = guideUnits(manifest);
    const guide = validateGuide({ overview: "개요이다.", contributions: ["기여"], method: "방법", findings: [
      { point: "40%에서 NOx 69.8% 감소", unit: "u0", quote: "reduced NOx by 69.8% at a 40% cofiring rate", why: "핵심 수치" },
      { point: "지어낸 인용", unit: "u2", quote: "the model predicts a 95% reduction in all cases", why: "" },
      { point: "없는 문단", unit: "u9", quote: "x", why: "" }
    ], terms: [{ term: "DO radiation model", explanation: "복사 모델", unit: "u2" }], limitations: [], questions: ["질문?"] }, byWire)!;
    expect(guide.findings).toHaveLength(2);
    expect(guide.findings[0]).toMatchObject({ unitId: "a", page: 1, quote: "reduced NOx by 69.8% at a 40% cofiring rate" });
    expect(guide.findings[1]).toMatchObject({ unitId: "b", page: 2, quote: undefined });
    expect(guide.terms[0]).toMatchObject({ unitId: "b", page: 2 });
    expect(validateGuide({ overview: "" }, byWire)).toBeNull();
  });
  it("marks only the lines that hold the quoted sentence", () => {
    const lines = [0, 1, 2, 3].map(index => ({ x: .1, y: .1 + index * .02, width: index === 3 ? .3 : .4, height: .015 }));
    // Justified prose: full lines carry about the same text; the short last line is narrower.
    const text = "Boilers burn coal fast. Ash forms on the walls. NOx fell by 40 percent. Air staging helps.";
    expect(quoteLines(text, lines, "NOx fell by 40 percent")).toEqual([lines[2]]);
    expect(quoteLines(text, lines, "Ash forms on the walls. NOx fell")).toEqual([lines[1], lines[2]]);
    expect(quoteLines(text, lines, "not in this block at all")).toBeNull();
    expect(quoteLines(text, lines, undefined)).toBeNull();
  });
});
