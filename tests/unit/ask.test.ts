import { describe, expect, it } from "vitest";
import { askCreditEstimate, cosine, pickPassages, validateAnswer } from "@/lib/paperflow/ask/ask";
import { passagesOf } from "@/lib/paperflow/ask/client";
import type { TranslationManifest } from "@/lib/paperflow/translation/manifest";

describe("질문 (ask the paper)", () => {
  it("keeps only evidence whose quote is really in the passage it names", () => {
    const passages = [{ id: "p0", page: 3, text: "Biochar application increased soil organic carbon by 32% after two years in all plots." }];
    const answer = validateAnswer({ found: true, answer: "SOC가 2년 뒤 32% 증가함.", points: [
      { text: "SOC +32%", unit: "p0", quote: "increased soil organic carbon by 32% after two years" },
      { text: "가짜", unit: "p0", quote: "decreased the soil pH sharply in all plots" },
      { text: "없는 문단", unit: "p9", quote: "increased soil organic carbon by 32%" }
    ] }, passages);
    expect(answer?.points).toEqual([{ text: "SOC +32%", unitId: "p0", page: 3, quote: "increased soil organic carbon by 32% after two years" }]);
    expect(validateAnswer({ answer: "" }, passages)).toBeNull();
  });

  it("picks the closest passages, nudged by shared terms, in the paper's order", () => {
    const passages = ["intro about biochar", "methods pyrolysis at 500 °C", "results SOC increase", "conclusion soil health"].map((text, at) => ({ id: `p${at}`, page: at + 1, text }));
    const vectors = [[1, 0], [0, 1], [.7, .7], [.9, .1]];
    const picked = pickPassages("soil health conclusion", [1, 0], { passages, vectors }, 2);
    expect(picked.map(passage => passage.id)).toEqual(["p0", "p3"]);
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });

  it("cuts long paragraphs into passages on the right page, and a question costs a few credits", () => {
    const long = Array.from({ length: 30 }, (_, at) => `Sentence ${at} explains how biochar changes the soil structure and nutrient retention.`).join(" ");
    const manifest = { units: [{ id: "u1", role: "BODY", blockIds: [], pages: [2, 3], text: long, pageChars: { 2: 1200, 3: long.length - 1200 } }, { id: "u2", role: "HEADING", blockIds: [], pages: [3], text: "2. Methods", pageChars: { 3: 10 } }] } as unknown as TranslationManifest;
    const passages = passagesOf(manifest);
    expect(passages.length).toBeGreaterThan(1);
    expect(passages[0].page).toBe(3);
    expect(passages.at(-1)!.page).toBe(4);
    expect(passages.every(passage => passage.text.length <= 1100)).toBe(true);
    expect(askCreditEstimate()).toBeLessThan(15);
  });
});

describe("질문 answers", () => {
  it("drops passage ids that slip into the answer text", () => {
    const passages = [{ id: "p7", page: 2, text: "The framework should include soil organic carbon stock and nutrient dynamics." }];
    const answer = validateAnswer({ found: true, answer: "근거로 p7에서는 SOC를 포함해야 한다고 제안함(p7). [Q1] p65~67은 미생물을 다룸.", points: [] }, passages);
    expect(answer?.answer).toBe("근거로 SOC를 포함해야 한다고 제안함. [Q1] 미생물을 다룸.");
  });
});
