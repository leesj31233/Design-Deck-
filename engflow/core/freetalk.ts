import { z } from "zod";
import { runRules } from "./rules";
import { tokenize, words } from "./text";
import type { Situation } from "./types";

/**
 * Free talk with Claude: an open conversation in one scene. Claude plays the
 * other person; after every line the learner says, one request returns both
 * a short grade of that line and the partner's next line, so the talk keeps
 * moving. The built-in grammar rules check each line instantly as well, and
 * their major findings stay even if Claude's reply leaves them out (as in
 * normal grading).
 */

export interface TalkTopic {
  id: string;
  scene: Situation;
  titleKo: string;
  /** Who Claude plays, e.g. "Sari" or "Barista". */
  partner: string;
  /** The partner in one English phrase, for the prompt. */
  persona: string;
  setupKo: string;
  /** The scene in English, for the prompt. */
  setup: string;
  goalKo: string;
  goal: string;
  opener: { en: string; ko: string; hint?: { en: string; ko: string } };
}

export const TALK_TOPICS: TalkTopic[] = [
  {
    id: "weekend-chat", scene: "smalltalk", titleKo: "월요일 아침 주말 이야기", partner: "Sari", persona: "a friendly process engineer on the Jakarta team",
    setupKo: "월요일 아침 화상회의가 시작되기 전, 자카르타 팀의 Sari와 잠깐 잡담합니다.", setup: "A few minutes before the Monday online meeting starts.",
    goalKo: "주말 이야기를 주고받고 상대에게도 질문하기", goal: "Chat about the weekend and ask Sari questions back.",
    opener: { en: "Morning, Minsu! How was your weekend?", ko: "좋은 아침이에요, 민수 씨! 주말 어떻게 보냈어요?", hint: { en: "It was great! I went hiking with my family. How about you?", ko: "좋았어요! 가족이랑 등산 갔어요. 당신은요?" } },
  },
  {
    id: "cafe-order", scene: "daily", titleKo: "출장지 카페에서 주문하기", partner: "Barista", persona: "a barista at a busy café in Singapore",
    setupKo: "싱가포르 출장 중, 아침 회의 전에 호텔 근처 카페에서 커피를 주문합니다.", setup: "A café near the hotel on a business trip in Singapore, before a morning meeting.",
    goalKo: "음료 주문, 사이즈·우유 고르기, 결제하고 받기", goal: "Order a drink, choose size and milk, pay and pick it up.",
    opener: { en: "Hi there! What can I get for you today?", ko: "안녕하세요! 뭘 드릴까요?", hint: { en: "Can I get a medium latte, please?", ko: "라테 미디엄 사이즈 하나 주세요." } },
  },
  {
    id: "hotel-checkin", scene: "daily", titleKo: "호텔 체크인과 조용한 방 요청", partner: "Hotel clerk", persona: "a polite front-desk clerk at a business hotel in Jakarta",
    setupKo: "자카르타 출장 첫날 밤, 호텔 프런트에서 체크인합니다. 지난번엔 방이 엘리베이터 옆이라 시끄러웠습니다.", setup: "Checking in late in the evening at a business hotel in Jakarta.",
    goalKo: "예약 확인, 조용한 방 요청, 조식 시간 묻기", goal: "Check in, ask for a quiet room, and ask about breakfast.",
    opener: { en: "Good evening, welcome to the Grand Hotel. Do you have a reservation with us?", ko: "안녕하세요, 그랜드 호텔에 오신 걸 환영합니다. 예약하셨나요?", hint: { en: "Yes, I have a reservation under Minsu Kim.", ko: "네, 김민수로 예약했어요." } },
  },
  {
    id: "pharmacy", scene: "daily", titleKo: "출장 중 약국에서 증상 말하기", partner: "Pharmacist", persona: "a helpful pharmacist",
    setupKo: "출장 둘째 날, 어제부터 목이 아프고 열이 조금 있어 호텔 근처 약국에 갔습니다.", setup: "A pharmacy near the hotel on a business trip; Minsu has had a sore throat and a slight fever since yesterday.",
    goalKo: "증상과 시작 시점 설명, 알레르기 답하기, 복용법 확인", goal: "Describe the symptoms and since when, answer about allergies, and check how to take the medicine.",
    opener: { en: "Hello, how can I help you today?", ko: "안녕하세요, 무엇을 도와드릴까요?", hint: { en: "I've had a sore throat and a slight fever since yesterday.", ko: "어제부터 목이 아프고 열이 조금 있어요." } },
  },
  {
    id: "reschedule-review", scene: "discussion", titleKo: "고객과 설계 검토 일정 다시 잡기", partner: "Mr. Tan", persona: "a client from Malaysia, polite but busy",
    setupKo: "말레이시아 고객 Mr. Tan이 다음 주 목요일 설계 검토 회의에 참석할 수 없다고 합니다.", setup: "An online call with a client who cannot attend next Thursday's design review.",
    goalKo: "다른 날짜 제안, 참석자 확인, 일정 확정하기", goal: "Propose other dates, check who must attend, and confirm the new time.",
    opener: { en: "Hi Minsu, I'm afraid I can't make Thursday's design review. Could we find another time next week?", ko: "민수 씨, 죄송하지만 목요일 설계 검토에 참석이 어렵겠어요. 다음 주에 다른 시간을 잡을 수 있을까요?", hint: { en: "Of course. How about next Tuesday or Wednesday?", ko: "물론이죠. 다음 주 화요일이나 수요일은 어떠세요?" } },
  },
  {
    id: "late-data", scene: "trouble", titleKo: "데이터 전달이 늦어진 것 설명하기", partner: "Priya", persona: "an engineer at an equipment vendor in India who is waiting for data",
    setupKo: "벤더 Priya가 어제 받기로 한 열수지 데이터를 아직 못 받았다고 합니다. 현장 측정이 늦어졌습니다.", setup: "A call with a vendor who expected heat-balance data yesterday; the site measurement was delayed.",
    goalKo: "사과, 늦어진 이유 설명, 새 전달 일정 약속", goal: "Apologize, explain the reason, and promise a new date.",
    opener: { en: "Hi Minsu, we were expecting the heat balance data yesterday. Is everything okay?", ko: "민수 씨, 어제 열수지 데이터를 받기로 했는데요. 무슨 일 있으신가요?", hint: { en: "I'm really sorry for the delay. The site measurement took longer than expected.", ko: "늦어져서 정말 죄송해요. 현장 측정이 예상보다 오래 걸렸어요." } },
  },
  {
    id: "quote-negotiation", scene: "negotiation", titleKo: "견적 가격 협상하기", partner: "Daniel", persona: "a sales engineer at a European technology licensor",
    setupKo: "기술 라이선서 Daniel이 보낸 엔지니어링 서비스 견적이 예산보다 15% 높습니다.", setup: "A call about a quotation for engineering services that is 15% above Minsu's budget.",
    goalKo: "예산보다 높다고 말하기, 조건 제시, 절충안 찾기", goal: "Say the price is above budget, offer conditions, and find a compromise.",
    opener: { en: "So, have you had a chance to look at our quotation?", ko: "그럼, 저희 견적서는 검토해 보셨나요?", hint: { en: "Yes, thank you. To be honest, it's about 15% above our budget.", ko: "네, 감사해요. 솔직히 저희 예산보다 15% 정도 높아요." } },
  },
  {
    id: "presentation-qa", scene: "presentation", titleKo: "발표 후 질문에 답하기", partner: "Linh", persona: "a curious process engineer from the Vietnam team",
    setupKo: "파일럿 시험 결과 발표를 마쳤습니다. Linh가 증기 사용량에 대해 질문합니다.", setup: "Right after Minsu presented the pilot test results online.",
    goalKo: "질문 확인, 이유 설명, 모르는 부분은 나중에 답하겠다고 하기", goal: "Check the question, explain the reason, and offer to follow up on what he doesn't know.",
    opener: { en: "Thanks for the presentation, Minsu. Could you explain why the steam consumption was higher than expected?", ko: "발표 잘 들었어요. 증기 사용량이 예상보다 높았던 이유를 설명해 주실 수 있을까요?", hint: { en: "Good question. The feed was wetter than expected, so we needed more steam.", ko: "좋은 질문이에요. 원료가 예상보다 젖어 있어서 증기가 더 필요했어요." } },
  },
  {
    id: "promotion-news", scene: "feelings", titleKo: "동료의 승진 축하하기", partner: "Budi", persona: "a cheerful colleague from Jakarta",
    setupKo: "동료 Budi가 화상통화 중에 승진 소식을 전합니다.", setup: "An informal video call with a colleague who has big news.",
    goalKo: "축하, 소감 묻기, 축하 자리 제안하기", goal: "Congratulate him, ask how he feels, and suggest celebrating.",
    opener: { en: "Hey Minsu, guess what? I just got promoted to project manager!", ko: "민수 씨, 있잖아요! 저 프로젝트 매니저로 승진했어요!", hint: { en: "Congratulations, Budi! That's great news. You really deserve it.", ko: "축하해요, 부디 씨! 정말 좋은 소식이네요. 충분히 그럴 자격 있어요." } },
  },
  {
    id: "day-off", scene: "office", titleKo: "팀장님께 휴가 말씀드리기", partner: "Ms. Kim", persona: "Minsu's team manager, kind but careful about deadlines",
    setupKo: "다음 주 금요일에 휴가를 쓰고 싶습니다. 그 주에 고객 보고서 마감이 있습니다.", setup: "Minsu stops by his manager's desk; a client report is due the same week.",
    goalKo: "휴가 요청, 보고서 일정과 인수인계 계획 설명", goal: "Ask for next Friday off and explain the plan for the report and handover.",
    opener: { en: "Hi Minsu, you wanted to talk to me about something?", ko: "민수 씨, 저한테 할 얘기 있다고 했죠?", hint: { en: "Yes. Would it be okay if I took next Friday off?", ko: "네. 다음 주 금요일에 하루 쉬어도 될까요?" } },
  },
  {
    id: "coworker-help", scene: "office", titleKo: "동료 부탁 정중하게 미루기", partner: "Jisoo", persona: "a coworker who is stuck on a spreadsheet",
    setupKo: "동료 지수 씨가 엑셀 작업을 도와 달라고 합니다. 오늘은 마감 때문에 바쁘지만 내일 오전엔 시간이 있습니다.", setup: "At the office; Minsu is busy with a deadline today but free tomorrow morning.",
    goalKo: "지금은 어렵다고 말하고 다른 시간 제안하기", goal: "Say no politely for now and offer another time.",
    opener: { en: "Minsu, do you have a minute? I'm stuck on this spreadsheet.", ko: "민수 씨, 잠깐 시간 있어요? 이 엑셀에서 막혔어요.", hint: { en: "Sorry, I'm a bit busy right now. Could I help you tomorrow morning?", ko: "미안해요, 지금은 좀 바빠요. 내일 오전에 도와줘도 될까요?" } },
  },
  {
    id: "airport-pickup", scene: "visit", titleKo: "공항에서 손님 마중하기", partner: "Daniel", persona: "a visiting engineer from Europe who just landed in Seoul",
    setupKo: "인천공항 입국장에서 처음 직접 만나는 Daniel을 마중합니다. 차는 주차장에 있습니다.", setup: "The arrivals hall at Incheon Airport; Minsu's car is in the parking lot.",
    goalKo: "인사, 비행 안부, 호텔까지 이동 안내", goal: "Greet him, ask about the flight, and explain the plan to get to the hotel.",
    opener: { en: "Minsu! Great to finally meet you in person. Sorry, the flight was a bit late.", ko: "민수 씨! 드디어 직접 만나네요. 비행기가 좀 늦어서 미안해요.", hint: { en: "No problem at all. Welcome to Korea! How was your flight?", ko: "전혀 괜찮아요. 한국에 오신 걸 환영해요! 비행은 어땠어요?" } },
  },
  {
    id: "call-back", scene: "phone", titleKo: "부재중 전화 다시 걸기", partner: "Sari", persona: "a colleague in Jakarta who called earlier",
    setupKo: "회의 중이라 Sari의 전화를 못 받았습니다. 지금 다시 전화했습니다.", setup: "Minsu calls back after missing a call during a meeting.",
    goalKo: "못 받은 이유, 용건 확인, 다음 단계 합의", goal: "Say why he missed the call, find out what she needs, and agree on next steps.",
    opener: { en: "Hi Minsu, thanks for calling back. I wanted to check the shipping schedule with you.", ko: "민수 씨, 다시 전화 줘서 고마워요. 선적 일정을 확인하고 싶었어요.", hint: { en: "Sorry I missed your call. I was in a meeting. Sure, what would you like to check?", ko: "전화 못 받아서 미안해요. 회의 중이었어요. 네, 뭘 확인하고 싶으세요?" } },
  },
  {
    id: "dinner-menu", scene: "meal", titleKo: "손님과 저녁 메뉴 고르기", partner: "Mr. Tan", persona: "a client visiting Seoul who has never had Korean food and doesn't eat very spicy food",
    setupKo: "서울을 방문한 Mr. Tan과 한식당에 왔습니다. 메뉴를 같이 고릅니다.", setup: "A Korean restaurant in Seoul with a visiting client.",
    goalKo: "메뉴 추천, 매운 정도 설명, 주문 도와주기", goal: "Recommend dishes, explain how spicy they are, and help order.",
    opener: { en: "Everything looks delicious, but I'm not sure what to order. What would you recommend?", ko: "다 맛있어 보이는데 뭘 시켜야 할지 모르겠네요. 뭘 추천하세요?", hint: { en: "I'd recommend the bulgogi. It's sweet and not spicy at all.", ko: "불고기를 추천해요. 달고 전혀 맵지 않아요." } },
  },
  {
    id: "call-trouble", scene: "online", titleKo: "화상회의 중 연결이 끊길 때", partner: "Budi", persona: "a process engineer on the Jakarta team, patient and friendly",
    setupKo: "자카르타 팀과 주간 화상회의 중, 민수 씨 화면이 멈추고 소리가 끊깁니다.", setup: "The weekly online meeting with the Jakarta team; Minsu's video froze and the audio is breaking up.",
    goalKo: "연결 문제 알리기, 다시 말해 달라고 하기, 해결 방법 제안하고 회의 이어 가기", goal: "Say there is a connection problem, ask Budi to repeat, suggest a fix (camera off, call back) and continue.",
    opener: { en: "Minsu, are you still there? Your video froze, and I only heard half of what you said.", ko: "민수 씨, 아직 계세요? 화면이 멈췄고 말씀하신 것 중 절반만 들렸어요.", hint: { en: "Sorry, my connection is a bit unstable. Can you hear me now?", ko: "죄송해요, 연결이 좀 불안정하네요. 지금은 들리세요?" } },
  },
  {
    id: "friday-plans", scene: "smalltalk", titleKo: "금요일 오후 주말 계획 이야기", partner: "Linh", persona: "a cheerful project engineer in Vietnam who loves travelling and food",
    setupKo: "금요일 오후 회의가 일찍 끝나서 베트남의 Linh과 잠깐 이야기합니다.", setup: "A Friday afternoon call that ended early, chatting with Linh.",
    goalKo: "주말 계획 말하기, 상대 계획 묻고 반응하기, 좋은 주말 인사로 마무리", goal: "Talk about weekend plans, ask about Linh's and react, and end with a friendly goodbye.",
    opener: { en: "Finally Friday! Do you have any plans for the weekend?", ko: "드디어 금요일이네요! 주말에 무슨 계획 있어요?", hint: { en: "Not really. I'm just going to relax at home. How about you?", ko: "딱히 없어요. 그냥 집에서 쉬려고요. 당신은요?" } },
  },
  {
    id: "hobby-chat", scene: "smalltalk", titleKo: "새 동료와 취미 이야기", partner: "Arif", persona: "a new engineer who just joined the Jakarta team and plays futsal",
    setupKo: "자카르타 팀에 새로 온 Arif와 점심을 먹으며 서로 알아 갑니다.", setup: "Lunch with Arif, who just joined the Jakarta team.",
    goalKo: "취미 소개, 얼마나 자주 하는지 말하기, 상대 취미에 질문하기", goal: "Talk about hobbies, say how often you do them, and ask about Arif's.",
    opener: { en: "So, what do you like to do in your free time?", ko: "그래서, 쉬는 시간엔 뭐 하는 걸 좋아해요?", hint: { en: "I like hiking and cooking. I go hiking almost every weekend. What about you?", ko: "등산이랑 요리를 좋아해요. 거의 주말마다 등산 가요. 당신은요?" } },
  },
  {
    id: "friend-bad-day", scene: "feelings", titleKo: "힘든 하루를 보낸 친구 위로하기", partner: "Emma", persona: "Minsu's friend from Canada who works in marketing in Seoul",
    setupKo: "친구 Emma가 저녁에 메시지를 보냈습니다. 오늘 중요한 발표를 망쳤다고 합니다.", setup: "An evening chat with a friend whose important presentation went badly today.",
    goalKo: "공감하기, 무슨 일이었는지 묻기, 격려하고 기분 전환할 일 제안하기", goal: "Show sympathy, ask what happened, encourage her, and suggest something to cheer her up.",
    opener: { en: "Ugh, today was the worst. My presentation went really badly.", ko: "으, 오늘 최악이었어. 발표를 완전 망쳤어.", hint: { en: "I'm sorry to hear that. What happened?", ko: "안됐다. 무슨 일 있었어?" } },
  },
  {
    id: "new-colleague", scene: "office", titleKo: "첫 출근한 동료 안내하기", partner: "Dewi", persona: "a new engineer from Jakarta on her first day at the Ulsan office, a little nervous",
    setupKo: "자카르타에서 온 Dewi가 오늘 울산 사무실에 처음 출근했습니다. 민수 씨 옆자리입니다.", setup: "Dewi's first day at the Ulsan office; she sits next to Minsu.",
    goalKo: "환영 인사, 사무실 안내(식당·회의실), 도움 제안하기", goal: "Welcome her, show her around (cafeteria, meeting rooms) and offer help.",
    opener: { en: "Hi, I'm Dewi. It's my first day here. Nice to meet you!", ko: "안녕하세요, 데위예요. 오늘 첫 출근이에요. 만나서 반가워요!", hint: { en: "Nice to meet you, Dewi! I'm Minsu. Welcome to the team.", ko: "반가워요, 데위 씨! 저는 민수예요. 팀에 온 걸 환영해요." } },
  },
  {
    id: "taxi-ride", scene: "daily", titleKo: "택시 기사와 목적지·길 이야기", partner: "Driver", persona: "a chatty taxi driver in Jakarta",
    setupKo: "자카르타 출장 중, 호텔 앞에서 택시를 타고 공장으로 갑니다. 차가 막히는 시간입니다.", setup: "A taxi from the hotel to the plant in Jakarta during rush hour.",
    goalKo: "목적지 말하기, 걸리는 시간 묻기, 급하다고 부탁하기, 요금 내기", goal: "Give the destination, ask how long it takes, say you are in a hurry, and pay.",
    opener: { en: "Good morning! Where are you heading?", ko: "안녕하세요! 어디로 가세요?", hint: { en: "To the Cilegon plant, please. How long will it take?", ko: "실레곤 공장으로 가 주세요. 얼마나 걸릴까요?" } },
  },
  {
    id: "site-alarm", scene: "trouble", titleKo: "현장에서 설비 알람이 울릴 때", partner: "Budi", persona: "a shift engineer at the Jakarta plant, worried but competent",
    setupKo: "건조기 출구 온도 알람이 울렸다고 현장의 Budi에게서 전화가 왔습니다.", setup: "A phone call from the plant: the dryer outlet temperature alarm just went off.",
    goalKo: "침착하게 상황 묻기, 확인할 것 지시하기, 다음 조치와 연락 약속하기", goal: "Stay calm, ask for the readings, tell Budi what to check, and agree on next steps.",
    opener: { en: "Minsu, the dryer outlet temperature alarm just went off. What should we do?", ko: "민수 씨, 건조기 출구 온도 알람이 방금 울렸어요. 어떻게 할까요?", hint: { en: "Okay, let's stay calm. What's the outlet temperature right now?", ko: "알겠어요, 침착하게 해요. 지금 출구 온도가 몇 도예요?" } },
  },
  {
    id: "plant-tour", scene: "visit", titleKo: "고객에게 파일럿 플랜트 안내하기", partner: "Mr. Tan", persona: "a client from Malaysia visiting the Ulsan pilot plant, curious and technical",
    setupKo: "울산 파일럿 플랜트를 방문한 고객 Mr. Tan을 안내합니다. 건조기 앞에 왔습니다.", setup: "Showing a visiting client around the pilot plant in Ulsan; they are standing in front of the dryer.",
    goalKo: "설비 소개, 시험 목적 설명, 질문에 답하고 안전 안내하기", goal: "Introduce the equipment, explain what it is tested for, answer questions and give a safety reminder.",
    opener: { en: "So this is the pilot plant. What exactly are we looking at here?", ko: "여기가 파일럿 플랜트군요. 지금 보고 있는 게 정확히 뭐죠?", hint: { en: "This is our pilot dryer. We use it to test new feeds before we scale up.", ko: "이건 저희 파일럿 건조기예요. 스케일업 전에 새 원료를 시험하는 데 써요." } },
  },
];

