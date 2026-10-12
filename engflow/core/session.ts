import { DAY_MS } from "./fsrs";
import { isDue, isOverdue } from "./scheduler";
import { weakGrammar, weaknessMatch } from "./weakness";
import { autoDifficulty, situationOf } from "./situations";
import type { Category, Cefr, LearnerState, Question, QuestionMode, ReviewItem, Situation, SkillState } from "./types";

export interface SessionItem {
  kind: "new" | "review";
  questionId: string;
  reviewItemId?: string;
  /** Why this question was chosen (shown in the UI). */
  reasonKo: string;
}

export interface SessionOptions {
  size: number;
  mode: QuestionMode | "mixed";
  category?: Category | "all";
  skill?: string | "all";
  level?: Cefr | "auto";
  /** Conversation scene filter. */
  situation?: Situation | "all";
  /** Difficulty 1–10 for this session; otherwise the learner's saved choice per scene, else automatic. */
  difficulty?: number;
  reviewOnly?: boolean;
  now: number;
  rng?: () => number;
}

export interface SessionPlan {
  items: SessionItem[];
  dueCount: number;
  overdueCount: number;
  reviewShare: number;
  noteKo: string;
}

/** Deterministic PRNG for reproducible sessions in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Review share rises from 30% toward 70% as the overdue backlog grows. */
export function reviewShareFor(overdue: number): number {
  return Math.min(0.7, Math.max(0.3, 0.3 + Math.max(0, overdue - 10) / 40));
}

export function currentLevel(state: LearnerState): Cefr {
  return state.profile.startLevel;
}


/** Variation level for the next review of an item: one step per successful review. */
export function targetVariationLevel(item: ReviewItem): 0 | 1 | 2 | 3 {
  const last = item.history[item.history.length - 1];
  if (last && last.grade === 1) return 0;
  return Math.min(3, item.successes) as 0 | 1 | 2 | 3;
}

/**
 * Pick a question that tests the item's grammar in a NEW sentence: never the
 * original question, avoiding the last questions served, and climbing the
 * variation ladder (short phrase → new context → longer sentence → meeting response).
 */
export function pickReviewQuestion(item: ReviewItem, bank: Question[], mode: QuestionMode | "mixed", rng: () => number = Math.random): Question | null {
  const level = targetVariationLevel(item);
  const recent = new Set([...(item.recentQuestionIds ?? []).slice(-2), item.originalQuestionId ?? ""]);
  let candidates: { q: Question; score: number }[] = [];
  if (item.seed) {
    candidates = bank
      .filter((q) => q.variation?.seed === item.seed)
      .map((q) => ({ q, score: 10 - 3 * Math.abs((q.variation?.level ?? 0) - level) }));
  }
  if (!candidates.length) {
    const wantMode: QuestionMode = level <= 1 ? "phrase" : "sentence";
    candidates = bank
      .filter((q) => q.skills.includes(item.skill))
      .map((q) => ({
        q,
        score: (q.skills[0] === item.skill ? 4 : 1) + (q.mode === wantMode ? 2 : 0) + (q.variation ? -1 : 0),
      }));
  }
  if (mode !== "mixed" && candidates.some((c) => c.q.mode === mode)) {
    candidates = candidates.map((c) => ({ ...c, score: c.score + (c.q.mode === mode ? 1.5 : 0) }));
  }
  const fresh = candidates.filter((c) => !recent.has(c.q.id));
  const pool = fresh.length ? fresh : candidates.filter((c) => c.q.id !== item.originalQuestionId);
  if (!pool.length) return candidates[0]?.q ?? null;
  const best = Math.max(...pool.map((c) => c.score));
  const top = pool.filter((c) => c.score >= best - 0.5);
  return top[Math.floor(rng() * top.length)].q;
}

export interface WeakSkill {
  skill: string;
  mastery: number;
  status: SkillState["status"];
  lastAt: number | null;
  neglected: boolean;
}

