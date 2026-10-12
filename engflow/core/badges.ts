import { localDayKey } from "./mastery";
import { situationOf } from "./situations";
import { tokenize, words } from "./text";
import { SITUATIONS, type LearnerState, type Question, type Situation } from "./types";

/**
 * Badges: lasting rewards for the moments the app celebrates (100 points,
 * practice days, role-plays finished, fast replies …). Each family has up to
 * three tiers. Everything is derived from the learner state, so badges need
 * no storage of their own, sync across devices, and can never disagree with
 * the record.
 */

export type BadgeIcon =
  | "perfect" | "streak" | "collection" | "roleplay" | "long" | "speed" | "scenes" | "hard" | "review" | "goal" | "approved" | "talk";

export interface BadgeFamily {
  id: string;
  icon: BadgeIcon;
  /** Title per tier (same length as `goals`). */
  titlesKo: string[];
  /** What counts, e.g. "100점을 받은 답". */
  unitKo: string;
  goals: number[];
}

export const BADGE_FAMILIES: BadgeFamily[] = [
  { id: "perfect", icon: "perfect", titlesKo: ["첫 100점", "100점 수집가", "100점 장인"], unitKo: "힌트 없이 100점을 받은 답", goals: [1, 10, 50] },
  { id: "streak", icon: "streak", titlesKo: ["3일 연속", "일주일 연속", "한 달 연속"], unitKo: "가장 길게 이어서 공부한 날", goals: [3, 7, 30] },
  { id: "collection", icon: "collection", titlesKo: ["문장 10개", "문장 50개", "문장 150개"], unitKo: "85점 이상으로 말해 본 문장", goals: [10, 50, 150] },
  { id: "roleplay", icon: "roleplay", titlesKo: ["첫 대화 완주", "대화 5개 완주", "대화 15개 완주"], unitKo: "모든 턴을 85점 이상으로 마친 롤플레이", goals: [1, 5, 15] },
  { id: "long", icon: "long", titlesKo: ["긴 문장 100점", "긴 문장 10개", "긴 문장 30개"], unitKo: "14단어 이상 문장으로 받은 100점", goals: [1, 10, 30] },
  { id: "speed", icon: "speed", titlesKo: ["번개 대답 10번", "번개 대답 50번", "번개 대답 150번"], unitKo: "짧은 대답을 4초 안에 정확하게", goals: [10, 50, 150] },
  { id: "scenes", icon: "scenes", titlesKo: ["상황 5곳", "상황 10곳", "모든 상황"], unitKo: "85점 이상으로 대화해 본 상황", goals: [5, 10, SITUATIONS.length] },
  { id: "hard", icon: "hard", titlesKo: ["고난도 첫 성공", "고난도 10문장", "고난도 30문장"], unitKo: "난이도 8 이상에서 85점 이상", goals: [1, 10, 30] },
  { id: "review", icon: "review", titlesKo: ["복습 20번", "복습 100번", "복습 300번"], unitKo: "정확하게 마친 복습", goals: [20, 100, 300] },
  { id: "goal", icon: "goal", titlesKo: ["목표 첫 달성", "목표 7일", "목표 30일"], unitKo: "하루 목표를 채운 날", goals: [1, 7, 30] },
  { id: "approved", icon: "approved", titlesKo: ["내 표현 인정", "내 표현 10개", "내 표현 30개"], unitKo: "Claude가 정확하다고 확인한 나만의 표현", goals: [1, 10, 30] },
  { id: "talk", icon: "talk", titlesKo: ["답변 50개", "답변 300개", "답변 1000개"], unitKo: "지금까지 말해 본 답", goals: [50, 300, 1000] },
];

export interface BadgeStatus {
  family: BadgeFamily;
  value: number;
  /** Tiers reached (0 = none yet). */
  tier: number;
  /** Title of the highest tier reached, or of the first tier when none is. */
  titleKo: string;
  /** Goal of the next tier (null when every tier is reached). */
  next: number | null;
}

const DAY_MS = 86_400_000;

