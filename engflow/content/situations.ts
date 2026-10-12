import type { Situation } from "../core/types";

/** Conversation scenes, in the order the Learn screen shows them. */
export const SITUATION_INFO: Record<Situation, { ko: string; en: string; descKo: string }> = {
  online: { ko: "온라인 미팅 진행", en: "Running an online meeting", descKo: "접속·소리 확인, 화면 공유, 안건 소개, 발언 넘기기, 마무리" },
  presentation: { ko: "발표", en: "Presenting", descKo: "자료 소개, 슬라이드 넘기기, 결과 설명, 질문 받기" },
  discussion: { ko: "회의 대화", en: "Meeting discussion", descKo: "의견 말하기, 동의·반대, 확인 질문, 일정·요청" },
  reaction: { ko: "짧은 대답·맞장구", en: "Quick replies & reactions", descKo: "Sounds good, Got it, Fair enough처럼 바로 나와야 하는 한마디" },
  smalltalk: { ko: "안부·스몰토크", en: "Greetings & small talk", descKo: "인사, 주말·날씨·근황, 오랜만의 대화, 칭찬과 감사" },
  daily: { ko: "일상·여행", en: "Everyday life & travel", descKo: "카페·식당 주문, 택시·길 묻기, 호텔·쇼핑·환불, 약국·병원, 공항" },
  office: { ko: "사무실 일상", en: "Office life", descKo: "동료에게 부탁·거절, 휴가·조퇴 말하기, 도움 요청, 신입 환영, 퇴근 인사" },
  feelings: { ko: "감정·공감", en: "Feelings & empathy", descKo: "축하·위로·걱정·안도·놀람·아쉬움을 자연스럽게 말하기" },
  meal: { ko: "식사·회식", en: "Meals & dinners", descKo: "메뉴 추천, 주문, 건배, 계산, 정중한 거절" },
  phone: { ko: "전화·메신저", en: "Calls & messaging", descKo: "전화 받기·걸기, 다시 연락하기, 메신저·음성 메시지" },
  negotiation: { ko: "협상·조율", en: "Negotiating", descKo: "가격·일정·범위 조율, 조건 제시, 정중하게 밀고 당기기" },
  trouble: { ko: "문제·사과", en: "Problems & apologies", descKo: "지연·실수 알리기, 사과, 해결책 제시, 불만 대응" },
  visit: { ko: "출장·방문", en: "Business trips & site visits", descKo: "공항 마중, 현장 안내, 안전 설명, 일정 조율" },
  technical: { ko: "기술 논의", en: "Technical discussion", descKo: "공정·파일럿·설비·데이터에 대한 엔지니어링 대화" },
};

/** What each difficulty step asks of the learner (shown next to the 1–10 picker). */
export const DIFFICULTY_INFO: { level: number; ko: string }[] = [
  { level: 1, ko: "정해진 짧은 표현 (3–6단어)" },
  { level: 2, ko: "짧은 표현 + 단어 하나 바꾸기" },
  { level: 3, ko: "한 문장 · 기본 시제" },
  { level: 4, ko: "한 문장 · 목적어·전치사까지" },
  { level: 5, ko: "두 절 연결 (because / so / when)" },
  { level: 6, ko: "현재완료·조동사·조건문이 들어간 두 절" },
  { level: 7, ko: "수동태·관계절·정중한 완곡 표현" },
  { level: 8, ko: "두 문장 · 이유와 제안" },
  { level: 9, ko: "여러 문장 · 가정·요약·전달" },
  { level: 10, ko: "긴 발언 · 정중한 반대와 대안 제시" },
];
