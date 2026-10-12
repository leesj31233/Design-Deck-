import { DAY_MS } from "./fsrs";
import { evaluateLocal } from "./evaluate";
import { normalizeForMatch } from "./text";
import { decayed } from "./weakness";
import { sceneDifficulty } from "./situations";
import { EXPRESSION_TITLES } from "../content/expressions";
import { GUIDE } from "../content/guide";
import { skillName } from "../content/skills";
import type { DialogueTurn, LearnerState, MasteryStatus, Question } from "./types";

/**
 * The expression notebook: the learner's own recurring mistakes, gathered per
 * grammar point and shown as the spoken expression ("has changed",
 * "too early to decide"), with a short study flow for each.
 */

export interface ExpressionEntry {
  skill: string;
  titleEn: string;
  coreKo: string;
  nameKo: string;
  /** Times this was gotten wrong (new answers and imported history). */
  count: number;
  /** Current weakness (decaying); 0 = nothing recent. */
  strength: number;
  lastAt: number | null;
  /** The learner's own wrong → right sentences, newest first. */
  examples: { wrong: string; right: string; fix?: string; at: number }[];
  /** Comes only from the imported mistake history. */
  imported: boolean;
  status: MasteryStatus;
}

function titleFor(skill: string): { en: string; ko: string } {
  return EXPRESSION_TITLES[skill] ?? { en: skillName(skill), ko: skillName(skill) };
}

/** Recurring mistakes per grammar point, most urgent first. */
export function collectExpressions(state: Pick<LearnerState, "weak" | "mistakes" | "skills">, now: number): ExpressionEntry[] {
  const by = new Map<string, ExpressionEntry>();
  const entry = (skill: string): ExpressionEntry => {
    let e = by.get(skill);
    if (!e) {
      const t = titleFor(skill);
      e = {
        skill, titleEn: t.en, coreKo: t.ko, nameKo: skillName(skill), count: 0, strength: 0, lastAt: null, examples: [], imported: true,
        status: state.skills[skill]?.status ?? "learning",
      };
      by.set(skill, e);
    }
    return e;
  };
  const addExample = (e: ExpressionEntry, x: ExpressionEntry["examples"][number]) => {
    const key = normalizeForMatch(x.wrong);
    if (!e.examples.some((y) => normalizeForMatch(y.wrong) === key)) e.examples.push(x);
  };

  for (const p of Object.values(state.weak ?? {})) {
    const e = entry(p.skill);
    e.count += p.count;
    e.strength += decayed(p, now);
    e.lastAt = Math.max(e.lastAt ?? 0, p.lastAt);
    e.imported = false;
    for (const x of p.examples) addExample(e, { wrong: x.wrong, right: x.right, fix: x.fix, at: x.at });
  }
  // The notebook's mistakes include the imported history; count them without double-counting new answers.
  const fromMistakes = new Map<string, number>();
  for (const m of Object.values(state.mistakes)) {
    const e = entry(m.skill);
    fromMistakes.set(m.skill, (fromMistakes.get(m.skill) ?? 0) + m.count);
    if (m.origin !== "imported") e.imported = false;
    e.lastAt = Math.max(e.lastAt ?? 0, m.lastAt);
    addExample(e, { wrong: m.incorrect, right: m.correct, at: m.lastAt });
    if (e.status !== "mastered") e.strength = Math.max(e.strength, m.origin === "imported" ? 1 : 1.2);
  }
  for (const [skill, n] of fromMistakes) {
    const e = by.get(skill)!;
    e.count = Math.max(e.count, n);
  }
  for (const e of by.values()) {
    e.examples.sort((a, b) => b.at - a.at);
    e.examples = e.examples.slice(0, 6);
    if (e.status === "mastered") e.strength = Math.min(e.strength, 0.3);
  }
  return [...by.values()].sort((a, b) => b.strength - a.strength || b.count - a.count || (b.lastAt ?? 0) - (a.lastAt ?? 0));
}

/* ───────────── Quick check quiz ───────────── */

export interface QuizItem {
  id: string;
  /** What the learner wants to say (Korean), when the item comes from a question. */
  promptKo?: string;
  /** The line the learner is answering. */
  dialogue?: DialogueTurn;
  options: string[];
  answer: number;
  explainKo: string;
  source: "mine" | "question" | "guide";
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * "Which is natural?" items for one grammar point: the learner's own mistakes
 * first, then typical mistakes from questions on that grammar (their QC
 * "fail" probes, which the grader is verified to reject), then the guide's list.
 */
export function buildExpressionQuiz(skill: string, mine: ExpressionEntry | null, bank: Question[], rng: () => number = Math.random, max = 6): QuizItem[] {
  const items: QuizItem[] = [];
  const seen = new Set<string>();
  const add = (right: string, wrong: string, rest: Omit<QuizItem, "options" | "answer" | "id">) => {
    const r = normalizeForMatch(right);
    const w = normalizeForMatch(wrong);
    if (!r || !w || r === w || seen.has(w)) return;
    seen.add(w);
    const options = shuffle([right, wrong], rng);
    items.push({ id: `${rest.source}-${items.length}`, options, answer: options.indexOf(right), ...rest });
  };
  const guide = GUIDE[skill];

  for (const x of (mine?.examples ?? []).slice(0, 2)) {
    add(x.right, x.wrong, { source: "mine", explainKo: `${x.fix ? `내 실수: ${x.fix}. ` : "내가 예전에 틀린 문장입니다. "}${guide?.summaryKo ?? ""}`.trim() });
  }
  const questions = shuffle(
    bank.filter((q) => q.skills.includes(skill) && !q.variation && q.probes?.some((p) => p.expect === "fail")),
    rng,
  ).sort((a, b) => Number(!!b.dialogue?.length) - Number(!!a.dialogue?.length) || Number(b.skills[0] === skill) - Number(a.skills[0] === skill));
  for (const q of questions) {
    if (items.length >= Math.min(max, 2 + (mine?.examples.length ? 3 : 4))) break;
    const fail = q.probes!.find((p) => p.expect === "fail")!;
    const ev = evaluateLocal(q, fail.answer);
    const why = ev.errors.find((e) => !e.advisory && e.category !== "spelling");
    add(q.reference, fail.answer, {
      source: "question",
      promptKo: q.promptKo,
      dialogue: q.dialogue?.[q.dialogue.length - 1],
      explainKo: why ? why.messageKo : q.explanationKo,
    });
  }
  for (const m of guide?.mistakes ?? []) {
    if (items.length >= max) break;
    add(m.right, m.wrong, { source: "guide", explainKo: m.ko });
  }
  return items.slice(0, max);
}

/** Speaking practice for one grammar point: conversation turns near the learner's difficulty, unseen first. */
export function practiceQuestionsFor(skill: string, bank: Question[], state: Pick<LearnerState, "seen" | "settings" | "profile">, now: number, n = 5): Question[] {
  const target = sceneDifficulty(state.settings.difficulty, "all", state.profile.startLevel);
  return bank
    .filter((q) => q.skills.includes(skill) && !q.variation)
    .map((q) => {
      const seen = state.seen[q.id];
      const recent = seen && now - seen.lastAt < 2 * DAY_MS;
      const score = (q.skills[0] === skill ? 2 : 0) + (q.dialogue?.length ? 1 : 0) - 0.4 * Math.abs(q.difficulty - target) - (recent ? 2 : 0) - (seen ? 0.5 : 0);
      return { q, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.q);
}
