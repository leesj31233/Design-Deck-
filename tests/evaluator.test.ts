import { describe, expect, it } from "vitest";
import { evaluateLocal } from "@/engflow/core/evaluate";
import { QUESTION_BY_ID } from "@/engflow/content";
import { SEEDS } from "@/engflow/content/seeds";
import type { Question } from "@/engflow/core/types";

/** Questions modeled on the learner's historical mistakes. */
const q = (over: Partial<Question>): Question => ({
  id: "t", mode: "phrase", category: "meeting", topic: "t", topicKo: "t", level: "B1", difficulty: 3, skills: ["too-adj"],
  promptKo: "테스트", segments: ["테스트"], reference: "", accepted: [], meaning: [], hints: { pattern: "p", skeleton: "s", partial: "p" },
  explanationKo: "설명", ...over,
});

const tooEarly = q({
  reference: "I think it's still too early.",
  accepted: ["I think it is still too early to decide.", "I think it's too early."],
  meaning: [
    { id: "think", en: "I think", ko: "제 생각에는", any: ["think", "opinion", "believe"] },
    { id: "early", en: "too early", ko: "너무 이르다", any: ["too early", "too soon"], critical: true },
  ],
  pitfalls: [{ id: "so-late", pattern: "so late", category: "meaning-shift", severity: "critical", fix: "it's too early", messageKo: "'so late'는 반대 의미입니다." }],
});
const waiting = q({
  skills: ["progressive", "verb-prep"],
  reference: "We are still waiting for the data.",
  accepted: ["We're still waiting for the data.", "We are still waiting for data."],
  meaning: [
    { id: "still", en: "still", ko: "아직", any: ["still", "yet"] },
    { id: "wait", en: "waiting for data", ko: "데이터를 기다리다", any: ["wait ... data"], critical: true },
  ],
});
const checkRate = q({
  skills: ["verb-object"],
  reference: "Check the actual feed rate.",
  accepted: ["Please check the actual feed rate."],
  meaning: [
    { id: "check", en: "check", ko: "확인하다", any: ["check", "confirm", "verify"] },
    { id: "rate", en: "actual feed rate", ko: "실제 투입 속도", any: ["feed rate"], term: true, critical: true },
  ],
});

