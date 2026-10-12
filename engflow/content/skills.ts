/**
 * Grammar skill registry. Every question, error and review item points at one
 * of these ids. Groups drive the notebook's category grouping.
 */

export type SkillGroup = "tense" | "conditional" | "structure" | "preposition" | "noun" | "function" | "conversation";

export interface SkillDef {
  id: string;
  group: SkillGroup;
  nameKo: string;
  nameEn: string;
  /** Compact structure formula shown in hints and the guide. */
  formula: string;
  /** Curriculum order (lower = introduced earlier). */
  order: number;
  /** Typical CEFR band where this becomes important. */
  band: "A2" | "B1" | "B2" | "C1";
}

export const SKILL_GROUPS: Record<SkillGroup, { ko: string; en: string }> = {
  tense: { ko: "동사 형태와 시제", en: "Verb forms & tense" },
  conditional: { ko: "조건·가능성·필요", en: "Conditionals & modals" },
  structure: { ko: "문장 구조와 어순", en: "Sentence structure" },
  preposition: { ko: "전치사·어휘 결합", en: "Prepositions & word choice" },
  noun: { ko: "명사·관사", en: "Nouns & articles" },
  function: { ko: "회의 표현", en: "Meeting functions" },
  conversation: { ko: "대화·관계 표현", en: "Conversation & relationships" },
};