export const TALK_TOPIC_BY_ID: Record<string, TalkTopic> = Object.fromEntries(TALK_TOPICS.map((t) => [t.id, t]));

/** Learner lines per conversation (the partner may end it a little earlier). */
export const TALK_TURNS = 6;

export interface TalkNote {
  text: string;
  fix: string;
  whyKo: string;
  /** Found by the built-in rules (kept even when Claude did not list it). */
  rule?: boolean;
}

export interface TalkFeedback {
  score: number;
  notes: TalkNote[];
  /** The line with only its errors fixed (the line itself when nothing is wrong). */
  corrected: string;
  /** A clearly more natural way to say it, when there is one. */
  natural?: string;
}

export interface TalkLine {
  who: "partner" | "me";
  en: string;
  ko?: string;
  feedback?: TalkFeedback;
  /** For a partner line: one natural thing Minsu could say next (shown on request). */
  hint?: { en: string; ko?: string };
}

export interface TalkReply {
  feedback: TalkFeedback;
  reply: { en: string; ko?: string };
  /** One natural thing Minsu could say next (for a learner who gets stuck). */
  hint?: { en: string; ko?: string };
  done: boolean;
}

export const talkReplySchema = z.object({
  feedback: z.object({
    score: z.number().min(0).max(100),
    notes: z.array(z.object({ text: z.string(), fix: z.string(), whyKo: z.string() })).max(6),
    corrected: z.string(),
    natural: z.string().optional(),
  }),
  reply: z.object({ en: z.string().min(1), ko: z.string().optional() }),
  hint: z.object({ en: z.string(), ko: z.string().optional() }).optional(),
  done: z.boolean().optional(),
});

