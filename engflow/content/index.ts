import type { Question } from "../core/types";
import { SENTENCES_A } from "./bank/sentences-a";
import { SENTENCES_B } from "./bank/sentences-b";
import { PHRASES } from "./bank/phrases";
import { VARIATIONS } from "./bank/variations";
import { DIAGNOSTIC_ITEMS } from "./bank/diagnostic";

export { SKILLS, SKILL_BY_ID, SKILL_GROUPS, skillName } from "./skills";
export { SEEDS, SEED_BY_ID } from "./seeds";
export { GUIDE } from "./guide";
export { DIAGNOSTIC_ITEMS };

/** The curated, QC-validated question bank (lessons + review variations). */
export const QUESTIONS: Question[] = [...SENTENCES_A, ...SENTENCES_B, ...PHRASES, ...VARIATIONS].map((q) => ({ ...q, source: "curated" as const }));

export const QUESTION_BY_ID: Record<string, Question> = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
