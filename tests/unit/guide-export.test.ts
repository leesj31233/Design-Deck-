import { describe, expect, it } from "vitest";
import { guideMarkdown, type ExportGuide } from "@/lib/paperflow/guide/guide-export";

const empty = (): ExportGuide => ({
  createdAt: "2026-10-06T09:30:00.000Z", definition: "", intro: "", tenSeconds: { why: "", what: "", how: "", found: "", conclusion: "" }, takeaway: "", flow: [],
  composition: [], conditions: [], results: [], mechanisms: [], takeaways: [], limitations: [], figures: [], terms: [],
  introParts: { problem: "", gap: "", why: "", objective: "" }, conclusionParts: { finding: "", meaning: "", limitation: "", next: "" }, pages: []
});
const ref = (page: number) => ({ unitId: `u${page}`, page });
const full = (): ExportGuide => ({
  ...empty(), paperType: "experimental", model: "gpt-5",
  definition: "Biochar를 이용하여 두 토양 조건에서 상추 발아에 미치는 영향을 평가한 연구임.", intro: "토양별 차이를 비교함.",
  tenSeconds: { why: "효과 불명확", what: "Vertisol·Alfisol", how: "0/1/2% 처리", found: "GI +175%", conclusion: "토양이 좌우함" },
  takeaway: "토양 유형이 핵심", flow: ["시료 준비", "처리", "측정"],
  composition: [{ label: "시료", value: "Vertisol, Alfisol", ref: ref(2) }],
  conditions: [{ label: "온도", value: "25 °C", ref: ref(2) }, { label: "비율", value: "0 | 1 | 2 %", ref: ref(3) }],
  results: [{ keyword: "GI", headline: "Vertisol에서 발아 증가", comparison: "Control 대비 +175%", ref: ref(4) }],
  mechanisms: [{ chain: ["pH 완충", "독성 감소", "발아 증가"], source: "author", note: "저자가 제시함", ref: ref(5) }, { chain: [], source: "ai", note: "추정" }],
  takeaways: ["토양부터 확인"], limitations: [{ keyword: "단일 작물", text: "상추만 시험함" }],
  figures: [{ label: "Fig. 3", stars: 4, what: "토양별 GI", look: ["2% 막대"], conclusion: "Vertisol만 증가", ref: ref(4) }],
  terms: [{ term: "Germination Index", korean: "발아지수", explanation: "발아율×뿌리 길이" }],
  introParts: { problem: "토양 차이", gap: "비교 연구 부족", why: "", objective: "두 토양 비교" },
  conclusionParts: { finding: "Vertisol만 효과", meaning: "", limitation: "", next: "현장 시험" },
  pages: [
    { page: 4, section: "RESULT", title: "토양별 결과", items: [{ label: "RESULT", keyword: "GI", text: "+175%" }], next: "메커니즘 설명", marks: [{ kind: "RESULT", keyword: "GI", note: "Vertisol / 2% → GI +175%", unitId: "u4", page: 4, quote: "raised the germination index by 175%" }, { kind: "LIMITATION", keyword: "", note: "단일 작물", unitId: "u4", page: 4, quote: "" }] },
    { page: 2, section: "METHOD", title: "조건", items: [{ label: "CONDITION", keyword: "", text: "25 °C, 14 d" }], next: "", marks: [] }
  ]
});

