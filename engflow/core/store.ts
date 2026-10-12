import { DAY_MS, newFsrsState } from "./fsrs";
import { applyEvidence, importedSkillState, localDayKey, newSkillState } from "./mastery";
import { deriveGrade, expectedResponseMs, scheduleReview, IMMEDIATE_RETRY_MS } from "./scheduler";
import { tokenize, words } from "./text";
import type {
  AttemptRecord, DiagnosticResultRecord, Evaluation, Grade, HintLevel, LearnerState, MistakeRecord, Question,
  ReviewItem, Settings,
} from "./types";
import { SEEDS } from "../content/seeds";
import { skillName } from "../content/skills";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  dailyTarget: 12,
  scheduler: "adaptive",
  ai: "auto",
  aiDepth: "default",
  autocorrect: false,
  showNaturalKorean: false,
  reducedMotion: "system",
};

export const MAX_ATTEMPTS = 3000;

function seedItem(seedId: string, now: number, index: number): ReviewItem {
  const s = SEEDS.find((x) => x.id === seedId)!;
  return {
    id: `item-${s.id}`,
    skill: s.skill,
    seed: s.id,
    label: s.label,
    origin: "imported",
    originalAnswer: s.incorrect,
    correctedAnswer: s.correct,
    errorCategory: s.category,
    severity: "major",
    createdAt: now,
    // Stagger imported items so the first day is not one big block.
    due: now + Math.floor(index / 3) * DAY_MS,
    ladderStep: 0,
    fsrs: newFsrsState(),
    successes: 0,
    failures: 0,
    history: [],
    scheduleNote: "가져온 과거 오류 — 첫 복습에서 실제 실력을 확인합니다.",
    recentQuestionIds: [],
  };
}

export function createInitialState(now: number): LearnerState {
  const items: Record<string, ReviewItem> = {};
  const mistakes: Record<string, MistakeRecord> = {};
  const skills: LearnerState["skills"] = {};
  SEEDS.forEach((s, i) => {
    const item = seedItem(s.id, now, i);
    items[item.id] = item;
    mistakes[`mistake-${s.id}`] = {
      id: `mistake-${s.id}`,
      skill: s.skill,
      category: s.category,
      incorrect: s.incorrect,
      correct: s.correct,
      whyKo: s.whyKo,
      origin: "imported",
      count: 1,
      firstAt: now,
      lastAt: now,
      reviewItemId: item.id,
      questionIds: [],
    };
    skills[s.skill] = skills[s.skill] ?? importedSkillState(s.skill);
  });
  return {
    schema: 1,
    profile: { createdAt: now, onboarded: false, displayName: "", startLevel: "B1", levelSource: "assumed", focusSkills: [] },
    settings: { ...DEFAULT_SETTINGS },
    items,
    skills,
    mistakes,
    attempts: [],
    diagnostics: [],
    daily: {},
    seen: {},
    generated: [],
    updatedAt: now,
  };
}

export interface RecordInput {
  question: Question;
  evaluation: Evaluation;
  hint: HintLevel;
  responseMs: number;
  firstKeyMs: number | null;
  context: AttemptRecord["context"];
  reviewItemId?: string;
  skipped?: boolean;
  now: number;
}

export interface RecordResult {
  state: LearnerState;
  attempt: AttemptRecord;
  grade: Grade;
  gradeReasons: string[];
  /** Review items created or rescheduled, with their notes. */
  scheduled: { itemId: string; label: string; due: number; note: string; created: boolean }[];
  /** Mastery status changes for the UI's progress transition. */
  masteryChanges: { skill: string; from: string; to: string; mastery: number }[];
}

function lastSuccessAt(state: LearnerState, skill: string, questions: Record<string, Question>): number | null {
  for (let i = state.attempts.length - 1; i >= 0; i--) {
    const a = state.attempts[i];
    if (a.hint === 0 && !a.skipped && a.overall >= 85 && questions[a.questionId]?.skills[0] === skill) return a.at;
  }
  return null;
}

function errorKey(skill: string, category: string): string {
  return `item-${skill}-${category}`;
}