/** The built-in grammar rules on one line: instant notes. */
export function localTalkNotes(line: string): TalkNote[] {
  const w = words(tokenize(line));
  return runRules(w)
    .filter((r) => r.severity !== "minor")
    .map((r) => ({ text: w.slice(r.from, Math.max(r.to, r.from)).map((t) => t.raw).join(" "), fix: r.replacement, whyKo: r.messageKo, rule: true }));
}

export function buildTalkPrompt(topic: TalkTopic, lines: Pick<TalkLine, "who" | "en">[], turn: number): string {
  const history = lines.map((l) => `${l.who === "me" ? "Minsu" : topic.partner}: ${l.en}`).join("\n");
  const last = [...lines].reverse().find((l) => l.who === "me")?.en ?? "";
  const pre = localTalkNotes(last);
  const preText = pre.length ? pre.map((n) => `"${n.text || "(missing)"}" → "${n.fix}"`).join("; ") : "none";
  const canEnd = turn >= TALK_TURNS - 2;
  return `You are ${topic.partner}, ${topic.persona}, in a spoken-English practice conversation with Minsu, a Korean process engineer (about B1).
Scene: ${topic.setup} Minsu's goal: ${topic.goal}

Conversation so far:
${history}

Minsu's latest line (grade exactly this text): """${last}"""
Automatic pre-check (may be wrong — verify): ${preText}

Do two things, briefly (Minsu is waiting):
1) Grade Minsu's latest line as spoken English in this moment. List only real errors (at most 3): the exact wrong text, the fix, and ONE short polite Korean sentence (~입니다) saying why. Contractions, casual openers and short replies are fine. "corrected" = his line with only the errors fixed ("" if none). "natural" = how a native speaker would most commonly say it, only if clearly better ("" otherwise). "score": 100 with no errors; about -10 for a small slip, -30 for a real grammar error, -45 if the meaning is wrong or unclear.
2) Reply as ${topic.partner} with 1–2 short, natural sentences in easy everyday English (common words, no idioms or slang, at most 15 words each) that move the conversation toward the goal, usually ending with a question so Minsu speaks again. "ko" = natural Korean translation of your reply. ${canEnd ? 'Set "done": true when the conversation has reached a natural end; then close it politely without a question.' : 'Keep the conversation going ("done": false).'}
3) "hint": one short, natural thing Minsu could say next (easy English: common words, one short sentence), with its Korean meaning ("" when done).

Reply with ONLY this JSON:
{"feedback":{"score":0-100,"notes":[{"text":"…","fix":"…","whyKo":"…"}],"corrected":"","natural":""},"reply":{"en":"…","ko":"…"},"hint":{"en":"…","ko":"…"},"done":false}`;
}

