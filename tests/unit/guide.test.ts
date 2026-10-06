import { describe, expect, it } from "vitest";
import { guideSchema, guideUnits, limitMarks, noteStyle, validateGuide, type GuideMark } from "@/lib/paperflow/guide/guide";
import { isReasoningModel } from "@/lib/paperflow/guide/cost";
import type { TranslationManifest } from "@/lib/paperflow/translation/manifest";

const unit = (id: string, role: string, page: number, text: string) => ({ id, role, blockIds: [], pages: [page], text, pageChars: {} });
const results = "Biochar at 2% raised the germination index of lettuce in the Vertisol by 175% relative to the control, while the Alfisol showed no significant change. " + "Root length followed the same trend across all treatments and replicates in both soils. ".repeat(4);
const manifest = { units: [
  unit("a", "ABSTRACT", 0, "Methane cofiring reduced NOx by 69.8% at a 40% cofiring rate."),
  unit("h", "HEADING", 0, "2. Methods"),
  unit("b", "BODY", 1, "Seeds were incubated at 25 °C for 14 d in the dark with three replicates per treatment."),
  unit("c", "CAPTION", 2, "Fig. 3. Germination index (GI) by soil and biochar rate."),
  unit("r", "BODY", 2, results),
  unit("x", "REFERENCE", 9, "[1] Someone 2020.")
] } as unknown as TranslationManifest;

/** A model answer in the v4 shape: the fixture every level is checked against. */
const answer = () => ({
  definition: "Biochar를 이용하여 두 토양 조건에서 상추 발아에 미치는 영향을 평가한 연구입니다.",
  summary: { why: "토양별 biochar 효과 불명확함", what: "Vertisol·Alfisol 상추 발아", how: "0/1/2% 처리, 25 °C 14 d 배양", result: "Vertisol 2% → GI +175%", conclusion: "토양 유형이 효과를 좌우함" },
  takeaway: "biochar 효과는 토양 유형에 따라 다름",
  flow: Array.from({ length: 11 }, (_, index) => ({ label: `단계 ${index + 1}`, detail: "" })),
  structure: [{ label: "대상·시료", value: "Vertisol, Alfisol", unit: "u2" }],
  conditions: [{ label: "온도·기간", value: "25 °C, 14 d, dark", unit: "u2" }, { label: "", value: "빈 항목", unit: "u2" }],
  results: [
    { claim: "Vertisol 2% → Control 대비 GI +175%", detail: "Alfisol은 유의차 없음", unit: "u4", quote: "raised the germination index of lettuce in the Vertisol by 175%" },
    { claim: "지어낸 인용", detail: "", unit: "u4", quote: "the biochar doubled the yield in every soil tested" }
  ],
  mechanisms: [{ text: "Vertisol의 낮은 pH 완충", source: "ai", unit: "u4" }, { text: "저자 설명", source: "author", unit: "u4" }],
  applications: ["토양 유형별 biochar 비율 먼저 검토"],
  limitations: [{ text: "단일 작물(상추)만 시험함", source: "author", unit: "u2" }],
  figures: [{ label: "Fig. 3", title: "토양·비율별 GI", importance: 9, look: ["Vertisol 2% 막대"], unit: "u3" }],
  pages: [
    { page: 3, section: "results", about: "토양별 발아 결과", key: "Vertisol에서만 효과 있음", numbers: ["GI +175% (2%)"], details: [{ tag: "RESULT", text: "Alfisol 유의차 없음" }],
      marks: [
        { unit: "u4", quote: "raised the germination index of lettuce in the Vertisol by 175%", kind: "result", note: "Vertisol / 2% → GI +175%" },
        { unit: "u4", quote: "Root length followed the same trend across all treatments and replicates in both soils.", kind: "result", note: "뿌리 길이 동일 경향" },
        { unit: "u2", quote: "Seeds were incubated at 25 °C for 14 d", kind: "condition", note: "다른 페이지" }
      ] },
    { page: 2, section: "methods", about: "배양 조건", key: "", numbers: [], details: [], marks: [{ unit: "u2", quote: "Seeds were incubated at 25 °C for 14 d", kind: "weird", note: "25 °C · 14 d · dark" }] },
    { page: 2, section: "methods", about: "중복 페이지", key: "", numbers: [], details: [], marks: [] },
    { page: 99, section: "results", about: "없는 페이지", key: "", numbers: [], details: [], marks: [] }
  ],
  terms: [{ term: "Germination Index", explanation: "발아율과 뿌리 길이를 합친 지표입니다.", unit: "u3" }]
});

