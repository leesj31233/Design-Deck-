import type { Cefr, Question } from "../core/types";

/** Diagnostic (level test) item. */
export interface DiagnosticItem {
  id: string;
  /** 1 grammar & construction · 2 phrase translation · 3 full sentence · 4 meeting response · 5 scenario explanation */
  part: 1 | 2 | 3 | 4 | 5;
  kind: "choice" | "order" | "produce";
  level: Cefr;
  /** Difficulty on a logit scale: A2 ≈ -1, B1 ≈ 0, B2 ≈ 1, C1 ≈ 2 (fine offsets allowed). */
  b: number;
  skills: string[];
  /** choice: Korean instruction/context, English stem with "___" for a blank or a full-sentence choice. */
  stemKo?: string;
  stemEn?: string;
  options?: string[];
  answerIndex?: number;
  /** order: the chunks in the CORRECT order (the UI shuffles them). */
  chunks?: string[];
  /** Korean meaning for order items. */
  meaningKo?: string;
  /** choice/order: explanation shown in results. */
  explanationKo?: string;
  /** Part 4: what the colleague says in English. */
  promptEn?: string;
  /** produce: evaluated with the same evaluator as lessons. */
  question?: Question;
}

/** One block in a sentence-anatomy diagram. */
export interface AnatomyPart {
  text: string;
  /** Grammatical role in English, e.g. "subject", "be", "V-ing", "object", "adverb". */
  role: string;
  roleKo: string;
  /** Visual emphasis for the part this skill is about. */
  focus?: boolean;
}

export interface GuideEntry {
  skill: string;
  /** Core idea in 1–2 Korean sentences. */
  summaryKo: string;
  /** "Explain more simply" — a plainer Korean explanation with an analogy if useful. */
  simpleKo: string;
  /** Pattern rules, e.g. before + noun / before + V-ing / before + S + V. */
  rules: { formula: string; ko: string; example: string }[];
  /** Sentence anatomy diagrams. */
  anatomy: { sentence: string; parts: AnatomyPart[] }[];
  /** Technical-context examples (≥ 4). */
  examples: { en: string; ko: string }[];
  /** Similar expressions compared. */
  compare: { a: string; b: string; ko: string }[];
  /** Typical mistakes by Korean speakers: wrong → right with a reason. */
  mistakes: { wrong: string; right: string; ko: string }[];
}
