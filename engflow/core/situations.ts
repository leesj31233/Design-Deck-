import type { Cefr, Question, Situation } from "./types";

/** A question's conversation scene (curated questions say it; older ones derive it from their category). */
export function situationOf(q: Pick<Question, "situation" | "category">): Situation {
  if (q.situation) return q.situation;
  return q.category === "meeting" || q.category === "collab" || q.category === "business" ? "discussion" : "technical";
}

/** Starting difficulty (1–10) for a CEFR level when the learner has not chosen one. */
export function autoDifficulty(level: Cefr): number {
  return { A1: 1, A2: 2, B1: 4, B2: 6, C1: 8, C2: 9 }[level];
}

/**
 * Difficulty target for a scene: the learner's choice for that scene, else their choice for mixed
 * sessions, else the average of the scenes they did set (someone who chose 1 everywhere keeps easy
 * questions in a scene added later), else the level's automatic target.
 */
export function sceneDifficulty(saved: Partial<Record<Situation | "all", number>> | undefined, scene: Situation | "all", level: Cefr): number {
  const s = saved ?? {};
  if (typeof s[scene] === "number") return s[scene]!;
  if (typeof s.all === "number") return s.all;
  const set = Object.entries(s).filter(([k, v]) => k !== "all" && typeof v === "number").map(([, v]) => v as number);
  if (set.length) return Math.round(set.reduce((a, b) => a + b, 0) / set.length);
  return autoDifficulty(level);
}

/** CEFR band that a 1–10 difficulty corresponds to. */
export function difficultyLevel(d: number): Cefr {
  return d <= 2 ? "A2" : d <= 5 ? "B1" : d <= 8 ? "B2" : "C1";
}
