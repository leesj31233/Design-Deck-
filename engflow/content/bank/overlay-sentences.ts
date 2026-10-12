import type { DialogueTurn } from "../../core/types";

/** Conversation context for the existing sentences questions (id → lines spoken just before the learner's turn). */
export const OVERLAY_SENTENCES: Record<string, DialogueTurn[]> = {
  /* ───────────── sentences-a ───────────── */
  "fs-process-equipment-spec": [
    { speaker: "Budi", en: "I think we should fix the equipment specs this week. Then the vendors can start their quotes.", ko: "이번 주에 장비 사양을 확정하는 게 좋겠어요. 그러면 벤더들이 견적을 시작할 수 있으니까요." },
  ],
  "fs-pilot-dryer-test-this-week": [
    { speaker: "Mr. Tan", en: "Good morning, Minsu. Any news from the pilot plant?", ko: "안녕하세요, 민수 씨. 파일럿 플랜트 쪽 소식 있나요?" },
  ],
  "fs-process-hmb-not-ready": [
    { speaker: "Mr. Tan", en: "Could you show us the HMB now? We'd like to check the steam numbers.", ko: "지금 HMB를 보여 주실 수 있나요? 스팀 수치를 확인하고 싶어서요." },
  ],
  "fs-pilot-feed-moisture-higher": [
    { speaker: "Budi", en: "Morning, Minsu. How is the EFB feed this morning?", ko: "좋은 아침이에요, 민수 씨. 오늘 아침 EFB 원료 상태는 어때요?" },
  ],
  "fs-process-update-pfd": [
    { speaker: "Sari", en: "So the design change is decided. What's next for us?", ko: "그럼 설계 변경은 확정됐네요. 우리는 다음에 뭘 하면 되죠?" },
  ],
  "fs-pilot-moisture-analysis-not-finished": [
    { speaker: "Budi", en: "Minsu, can we fix the dryer size at this meeting? We need it for the layout.", ko: "민수 씨, 이번 회의에서 건조기 크기를 정할 수 있을까요? 배치도 때문에 필요해서요." },
  ],
  "fs-process-sizing-as-soon-as-design-basis": [
    { speaker: "Mr. Tan", en: "What about the equipment sizing? When does that begin?", ko: "장비 사이징은요? 언제 시작하나요?" },
  ],
  "fs-pilot-check-moisture-before-increasing": [
    { speaker: "Budi", en: "The dryer looks stable now. Shall I put more feed in?", ko: "건조기가 이제 안정적이네요. 원료를 더 넣을까요?" },
  ],
  "fs-process-larger-dryer-rainy-season": [
    { speaker: "Mr. Tan", en: "What size of dryer do we need for our plant?", ko: "저희 공장에는 어느 정도 크기의 건조기가 필요한가요?" },
  ],
  "fs-pilot-washing-time-ash": [
    { speaker: "Daniel", en: "I see the washing conditions changed last week. Why was that?", ko: "지난주에 세척 조건이 바뀌었네요. 이유가 뭔가요?" },
  ],
  "fs-pilot-when-test-finishes": [
    { speaker: "Linh", en: "We need the dryer results for our report. When can we have them?", ko: "보고서에 건조기 결과가 필요해요. 언제 받을 수 있을까요?" },
  ],
  "fs-process-run-simulation-again": [
    { speaker: "Budi", en: "Bad news, Minsu. The new feed analysis came in, and the numbers are quite different.", ko: "안 좋은 소식이에요, 민수 씨. 새 원료 분석 결과가 나왔는데 수치가 꽤 달라요." },
  ],
  "fs-process-datasheets-after-approval": [
    { speaker: "Priya", en: "Minsu, when will we get the pump data from you? Our engineers are ready to start.", ko: "민수 씨, 펌프 자료는 언제 받을 수 있을까요? 저희 엔지니어들은 시작할 준비가 됐어요." },
  ],
  "fs-pilot-dryer-tested-last-month": [
    { speaker: "Priya", en: "Our dryer normally works well. What went wrong in your pilot test?", ko: "저희 건조기는 보통 잘 작동하는데요. 파일럿 시험에서 뭐가 문제였나요?" },
  ],
  "fs-process-design-margin-more-data": [
    { speaker: "Mr. Tan", en: "20% extra on the dryer seems like a lot. Why so much?", ko: "건조기에 20%를 더 두는 건 너무 많아 보여요. 왜 그렇게 많이 잡았나요?" },
  ],
  "fs-pilot-capacity-slightly-lower": [
    { speaker: "Priya", en: "So, how did our dryer do in the pilot test?", ko: "그래서 저희 건조기가 파일럿 시험에서 어땠나요?" },
  ],
  "fs-pilot-reduce-feed-rate-if-moisture": [
    { speaker: "Budi", en: "For next week's test, the feed might be quite wet. Do we have a backup plan?", ko: "다음 주 시험에서는 원료가 꽤 젖어 있을 수도 있어요. 대비책이 있나요?" },
  ],
  "fs-process-pressure-drop-pipe-size": [
    { speaker: "Sari", en: "You checked the steam line again with the new flow, right? What did you find?", ko: "새 유량으로 스팀 배관을 다시 검토하셨죠? 결과가 어땠어요?" },
  ],
  "fs-pilot-vendor-said-capacity": [
    { speaker: "Sari", en: "How did the meeting with the dryer vendor go? Do their numbers match ours?", ko: "건조기 벤더와의 회의는 어땠어요? 그쪽 수치가 우리 것과 맞나요?" },
  ],
  "fs-pilot-measured-moisture-more-often": [
    { speaker: "Budi", en: "The dryer capacity dropped suddenly last week. What can we learn from this?", ko: "지난주에 건조기 처리량이 갑자기 떨어졌잖아요. 여기서 뭘 배울 수 있을까요?" },
  ],
  "fs-process-simulation-based-on-three-runs": [
    { speaker: "Budi", en: "Good news! The new simulation says we can save steam. Let's update the design!", ko: "좋은 소식이에요! 새 시뮬레이션에서 스팀을 절약할 수 있다고 나왔어요. 설계를 바꿉시다!" },
  ],
  "fs-process-disagree-reduce-dryer-size": [
    { speaker: "Mr. Tan", en: "The CAPEX is too high for us. Can we make the dryer 20% smaller?", ko: "CAPEX가 저희에게는 너무 높아요. 건조기를 20% 더 작게 할 수 있을까요?" },
  ],

  /* ───────────── sentences-b ───────────── */
  "fs-meeting-waiting-lab-results": [
    { speaker: "Budi", en: "Minsu, how is the analysis of the EFB samples going?", ko: "민수 씨, EFB 샘플 분석은 어떻게 되고 있어요?" },
  ],
  "fs-meeting-request-updated-pid": [
    { speaker: "Sari", en: "Okay, that's the end of our list. Any last requests before we close?", ko: "좋아요, 안건은 여기까지예요. 마치기 전에 마지막으로 요청할 것 있나요?" },
  ],
  "fs-meeting-datasheet-delay": [
    { speaker: "Sari", en: "What's the status of the pump sizing? It looks behind schedule.", ko: "펌프 사이징은 어떻게 되고 있어요? 일정보다 늦어 보이네요." },
  ],
  "fs-meeting-pressure-test-start": [
    { speaker: "Budi", en: "Okay, what's next? When do we do the pressure test?", ko: "좋아요, 다음은 뭐죠? 압력 시험은 언제 하나요?" },
  ],
  "fs-meeting-equipment-list-update": [
    { speaker: "Sari", en: "Is the equipment list ready to go to the client?", ko: "장비 리스트는 고객에게 보낼 준비가 됐나요?" },
  ],
  "fs-meeting-delivery-date-risk": [
    { speaker: "Budi", en: "Do you see any risks for the schedule right now?", ko: "지금 일정에 리스크가 보이나요?" },
  ],
  "fs-meeting-dryer-delivery-report": [
    { speaker: "Sari", en: "Any news from the dryer vendor?", ko: "건조기 벤더 쪽 소식 있나요?" },
  ],
  "fs-collab-inlet-or-outlet": [
    { speaker: "Linh", en: "Minsu, the temperature is too high. We need to do something.", ko: "민수 씨, 온도가 너무 높아요. 뭔가 조치를 해야 해요." },
  ],
  "fs-collab-steam-header-pressure": [
    { speaker: "Linh", en: "That's all the utility data from our side. Do you need anything else?", ko: "저희 쪽 유틸리티 자료는 이게 전부예요. 더 필요한 게 있나요?" },
  ],
  "fs-collab-lab-results-mentioned": [
    { speaker: "Budi", en: "Okay, Minsu. Is there anything you need from our side?", ko: "좋아요, 민수 씨. 저희 쪽에서 필요한 거 있어요?" },
  ],
  "fs-collab-steam-limit-constraint": [
    { speaker: "Mr. Tan", en: "We'd like to process more EFB. Can the dryer handle more?", ko: "EFB를 더 많이 처리하고 싶어요. 건조기가 더 처리할 수 있을까요?" },
  ],
  "fs-collab-test-duration-disagree": [
    { speaker: "Sari", en: "To save time and money, I suggest a one-week performance test.", ko: "시간과 비용을 아끼려면 성능 시험을 1주일만 하는 게 좋겠어요." },
  ],
  "fs-collab-summarize-vendor-agreement": [
    { speaker: "Sari", en: "We're almost out of time. Minsu, can you wrap up what we decided?", ko: "시간이 거의 다 됐네요. 민수 씨, 결정한 내용을 정리해 주실래요?" },
  ],
  "fs-collab-chloride-limit-material": [
    { speaker: "Mr. Tan", en: "Sorry, we only just found the chloride limit for our cooling water. Is it a big problem?", ko: "죄송해요, 냉각수 염화물 한계치를 이제야 확인했어요. 큰 문제가 되나요?" },
  ],
  "fs-operation-condensate-tank-full": [
    { speaker: "Budi", en: "Field here. I'm near the condensate tank now. Anything for me?", ko: "현장입니다. 지금 응축수 탱크 근처에 있어요. 제가 할 일 있나요?" },
  ],
  "fs-operation-dryer-steam-demand": [
    { speaker: "Budi", en: "The vendor is on the call now. Let's go through the utilities with them.", ko: "벤더가 지금 통화에 들어와 있어요. 유틸리티 항목을 같이 확인해 보죠." },
  ],
  "fs-operation-control-valve-stuck": [
    { speaker: "Budi", en: "We can't control the flow from the DCS. Any idea what's wrong?", ko: "DCS에서 유량 제어가 안 돼요. 뭐가 문제인지 짐작 가는 게 있나요?" },
  ],
  "fs-operation-dryer-moisture-high": [
    { speaker: "Budi", en: "Minsu, can you look at the dryer numbers on your screen? Is everything okay?", ko: "민수 씨, 화면에서 건조기 수치 좀 봐 줄래요? 다 괜찮아요?" },
  ],
  "fs-operation-seal-replaced-leak": [
    { speaker: "Sari", en: "What's the latest on the feed pump?", ko: "공급 펌프는 최근 상황이 어때요?" },
  ],
  "fs-operation-transmitter-unstable": [
    { speaker: "Budi", en: "Any problems with the instruments today?", ko: "오늘 계기 쪽에 문제 있나요?" },
  ],
  "fs-operation-strainer-pump-trip": [
    { speaker: "Mr. Tan", en: "The plant has been down since this morning. Why did this happen?", ko: "공장이 오늘 아침부터 멈춰 있어요. 왜 이런 일이 생긴 건가요?" },
  ],
  "fs-business-option-cost-compare": [
    { speaker: "Mr. Tan", en: "So, which dryer option is better for us, 1 or 2?", ko: "그래서 저희에게는 1번과 2번 중 어떤 건조기 옵션이 더 나은가요?" },
  ],
  "fs-business-proposal-plan": [
    { speaker: "Linh", en: "When will we get your proposal?", ko: "제안서는 언제 받을 수 있을까요?" },
  ],
  "fs-business-efb-fuel-opex": [
    { speaker: "Mr. Tan", en: "Our boiler runs on diesel now, and it's expensive. Is there a cheaper option?", ko: "지금 저희 보일러는 디젤을 쓰는데 비싸요. 더 저렴한 방법이 있을까요?" },
  ],
  "fs-business-detailed-design-schedule": [
    { speaker: "Linh", en: "Our management is asking about the detailed design schedule. Do you have a date?", ko: "저희 경영진이 상세 설계 일정을 묻고 있어요. 날짜가 나왔나요?" },
  ],
  "fs-business-capex-utility-assumption": [
    { speaker: "Linh", en: "Your CAPEX looks good. Is there anything that could change it?", ko: "제시하신 CAPEX는 괜찮아 보여요. 바뀔 수 있는 요인이 있나요?" },
  ],

  /* ───────────── variations ───────────── */
  // seed-too-early
  "rv-too-early-l0-a": [
    { speaker: "Budi", en: "Can we agree on it today? We don't have much time.", ko: "오늘 합의할 수 있을까요? 시간이 별로 없어요." },
  ],
  "rv-too-early-l0-b": [
    { speaker: "Mr. Tan", en: "Can we fix the pump specs this week?", ko: "이번 주에 펌프 사양을 확정할 수 있을까요?" },
  ],
  "rv-too-early-l1-a": [
    { speaker: "Budi", en: "We should choose the equipment soon. The vendors keep calling us.", ko: "장비를 빨리 골라야 해요. 벤더들이 계속 연락해 와요." },
  ],
  "rv-too-early-l1-b": [
    { speaker: "Sari", en: "The datasheet looks good. Shall I email it to the vendor now?", ko: "데이터시트 괜찮아 보이네요. 지금 벤더에게 이메일로 보낼까요?" },
  ],
  "rv-too-early-l2-a": [
    { speaker: "Mr. Tan", en: "We'd like to choose the process route today. Is that okay?", ko: "오늘 공정 방식을 정하고 싶어요. 괜찮을까요?" },
  ],
  "rv-too-early-l2-b": [
    { speaker: "Sari", en: "I want the heat balance closed this week. Is that possible?", ko: "이번 주에 열수지를 마무리하고 싶어요. 가능할까요?" },
  ],
  "rv-too-early-l3-a": [
    { speaker: "Budi", en: "We can't lose any more time. I want to send the purchase order for the dryer this week.", ko: "더 이상 시간을 잃으면 안 돼요. 이번 주에 건조기 구매 주문서를 보내고 싶어요." },
  ],
  "rv-too-early-l3-b": [
    { speaker: "Mr. Tan", en: "Our management needs the total investment cost. Can we have the final figure today?", ko: "경영진이 총 투자비를 알아야 해요. 오늘 최종 금액을 받을 수 있을까요?" },
  ],
  // seed-still-waiting
  "rv-still-waiting-l0-a": [
    { speaker: "Sari", en: "Is the analysis of the results finished?", ko: "결과 분석은 끝났나요?" },
  ],
  "rv-still-waiting-l0-b": [
    { speaker: "Sari", en: "Why is the datasheet work on hold?", ko: "데이터시트 작업이 왜 멈춰 있어요?" },
  ],
  "rv-still-waiting-l1-a": [
    { speaker: "Sari", en: "You just talked to the vendor. Have they started the design?", ko: "방금 벤더와 통화했죠. 그쪽은 설계를 시작했나요?" },
  ],
  "rv-still-waiting-l1-b": [
    { speaker: "Sari", en: "How is the Malaysian site team doing? Can they start the work?", ko: "말레이시아 현장 팀은 어떻게 되고 있어요? 작업을 시작할 수 있나요?" },
  ],
  "rv-still-waiting-l2-a": [
    { speaker: "Sari", en: "When can we close the mass balance?", ko: "물질수지는 언제 마무리할 수 있어요?" },
  ],
  "rv-still-waiting-l2-b": [
    { speaker: "Mr. Tan", en: "Why hasn't the dryer commissioning started yet?", ko: "건조기 시운전은 왜 아직 시작하지 않았나요?" },
  ],
  "rv-still-waiting-l3-a": [
    { speaker: "Sari", en: "How is the mass balance going? Can we see it today?", ko: "물질수지는 어떻게 되고 있어요? 오늘 볼 수 있을까요?" },
  ],
  "rv-still-waiting-l3-b": [
    { speaker: "Priya", en: "Hi Minsu, thanks for joining. What would you like to talk about today?", ko: "안녕하세요, 민수 씨. 참석해 주셔서 감사해요. 오늘 어떤 이야기를 나누고 싶으세요?" },
  ],
  // seed-check-object
  "rv-check-object-l0-a": [
    { speaker: "Budi", en: "The outlet moisture is high again. What should I look at first?", ko: "출구 수분이 또 높아요. 뭘 먼저 봐야 할까요?" },
  ],
  "rv-check-object-l0-b": [
    { speaker: "Sari", en: "The drying performance dropped this week. Where do we start?", ko: "이번 주에 건조 성능이 떨어졌어요. 어디서부터 시작할까요?" },
  ],
  "rv-check-object-l1-a": [
    { speaker: "Sari", en: "I have some time this afternoon. Is there anything I can analyze for you?", ko: "오늘 오후에 시간이 좀 있어요. 제가 분석해 드릴 게 있을까요?" },
  ],
  "rv-check-object-l1-b": [
    { speaker: "Budi", en: "Okay, let's split the site checks. Minsu, what will you take?", ko: "좋아요, 현장 점검을 나눠서 합시다. 민수 씨는 뭘 맡을래요?" },
  ],
  "rv-check-object-l2-a": [
    { speaker: "Budi", en: "The dryer still isn't working well. What should we look at next?", ko: "건조기가 아직도 잘 안 돼요. 다음엔 뭘 봐야 할까요?" },
  ],
  "rv-check-object-l2-b": [
    { speaker: "Budi", en: "Our team is in the field now. What do you need us to do?", ko: "저희 팀이 지금 현장에 있어요. 저희가 뭘 하면 될까요?" },
  ],
  "rv-check-object-l3-a": [
    { speaker: "Budi", en: "Minsu, the dryer outlet moisture is above the target again this morning.", ko: "민수 씨, 오늘 아침에도 건조기 출구 수분이 목표보다 높아요." },
  ],
  "rv-check-object-l3-b": [
    { speaker: "Mr. Tan", en: "Why is the pellet yield so low in the pilot results?", ko: "파일럿 결과에서 펠릿 수율이 왜 이렇게 낮은가요?" },
  ],
  // seed-receive-when
  "rv-receive-when-l0-a": [
    { speaker: "Sari", en: "The vendor says the test data will come next Tuesday. What's our plan?", ko: "벤더 말로는 시험 데이터가 다음 주 화요일에 온대요. 우리 계획은 뭐예요?" },
  ],
  "rv-receive-when-l0-b": [
    { speaker: "Sari", en: "The site team is sending the operating data tomorrow. Who will look at it?", ko: "현장 팀이 내일 운전 데이터를 보낸대요. 누가 볼 거예요?" },
  ],
  "rv-receive-when-l1-a": [
    { speaker: "Budi", en: "The vendor's quotation is coming on Thursday. What's the next step?", ko: "벤더 견적서가 목요일에 와요. 다음 단계는 뭐예요?" },
  ],
  "rv-receive-when-l1-b": [
    { speaker: "Sari", en: "The report went out to the client today. What happens next?", ko: "보고서가 오늘 고객에게 발송됐어요. 다음엔 어떻게 되죠?" },
  ],
  "rv-receive-when-l2-a": [
    { speaker: "Mr. Tan", en: "What's the plan for the mass balance? We are waiting for it.", ko: "물질수지는 어떻게 할 계획인가요? 저희가 기다리고 있어서요." },
  ],
  "rv-receive-when-l2-b": [
    { speaker: "Sari", en: "The client will sign off the basic design on Monday. So what's our plan?", ko: "고객이 월요일에 기본 설계를 승인한대요. 그럼 우리 계획은 뭐예요?" },
  ],
  "rv-receive-when-l3-a": [
    { speaker: "Priya", en: "Our team will have the performance data ready next Tuesday. We'll email it to you.", ko: "저희 팀이 다음 주 화요일에 성능 데이터를 준비할 거예요. 이메일로 보내 드릴게요." },
  ],
  "rv-receive-when-l3-b": [
    { speaker: "Mr. Tan", en: "When will the new heat balance be ready?", ko: "새 열수지는 언제 준비되나요?" },
  ],
  // seed-before-ing
  "rv-before-ing-l0-a": [
    { speaker: "Sari", en: "We want to wrap up the basic design soon. Is anything missing?", ko: "기본 설계를 곧 마무리하고 싶어요. 빠진 게 있을까요?" },
  ],
  "rv-before-ing-l0-b": [
    { speaker: "Linh", en: "This is my first time with this pump. What do I do first?", ko: "이 펌프는 처음 다뤄 봐요. 먼저 뭘 해야 하나요?" },
  ],
  "rv-before-ing-l1-a": [
    { speaker: "Mr. Tan", en: "Did you get the P&ID we sent? When can we hear from you?", ko: "저희가 보낸 P&ID 받으셨나요? 언제 회신을 받을 수 있을까요?" },
  ],
  "rv-before-ing-l1-b": [
    { speaker: "Sari", en: "The data tables are done. I'll email them to the client now.", ko: "데이터 표 다 됐어요. 지금 고객에게 이메일로 보낼게요." },
  ],
  "rv-before-ing-l2-a": [
    { speaker: "Budi", en: "I think we have enough data. Let's fix the dryer size today.", ko: "데이터는 충분한 것 같아요. 오늘 건조기 크기를 확정합시다." },
  ],
  "rv-before-ing-l2-b": [
    { speaker: "Sari", en: "What are the next steps on the datasheet with the vendor?", ko: "벤더와의 데이터시트 작업은 다음에 어떻게 진행되나요?" },
  ],
  "rv-before-ing-l3-a": [
    { speaker: "Mr. Tan", en: "The decanter looks fine to us. Let's order it today.", ko: "디캔터는 괜찮아 보여요. 오늘 발주합시다." },
  ],
  "rv-before-ing-l3-b": [
    { speaker: "Budi", en: "Shall we run the dryer tomorrow morning?", ko: "내일 아침에 건조기를 돌려 볼까요?" },
  ],
  // seed-schedule-delayed
  "rv-schedule-delayed-l0-a": [
    { speaker: "Sari", en: "How is the P&ID review going?", ko: "P&ID 검토는 어떻게 되고 있어요?" },
  ],
  "rv-schedule-delayed-l0-b": [
    { speaker: "Daniel", en: "Is the pilot test on schedule?", ko: "파일럿 시험은 일정대로 가고 있나요?" },
  ],
  "rv-schedule-delayed-l1-a": [
    { speaker: "Sari", en: "Have we got all the vendor drawings?", ko: "벤더 도면은 다 받았나요?" },
  ],
  "rv-schedule-delayed-l1-b": [
    { speaker: "Budi", en: "When will the pumps arrive at the site?", ko: "펌프는 언제 현장에 도착하나요?" },
  ],
  "rv-schedule-delayed-l2-a": [
    { speaker: "Mr. Tan", en: "The commissioning seems to be behind schedule. What happened?", ko: "시운전이 계획보다 늦어 보이네요. 무슨 일이 있었나요?" },
  ],
  "rv-schedule-delayed-l2-b": [
    { speaker: "Mr. Tan", en: "Can we still get the PFD this Friday?", ko: "이번 주 금요일에 PFD를 받을 수 있을까요?" },
  ],
  "rv-schedule-delayed-l3-a": [
    { speaker: "Mr. Tan", en: "Are the FEED documents on track?", ko: "FEED 문서는 일정대로 진행되고 있나요?" },
  ],
  "rv-schedule-delayed-l3-b": [
    { speaker: "Mr. Tan", en: "I'm worried about the dryer. Can we still start up on time?", ko: "건조기가 걱정되네요. 그래도 제때 기동할 수 있을까요?" },
  ],
  // seed-object-order
  "rv-object-order-l0-a": [
    { speaker: "Budi", en: "The product from the dryer is too wet. Any ideas?", ko: "건조기에서 나온 제품이 너무 젖어 있어요. 좋은 생각 있나요?" },
  ],
  "rv-object-order-l0-b": [
    { speaker: "Sari", en: "There's a lot to do in Pre-FEED. Where do we begin?", ko: "Pre-FEED에서 할 일이 많네요. 어디서부터 시작할까요?" },
  ],
  "rv-object-order-l1-a": [
    { speaker: "Priya", en: "Did you get the test report from us?", ko: "저희가 보낸 시험 보고서 받으셨나요?" },
  ],
  "rv-object-order-l1-b": [
    { speaker: "Budi", en: "We have ten minutes left, and there are two more items.", ko: "10분 남았는데 안건이 두 개 더 있어요." },
  ],
  "rv-object-order-l2-a": [
    { speaker: "Budi", en: "Shall I change the dryer settings now?", ko: "지금 건조기 설정을 바꿀까요?" },
  ],
  "rv-object-order-l2-b": [
    { speaker: "Sari", en: "I finished the changes on the P&ID. Can I email it to the client right away?", ko: "P&ID 수정을 마쳤어요. 바로 고객에게 이메일로 보내도 될까요?" },
  ],
  "rv-object-order-l3-a": [
    { speaker: "Budi", en: "The outlet is still too wet. Let's raise the steam pressure.", ko: "출구가 아직도 너무 젖어 있어요. 스팀 압력을 올립시다." },
  ],
  "rv-object-order-l3-b": [
    { speaker: "Mr. Tan", en: "Let's agree on the shipping date today, so we can plan the site work.", ko: "현장 작업 계획을 세울 수 있게 오늘 출하 날짜를 정합시다." },
  ],
};
