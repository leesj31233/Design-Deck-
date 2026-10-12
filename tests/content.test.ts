import { describe, expect, it } from "vitest";
import { validateBank, validateQuestion } from "@/engflow/core/validate";
import { QUESTIONS, DIAGNOSTIC_ITEMS, GUIDE, SKILLS, SEEDS } from "@/engflow/content";

const ctx = { skillIds: new Set(SKILLS.map((s) => s.id)), seedIds: new Set(SEEDS.map((s) => s.id)) };

describe("curated content quality gate", () => {
  // About 1,000 questions and 3,000 probes through every grammar rule: allow time on a busy machine.
  it("every question passes QC, including all evaluator probes", () => {
    const errors = validateBank(QUESTIONS, ctx).filter((i) => i.level === "error");
    expect(errors.map((e) => `${e.questionId}: ${e.message}`)).toEqual([]);
  }, 180_000);

  it("diagnostic production items pass the same QC", () => {
    const errors = DIAGNOSTIC_ITEMS.filter((d) => d.question).flatMap((d) => validateQuestion(d.question!, ctx)).filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });

  it("covers every skill, category and level A2–C1", () => {
    const lessons = QUESTIONS.filter((q) => !q.variation);
    for (const s of SKILLS) expect(lessons.filter((q) => q.skills[0] === s.id).length, s.id).toBeGreaterThanOrEqual(2);
    for (const c of ["process", "pilot", "meeting", "collab", "operation", "business"]) expect(lessons.some((q) => q.category === c), c).toBe(true);
    for (const l of ["A2", "B1", "B2", "C1"]) expect(lessons.some((q) => q.level === l), l).toBe(true);
    expect(Object.keys(GUIDE).sort()).toEqual(SKILLS.map((s) => s.id).sort());
  });

  it("each imported mistake has a 4-level variation ladder with fresh sentences", () => {
    for (const seed of SEEDS) {
      const ladder = QUESTIONS.filter((q) => q.variation?.seed === seed.id);
      expect(new Set(ladder.map((q) => q.variation!.level)), seed.id).toEqual(new Set([0, 1, 2, 3]));
      expect(new Set(ladder.map((q) => q.reference)).size).toBe(ladder.length);
    }
  });

  it("conditional prompts keep 'decide now' / 'decided now' / 'had decided earlier' distinct", () => {
    const refs = QUESTIONS.map((q) => q.reference.toLowerCase());
    expect(refs.some((r) => /had decided[^,.]*\bnow\b/.test(r))).toBe(false);
    expect(QUESTIONS.find((q) => q.id === "ph-cond2-if-decided-now")?.reference).toMatch(/If we decided now/i);
    expect(QUESTIONS.find((q) => q.id === "ph-cond3-had-decided-earlier")?.reference).toMatch(/If we had decided earlier/i);
  });
});
