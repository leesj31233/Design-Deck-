import type { Question } from "../../core/types";

/** Conversation questions — situation "online". See docs/engflow/CONTENT_AUTHORING.md ("Conversation questions"). */
export const TALK_ONLINE: Question[] = [
  {
    id: "tk-online-share-screen",
    mode: "phrase",
    category: "meeting",
    situation: "online",
    topic: "Sharing Your Screen",
    topicKo: "화면 공유",
    level: "A2",
    difficulty: 2,
    skills: ["online-meeting"],
    expression: "Let me share my screen.",
    contextKo: "주간 온라인 회의. 진행자가 당신에게 자료를 보여 달라고 합니다.",
    dialogue: [{ speaker: "Budi", en: "Okay, Minsu, can you show us the new layout?", ko: "좋아요, 민수 씨, 새 배치도를 보여 줄 수 있나요?" }],
    promptKo: "네, 제 화면을 공유할게요.",
    segments: ["네,", "제가 ~할게요", "제 화면을 공유"],
    reference: "Sure, let me share my screen.",
    accepted: ["Sure, I'll share my screen.", "Yes, let me share my screen.", "Sure. Let me share my screen."],
    meaning: [
      { id: "let-me", en: "let me / I'll", ko: "제가 ~할게요", any: ["let me", "i will", "i am going to"], critical: true },
      { id: "share", en: "share my screen", ko: "화면을 공유", any: ["share ... screen"], critical: true },
    ],
    pitfalls: [
      { id: "let-me-to", pattern: "let me to", category: "verb-form", severity: "major", fix: "let me", messageKo: "'let me' 뒤에는 동사원형이 바로 옵니다: 'let me share'. 'to'를 넣지 않습니다." },
      { id: "show-screen-share", pattern: "i share ... screen", category: "tense", severity: "major", fix: "I'll share", messageKo: "지금 막 하려는 일을 말할 때는 'I share'(평소에 공유한다)가 아니라 'Let me share' 또는 'I'll share'를 씁니다." },
    ],
    hints: { pattern: "Let me + 동사원형 (지금 제가 할게요)", skeleton: "Sure, let me _____ my ______.", partial: "Sure, let me share…" },
    explanationKo: "회의에서 '제가 지금 ~할게요'는 'Let me + 동사원형'이 가장 자연스럽습니다. 'Let me to share'처럼 to를 넣거나 'I share'(평소 습관)로 말하지 않습니다.",
    probes: [
      { answer: "OK, let me share my screen.", expect: "pass" },
      { answer: "Sure, let me to share my screen.", expect: "fail" },
      { answer: "Yes, I share my screen.", expect: "fail" },
    ],
  },
];
