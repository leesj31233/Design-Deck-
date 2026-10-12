import { describe, expect, it } from "vitest";
import { createGrader, looksComplete, ruleBasedIsEnough } from "@/engflow/core/grader";
import { evaluateLocal } from "@/engflow/core/evaluate";
import { QUESTION_BY_ID } from "@/engflow/content";
import type { Evaluation, Question } from "@/engflow/core/types";

const q = QUESTION_BY_ID["fs-process-run-simulation-again"];
const WRONG = "We need to run the process simulation again because the feed composition are changed.";

/** A stand-in for Claude that answers after `delay` ms and counts its calls. */
function fakeClaude(delay: number, fail = false) {
  const calls: string[] = [];
  const evaluate = (question: Question, answer: string, local: Evaluation, signal: AbortSignal) => {
    calls.push(answer);
    return new Promise<Evaluation>((resolve, reject) => {
      const t = setTimeout(() => (fail ? reject(new Error("down")) : resolve({ ...local, evaluator: "ai", evaluatorLabel: "Claude 채점" })), delay);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      });
    });
  };
  return { calls, evaluate };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("fast grading", () => {
  it("clear answers are graded instantly without calling Claude", async () => {
    const claude = fakeClaude(500);
    const g = createGrader({ evaluate: claude.evaluate, aiEnabled: () => true, budgetMs: () => 1000 });
    const out = await g.grade(q, q.reference, 0);
    expect(out.via).toBe("instant");
    expect(out.ms).toBeLessThan(100);
    expect(claude.calls).toEqual([]);
    expect(ruleBasedIsEnough(evaluateLocal(q, q.reference))).toBe(true);
  });

  it("Claude's grade is used when it answers within the budget", async () => {
    const claude = fakeClaude(20);
    const g = createGrader({ evaluate: claude.evaluate, aiEnabled: () => true, budgetMs: () => 300 });
    const out = await g.grade(q, WRONG, 0);
    expect(out.via).toBe("ai");
    expect(out.evaluation.evaluator).toBe("ai");
    expect(out.noteKo).toBeNull();
  });

  it("past the budget the rule-based grade is shown, and the late reply cannot replace it", async () => {
    const claude = fakeClaude(200);
    const g = createGrader({ evaluate: claude.evaluate, aiEnabled: () => true, budgetMs: () => 40 });
    const out = await g.grade(q, WRONG, 0);
    expect(out.via).toBe("local-timeout");
    expect(out.evaluation.evaluator).toBe("local");
    expect(out.ms).toBeLessThan(150);
    expect(out.noteKo).toMatch(/규칙 기반/);
    // The aborted request never lands in the cache for a later submit of the same text.
    await sleep(250);
    expect(g.peek(q, WRONG, 0)).toBeNull();
  });

  it("grading that started while typing is ready the moment the learner submits", async () => {
    const claude = fakeClaude(60);
    const g = createGrader({ evaluate: claude.evaluate, aiEnabled: () => true, budgetMs: () => 1000 });
    expect(g.prefetch(q, WRONG, 0)).toBe(true);
    expect(g.prefetch(q, WRONG, 0)).toBe(false); // same text: no second request
    await sleep(100);
    const out = await g.grade(q, WRONG, 0);
    expect(out.via).toBe("prefetched");
    expect(out.ms).toBeLessThan(50);
    expect(claude.calls).toEqual([WRONG]);
  });

  it("adding only a final period after the pause still uses the background grade", async () => {
    const claude = fakeClaude(30);
    const g = createGrader({ evaluate: claude.evaluate, aiEnabled: () => true, budgetMs: () => 1000 });
    const noDot = WRONG.slice(0, -1);
    g.prefetch(q, noDot, 0);
    await sleep(60);
    const out = await g.grade(q, WRONG, 0);
    expect(out.via).toBe("prefetched");
    expect(out.evaluation.answer).toBe(WRONG);
    expect(claude.calls).toEqual([noDot]);
    // A real change (I'm vs I am) is graded again.
    expect(g.peek(q, WRONG.replace("We need", "We needs"), 0)).toBeNull();
  });

  it("a submit during background grading waits only for that same request", async () => {
    const claude = fakeClaude(80);
    const g = createGrader({ evaluate: claude.evaluate, aiEnabled: () => true, budgetMs: () => 1000 });
    g.prefetch(q, WRONG, 0);
    await sleep(30);
    const out = await g.grade(q, WRONG, 0);
    expect(out.via).toBe("ai");
    expect(claude.calls.length).toBe(1);
  });

  it("background grading skips half-written sentences and stops after a few tries", () => {
    const claude = fakeClaude(1000);
    const g = createGrader({ evaluate: claude.evaluate, aiEnabled: () => true, budgetMs: () => 1000, maxPrefetch: 2 });
    expect(looksComplete(q, "We need")).toBe(false);
    expect(g.prefetch(q, "We need", 0)).toBe(false);
    expect(g.prefetch(q, WRONG, 0)).toBe(true);
    expect(g.prefetch(q, WRONG.replace("are", "were"), 0)).toBe(true);
    expect(g.prefetch(q, WRONG.replace("are", "is"), 0)).toBe(false);
    g.reset();
  });

  it("when Claude fails, the rule-based grade appears at once instead of after the budget", async () => {
    const claude = fakeClaude(5, true);
    const g = createGrader({ evaluate: claude.evaluate, aiEnabled: () => true, budgetMs: () => 5000 });
    const out = await g.grade(q, WRONG, 0);
    expect(out.via).toBe("local-error");
    expect(out.ms).toBeLessThan(200);
  });

  it("the learner can stop waiting and take the rule-based grade", async () => {
    const claude = fakeClaude(5000);
    const g = createGrader({ evaluate: claude.evaluate, aiEnabled: () => true, budgetMs: () => 9000 });
    const pending = g.grade(q, WRONG, 0);
    await sleep(20);
    g.skip();
    const out = await pending;
    expect(out.via).toBe("local-skip");
  });

  it("with Claude off, grading is rule-based and immediate", async () => {
    const claude = fakeClaude(10);
    const g = createGrader({ evaluate: claude.evaluate, aiEnabled: () => false, budgetMs: () => 1000 });
    const out = await g.grade(q, WRONG, 0);
    expect(out.via).toBe("local-off");
    expect(claude.calls).toEqual([]);
  });
});
