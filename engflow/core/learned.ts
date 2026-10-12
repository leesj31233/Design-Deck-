import { correctTargets, scoredErrors } from "./evaluate";
import { normalizeForMatch } from "./text";
import type { Evaluation, Question } from "./types";

/**
 * The grader learns from Claude. When Claude grades one of the learner's own
 * wordings as fully correct, the answer is remembered for that question
 * (LearnerState.seen[id].ok). The rule-based grader then treats it as one
 * more correct answer: the same answer is graded at once next time, and a
 * close variant of it counts as "close to a known answer" (high confidence),
 * so it no longer waits for Claude.
 */

export const MAX_LEARNED = 3;

/** Claude graded this answer fully correct: 95 or more and nothing to fix. */
export function claudeApproved(ev: Evaluation): boolean {
  return ev.evaluator === "ai" && ev.scores.overall >= 95 && scoredErrors(ev.errors).length === 0 && !!ev.answer.trim();
}

/** The remembered answers after this one (unchanged when it adds nothing new). */
export function rememberAnswer(q: Question, list: string[] | undefined, answer: string): string[] | undefined {
  const text = answer.trim().replace(/\s+/g, " ");
  const norm = normalizeForMatch(text);
  if (!norm) return list;
  const known = [...correctTargets(q), ...(list ?? [])].some((t) => normalizeForMatch(t) === norm);
  if (known) return list;
  return [...(list ?? []), text].slice(-MAX_LEARNED);
}