/** Apply one answered question to the learner state (pure: returns a new state). */
export function recordAttempt(prev: LearnerState, input: RecordInput, questionIndex: Record<string, Question>): RecordResult {
  const { question: q, evaluation: ev, now } = input;
  const state: LearnerState = {
    ...prev,
    items: { ...prev.items },
    skills: { ...prev.skills },
    mistakes: { ...prev.mistakes },
    daily: { ...prev.daily },
    seen: { ...prev.seen },
  };
  const targetWords = words(tokenize(q.reference)).length;
  const { grade, reasons } = deriveGrade({
    evaluation: ev,
    hint: input.hint,
    responseMs: input.responseMs,
    expectedMs: expectedResponseMs(q.mode, targetWords),
    skipped: input.skipped,
  });

  const attempt: AttemptRecord = {
    id: `a-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    at: now,
    questionId: q.id,
    mode: q.mode,
    context: input.context,
    answer: ev.answer,
    overall: ev.scores.overall,
    scores: {
      meaning: ev.scores.meaning.score,
      grammar: ev.scores.grammar.score,
      terminology: ev.scores.terminology.score,
      organization: ev.scores.organization.score,
      comprehensibility: ev.scores.comprehensibility.score,
    },
    errorCategories: [...new Set(ev.errors.map((e) => e.category))],
    hint: input.hint,
    responseMs: input.responseMs,
    firstKeyMs: input.firstKeyMs,
    grade,
    evaluator: ev.evaluator,
    skipped: input.skipped || undefined,
    reviewItemId: input.reviewItemId,
  };
  state.attempts = [...prev.attempts, attempt].slice(-MAX_ATTEMPTS);

  // ── Skill mastery ──
  const masteryChanges: RecordResult["masteryChanges"] = [];
  const success = grade >= 3;
  const primary = q.skills[0];
  const update = (skill: string, weight: number, ok: boolean) => {
    const before = state.skills[skill] ?? newSkillState(skill);
    const after = applyEvidence(
      before,
      { at: now, questionId: q.id, overall: ok ? ev.scores.overall : Math.min(ev.scores.overall, 50), hint: input.hint, skipped: input.skipped, weight, success: ok },
      lastSuccessAt(prev, skill, questionIndex),
    );
    state.skills[skill] = after;
    if (before.status !== after.status) masteryChanges.push({ skill, from: before.status, to: after.status, mastery: after.mastery });
  };
  update(primary, 1, success);
  const errorSkills = new Set(ev.errors.filter((e) => e.severity !== "minor" && e.skill && e.skill !== primary).map((e) => e.skill!));
  for (const s of errorSkills) update(s, 0.5, false);

  // ── Review scheduling ──
  const scheduled: RecordResult["scheduled"] = [];
  const mode = state.settings.scheduler;
  const pushHistory = (item: ReviewItem): ReviewItem => ({
    ...item,
    history: [...item.history, { at: now, grade, score: ev.scores.overall, hint: input.hint, questionId: q.id }].slice(-40),
    recentQuestionIds: [...item.recentQuestionIds, q.id].slice(-4),
  });
  if (input.reviewItemId && state.items[input.reviewItemId]) {
    const item = scheduleReview(pushHistory(state.items[input.reviewItemId]), grade, now, mode);
    state.items[item.id] = item;
    scheduled.push({ itemId: item.id, label: item.label, due: item.due, note: item.scheduleNote, created: false });
  }
  if (ev.review.add && !input.reviewItemId) {
    const significant = ev.errors.filter((e) => e.severity !== "minor");
    const targets = significant.length
      ? [...new Map(significant.map((e) => [errorKey(e.skill ?? primary, e.category), e])).values()].slice(0, 3)
      : [null];
    for (const e of targets) {
      const skill = e?.skill ?? primary;
      const key = e ? errorKey(skill, e.category) : `item-${skill}-lesson`;
      const existing = state.items[key];
      if (existing) {
        const item = scheduleReview(pushHistory(existing), Math.min(grade, 2) as Grade, now, mode);
        state.items[key] = { ...item, originalAnswer: ev.answer, correctedAnswer: ev.corrected, originalQuestionId: q.id };
        scheduled.push({ itemId: key, label: item.label, due: item.due, note: item.scheduleNote, created: false });
      } else {
        const item: ReviewItem = {
          id: key,
          skill,
          label: e ? `${skillName(skill)}${e.fix ? ` · ${e.fix}` : ""}` : skillName(skill),
          origin: e ? "error" : "lesson",
          originalQuestionId: q.id,
          originalPromptKo: q.promptKo,
          originalAnswer: ev.answer,
          correctedAnswer: ev.corrected,
          errorCategory: e?.category,
          severity: e?.severity,
          createdAt: now,
          due: now + IMMEDIATE_RETRY_MS,
          ladderStep: 0,
          fsrs: newFsrsState(),
          successes: 0,
          failures: 0,
          history: [],
          scheduleNote: "새로 생긴 오류 — 이번 세션에서 바로 다시 연습한 뒤 1일 → 3일 → 7일 간격으로 복습합니다.",
          recentQuestionIds: [q.id],
        };
        state.items[key] = item;
        scheduled.push({ itemId: key, label: item.label, due: item.due, note: item.scheduleNote, created: true });
      }
    }
  }

  // ── Mistake notebook (major/critical errors) ──
  for (const e of ev.errors.filter((x) => x.severity !== "minor")) {
    const skill = e.skill ?? primary;
    const id = `mistake-${skill}-${e.category}-${(e.text || e.fix).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    const reviewItemId = state.items[errorKey(skill, e.category)] ? errorKey(skill, e.category) : input.reviewItemId ?? "";
    const old = state.mistakes[id];
    state.mistakes[id] = old
      ? { ...old, count: old.count + 1, lastAt: now, incorrect: ev.answer, correct: ev.corrected, questionIds: [...new Set([...old.questionIds, q.id])].slice(-10) }
      : {
          id, skill, category: e.category, incorrect: ev.answer, correct: ev.corrected, whyKo: e.messageKo, origin: "error",
          count: 1, firstAt: now, lastAt: now, reviewItemId, questionIds: [q.id],
        };
  }

  // ── Daily log & seen ──
  const day = localDayKey(now);
  const d = state.daily[day] ?? { answered: 0, correct: 0, reviews: 0, newItems: 0, ms: 0 };
  state.daily[day] = {
    answered: d.answered + 1,
    correct: d.correct + (success ? 1 : 0),
    reviews: d.reviews + (input.context === "review" ? 1 : 0),
    newItems: d.newItems + (input.context === "lesson" ? 1 : 0),
    ms: d.ms + Math.min(input.responseMs, 10 * 60_000),
  };
  const seen = state.seen[q.id];
  state.seen[q.id] = { count: (seen?.count ?? 0) + 1, lastAt: now, best: Math.max(seen?.best ?? 0, ev.scores.overall) };
  state.updatedAt = now;
  return { state, attempt, grade, gradeReasons: reasons, scheduled, masteryChanges };
}

export function applyDiagnostic(prev: LearnerState, result: DiagnosticResultRecord): LearnerState {
  return {
    ...prev,
    diagnostics: [...prev.diagnostics, result].slice(-20),
    profile: { ...prev.profile, startLevel: result.recommendedLevel, levelSource: "diagnostic", focusSkills: result.weaknesses, onboarded: true },
    updatedAt: result.at,
  };
}

export function streakDays(state: LearnerState, now: number): number {
  let streak = 0;
  let t = now;
  if (!state.daily[localDayKey(t)]?.answered) t -= DAY_MS; // today not started yet: count from yesterday
  while (state.daily[localDayKey(t)]?.answered) {
    streak++;
    t -= DAY_MS;
  }
  return streak;
}

export function weekSeries(state: LearnerState, now: number): { day: string; answered: number; correct: number }[] {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const key = localDayKey(now - i * DAY_MS);
    const d = state.daily[key];
    out.push({ day: key, answered: d?.answered ?? 0, correct: d?.correct ?? 0 });
  }
  return out;
}