/**
 * Validate Claude's reply. Major rule findings Claude did not cover are kept
 * (and fixed in the correction), so a lenient reply cannot pass "is not satisfy".
 */
export function parseTalkReply(raw: unknown, line: string): TalkReply {
  const p = talkReplySchema.parse(raw);
  const notes: TalkNote[] = p.feedback.notes.filter((n) => n.fix !== n.text).slice(0, 3);
  let corrected = p.feedback.corrected.trim() || line;
  let score = Math.round(p.feedback.score);
  for (const r of localTalkNotes(line)) {
    const covered = notes.some((n) => n.text && r.text && (n.text.toLowerCase().includes(r.text.toLowerCase()) || r.text.toLowerCase().includes(n.text.toLowerCase())));
    if (covered) continue;
    notes.push(r);
    if (r.text && corrected.includes(r.text)) corrected = corrected.replace(r.text, r.fix).replace(/\s{2,}/g, " ");
    score = Math.min(score, 70);
  }
  if (!notes.length) corrected = line;
  const natural = p.feedback.natural?.trim();
  return {
    feedback: { score: Math.max(0, Math.min(100, score)), notes, corrected, natural: natural && natural !== line.trim() && natural !== corrected ? natural : undefined },
    reply: { en: p.reply.en.trim(), ko: p.reply.ko?.trim() || undefined },
    hint: p.hint?.en.trim() ? { en: p.hint.en.trim(), ko: p.hint.ko?.trim() || undefined } : undefined,
    done: !!p.done,
  };
}

/** Summary of a finished talk. */
export function talkSummary(lines: TalkLine[]): { turns: number; average: number; clean: number; fixes: { said: string; better: string; notes: TalkNote[] }[] } {
  const mine = lines.filter((l) => l.who === "me" && l.feedback);
  const avg = mine.length ? Math.round(mine.reduce((s, l) => s + l.feedback!.score, 0) / mine.length) : 0;
  return {
    turns: mine.length,
    average: avg,
    clean: mine.filter((l) => l.feedback!.score >= 85 && !l.feedback!.notes.length).length,
    fixes: mine.filter((l) => l.feedback!.notes.length || l.feedback!.natural).map((l) => ({ said: l.en, better: l.feedback!.natural || l.feedback!.corrected, notes: l.feedback!.notes })),
  };
}
