/**
 * EngFlow domain types — shared by the question bank, the evaluator, the
 * scheduler, persistence and both UIs (Next.js web app and the claude.ai
 * artifact build). Everything here is plain data so it serializes cleanly.
 */

export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export const CEFR_ORDER: Cefr[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export type Category = "process" | "pilot" | "meeting" | "collab" | "operation" | "business";

/**
 * Where the conversation happens. Most questions are "how do I say this?"
 * turns in one of these scenes; engineering discussion is one scene among them.
 */
export type Situation =
  | "online" | "presentation" | "discussion" | "reaction" | "smalltalk" | "daily" | "office" | "feelings" | "meal" | "phone" | "negotiation" | "trouble" | "visit" | "technical";
export const SITUATIONS: Situation[] = ["online", "presentation", "discussion", "reaction", "smalltalk", "daily", "office", "feelings", "meal", "phone", "negotiation", "trouble", "visit", "technical"];

/** One earlier line in the conversation; the learner speaks next. */
export interface DialogueTurn {
  /** Who speaks, e.g. "Budi" or "Ms. Tan (client)". */
  speaker: string;
  /** What they say, in natural spoken English. */
  en: string;
  /** Korean translation (shown on request). */
  ko?: string;
}
export type QuestionMode = "sentence" | "phrase";

/** Error taxonomy used for highlighting, grouping in the notebook and review routing. */
export type ErrorCategory =
  | "be-verb"
  | "verb-form"
  | "tense"
  | "agreement"
  | "preposition"
  | "article"
  | "word-order"
  | "word-choice"
  | "missing-content"
  | "meaning-shift"
  | "terminology"
  | "spelling"
  | "sentence-structure"
  | "countability";

export type Severity = "minor" | "major" | "critical";

/** Every detected error is charged to exactly one rubric bucket (no double penalties). */
export type ScoreBucket = "meaning" | "grammar" | "terminology" | "organization";

/**
 * Pattern syntax (used by meaning units and pitfalls), matched against the
 * normalized token stream of an answer (lower-case, contractions expanded):
 *   word        token whose light stem equals stem(word)   ("deciding" matches "decide")
 *   =word       exact surface token                         ("=decided" matches only "decided")
 *   a|b|=c      any alternative
 *   tok?        optional token                              ("the? data")
 *   *           any single token
 *   ...         gap of 0–3 tokens (0–6 inside meaning units)
 *   re:<regex>  JS regex against the normalized, space-joined answer
 * Meaning units allow up to two unrelated tokens between pattern tokens;
 * pitfalls require adjacency unless "..." is used.
 */
export type Pattern = string;

export interface MeaningUnit {
  id: string;
  /** English gloss shown in feedback, e.g. "too early". */
  en: string;
  /** Korean gloss, e.g. "너무 이르다". */
  ko: string;
  /** Alternative patterns; the unit is present when any matches. */
  any: Pattern[];
  /** Relative weight (default 1). */
  weight?: number;
  /**
   * Technical-terminology slot. Site-specific wording varies between plants, so a
   * term slot is shown for reference only; it counts toward meaning only when critical.
   */
  term?: boolean;
  /** Message cannot work without it. */
  critical?: boolean;
}

export interface Pitfall {
  id: string;
  /** Pattern that detects the known error in the learner answer. */
  pattern: Pattern;
  category: ErrorCategory;
  severity: Severity;
  /** Defaults by category (meaning-shift → meaning, terminology → terminology, word-order → organization, else grammar). */
  bucket?: ScoreBucket;
  /** Replacement for the matched span used in the minimal correction, e.g. "too early". */
  fix: string;
  /** Short Korean explanation: what is wrong and why. */
  messageKo: string;
  /** Skill this error belongs to (defaults to the question's primary skill). */
  skill?: string;
}

export interface Hints {
  /** Hint 1 — grammar pattern, e.g. "It's too + adjective + to + verb". */
  pattern: string;
  /** Hint 2 — sentence skeleton with blanks, e.g. "I think it's too ____ to ____." */
  skeleton: string;
  /** Hint 3 — partial answer, e.g. "I think it's too early to …" */
  partial: string;
}

export interface Question {
  id: string;
  mode: QuestionMode;
  category: Category;
  /** Scenario title in English, e.g. "Equipment Specification". */
  topic: string;
  /** Scenario title in Korean. */
  topicKo: string;
  level: Cefr;
  /** 1–10 within the whole curriculum (grammar complexity, length, reasoning). */
  difficulty: number;
  /** Grammar skill ids; the first is the primary target skill. */
  skills: string[];
  /** One-line situation in Korean (who is talking, in which meeting). */
  contextKo?: string;
  /** Natural Korean of the whole prompt. */
  promptKo: string;
  /** Korean meaning chunks in ENGLISH word order. */
  segments: string[];
  /** Simple, clear international English reference answer. */
  reference: string;
  /** Other fully correct answers (semantic equivalents). */
  accepted: string[];
  /** Optional advanced version (natural, more precise, still clear). */
  advanced?: string;
  meaning: MeaningUnit[];
  pitfalls?: Pitfall[];
  hints: Hints;
  /** Short Korean grammar explanation. */
  explanationKo: string;
  /** Review-variation ladder membership for generalization (0 = closest to the original mistake). */
  variation?: { seed: string; level: 0 | 1 | 2 | 3 };
  /** Conversation scene (defaults from category: meeting/collab/business → discussion, else technical). */
  situation?: Situation;
  /** Earlier lines of the conversation (1–3); the learner's answer is the next line. */
  dialogue?: DialogueTurn[];
  /** The key spoken expression this question practises, e.g. "Let me share my screen." */
  expression?: string;
  /**
   * Role-play: one of several turns the learner speaks in the same conversation.
   * Earlier turns of the learner appear in `dialogue` as speaker "Minsu".
   */
  scenario?: { id: string; titleKo: string; step: number; total: number };
  source?: "curated" | "generated";
  /**
   * QC probes (not shown to learners): plausible learner answers with the
   * verdict the evaluator must reach. "pass" = valid answer that must score
   * ≥ 85 with no major error; "fail" = a typical mistake that must score < 85
   * or produce at least one major/critical error.
   */
  probes?: { answer: string; expect: "pass" | "fail" }[];
}

/* ───────────────────────── Evaluation ───────────────────────── */

export interface ErrorSpan {
  id: string;
  category: ErrorCategory;
  severity: Severity;
  bucket: ScoreBucket;
  /** Character range in the learner's original text; start === end marks an insertion point. */
  start: number;
  end: number;
  /** Learner text in the span ("" for a missing word). */
  text: string;
  /** Suggested replacement for the span ("" for deletion). */
  fix: string;
  messageKo: string;
  skill?: string;
  /** Where the finding came from. */
  source: "pitfall" | "rule" | "alignment" | "meaning" | "ai";
  /**
   * Shown as a suggestion only: never scored, never scheduled for review.
   * Used for site-specific word choice (raw/feed composition…), which varies by plant.
   */
  advisory?: boolean;
}

export interface MeaningCheck {
  id: string;
  en: string;
  ko: string;
  present: boolean;
  term: boolean;
  critical: boolean;
  /** Matched via spelling tolerance. */
  fuzzy?: boolean;
}

export interface RubricScore {
  score: number; // 0–100
  noteKo: string;
}

export interface Evaluation {
  questionId: string;
  answer: string;
  mode: QuestionMode;
  evaluator: "local" | "ai";
  /** e.g. "Rule-based (offline)" or "Claude". */
  evaluatorLabel: string;
  scores: {
    meaning: RubricScore;
    grammar: RubricScore;
    terminology: RubricScore;
    organization: RubricScore;
    /** International-meeting comprehensibility (separate from grammar accuracy). */
    comprehensibility: RubricScore;
    overall: number;
  };
  errors: ErrorSpan[];
  meaning: MeaningCheck[];
  /** Minimal correction preserving the learner's own expression. */
  corrected: string;
  /** Simple international English version. */
  recommended: string;
  advanced?: string;
  /** Short verdict in Korean. */
  summaryKo: string;
  /** Korean grammar explanation for the main issue (or the target pattern when correct). */
  grammarKo: string;
  alternatives: string[];
  review: { add: boolean; reasonKo: string };
  /** How confident the evaluator is in its own findings. */
  confidence: "high" | "medium" | "low";
  confidenceNoteKo?: string;
  /** The answer matched the reference or an accepted answer exactly (after normalization). */
  exact: boolean;
  /** An answer Claude approved earlier for this learner decided this grade: an exact match, or it showed a meaning chunk can be said another way (core/learned.ts). */
  learned?: boolean;
  /** Closest target sentence the diff was computed against. */
  target: string;
}

/* ───────────────────────── Learner model ───────────────────────── */

export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
export type HintLevel = 0 | 1 | 2 | 3 | 4; // 4 = revealed

export interface FsrsState {
  stability: number; // days
  difficulty: number; // 1–10
  reps: number;
  lapses: number;
  lastReview: number | null; // epoch ms
}

export type ReviewOrigin = "imported" | "error" | "lesson";

export interface ReviewItem {
  id: string;
  skill: string;
  /** Seed for variation ladders (imported mistakes and new error patterns). */
  seed?: string;
  /** Human-readable pattern, e.g. "too early / too late". */
  label: string;
  origin: ReviewOrigin;
  /** The question and answer that created this item. */
  originalQuestionId?: string;
  originalPromptKo?: string;
  originalAnswer?: string;
  correctedAnswer?: string;
  errorCategory?: ErrorCategory;
  severity?: Severity;
  createdAt: number;
  due: number;
  /** Onboarding ladder step (0 = immediate retry, then 1, 3, 7, 14, 30 days). */
  ladderStep: number;
  fsrs: FsrsState;
  successes: number;
  failures: number;
  history: { at: number; grade: Grade; score: number; hint: HintLevel; questionId: string }[];
  /** Explains the last scheduling decision. */
  scheduleNote: string;
  /** Last question ids served, to force generalization. */
  recentQuestionIds: string[];
  suspended?: boolean;
}

export type MasteryStatus = "new" | "learning" | "improving" | "mastered";

export interface SkillState {
  skill: string;
  attempts: number;
  independentSuccesses: number;
  hintedAttempts: number;
  /** 0–1 estimate. */
  mastery: number;
  status: MasteryStatus;
  lastAt: number | null;
  /** Distinct local days with a successful independent attempt. */
  successDays: string[];
  /** Distinct questions answered successfully without hints. */
  successQuestions: string[];
  /** Spaced success: longest gap (days) between two successful attempts. */
  longestSpacedSuccessDays: number;
  skippedCount: number;
  /** Seeded from the learner's imported mistake history (not evidence of mastery). */
  imported?: boolean;
}

export interface MistakeRecord {
  id: string;
  skill: string;
  category: ErrorCategory;
  incorrect: string;
  correct: string;
  whyKo: string;
  origin: ReviewOrigin;
  count: number;
  firstAt: number;
  lastAt: number;
  reviewItemId: string;
  /** Sample contexts (question ids). */
  questionIds: string[];
}

/**
 * A grammar point the learner keeps getting wrong (skill × error type), with
 * the learner's own wrong → right examples. Drives question selection.
 */
export interface GrammarWeakPoint {
  id: string;
  skill: string;
  category: ErrorCategory;
  /** Total times this error was made. */
  count: number;
  /** Decaying strength (half-life 14 days; independent successes on the skill lower it). */
  strength: number;
  firstAt: number;
  lastAt: number;
  /** Most recent examples (newest last). */
  examples: { wrong: string; right: string; fix: string; at: number; questionId: string }[];
}

export interface AttemptRecord {
  id: string;
  at: number;
  questionId: string;
  mode: QuestionMode;
  context: "lesson" | "review" | "diagnostic" | "retry";
  answer: string;
  overall: number;
  scores: { meaning: number; grammar: number; terminology: number; organization: number; comprehensibility: number };
  errorCategories: ErrorCategory[];
  hint: HintLevel;
  responseMs: number;
  firstKeyMs: number | null;
  grade: Grade;
  evaluator: "local" | "ai";
  /** Time from submit to the grade appearing (ms). */
  gradeMs?: number;
  skipped?: boolean;
  reviewItemId?: string;
}

export interface DailyLog {
  answered: number;
  correct: number;
  reviews: number;
  newItems: number;
  ms: number;
  /** Lines said in free talk with Claude (not questions; they count as practice for streaks). */
  talk?: number;
}

export interface Settings {
  theme: "system" | "light" | "dark";
  dailyTarget: number;
  scheduler: "adaptive" | "ladder";
  /** "auto": one fast Claude grading pass per answer (rule-based if unavailable). "on-request" is a legacy value treated as "auto". */
  ai: "auto" | "on-request" | "off";
  /** Legacy (grading is always the fast tier now). */
  aiDepth?: "quick" | "default";
  /**
   * How long a submit waits for Claude. "auto": 1 s when the answer is close to an expected one (the
   * rule-based grade is reliable there), longer when it is worded differently; "fast": always 1 s;
   * "accurate": up to 9 s.
   */
  gradeMode?: "auto" | "fast" | "accurate";
  /** Legacy (replaced by gradeMode). */
  gradeWait?: "fast" | "balanced" | "accurate";
  /** Confetti and celebration effects (default on; reduced motion always wins). */
  celebrate?: boolean;
  /** Short synthesized chimes on good answers (default off). */
  sound?: boolean;
  /** Read the colleague's line aloud when a question opens (default off). */
  autoSpeak?: boolean;
  /** Read aloud more slowly. */
  slowSpeech?: boolean;
  /** After answering by voice, submit as soon as the learner stops speaking (default off: check, then Enter). */
  voiceSend?: boolean;
  /** Preferred difficulty (1–10) per situation; missing = automatic from the level estimate. */
  difficulty?: Partial<Record<Situation | "all", number>>;
  autocorrect: boolean;
  showNaturalKorean: boolean;
  reducedMotion: "system" | "reduce";
}

export interface Profile {
  createdAt: number;
  onboarded: boolean;
  displayName: string;
  /** Last confirmed starting level (from a diagnostic or the default B1 assumption). */
  startLevel: Cefr;
  levelSource: "assumed" | "diagnostic";
  focusSkills: string[];
}

export interface DiagnosticResultRecord {
  id: string;
  at: number;
  length: "standard" | "extended";
  items: number;
  theta: number;
  sd: number;
  cefrLow: Cefr;
  cefrHigh: Cefr;
  cefrPoint: Cefr;
  confidence: "high" | "medium" | "low";
  sub: { grammar: number; construction: number; vocabulary: number; clarity: number };
  fluency: { medianWpm: number; medianFirstKeySec: number } | null;
  strengths: string[];
  weaknesses: string[];
  recommendedLevel: Cefr;
  partScores: Record<string, number>;
  /** The grading sheet of every item, in order: the evidence behind the estimate (added later; missing on old results). */
  sheets?: DiagnosticSheet[];
}

/** One answered level-test item as it was graded. */
export interface DiagnosticSheet {
  itemId: string;
  part: number;
  kind: "choice" | "order" | "produce";
  /** Item difficulty: the CEFR level it was written for and its logit difficulty b. */
  level: Cefr;
  b: number;
  /** 0–100 credit the estimate used. */
  score: number;
  /** What was asked (Korean context and prompt, or the choice stem). */
  contextKo?: string;
  promptKo: string;
  promptEn?: string;
  /** The learner's answer (typed text, the chosen option, or the built order). */
  answer: string;
  /** A correct answer to compare with. */
  correct: string;
  /** Produce items: the grader's minimal correction, findings and sub-scores. */
  corrected?: string;
  errors?: ErrorSpan[];
  /** Meaning chunks (Korean) the answer did not carry. */
  missing?: string[];
  sub?: { grammar: number; organization: number; terminology: number; meaning: number; comprehensibility: number };
  explanationKo?: string;
  responseMs: number;
}

export interface SeenRecord {
  count: number;
  lastAt: number;
  best: number;
  /**
   * The learner's own answers that Claude graded fully correct and that match
   * no stored answer (newest last, at most 3). The rule-based grader accepts
   * them next time, so the same answer is graded at once (core/learned.ts).
   */
  ok?: string[];
}

export interface LearnerState {
  schema: 1;
  profile: Profile;
  settings: Settings;
  items: Record<string, ReviewItem>;
  skills: Record<string, SkillState>;
  mistakes: Record<string, MistakeRecord>;
  attempts: AttemptRecord[];
  diagnostics: DiagnosticResultRecord[];
  daily: Record<string, DailyLog>;
  seen: Record<string, SeenRecord>;
  generated: Question[];
  /** Frequent grammar mistakes, keyed `${skill}:${category}` (added after v1; may be missing in old states). */
  weak?: Record<string, GrammarWeakPoint>;
  updatedAt: number;
}
