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
import { TALK_REACTION } from "./bank/talk-reaction";
import { TALK_PHONE } from "./bank/talk-phone";
import { TALK_TROUBLE } from "./bank/talk-trouble";
import { TALK_NEGOTIATION } from "./bank/talk-negotiation";
import { TALK_DISCUSSION_2 } from "./bank/talk-discussion-2";
import { TALK_ONLINE_2 } from "./bank/talk-online-2";
import { TALK_PRESENTATION_2 } from "./bank/talk-presentation-2";
import { TALK_SMALLTALK_2 } from "./bank/talk-smalltalk-2";
import { TALK_MEAL_2 } from "./bank/talk-meal-2";
import { TALK_VISIT_2 } from "./bank/talk-visit-2";
import { ROLEPLAY_WORK } from "./bank/roleplay-work";
import { ROLEPLAY_SOCIAL } from "./bank/roleplay-social";
import { TALK_LONG } from "./bank/talk-long";
import { TALK_PHRASAL } from "./bank/talk-phrasal";
import { TALK_IDIOMS } from "./bank/talk-idioms";
import { TALK_DAILY } from "./bank/talk-daily";
import { TALK_OFFICE } from "./bank/talk-office";
import { TALK_FEELINGS } from "./bank/talk-feelings";
import { ROLEPLAY_DAILY } from "./bank/roleplay-daily";
import { TALK_REACTION_2 } from "./bank/talk-reaction-2";
import { TALK_DAILY_2 } from "./bank/talk-daily-2";
import { TALK_OFFICE_2 } from "./bank/talk-office-2";
import { TALK_FEELINGS_2 } from "./bank/talk-feelings-2";
import { ROLEPLAY_MIXED } from "./bank/roleplay-mixed";
import { TALK_MEETING } from "./bank/talk-meeting";
import { TALK_SHORT_LONG } from "./bank/talk-short-long";
import { DIALOGUE_OVERLAY } from "./bank/dialogue-overlay";

export { SKILLS, SKILL_BY_ID, SKILL_GROUPS, skillName } from "./skills";
export { SEEDS, SEED_BY_ID } from "./seeds";
export { GUIDE } from "./guide";
export { SITUATION_INFO, DIFFICULTY_INFO } from "./situations";
export { DIAGNOSTIC_ITEMS };

/** Conversation questions ("how do I say this?"), one scene per file: talk-<scene>[-n]. */
export const TALK_BANKS: Record<string, Question[]> = {
  "talk-online": TALK_ONLINE,
  "talk-online-2": TALK_ONLINE_2,
  "talk-presentation": TALK_PRESENTATION,
  "talk-presentation-2": TALK_PRESENTATION_2,
  "talk-discussion": TALK_DISCUSSION,
  "talk-discussion-2": TALK_DISCUSSION_2,
  "talk-reaction": TALK_REACTION,
  "talk-reaction-2": TALK_REACTION_2,
  "talk-smalltalk": TALK_SMALLTALK,
  "talk-smalltalk-2": TALK_SMALLTALK_2,
  "talk-daily": TALK_DAILY,
  "talk-daily-2": TALK_DAILY_2,
  "talk-office": TALK_OFFICE,
  "talk-office-2": TALK_OFFICE_2,
  "talk-feelings": TALK_FEELINGS,
  "talk-feelings-2": TALK_FEELINGS_2,
  "talk-meal": TALK_MEAL,
  "talk-meal-2": TALK_MEAL_2,
  "talk-phone": TALK_PHONE,
  "talk-negotiation": TALK_NEGOTIATION,
  "talk-trouble": TALK_TROUBLE,
  "talk-visit": TALK_VISIT,
  "talk-visit-2": TALK_VISIT_2,
};

/** Conversation questions whose scene varies per question: role-play scenarios, long turns, phrasal verbs. */
export const MIXED_BANKS: Record<string, Question[]> = {
  "roleplay-work": ROLEPLAY_WORK,
  "roleplay-social": ROLEPLAY_SOCIAL,
  "roleplay-daily": ROLEPLAY_DAILY,
  "roleplay-mixed": ROLEPLAY_MIXED,
  "talk-long": TALK_LONG,
  "talk-phrasal": TALK_PHRASAL,
  "talk-idioms": TALK_IDIOMS,
  "talk-meeting": TALK_MEETING,
  "talk-short-long": TALK_SHORT_LONG,
};

/** Scene of a talk-<scene>[-n] file. */
export function sceneOfBank(name: string): string {
  return name.replace(/^talk-/, "").replace(/-\d+$/, "");
}

/** Adds conversation context written separately for questions that predate dialogue support. */
export function withDialogue(q: Question): Question {
  const d = q.dialogue ?? DIALOGUE_OVERLAY[q.id];
  return d ? { ...q, dialogue: d } : q;
}

/** The curated, QC-validated question bank (lessons + conversation + review variations). */
export const QUESTIONS: Question[] = [
  ...SENTENCES_A, ...SENTENCES_B, ...PHRASES, ...Object.values(TALK_BANKS).flat(), ...Object.values(MIXED_BANKS).flat(), ...VARIATIONS,
].map((q) => ({
  ...withDialogue(q),
  source: "curated" as const,
}));

export const QUESTION_BY_ID: Record<string, Question> = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
