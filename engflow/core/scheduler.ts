import { DAY_MS, intervalForRetention, retrievability, reviewFsrs } from "./fsrs";
import type { Evaluation, Grade, HintLevel, QuestionMode, ReviewItem } from "./types";

/** Onboarding ladder in days; step 0 = immediate retry. */
export const LADDER_DAYS = [0, 1, 3, 7, 14, 30] as const;
export const IMMEDIATE_RETRY_MS = 5 * 60_000;
/** Successful spaced reviews needed before the adaptive (FSRS) schedule takes over. */
export const GRADUATION_SUCCESSES = 2;

export const GRADE_LABEL_KO: Record<Grade, string> = { 1: "다시", 2: "어려움", 3: "좋음", 4: "쉬움" };

/** Expected response time used to judge fluency (ms). */
export function expectedResponseMs(mode: QuestionMode, targetWords: number): number {
  return mode === "phrase" ? 6_000 + 1_200 * targetWords : 10_000 + 2_200 * targetWords;
}

export interface GradeInput {
  evaluation: Pick<Evaluation, "scores" | "errors"> & Partial<Pick<Evaluation, "evaluator" | "confidence">>;
  hint: HintLevel;
  responseMs: number;
  expectedMs: number;
  skipped?: boolean;
}

/**
 * Convert an evaluation into an FSRS grade. Hints cap the grade so a
 * hint-assisted answer never counts as independent recall; very slow answers
 * are downgraded one step.
 */
export function deriveGrade(input: GradeInput): { grade: Grade; reasons: string[] } {
  const reasons: string[] = [];
  if (input.skipped) return { grade: 1, reasons: ["건너뛴 문항"] };
  if (input.hint >= 3) return { grade: 1, reasons: [input.hint === 4 ? "정답 보기 사용" : "부분 정답 힌트 사용"] };
  const { overall } = input.evaluation.scores;
  // Advisory notes (site-specific wording) never affect the grade; spelling alone does not block "Easy".
  const errs = input.evaluation.errors.filter((e) => !e.advisory);
  const hasCritical = errs.some((e) => e.severity === "critical");
  const hasMajor = errs.some((e) => e.severity === "major");
  let g: Grade = overall >= 95 && errs.every((e) => e.category === "spelling") ? 4 : overall >= 85 && !hasMajor ? 3 : overall >= 70 ? 2 : 1;
  if (hasCritical && g > 1) {
    g = 1;
    reasons.push("의미가 달라지는 오류");
  } else if (hasMajor && g > 2) {
    g = 2;
    reasons.push("주요 문법 오류");
  }
  // Reworded answers the rule-based grader could not fully check never count as "Easy".
  if (input.evaluation.evaluator === "local" && input.evaluation.confidence === "low" && g > 3) {
    g = 3;
    reasons.push("규칙 기반으로만 확인한 답");
  }
  if (input.hint === 2 && g > 2) {
    g = 2;
    reasons.push("힌트 2단계 사용");
  } else if (input.hint === 1 && g > 3) {
    g = 3;
    reasons.push("힌트 1단계 사용");
  }
  if (g >= 3 && input.responseMs > input.expectedMs * 4) {
    g = (g - 1) as Grade;
    reasons.push("응답 시간이 매우 김");
  } else if (g === 4 && input.responseMs > input.expectedMs * 2.5) {
    g = 3;
    reasons.push("응답 시간이 김");
  }
  if (!reasons.length) reasons.push(`종합 ${overall}점`);
  return { grade: g, reasons };
}

function fmtDays(d: number): string {
  if (d < 1) return "곧";
  return `${Math.round(d)}일 뒤`;
}

/**
 * Schedule the next review. New items climb the fixed onboarding ladder
 * (immediate → 1 → 3 → 7 → 14 → 30 days); once they have succeeded twice the
 * adaptive FSRS interval takes over (unless the learner chose the fixed ladder).
 * FSRS memory state is updated on every review either way.
 */
export function scheduleReview(
  item: ReviewItem,
  g: Grade,
  now: number,
  mode: "adaptive" | "ladder",
): ReviewItem {
  const { state: fsrs } = reviewFsrs(item.fsrs, g, now);
  const successes = item.successes + (g >= 3 ? 1 : 0);
  const failures = item.failures + (g === 1 ? 1 : 0);
  let due: number;
  let ladderStep = item.ladderStep;
  let note: string;

  const onLadder = mode === "ladder" || successes < GRADUATION_SUCCESSES || g === 1;
  if (onLadder) {
    if (g === 1) ladderStep = 0;
    else if (g === 2) ladderStep = Math.max(1, ladderStep);
    else if (g === 3) ladderStep = Math.min(LADDER_DAYS.length - 1, ladderStep + 1);
    else ladderStep = Math.min(LADDER_DAYS.length - 1, ladderStep + 2);
    const days = LADDER_DAYS[ladderStep];
    due = days === 0 ? now + IMMEDIATE_RETRY_MS : now + days * DAY_MS;
    note =
      g === 1
        ? "틀린 문항은 바로 다시 연습한 뒤 1일 → 3일 → 7일 간격으로 복습합니다."
        : `${mode === "ladder" ? "고정 간격" : "초기 학습 단계"}: 1 → 3 → 7 → 14 → 30일 중 ${days}일 간격 (${fmtDays(days)}).`;
  } else {
    const interval = Math.min(365, Math.max(1, Math.round(intervalForRetention(fsrs.stability))));
    due = now + interval * DAY_MS;
    ladderStep = Math.min(LADDER_DAYS.length - 1, Math.max(ladderStep, 2));
    note = `적응형 FSRS: 기억 안정도 ${fsrs.stability.toFixed(1)}일 · 난이도 ${fsrs.difficulty.toFixed(1)}/10 → 회상 확률 90% 시점인 ${interval}일 뒤.`;
  }
  return { ...item, fsrs, successes, failures, ladderStep, due, scheduleNote: note };
}

/** Current recall probability of an item (null before the first review). */
export function itemRetrievability(item: ReviewItem, now: number): number | null {
  if (!item.fsrs.lastReview) return null;
  return retrievability((now - item.fsrs.lastReview) / DAY_MS, item.fsrs.stability);
}

export function isDue(item: ReviewItem, now: number): boolean {
  return !item.suspended && item.due <= now;
}

/** Overdue = past due by more than a day (or by more than half its interval). */
export function isOverdue(item: ReviewItem, now: number): boolean {
  return !item.suspended && now - item.due > DAY_MS;
}
