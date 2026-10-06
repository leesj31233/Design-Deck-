import { describe, expect, it } from "vitest";
import { briefSchema, guideUnits, pageChunks, pagesSchema, reportStyle, validateBrief, validatePages } from "@/lib/paperflow/guide/guide";
import type { TranslationManifest } from "@/lib/paperflow/translation/manifest";

const unit = (id: string, role: string, page: number, text: string) => ({ id, role, blockIds: [], pages: [page], text, pageChars: {} });
const manifest = { units: [unit("a", "ABSTRACT", 0, "Methane cofiring reduced NOx by 69.8% at a 40% cofiring rate."), unit("h", "HEADING", 0, "2. Methods"), unit("b", "BODY", 1, "The realizable k-epsilon model was used with the DO radiation model at 1200 °C."), unit("r", "REFERENCE", 9, "[1] Someone 2020.")] } as unknown as TranslationManifest;

describe("AI reading guide v4", () => {
  it("sends prose, headings and captions as short wire ids (never references) and groups pages", () => {
    const { wire, byWire } = guideUnits(manifest);
    expect(wire.map(item => [item.id, item.role, item.page])).toEqual([["u0", "abstract", 1], ["u1", "heading", 1], ["u2", "body", 2]]);
    expect(byWire.get("u2")?.unitId).toBe("b");
    expect(pageChunks(wire, 1)).toEqual([[1], [2]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((briefSchema(["u0", "u1"]) as any).format.schema.properties.results.items.properties.unit.enum).toEqual(["u0", "u1"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((pagesSchema(["u2"]) as any).format.schema.properties.pages.items.properties.marks.items.properties.unit.enum).toEqual(["u2"]);
  });
  it("keeps the brief's levels, verifies quotes, and writes report style", () => {
    const { byWire } = guideUnits(manifest);
    const brief = validateBrief({
      definition: "메탄 혼소로 석탄 보일러 NOx 저감을 평가한 연구입니다.", intro: "이 논문은 혼소를 다룸.",
      ten_seconds: { why: "NOx 규제", what: "메탄 혼소", how: "CFD", found: "NOx 69.8% 감소", conclusion: "40% 혼소 유효" },
      takeaway: "40% 혼소가 핵심임.", flow: ["석탄", "메탄 혼소", "CFD", "NOx 비교"],
      composition: [{ label: "Model", value: "realizable k-epsilon", unit: "u2" }], conditions: [{ label: "Temperature", value: "1200 °C", unit: "u2" }],
      results: [{ keyword: "40% 혼소", headline: "NOx 69.8% 감소함", comparison: "0% → 40% 대비 -69.8%", unit: "u0", quote: "reduced NOx by 69.8% at a 40% cofiring rate" },
        { keyword: "가짜", headline: "지어낸 인용", comparison: "", unit: "u2", quote: "the model predicts a 95% reduction in all cases" }],
      mechanisms: [{ chain: ["메탄 투입", "화염 온도 ↓", "Thermal NOx ↓"], source: "author", note: "저자 설명", unit: "u0" }, { chain: ["하나"], source: "ai", note: "", unit: "u0" }],
      takeaways: ["CFD 설정 참고 가능함"], limitations: [{ keyword: "단일 보일러", text: "한 보일러만 다룸" }],
      figures: [{ label: "Table 1", stars: 3, what: "조건표", look: ["온도"], conclusion: "조건 확인", unit: "u2" }, { label: "Figure 3", stars: 9, what: "NOx 곡선", look: ["40%"], conclusion: "핵심", unit: "u0" }],
      terms: [{ term: "Cofiring", korean: "혼소", explanation: "두 연료를 함께 태움.", unit: "u0" }],
      intro_parts: { problem: "NOx", gap: "데이터 부족", why: "규제", objective: "저감 평가" }, conclusion_parts: { finding: "69.8%", meaning: "적용 가능", limitation: "단일 조건", next: "실증" }
    }, byWire)!;
    expect(brief.definition).toBe("메탄 혼소로 석탄 보일러 NOx 저감을 평가한 연구임.");
    expect(brief.results[0].ref).toMatchObject({ unitId: "a", page: 1, quote: "reduced NOx by 69.8% at a 40% cofiring rate" });
    expect(brief.results[1].ref?.quote).toBeUndefined();
    expect(brief.mechanisms).toHaveLength(1);
    expect(brief.figures.map(figure => [figure.label, figure.stars])).toEqual([["Figure 3", 5], ["Table 1", 3]]);
    expect(validateBrief({ definition: "" }, byWire)).toBeNull();
  });
  it("keeps page guides for the asked pages, and marks only with a quote that is on that page", () => {
    const { byWire } = guideUnits(manifest);
    const pages = validatePages({ pages: [
      { page: 2, section: "METHOD", title: "모델 설정", items: [{ label: "CONDITION", keyword: "Temperature", text: "1200 °C" }, { label: "WRONG", keyword: "x", text: "y" }], next: "결과",
        marks: [{ kind: "condition", keyword: "온도", note: "1200 °C", unit: "u2", quote: "the DO radiation model at 1200 °C" }, { kind: "result", keyword: "엉뚱", note: "x", unit: "u0", quote: "reduced NOx by 69.8% at a 40% cofiring rate" }] },
      { page: 7, section: "RESULT", title: "요청 밖 페이지", items: [], next: "", marks: [] }] }, byWire, [1, 2]);
    expect(pages).toHaveLength(1);
    expect(pages[0].items).toEqual([{ label: "CONDITION", keyword: "Temperature", text: "1200 °C" }]);
    expect(pages[0].marks).toEqual([{ kind: "condition", keyword: "온도", note: "1200 °C", unitId: "b", page: 2, quote: "the DO radiation model at 1200 °C" }]);
  });
  it("turns polite endings into the report style", () => {
    expect(reportStyle("크게 증가하였습니다.")).toBe("크게 증가함.");
    expect(reportStyle("토양에 따라 다릅니다")).toBe("토양에 따라 다릅니다");
    expect(reportStyle("핵심 변수입니다.")).toBe("핵심 변수임.");
  });
});

describe("guide highlight placement", () => {
  it("finds the quote on the page and falls back to its head across a hyphenated line end", async () => {
    const { locateQuote } = await import("@/lib/paperflow/guide/locate");
    const page = "Results show that biochar raised soil pH in all soils except Vertisol. Germination increased by 175% in Acrisol at 2% w/w.";
    expect(locateQuote(page, "Germination increased by 175% in Acrisol")).toEqual({ start: page.indexOf("Germination"), length: 40 });
    expect(locateQuote(page, "biochar raised soil pH in all soils except Vertisol and the treat- ment")?.start).toBe(page.indexOf("biochar"));
    expect(locateQuote(page, "something else entirely that is not there")).toBeNull();
  });
  it("maps the quoted English sentence to its Korean sentence", async () => {
    const { koreanFor } = await import("@/lib/paperflow/guide/locate");
    const english = "Biochar raised soil pH. Germination increased by 175% in Acrisol. No phytotoxicity was observed.";
    const korean = "Biochar는 토양 pH를 높였다. Acrisol에서 발아가 175% 증가했다. 식물독성은 관찰되지 않았다.";
    expect(koreanFor(english, korean, "Germination increased by 175% in Acrisol")).toBe("Acrisol에서 발아가 175% 증가했다.");
    expect(koreanFor(english, korean, "Biochar raised soil pH. Germination increased")).toBe("Biochar는 토양 pH를 높였다. Acrisol에서 발아가 175% 증가했다.");
    expect(koreanFor(english, "한 문장으로 합쳐 번역했다. 두 번째.", "No phytotoxicity was observed")).toBe("두 번째.");
  });
});

describe("guide text clean-up", () => {
  it("matches quotes whatever the spacing of the text layer, and shows the degree sign", async () => {
    const { locateQuote } = await import("@/lib/paperflow/guide/locate");
    const page = "the maximal decomposed temperatures were 317 ◦ C, 335 ◦ C, and 358 ◦C from CS-1 to CS-3.";
    const found = locateQuote(page, "temperatures were 317 ◦C, 335 ◦C, and 358 ◦C from CS-1")!;
    expect(page.slice(found.start, found.start + found.length)).toBe("temperatures were 317 ◦ C, 335 ◦ C, and 358 ◦C from CS-1");
    const { validateBrief } = await import("@/lib/paperflow/guide/guide");
    const brief = validateBrief({ definition: "정의임.", conditions: [{ label: "Leaching", value: "80 mL · 80 ◦ C · 6 h", unit: "u0" }] }, new Map());
    expect(brief!.conditions[0].value).toBe("80 mL · 80 °C · 6 h");
  });
});
