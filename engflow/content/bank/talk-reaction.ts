import type { Question } from "../../core/types";

/** Conversation questions — situation "reaction" (quick replies). See docs/engflow/CONTENT_AUTHORING.md ("Conversation questions"). */
export const TALK_REACTION: Question[] = [
  {
    id: "tk-reaction-sounds-good",
    mode: "phrase",
    category: "meeting",
    situation: "reaction",
    topic: "Agreeing to a Time",
    topicKo: "시간 제안에 동의",
    level: "A2",
    difficulty: 1,
    skills: ["reaction"],
    expression: "Sounds good.",
    contextKo: "주간 회의 끝무렵, 다음 회의 시간을 정합니다.",
    dialogue: [{ speaker: "Sari", en: "How about Thursday at ten for the next meeting?", ko: "다음 회의는 목요일 10시 어때요?" }],
    promptKo: "좋아요.",
    segments: ["좋아요"],
    reference: "Sounds good.",
    accepted: ["Sounds good to me.", "That works for me.", "Sure, that works.", "Works for me.", "Perfect.", "Great."],
    meaning: [{ id: "agree", en: "agree", ko: "좋다", any: ["sound ... good|great|fine|perfect", "work|works", "perfect|great|fine|sure|okay|ok"], critical: true }],
    pitfalls: [
      { id: "sounds-well", pattern: "sound|sounds well", category: "word-choice", severity: "major", fix: "Sounds good", messageKo: "sound는 '~하게 들린다'는 상태 동사라 부사 well이 아니라 형용사 good을 씁니다: 'Sounds good.'" },
    ],
    hints: { pattern: "Sounds + 형용사", skeleton: "______ good.", partial: "Sounds…" },
    explanationKo: "제안에 '좋아요'라고 답할 때 원어민은 'Sounds good.'을 가장 많이 씁니다. sound 뒤에는 형용사(good)가 오므로 'Sounds well'이라고 하지 않습니다.",
    probes: [
      { answer: "That sounds good.", expect: "pass" },
      { answer: "Sounds well.", expect: "fail" },
    ],
  },
];
