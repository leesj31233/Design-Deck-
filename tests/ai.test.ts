import { describe, expect, it } from "vitest";
import { AIFormatError, buildEvaluationPrompt, normalizeAIEvaluation, parseGeneratedQuestion } from "@/engflow/core/ai";
import { PENALTY, evaluateLocal, overallFrom } from "@/engflow/core/evaluate";
import { QUESTION_BY_ID, SKILLS } from "@/engflow/content";

const q = QUESTION_BY_ID["ph-cond1-if-decide-now"];
const answer = "If we will decide now";
const local = evaluateLocal(q, answer);
const valid = {
  meaning: 90,
  comprehensibility: 88,
  errors: [
    { span: "will decide", fix: "decide", category: "tense", severity: "major", explanationKo: "if절에서는 현재시제를 씁니다.", skill: "cond-1" },
    { span: "not in the answer", fix: "x", category: "article", severity: "minor", explanationKo: "가짜" },
  ],
  corrected: "If we decide now,",
  recommended: "If we decide now,",
  summaryKo: "의미는 통하지만 시제가 틀렸습니다.",
  grammarKo: "if 조건절 현재시제",
  alternatives: ["If we make a decision now,"],
};

describe("AI evaluation contract", () => {
  it("the prompt is grammar-first, accepts site wording, asks for a short reply and quotes the answer verbatim", () => {
    const p = buildEvaluationPrompt(q, answer, local);
    expect(p).toContain(`"""${answer}"""`);
    expect(p).toMatch(/Grammar first/);
    expect(p).toMatch(/Site-specific word choice is NOT an error/);
    expect(p).toMatch(/ONE category only/);
    // The reply carries no recommended sentence (the question's curated reference is shown) and an empty
    // correction when nothing is wrong: fewer tokens, so the grade comes back sooner.
    expect(p).not.toMatch(/"recommended"/);
    expect(p).toMatch(/"" when errors is empty/);
    expect(p.length).toBeLessThan(5000);
  });

  it("a short reply without a correction or recommendation is complete", () => {
    const ok = normalizeAIEvaluation({ meaning: 95, comprehensibility: 92, errors: [], corrected: "" }, q, q.reference, evaluateLocal(q, q.reference));
    expect(ok.corrected).toBe(q.reference);
    expect(ok.recommended).toBe(q.reference);
    // Errors listed but no correction: the fixes are applied to the answer.
    const fixed = normalizeAIEvaluation({ ...valid, corrected: "" }, q, answer, local);
    expect(fixed.corrected).not.toContain("will decide");
  });
  it("validated output maps spans to positions and drops quotes that are not in the answer", () => {
    const e = normalizeAIEvaluation(valid, q, answer, local);
    expect(e.evaluator).toBe("ai");
    const err = e.errors.find((x) => x.source === "ai")!;
    expect(answer.slice(err.start, err.end)).toBe("will decide");
    expect(e.errors.some((x) => x.text === "not in the answer")).toBe(false);
  });
  it("computes grammar from the error list with the shared penalty table and weights", () => {
    const e = normalizeAIEvaluation(valid, q, answer, local);
    expect(e.scores.grammar.score).toBe(100 - PENALTY.major);
    expect(e.scores.overall).toBe(overallFrom(90, 100 - PENALTY.major, 100));
  });
  it("site-specific terminology is advisory: shown, never scored or reviewed", () => {
    const e = normalizeAIEvaluation(
      { ...valid, errors: [{ span: "decide", fix: "make a decision", category: "terminology", severity: "major", explanationKo: "용어" }] },
      q, answer, local,
    );
    expect(e.errors[0].advisory).toBe(true);
    expect(e.errors[0].severity).toBe("minor");
    expect(e.scores.grammar.score).toBe(100);
    expect(e.review.add).toBe(false);
  });
  it("spelling slips cost almost nothing", () => {
    const e = normalizeAIEvaluation(
      { ...valid, errors: [{ span: "decide", fix: "decide", category: "spelling", severity: "major", explanationKo: "철자" }] },
      q, answer, local,
    );
    expect(e.scores.grammar.score).toBeGreaterThanOrEqual(97);
    expect(e.scores.overall).toBeGreaterThanOrEqual(95);
  });
  it("the reply carries no summaries: the verdict and grammar note are written from the errors", () => {
    const p = buildEvaluationPrompt(q, answer, local);
    expect(p).not.toMatch(/summaryKo|grammarKo|alternatives/);
    const e = normalizeAIEvaluation({ meaning: 90, comprehensibility: 88, errors: [valid.errors[0]], corrected: "If we decide now,", recommended: "If we decide now," }, q, answer, local);
    expect(e.summaryKo).toMatch(/문법 오류 1개/);
    expect(e.grammarKo).toContain("if절에서는 현재시제를 씁니다.");
    expect(e.alternatives).toEqual(local.alternatives);
  });
  it("rejects malformed output with a typed error", () => {
    expect(() => normalizeAIEvaluation({ scores: {} }, q, answer, local)).toThrow(AIFormatError);
    expect(() => normalizeAIEvaluation({ ...valid, errors: [{ ...valid.errors[0], severity: "fatal" }] }, q, answer, local)).toThrow(AIFormatError);
  });
  it("keeps a major grammar-rule finding even when the model misses it", () => {
    const rq = QUESTION_BY_ID["ph-collocation-meet-requirements"];
    const text = "This suggestion is not satisfy the requirements of customer.";
    const e = normalizeAIEvaluation({ meaning: 95, comprehensibility: 90, errors: [], corrected: text, recommended: rq.reference }, rq, text, evaluateLocal(rq, text));
    expect(e.errors.some((x) => x.source === "rule" && x.severity === "major")).toBe(true);
    expect(e.scores.overall).toBeLessThan(85);
    // The correction no longer contains the mistake.
    expect(e.corrected).not.toContain("is not satisfy");
  });

  it("keeps curated pitfall findings the model did not mention", () => {
    const pit = evaluateLocal(q, "If we had decided now");
    const e = normalizeAIEvaluation({ ...valid, errors: [] }, q, "If we had decided now", pit);
    expect(e.errors.some((x) => x.source === "pitfall")).toBe(true);
  });
});

