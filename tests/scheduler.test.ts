import { describe, expect, it } from "vitest";
import { DAY_MS, intervalForRetention, newFsrsState, retrievability, reviewFsrs, initDifficulty } from "@/engflow/core/fsrs";
import { deriveGrade, scheduleReview, LADDER_DAYS, IMMEDIATE_RETRY_MS } from "@/engflow/core/scheduler";
import type { ReviewItem } from "@/engflow/core/types";

const item = (): ReviewItem => ({
  id: "i", skill: "too-adj", label: "too early", origin: "error", createdAt: 0, due: 0, ladderStep: 0, fsrs: newFsrsState(),
  successes: 0, failures: 0, history: [], scheduleNote: "", recentQuestionIds: [],
});
const ev = (overall: number, severities: ("minor" | "major" | "critical")[] = []) => ({
  scores: { overall } as never,
  errors: severities.map((s) => ({ severity: s })) as never,
});

describe("FSRS-5 memory model", () => {
  it("retrievability is 90% after exactly one stability interval", () => {
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 6);
    expect(intervalForRetention(12.5)).toBeCloseTo(12.5, 6);
  });
  it("Again lowers stability, Easy raises it more than Good", () => {
    const t0 = 0;
    const first = reviewFsrs(newFsrsState(), 3, t0).state;
    const later = 10 * DAY_MS;
    const again = reviewFsrs(first, 1, later).state;
    const good = reviewFsrs(first, 3, later).state;
    const easy = reviewFsrs(first, 4, later).state;
    expect(again.stability).toBeLessThan(first.stability);
    expect(easy.stability).toBeGreaterThan(good.stability);
    expect(good.stability).toBeGreaterThan(first.stability);
    expect(again.lapses).toBe(1);
  });
  it("difficulty stays within 1–10", () => {
    let s = reviewFsrs(newFsrsState(), 1, 0).state;
    for (let i = 1; i < 30; i++) s = reviewFsrs(s, 1, i * DAY_MS).state;
    expect(s.difficulty).toBeLessThanOrEqual(10);
    expect(initDifficulty(4)).toBeGreaterThanOrEqual(1);
  });
});

describe("schedule: onboarding ladder then adaptive", () => {
  it("significant error → immediate retry, then 1 → 3 → 7 days", () => {
    let it0 = scheduleReview(item(), 1, 0, "adaptive");
    expect(it0.due).toBe(IMMEDIATE_RETRY_MS);
    let t = it0.due;
    const seen: number[] = [];
    for (let k = 0; k < 3; k++) {
      it0 = scheduleReview(it0, 3, t, "ladder");
      seen.push(Math.round((it0.due - t) / DAY_MS));
      t = it0.due;
    }
    expect(seen).toEqual([LADDER_DAYS[1], LADDER_DAYS[2], LADDER_DAYS[3]]);
  });
  it("graduates to FSRS after two successes in adaptive mode and explains the decision", () => {
    let it0 = scheduleReview(item(), 3, 0, "adaptive");
    it0 = scheduleReview(it0, 3, it0.due, "adaptive");
    const before = it0.due;
    it0 = scheduleReview(it0, 3, before, "adaptive");
    expect(it0.scheduleNote).toMatch(/FSRS/);
    expect(it0.due - before).toBeGreaterThanOrEqual(DAY_MS);
  });
  it("a lapse after graduation goes back to an immediate retry", () => {
    let it0 = scheduleReview(item(), 4, 0, "adaptive");
    it0 = scheduleReview(it0, 4, it0.due, "adaptive");
    it0 = scheduleReview(it0, 1, it0.due, "adaptive");
    expect(it0.ladderStep).toBe(0);
    expect(it0.failures).toBe(1);
  });
});

describe("grade derivation", () => {
  it("hints cap the grade; reveal counts as Again", () => {
    expect(deriveGrade({ evaluation: ev(100), hint: 0, responseMs: 5000, expectedMs: 20000 }).grade).toBe(4);
    expect(deriveGrade({ evaluation: ev(100), hint: 1, responseMs: 5000, expectedMs: 20000 }).grade).toBe(3);
    expect(deriveGrade({ evaluation: ev(100), hint: 2, responseMs: 5000, expectedMs: 20000 }).grade).toBe(2);
    expect(deriveGrade({ evaluation: ev(100), hint: 4, responseMs: 5000, expectedMs: 20000 }).grade).toBe(1);
  });
  it("errors and slow responses lower the grade", () => {
    expect(deriveGrade({ evaluation: ev(95, ["major"]), hint: 0, responseMs: 5000, expectedMs: 20000 }).grade).toBe(2);
    expect(deriveGrade({ evaluation: ev(90, ["critical"]), hint: 0, responseMs: 5000, expectedMs: 20000 }).grade).toBe(1);
    expect(deriveGrade({ evaluation: ev(100), hint: 0, responseMs: 60000, expectedMs: 20000 }).grade).toBe(3);
    expect(deriveGrade({ evaluation: ev(90), hint: 0, responseMs: 100000, expectedMs: 20000 }).grade).toBe(2);
  });
  it("a skipped question is Again", () => {
    expect(deriveGrade({ evaluation: ev(0), hint: 0, responseMs: 1000, expectedMs: 20000, skipped: true }).grade).toBe(1);
  });
});
