import { describe, expect, it } from "vitest";
import { BADGE_FAMILIES, badgeStatuses, earnedBadgeIds, longestStreak, newBadges } from "@/engflow/core/badges";
import { evaluateLocal } from "@/engflow/core/evaluate";
import { createInitialState, recordAttempt } from "@/engflow/core/store";
import { QUESTIONS, QUESTION_BY_ID } from "@/engflow/content";
import type { LearnerState } from "@/engflow/core/types";

const T0 = Date.UTC(2026, 9, 1, 9);
const DAY = 86_400_000;
const status = (st: LearnerState, id: string) => badgeStatuses(st, QUESTIONS, QUESTION_BY_ID).find((s) => s.family.id === id)!;

/** Answer a question with its reference (100 points) at time t. */
function answer(st: LearnerState, id: string, t: number, opts: { responseMs?: number; context?: "lesson" | "review" } = {}): LearnerState {
  const q = QUESTION_BY_ID[id];
  return recordAttempt(st, { question: q, evaluation: evaluateLocal(q, q.reference), hint: 0, responseMs: opts.responseMs ?? 6000, firstKeyMs: 800, context: opts.context ?? "lesson", now: t }, QUESTION_BY_ID).state;
}

describe("badges", () => {
  it("every family has a title per tier and rising goals", () => {
    for (const f of BADGE_FAMILIES) {
      expect(f.titlesKo).toHaveLength(f.goals.length);
      expect([...f.goals].sort((a, b) => a - b)).toEqual(f.goals);
    }
  });

  it("a new learner has no badge; the first 100 earns 'first 100' and counts towards the rest", () => {
    const st = createInitialState(T0);
    expect(earnedBadgeIds(badgeStatuses(st, QUESTIONS, QUESTION_BY_ID)).size).toBe(0);
    const before = earnedBadgeIds(badgeStatuses(st, QUESTIONS, QUESTION_BY_ID));
    const after = answer(st, "tk-reaction-got-it", T0, { responseMs: 2500 });
    const p = status(after, "perfect");
    expect(p).toMatchObject({ value: 1, tier: 1, titleKo: "첫 100점", next: 10 });
    expect(status(after, "speed").value).toBe(1); // a short reply in 2.5 s
    const gained = newBadges(before, badgeStatuses(after, QUESTIONS, QUESTION_BY_ID));
    expect(gained.map((g) => g.titleKo)).toContain("첫 100점");
  });

  it("the longest streak of practice days counts, even after a break", () => {
    const d = (k: number) => new Date(T0 + k * DAY).toISOString().slice(0, 10);
    const daily = Object.fromEntries([0, 1, 2, 3, 6, 7].map((k) => [d(k), { answered: 3, correct: 2, reviews: 0, newItems: 3, ms: 1000 }]));
    expect(longestStreak(daily)).toBe(4);
  });

  it("a role-play counts once every turn has been said at 85+", () => {
    let st = createInitialState(T0);
    const steps = QUESTIONS.filter((q) => q.scenario?.id === "rp-weekly-call").sort((a, b) => a.scenario!.step - b.scenario!.step);
    expect(steps.length).toBeGreaterThan(1);
    steps.slice(0, -1).forEach((q, i) => (st = answer(st, q.id, T0 + i * 60_000)));
    expect(status(st, "roleplay").value).toBe(0);
    st = answer(st, steps[steps.length - 1].id, T0 + DAY);
    expect(status(st, "roleplay")).toMatchObject({ value: 1, tier: 1 });
  });
});