/** Longest run of consecutive practice days in the log. */
export function longestStreak(daily: LearnerState["daily"]): number {
  const days = Object.keys(daily).filter((k) => daily[k]?.answered).map((k) => Date.parse(`${k}T12:00:00Z`)).filter(Number.isFinite).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && Math.round((days[i] - days[i - 1]) / DAY_MS) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** The value each family counts, from the learner state. */
export function badgeValues(state: LearnerState, questions: Question[], qIndex: Record<string, Question>): Record<string, number> {
  const answered = state.attempts.filter((a) => !a.skipped);
  const len = (s: string) => words(tokenize(s)).length;
  const clean = (a: (typeof answered)[number]) => a.overall >= 85 && a.hint <= 1;
  const scenes = new Set<Situation>();
  for (const a of answered) {
    const q = qIndex[a.questionId];
    if (q && clean(a)) scenes.add(situationOf(q));
  }
  const byScenario = new Map<string, Question[]>();
  for (const q of questions) if (q.scenario) byScenario.set(q.scenario.id, [...(byScenario.get(q.scenario.id) ?? []), q]);
  const roleplays = [...byScenario.values()].filter((steps) => steps.every((q) => (state.seen[q.id]?.best ?? 0) >= 85)).length;
  const target = state.settings.dailyTarget || 0;
  return {
    perfect: answered.filter((a) => a.overall === 100 && a.hint === 0).length,
    streak: longestStreak(state.daily),
    collection: Object.values(state.seen).filter((x) => x.best >= 85).length,
    roleplay: roleplays,
    long: answered.filter((a) => a.overall === 100 && a.hint === 0 && len(a.answer) >= 14).length,
    speed: answered.filter((a) => clean(a) && a.responseMs > 0 && a.responseMs <= 4000 && len(a.answer) <= 6).length,
    scenes: scenes.size,
    hard: new Set(answered.filter((a) => clean(a) && (qIndex[a.questionId]?.difficulty ?? 0) >= 8).map((a) => a.questionId)).size,
    review: answered.filter((a) => a.context === "review" && clean(a)).length,
    goal: target > 0 ? Object.values(state.daily).filter((d) => d.answered >= target).length : 0,
    approved: Object.values(state.seen).reduce((n, x) => n + (x.ok?.length ?? 0), 0),
    talk: answered.length,
  };
}

export function badgeStatuses(state: LearnerState, questions: Question[], qIndex: Record<string, Question>): BadgeStatus[] {
  const values = badgeValues(state, questions, qIndex);
  return BADGE_FAMILIES.map((family) => {
    const value = values[family.id] ?? 0;
    const tier = family.goals.filter((g) => value >= g).length;
    return { family, value, tier, titleKo: family.titlesKo[Math.max(0, tier - 1)], next: tier < family.goals.length ? family.goals[tier] : null };
  });
}

/** Badge tiers reached, as ids like "perfect:1" (for "new badge" notices). */
export function earnedBadgeIds(statuses: BadgeStatus[]): Set<string> {
  const ids = new Set<string>();
  for (const s of statuses) for (let t = 1; t <= s.tier; t++) ids.add(`${s.family.id}:${t}`);
  return ids;
}

/** Tiers reached now that were not reached before, highest per family. */
export function newBadges(before: Set<string>, now: BadgeStatus[]): { status: BadgeStatus; tier: number; titleKo: string }[] {
  const out: { status: BadgeStatus; tier: number; titleKo: string }[] = [];
  for (const s of now) {
    const fresh = Array.from({ length: s.tier }, (_, i) => i + 1).filter((t) => !before.has(`${s.family.id}:${t}`));
    if (fresh.length) {
      const t = Math.max(...fresh);
      out.push({ status: s, tier: t, titleKo: s.family.titlesKo[t - 1] });
    }
  }
  return out;
}

/** Days practised this calendar week (for small summaries). */
export function daysThisWeek(daily: LearnerState["daily"], now: number): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (daily[localDayKey(now - i * DAY_MS)]?.answered) n++;
  return n;
}
