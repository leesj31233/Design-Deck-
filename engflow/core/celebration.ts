import { scoredErrors } from "./evaluate";
import { situationOf } from "./situations";
import { weakGrammar, weaknessMatch } from "./weakness";
import { localDayKey } from "./mastery";
import { tokenize, words } from "./text";
import type { Evaluation, LearnerState, Question } from "./types";

/**
 * Which moment an answer deserves to be celebrated as, if any. Pure, so the
 * same answer always gets the same celebration and it can be tested.
 */

export type CelebrationKind =
  | "goal" | "days" | "collection" | "long-perfect" | "first-perfect" | "perfect" | "streak" | "mastered"
  | "weak-cleared" | "improved" | "speedy" | "comeback" | "great";

export interface Celebration {
  kind: CelebrationKind;
  titleKo: string;
  detailKo?: string;
  /** Visual effect: fireworks (100 points), a confetti burst, a smaller sparkle, or nothing. */
  burst: "fireworks" | "confetti" | "sparkle" | "none";
  /** Points gained over the previous best on this question. */
  delta?: number;
}

const PERFECT_TITLES = ["완벽해요!", "원어민처럼 말했어요!", "Nailed it! 완벽합니다", "100점! 회의에서 그대로 쓰세요", "Spot on! 흠잡을 데가 없어요"];
const GREAT_TITLES = ["아주 좋아요!", "자연스러워요!", "Nice! 거의 완벽해요", "좋은 표현이에요!"];
const STREAK_MILESTONES = new Set([3, 5, 10, 15, 20, 30, 50]);
const DAY_MILESTONES = new Set([3, 7, 14, 21, 30, 50, 100, 200, 365]);
const DAY_MS = 86_400_000;
const COLLECTION_MILESTONES = new Set([10, 25, 50, 75, 100, 150, 200, 300, 400, 500]);
/** A long answer: a full explanation rather than a reply. */
const LONG_WORDS = 14;

/** Time to answer that feels like real conversation, by answer length (ms); long answers have none. */
function quickLimitMs(n: number): number {
  return n <= 6 ? 4000 : n <= 12 ? 8000 : 0;
}

const secs = (ms: number) => (ms / 1000).toFixed(1);

/** Days in a row with practice before today (today not counted). */
function daysBefore(daily: LearnerState["daily"], now: number): number {
  let n = 0;
  for (let t = now - DAY_MS; daily[localDayKey(t)]?.answered; t -= DAY_MS) n++;
  return n;
}

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
  /** Learner state BEFORE this answer is recorded (daily log and target enable the daily-goal and practice-days moments). */
  prev: Pick<LearnerState, "seen" | "attempts" | "weak"> & { daily?: LearnerState["daily"]; settings?: Pick<LearnerState["settings"], "dailyTarget"> };
  /** Consecutive clean answers in this session, including this one (0 if this one is not clean). */
  streak: number;
  hint: number;
  now: number;
  /** Primary skill of a question id (attempts store only the id). */
  skillOf: (questionId: string) => string | undefined;
  /** Time from the question appearing to submit (ms), when known. */
  responseMs?: number;
}): Celebration | null {
  const { evaluation: ev, question: q, prev, streak, hint, now, skillOf, responseMs } = input;
  const success = isSuccess(ev, hint);
  const seed = `${q.id}|${ev.answer}`;
  if (!success) return null;
  const perfect = (ev.scores.overall === 100 || ev.exact) && hint === 0;
  const n = words(tokenize(ev.answer)).length;
  const quick = responseMs !== undefined && responseMs > 0 && responseMs <= quickLimitMs(n);

  // Today's goal reached with this answer, or the first answer of the day extends the practice-days streak to a milestone.
  if (prev.daily) {
    const today = prev.daily[localDayKey(now)]?.answered ?? 0;
    const target = prev.settings?.dailyTarget ?? 0;
    if (target > 0 && today + 1 === target) {
      return { kind: "goal", titleKo: "오늘 목표 달성!", detailKo: `${target}문항을 채웠어요.${perfect ? " 마지막은 100점으로!" : ""} 내일도 이어서 해요.`, burst: "confetti" };
    }
    const days = today === 0 ? daysBefore(prev.daily, now) + 1 : 0;
    if (DAY_MILESTONES.has(days)) {
      return { kind: "days", titleKo: `${days}일 연속 학습!`, detailKo: days >= 7 ? "꾸준함이 실력이 됩니다. 정말 잘하고 있어요." : "습관이 만들어지고 있어요.", burst: "confetti" };
    }
  }

  // Sentences the learner can now say well (best 85+): a milestone when this answer adds one.
  if ((prev.seen[q.id]?.best ?? 0) < 85) {
    const owned = Object.values(prev.seen).filter((x) => x.best >= 85).length + 1;
    if (COLLECTION_MILESTONES.has(owned)) {
      return { kind: "collection", titleKo: `말할 수 있는 문장 ${owned}개!`, detailKo: "처음 보는 상황에서도 바로 꺼내 쓸 수 있게 복습으로 이어 갈게요.", burst: "confetti" };
    }
  }

  // 100 points: fireworks. A long explanation or a sentence never seen before gets its own line.
  if (perfect) {
    if (n >= LONG_WORDS) return { kind: "long-perfect", titleKo: "긴 문장도 완벽!", detailKo: `${n}단어로 길게 설명하면서 실수가 하나도 없어요.`, burst: "fireworks" };
    if (!prev.seen[q.id]) {
      return { kind: "first-perfect", titleKo: "첫 도전에 100점!", detailKo: quick ? `처음 보는 상황에서 ${secs(responseMs!)}초 만에 완벽하게.` : "처음 보는 상황인데 한 번에 완벽하게 말했어요.", burst: "fireworks" };
    }
    return {
      kind: "perfect", titleKo: pick(PERFECT_TITLES, seed),
      detailKo: streak >= 3 ? `${streak}연속 정답 중이에요.` : quick ? `${secs(responseMs!)}초 만에 완벽하게!` : undefined,
      burst: "fireworks",
    };
  }
  if (STREAK_MILESTONES.has(streak)) {
    return { kind: "streak", titleKo: `${streak}연속 정답!`, detailKo: "흐름이 좋아요. 이 속도로 계속 가요.", burst: streak >= 5 ? "confetti" : "sparkle" };
  }
  // Third clean answer in a row on this very question: it is the learner's own now.
  const mine = prev.attempts.filter((a) => a.questionId === q.id && !a.skipped);
  const clean = (a: (typeof mine)[number]) => a.overall >= 85 && a.hint <= 1;
  if (mine.length >= 2 && mine.slice(-2).every(clean) && !(mine.length >= 3 && clean(mine[mine.length - 3]))) {
    return { kind: "mastered", titleKo: "완전히 내 표현!", detailKo: "이 문장을 세 번 연속 정확하게 말했어요. 이제 복습 간격이 길어집니다.", burst: "sparkle" };
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
  // A short reply that came out at conversation speed.
  if (quick) {
    return { kind: "speedy", titleKo: "번개 같은 대답!", detailKo: `${secs(responseMs!)}초 만에 정확하게. 실제 대화에서 필요한 속도예요.`, burst: "sparkle" };
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
