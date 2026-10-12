import { describe, expect, it } from "vitest";
import { applyEvidence, importedSkillState, newSkillState, statusOf } from "@/engflow/core/mastery";
import { DAY_MS } from "@/engflow/core/fsrs";
import { buildSession, mulberry32, pickReviewQuestion, reviewShareFor, weakSkills } from "@/engflow/core/session";
import { createInitialState, exportState, importState, recordAttempt } from "@/engflow/core/store";
import { evaluateLocal } from "@/engflow/core/evaluate";
import { QUESTIONS, QUESTION_BY_ID } from "@/engflow/content";
import { similarQuestions, weakGrammar } from "@/engflow/core/weakness";

const T0 = Date.UTC(2026, 9, 12, 1, 0, 0);

describe("mastery", () => {
  it("one perfect answer never means mastered", () => {
    const s = applyEvidence(newSkillState("x"), { at: T0, questionId: "q1", overall: 100, hint: 0, success: true }, null);
    expect(s.status).not.toBe("mastered");
  });
  it("needs independent, spaced successes on different questions and days", () => {
    let s = newSkillState("x");
    let last: number | null = null;
    const plan = [[0, "q1"], [1, "q2"], [3, "q1"], [10, "q3"], [11, "q2"]] as const;
    for (const [d, q] of plan) {
      const at = T0 + d * DAY_MS;
      s = applyEvidence(s, { at, questionId: q, overall: 100, hint: 0, success: true }, last);
      last = at;
    }
    expect(s.status).toBe("mastered");
  });
  it("same day, same question, many successes is not mastery", () => {
    let s = newSkillState("x");
    let last: number | null = null;
    for (let i = 0; i < 8; i++) {
      s = applyEvidence(s, { at: T0 + i * 1000, questionId: "q1", overall: 100, hint: 0, success: true }, last);
      last = T0 + i * 1000;
    }
    expect(s.status).not.toBe("mastered");
  });
  it("hint-assisted answers count less than independent ones", () => {
    const a = applyEvidence(importedSkillState("x"), { at: T0, questionId: "q", overall: 100, hint: 0, success: true }, null);
    const b = applyEvidence(importedSkillState("x"), { at: T0, questionId: "q", overall: 100, hint: 2, success: true }, null);
    expect(a.mastery).toBeGreaterThan(b.mastery);
    expect(b.independentSuccesses).toBe(0);
  });
  it("imported weaknesses are visible as learning without being evidence", () => {
    const s = importedSkillState("too-adj");
    expect(statusOf(s)).toBe("learning");
    expect(s.attempts).toBe(0);
  });
});

describe("session builder", () => {
  it("mixes about 70% new learning and 30% review", () => {
    const st = createInitialState(T0);
    const plan = buildSession(st, QUESTIONS, { size: 10, mode: "mixed", now: T0 + 30 * DAY_MS, rng: mulberry32(1) });
    expect(plan.items).toHaveLength(10);
    expect(plan.items.filter((i) => i.kind === "review")).toHaveLength(3);
  });
  it("raises the review share when the overdue backlog is large", () => {
    expect(reviewShareFor(0)).toBe(0.3);
    expect(reviewShareFor(30)).toBeGreaterThan(0.7 - 1e-9);
  });
  it("reviews test the grammar with a NEW sentence, climbing the variation ladder", () => {
    const st = createInitialState(T0);
    const item = st.items["item-seed-too-early"];
    const q0 = pickReviewQuestion({ ...item, recentQuestionIds: [] }, QUESTIONS, "mixed", () => 0)!;
    expect(q0.variation?.seed).toBe("seed-too-early");
    expect(q0.variation?.level).toBe(0);
    const later = { ...item, successes: 2, recentQuestionIds: [q0.id] };
    const q2 = pickReviewQuestion(later, QUESTIONS, "mixed", () => 0)!;
    expect(q2.variation?.level).toBe(2);
    expect(q2.id).not.toBe(q0.id);
  });
  it("respects mode, category and skill filters", () => {
    const st = createInitialState(T0);
    const plan = buildSession(st, QUESTIONS, { size: 6, mode: "phrase", category: "pilot", now: T0, rng: mulberry32(3) });
    for (const it of plan.items.filter((i) => i.kind === "new")) {
      const q = QUESTION_BY_ID[it.questionId];
      expect(q.mode).toBe("phrase");
      expect(q.category).toBe("pilot");
    }
  });
  it("weak skills stay visible and neglected ones are flagged", () => {
    const st = createInitialState(T0);
    const weak = weakSkills(st, T0 + 10 * DAY_MS);
    expect(weak.length).toBeGreaterThan(0);
    expect(weak.every((w) => w.neglected)).toBe(true);
  });
});

