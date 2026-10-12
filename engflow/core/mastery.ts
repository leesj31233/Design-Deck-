import { DAY_MS } from "./fsrs";
import type { HintLevel, MasteryStatus, SkillState } from "./types";

/** How much a hint-assisted answer counts as evidence of independent ability. */
export const HINT_EVIDENCE = [1, 0.75, 0.5, 0.25, 0] as const;
const ALPHA = 0.35;

export const MASTERY_RULES = {
  minMastery: 0.85,
  minIndependentSuccesses: 3,
  minDistinctDays: 2,
  minDistinctQuestions: 2,
  minSpacedGapDays: 6,
};

export const STATUS_LABEL_KO: Record<MasteryStatus, string> = {
  new: "시작 전",
  learning: "학습 중",
  improving: "향상 중",
  mastered: "숙달",
};

export function newSkillState(skill: string): SkillState {
  return {
    skill, attempts: 0, independentSuccesses: 0, hintedAttempts: 0, mastery: 0, status: "new", lastAt: null,
    successDays: [], successQuestions: [], longestSpacedSuccessDays: 0, skippedCount: 0,
  };
}

/** A weakness imported from the learner's history: visible as "learning", but not evidence of anything. */
export function importedSkillState(skill: string): SkillState {
  return { ...newSkillState(skill), status: "learning", mastery: 0.15, imported: true };
}

/** A day with any practice: answered questions or free-talk lines. */
export function practiced(d: { answered?: number; talk?: number } | undefined): boolean {
  return !!d && ((d.answered ?? 0) > 0 || (d.talk ?? 0) > 0);
}

export function localDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface Evidence {
  at: number;
  questionId: string;
  overall: number;
  hint: HintLevel;
  skipped?: boolean;
  /** Secondary evidence (e.g. an error attributed to this skill in another question) counts less. */
  weight?: number;
  /** The attempt was a success for this skill. */
  success: boolean;
}

export function applyEvidence(s: SkillState, e: Evidence, lastSuccessAt: number | null): SkillState {
  const value = e.skipped ? 0 : (e.overall / 100) * HINT_EVIDENCE[e.hint];
  const weight = e.weight ?? 1;
  const alpha = ALPHA * weight;
  const mastery = s.attempts === 0 && !s.imported ? value * 0.6 : s.mastery + alpha * (value - s.mastery);
  const independentSuccess = e.success && e.hint === 0 && !e.skipped && weight >= 1;
  const next: SkillState = {
    ...s,
    attempts: s.attempts + 1,
    hintedAttempts: s.hintedAttempts + (e.hint > 0 ? 1 : 0),
    skippedCount: s.skippedCount + (e.skipped ? 1 : 0),
    mastery: Math.max(0, Math.min(1, mastery)),
    lastAt: e.at,
  };
  if (independentSuccess) {
    next.independentSuccesses = s.independentSuccesses + 1;
    const day = localDayKey(e.at);
    if (!next.successDays.includes(day)) next.successDays = [...s.successDays, day].slice(-30);
    if (!next.successQuestions.includes(e.questionId)) next.successQuestions = [...s.successQuestions, e.questionId].slice(-30);
    if (lastSuccessAt) next.longestSpacedSuccessDays = Math.max(s.longestSpacedSuccessDays, (e.at - lastSuccessAt) / DAY_MS);
  }
  next.status = statusOf(next, independentSuccess);
  return next;
}

/**
 * Mastery needs repeated, independent, spaced evidence on different questions —
 * never a single good answer.
 */
export function statusOf(s: SkillState, lastWasSuccess?: boolean): MasteryStatus {
  if (s.attempts === 0) return s.imported ? "learning" : "new";
  const r = MASTERY_RULES;
  if (
    s.mastery >= r.minMastery &&
    s.independentSuccesses >= r.minIndependentSuccesses &&
    s.successDays.length >= r.minDistinctDays &&
    s.successQuestions.length >= r.minDistinctQuestions &&
    s.longestSpacedSuccessDays >= r.minSpacedGapDays &&
    lastWasSuccess !== false
  ) {
    return "mastered";
  }
  if (s.mastery >= 0.6 && s.independentSuccesses >= 1) return "improving";
  return "learning";
}

/** What is still missing before a skill counts as mastered (for the UI). */
export function masteryGapKo(s: SkillState): string[] {
  const r = MASTERY_RULES;
  const out: string[] = [];
  if (s.mastery < r.minMastery) out.push(`숙련도 ${Math.round(s.mastery * 100)}% → ${r.minMastery * 100}%`);
  if (s.independentSuccesses < r.minIndependentSuccesses) out.push(`힌트 없이 정답 ${s.independentSuccesses}/${r.minIndependentSuccesses}회`);
  if (s.successDays.length < r.minDistinctDays) out.push(`서로 다른 날 ${s.successDays.length}/${r.minDistinctDays}일`);
  if (s.successQuestions.length < r.minDistinctQuestions) out.push(`서로 다른 문장 ${s.successQuestions.length}/${r.minDistinctQuestions}개`);
  if (s.longestSpacedSuccessDays < r.minSpacedGapDays) out.push(`${r.minSpacedGapDays}일 이상 간격을 두고 다시 성공`);
  return out;
}