/** Estimated level for display: latest diagnostic, else the assumed start level. */
export function levelEstimate(state: LearnerState): { label: string; source: "diagnostic" | "assumed"; confidence?: string } {
  const last = state.diagnostics[state.diagnostics.length - 1];
  if (!last) return { label: `${state.profile.startLevel} (가정)`, source: "assumed" };
  const range = last.cefrLow === last.cefrHigh ? last.cefrPoint : `${last.cefrLow}–${last.cefrHigh}`;
  return { label: range, source: "diagnostic", confidence: last.confidence };
}

/** Merge-safe JSON export. */
export function exportState(state: LearnerState): string {
  return JSON.stringify({ app: "engflow", exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importState(json: string): LearnerState {
  const parsed = JSON.parse(json) as { app?: string; state?: LearnerState };
  const s = parsed.state ?? (parsed as unknown as LearnerState);
  if (!s || s.schema !== 1 || typeof s.items !== "object" || !Array.isArray(s.attempts)) throw new Error("EngFlow 학습 기록 파일이 아닙니다.");
  return { ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings } };
}

/** Bring a stored state up to the current shape (new defaults, new seeds). */
export function migrateState(s: LearnerState, now: number): LearnerState {
  const fresh = createInitialState(now);
  return {
    ...fresh,
    ...s,
    settings: { ...DEFAULT_SETTINGS, ...s.settings },
    profile: { ...fresh.profile, ...s.profile },
    generated: s.generated ?? [],
    seen: s.seen ?? {},
    daily: s.daily ?? {},
  };
}
