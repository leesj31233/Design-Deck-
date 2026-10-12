import { describe, expect, it } from "vitest";
import { claudeApproved, MAX_LEARNED, rememberAnswer } from "@/engflow/core/learned";
import { evaluateLocal } from "@/engflow/core/evaluate";
import { createGrader, ruleBasedIsEnough } from "@/engflow/core/grader";
import { createInitialState, recordAttempt } from "@/engflow/core/store";
import { QUESTION_BY_ID } from "@/engflow/content";
import type { Evaluation } from "@/engflow/core/types";

const q = QUESTION_BY_ID["tk-presentation2-go-back-slide"];
// Correct, but worded differently from every stored answer ("one" for "slide").
const MINE = "No problem, let me go back to the previous one.";
const T0 = Date.UTC(2026, 9, 12, 9);

const asClaude = (ev: Evaluation, overall = 100): Evaluation => ({ ...ev, evaluator: "ai", evaluatorLabel: "Claude 채점", scores: { ...ev.scores, overall }, errors: [] });

describe("the grader learns answers Claude approved", () => {
  it("only fully correct Claude grades are remembered", () => {
    const local = evaluateLocal(q, MINE);
    expect(claudeApproved(local)).toBe(false); // rule-based grades never teach the grader
    expect(claudeApproved(asClaude(local))).toBe(true);
    expect(claudeApproved(asClaude(local, 90))).toBe(false);
    const withNote = { ...asClaude(local), errors: [{ id: "e1", category: "article", severity: "minor", bucket: "grammar", start: 0, end: 2, text: "No", fix: "No", messageKo: "", source: "ai" }] } as Evaluation;
    expect(claudeApproved(withNote)).toBe(false);
  });

  it("keeps new wordings only, newest last, at most three", () => {
    expect(rememberAnswer(q, undefined, q.reference)).toBeUndefined(); // already a stored answer
    const one = rememberAnswer(q, undefined, `  ${MINE} `);
    expect(one).toEqual([MINE]);
    expect(rememberAnswer(q, one, "no problem let me go back to the previous one")).toBe(one); // same after normalization
    let list = one;
    for (const s of ["Sure, one moment, I'll go back.", "Of course, going back now.", "Sure, let me show the previous one again."]) list = rememberAnswer(q, list, s);
    expect(list).toHaveLength(MAX_LEARNED);
    expect(list?.[MAX_LEARNED - 1]).toBe("Sure, let me show the previous one again.");
  });

  it("a remembered answer is graded at once; a close variant keeps its meaning but not extra trust", () => {
    const before = evaluateLocal(q, MINE);
    expect(before.confidence).not.toBe("high");
    expect(ruleBasedIsEnough(before)).toBe(false);

    const same = evaluateLocal(q, "No problem. Let me go back to the previous one", { learned: [MINE] });
    expect(same.exact).toBe(true);
    expect(same.learned).toBe(true);
    expect(same.scores.overall).toBe(100);

    // A close variant: the meaning chunk the approved wording says in other words ("the previous one" for
    // "the previous slide") is not reported missing.
    const variant = evaluateLocal(q, "Sure, let me go back to the previous one.", { learned: [MINE] });
    expect(variant.meaning.every((m) => m.present)).toBe(true);
    expect(variant.scores.overall).toBeGreaterThanOrEqual(85);
    expect(evaluateLocal(q, "Sure, let me go back to the previous one.").scores.overall).toBeLessThan(85);
    // …but only while the words that carried it are still there.
    const changed = evaluateLocal(q, "No problem, let me go back to the previous meeting.", { learned: [MINE] });
    expect(changed.meaning.find((m) => m.id === "slide")?.present).toBe(false);
    // Approved wordings never make a reworded answer "close to a known answer".
    expect(evaluateLocal(q, "No problem, let me just go back to the previous one.", { learned: [MINE] }).confidence).toBe(before.confidence);

    // A mistake in the remembered wording is still caught.
    const wrong = evaluateLocal(q, "No problem, let me going back to the previous one.", { learned: [MINE] });
    expect(wrong.exact).toBe(false);
    expect(wrong.errors.some((e) => e.severity !== "minor")).toBe(true);
  });

  it("recording a Claude-approved answer teaches the grader; the next submit is instant", async () => {
    const st = createInitialState(T0);
    const ev = asClaude(evaluateLocal(q, MINE));
    const r = recordAttempt(st, { question: q, evaluation: ev, hint: 0, responseMs: 4000, firstKeyMs: 500, context: "lesson", now: T0 }, QUESTION_BY_ID);
    expect(r.state.seen[q.id].ok).toEqual([MINE]);
    // A rule-based grade of the same answer teaches nothing.
    const r2 = recordAttempt(st, { question: q, evaluation: evaluateLocal(q, MINE), hint: 0, responseMs: 4000, firstKeyMs: 500, context: "lesson", now: T0 }, QUESTION_BY_ID);
    expect(r2.state.seen[q.id].ok).toBeUndefined();

    const calls: string[] = [];
    const g = createGrader({
      evaluate: (_q, answer) => {
        calls.push(answer);
        return new Promise(() => undefined);
      },
      aiEnabled: () => true,
      budgetMs: () => 2500,
      learned: (question) => r.state.seen[question.id]?.ok,
    });
    const out = await g.grade(q, MINE, 0);
    expect(out.via).toBe("instant");
    expect(out.evaluation.learned).toBe(true);
    expect(calls).toEqual([]);
  });
});
