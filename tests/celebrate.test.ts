import { describe, expect, it } from "vitest";
import { celebrationFor, isSuccess } from "@/engflow/core/celebration";
import { evaluateLocal } from "@/engflow/core/evaluate";
import { listScenarios, recommendScenario, scenarioItems } from "@/engflow/core/roleplay";
import { buildSession } from "@/engflow/core/session";
import { createInitialState } from "@/engflow/core/store";
import { QUESTIONS, QUESTION_BY_ID } from "@/engflow/content";
import type { AttemptRecord, Evaluation, LearnerState, Question } from "@/engflow/core/types";

const NOW = Date.UTC(2026, 9, 12, 9);
const q = QUESTION_BY_ID["rp-weekly-call-1"] as Question;
const exact = () => evaluateLocal(q, q.reference);
const scored = (overall: number): Evaluation => ({ ...exact(), exact: false, scores: { ...exact().scores, overall } });
const fresh = (): Pick<LearnerState, "seen" | "attempts" | "weak"> => ({ seen: {}, attempts: [], weak: {} });
const skillOf = (id: string) => QUESTION_BY_ID[id]?.skills[0];
const base = { question: q, streak: 1, hint: 0, now: NOW, skillOf };

describe("celebrations", () => {
  it("a perfect answer without hints gets confetti, and the same answer always gets the same line", () => {
    const a = celebrationFor({ ...base, evaluation: exact(), prev: fresh() });
    const b = celebrationFor({ ...base, evaluation: exact(), prev: fresh() });
    expect(a?.kind).toBe("perfect");
    expect(a?.burst).toBe("confetti");
    expect(a?.titleKo).toBe(b?.titleKo);
  });

  it("a perfect answer after the first hint is still a success but not 'perfect'", () => {
    const c = celebrationFor({ ...base, evaluation: exact(), hint: 1, prev: fresh() });
    expect(c?.kind).not.toBe("perfect");
    expect(isSuccess(exact(), 1)).toBe(true);
    expect(celebrationFor({ ...base, evaluation: exact(), hint: 2, prev: fresh() })).toBeNull();
  });

  it("streak milestones: sparkle at 3, confetti from 5", () => {
    expect(celebrationFor({ ...base, evaluation: scored(92), streak: 3, prev: fresh() })).toMatchObject({ kind: "streak", burst: "sparkle" });
    expect(celebrationFor({ ...base, evaluation: scored(92), streak: 5, prev: fresh() })).toMatchObject({ kind: "streak", burst: "confetti" });
    expect(celebrationFor({ ...base, evaluation: scored(92), streak: 4, prev: fresh() })?.kind).not.toBe("streak");
  });

  it("improvement of 10+ points over the best on the same question", () => {
    const prev = { ...fresh(), seen: { [q.id]: { count: 1, lastAt: NOW - 86_400_000, best: 70 } } };
    expect(celebrationFor({ ...base, evaluation: scored(88), prev })).toMatchObject({ kind: "improved", delta: 18 });
  });

  it("a comeback after a weak answer on the same grammar", () => {
    const other = QUESTIONS.find((x) => x.id !== q.id && x.skills[0] === q.skills[0] && !x.variation)!;
    const attempt = { id: "a1", at: NOW - 60_000, questionId: other.id, overall: 60, skipped: false } as unknown as AttemptRecord;
    expect(celebrationFor({ ...base, evaluation: scored(87), prev: { ...fresh(), attempts: [attempt] } })).toMatchObject({ kind: "comeback", burst: "sparkle" });
  });

  it("no celebration below 85 or with a major error; a quiet 'great' at 90+", () => {
    expect(celebrationFor({ ...base, evaluation: scored(80), prev: fresh() })).toBeNull();
    const major = { ...scored(92), errors: [{ id: "e", start: 0, end: 1, category: "tense", severity: "major", bucket: "grammar", fix: "x", noteKo: "" }] } as unknown as Evaluation;
    expect(celebrationFor({ ...base, evaluation: major, prev: fresh() })).toBeNull();
    expect(celebrationFor({ ...base, evaluation: scored(91), prev: fresh() })).toMatchObject({ kind: "great", burst: "none" });
  });
});

describe("role-play scenarios", () => {
  const state = createInitialState(NOW);
  const list = listScenarios(QUESTIONS, state);

  it("groups steps in order with one title and scene", () => {
    expect(list.length).toBeGreaterThan(0);
    for (const s of list) {
      expect(s.steps.map((x) => x.scenario!.step)).toEqual(s.steps.map((_, i) => i + 1));
      expect(new Set(s.steps.map((x) => x.scenario!.titleKo)).size).toBe(1);
      expect(new Set(s.steps.map((x) => x.situation)).size).toBe(1);
      expect(s.best.every((b) => b === 0)).toBe(true);
    }
  });

  it("session items keep the order and say which turn it is", () => {
    const s = list[0];
    const items = scenarioItems(s);
    expect(items.map((i) => i.questionId)).toEqual(s.steps.map((x) => x.id));
    expect(items[0].reasonKo).toContain(`롤플레이 1/${s.steps.length}`);
  });

  it("recommends unfinished scenarios before finished ones", () => {
    const s = list[0];
    const seen = Object.fromEntries(s.steps.map((x) => [x.id, { count: 1, lastAt: NOW, best: 95 }]));
    const after = listScenarios(QUESTIONS, { seen });
    const rec = recommendScenario(after, s.minDifficulty);
    if (after.length > 1) expect(rec?.id).not.toBe(s.id);
    expect(after.find((x) => x.id === s.id)?.done).toBe(s.steps.length);
  });

  it("later role-play turns never show up alone in mixed sessions", () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const situation of ["all", "online", "smalltalk"] as const) {
      const session = buildSession(state, QUESTIONS, { now: NOW, size: 40, mode: "mixed", situation, rng });
      for (const item of session.items) {
        const x = QUESTION_BY_ID[item.questionId];
        if (x?.scenario) expect(x.scenario.step).toBe(1);
      }
    }
  });
});