export const SKILLS: SkillDef[] = [
  { id: "progressive", group: "tense", nameKo: "진행형 (be + -ing)", nameEn: "Present progressive", formula: "be + V-ing", order: 1, band: "A2" },
  { id: "be-adj", group: "tense", nameKo: "be + 형용사/과거분사 (상태)", nameEn: "be + adjective / participle", formula: "be + (a little) + delayed / ready", order: 2, band: "A2" },
  { id: "agreement", group: "tense", nameKo: "주어-동사 일치", nameEn: "Subject–verb agreement", formula: "it is / they are / he has", order: 3, band: "A2" },
  { id: "verb-object", group: "structure", nameKo: "타동사 + 목적어", nameEn: "Verb + object", formula: "check + the rate (no extra preposition)", order: 4, band: "A2" },
  { id: "verb-prep", group: "preposition", nameKo: "동사 + 전치사 결합", nameEn: "Verb + preposition", formula: "wait for / depend on / focus on", order: 5, band: "A2" },
  { id: "too-adj", group: "preposition", nameKo: "too + 형용사 (+ to 동사)", nameEn: "too + adjective (+ to-verb)", formula: "It's too + adj + to + V", order: 6, band: "B1" },
  { id: "word-order", group: "structure", nameKo: "어순: 동사 + 목적어 + 부사", nameEn: "Word order: verb + object + adverb", formula: "check + the rate + first", order: 7, band: "A2" },
  { id: "articles", group: "noun", nameKo: "관사 a / an / the", nameEn: "Articles", formula: "the actual data / a new pump", order: 8, band: "A2" },
  { id: "countability", group: "noun", nameKo: "셀 수 없는 명사", nameEn: "Uncountable nouns", formula: "data, equipment, information (no -s)", order: 9, band: "B1" },
  { id: "future-plan", group: "tense", nameKo: "미래 계획 표현", nameEn: "Future plans", formula: "will / be going to / be planning to", order: 10, band: "A2" },
  { id: "modal-possibility", group: "conditional", nameKo: "가능성 조동사", nameEn: "Possibility modals", formula: "might / may / could + V", order: 11, band: "B1" },
  { id: "modal-necessity", group: "conditional", nameKo: "필요·의무 표현", nameEn: "Necessity", formula: "have to / need to / should + V", order: 12, band: "B1" },
  { id: "present-perfect", group: "tense", nameKo: "현재완료 (have + p.p.)", nameEn: "Present perfect", formula: "have/has + p.p. (+ yet / already)", order: 13, band: "B1" },
  { id: "prep-gerund", group: "preposition", nameKo: "전치사 + 동명사", nameEn: "Preposition + gerund", formula: "before / after / without + V-ing", order: 14, band: "B1" },
  { id: "if-when", group: "conditional", nameKo: "if vs when", nameEn: "if vs when", formula: "if = 일어날지 불확실 / when = 일어날 것이 확실", order: 15, band: "B1" },
  { id: "collocation", group: "preposition", nameKo: "기술 어휘 결합", nameEn: "Technical collocations", formula: "receive data / run a test / place an order", order: 16, band: "B1" },
  { id: "time-clause", group: "conditional", nameKo: "시간 부사절 (현재시제)", nameEn: "Time clauses", formula: "when / until / as soon as + present", order: 17, band: "B1" },
  { id: "cond-1", group: "conditional", nameKo: "1형 조건문 (실제 가능)", nameEn: "First conditional", formula: "If + present, will / might + V", order: 18, band: "B1" },
  { id: "cause-effect", group: "structure", nameKo: "원인과 결과", nameEn: "Cause and effect", formula: "because / so / due to / as a result", order: 19, band: "B1" },
  { id: "purpose-to", group: "structure", nameKo: "목적의 to부정사", nameEn: "Purpose (to + verb)", formula: "to / in order to + V", order: 20, band: "B1" },
  { id: "polite-request", group: "function", nameKo: "정중한 요청", nameEn: "Polite requests", formula: "Could you please + V? / Would it be possible to + V?", order: 21, band: "B1" },
  { id: "clarify-question", group: "function", nameKo: "확인·명확화 질문", nameEn: "Clarification questions", formula: "Do you mean …? / Could you tell me what … is?", order: 22, band: "B1" },
  { id: "passive", group: "tense", nameKo: "수동태", nameEn: "Passive voice", formula: "be + p.p. (+ by …)", order: 23, band: "B1" },
  { id: "comparative", group: "preposition", nameKo: "비교 표현", nameEn: "Comparatives", formula: "higher than / more stable than / the same as", order: 24, band: "B1" },
  { id: "degree", group: "preposition", nameKo: "정도·수량 표현", nameEn: "Degree & quantity", formula: "a little / slightly / about / much higher", order: 25, band: "B1" },
  { id: "relative-clause", group: "structure", nameKo: "관계절 (which / that / who)", nameEn: "Relative clauses", formula: "the pump that we replaced …", order: 26, band: "B2" },
  { id: "reporting", group: "structure", nameKo: "회의 결정 요약·전달", nameEn: "Reporting & summarizing", formula: "We agreed that … / The vendor said that …", order: 27, band: "B2" },
  { id: "cond-2", group: "conditional", nameKo: "2형 조건문 (현재 사실 반대 가정)", nameEn: "Second conditional", formula: "If + past, would + V", order: 28, band: "B2" },
  { id: "polite-disagree", group: "function", nameKo: "정중한 반대·완곡 표현", nameEn: "Polite disagreement", formula: "I see your point, but … / I'm not sure that …", order: 29, band: "B2" },
  // Everyday spoken English for online meetings, presentations, small talk and meals.
  { id: "small-talk", group: "conversation", nameKo: "안부·스몰토크", nameEn: "Greetings & small talk", formula: "How was your weekend? / It's been a while. / How have you been?", order: 31, band: "A2" },
  { id: "online-meeting", group: "conversation", nameKo: "온라인 회의 진행 표현", nameEn: "Running an online meeting", formula: "Can you hear me? / Let me share my screen. / You're on mute.", order: 32, band: "A2" },
  { id: "question-form", group: "conversation", nameKo: "의문문 만들기", nameEn: "Forming questions", formula: "Do you …? / How long have you …? / What do you think of …?", order: 33, band: "A2" },
  { id: "offer-suggest", group: "conversation", nameKo: "권유·제안", nameEn: "Offers & suggestions", formula: "Would you like …? / Why don't we …? / Shall we …?", order: 34, band: "B1" },
  { id: "thanks-looking-forward", group: "conversation", nameKo: "감사·기대 표현", nameEn: "Thanks & looking forward", formula: "Thank you for + V-ing / I'm looking forward to + V-ing", order: 35, band: "B1" },
  { id: "signpost", group: "conversation", nameKo: "발표 흐름 표현", nameEn: "Presentation signposting", formula: "Let me walk you through … / Moving on to … / As you can see, …", order: 36, band: "B1" },
  { id: "opinion", group: "conversation", nameKo: "의견·제안 말하기", nameEn: "Giving opinions", formula: "I think we should … / I'd suggest + V-ing / In my view, …", order: 37, band: "B1" },
  { id: "cond-3", group: "conditional", nameKo: "3형 조건문 (과거 사실 반대 가정)", nameEn: "Third conditional", formula: "If + had p.p., would have + p.p.", order: 30, band: "C1" },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export function skillName(id: string): string {
  return SKILL_BY_ID[id]?.nameKo ?? id;
}