describe("generated question validation", () => {
  const ctx = { skillIds: new Set(SKILLS.map((s) => s.id)) };
  it("accepts a well-formed question that passes QC", () => {
    const { probes: _p, source: _s, ...base } = QUESTION_BY_ID["ph-cond1-if-decide-now"];
    const r = parseGeneratedQuestion({ ...base, id: "gen-cond-1-x" }, ctx);
    expect(r.problems).toEqual([]);
    expect(r.question?.source).toBe("generated");
  });
  it("rejects a question whose own reference trips its pitfall", () => {
    const { probes: _p, ...base } = QUESTION_BY_ID["ph-cond1-if-decide-now"];
    const r = parseGeneratedQuestion({ ...base, id: "gen-bad", pitfalls: [{ id: "p", pattern: "decide", category: "tense", severity: "major", fix: "x", messageKo: "x" }] }, ctx);
    expect(r.question).toBeNull();
    expect(r.problems.join(" ")).toMatch(/matches the correct reference/);
  });
  it("rejects structurally invalid JSON", () => {
    expect(parseGeneratedQuestion({ id: "x" }, ctx).question).toBeNull();
  });
});

describe("AI output tidy-up", () => {
  it("fixes small slips (unknown category, too many alternatives, score overshoot) instead of discarding the grade", () => {
    const e = normalizeAIEvaluation(
      { ...valid, meaning: 104, alternatives: ["a", "b", "c", "d"], errors: [{ ...valid.errors[0], category: "grammar", insertBefore: null }] },
      q, answer, local,
    );
    expect(e.scores.meaning.score).toBe(100);
    expect(e.errors.find((x) => x.source === "ai")?.category).toBe("verb-form");
  });
});
