import type { DialogueTurn } from "../../core/types";

/** Conversation context for the existing phrases questions (id → lines spoken just before the learner's turn). */
export const OVERLAY_PHRASES: Record<string, DialogueTurn[]> = {
  "ph-cond1-if-decide-now": [
    { speaker: "Budi", en: "Should we pick the dryer type in this meeting, or wait?", ko: "건조기 타입을 이번 회의에서 고를까요, 아니면 기다릴까요?" },
  ],

  /* progressive */
  "ph-progressive-still-waiting-data": [
    { speaker: "Mr. Tan", en: "So, what did the lab results show?", ko: "그래서 실험실 결과는 어떻게 나왔나요?" },
  ],
  "ph-progressive-pump-running": [
    { speaker: "Linh", en: "Minsu, how's the pump now? Any problems?", ko: "민수 씨, 펌프는 지금 어때요? 문제 있나요?" },
  ],
  "ph-progressive-team-reviewing": [
    { speaker: "Mr. Tan", en: "When can we get the comments on the P&ID?", ko: "P&ID 코멘트는 언제 받을 수 있을까요?" },
  ],

  /* be + adjective */
  "ph-beadj-schedule-delayed": [
    { speaker: "Sari", en: "Minsu, how is the design work going? Are we on track?", ko: "민수 씨, 설계 작업은 어떻게 되어 가요? 예정대로 가고 있나요?" },
  ],
  "ph-beadj-pump-ready": [
    { speaker: "Budi", en: "Next item, the new pump. What's the status?", ko: "다음 항목은 새 펌프입니다. 상태가 어떤가요?" },
  ],

  /* subject–verb agreement */
  "ph-agreement-client-wants": [
    { speaker: "Budi", en: "Before we compare the options, what is the client's main priority?", ko: "옵션을 비교하기 전에, 고객이 가장 중요하게 생각하는 게 뭔가요?" },
  ],
  "ph-agreement-valve-doesnt-open": [
    { speaker: "Linh", en: "Minsu, what's wrong with this valve?", ko: "민수 씨, 이 밸브에 무슨 문제가 있나요?" },
  ],

  /* verb + object */
  "ph-verbobject-check-feed-rate": [
    { speaker: "Linh", en: "Minsu, I'm in the control room now. Is there anything you need from me?", ko: "민수 씨, 저 지금 제어실에 있어요. 제가 해 드릴 일이 있나요?" },
  ],
  "ph-verbobject-contact-vendor": [
    { speaker: "Sari", en: "The delivery date is still not clear. Who can follow up on this?", ko: "납기가 아직 확실하지 않아요. 누가 이 건을 챙겨 줄 수 있나요?" },
  ],
  "ph-verbobject-discuss-issue": [
    { speaker: "Budi", en: "We only have five minutes left. What do we do with the last item?", ko: "5분밖에 안 남았어요. 마지막 안건은 어떻게 할까요?" },
  ],

  /* verb + preposition */
  "ph-verbprep-reply-to": [
    { speaker: "Budi", en: "Minsu, the client sent us some questions this morning. Is it urgent?", ko: "민수 씨, 고객이 오늘 아침에 질문을 몇 개 보냈어요. 급한 건가요?" },
  ],
  "ph-verbprep-depends-on": [
    { speaker: "Mr. Tan", en: "Can you tell me the dryer size now?", ko: "지금 건조기 크기를 알려 줄 수 있나요?" },
  ],
  "ph-verbprep-focus-on": [
    { speaker: "Sari", en: "We have eight items on the agenda today. Where should we start?", ko: "오늘 안건이 여덟 개나 있어요. 어디서부터 시작할까요?" },
  ],

  /* too + adjective */
  "ph-tooadj-still-too-early": [
    { speaker: "Daniel", en: "I think we can fix the dryer specification today. What do you think?", ko: "오늘 건조기 사양을 확정할 수 있을 것 같아요. 어떻게 생각하세요?" },
  ],
  "ph-tooadj-too-early-select": [
    { speaker: "Budi", en: "We already have some pilot results. Can we close the dryer decision this week?", ko: "파일럿 결과가 일부 나왔으니, 이번 주에 건조기 건을 결정할 수 있을까요?" },
  ],
  "ph-tooadj-feed-too-wet": [
    { speaker: "Sari", en: "The dryer has had trouble since the rainy season started. What's the cause?", ko: "우기가 시작된 뒤로 건조기에 계속 문제가 있어요. 원인이 뭔가요?" },
  ],

  /* word order */
  "ph-wordorder-send-again": [
    { speaker: "Priya", en: "Did you get the file I sent yesterday?", ko: "어제 보내 드린 파일 받으셨어요?" },
  ],
  "ph-wordorder-check-first": [
    { speaker: "Budi", en: "So many numbers look strange. What's our next step?", ko: "이상한 수치가 너무 많네요. 다음 단계는 뭘까요?" },
  ],

  /* articles */
  "ph-articles-new-pump": [
    { speaker: "Mr. Tan", en: "So, can we keep using the existing pump?", ko: "그럼 기존 펌프를 계속 쓸 수 있나요?" },
  ],
  "ph-articles-latest-revision": [
    { speaker: "Linh", en: "We used the file from March for our calculation.", ko: "저희는 3월에 받은 파일로 계산했어요." },
  ],

  /* countability */
  "ph-countability-more-information": [
    { speaker: "Budi", en: "So, which vendor quote looks better to you?", ko: "그래서 어느 벤더 견적이 더 나아 보여요?" },
  ],
  "ph-countability-equipment-arrived": [
    { speaker: "Mr. Tan", en: "How are the deliveries going?", ko: "반입은 어떻게 진행되고 있나요?" },
  ],

  /* future plans */
  "ph-futureplan-send-schedule": [
    { speaker: "Mr. Tan", en: "Okay, I think that's all for today. When can we see the updated dates?", ko: "좋아요, 오늘은 여기까지인 것 같네요. 바뀐 날짜는 언제 볼 수 있을까요?" },
  ],
  "ph-futureplan-planning-pilot-test": [
    { speaker: "Mr. Tan", en: "Do you have a date for the next trial?", ko: "다음 시험 날짜는 정해졌나요?" },
  ],

  /* modals: possibility */
  "ph-modalposs-might-have-to-change": [
    { speaker: "Daniel", en: "Can I send this package to our team as the final version?", ko: "이 패키지를 최종본으로 저희 팀에 보내도 될까요?" },
  ],
  "ph-modalposs-delivery-delayed": [
    { speaker: "Mr. Tan", en: "Is everything still on track for the end of the month?", ko: "월말 일정은 여전히 문제없나요?" },
  ],
  "ph-modalposs-sensor-damaged": [
    { speaker: "Budi", en: "This temperature reading looks strange. Any idea why?", ko: "이 온도 값이 좀 이상해요. 왜 그런지 짐작 가는 게 있나요?" },
  ],

  /* modals: necessity / advice */
  "ph-modalnec-dont-have-to": [
    { speaker: "Mr. Tan", en: "So what do these test results mean for us?", ko: "그럼 이 시험 결과가 우리한테 어떤 의미인가요?" },
  ],
  "ph-modalnec-must-not-open": [
    { speaker: "Linh", en: "What about this valve here? Can I use it anytime?", ko: "여기 이 밸브는요? 아무 때나 써도 되나요?" },
  ],
  "ph-modalnec-should-have-checked": [
    { speaker: "Sari", en: "The root cause is clear now. Looking back, what could we do better?", ko: "이제 근본 원인은 분명해졌어요. 돌아보면, 우리가 뭘 더 잘할 수 있었을까요?" },
  ],

  /* present perfect */
  "ph-perfect-havent-decided": [
    { speaker: "Mr. Tan", en: "How big will the dryer be?", ko: "건조기는 얼마나 크게 가나요?" },
  ],
  "ph-perfect-vendor-just-sent": [
    { speaker: "Budi", en: "Do we have any news from the vendor about the price?", ko: "가격에 대해 벤더한테서 소식 있나요?" },
  ],
  "ph-perfect-been-running": [
    { speaker: "Mr. Tan", en: "How is the long-term run going?", ko: "장기 운전은 어떻게 되어 가고 있나요?" },
  ],

  /* gerunds after prepositions */
  "ph-gerund-before-completing": [
    { speaker: "Daniel", en: "What do you still need from us?", ko: "저희한테서 아직 필요한 게 뭔가요?" },
  ],
  "ph-gerund-after-reviewing": [
    { speaker: "Budi", en: "When will we get your comments?", ko: "코멘트는 언제 받을 수 있을까요?" },
  ],
  "ph-gerund-by-increasing": [
    { speaker: "Sari", en: "We need more throughput from the dryer. Any ideas?", ko: "건조기 처리량을 더 늘려야 해요. 좋은 생각 있나요?" },
  ],

  /* if vs when */
  "ph-ifwhen-when-receive-data": [
    { speaker: "Budi", en: "The vendor confirmed they'll send everything next week. So what's our plan?", ko: "벤더가 다음 주에 다 보내 준다고 확인해 줬어요. 그럼 우리 계획은 뭐예요?" },
  ],
  "ph-ifwhen-if-pump-stops": [
    { speaker: "Linh", en: "Okay, I understand the normal steps. What about emergencies?", ko: "네, 정상 절차는 이해했어요. 비상 상황은요?" },
  ],

  /* collocations */
  "ph-collocation-received-data": [
    { speaker: "Mr. Tan", en: "Any news from the lab?", ko: "실험실에서 소식 있나요?" },
  ],
  "ph-collocation-run-test": [
    { speaker: "Sari", en: "What's the plan for tomorrow?", ko: "내일 계획은 뭐예요?" },
  ],
  "ph-collocation-meet-requirements": [
    { speaker: "Budi", en: "You've gone through the vendor's offer. So, what's your conclusion?", ko: "벤더 제안 내용을 다 보셨죠. 결론이 뭔가요?" },
  ],

  /* time clauses */
  "ph-timeclause-as-soon-as": [
    { speaker: "Mr. Tan", en: "When can you start the line again?", ko: "라인은 언제 다시 가동할 수 있나요?" },
  ],
  "ph-timeclause-not-until": [
    { speaker: "Sari", en: "Our piping team is waiting for the layout. When can they have it?", ko: "저희 배관팀이 레이아웃을 기다리고 있어요. 언제 받을 수 있을까요?" },
  ],

  /* conditionals */
  "ph-cond1-data-by-friday": [
    { speaker: "Mr. Tan", en: "When can we see the mass balance?", ko: "물질수지는 언제 볼 수 있을까요?" },
  ],
  "ph-cond1-unless": [
    { speaker: "Sari", en: "So, is the test schedule fixed now?", ko: "그럼 이제 시험 일정은 확정된 건가요?" },
  ],
  "ph-cond2-if-decided-now": [
    { speaker: "Daniel", en: "Can't we just pick one option today and move on?", ko: "그냥 오늘 하나 골라서 진행하면 안 될까요?" },
  ],
  "ph-cond2-bigger-budget": [
    { speaker: "Budi", en: "I know our budget is tight. But what's your ideal setup?", ko: "예산이 빠듯한 건 알아요. 그래도 이상적인 구성은 뭐예요?" },
  ],
  "ph-cond2-if-i-were-you": [
    { speaker: "Budi", en: "The outlet moisture is still high, and I don't know where to start. Any advice?", ko: "출구 수분이 아직도 높은데, 어디서부터 봐야 할지 모르겠어요. 조언 좀 해 줄래요?" },
  ],
  "ph-cond3-had-decided-earlier": [
    { speaker: "Sari", en: "The equipment order is behind schedule now. What's the lesson here?", ko: "장비 발주가 지금 일정보다 밀려 있어요. 여기서 얻을 교훈은 뭘까요?" },
  ],
  "ph-cond3-analyzed-earlier": [
    { speaker: "Budi", en: "We only saw the problem after the pilot test. How did we miss it?", ko: "파일럿 시험이 끝난 뒤에야 문제를 알았어요. 어떻게 놓친 걸까요?" },
  ],
  "ph-cond3-had-known": [
    { speaker: "Daniel", en: "This pump material doesn't suit the chlorine in the feed. Why did we go with it?", ko: "이 펌프 재질은 원료의 염소에 맞지 않아요. 왜 이걸로 했나요?" },
  ],

  /* cause and result */
  "ph-cause-because-of": [
    { speaker: "Mr. Tan", en: "Any news on the start-up work? Are we still on schedule?", ko: "시운전 작업은 어떻게 되고 있나요? 아직 일정대로인가요?" },
  ],
  "ph-cause-so-pellets": [
    { speaker: "Mr. Tan", en: "We had a quality problem with the last batch. What happened?", ko: "지난 배치에서 품질 문제가 있었어요. 무슨 일이었나요?" },
  ],

  /* purpose */
  "ph-purpose-to-reduce": [
    { speaker: "Sari", en: "Okay, Minsu, please tell us about your improvement idea.", ko: "좋아요, 민수 씨, 개선 아이디어를 설명해 주세요." },
  ],
  "ph-purpose-go-to-site": [
    { speaker: "Linh", en: "That number on the DCS screen looks strange. What do you want to do?", ko: "DCS 화면의 저 값이 이상해 보여요. 어떻게 하실 거예요?" },
  ],

  /* polite requests */
  "ph-request-could-you-send": [
    { speaker: "Mr. Lim (vendor)", en: "Hello, Minsu. How can I help you today?", ko: "안녕하세요, 민수 씨. 오늘 무엇을 도와드릴까요?" },
  ],
  "ph-request-would-it-be-possible": [
    { speaker: "Mr. Tan", en: "So, is everything ready for our review this week?", ko: "그럼 이번 주 검토 준비는 다 됐나요?" },
  ],
  "ph-request-would-you-mind": [
    { speaker: "Ms. Nguyen", en: "Hi Minsu, sorry, we're very busy this week. What do you need from us?", ko: "안녕하세요 민수 씨, 이번 주에 저희가 좀 바빠서 죄송해요. 어떤 게 필요하세요?" },
  ],

  /* clarifying */
  "ph-clarify-do-you-mean": [
    { speaker: "Mr. Tan", en: "I'm worried about the temperature. It was too high yesterday.", ko: "온도가 걱정돼요. 어제 너무 높았어요." },
  ],
  "ph-clarify-what-means": [
    { speaker: "Mike (US engineer)", en: "Let's put this on the PCN list.", ko: "이건 PCN 리스트에 올립시다." },
  ],
  "ph-clarify-whether-includes": [
    { speaker: "Priya", en: "So, this is our final offer for the dryer package.", ko: "그럼 이게 건조기 패키지에 대한 저희 최종 제안입니다." },
  ],

  /* passive */
  "ph-passive-pump-replaced": [
    { speaker: "Linh", en: "I see high vibration on this pump in last week's log. Did anyone do anything about it?", ko: "지난주 일지에 이 펌프 진동이 높게 나와 있네요. 누가 조치를 했나요?" },
  ],
  "ph-passive-must-be-approved": [
    { speaker: "Sari", en: "Once the drawings are done, can we send them straight to the site?", ko: "도면이 끝나면 바로 현장으로 보내도 되나요?" },
  ],
  "ph-passive-could-have-been-avoided": [
    { speaker: "Linh", en: "Honestly, do you think we just had bad luck this time?", ko: "솔직히 이번엔 그냥 운이 나빴다고 생각하세요?" },
  ],

  /* comparison and degree */
  "ph-comparative-same-as": [
    { speaker: "Budi", en: "Any change in the numbers this week?", ko: "이번 주 수치에 변화가 있나요?" },
  ],
  "ph-comparative-twice-as-high": [
    { speaker: "Daniel", en: "What did your calculation show for the heat exchanger?", ko: "열교환기 계산 결과는 어떻게 나왔나요?" },
  ],
  "ph-degree-slightly-higher": [
    { speaker: "Budi", en: "Are all the dryer numbers okay today?", ko: "오늘 건조기 수치는 다 괜찮나요?" },
  ],
  "ph-degree-much-higher": [
    { speaker: "Mr. Tan", en: "Did anything surprise you in the pilot run?", ko: "파일럿 운전에서 놀라운 점이 있었나요?" },
  ],

  /* relative clauses */
  "ph-relative-pump-we-replaced": [
    { speaker: "Budi", en: "Which pump has the vibration problem?", ko: "어느 펌프에 진동 문제가 있나요?" },
  ],
  "ph-relative-which-means": [
    { speaker: "Sari", en: "What did the lab say about the EFB moisture?", ko: "실험실에서 EFB 수분에 대해 뭐라고 했나요?" },
  ],

  /* reported speech */
  "ph-reporting-vendor-told-us": [
    { speaker: "Sari", en: "You had a call with the vendor this morning, right? Any news?", ko: "오늘 아침에 벤더랑 통화했죠? 무슨 소식 있어요?" },
  ],
  "ph-reporting-asked-whether": [
    { speaker: "Budi", en: "How was the meeting with the client? Did they have any questions?", ko: "고객과의 회의는 어땠어요? 질문이 있었나요?" },
  ],

  /* polite disagreement */
  "ph-disagree-see-your-point": [
    { speaker: "Budi", en: "I think we should go with a bigger dryer. It gives us more margin.", ko: "더 큰 건조기로 가야 할 것 같아요. 그래야 여유가 더 생겨요." },
  ],
  "ph-disagree-afraid-not-agree": [
    { speaker: "Mr. Tan", en: "Let's cut the commissioning period in half. That should be possible, right?", ko: "시운전 기간을 절반으로 줄입시다. 가능하겠죠?" },
  ],
};