describe("AI guide as Markdown", () => {
  it("writes every level in the in-app order, deterministically", () => {
    const md = guideMarkdown(full(), { title: "Biochar and lettuce", authors: ["Kim", "Lee", "Park", "Choi"], year: 2024, journal: "Geoderma" });
    expect(md.startsWith("# Biochar and lettuce\n\nKim, Lee, Park 외 · 2024 · Geoderma · PAPERFLOW AI 가이드 (2026-10-06, gpt-5)\n")).toBe(true);
    const order = ["## 01 이 논문은?", "## 02 10초 요약", "## 03 한 줄 결론", "## 04 연구 흐름", "## 05 연구 구성", "## 06 핵심 실험조건", "## 07 핵심 결과", "## 08 왜 이런 결과가 나왔나?", "## 09 이 논문에서 가져갈 것", "## 10 한계와 주의점", "## 11 꼭 볼 Figure · Table", "## 12 읽기 전에 알아둘 것", "## 페이지별 가이드"];
    expect(order.map(heading => md.indexOf(heading))).toEqual([...order.map(heading => md.indexOf(heading))].sort((a, b) => a - b));
    expect(order.every(heading => md.includes(heading))).toBe(true);
    expect(md).toContain("> Biochar를 이용하여 두 토양 조건에서 상추 발아에 미치는 영향을 평가한 연구임.\n\n토양별 차이를 비교함.");
    expect(md).toContain("| 결과 | GI +175% |");
    expect(md).toContain("시료 준비 → 처리 → 측정");
    expect(md).toContain("1. **GI** · Vertisol에서 발아 증가\n   - Control 대비 +175% · p.4");
    expect(md).toContain("- **저자 해석** pH 완충 → 독성 감소 → 발아 증가\n  - 저자가 제시함 (p.5)");
    expect(md).toContain("- **AI 해석** 추정");
    expect(md).toContain("- **Fig. 3** ★★★★☆ 토양별 GI (p.4)\n  - 볼 것: 2% 막대\n  - 결론: Vertisol만 증가");
    expect(md).toContain("- **Germination Index** (발아지수): 발아율×뿌리 길이");
    expect(md).toContain("- **GAP** 비교 연구 부족");
    expect(md).not.toContain("**WHY**");
    expect(md).not.toMatch(/<[a-z/][^>]*>/i);
    expect(guideMarkdown(full(), { title: "Biochar and lettuce" })).toBe(guideMarkdown(full(), { title: "Biochar and lettuce" }));
  });

  it("skips empty optional sections", () => {
    const md = guideMarkdown({ ...empty(), definition: "정의만 있음." }, { title: "T" });
    expect(md).toBe("# T\n\nPAPERFLOW AI 가이드 (2026-10-06)\n\n## 01 이 논문은?\n\n> 정의만 있음.\n");
  });

  it("escapes pipes in table cells and keeps cells on one line", () => {
    const md = guideMarkdown({ ...full(), tenSeconds: { ...full().tenSeconds, why: "A | B\nC" } }, { title: "T" });
    expect(md).toContain("| 비율 | 0 \\| 1 \\| 2 % | p.3 |");
    expect(md).toContain("| 왜 | A \\| B C |");
  });

  it("names the conditions section for the paper type", () => {
    const heading = (paperType?: ExportGuide["paperType"]) => guideMarkdown({ ...full(), paperType }, { title: "T" }).match(/## 06 (.+)/)?.[1];
    expect([heading("experimental"), heading("computational"), heading("theoretical"), heading("review"), heading(undefined)]).toEqual(["핵심 실험조건", "핵심 설정 · 파라미터", "핵심 가정 · 파라미터", "검토 범위 · 기준", "핵심 실험조건"]);
  });

  it("renders pages in order with their items and highlights", () => {
    const md = guideMarkdown(full(), { title: "T" });
    const pages = md.slice(md.indexOf("## 페이지별 가이드"));
    expect(pages.indexOf("### p.2 · METHOD · 조건")).toBeLessThan(pages.indexOf("### p.4 · RESULT · 토양별 결과"));
    expect(pages).toContain("- **CONDITION** 25 °C, 14 d");
    expect(pages).toContain("- **RESULT · GI** +175%\n\n다음 → 메커니즘 설명\n\n> [RESULT] \"raised the germination index by 175%\" — Vertisol / 2% → GI +175%\n\n> [LIMITATION] 단일 작물");
    expect(md.endsWith("단일 작물\n")).toBe(true);
  });
});