/** Weak skills are always visible; a weak skill untouched for 7+ days is "neglected" and gets forced into sessions. */
export function weakSkills(state: LearnerState, now: number): WeakSkill[] {
  return Object.values(state.skills)
    .filter((s) => s.status === "learning" || (s.status === "improving" && s.mastery < 0.7))
    .map((s) => ({ skill: s.skill, mastery: s.mastery, status: s.status, lastAt: s.lastAt, neglected: !s.lastAt || now - s.lastAt > 7 * DAY_MS }))
    .sort((a, b) => a.mastery - b.mastery);
}

export function dueItems(state: LearnerState, now: number): ReviewItem[] {
  return Object.values(state.items)
    .filter((i) => isDue(i, now))
    .sort((a, b) => a.due - b.due);
}

export function buildSession(state: LearnerState, bank: Question[], opts: SessionOptions): SessionPlan {
  const rng = opts.rng ?? Math.random;
  const now = opts.now;
  const due = dueItems(state, now);
  const overdue = due.filter((i) => isOverdue(i, now)).length;
  const share = opts.reviewOnly ? 1 : reviewShareFor(overdue);
  const lessonBank = bank.filter((q) => !q.variation);
  const items: SessionItem[] = [];
  const used = new Set<string>();

  // A scene session reviews inside that scene when it has a question for the grammar.
  const scene = opts.situation && opts.situation !== "all" ? opts.situation : null;
  const reviewPick = (item: ReviewItem) => (scene && pickReviewQuestion(item, bank.filter((q) => situationOf(q) === scene), opts.mode, rng)) || pickReviewQuestion(item, bank, opts.mode, rng);

  // Reviews: most overdue first, each with a fresh variation.
  const nReview = Math.min(due.length, opts.reviewOnly ? opts.size : Math.round(opts.size * share));
  const reviews: SessionItem[] = [];
  for (const item of due) {
    if (reviews.length >= nReview) break;
    const q = reviewPick(item);
    if (!q || used.has(q.id)) continue;
    used.add(q.id);
    const daysLate = Math.floor((now - item.due) / DAY_MS);
    reviews.push({
      kind: "review", questionId: q.id, reviewItemId: item.id,
      reasonKo: `복습 · ${item.label}${daysLate >= 1 ? ` (${daysLate}일 지남)` : ""}`,
    });
  }

  // New learning: filter, then rank by weak/neglected skills, difficulty fit and scene variety.
  const target = opts.level && opts.level !== "auto" ? opts.level : currentLevel(state);
  const saved = state.settings.difficulty ?? {};
  // Difficulty target per question: this session's choice, else the saved choice for its scene, else automatic.
  const targetFor = (q: Question) => opts.difficulty ?? saved[situationOf(q)] ?? saved.all ?? autoDifficulty(target);
  const weak = weakSkills(state, now);
  const weakSet = new Set(weak.map((w) => w.skill));
  const neglected = weak.filter((w) => w.neglected).map((w) => w.skill);
  // Grammar the learner keeps getting wrong: similar questions (same skill, same kind of trap) come first.
  const grammarWeak = weakGrammar(state, now).slice(0, 6);
  const recentCutoff = now - 3 * DAY_MS;
  const pool = lessonBank.filter((q) => {
    if (used.has(q.id)) return false;
    if (opts.mode !== "mixed" && q.mode !== opts.mode) return false;
    if (opts.category && opts.category !== "all" && q.category !== opts.category) return false;
    if (opts.skill && opts.skill !== "all" && !q.skills.includes(opts.skill)) return false;
    if (scene && situationOf(q) !== scene) return false;
    const seen = state.seen[q.id];
    if (seen && seen.lastAt > recentCutoff) return false;
    return true;
  });
  // An explicit difficulty keeps questions within ±1 (±2 when that leaves too few).
  const nNewWanted = opts.reviewOnly ? 0 : opts.size - reviews.length;
  let band = pool;
  if (opts.difficulty) {
    const within = (r: number) => pool.filter((q) => Math.abs(q.difficulty - opts.difficulty!) <= r);
    band = within(1).length >= Math.min(nNewWanted, 3) ? within(1) : within(2);
  }
  const scored = band.map((q) => {
    const seen = state.seen[q.id];
    const gap = q.difficulty - targetFor(q);
    // Slightly harder than the target is better practice than slightly easier.
    const levelFit = opts.skill && opts.skill !== "all" && !opts.difficulty ? 1 : 3 - 1.2 * Math.abs(gap) + (gap === 1 ? 0.4 : 0);
    const skill = q.skills[0];
    const st = state.skills[skill];
    let score = levelFit + (seen ? -2 - Math.min(3, seen.count) : 2) + rng() * 1.5;
    if (weakSet.has(skill)) score += 2.5;
    if (neglected.includes(skill)) score += 2;
    if (!st || st.status === "new") score += 0.5;
    if (st?.status === "mastered") score -= 2;
    const wm = weaknessMatch(q, grammarWeak);
    score += 1.5 * wm.score;
    // Conversation turns ("how do I say this?") are the main format.
    if (q.dialogue?.length) score += 1;
    return { q, score, weakLabel: wm.score >= 1 ? wm.point?.labelKo : undefined };
  });
  scored.sort((a, b) => b.score - a.score);
  const nNew = nNewWanted;
  const fresh: SessionItem[] = [];
  const skillCount = new Map<string, number>();
  const sceneCount = new Map<Situation, number>();
  // A mixed session spreads over scenes: everyday conversation, not only engineering talk.
  const sceneCap = scene ? Infinity : Math.max(2, Math.ceil(nNew * 0.3));
  const pick = (strict: boolean) => {
    for (const { q, weakLabel } of scored) {
      if (fresh.length >= nNew) break;
      if (used.has(q.id)) continue;
      const k = q.skills[0];
      const sc = situationOf(q);
      // Variety: at most two per primary skill (three for a frequent-mistake skill).
      if ((skillCount.get(k) ?? 0) >= (weakLabel ? 3 : 2)) continue;
      if (strict && (sceneCount.get(sc) ?? 0) >= sceneCap) continue;
      skillCount.set(k, (skillCount.get(k) ?? 0) + 1);
      sceneCount.set(sc, (sceneCount.get(sc) ?? 0) + 1);
      used.add(q.id);
      fresh.push({
        kind: "new", questionId: q.id,
        reasonKo: weakLabel
          ? `자주 틀리는 문법 · ${weakLabel}`
          : neglected.includes(k) ? "오래 연습하지 않은 약점 문법" : weakSet.has(k) ? "약점 문법 집중" : state.seen[q.id] ? "다시 보는 문항" : "새 문항",
      });
    }
  };
  pick(true);
  if (fresh.length < nNew) pick(false); // a small bank: relax the scene spread rather than run short
  // Not enough new questions: fill with more reviews; not enough reviews: fill with more new.
  if (fresh.length < nNew) {
    for (const item of due) {
      if (reviews.length + fresh.length >= opts.size) break;
      if (reviews.some((r) => r.reviewItemId === item.id)) continue;
      const q = reviewPick(item);
      if (!q || used.has(q.id)) continue;
      used.add(q.id);
      reviews.push({ kind: "review", questionId: q.id, reviewItemId: item.id, reasonKo: `복습 · ${item.label}` });
    }
  }

  // Interleave reviews evenly among new items.
  const total = reviews.length + fresh.length;
  if (reviews.length && fresh.length) {
    const step = total / reviews.length;
    let r = 0;
    let f = 0;
    for (let i = 0; i < total; i++) {
      const wantReview = r < reviews.length && Math.floor((r + 0.5) * step) <= i;
      if (wantReview) items.push(reviews[r++]);
      else if (f < fresh.length) items.push(fresh[f++]);
      else items.push(reviews[r++]);
    }
  } else {
    items.push(...reviews, ...fresh);
  }

  const noteKo = opts.reviewOnly
    ? `복습 ${reviews.length}문항`
    : `새 학습 ${fresh.length} · 복습 ${reviews.length}${overdue > 10 ? ` (밀린 복습 ${overdue}개 → 복습 비율 ${Math.round(share * 100)}%)` : ""}`;
  return { items, dueCount: due.length, overdueCount: overdue, reviewShare: share, noteKo };
}
