import type { Question } from "../../core/types";

/**
 * Role-play scenarios at work (meetings, presentations, negotiation, problems).
 * Each scenario is several turns of one conversation; from step 2 the learner's
 * earlier line appears in `dialogue` as speaker "Minsu". See docs/engflow/CONTENT_AUTHORING.md ("Role-play").
 */
export const ROLEPLAY_WORK: Question[] = [
  {
    id: "rp-weekly-call-1",
    mode: "phrase",
    category: "meeting",
    situation: "online",
    scenario: { id: "rp-weekly-call", titleKo: "주간 화상회의 시작", step: 1, total: 3 },
    topic: "Weekly Call: Audio Check",
    topicKo: "주간 화상회의: 소리 확인",
    level: "A2",
    difficulty: 2,
    skills: ["online-meeting"],
    expression: "I can hear you clearly.",
    contextKo: "자카르타 팀과 매주 하는 화상회의가 막 연결되었습니다.",
    dialogue: [{ speaker: "Budi", en: "Hi Minsu, can you hear me okay?", ko: "안녕하세요 민수 씨, 제 목소리 잘 들려요?" }],
    promptKo: "네, 잘 들려요.",
    segments: ["네,", "저는 들을 수 있어요", "당신 목소리를", "잘"],
    reference: "Yes, I can hear you clearly.",
    accepted: ["Yes, I can hear you well.", "Yes, I can hear you fine.", "Yes, loud and clear.", "Yes, I can hear you."],
    meaning: [
      { id: "yes", en: "yes", ko: "네", any: ["yes|yeah|yep|sure"] },
      { id: "hear", en: "I can hear you", ko: "들려요", any: ["hear", "loud ... clear"], critical: true },
    ],
    pitfalls: [
      { id: "hear-voice-well", pattern: "can hear your voice well", category: "word-choice", severity: "minor", fix: "can hear you clearly", messageKo: "'I can hear your voice well'도 뜻은 통하지만, 원어민은 보통 'I can hear you (clearly).'라고 사람을 목적어로 씁니다." },
      { id: "can-heard", pattern: "can =heard", category: "verb-form", severity: "major", fix: "can hear", messageKo: "can 뒤에는 동사원형이 옵니다: 'can hear'." },
    ],
    hints: { pattern: "Yes, I can hear you + 부사", skeleton: "Yes, I can ____ you ______.", partial: "Yes, I can hear…" },
    explanationKo: "화상회의에서 '잘 들려요'는 'I can hear you clearly.' 또는 짧게 'Loud and clear.'라고 합니다. can 뒤에는 동사원형을 씁니다.",
    probes: [
      { answer: "Yeah, I can hear you clearly.", expect: "pass" },
      { answer: "Yes, I can heard you.", expect: "fail" },
    ],
  },
  {
    id: "rp-weekly-call-2",
    mode: "phrase",
    category: "meeting",
    situation: "online",
    scenario: { id: "rp-weekly-call", titleKo: "주간 화상회의 시작", step: 2, total: 3 },
    topic: "Weekly Call: Sharing the Screen",
    topicKo: "주간 화상회의: 화면 공유",
    level: "B1",
    difficulty: 3,
    skills: ["online-meeting"],
    expression: "Let me share my screen first.",
    contextKo: "소리 확인이 끝났고, 부디 씨가 일정 이야기부터 하자고 합니다. 일정표를 보여 주려고 합니다.",
    dialogue: [
      { speaker: "Minsu", en: "Yes, I can hear you clearly.", ko: "네, 잘 들려요." },
      { speaker: "Budi", en: "Great. Shall we start with the schedule?", ko: "좋아요. 일정부터 시작할까요?" },
    ],
    promptKo: "네. 먼저 제 화면을 공유할게요.",
    segments: ["네.", "제가 ~할게요", "제 화면을 공유", "먼저"],
    reference: "Sure. Let me share my screen first.",
    accepted: ["Sure, let me share my screen first.", "Sure. I'll share my screen first.", "Yes. Let me share my screen first.", "Sure. Let me first share my screen."],
    meaning: [
      { id: "sure", en: "sure", ko: "네", any: ["sure|yes|yeah|okay|ok", "of course"] },
      { id: "share", en: "let me share my screen", ko: "화면을 공유할게요", any: ["share ... screen"], critical: true },
      { id: "first", en: "first", ko: "먼저", any: ["first|before"] },
    ],
    pitfalls: [
      { id: "let-me-to", pattern: "let me to", category: "verb-form", severity: "major", fix: "let me", messageKo: "'let me' 뒤에는 동사원형이 바로 옵니다: 'let me share'." },
      { id: "share-first-my", pattern: "share first my screen", category: "word-order", severity: "major", fix: "share my screen first", messageKo: "영어는 '동사 + 목적어'를 먼저 말하고 first를 뒤에 둡니다: 'share my screen first'." },
    ],
    hints: { pattern: "Let me + 동사원형 + 목적어 + first", skeleton: "Sure. Let me _____ my screen _____.", partial: "Sure. Let me share…" },
    explanationKo: "'제가 ~할게요'는 'Let me + 동사원형'입니다. first(먼저)는 '동사 + 목적어' 뒤에 둡니다.",
    probes: [
      { answer: "Okay, let me share my screen first.", expect: "pass" },
      { answer: "Sure. Let me share first my screen.", expect: "fail" },
    ],
  },
  {
    id: "rp-weekly-call-3",
    mode: "sentence",
    category: "meeting",
    situation: "online",
    scenario: { id: "rp-weekly-call", titleKo: "주간 화상회의 시작", step: 3, total: 3 },
    topic: "Weekly Call: A Changed Date",
    topicKo: "주간 화상회의: 바뀐 날짜",
    level: "B2",
    difficulty: 6,
    skills: ["present-perfect", "passive"],
    expression: "The review has been moved to next Monday.",
    contextKo: "부디 씨가 화면 속 일정표를 보며 설계 검토가 아직 금요일이냐고 묻습니다. 사실 다음 주 월요일로 옮겨졌습니다.",
    dialogue: [
      { speaker: "Minsu", en: "Sure. Let me share my screen first.", ko: "네. 먼저 제 화면을 공유할게요." },
      { speaker: "Budi", en: "Okay, I can see it. So, is the design review still on Friday?", ko: "네, 보여요. 그럼 설계 검토는 아직 금요일인가요?" },
    ],
    promptKo: "사실은 검토가 다음 주 월요일로 옮겨졌어요.",
    segments: ["사실은", "검토가", "옮겨졌어요", "다음 주 월요일로"],
    reference: "Actually, the review has been moved to next Monday.",
    accepted: [
      "Actually, the review has been moved to Monday next week.",
      "Actually, the review was moved to next Monday.",
      "Actually, we have moved the review to next Monday.",
      "Actually, the design review has been postponed to next Monday.",
    ],
    meaning: [
      { id: "actually", en: "actually", ko: "사실은", any: ["actually|no", "in fact"] },
      { id: "review", en: "the review", ko: "검토", any: ["review"] },
      { id: "moved", en: "has been moved", ko: "옮겨졌다", any: ["move|postpone|change|reschedule|push|delay"], critical: true },
      { id: "monday", en: "next Monday", ko: "다음 주 월요일", any: ["monday"], critical: true },
    ],
    pitfalls: [
      { id: "has-moved-passive", pattern: "review has =moved to", category: "verb-form", severity: "major", fix: "review has been moved to", messageKo: "검토는 스스로 옮기지 않고 '옮겨진' 것이라 수동태가 필요합니다: 'has been moved'." },
      { id: "is-moved", pattern: "review =is =moved", category: "tense", severity: "major", fix: "review has been moved", messageKo: "이미 옮겨진 결과를 지금 알려 줄 때는 현재완료 수동태 'has been moved'(또는 과거 'was moved')를 씁니다." },
    ],
    hints: { pattern: "Actually, + 주어 + has been + 과거분사 + to + 시점", skeleton: "Actually, the review ___ ____ _____ to next Monday.", partial: "Actually, the review has been…" },
    explanationKo: "일정이 '옮겨졌다'는 주어(검토)가 동작을 받는 쪽이라 수동태이고, 그 결과를 지금 알려 주므로 현재완료 'has been moved'가 자연스럽습니다. 'has moved'는 검토가 스스로 옮겨 간 것처럼 들립니다.",
    probes: [
      { answer: "Actually, the design review was moved to next Monday.", expect: "pass" },
      { answer: "Actually, the review has moved to next Monday.", expect: "fail" },
      { answer: "Actually, the review is moved to next Monday.", expect: "fail" },
    ],
  },
];
