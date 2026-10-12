import { DAY_MS } from "./fsrs";
import { skillName } from "../content/skills";
import type { ErrorCategory, ErrorSpan, Evaluation, GrammarWeakPoint, LearnerState, Question } from "./types";

/**
 * Frequent grammar mistakes. Every scored grammar error (articles and
 * prepositions included, spelling and site wording excluded) strengthens a
 * (skill × error type) weak point; time and independent successes weaken it.
 * Sessions serve similar questions while a point stays strong.
 */

const HALF_LIFE_DAYS = 14;
const WEIGHT = { minor: 0.6, major: 1, critical: 1.5 } as const;
/** Strength from which a point counts as a current weakness. */
export const WEAK_THRESHOLD = 0.8;
const MAX_POINTS = 60;

const CATEGORY_KO: Partial<Record<ErrorCategory, string>> = {
  "be-verb": "be동사", "verb-form": "동사 형태", tense: "시제", agreement: "주어-동사 일치", preposition: "전치사",
  article: "관사", "word-order": "어순", "word-choice": "자주 쓰는 표현", "sentence-structure": "문장 구조", countability: "단수·복수",
};

export function weakKey(skill: string, category: ErrorCategory): string {
  return `${skill}:${category}`;
}

/** Grammar errors that teach something about the learner's grammar (not spelling, meaning or site wording). */
export function grammarErrors(errors: ErrorSpan[]): ErrorSpan[] {
  return errors.filter((e) => !e.advisory && e.category !== "spelling" && e.bucket !== "meaning" && e.category !== "terminology");
}

export function decayed(p: Pick<GrammarWeakPoint, "strength" | "lastAt">, now: number): number {
  return p.strength * Math.pow(0.5, Math.max(0, now - p.lastAt) / (HALF_LIFE_DAYS * DAY_MS));
}

export function weakPointLabel(p: Pick<GrammarWeakPoint, "skill" | "category">): string {
  const cat = CATEGORY_KO[p.category];
  return cat ? `${skillName(p.skill)} · ${cat}` : skillName(p.skill);
}

/** Update the weak points with one graded answer (returns a new map). */
export function updateWeakness(
  prev: Record<string, GrammarWeakPoint> | undefined,
  input: { question: Question; evaluation: Evaluation; hint: number; skipped?: boolean; now: number },
): Record<string, GrammarWeakPoint> {
  const { question: q, evaluation: ev, now } = input;
  const weak: Record<string, GrammarWeakPoint> = { ...(prev ?? {}) };
  if (input.skipped) return weak;
  const errs = grammarErrors(ev.errors);
  const hit = new Set<string>();
  for (const e of errs) {
    const skill = e.skill ?? q.skills[0];
    const id = weakKey(skill, e.category);
    if (hit.has(id)) continue; // one count per error type per answer
    hit.add(id);
    const old = weak[id];
    const base = old ? decayed(old, now) : 0;
    const example = { wrong: ev.answer, right: ev.corrected, fix: `${e.text || "(빠짐)"} → ${e.fix || "(삭제)"}`, at: now, questionId: q.id };
    weak[id] = {
      id, skill, category: e.category,
      count: (old?.count ?? 0) + 1,
      strength: Math.min(6, base + WEIGHT[e.severity]),
      firstAt: old?.firstAt ?? now,
      lastAt: now,
      examples: [...(old?.examples ?? []), example].slice(-5),
    };
  }
  // An independent, clean answer on the same grammar weakens the matching points.
  if (input.hint === 0 && ev.scores.overall >= 85) {
    for (const p of Object.values(weak)) {
      if (hit.has(p.id) || !q.skills.includes(p.skill)) continue;
      weak[p.id] = { ...p, strength: Math.max(0, decayed(p, now) - 0.5), lastAt: now };
    }
  }
  // Keep the map small: drop the weakest faded points.
  const list = Object.values(weak);
  if (list.length > MAX_POINTS) {
    for (const p of list.sort((a, b) => decayed(a, now) - decayed(b, now)).slice(0, list.length - MAX_POINTS)) delete weak[p.id];
  }
  return weak;
}

export interface WeakGrammar extends GrammarWeakPoint {
  current: number;
  labelKo: string;
}

/** Current grammar weaknesses, strongest first. */
export function weakGrammar(state: Pick<LearnerState, "weak">, now: number, min = WEAK_THRESHOLD): WeakGrammar[] {
  return Object.values(state.weak ?? {})
    .map((p) => ({ ...p, current: decayed(p, now), labelKo: weakPointLabel(p) }))
    .filter((p) => p.current >= min)
    .sort((a, b) => b.current - a.current);
}

/** How strongly a question matches the learner's weak grammar (0 = not at all). */
export function weaknessMatch(q: Question, weak: WeakGrammar[]): { score: number; point: WeakGrammar | null } {
  let best = 0;
  let point: WeakGrammar | null = null;
  for (const p of weak) {
    const primary = q.skills[0] === p.skill;
    if (!primary && !q.skills.includes(p.skill)) continue;
    // The same kind of trap (a pitfall of that error type) makes it a truly similar question.
    const trap = (q.pitfalls ?? []).some((x) => x.category === p.category && (x.skill ?? q.skills[0]) === p.skill);
    const s = Math.min(3, p.current) * (primary ? 1 : 0.5) + (trap ? 1 : 0);
    if (s > best) {
      best = s;
      point = p;
    }
  }
  return { score: best, point };
}

/** Feedback line for a fresh answer whose main grammar error is a repeat. */
export function weaknessNote(state: Pick<LearnerState, "weak">, ev: Evaluation, q: Question): string | null {
  const main = grammarErrors(ev.errors).sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity])[0];
  if (!main) return null;
  const p = state.weak?.[weakKey(main.skill ?? q.skills[0], main.category)];
  if (!p) return null;
  const times = p.count + 1;
  return `'${weakPointLabel(p)}'에서 ${times}번째 실수입니다. 자주 틀리는 문법으로 기록해 다음 세션에 비슷한 문제를 더 냅니다.`;
}

/** Questions that test the same grammar context as a weak point, best match first. */
export function similarQuestions(point: WeakGrammar, bank: Question[], state: Pick<LearnerState, "seen">, now: number, n = 5): Question[] {
  const ranked = bank
    .filter((q) => q.skills.includes(point.skill))
    .map((q) => {
      const seen = state.seen[q.id];
      const recent = seen && now - seen.lastAt < 2 * DAY_MS;
      const sameQuestion = point.examples.some((x) => x.questionId === q.id);
      return { q, score: weaknessMatch(q, [point]).score - (recent ? 2 : 0) - (sameQuestion ? 3 : 0) - (seen ? Math.min(2, seen.count) * 0.3 : 0) };
    })
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, n).map((r) => r.q);
}
