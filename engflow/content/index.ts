import type { Question } from "../core/types";
import { SENTENCES_A } from "./bank/sentences-a";
import { SENTENCES_B } from "./bank/sentences-b";
import { PHRASES } from "./bank/phrases";
import { VARIATIONS } from "./bank/variations";
import { DIAGNOSTIC_ITEMS } from "./bank/diagnostic";
import { TALK_ONLINE } from "./bank/talk-online";
import { TALK_PRESENTATION } from "./bank/talk-presentation";
import { TALK_DISCUSSION } from "./bank/talk-discussion";
import { TALK_SMALLTALK } from "./bank/talk-smalltalk";
import { TALK_MEAL } from "./bank/talk-meal";
import { TALK_VISIT } from "./bank/talk-visit";
import { DIALOGUE_OVERLAY } from "./bank/dialogue-overlay";

export { SKILLS, SKILL_BY_ID, SKILL_GROUPS, skillName } from "./skills";
export { SEEDS, SEED_BY_ID } from "./seeds";
export { GUIDE } from "./guide";
export { SITUATION_INFO, DIFFICULTY_INFO } from "./situations";
export { DIAGNOSTIC_ITEMS };

/** Conversation questions ("how do I say this?") by scene. */
export const TALK_BANKS: Record<string, Question[]> = {
  "talk-online": TALK_ONLINE,
  "talk-presentation": TALK_PRESENTATION,
  "talk-discussion": TALK_DISCUSSION,
  "talk-smalltalk": TALK_SMALLTALK,
  "talk-meal": TALK_MEAL,
  "talk-visit": TALK_VISIT,
};

/** Adds conversation context written separately for questions that predate dialogue support. */
export function withDialogue(q: Question): Question {
  const d = q.dialogue ?? DIALOGUE_OVERLAY[q.id];
  return d ? { ...q, dialogue: d } : q;
}

/** The curated, QC-validated question bank (lessons + conversation + review variations). */
export const QUESTIONS: Question[] = [...SENTENCES_A, ...SENTENCES_B, ...PHRASES, ...Object.values(TALK_BANKS).flat(), ...VARIATIONS].map((q) => ({
  ...withDialogue(q),
  source: "curated" as const,
}));

export const QUESTION_BY_ID: Record<string, Question> = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
