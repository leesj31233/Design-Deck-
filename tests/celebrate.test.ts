import { describe, expect, it } from "vitest";
import { celebrationFor, isSuccess } from "@/engflow/core/celebration";
import { evaluateLocal } from "@/engflow/core/evaluate";
import { listScenarios, recommendScenario, scenarioItems } from "@/engflow/core/roleplay";
import { buildLadder, ladderRange, ladderSteps } from "@/engflow/core/ladder";
import { situationOf } from "@/engflow/core/situations";
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
  it("a perfect answer without hints gets fireworks, and the same answer always gets the same line", () => {
    const seenBefore = { ...fresh(), seen: { [q.id]: { count: 1, lastAt: NOW - 86_400_000, best: 70 } } };
    const a = celebrationFor({ ...base, evaluation: exact(), prev: seenBefore });
    const b = celebrationFor({ ...base, evaluation: exact(), prev: seenBefore });
    expect(a?.kind).toBe("perfect");
    expect(a?.burst).toBe("fireworks");
    expect(a?.titleKo).toBe(b?.titleKo);
    // A fast perfect answer says how fast.
    expect(celebrationFor({ ...base, evaluation: exact(), prev: seenBefore, responseMs: 3200 })?.detailKo).toContain("3.2초");
  });

  it("100 points on a question never seen before, or on a long explanation, has its own fireworks", () => {
    expect(celebrationFor({ ...base, evaluation: exact(), prev: fresh() })).toMatchObject({ kind: "first-perfect", titleKo: "첫 도전에 100점!", burst: "fireworks" });
    const long = QUESTION_BY_ID["fs-pilot-dryer-tested-last-month"] as Question;
    const c = celebrationFor({ ...base, question: long, evaluation: evaluateLocal(long, long.reference), prev: fresh() });
    expect(c).toMatchObject({ kind: "long-perfect", burst: "fireworks" });
    expect(c?.detailKo).toMatch(/\d+단어로 길게/);
  });

  it("the third clean answer in a row on the same question is 'mastered', once", () => {
    const att = (overall: number, at: number): AttemptRecord => ({ id: `a${at}`, at, questionId: q.id, mode: q.mode, context: "review", answer: q.reference, overall, scores: { meaning: overall, grammar: overall, terminology: overall, organization: overall, comprehensibility: overall }, errorCategories: [], hint: 0, responseMs: 3000, firstKeyMs: 500, grade: 3, evaluator: "local" });
    const seen = { [q.id]: { count: 2, lastAt: NOW - 1000, best: 95 } };
    expect(celebrationFor({ ...base, evaluation: scored(92), prev: { ...fresh(), seen, attempts: [att(90, 1), att(95, 2)] } })).toMatchObject({ kind: "mastered", burst: "sparkle" });
    // Already mastered (three clean before), or a miss in between: no repeat.
    expect(celebrationFor({ ...base, evaluation: scored(92), prev: { ...fresh(), seen, attempts: [att(88, 0), att(90, 1), att(95, 2)] } })?.kind).not.toBe("mastered");
    expect(celebrationFor({ ...base, evaluation: scored(92), prev: { ...fresh(), seen, attempts: [att(60, 1), att(95, 2)] } })?.kind).not.toBe("mastered");
  });

  it("a short reply at conversation speed is 'speedy'; a slow one or a long answer is not", () => {
    const short = QUESTION_BY_ID["tk-reaction-got-it"] as Question;
    const ev = { ...evaluateLocal(short, short.reference), exact: false, scores: { ...evaluateLocal(short, short.reference).scores, overall: 92 } };
    expect(celebrationFor({ ...base, question: short, evaluation: ev, prev: fresh(), responseMs: 2500 })).toMatchObject({ kind: "speedy", burst: "sparkle" });
    expect(celebrationFor({ ...base, question: short, evaluation: ev, prev: fresh(), responseMs: 9000 })?.kind).not.toBe("speedy");
    const long = QUESTION_BY_ID["fs-pilot-dryer-tested-last-month"] as Question;
    const lev = { ...evaluateLocal(long, long.reference), exact: false, scores: { ...evaluateLocal(long, long.reference).scores, overall: 92 } };
    expect(celebrationFor({ ...base, question: long, evaluation: lev, prev: fresh(), responseMs: 2500 })?.kind).not.toBe("speedy");
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

  it("reaching today's goal beats everything else, and only a clean answer celebrates it", () => {
    const day = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
    const log = (answered: number) => ({ answered, correct: answered, minutes: 0 }) as never;
    const prev = { ...fresh(), daily: { [day(NOW)]: log(9) }, settings: { dailyTarget: 10 } };
    expect(celebrationFor({ ...base, evaluation: exact(), prev })).toMatchObject({ kind: "goal", burst: "confetti" });
    expect(celebrationFor({ ...base, evaluation: scored(70), prev })).toBeNull();
    // First answer of the day after six days in a row: a 7-day milestone.
    const week = Object.fromEntries([1, 2, 3, 4, 5, 6].map((k) => [day(NOW - k * 86_400_000), log(5)]));
    expect(celebrationFor({ ...base, evaluation: scored(90), prev: { ...fresh(), daily: week, settings: { dailyTarget: 10 } } })).toMatchObject({ kind: "days", titleKo: "7일 연속 학습!" });
  });

  it("the 10th sentence the learner can say well is a collection milestone", () => {
    const seen = Object.fromEntries(QUESTIONS.filter((x) => x.id !== q.id).slice(0, 9).map((x) => [x.id, { count: 1, lastAt: NOW - 3_600_000, best: 90 }]));
    expect(celebrationFor({ ...base, evaluation: scored(88), prev: { ...fresh(), seen } })).toMatchObject({ kind: "collection", titleKo: "말할 수 있는 문장 10개!" });
    // Already owned: no second milestone for the same sentence.
    expect(celebrationFor({ ...base, evaluation: scored(88), prev: { ...fresh(), seen: { ...seen, [q.id]: { count: 1, lastAt: NOW, best: 86 } } } })?.kind).not.toBe("collection");
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

describe("short-to-long ladder", () => {
  it("climbs evenly from a one-line reply to the learner's level plus a stretch", () => {
    expect(ladderSteps(1, 8, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ladderSteps(1, 7, 5)).toEqual([1, 3, 4, 6, 7]);
    expect(ladderRange(5)).toEqual({ from: 1, to: 7 });
    expect(ladderRange(1)).toEqual({ from: 1, to: 4 });
    expect(ladderRange(10)).toEqual({ from: 1, to: 10 });
  });

  it("stays in the scene, never repeats a question and never goes down", () => {
    const state = createInitialState(NOW);
    for (const situation of ["smalltalk", "online", "meal", "all"] as const) {
      const items = buildLadder(state, QUESTIONS, { situation, from: 1, to: 8, size: 8, now: NOW, rng: () => 0.3 });
      expect(items.length).toBe(8);
      const qs = items.map((i) => QUESTION_BY_ID[i.questionId]!);
      expect(new Set(qs.map((x) => x.id)).size).toBe(8);
      if (situation !== "all") for (const x of qs) expect(situationOf(x)).toBe(situation);
      for (let k = 1; k < qs.length; k++) expect(qs[k].difficulty).toBeGreaterThanOrEqual(qs[k - 1].difficulty);
      expect(qs[0].difficulty).toBeLessThanOrEqual(2);
      expect(qs[7].difficulty).toBeGreaterThanOrEqual(7);
      expect(items[0].reasonKo).toMatch(/^계단 1\/8/);
    }
  });
});