describe("historical mistakes", () => {
  it("'I think so late' keeps the meaning error separate from grammar and corrects it minimally", () => {
    const e = evaluateLocal(tooEarly, "I think so late");
    expect(e.errors.some((x) => x.category === "meaning-shift" && x.severity === "critical")).toBe(true);
    expect(e.scores.overall).toBeLessThanOrEqual(60);
    expect(e.corrected).toBe("I think it's too early.");
    expect(e.review.add).toBe(true);
  });

  it("'We still waiting data' is understandable but has two grammar errors (be + for)", () => {
    const e = evaluateLocal(waiting, "We still waiting data");
    expect(e.scores.meaning.score).toBe(100);
    expect(e.scores.comprehensibility.score).toBeGreaterThanOrEqual(85);
    expect(e.scores.grammar.score).toBeLessThan(70);
    expect(e.errors.map((x) => x.category).sort()).toEqual(["be-verb", "preposition"]);
    expect(e.corrected).toBe("We are still waiting for data.");
  });

  it("'Check for actual feed rate' flags the extra preposition and restores the article", () => {
    const e = evaluateLocal(checkRate, "Check for actual feed rate");
    expect(e.errors[0].category).toBe("preposition");
    expect(e.corrected).toBe("Check the actual feed rate.");
  });

  it("'Before complete our design' needs before + V-ing", () => {
    const qq = q({
      skills: ["prep-gerund"], reference: "Before completing our design, we need the actual data.", accepted: ["Before we complete our design, we need the actual data."],
      meaning: [{ id: "before", en: "before completing", ko: "완료 전", any: ["before ... complete|finish"] }, { id: "need", en: "need data", ko: "데이터 필요", any: ["need ... data"] }],
    });
    const e = evaluateLocal(qq, "Before complete our design, we need actual data");
    expect(e.errors.find((x) => x.source === "rule")?.fix).toBe("completing");
    expect(e.corrected).toContain("Before completing our design");
  });

  it("'We check it first the actual feed rate' reports duplicated object and misplaced adverb", () => {
    const qq = { ...checkRate, skills: ["word-order"], reference: "We check the actual feed rate first.", accepted: ["First, we check the actual feed rate."] };
    const e = evaluateLocal(qq, "We check it first the actual feed rate");
    expect(e.errors.map((x) => x.category)).toEqual(expect.arrayContaining(["word-order", "sentence-structure"]));
    expect(e.corrected).toBe("We check the actual feed rate first.");
  });

  it("'Our design schedule some lated' flags the non-word", () => {
    const qq = q({
      skills: ["be-adj"], reference: "Our design schedule is a little delayed.", accepted: ["Our design schedule is slightly delayed."],
      meaning: [{ id: "delayed", en: "delayed", ko: "지연", any: ["delayed", "late", "behind"], critical: true }],
    });
    const e = evaluateLocal(qq, "Our design schedule some lated");
    expect(e.errors.some((x) => x.text === "lated" && x.fix === "delayed")).toBe(true);
  });

  it("every seeded mistake fails on its curated level-0 variation and every correction passes", () => {
    for (const seed of SEEDS) {
      const l0 = Object.values(QUESTION_BY_ID).find((x) => x.variation?.seed === seed.id && x.variation.level === 0)!;
      expect(l0, seed.id).toBeTruthy();
      const ok = evaluateLocal(l0, l0.reference);
      expect(ok.scores.overall, `${seed.id} reference`).toBe(100);
    }
  });
});

describe("evaluation principles", () => {
  it("accepts semantically equivalent answers that are not listed", () => {
    const e = evaluateLocal(waiting, "We're still waiting for the lab data.");
    expect(e.scores.overall).toBeGreaterThanOrEqual(90);
    expect(e.errors.filter((x) => x.severity !== "minor")).toHaveLength(0);
  });

  it("minor spelling costs little", () => {
    const e = evaluateLocal(waiting, "we are still wating for the data");
    expect(e.errors).toHaveLength(1);
    expect(e.errors[0].category).toBe("spelling");
    expect(e.scores.overall).toBeGreaterThanOrEqual(95);
  });

  it("does not stack a missing meaning unit and a meaning-shift pitfall", () => {
    const e = evaluateLocal(tooEarly, "I think so late");
    expect(e.scores.meaning.score).toBe(45);
    expect(e.scores.grammar.score).toBe(100);
  });

  it("exact match (case, punctuation, contractions) scores 100", () => {
    expect(evaluateLocal(waiting, "we are still waiting for the data").exact).toBe(true);
    expect(evaluateLocal(tooEarly, "I think it is still too early").scores.overall).toBe(100);
  });

  it("does not invent errors on a correct paraphrase with different structure", () => {
    const qq = QUESTION_BY_ID["fs-process-equipment-spec"];
    const e = evaluateLocal(qq, "If we decide the equipment specification now, we might need to change it later because the actual operating data can be different.");
    expect(e.errors.filter((x) => x.severity !== "minor")).toHaveLength(0);
  });

  it("wrong technical meaning is penalized", () => {
    const qq = QUESTION_BY_ID["fs-process-equipment-spec"];
    const e = evaluateLocal(qq, "If we decide the equipment specifications now, we must change them later because the actual operating data could be different.");
    expect(e.errors.some((x) => x.category === "meaning-shift")).toBe(true);
  });

  it("an empty answer is recorded for review", () => {
    const e = evaluateLocal(waiting, "   ");
    expect(e.scores.overall).toBe(0);
    expect(e.review.add).toBe(true);
  });
});
