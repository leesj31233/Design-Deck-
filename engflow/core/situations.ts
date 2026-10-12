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

/** CEFR band that a 1–10 difficulty corresponds to. */
export function difficultyLevel(d: number): Cefr {
  return d <= 2 ? "A2" : d <= 5 ? "B1" : d <= 8 ? "B2" : "C1";
}
