import { scoredErrors } from "./evaluate";
import { situationOf } from "./situations";
import { weakGrammar, weaknessMatch } from "./weakness";
import type { Evaluation, LearnerState, Question } from "./types";

/**
 * Which moment an answer deserves to be celebrated as, if any. Pure, so the
 * same answer always gets the same celebration and it can be tested.
 */

export type CelebrationKind = "perfect" | "streak" | "weak-cleared" | "improved" | "comeback" | "great";

export interface Celebration {
  kind: CelebrationKind;
  titleKo: string;
  detailKo?: string;
  /** Visual effect: a full confetti burst, a smaller sparkle, or nothing. */
  burst: "confetti" | "sparkle" | "none";
  /** Points gained over the previous best on this question. */
  delta?: number;
}

const PERFECT_TITLES = ["완벽해요!", "원어민처럼 말했어요!", "Nailed it! 완벽합니다", "100점! 회의에서 그대로 쓰세요", "Spot on! 흠잡을 데가 없어요"];
const GREAT_TITLES = ["아주 좋아요!", "자연스러워요!", "Nice! 거의 완벽해요", "좋은 표현이에요!"];
const STREAK_MILESTONES = new Set([3, 5, 10, 15, 20, 30, 50]);

/** A stable pick from a list (the same answer always shows the same line). */
function pick<T>(list: T[], seed: string): T {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

/** A clean answer: good score, no major error, at most the first hint. */
export function isSuccess(ev: Evaluation, hint: number): boolean {
  return ev.scores.overall >= 85 && hint <= 1 && !scoredErrors(ev.errors).some((e) => e.severity !== "minor");
}

export function celebrationFor(input: {
  evaluation: Evaluation;
  question: Question;
  /** Learner state BEFORE this answer is recorded. */
  prev: Pick<LearnerState, "seen" | "attempts" | "weak">;
  /** Consecutive clean answers in this session, including this one (0 if this one is not clean). */
  streak: number;
  hint: number;
  now: number;
  /** Primary skill of a question id (attempts store only the id). */
  skillOf: (questionId: string) => string | undefined;
}): Celebration | null {
  const { evaluation: ev, question: q, prev, streak, hint, now, skillOf } = input;
  const success = isSuccess(ev, hint);
  const seed = `${q.id}|${ev.answer}`;
  if (!success) return null;

  if ((ev.scores.overall === 100 || ev.exact) && hint === 0) {
    return { kind: "perfect", titleKo: pick(PERFECT_TITLES, seed), detailKo: streak >= 3 ? `${streak}연속 정답 중이에요.` : undefined, burst: "confetti" };
  }
  if (STREAK_MILESTONES.has(streak)) {
    return { kind: "streak", titleKo: `${streak}연속 정답!`, detailKo: "흐름이 좋아요. 이 속도로 계속 가요.", burst: streak >= 5 ? "confetti" : "sparkle" };
  }
  // A question on a grammar point the learner keeps getting wrong, answered without that mistake.
  const weak = weakGrammar(prev, now);
  const match = weaknessMatch(q, weak);
  if (match.point && match.score >= 1 && !scoredErrors(ev.errors).some((e) => e.category === match.point!.category)) {
    return { kind: "weak-cleared", titleKo: "약점 극복!", detailKo: `자주 틀리던 '${match.point.labelKo}'를 이번엔 정확하게 썼어요.`, burst: "sparkle" };
  }
  const best = prev.seen[q.id]?.best;
  if (best !== undefined && ev.scores.overall - best >= 10) {
    const delta = ev.scores.overall - best;
    return { kind: "improved", titleKo: `+${delta}점 향상!`, detailKo: `지난번 최고 ${best}점에서 ${ev.scores.overall}점이 됐어요.`, burst: "sparkle", delta };
  }
  // The previous answer on the same grammar fell short; this one did not.
  const last = [...prev.attempts].reverse().find((a) => !a.skipped && a.questionId !== q.id && skillOf(a.questionId) === q.skills[0]);
  if (last && last.overall < 85) {
    return { kind: "comeback", titleKo: "이번엔 해냈어요!", detailKo: `같은 문법에서 지난번 ${last.overall}점이었어요.`, burst: "sparkle" };
  }
  if (ev.scores.overall >= 90) {
    return { kind: "great", titleKo: pick(GREAT_TITLES, seed), detailKo: situationOf(q) === "reaction" ? "짧은 대답일수록 바로 나오는 게 중요해요." : undefined, burst: "none" };
  }
  return null;
}
