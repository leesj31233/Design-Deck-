import { describe, expect, it } from "vitest";
import { AIFormatError, buildEvaluationPrompt, normalizeAIEvaluation, parseGeneratedQuestion } from "@/engflow/core/ai";
import { evaluateLocal } from "@/engflow/core/evaluate";
import { QUESTION_BY_ID, SKILLS } from "@/engflow/content";

const q = QUESTION_BY_ID["ph-cond1-if-decide-now"];
const answer = "If we will decide now";
const local = evaluateLocal(q, answer);
const valid = {
  scores: { meaning: 90, grammar: 60, terminology: 100, organization: 90, comprehensibility: 88 },
  notes: { meaning: "의미 전달", grammar: "시제 오류", terminology: "-", organization: "-", comprehensibility: "-" },
  errors: [
    { span: "will decide", fix: "decide", category: "tense", severity: "major", explanationKo: "if절에서는 현재시제를 씁니다." },
    { span: "not in the answer", fix: "x", category: "article", severity: "minor", explanationKo: "가짜" },
  ],
  corrected: "If we decide now,",
  recommended: "If we decide now,",
  summaryKo: "의미는 통하지만 시제가 틀렸습니다.",
  grammarKo: "if 조건절 현재시제",
  alternatives: ["If we make a decision now,"],
  addToReview: true,
  reviewReasonKo: "주요 오류",
  confidence: "high",
  meaningEquivalent: true,
};

describe("AI evaluation contract", () => {
  it("the prompt carries the rubric, principles and the learner answer verbatim", () => {
    const p = buildEvaluationPrompt(q, answer, local);
    expect(p).toContain(`"""${answer}"""`);
    expect(p).toMatch(/Understandable does not mean grammatically correct/);
    expect(p).toMatch(/ONE category only/);
  });
  it("validated output maps spans to positions and drops quotes that are not in the answer", () => {
    const e = normalizeAIEvaluation(valid, q, answer, local);
    expect(e.evaluator).toBe("ai");
    const err = e.errors.find((x) => x.source === "ai")!;
    expect(answer.slice(err.start, err.end)).toBe("will decide");
    expect(e.errors.some((x) => x.text === "not in the answer")).toBe(false);
  });
  it("recomputes the overall score from the rubric instead of trusting the model", () => {
    const e = normalizeAIEvaluation(valid, q, answer, local);
    expect(e.scores.overall).toBe(Math.round(0.5 * 90 + 0.35 * 60 + 0.15 * 90));
  });
  it("rejects malformed output with a typed error", () => {
    expect(() => normalizeAIEvaluation({ scores: {} }, q, answer, local)).toThrow(AIFormatError);
    expect(() => normalizeAIEvaluation({ ...valid, errors: [{ ...valid.errors[0], severity: "fatal" }] }, q, answer, local)).toThrow(AIFormatError);
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