describe("AI paper guide v4", () => {
  it("sends prose, headings and captions as short wire ids, never references", () => {
    const { wire, byWire } = guideUnits(manifest);
    expect(wire.map(item => [item.id, item.role, item.page])).toEqual([["u0", "abstract", 1], ["u1", "heading", 1], ["u2", "body", 2], ["u3", "caption", 3], ["u4", "body", 3]]);
    expect(byWire.get("u2")?.unitId).toBe("b");
    const schema = guideSchema(["u0", "u1"]).format.schema as unknown as { properties: Record<string, { items: { properties: Record<string, { items: { properties: Record<string, { enum: string[] }> } }> } }> };
    expect(schema.properties.pages.items.properties.marks.items.properties.unit.enum).toEqual(["u0", "u1"]);
    expect(schema.properties.pages.items.properties.marks.items.properties.kind.enum).toEqual(["result", "condition", "method", "mechanism", "limitation"]);
  });

  it("builds every level, cites its source passages and keeps only quotes that occur in them", () => {
    const guide = validateGuide(answer(), guideUnits(manifest).byWire)!;
    expect(guide.definition).toBe("Biochar를 이용하여 두 토양 조건에서 상추 발아에 미치는 영향을 평가한 연구임.");
    expect(guide.summary.result).toBe("Vertisol 2% → GI +175%");
    expect(guide.flow).toHaveLength(9);
    expect(guide.structure[0]).toMatchObject({ label: "대상·시료", unitId: "b", page: 2 });
    expect(guide.conditions).toEqual([{ label: "온도·기간", value: "25 °C, 14 d, dark", unitId: "b", page: 2 }]);
    expect(guide.results[0]).toMatchObject({ unitId: "r", page: 3, quote: "raised the germination index of lettuce in the Vertisol by 175%" });
    expect(guide.results[1].quote).toBeUndefined();
    expect(guide.mechanisms.map(item => item.source)).toEqual(["ai", "author"]);
    expect(guide.figures[0]).toMatchObject({ label: "Fig. 3", importance: 5, unitId: "c", page: 3 });
    expect(guide.terms[0].explanation).toBe("발아율과 뿌리 길이를 합친 지표임.");
    expect(validateGuide({ definition: "" }, guideUnits(manifest).byWire)).toBeNull();
  });

  it("orders pages, drops duplicates and pages that do not exist, and keeps marks on their own page", () => {
    const guide = validateGuide(answer(), guideUnits(manifest).byWire)!;
    expect(guide.pages.map(page => [page.page, page.about])).toEqual([[2, "배양 조건"], [3, "토양별 발아 결과"]]);
    expect(guide.pages[0].marks[0]).toMatchObject({ kind: "result", note: "25 °C · 14 d · dark", unitId: "b" });
    const results = guide.pages[1];
    // The page-2 sentence is not a mark of page 3; the long root-length sentence would cover too much of the page.
    expect(results.marks.map(mark => mark.note)).toEqual(["Vertisol / 2% → GI +175%"]);
    expect(results.details[0]).toEqual({ tag: "RESULT", text: "Alfisol 유의차 없음" });
  });

  it("caps highlights at 3 a page (4 on results) and 15% of the page's text", () => {
    const mark = (quote: string): GuideMark => ({ unitId: "u", page: 1, quote, note: "n", kind: "result" });
    const five = Array.from({ length: 5 }, (_, index) => mark(`sentence number ${index} with a value`));
    expect(limitMarks(five, "methods", 10_000)).toHaveLength(3);
    expect(limitMarks(five, "results", 10_000)).toHaveLength(4);
    expect(limitMarks(five, "results", 200)).toHaveLength(1);
    expect(limitMarks([{ ...five[0], quote: undefined }, five[1]], "results", 10_000).map(item => item.quote)).toEqual([five[1].quote]);
  });

  it("writes in note style, never polite", () => {
    expect(noteStyle("NOx가 감소했습니다. 효과가 있습니다. 결과는 유의합니다.")).toBe("NOx가 감소했음. 효과가 있음. 결과는 유의함.");
    expect(noteStyle("새로운 지표입니다")).toBe("새로운 지표임");
    expect(noteStyle("Vertisol / 2% → GI +175%")).toBe("Vertisol / 2% → GI +175%");
  });

  it("runs on a reasoning model with a fallback", () => {
    expect(isReasoningModel("gpt-5")).toBe(true);
    expect(isReasoningModel("o4-mini")).toBe(true);
    expect(isReasoningModel("gpt-4.1")).toBe(false);
  });

});

describe("guide highlights on the printed text", () => {
  it("finds the quote despite line-break hyphens, ligatures, case and spacing", async () => {
    const { locateQuote } = await import("@/lib/paperflow/guide/locate");
    const text = "Results. Biochar at 2% raised the ger- mination index of lettuce in the Vertisol by 175% relative to the control. The ﬁnal yield was stable.";
    const hit = locateQuote(text, "raised the germination index of lettuce in the Vertisol by 175%")!;
    expect(text.slice(hit.start, hit.start + hit.length)).toBe("raised the ger- mination index of lettuce in the Vertisol by 175%");
    const lig = locateQuote(text, "The final yield was stable")!;
    expect(text.slice(lig.start, lig.start + lig.length)).toBe("The ﬁnal yield was stable");
  });
  it("bridges an inline citation marker but never a far-away match", async () => {
    const { locateQuote } = await import("@/lib/paperflow/guide/locate");
    const text = "Earlier work [12, 14] showed that NOx emissions fell sharply when methane was cofired at a forty percent share in the boiler.";
    const hit = locateQuote(text, "Earlier work showed that NOx emissions fell sharply when methane was cofired at a forty percent share")!;
    expect(text.slice(hit.start, hit.start + hit.length)).toBe("Earlier work [12, 14] showed that NOx emissions fell sharply when methane was cofired at a forty percent share");
    expect(locateQuote(text, "a sentence that is simply not printed on this page")).toBeNull();
    expect(locateQuote(text, "short")).toBeNull();
  });
});