describe("learner state", () => {
  it("starts with the seven imported mistakes marked as imported", () => {
    const st = createInitialState(T0);
    expect(Object.values(st.mistakes)).toHaveLength(7);
    expect(Object.values(st.mistakes).every((m) => m.origin === "imported")).toBe(true);
    expect(Object.values(st.items).every((i) => i.origin === "imported")).toBe(true);
    expect(st.attempts).toHaveLength(0);
  });
  it("a major error saves the mistake automatically and schedules an immediate retry", () => {
    const st = createInitialState(T0);
    const q = QUESTION_BY_ID["ph-cond1-if-decide-now"];
    const r = recordAttempt(st, { question: q, evaluation: evaluateLocal(q, "If we will decide now"), hint: 0, responseMs: 8000, firstKeyMs: 900, context: "lesson", now: T0 }, QUESTION_BY_ID);
    expect(r.scheduled.some((s) => s.created)).toBe(true);
    const created = r.state.items[r.scheduled[0].itemId];
    expect(created.due - T0).toBeLessThanOrEqual(10 * 60_000);
    expect(Object.values(r.state.mistakes).some((m) => m.origin === "error" && m.incorrect === "If we will decide now")).toBe(true);
    expect(r.attempt.grade).toBeLessThanOrEqual(2);
  });
  it("a correct answer creates no review item", () => {
    const st = createInitialState(T0);
    const q = QUESTION_BY_ID["ph-cond1-if-decide-now"];
    const r = recordAttempt(st, { question: q, evaluation: evaluateLocal(q, "If we decide now,"), hint: 0, responseMs: 5000, firstKeyMs: 500, context: "lesson", now: T0 }, QUESTION_BY_ID);
    expect(r.scheduled).toHaveLength(0);
    expect(r.grade).toBe(4);
  });
  it("a review answer reschedules that review item with history", () => {
    const st = createInitialState(T0);
    const item = st.items["item-seed-still-waiting"];
    const q = pickReviewQuestion(item, QUESTIONS, "mixed", () => 0)!;
    const r = recordAttempt(st, { question: q, evaluation: evaluateLocal(q, q.reference), hint: 0, responseMs: 5000, firstKeyMs: 500, context: "review", reviewItemId: item.id, now: T0 + DAY_MS }, QUESTION_BY_ID);
    const next = r.state.items[item.id];
    expect(next.history).toHaveLength(1);
    expect(next.due).toBeGreaterThan(T0 + DAY_MS);
    expect(next.successes).toBe(1);
  });
  it("export → import round-trips and rejects foreign files", () => {
    const st = createInitialState(T0);
    expect(importState(exportState(st)).items).toEqual(st.items);
    expect(() => importState('{"hello":1}')).toThrow();
  });
});

describe("frequent grammar mistakes", () => {
  const sim = QUESTION_BY_ID["fs-process-run-simulation-again"];
  const record = (state: ReturnType<typeof createInitialState>, q: typeof sim, answer: string, at: number) =>
    recordAttempt(state, { question: q, evaluation: evaluateLocal(q, answer), hint: 0, responseMs: 9000, firstKeyMs: 1000, context: "lesson", now: at }, QUESTION_BY_ID).state;

  it("records the grammar point with the learner's own example, but not spelling or site wording", () => {
    let s = createInitialState(T0);
    s = record(s, sim, "We need to run the process simulation again because the raw composiotion are changed.", T0);
    const points = weakGrammar(s, T0, 0);
    expect(points.length).toBe(1);
    expect(points[0].category).toBe("tense");
    expect(points[0].examples[0].fix).toBe("are → has");
    expect(Object.values(s.weak ?? {}).some((p) => p.category === "spelling" || p.category === "terminology")).toBe(false);
  });

  it("a repeated mistake becomes a weakness and the next session serves similar questions first", () => {
    let s = createInitialState(T0);
    const tq = QUESTIONS.filter((q) => q.skills[0] === "time-clause" && !q.variation);
    s = record(s, tq[0], tq[0].reference.replace(/\b(finishes|is|arrives|comes|gets|sends|starts)\b/, "will $1").replace("will is", "will be"), T0);
    s = record(s, tq[1], tq[1].reference.replace(/\b(finishes|is|arrives|comes|gets|sends|starts)\b/, "will $1").replace("will is", "will be"), T0 + 60_000);
    const weak = weakGrammar(s, T0 + DAY_MS);
    expect(weak[0]?.skill).toBe("time-clause");
    const plan = buildSession(s, QUESTIONS, { size: 10, mode: "mixed", now: T0 + 4 * DAY_MS, rng: mulberry32(7) });
    const fresh = plan.items.filter((i) => i.kind === "new");
    expect(fresh.some((i) => i.reasonKo.startsWith("자주 틀리는 문법"))).toBe(true);
    expect(similarQuestions(weak[0], QUESTIONS, s, T0 + DAY_MS).every((q) => q.skills.includes("time-clause"))).toBe(true);
  });

  it("fades with time and with independent correct answers on the same grammar", () => {
    let s = createInitialState(T0);
    s = record(s, sim, "We need to run the process simulation again because the feed composition are changed.", T0);
    const before = weakGrammar(s, T0, 0)[0].current;
    expect(weakGrammar(s, T0 + 28 * DAY_MS, 0)[0].current).toBeCloseTo(before / 4, 5);
    const other = QUESTIONS.find((q) => q.id !== sim.id && q.skills.includes(sim.skills[0]) && !q.variation)!;
    s = record(s, other, other.reference, T0 + DAY_MS);
    expect(weakGrammar(s, T0 + DAY_MS, 0)[0].current).toBeLessThan(before * Math.pow(0.5, 1 / 14));
  });
});
