import type { AnatomyPart, GuideEntry } from "./types";

/**
 * Interactive grammar guide: one entry per skill in skills.ts.
 * Shown when a learner taps "Why is this wrong?", "Explain more simply",
 * "Show another example", "Compare similar expressions" or "Practice again".
 *
 * Anatomy rule (checked by scripts/check-content.ts): the parts' text joined
 * with single spaces (punctuation attached to the previous word) must equal
 * the sentence exactly.
 */

/** Anatomy block helper. */
const p = (text: string, role: string, roleKo: string, focus?: boolean): AnatomyPart =>
  focus ? { text, role, roleKo, focus } : { text, role, roleKo };

export const GUIDE: Record<string, GuideEntry> = {
  // ───────────────────────────── tense ─────────────────────────────
  progressive: {
    skill: "progressive",
    summaryKo: "지금 진행 중인 일은 '주어 + be동사(am/is/are) + V-ing'로 말합니다. be동사를 빼면 문장이 성립하지 않습니다.",
    simpleKo:
      "'~하고 있다'는 두 조각이 항상 같이 다닙니다: be동사 + V-ing. 'waiting'만 쓰면 '기다리는…'에서 말이 끊긴 것과 같습니다. still(아직), now(지금) 같은 말은 두 조각 사이나 문장 끝에 둡니다.",
    rules: [
      { formula: "주어 + am / is / are + V-ing", ko: "지금 진행 중인 일입니다. be동사는 주어에 맞춥니다(I am, it is, we are).", example: "We are testing the new dryer this week." },
      { formula: "주어 + be + still + V-ing", ko: "still(아직)은 be동사 뒤, V-ing 앞에 둡니다.", example: "We are still waiting for the data." },
      { formula: "주어 + be + not + V-ing", ko: "부정은 be동사 뒤에 not을 넣습니다.", example: "The feed pump is not running now." },
      { formula: "Be + 주어 + V-ing?", ko: "질문은 be동사를 주어 앞으로 보냅니다.", example: "Is the vendor checking our datasheet?" },
    ],
    anatomy: [
      {
        sentence: "We are still waiting for the data.",
        parts: [
          p("We", "subject", "주어"),
          p("are", "be", "be동사", true),
          p("still", "adverb", "부사(아직)"),
          p("waiting", "V-ing", "진행 동사", true),
          p("for", "preposition", "전치사"),
          p("the data.", "object", "목적어"),
        ],
      },
      {
        sentence: "The vendor is checking our datasheet now.",
        parts: [
          p("The vendor", "subject", "주어(단수)"),
          p("is", "be", "be동사", true),
          p("checking", "V-ing", "진행 동사", true),
          p("our datasheet", "object", "목적어"),
          p("now.", "adverb", "부사(지금)"),
        ],
      },
    ],
    examples: [
      { en: "We are still waiting for the lab results from Korea.", ko: "우리는 아직 한국에서 올 실험 결과를 기다리고 있습니다." },
      { en: "The Indonesian team is preparing the new PFD.", ko: "인도네시아 팀이 새 PFD를 준비하고 있습니다." },
      { en: "The dryer is running at 80% load now.", ko: "건조기는 지금 80% 부하로 운전 중입니다." },
      { en: "We are checking the steam consumption this week.", ko: "이번 주에 스팀 소비량을 확인하고 있습니다." },
      { en: "The vendor is not answering our emails.", ko: "벤더가 우리 이메일에 답하지 않고 있습니다." },
    ],
    compare: [
      { a: "We are waiting for the data.", b: "We wait for the data.", ko: "진행형은 '지금 기다리는 중'이라는 현재 상황이고, 현재형은 '보통 기다린다'는 습관·규칙입니다. 회의에서 현재 상황을 보고할 때는 진행형을 씁니다." },
      { a: "The pump is running at 10 m³/h.", b: "The pump runs at 10 m³/h.", ko: "is running은 '지금 그 유량으로 운전 중', runs는 '평소·설계상 그 유량으로 운전한다'는 뜻입니다." },
      { a: "We are still waiting.", b: "We have been waiting for two weeks.", ko: "still + 진행형은 '아직 기다리는 중', have been V-ing은 '(과거부터 지금까지) 2주째 계속 기다려 왔다'로 기간을 강조합니다." },
    ],
    mistakes: [
      { wrong: "We still waiting data.", right: "We are still waiting for data.", ko: "be동사(are)가 빠졌고 wait 뒤에 for가 없습니다. 진행형은 be + V-ing이고, 기다리는 대상은 wait for + 명사로 씁니다." },
      { wrong: "The pump running now.", right: "The pump is running now.", ko: "is가 없으면 '지금 운전 중인 펌프'라는 명사구일 뿐 문장이 되지 않습니다." },
      { wrong: "We are wait for the vendor.", right: "We are waiting for the vendor.", ko: "진행형에서 be동사 뒤에는 동사원형이 아니라 V-ing가 옵니다." },
    ],
  },

  "be-adj": {
    skill: "be-adj",
    summaryKo: "상태(지연됨, 준비됨, 안정적임)를 말할 때는 '주어 + be동사 + 형용사/과거분사'를 씁니다. '조금, 약간' 같은 정도 표현은 be동사와 형용사 사이에 넣습니다.",
    simpleKo:
      "한국어 '일정이 늦어요'는 동사처럼 보이지만, 영어는 'is delayed(지연된 상태이다)'처럼 be동사 + 상태 단어로 말합니다. be동사를 '=' 기호라고 생각하세요. schedule = delayed → The schedule is delayed.",
    rules: [
      { formula: "주어 + be + 형용사 / p.p.", ko: "주어의 상태를 나타냅니다.", example: "The revised datasheet is ready." },
      { formula: "주어 + be + a little / slightly / very + 형용사 / p.p.", ko: "정도 표현은 be동사와 형용사 사이에 둡니다.", example: "Our design schedule is a little delayed." },
      { formula: "주어 + be + behind / on schedule", ko: "일정 상태는 전치사구로도 말합니다.", example: "We are about two weeks behind schedule." },
      { formula: "주어 + be + not + 형용사 / p.p.", ko: "부정은 be동사 뒤에 not을 넣습니다.", example: "The spare pump is not available until May." },
    ],
    anatomy: [
      {
        sentence: "Our design schedule is a little delayed.",
        parts: [
          p("Our design schedule", "subject", "주어"),
          p("is", "be", "be동사", true),
          p("a little", "degree", "정도(조금)"),
          p("delayed.", "p.p.", "상태(과거분사)", true),
        ],
      },
      {
        sentence: "The steam supply is not stable yet.",
        parts: [
          p("The steam supply", "subject", "주어"),
          p("is", "be", "be동사", true),
          p("not", "negation", "부정"),
          p("stable", "adjective", "형용사(상태)", true),
          p("yet.", "adverb", "부사(아직)"),
        ],
      },
    ],
    examples: [
      { en: "The equipment delivery is slightly delayed.", ko: "장비 납품이 약간 지연되고 있습니다." },
      { en: "The revised P&ID is ready for review.", ko: "수정된 P&ID는 검토할 준비가 되었습니다." },
      { en: "The steam pressure is stable at 6 bar(g).", ko: "스팀 압력이 6 bar(g)에서 안정적입니다." },
      { en: "The commissioning is a little delayed because of the steam supply.", ko: "스팀 공급 문제로 시운전이 조금 지연되고 있습니다." },
      { en: "Is the vendor quotation available now?", ko: "벤더 견적서가 지금 나와 있습니까?" },
    ],
    compare: [
      { a: "The schedule is delayed.", b: "The vendor delayed the schedule.", ko: "is delayed는 '지연된 상태'를 말하고 누가 했는지는 중요하지 않습니다. delayed + 목적어는 '벤더가 일정을 늦췄다'는 행동입니다." },
      { a: "a little delayed", b: "some delay", ko: "a little / slightly는 형용사·과거분사 앞에서 '조금'이라는 정도를 나타냅니다. some은 명사 앞에서 '약간의 양'을 나타냅니다: There is some delay." },
      { a: "The delivery is late.", b: "The delivery is delayed.", ko: "late는 '정해진 시간보다 늦은', delayed는 '어떤 원인으로 미뤄진'이라는 느낌입니다. 둘 다 be동사와 함께 씁니다. 'lated'라는 단어는 없습니다." },
    ],
    mistakes: [
      { wrong: "Our design schedule some lated.", right: "Our design schedule is a little delayed.", ko: "be동사(is)가 빠졌고, 'lated'는 없는 단어입니다. 형용사 앞의 '조금'은 some이 아니라 a little / slightly입니다." },
      { wrong: "The datasheet ready.", right: "The datasheet is ready.", ko: "ready는 형용사라 혼자서 동사 역할을 할 수 없습니다. be동사가 필요합니다." },
      { wrong: "The schedule is delay.", right: "The schedule is delayed.", ko: "be동사 뒤에서 상태를 말할 때는 과거분사(delayed)를 씁니다. delay는 동사원형 또는 명사입니다." },
      { wrong: "I am agree with you.", right: "I agree with you.", ko: "agree는 이미 동사이므로 be동사를 붙이지 않습니다. be동사는 형용사·과거분사 앞에만 씁니다." },
    ],
  },

  agreement: {
    skill: "agreement",
    summaryKo: "주어가 3인칭 단수(he, she, it, the pump)이면 현재형 일반동사에 -s를 붙이고, be동사는 is, have는 has를 씁니다. 복수 주어는 -s 없는 동사, are, have를 씁니다.",
    simpleKo:
      "주어가 '하나'면 동사에도 표시(-s, is, has)를 붙이고, 주어가 '여러 개'면 표시 없이 씁니다: The pump runs / The pumps run. 또 영어 문장에는 주어와 동사가 꼭 있어야 해서, 'I think' 뒤에도 it is 같은 주어 + 동사가 다시 나와야 합니다.",
    rules: [
      { formula: "he / she / it / 단수 명사 + V-s", ko: "3인칭 단수 주어의 현재형 일반동사에는 -s를 붙입니다.", example: "The dryer uses about 2 t/h of steam." },
      { formula: "it is / they are · it has / they have", ko: "be동사와 have도 주어의 수에 맞춥니다.", example: "The pump has a new seal, and the valves are ready." },
      { formula: "단수 주어 + doesn't + V / 복수 주어 + don't + V", ko: "부정문에서도 단수 주어는 doesn't, 동사는 원형입니다.", example: "The vendor doesn't have the final drawing yet." },
      { formula: "I think + 주어 + 동사", ko: "I think 뒤에도 주어와 동사가 있는 완전한 문장이 와야 합니다.", example: "I think it's too early to decide." },
    ],
    anatomy: [
      {
        sentence: "The new pump has a higher flow rate.",
        parts: [
          p("The new pump", "subject", "주어(단수)", true),
          p("has", "verb", "동사(3인칭 단수)", true),
          p("a higher flow rate.", "object", "목적어"),
        ],
      },
      {
        sentence: "I think it's too early.",
        parts: [
          p("I", "subject", "주어"),
          p("think", "verb", "동사"),
          p("it's", "subject + be", "주어 + be동사", true),
          p("too early.", "complement", "보어(상태)"),
        ],
      },
    ],
    examples: [
      { en: "The dryer uses about 2 t/h of steam.", ko: "건조기는 스팀을 약 2 t/h 사용합니다." },
      { en: "The vendor doesn't have the final drawing yet.", ko: "벤더는 아직 최종 도면을 가지고 있지 않습니다." },
      { en: "The two pumps are the same model.", ko: "두 펌프는 같은 모델입니다." },
      { en: "Each line has its own control valve.", ko: "각 라인에는 별도의 제어 밸브가 있습니다." },
      { en: "Pak Budi works at the pilot plant in Riau.", ko: "Pak Budi는 리아우의 파일럿 플랜트에서 근무합니다." },
    ],
    compare: [
      { a: "The pump runs.", b: "The pumps run.", ko: "단수 주어면 동사에 -s, 복수 주어면 동사에 -s가 없습니다. 명사의 -s와 동사의 -s는 서로 반대로 붙습니다." },
      { a: "The data is ready.", b: "The results are ready.", ko: "data는 셀 수 없는 명사로 보통 단수 취급(is)하고, results는 복수이므로 are를 씁니다." },
      { a: "One of the pumps is noisy.", b: "The pumps are noisy.", ko: "'one of + 복수 명사'의 실제 주어는 one이므로 is를 씁니다." },
    ],
    mistakes: [
      { wrong: "I think so late.", right: "I think it's too early.", ko: "I think 뒤에 주어와 동사(it's)가 없습니다. 또 so late는 '너무 늦었다'는 뜻이라 '아직 이르다'는 의도와 반대입니다." },
      { wrong: "The vendor have the data.", right: "The vendor has the data.", ko: "단수 주어(the vendor)에는 has를 씁니다." },
      { wrong: "The pump don't work.", right: "The pump doesn't work.", ko: "3인칭 단수 주어의 부정은 doesn't입니다." },
      { wrong: "The results is good.", right: "The results are good.", ko: "results는 복수이므로 are를 씁니다." },
    ],
  },

  // ─────────────────────── structure / prepositions ───────────────────────
  "verb-object": {
    skill: "verb-object",
    summaryKo: "check, discuss, review, contact처럼 목적어를 바로 받는 동사(타동사) 뒤에는 전치사를 넣지 않습니다. 전치사를 넣으면 뜻이 바뀌거나 틀린 문장이 됩니다.",
    simpleKo:
      "한국어의 '~을/를'에 해당하는 단어는 영어에 따로 없습니다. 동사 바로 뒤에 목적어를 붙이면 그것이 '~을/를'입니다. 'check for'의 for는 '를'이 아니라 '~이 있는지'라는 다른 뜻입니다.",
    rules: [
      { formula: "check + the + 명사", ko: "값이나 상태를 확인합니다.", example: "Check the actual feed rate." },
      { formula: "check + 명사 + for + 문제", ko: "~에 문제가 있는지 점검합니다. for 뒤에는 찾는 대상(누설, 막힘)이 옵니다.", example: "Check the flange for leaks before startup." },
      { formula: "discuss / review / contact + 목적어", ko: "전치사 없이 바로 목적어를 씁니다(about, to를 붙이지 않음).", example: "We discussed the design basis with the client." },
      { formula: "explain + 내용 + to + 사람", ko: "explain의 목적어는 설명하는 내용이고, 사람 앞에는 to를 씁니다.", example: "Could you explain the control logic to us?" },
    ],
    anatomy: [
      {
        sentence: "Please check the actual feed rate.",
        parts: [
          p("Please", "polite marker", "정중 표현"),
          p("check", "verb", "동사(타동사)", true),
          p("the actual feed rate.", "object", "목적어(전치사 없음)", true),
        ],
      },
      {
        sentence: "Check the flange for leaks before startup.",
        parts: [
          p("Check", "verb", "동사"),
          p("the flange", "object", "점검 대상"),
          p("for leaks", "for + target", "찾는 문제(for + 명사)", true),
          p("before startup.", "time", "시간"),
        ],
      },
    ],
    examples: [
      { en: "Please check the steam pressure at the dryer inlet.", ko: "건조기 입구의 스팀 압력을 확인해 주세요." },
      { en: "We need to check the moisture content again.", ko: "수분 함량을 다시 확인해야 합니다." },
      { en: "We discussed the pump sizing with the vendor.", ko: "벤더와 펌프 용량 산정을 논의했습니다." },
      { en: "I will contact the site operator tomorrow.", ko: "내일 현장 운전원에게 연락하겠습니다." },
      { en: "Please review the revised P&ID by Friday.", ko: "금요일까지 수정된 P&ID를 검토해 주세요." },
      { en: "Check the heat exchanger for fouling.", ko: "열교환기에 파울링이 있는지 점검하세요." },
    ],
    compare: [
      { a: "check the rate", b: "check for leaks", ko: "check + 목적어는 '그 값을 확인하다', check for + 명사는 '~이 있는지 찾아보다'입니다. 유량 값을 확인할 때 for를 쓰면 '유량이 있는지 찾아보다'라는 이상한 뜻이 됩니다." },
      { a: "discuss the schedule", b: "talk about the schedule", ko: "discuss는 바로 목적어를 받고, talk는 about이 필요합니다. 'discuss about'은 틀립니다." },
      { a: "contact the vendor", b: "send an email to the vendor", ko: "contact는 사람을 바로 목적어로 받고, send는 사람 앞에 to가 필요합니다. 'contact to'는 틀립니다." },
    ],
    mistakes: [
      { wrong: "Check for actual feed rate.", right: "Check the actual feed rate.", ko: "check는 목적어를 바로 받는 동사입니다. 'check for'는 '~이 있는지 찾아보다'라는 다른 뜻이 됩니다. 특정한 값 앞에는 the도 필요합니다." },
      { wrong: "We will discuss about the layout.", right: "We will discuss the layout.", ko: "discuss 자체에 '~에 대해 논의하다'라는 뜻이 있으므로 about을 쓰지 않습니다." },
      { wrong: "Please contact to the vendor.", right: "Please contact the vendor.", ko: "contact 뒤에는 to 없이 바로 사람을 씁니다." },
      { wrong: "Could you explain me the logic?", right: "Could you explain the logic to me?", ko: "explain은 사람을 바로 목적어로 받지 않습니다. 내용을 먼저 쓰고 사람 앞에 to를 씁니다." },
    ],
  },

  "verb-prep": {
    skill: "verb-prep",
    summaryKo: "wait, depend, focus, reply 같은 동사는 목적어 앞에 정해진 전치사가 필요합니다. 동사와 전치사를 한 덩어리로 외우는 것이 가장 빠릅니다.",
    simpleKo:
      "어떤 동사는 혼자서 목적어를 잡지 못해서 '손잡이(전치사)'가 필요합니다. wait는 for라는 손잡이로 기다리는 대상을 잡습니다: wait for the data. 손잡이가 없으면 목적어를 놓칩니다.",
    rules: [
      { formula: "wait for + 명사", ko: "기다리는 대상 앞에는 for를 씁니다.", example: "We are waiting for the vendor data." },
      { formula: "depend on / focus on / work on + 명사", ko: "~에 달려 있다 / ~에 집중하다 / ~을 작업하다.", example: "The dryer size depends on the feed moisture." },
      { formula: "agree with + 사람·의견 / agree on + 안건", ko: "사람이나 의견에 동의할 때는 with, 안건에 합의할 때는 on입니다.", example: "We agreed on the design basis." },
      { formula: "reply to / respond to + 명사", ko: "~에 답하다.", example: "The vendor has not replied to our email." },
    ],
    anatomy: [
      {
        sentence: "We are waiting for approval from the client.",
        parts: [
          p("We", "subject", "주어"),
          p("are", "be", "be동사"),
          p("waiting", "V-ing", "진행 동사", true),
          p("for", "preposition", "전치사(대상)", true),
          p("approval", "object", "기다리는 대상"),
          p("from the client.", "source", "출처"),
        ],
      },
      {
        sentence: "The dryer size depends on the feed moisture.",
        parts: [
          p("The dryer size", "subject", "주어"),
          p("depends", "verb", "동사", true),
          p("on", "preposition", "전치사", true),
          p("the feed moisture.", "object", "목적어"),
        ],
      },
    ],
    examples: [
      { en: "We are still waiting for the lab results.", ko: "우리는 아직 실험 결과를 기다리고 있습니다." },
      { en: "The final capacity depends on the actual feed rate.", ko: "최종 용량은 실제 원료 투입량에 따라 달라집니다." },
      { en: "Today, let's focus on the steam balance.", ko: "오늘은 스팀 밸런스에 집중합시다." },
      { en: "Ms. Nguyen is working on the heat and mass balance.", ko: "Ms. Nguyen이 열·물질수지 작업을 하고 있습니다." },
      { en: "We agree with the vendor's proposal.", ko: "벤더의 제안에 동의합니다." },
      { en: "Please reply to the client by Wednesday.", ko: "수요일까지 고객에게 답신해 주세요." },
    ],
    compare: [
      { a: "wait for the data", b: "await the data", ko: "await는 격식체 동사로 for 없이 바로 목적어를 받습니다. 회의에서는 wait for가 더 자연스럽고, 'await for'는 틀립니다." },
      { a: "agree with the vendor", b: "agree on the price", ko: "with 뒤에는 사람·의견(~에게 동의하다), on 뒤에는 안건(~에 대해 합의하다)이 옵니다." },
      { a: "depend on the feed", b: "be based on the lab data", ko: "depend on은 '(결과가) ~에 따라 달라진다', be based on은 '~을 근거로 했다'입니다: The design is based on the lab data." },
    ],
    mistakes: [
      { wrong: "We still waiting data.", right: "We are still waiting for data.", ko: "wait는 목적어를 바로 받지 못하므로 for가 필요합니다. 진행형이므로 be동사(are)도 필요합니다." },
      { wrong: "We are waiting the data.", right: "We are waiting for the data.", ko: "기다리는 대상 앞에는 for를 씁니다." },
      { wrong: "It depends of the feed rate.", right: "It depends on the feed rate.", ko: "depend는 on과 함께 씁니다." },
      { wrong: "We will await for your reply.", right: "We will wait for your reply.", ko: "await 뒤에는 for를 쓰지 않습니다. 회의에서는 쉬운 wait for를 쓰세요." },
    ],
  },

  "too-adj": {
    skill: "too-adj",
    summaryKo: "too + 형용사는 '지나치게 ~해서 문제가 된다(그래서 ~할 수 없다)'는 뜻입니다. 판단을 말할 때는 It's too early to decide.처럼 가주어 it과 to + 동사원형을 함께 씁니다.",
    simpleKo:
      "too는 '선을 넘었다'는 신호입니다. too early는 '너무 일러서 아직 안 된다', too late는 '너무 늦어서 이미 안 된다'입니다. so는 '정말, 매우'라는 감정 강조일 뿐 '그래서 안 된다'는 뜻이 없습니다.",
    rules: [
      { formula: "It's too + 형용사 + to + 동사원형", ko: "~하기에는 너무 …합니다(그래서 할 수 없습니다).", example: "It's too early to select the dryer." },
      { formula: "주어 + be + too + 형용사", ko: "주어가 허용 범위를 넘었습니다.", example: "The outlet temperature is too high." },
      { formula: "too + 형용사 + for + 명사", ko: "무엇에 비해 너무 …한지 말합니다.", example: "The pump is too small for this flow rate." },
      { formula: "not + 형용사 + enough + to + 동사원형", ko: "반대 표현: 충분히 ~하지 않아서 할 수 없습니다.", example: "The data is not good enough to finalize the design." },
    ],
    anatomy: [
      {
        sentence: "I think it's too early to decide.",
        parts: [
          p("I think", "opinion", "의견 표현"),
          p("it's", "subject + be", "가주어 + be동사"),
          p("too early", "too + adjective", "지나침(너무 이름)", true),
          p("to decide.", "to-verb", "무엇을 하기에(to + 동사)", true),
        ],
      },
      {
        sentence: "The steam pressure is too low for the new dryer.",
        parts: [
          p("The steam pressure", "subject", "주어"),
          p("is", "be", "be동사"),
          p("too low", "too + adjective", "지나침(너무 낮음)", true),
          p("for the new dryer.", "for + noun", "기준 대상"),
        ],
      },
    ],
    examples: [
      { en: "It's too early to select the dryer.", ko: "건조기를 선정하기에는 너무 이릅니다." },
      { en: "It's too late to change the P&ID for this revision.", ko: "이번 리비전에서 P&ID를 바꾸기에는 너무 늦었습니다." },
      { en: "I think it's still too early to finalize the heat balance.", ko: "열수지를 확정하기에는 아직 이르다고 생각합니다." },
      { en: "The feed moisture is too high for direct pelletizing.", ko: "원료 수분이 너무 높아서 바로 펠렛화할 수 없습니다." },
      { en: "The schedule is too tight to add another test run.", ko: "일정이 너무 빠듯해서 시험 운전을 한 번 더 추가할 수 없습니다." },
    ],
    compare: [
      { a: "It's too early.", b: "It's so early.", ko: "too early는 '너무 일러서 아직 할 수 없다'(문제가 있음), so early는 '정말 이르다'(감정 강조, 문제라는 뜻은 없음)입니다. 판단을 말할 때는 too를 씁니다." },
      { a: "too early", b: "too late", ko: "too early는 '아직 때가 안 됐다'(데이터가 부족해서 결정 못 함), too late는 '이미 때가 지났다'(이제 바꿀 수 없음)입니다. '결정하기 이르다'를 late로 말하면 정반대 뜻이 됩니다." },
      { a: "The temperature is too high.", b: "The temperature is very high.", ko: "very high는 단순히 '매우 높다', too high는 '허용 범위를 넘어서 문제다'입니다." },
    ],
    mistakes: [
      { wrong: "I think so late.", right: "I think it's too early.", ko: "'so late'는 '너무 늦었다'는 뜻이라 '아직 결정하기 이르다'는 의도와 반대입니다. 또 I think 뒤에는 it's 같은 주어 + 동사가 필요합니다." },
      { wrong: "It's too early for decide.", right: "It's too early to decide.", ko: "too + 형용사 뒤에 동사가 오면 to + 동사원형을 씁니다." },
      { wrong: "It's very early to decide.", right: "It's too early to decide.", ko: "very에는 '그래서 할 수 없다'는 뜻이 없어서 to + 동사와 함께 쓰면 부자연스럽습니다. 판단은 too로 말합니다." },
    ],
  },

  "word-order": {
    skill: "word-order",
    summaryKo: "영어는 '주어 + 동사 + 목적어'를 붙여 쓰고, first, again, later 같은 부사는 목적어 뒤(문장 끝)나 문장 맨 앞에 둡니다. 동사와 목적어 사이에는 부사를 넣지 않습니다.",
    simpleKo:
      "동사와 목적어는 자석처럼 붙어 있다고 생각하세요. check와 the feed rate 사이에는 아무것도 끼어들 수 없습니다. '먼저'는 맨 뒤(first)나 맨 앞(First,)에 둡니다. 그리고 목적어는 한 번만 씁니다(it과 명사를 둘 다 쓰지 않음).",
    rules: [
      { formula: "주어 + 동사 + 목적어 + 부사", ko: "first / again / later 같은 부사는 목적어 뒤에 둡니다.", example: "We check the actual feed rate first." },
      { formula: "First, + 주어 + 동사 + 목적어", ko: "순서를 강조할 때는 문장 맨 앞에 두고 쉼표를 찍습니다.", example: "First, we need to confirm the design basis." },
      { formula: "목적어는 한 번만: it 또는 명사", ko: "명사를 썼다면 it을 또 쓰지 않습니다.", example: "We check it first. / We check the feed rate first." },
      { formula: "주어 + 동사 + 목적어 + 장소 + 시간", ko: "장소를 먼저, 시간을 마지막에 둡니다.", example: "We tested the dryer at the pilot plant last week." },
    ],
    anatomy: [
      {
        sentence: "We check the actual feed rate first.",
        parts: [
          p("We", "subject", "주어"),
          p("check", "verb", "동사", true),
          p("the actual feed rate", "object", "목적어(동사 바로 뒤)", true),
          p("first.", "adverb", "부사(목적어 뒤)", true),
        ],
      },
      {
        sentence: "First, we need to confirm the design basis.",
        parts: [
          p("First,", "adverb", "부사(문장 맨 앞)", true),
          p("we", "subject", "주어"),
          p("need to confirm", "verb", "동사"),
          p("the design basis.", "object", "목적어"),
        ],
      },
    ],
    examples: [
      { en: "We will review the P&ID first.", ko: "먼저 P&ID를 검토하겠습니다." },
      { en: "Please send the datasheet again.", ko: "데이터시트를 다시 보내 주세요." },
      { en: "We will update the heat balance later.", ko: "열수지는 나중에 업데이트하겠습니다." },
      { en: "First, we need to confirm the design basis.", ko: "먼저 설계 기준을 확정해야 합니다." },
      { en: "We tested the dryer at the pilot plant last week.", ko: "지난주에 파일럿 플랜트에서 건조기를 시험했습니다." },
    ],
    compare: [
      { a: "We check the feed rate first.", b: "First, we check the feed rate.", ko: "둘 다 맞습니다. 문장 끝의 first는 자연스러운 보고이고, 문장 맨 앞의 First,는 '첫째, 둘째…'처럼 순서를 강조합니다." },
      { a: "We check it first.", b: "We check the feed rate first.", ko: "it과 the feed rate는 같은 목적어입니다. 둘 중 하나만 씁니다. 처음 말할 때는 명사, 이미 말한 것을 다시 가리킬 때는 it을 씁니다." },
      { a: "We also checked the valve.", b: "We checked the valve again.", ko: "also, always, often 같은 부사는 일반동사 앞에, again, first, later는 목적어 뒤에 둡니다." },
    ],
    mistakes: [
      { wrong: "We check it first the actual feed rate.", right: "We check the actual feed rate first.", ko: "목적어(the actual feed rate)가 있는데 it을 또 썼고, first가 동사와 목적어 사이에 들어갔습니다. '동사 + 목적어 + first' 순서로 씁니다." },
      { wrong: "Please send again the datasheet.", right: "Please send the datasheet again.", ko: "again은 동사와 목적어 사이가 아니라 목적어 뒤에 둡니다." },
      { wrong: "We will check tomorrow the pump.", right: "We will check the pump tomorrow.", ko: "시간 표현(tomorrow)은 목적어 뒤, 문장 끝에 둡니다." },
    ],
  },

  // ───────────────────────────── nouns ─────────────────────────────
  articles: {
    skill: "articles",
    summaryKo: "처음 말하는 셀 수 있는 단수 명사에는 a/an, 듣는 사람도 어떤 것인지 아는 특정한 대상에는 the를 씁니다. 셀 수 있는 단수 명사는 관사 없이 혼자 쓰지 않습니다.",
    simpleKo:
      "a는 '어떤 하나', the는 '우리가 다 아는 바로 그것'입니다. a pump는 아무 펌프 한 대, the pump는 회의에서 이미 말한 바로 그 펌프입니다. 실제 값이나 특정 문서(the actual feed rate, the final datasheet)에는 대부분 the를 씁니다.",
    rules: [
      { formula: "a / an + 셀 수 있는 단수 명사", ko: "처음 말하는 하나입니다. an은 모음 '소리' 앞에 씁니다(an hour, an EPC contractor, a unit).", example: "We need a new pump." },
      { formula: "the + 특정한 명사", ko: "서로 알고 있는 것, 이미 말한 것, 하나뿐인 것에 씁니다.", example: "Please check the actual feed rate." },
      { formula: "the + same / first / final / 최상급", ko: "하나로 정해지는 대상에 씁니다.", example: "This is the final datasheet." },
      { formula: "관사 없음 + 일반적인 복수 / 셀 수 없는 명사", ko: "특정하지 않은 일반적인 이야기에 씁니다.", example: "Steam is expensive at this site." },
    ],
    anatomy: [
      {
        sentence: "We need a new pump for the washing line.",
        parts: [
          p("We", "subject", "주어"),
          p("need", "verb", "동사"),
          p("a", "article", "부정관사(처음 말함)", true),
          p("new pump", "noun", "명사"),
          p("for", "preposition", "전치사"),
          p("the", "article", "정관사(서로 아는 것)", true),
          p("washing line.", "noun", "명사"),
        ],
      },
      {
        sentence: "Please check the actual feed rate.",
        parts: [
          p("Please", "polite marker", "정중 표현"),
          p("check", "verb", "동사"),
          p("the", "article", "정관사(특정한 값)", true),
          p("actual feed rate.", "noun", "명사"),
        ],
      },
    ],
    examples: [
      { en: "We need a new pump for the washing line.", ko: "세척 라인에 새 펌프가 한 대 필요합니다." },
      { en: "Please check the actual feed rate.", ko: "실제 원료 투입량을 확인해 주세요." },
      { en: "The vendor sent an updated quotation yesterday.", ko: "벤더가 어제 수정된 견적서를 보냈습니다." },
      { en: "The quotation does not include the spare parts.", ko: "그 견적서에는 예비 부품이 포함되어 있지 않습니다." },
      { en: "We will run a test at the pilot plant.", ko: "파일럿 플랜트에서 시험을 한 번 하겠습니다." },
    ],
    compare: [
      { a: "a pump", b: "the pump", ko: "a pump는 '펌프 한 대(아직 정해지지 않음)', the pump는 '우리가 말하고 있는 바로 그 펌프'입니다." },
      { a: "an hour / an EPC contractor", b: "a unit / a user", ko: "a와 an은 철자가 아니라 첫 소리로 고릅니다. hour, EPC는 모음 소리로 시작해서 an, unit, user는 '유' 소리(자음)로 시작해서 a입니다." },
      { a: "Steam is expensive.", b: "The steam from the boiler is wet.", ko: "일반적인 이야기는 관사 없이, 특정한 스팀(이 보일러에서 나오는 스팀)은 the를 씁니다." },
    ],
    mistakes: [
      { wrong: "Check for actual feed rate.", right: "Check the actual feed rate.", ko: "실제 투입량은 특정한 값이므로 the가 필요합니다. 또 check 뒤에는 for를 쓰지 않습니다." },
      { wrong: "We need new pump.", right: "We need a new pump.", ko: "셀 수 있는 단수 명사(pump)는 관사 없이 혼자 쓰지 않습니다." },
      { wrong: "The vendor sent a updated quotation.", right: "The vendor sent an updated quotation.", ko: "updated는 모음 소리로 시작하므로 an을 씁니다." },
    ],
  },

  countability: {
    skill: "countability",
    summaryKo: "data, equipment, information, advice, feedback 같은 셀 수 없는 명사에는 -s와 a/an을 붙이지 않고 단수 동사를 씁니다. 개수를 세야 할 때는 a piece of 또는 data point처럼 셀 수 있는 말을 씁니다.",
    simpleKo:
      "물이나 스팀처럼 '덩어리'로 생각하는 명사는 개수를 셀 수 없어서 -s가 붙지 않습니다. 영어에서는 data, equipment, information도 이런 덩어리 명사입니다. 한국어로 '장비들', '정보들'이라고 해도 영어로는 equipment, information 그대로 씁니다.",
    rules: [
      { formula: "data / equipment / information + 단수 동사", ko: "-s를 붙이지 않고 단수로 취급합니다.", example: "All the equipment is ready for shipping." },
      { formula: "much / a lot of / some / more + 셀 수 없는 명사", ko: "양을 말할 때 씁니다. many는 쓰지 않습니다.", example: "We need more information about the feed." },
      { formula: "a piece of / two pieces of + 셀 수 없는 명사", ko: "하나, 둘을 세고 싶을 때 씁니다.", example: "Two pieces of equipment are still missing." },
      { formula: "셀 수 있는 대체어: data points, equipment items, results", ko: "개수가 중요하면 셀 수 있는 단어로 바꿉니다.", example: "We collected 48 data points during the test." },
    ],
    anatomy: [
      {
        sentence: "We need more information about the feed composition.",
        parts: [
          p("We", "subject", "주어"),
          p("need", "verb", "동사"),
          p("more", "quantity", "양 표현"),
          p("information", "uncountable noun", "셀 수 없는 명사(-s 없음)", true),
          p("about the feed composition.", "prepositional phrase", "전치사구"),
        ],
      },
      {
        sentence: "All the equipment is ready for shipping.",
        parts: [
          p("All the equipment", "subject", "셀 수 없는 주어", true),
          p("is", "verb (singular)", "단수 동사", true),
          p("ready for shipping.", "complement", "보어(상태)"),
        ],
      },
    ],
    examples: [
      { en: "We need more operating data before we decide.", ko: "결정하기 전에 운전 데이터가 더 필요합니다." },
      { en: "All the equipment is ready for shipping.", ko: "모든 장비가 출하 준비가 되었습니다." },
      { en: "Could you send us more information about the steam quality?", ko: "스팀 품질에 대한 정보를 더 보내 주시겠습니까?" },
      { en: "The client gave us some feedback on the PFD.", ko: "고객이 PFD에 대해 의견을 주었습니다." },
      { en: "Two pieces of equipment are still missing from the list.", ko: "장비 두 개가 아직 목록에서 빠져 있습니다." },
      { en: "We collected 48 data points during the test run.", ko: "시험 운전 중에 데이터 포인트 48개를 수집했습니다." },
    ],
    compare: [
      { a: "much data / a lot of data", b: "many results / a lot of results", ko: "셀 수 없는 명사에는 much(주로 부정문·질문), 셀 수 있는 복수에는 many를 씁니다. a lot of는 둘 다 가능합니다." },
      { a: "equipment", b: "a piece of equipment / an equipment item", ko: "장비 '한 대'를 셀 때는 an equipment가 아니라 a piece of equipment 또는 an equipment item이라고 합니다." },
      { a: "some advice", b: "two suggestions", ko: "advice는 셀 수 없고 suggestion은 셀 수 있습니다. 개수를 말하려면 suggestion을 쓰세요." },
    ],
    mistakes: [
      { wrong: "We need more informations.", right: "We need more information.", ko: "information은 셀 수 없는 명사라 -s를 붙이지 않습니다." },
      { wrong: "The equipments are ready.", right: "The equipment is ready.", ko: "equipment는 -s 없이 쓰고 단수 동사(is)를 씁니다." },
      { wrong: "How many data do you have?", right: "How much data do you have?", ko: "data는 셀 수 없는 명사로 취급하므로 many가 아니라 much를 씁니다." },
      { wrong: "Please give me an advice.", right: "Please give me some advice.", ko: "advice는 셀 수 없으므로 a/an을 붙이지 않습니다." },
    ],
  },

  // ───────────────────────────── future & modals ─────────────────────────────
  "future-plan": {
    skill: "future-plan",
    summaryKo: "지금 정하는 결정·약속은 will, 이미 정한 계획은 be going to / be planning to, 날짜와 상대가 확정된 일정은 현재진행형(We are meeting the vendor on Monday)으로 말합니다.",
    simpleKo:
      "회의에서 '~하겠습니다'(지금 약속)는 will, '~할 예정입니다'(이미 계획함)는 be going to 또는 be planning to입니다. 어느 쪽이든 뒤에는 동사원형이 옵니다.",
    rules: [
      { formula: "will + 동사원형", ko: "지금 결정하거나 약속하는 일입니다.", example: "I will send the revised datasheet today." },
      { formula: "be going to + 동사원형", ko: "이미 정한 계획, 또는 근거가 있는 예측입니다.", example: "We are going to start the test run next Monday." },
      { formula: "be planning to + 동사원형", ko: "계획 중인 일입니다(아직 바뀔 수 있음).", example: "We are planning to visit the site in March." },
      { formula: "be + V-ing + 미래 시간", ko: "날짜와 상대가 정해진 일정입니다.", example: "We are meeting the vendor on Thursday." },
    ],
    anatomy: [
      {
        sentence: "We are going to start the test run next Monday.",
        parts: [
          p("We", "subject", "주어"),
          p("are going to", "future (plan)", "미래(예정)", true),
          p("start", "base verb", "동사원형", true),
          p("the test run", "object", "목적어"),
          p("next Monday.", "time", "시간"),
        ],
      },
      {
        sentence: "I will send the revised datasheet today.",
        parts: [
          p("I", "subject", "주어"),
          p("will", "modal", "조동사(약속)", true),
          p("send", "base verb", "동사원형", true),
          p("the revised datasheet", "object", "목적어"),
          p("today.", "time", "시간"),
        ],
      },
    ],
    examples: [
      { en: "I will send you the minutes after the meeting.", ko: "회의 후에 회의록을 보내 드리겠습니다." },
      { en: "We are going to replace the feed pump next month.", ko: "다음 달에 원료 펌프를 교체할 예정입니다." },
      { en: "The Indonesian team is planning to run the dryer at full load.", ko: "인도네시아 팀은 건조기를 정격 부하로 운전할 계획입니다." },
      { en: "We are meeting the vendor on Thursday to discuss the quotation.", ko: "견적서를 논의하기 위해 목요일에 벤더를 만납니다." },
      { en: "Commissioning will probably start in July.", ko: "시운전은 아마 7월에 시작할 것입니다." },
    ],
    compare: [
      { a: "I will check it.", b: "I am going to check it.", ko: "will은 '지금 그렇게 하기로 한다'(즉석 결정·약속), be going to는 '이미 하기로 정해 두었다'(계획)는 느낌입니다." },
      { a: "We are planning to start in May.", b: "We will start in May.", ko: "be planning to는 아직 계획 단계라 바뀔 수 있다는 여지가 있고, will은 더 확정적으로 들립니다." },
      { a: "We are meeting the vendor on Monday.", b: "We meet the vendor every Monday.", ko: "현재진행형 + 미래 시간은 정해진 일정 하나, 현재형은 매주 반복되는 일정입니다." },
    ],
    mistakes: [
      { wrong: "I will to send the file.", right: "I will send the file.", ko: "will 같은 조동사 뒤에는 to 없이 동사원형을 씁니다." },
      { wrong: "We are going to starting the test.", right: "We are going to start the test.", ko: "be going to 뒤에는 동사원형이 옵니다." },
      { wrong: "We planning to visit the site.", right: "We are planning to visit the site.", ko: "진행형 계획 표현이므로 be동사(are)가 필요합니다." },
    ],
  },

  "modal-possibility": {
    skill: "modal-possibility",
    summaryKo: "확실하지 않은 가능성은 might / may / could + 동사원형으로 말합니다. will은 '확실하다'는 뜻이라 가능성만 있을 때 쓰면 약속처럼 강하게 들립니다.",
    simpleKo:
      "확신의 정도를 대략 숫자로 생각해 보세요. will은 거의 확실, may는 반반 정도, might / could는 그보다 약한 가능성입니다. 기술 회의에서 '~할 수도 있다'를 will로 말하면 상대는 확정된 사실로 받아들입니다.",
    rules: [
      { formula: "might / may / could + 동사원형", ko: "~할 수도 있다(불확실한 가능성).", example: "The delivery might be delayed." },
      { formula: "might not / may not + 동사원형", ko: "~하지 않을 수도 있다. could not은 '할 수 없었다'라는 다른 뜻이 되기 쉬우니 주의합니다.", example: "The current pump might not be large enough." },
      { formula: "might have to + 동사원형", ko: "~해야 할 수도 있다(가능성 + 필요).", example: "We might have to change the specification later." },
      { formula: "We could + 동사원형", ko: "선택지를 제안할 때도 could를 씁니다(~하는 방법도 있다).", example: "We could use a second dryer." },
    ],
    anatomy: [
      {
        sentence: "We might have to change the specification later.",
        parts: [
          p("We", "subject", "주어"),
          p("might", "modal", "가능성 조동사", true),
          p("have to change", "necessity + base verb", "필요 + 동사원형", true),
          p("the specification", "object", "목적어"),
          p("later.", "adverb", "부사(나중에)"),
        ],
      },
      {
        sentence: "The delivery may be delayed by two weeks.",
        parts: [
          p("The delivery", "subject", "주어"),
          p("may", "modal", "가능성 조동사", true),
          p("be delayed", "base form (be + p.p.)", "동사원형(be + 과거분사)", true),
          p("by two weeks.", "amount", "정도(2주)"),
        ],
      },
    ],
    examples: [
      { en: "The actual moisture content might be higher than the lab data.", ko: "실제 수분 함량은 실험 데이터보다 높을 수도 있습니다." },
      { en: "We may need a larger heat exchanger.", ko: "더 큰 열교환기가 필요할 수도 있습니다." },
      { en: "The vendor could deliver the dryer earlier if we order now.", ko: "지금 발주하면 벤더가 건조기를 더 일찍 납품할 수도 있습니다." },
      { en: "We might have to change the specification later.", ko: "나중에 사양을 변경해야 할 수도 있습니다." },
      { en: "The steam supply might not be stable during start-up.", ko: "기동 중에는 스팀 공급이 불안정할 수도 있습니다." },
    ],
    compare: [
      { a: "It will be delayed.", b: "It might be delayed.", ko: "will은 '지연된다'(확실), might는 '지연될 수도 있다'(불확실)입니다." },
      { a: "We might have to change it.", b: "We must change it.", ko: "might have to는 '바꿔야 할 수도 있다'(가능성), must는 '반드시 바꿔야 한다'(확정된 필요)입니다." },
      { a: "The pump can handle 10 m³/h.", b: "The pump might fail.", ko: "can은 능력·가능('처리할 수 있다'), might / may는 추측('고장 날지도 모른다')입니다." },
    ],
    mistakes: [
      { wrong: "It might changes.", right: "It might change.", ko: "조동사 뒤에는 항상 동사원형을 씁니다(-s를 붙이지 않음)." },
      { wrong: "We might to need more data.", right: "We might need more data.", ko: "might 뒤에는 to를 쓰지 않습니다." },
      { wrong: "Maybe we will must change it.", right: "We might have to change it.", ko: "조동사 두 개(will must)를 겹쳐 쓸 수 없습니다. '~해야 할 수도 있다'는 might have to로 말합니다." },
    ],
  },

  "modal-necessity": {
    skill: "modal-necessity",
    summaryKo: "필요·의무는 have to / need to(~해야 한다), 강한 규칙·안전은 must, 권고는 should(~하는 것이 좋다)로 말합니다. 뒤에는 모두 동사원형이 옵니다.",
    simpleKo:
      "강도 순서로 기억하세요: must(꼭, 규칙·안전) > have to / need to(해야 함) > should(하는 게 좋음). 부정형은 뜻이 크게 달라집니다: don't have to는 '안 해도 된다', must not은 '하면 안 된다'입니다.",
    rules: [
      { formula: "have to / need to + 동사원형", ko: "~해야 합니다(필요).", example: "We need to check the suction pressure." },
      { formula: "must + 동사원형", ko: "반드시 ~해야 합니다(규칙·안전).", example: "You must close the valve before maintenance." },
      { formula: "should + 동사원형", ko: "~하는 것이 좋습니다(권고·의견).", example: "We should order the long-lead items early." },
      { formula: "don't have to (불필요) / must not (금지)", ko: "'안 해도 된다'와 '하면 안 된다'는 완전히 다릅니다.", example: "You don't have to attend. / You must not open this valve." },
    ],
    anatomy: [
      {
        sentence: "We need to check the suction pressure before start-up.",
        parts: [
          p("We", "subject", "주어"),
          p("need to", "necessity", "필요", true),
          p("check", "base verb", "동사원형", true),
          p("the suction pressure", "object", "목적어"),
          p("before start-up.", "time", "시간"),
        ],
      },
      {
        sentence: "You must not open this valve during operation.",
        parts: [
          p("You", "subject", "주어"),
          p("must not", "prohibition", "금지", true),
          p("open", "base verb", "동사원형", true),
          p("this valve", "object", "목적어"),
          p("during operation.", "time", "시간"),
        ],
      },
    ],
    examples: [
      { en: "We have to submit the Pre-FEED report by the end of May.", ko: "5월 말까지 Pre-FEED 보고서를 제출해야 합니다." },
      { en: "We need to confirm the steam pressure with the client.", ko: "고객과 스팀 압력을 확정해야 합니다." },
      { en: "We should order the long-lead items early.", ko: "장납기 품목은 일찍 발주하는 것이 좋겠습니다." },
      { en: "Operators must wear gloves near the steam line.", ko: "운전원은 스팀 라인 근처에서 반드시 장갑을 착용해야 합니다." },
      { en: "We don't have to change the pump; the current one is large enough.", ko: "펌프를 바꿀 필요는 없습니다. 현재 펌프로 충분합니다." },
    ],
    compare: [
      { a: "You don't have to open the valve.", b: "You must not open the valve.", ko: "don't have to는 '열 필요가 없다(열어도 되고 안 열어도 된다)', must not은 '절대 열면 안 된다(금지)'입니다." },
      { a: "We have to change the design.", b: "We should change the design.", ko: "have to는 선택의 여지가 없는 필요, should는 의견·권고입니다. 고객에게 제안할 때는 should가 덜 강하게 들립니다." },
      { a: "We need to check the data.", b: "We need more data.", ko: "need 뒤에 동사가 오면 to + 동사원형, 명사가 오면 바로 씁니다." },
    ],
    mistakes: [
      { wrong: "We must to check the valve.", right: "We must check the valve.", ko: "must 뒤에는 to 없이 동사원형을 씁니다." },
      { wrong: "We need check the data.", right: "We need to check the data.", ko: "need 뒤에 동사가 올 때는 to가 필요합니다." },
      { wrong: "We have to changed the design.", right: "We have to change the design.", ko: "have to 뒤에는 동사원형을 씁니다." },
      { wrong: "You must not attend the meeting.", right: "You don't have to attend the meeting.", ko: "'안 와도 된다'는 뜻이라면 don't have to입니다. must not은 '오면 안 된다'는 금지가 됩니다." },
    ],
  },

  "present-perfect": {
    skill: "present-perfect",
    summaryKo: "과거에 일어난 일이 지금과 연결될 때(아직 ~하지 않았다, 이미 ~했다, ~해 왔다) have/has + 과거분사를 씁니다. yesterday, last week 같은 끝난 과거 시점과는 함께 쓰지 않습니다.",
    simpleKo:
      "과거형은 '그때 그 일'(사진 한 장), 현재완료는 '그 일 때문에 생긴 지금 상태'입니다. '아직 안 했다'는 haven't … yet, '이미 했다'는 have already …, '방금 했다'는 have just …로 외우세요.",
    rules: [
      { formula: "have / has + not + p.p. + yet", ko: "아직 ~하지 않았습니다(앞으로 할 예정).", example: "We haven't decided the final dryer capacity yet." },
      { formula: "have / has + already / just + p.p.", ko: "이미 / 방금 ~했습니다.", example: "The vendor has already sent the quotation." },
      { formula: "have / has + p.p. + for / since", ko: "~동안 / ~이후로 지금까지 계속.", example: "We have used this dryer since 2022." },
      { formula: "과거형 + 끝난 시점(yesterday, last week)", ko: "끝난 시점이 있으면 현재완료가 아니라 과거형을 씁니다.", example: "We sent the datasheet yesterday." },
    ],
    anatomy: [
      {
        sentence: "We haven't decided the final dryer capacity yet.",
        parts: [
          p("We", "subject", "주어"),
          p("haven't", "have + not", "have + not", true),
          p("decided", "p.p.", "과거분사", true),
          p("the final dryer capacity", "object", "목적어"),
          p("yet.", "adverb", "부사(아직)", true),
        ],
      },
      {
        sentence: "The vendor has already sent the quotation.",
        parts: [
          p("The vendor", "subject", "주어(단수)"),
          p("has", "have", "have(3인칭 단수)", true),
          p("already", "adverb", "부사(이미)"),
          p("sent", "p.p.", "과거분사", true),
          p("the quotation.", "object", "목적어"),
        ],
      },
    ],
    examples: [
      { en: "We haven't decided the final dryer capacity yet because we need more operating data.", ko: "운전 데이터가 더 필요해서 아직 최종 건조기 용량을 정하지 않았습니다." },
      { en: "We haven't received the lab results yet.", ko: "아직 실험 결과를 받지 못했습니다." },
      { en: "The vendor has already sent the revised quotation.", ko: "벤더가 이미 수정된 견적서를 보냈습니다." },
      { en: "We have just finished the hydrotest.", ko: "방금 수압 시험을 마쳤습니다." },
      { en: "Have you checked the new P&ID?", ko: "새 P&ID를 확인하셨습니까?" },
      { en: "We have run the pilot dryer for 300 hours since March.", ko: "3월 이후로 파일럿 건조기를 300시간 운전했습니다." },
    ],
    compare: [
      { a: "We have sent the datasheet.", b: "We sent the datasheet yesterday.", ko: "시점 없이 '보낸 상태다'(결과)는 현재완료, yesterday처럼 끝난 시점이 있으면 과거형입니다." },
      { a: "We haven't decided yet.", b: "We didn't decide at the meeting.", ko: "haven't decided yet은 '아직 결정하지 않았다(앞으로 결정할 예정)', didn't decide는 '(그 회의에서) 결정하지 않았다'는 끝난 사실입니다." },
      { a: "We have been testing the dryer for two weeks.", b: "We have tested the dryer three times.", ko: "have been V-ing은 지금도 계속되는 기간을, have + p.p.는 결과나 횟수를 강조합니다." },
    ],
    mistakes: [
      { wrong: "We have sent it yesterday.", right: "We sent it yesterday.", ko: "yesterday처럼 끝난 과거 시점은 현재완료와 함께 쓰지 않습니다. 과거형을 씁니다." },
      { wrong: "We have not decide yet.", right: "We have not decided yet.", ko: "have 뒤에는 동사원형이 아니라 과거분사(decided)를 씁니다." },
      { wrong: "We still not received the data.", right: "We still haven't received the data.", ko: "have가 빠졌습니다. '아직 받지 못했다'는 haven't received로 말합니다." },
      { wrong: "The vendor have sent the quotation.", right: "The vendor has sent the quotation.", ko: "단수 주어에는 has를 씁니다." },
    ],
  },

  "prep-gerund": {
    skill: "prep-gerund",
    summaryKo: "before, after, without, by, for 같은 전치사 뒤에 동사가 오면 동명사(V-ing)를 씁니다. before와 after는 접속사로도 쓰이므로 뒤에 '주어 + 동사'가 올 수도 있습니다.",
    simpleKo:
      "전치사 뒤에는 '이름(명사)'이 와야 합니다. 동사를 이름으로 바꾸는 방법이 -ing입니다: complete(완료하다) → completing(완료하는 것). 그래서 before completing입니다. 동사원형을 바로 붙이면 안 됩니다.",
    rules: [
      { formula: "before + 명사", ko: "명사가 바로 옵니다.", example: "Before the meeting, please read the report." },
      { formula: "before + V-ing", ko: "동사는 -ing 형태로 바꿉니다. 주어는 주절의 주어와 같습니다.", example: "Before completing the design, we need the final feed composition." },
      { formula: "before + 주어 + 동사(현재형)", ko: "주어를 넣으면 접속사가 됩니다. 미래 일이어도 현재형을 씁니다.", example: "Before we complete the design, we need the final feed composition." },
      { formula: "after / without / by + V-ing", ko: "~한 후에 / ~하지 않고 / ~함으로써.", example: "We reduced the outlet moisture by increasing the steam pressure." },
    ],
    anatomy: [
      {
        sentence: "Before completing our design, we need the final feed data.",
        parts: [
          p("Before", "preposition", "전치사", true),
          p("completing", "V-ing", "동명사", true),
          p("our design,", "object", "목적어"),
          p("we", "subject", "주어"),
          p("need", "verb", "동사"),
          p("the final feed data.", "object", "목적어"),
        ],
      },
      {
        sentence: "Before we complete the design, we must confirm the feed rate.",
        parts: [
          p("Before", "conjunction", "접속사", true),
          p("we", "subject", "주어", true),
          p("complete", "verb (present)", "동사(현재형)", true),
          p("the design,", "object", "목적어"),
          p("we", "subject", "주어"),
          p("must confirm", "verb", "동사"),
          p("the feed rate.", "object", "목적어"),
        ],
      },
    ],
    examples: [
      { en: "Before completing the design, we need the final feed composition.", ko: "설계를 완료하기 전에 최종 원료 조성이 필요합니다." },
      { en: "Before we start the pump, we must check the suction valve.", ko: "펌프를 기동하기 전에 흡입 밸브를 확인해야 합니다." },
      { en: "After reviewing the P&ID, we will send our comments.", ko: "P&ID를 검토한 후에 코멘트를 보내겠습니다." },
      { en: "We cannot finalize the dryer size without knowing the actual feed rate.", ko: "실제 원료 투입량을 모르고서는 건조기 크기를 확정할 수 없습니다." },
      { en: "We reduced the outlet moisture by increasing the steam pressure.", ko: "스팀 압력을 높여서 출구 수분을 낮췄습니다." },
      { en: "Thank you for sending the updated datasheet.", ko: "수정된 데이터시트를 보내 주셔서 감사합니다." },
    ],
    compare: [
      { a: "Before completing the design,", b: "Before we complete the design,", ko: "둘 다 맞습니다. V-ing는 주어가 주절과 같을 때 짧게 쓰는 형태이고, 주어 + 동사는 누가 하는지 분명히 말할 때 씁니다. 'Before complete'는 틀립니다." },
      { a: "Before we complete the design,", b: "Before we will complete the design,", ko: "before 뒤의 절에서는 미래 일이어도 현재형을 씁니다. will을 넣으면 틀립니다." },
      { a: "We need more data to finish the design.", b: "Thank you for finishing the design.", ko: "목적(~하기 위해)은 to + 동사원형, 감사·이유처럼 전치사 for가 필요한 자리에는 for + V-ing를 씁니다." },
    ],
    mistakes: [
      { wrong: "Before complete our design,", right: "Before completing our design,", ko: "before가 전치사로 쓰이면 뒤에 명사나 동명사(V-ing)가 옵니다. 동사원형(complete)은 바로 올 수 없습니다. 주어를 넣어 'Before we complete our design,'도 가능합니다." },
      { wrong: "After check the P&ID, we will reply.", right: "After checking the P&ID, we will reply.", ko: "after 뒤에 동사가 오면 V-ing로 씁니다." },
      { wrong: "We can't decide without to know the feed rate.", right: "We can't decide without knowing the feed rate.", ko: "without은 전치사이므로 to + 동사가 아니라 V-ing를 씁니다." },
      { wrong: "Thank you for send the data.", right: "Thank you for sending the data.", ko: "for도 전치사이므로 뒤의 동사는 V-ing입니다." },
    ],
  },

  "if-when": {
    skill: "if-when",
    summaryKo: "if는 일어날지 확실하지 않은 조건(만약 ~하면), when은 일어날 것이 확실한 일의 시점(~하면, ~할 때)에 씁니다. 둘 다 미래 일이어도 그 절 안에서는 현재형을 씁니다.",
    simpleKo:
      "'비가 오면'은 올지 모르니 if, '내일 아침이 되면'은 반드시 오니 when입니다. 데이터를 받는 것이 정해진 일이면 When we receive the data, 받을지 모르면 If we receive the data입니다. 한국어 '~하면'은 둘 다 될 수 있으니 '확실한가?'로 고르세요.",
    rules: [
      { formula: "If + 현재형, will / can + 동사원형", ko: "일어날지 불확실한 조건입니다.", example: "If the vendor confirms the price, we will place the order." },
      { formula: "When + 현재형, will / can + 동사원형", ko: "일어날 것이 확실한 일과 그 시점입니다.", example: "When we receive the data, we will update the datasheet." },
      { formula: "if / when 절 안에는 will 금지", ko: "미래의 일이어도 현재형을 씁니다. will은 주절에만 씁니다.", example: "When the dryer arrives, we will install it." },
      { formula: "When + 과거형, 과거형", ko: "과거에 ~했을 때 일어난 일입니다.", example: "When we started the pump, the pressure dropped." },
    ],
    anatomy: [
      {
        sentence: "When we receive the data, we will update the datasheet.",
        parts: [
          p("When", "conjunction", "접속사(확실한 일)", true),
          p("we", "subject", "주어"),
          p("receive", "verb (present)", "현재형(미래 의미)", true),
          p("the data,", "object", "목적어"),
          p("we", "subject", "주어"),
          p("will update", "result verb", "결과(will)"),
          p("the datasheet.", "object", "목적어"),
        ],
      },
      {
        sentence: "If the client approves the budget, we will start the FEED.",
        parts: [
          p("If", "conjunction", "접속사(불확실한 일)", true),
          p("the client", "subject", "주어"),
          p("approves", "verb (present)", "현재형(미래 의미)", true),
          p("the budget,", "object", "목적어"),
          p("we", "subject", "주어"),
          p("will start", "result verb", "결과(will)"),
          p("the FEED.", "object", "목적어"),
        ],
      },
    ],
    examples: [
      { en: "When we receive the vendor data, we will update the datasheet.", ko: "벤더 데이터를 받으면 데이터시트를 업데이트하겠습니다." },
      { en: "If we receive the data by Friday, we can finish the mass balance.", ko: "금요일까지 데이터를 받는다면 물질수지를 끝낼 수 있습니다." },
      { en: "When the test run finishes, please send me the log sheets.", ko: "시험 운전이 끝나면 로그 시트를 보내 주세요." },
      { en: "If the steam pressure drops below 5 bar(g), the dryer will stop.", ko: "스팀 압력이 5 bar(g) 아래로 떨어지면 건조기가 정지합니다." },
      { en: "If the client approves the budget, we will start the FEED in June.", ko: "고객이 예산을 승인하면 6월에 FEED를 시작하겠습니다." },
    ],
    compare: [
      { a: "When we receive the data,", b: "If we receive the data,", ko: "when은 '데이터는 반드시 온다, 오면 그때', if는 '데이터가 올지 모르지만 만약 온다면'입니다. 확실한 일에 if를 쓰면 상대가 '안 올 수도 있나?'라고 오해할 수 있습니다." },
      { a: "When the pump stops,", b: "If the pump stops,", ko: "when은 계획된 정지처럼 반드시 일어나는 경우, if는 고장처럼 일어날지 모르는 경우입니다." },
      { a: "When we receive the data,", b: "When will we receive the data?", ko: "시간절(When we receive …)에는 will을 쓰지 않지만, '언제?'라고 묻는 의문문에는 will을 씁니다." },
    ],
    mistakes: [
      { wrong: "If we accept data,", right: "When we receive the data,", ko: "데이터를 받는 것이 확실하면 if가 아니라 when을 씁니다. 또 데이터를 '받다'는 receive이고, accept는 '수락하다'라는 다른 뜻입니다." },
      { wrong: "When we will receive the data, we will update it.", right: "When we receive the data, we will update it.", ko: "when 절에서는 미래 일이어도 현재형을 씁니다." },
      { wrong: "If the dryer arrives next week as planned, we will install it.", right: "When the dryer arrives next week, we will install it.", ko: "납품 일정이 확정된 일이면 when이 자연스럽습니다. if를 쓰면 납품 여부 자체가 불확실하다는 뜻이 됩니다." },
    ],
  },

  collocation: {
    skill: "collocation",
    summaryKo: "기술 영어에는 정해진 '동사 + 명사' 짝이 있습니다(receive data, run a test, place an order). 한국어를 그대로 옮기면 뜻이 바뀌거나 어색해지므로 짝으로 외웁니다.",
    simpleKo:
      "'데이터를 받다'의 '받다'는 receive, '제안을 받아들이다'의 '받다'는 accept입니다. 한국어 한 단어가 영어에서는 여러 단어로 나뉘므로, 동사만 외우지 말고 명사와 묶어서 외우세요.",
    rules: [
      { formula: "receive + data / a report / the results", ko: "자료를 받습니다(전달받음).", example: "We received the vendor data yesterday." },
      { formula: "accept + a proposal / an offer / the conditions", ko: "제안이나 조건을 수락합니다.", example: "The client accepted our proposal." },
      { formula: "run / carry out + a test", ko: "시험을 합니다(make a test라고 하지 않음).", example: "We will run a test at the pilot plant next week." },
      { formula: "place an order / make a decision / take a sample", ko: "발주하다 / 결정하다 / 샘플을 채취하다.", example: "We need to place the order for the dryer this month." },
    ],
    anatomy: [
      {
        sentence: "We received the lab data this morning.",
        parts: [
          p("We", "subject", "주어"),
          p("received", "verb", "동사(받다)", true),
          p("the lab data", "object", "목적어(자료)", true),
          p("this morning.", "time", "시간"),
        ],
      },
      {
        sentence: "We will run a test at the pilot plant.",
        parts: [
          p("We", "subject", "주어"),
          p("will run", "verb", "동사(시험을 하다)", true),
          p("a test", "object", "목적어", true),
          p("at the pilot plant.", "place", "장소"),
        ],
      },
    ],
    examples: [
      { en: "When we receive the vendor data, we will update the datasheet.", ko: "벤더 데이터를 받으면 데이터시트를 업데이트하겠습니다." },
      { en: "The client accepted our proposal.", ko: "고객이 우리 제안을 수락했습니다." },
      { en: "We will run a test with the new feed next week.", ko: "다음 주에 새 원료로 시험을 하겠습니다." },
      { en: "We need to place the order for the dryer this month.", ko: "이번 달에 건조기를 발주해야 합니다." },
      { en: "Please take a sample at the decanter outlet.", ko: "디캔터 출구에서 샘플을 채취해 주세요." },
      { en: "We need to make a decision on the dryer type by Friday.", ko: "금요일까지 건조기 형식을 결정해야 합니다." },
    ],
    compare: [
      { a: "receive data", b: "accept data", ko: "receive data는 '데이터를 받다(전달받음)', accept data는 '데이터를 (검토한 뒤) 인정하다, 승인하다'입니다. 단순히 받는 것은 receive입니다." },
      { a: "run a test", b: "make a test", ko: "시험을 '하다'는 run / do / carry out a test입니다. make a test는 '시험 문제를 만들다'처럼 들려 어색합니다." },
      { a: "send the report", b: "submit the report", ko: "send는 단순히 보내는 것, submit은 검토·승인을 위해 공식적으로 제출하는 것입니다." },
    ],
    mistakes: [
      { wrong: "If we accept data,", right: "When we receive the data,", ko: "데이터를 '받다'는 receive입니다. accept는 '(제안·조건을) 수락하다'라는 뜻이라 의미가 달라집니다. 받는 것이 확실하면 if가 아니라 when을 씁니다." },
      { wrong: "We will make a test next week.", right: "We will run a test next week.", ko: "시험은 run / do / carry out과 함께 씁니다." },
      { wrong: "We will do an order for the pump.", right: "We will place an order for the pump.", ko: "발주는 place an order로 말합니다." },
    ],
  },

  // ───────────────────────────── conditionals & clauses ─────────────────────────────
  "time-clause": {
    skill: "time-clause",
    summaryKo: "when, until, as soon as, before, after가 이끄는 시간 부사절에서는 미래 일이라도 현재형(또는 현재완료)을 씁니다. will은 주절에만 씁니다.",
    simpleKo:
      "시간 부사절은 '언제'만 알려 주는 표지판입니다. '미래'라는 정보는 주절의 will이 이미 전달하므로 표지판 안에는 will을 또 쓰지 않습니다: As soon as we get the data, we will start.",
    rules: [
      { formula: "when / as soon as + 현재형, will + 동사원형", ko: "~하면 / ~하자마자.", example: "As soon as we get the results, we will send them to you." },
      { formula: "until + 현재형", ko: "~할 때까지(계속).", example: "We will keep the dryer running until the test finishes." },
      { formula: "before / after + 현재형", ko: "~하기 전에 / ~한 후에.", example: "After the vendor confirms the price, we will place the order." },
      { formula: "when / after + 현재완료", ko: "먼저 완전히 끝나는 것을 강조할 때 씁니다.", example: "When we have finished the hydrotest, we will start flushing." },
    ],
    anatomy: [
      {
        sentence: "As soon as we get the results, we will send them to you.",
        parts: [
          p("As soon as", "conjunction", "시간 접속사", true),
          p("we", "subject", "주어"),
          p("get", "verb (present)", "현재형(미래 의미)", true),
          p("the results,", "object", "목적어"),
          p("we", "subject", "주어"),
          p("will send", "main verb", "주절 동사(will)"),
          p("them to you.", "object + to", "목적어 + 받는 사람"),
        ],
      },
      {
        sentence: "We will wait until the vendor confirms the price.",
        parts: [
          p("We", "subject", "주어"),
          p("will wait", "main verb", "주절 동사(will)"),
          p("until", "conjunction", "시간 접속사", true),
          p("the vendor", "subject", "주어"),
          p("confirms", "verb (present)", "현재형(미래 의미)", true),
          p("the price.", "object", "목적어"),
        ],
      },
    ],
    examples: [
      { en: "As soon as we get the lab results, we will send them to you.", ko: "실험 결과를 받는 대로 보내 드리겠습니다." },
      { en: "We will keep the dryer running until the test finishes.", ko: "시험이 끝날 때까지 건조기를 계속 운전하겠습니다." },
      { en: "After the vendor confirms the price, we will place the order.", ko: "벤더가 가격을 확정한 후에 발주하겠습니다." },
      { en: "Please don't open the valve before the pressure drops.", ko: "압력이 떨어지기 전에는 밸브를 열지 마세요." },
      { en: "When we have finished the hydrotest, we will start flushing.", ko: "수압 시험을 마치면 플러싱을 시작하겠습니다." },
    ],
    compare: [
      { a: "We will wait until Friday.", b: "Please send it by Friday.", ko: "until은 '금요일까지 계속'(지속), by는 '늦어도 금요일까지는 완료'(마감)입니다." },
      { a: "When we finish the test,", b: "When we have finished the test,", ko: "둘 다 미래 의미입니다. have finished는 '완전히 끝낸 뒤에'라는 순서를 더 강조합니다." },
      { a: "As soon as we get the data,", b: "When we get the data,", ko: "as soon as는 '받자마자 바로'로 시간 간격이 없음을 강조합니다." },
    ],
    mistakes: [
      { wrong: "When we will get the data, we will send it.", right: "When we get the data, we will send it.", ko: "시간 부사절 안에서는 미래 일이어도 현재형을 씁니다." },
      { wrong: "We will wait until the vendor will confirm.", right: "We will wait until the vendor confirms.", ko: "until 절에도 will을 쓰지 않습니다. 단수 주어이므로 confirms입니다." },
      { wrong: "Before we will complete the design,", right: "Before we complete the design,", ko: "before 뒤에 주어 + 동사를 쓸 때도 현재형을 씁니다." },
      { wrong: "Please send it until Friday.", right: "Please send it by Friday.", ko: "마감은 by, 계속되는 기간은 until입니다." },
    ],
  },

  "cond-1": {
    skill: "cond-1",
    summaryKo: "1형 조건문은 실제로 일어날 수 있는 현재·미래의 조건과 그 결과를 말합니다: If + 현재형, will / can / might + 동사원형. if절에는 미래 일이라도 will을 쓰지 않습니다.",
    simpleKo:
      "'(이번 주에 실제로) ~하면, …할 것이다'라는 현실적인 계획입니다. 앞부분(if절)은 현재형, 뒷부분은 will / might / can입니다. 결과가 확실하면 will, 가능성만 있으면 might를 씁니다.",
    rules: [
      { formula: "If + 주어 + 현재형, 주어 + will + 동사원형", ko: "실제로 가능한 조건과 확실한 결과입니다.", example: "If we decide now, we will save two weeks." },
      { formula: "If + 현재형, might / may / could + 동사원형", ko: "결과가 불확실할 때 씁니다.", example: "If we decide now, we might have to change the specification later." },
      { formula: "If + 현재형, please + 동사원형", ko: "조건 + 요청·지시입니다.", example: "If the pressure drops below 4 bar(g), please stop the feed." },
      { formula: "주절 + if + 현재형", ko: "if절을 뒤에 둘 수도 있습니다. 이때는 쉼표를 쓰지 않습니다.", example: "We will start the test if the steam supply is stable." },
    ],
    anatomy: [
      {
        sentence: "If we decide now, we might have to change the specification later.",
        parts: [
          p("If", "conjunction", "조건 접속사", true),
          p("we", "subject", "주어"),
          p("decide now,", "verb (present)", "현재형(실제 가능한 조건)", true),
          p("we", "subject", "주어"),
          p("might have to change", "result", "결과(가능성 + 필요)", true),
          p("the specification", "object", "목적어"),
          p("later.", "adverb", "부사(나중에)"),
        ],
      },
      {
        sentence: "We will start the test if the steam supply is stable.",
        parts: [
          p("We", "subject", "주어"),
          p("will start", "result", "결과(will)", true),
          p("the test", "object", "목적어"),
          p("if", "conjunction", "조건 접속사"),
          p("the steam supply", "subject", "주어"),
          p("is stable.", "verb (present)", "현재형 조건", true),
        ],
      },
    ],
    examples: [
      { en: "If we decide now, we might have to change the specification later.", ko: "지금 결정하면 나중에 사양을 변경해야 할 수도 있습니다." },
      { en: "If the vendor confirms the price this week, we will place the order.", ko: "벤더가 이번 주에 가격을 확정하면 발주하겠습니다." },
      { en: "If the feed moisture is above 60 wt%, the dryer capacity will not be enough.", ko: "원료 수분이 60 wt%를 넘으면 건조기 용량이 부족할 것입니다." },
      { en: "If the pressure drops below 4 bar(g), please stop the feed.", ko: "압력이 4 bar(g) 아래로 떨어지면 원료 투입을 멈춰 주세요." },
      { en: "We can finish the mass balance if we receive the data by Friday.", ko: "금요일까지 데이터를 받으면 물질수지를 끝낼 수 있습니다." },
    ],
    compare: [
      { a: "If we decide now, we will save time.", b: "If we decided now, we would save time.", ko: "If + 현재형(decide)은 지금 실제로 결정할 수 있는 현실적인 조건입니다. If + 과거형(decided)은 과거 이야기가 아니라 '(실제로는 지금 결정하지 않겠지만) 지금 결정한다고 가정하면'이라는 현재의 가상입니다." },
      { a: "If we decide now,", b: "If we had decided earlier,", ko: "If + had + p.p.는 '(실제로는 그러지 않았지만) 그때 결정했더라면'이라는 과거 사실의 반대입니다. 이미 지난 일이므로 now와 함께 쓰지 않습니다." },
      { a: "If we decide now, we will have to change it.", b: "If we decide now, we might have to change it.", ko: "결과가 확실하면 will, 가능성만 있으면 might / may를 씁니다." },
    ],
    mistakes: [
      { wrong: "If we will decide now, we will save time.", right: "If we decide now, we will save time.", ko: "if절에는 미래 일이어도 will을 쓰지 않고 현재형을 씁니다." },
      { wrong: "If we decided now, we might have to change it later.", right: "If we decide now, we might have to change it later.", ko: "지금 실제로 결정할 수 있는 상황이면 현재형(decide)을 씁니다. decided를 쓰면 '실제로는 아니지만 가정하면'이라는 비현실적인 가정이 됩니다." },
      { wrong: "If the vendor confirm the price, we will order.", right: "If the vendor confirms the price, we will order.", ko: "if절도 주어-동사 일치를 지킵니다. 단수 주어이므로 confirms입니다." },
      { wrong: "If we decide now, we must change the specification later.", right: "If we decide now, we might have to change the specification later.", ko: "'~해야 할 수도 있다'는 가능성 + 필요이므로 might have to입니다. must는 확정된 의무입니다." },
    ],
  },

  "cause-effect": {
    skill: "cause-effect",
    summaryKo: "원인은 because + 주어 + 동사 또는 due to / because of + 명사로, 결과는 so + 주어 + 동사 또는 As a result, …로 연결합니다. because와 so는 한 문장에 함께 쓰지 않습니다.",
    simpleKo:
      "because는 '왜냐하면'(원인 쪽에 붙음), so는 '그래서'(결과 쪽에 붙음)입니다. 한국어는 '~때문에, 그래서'를 함께 써도 되지만 영어는 하나만 씁니다. 뒤에 문장이 오면 because, 명사만 오면 due to / because of입니다.",
    rules: [
      { formula: "결과 + because + 주어 + 동사", ko: "원인을 문장으로 말합니다.", example: "We haven't decided the dryer capacity because we need more operating data." },
      { formula: "원인, so + 주어 + 동사", ko: "결과를 문장으로 말합니다.", example: "The feed moisture is high, so we need a larger dryer." },
      { formula: "due to / because of + 명사", ko: "원인을 명사(구)로 말합니다.", example: "The commissioning is delayed due to the steam supply." },
      { formula: "원인. As a result, + 결과.", ko: "두 문장으로 나눠 말할 때 씁니다.", example: "The pump failed. As a result, we stopped the line for six hours." },
    ],
    anatomy: [
      {
        sentence: "We need a larger dryer because the feed moisture is high.",
        parts: [
          p("We need a larger dryer", "result", "결과"),
          p("because", "conjunction", "원인 접속사", true),
          p("the feed moisture is high.", "cause clause", "원인(주어 + 동사)", true),
        ],
      },
      {
        sentence: "The commissioning is delayed due to the steam supply.",
        parts: [
          p("The commissioning is delayed", "result", "결과"),
          p("due to", "preposition", "원인 전치사", true),
          p("the steam supply.", "cause noun", "원인(명사)", true),
        ],
      },
    ],
    examples: [
      { en: "We haven't decided the final dryer capacity yet because we need more operating data.", ko: "운전 데이터가 더 필요해서 아직 최종 건조기 용량을 정하지 않았습니다." },
      { en: "The feed moisture is higher than expected, so we need a larger dryer.", ko: "원료 수분이 예상보다 높아서 더 큰 건조기가 필요합니다." },
      { en: "The commissioning is a little delayed due to the steam supply.", ko: "스팀 공급 문제로 시운전이 조금 지연되고 있습니다." },
      { en: "The pump failed last night. As a result, we stopped the line for six hours.", ko: "어젯밤 펌프가 고장 났습니다. 그 결과 라인을 6시간 정지했습니다." },
      { en: "Because of the high fouling rate, we clean the heat exchanger every month.", ko: "파울링이 심해서 매달 열교환기를 청소합니다." },
    ],
    compare: [
      { a: "because the steam supply is unstable", b: "because of the unstable steam supply", ko: "because 뒤에는 주어 + 동사, because of / due to 뒤에는 명사(구)가 옵니다." },
      { a: "We stopped the dryer because the pressure dropped.", b: "The pressure dropped, so we stopped the dryer.", ko: "같은 내용입니다. because는 원인 앞에, so는 결과 앞에 둡니다. 둘을 한 문장에 함께 쓰지 않습니다." },
      { a: "so", b: "therefore", ko: "so는 회의에서 쓰기 쉬운 표현이고, therefore는 보고서용 격식 표현입니다. Therefore는 보통 문장 맨 앞에 쓰고 뒤에 쉼표를 둡니다." },
    ],
    mistakes: [
      { wrong: "Because the moisture is high, so we need a larger dryer.", right: "Because the moisture is high, we need a larger dryer.", ko: "because와 so를 함께 쓰지 않습니다. 하나만 남기세요: The moisture is high, so we need a larger dryer." },
      { wrong: "The test was delayed because the rain.", right: "The test was delayed because of the rain.", ko: "because 뒤에 명사만 오면 because of를 씁니다." },
      { wrong: "Due to the steam pressure was low, we stopped the dryer.", right: "Because the steam pressure was low, we stopped the dryer.", ko: "due to 뒤에는 주어 + 동사가 올 수 없습니다. 문장이면 because를 씁니다." },
    ],
  },

  "purpose-to": {
    skill: "purpose-to",
    summaryKo: "목적(~하기 위해)은 to + 동사원형 또는 in order to + 동사원형으로 말합니다. for 뒤에는 명사가 오며, for + 동사원형은 쓰지 않습니다.",
    simpleKo:
      "'~하려고, ~하기 위해'는 to + 동사원형 하나면 충분합니다. 한국어 '위해'를 for로 옮기고 싶어지지만, for 뒤에는 명사만 옵니다: for the test(시험을 위해) / to test the dryer(건조기를 시험하기 위해).",
    rules: [
      { formula: "to + 동사원형", ko: "~하기 위해(가장 기본).", example: "We need more data to finalize the design." },
      { formula: "in order to + 동사원형", ko: "목적을 더 분명히 말할 때 씁니다(조금 격식).", example: "In order to reduce steam consumption, we will add a heat recovery exchanger." },
      { formula: "for + 명사", ko: "명사의 목적·용도를 말합니다.", example: "We need the vendor data for the pump sizing." },
      { formula: "so that + 주어 + can / will + 동사원형", ko: "목적의 주어가 다를 때 문장으로 말합니다.", example: "Please send the datasheet early so that we can check it." },
    ],
    anatomy: [
      {
        sentence: "We need more operating data to finalize the design.",
        parts: [
          p("We need", "subject + verb", "주어 + 동사"),
          p("more operating data", "object", "목적어"),
          p("to", "purpose marker", "목적의 to", true),
          p("finalize", "base verb", "동사원형", true),
          p("the design.", "object", "목적어"),
        ],
      },
      {
        sentence: "Please send the datasheet early so that we can check it.",
        parts: [
          p("Please send", "request", "요청"),
          p("the datasheet", "object", "목적어"),
          p("early", "adverb", "부사"),
          p("so that", "conjunction", "목적 접속사", true),
          p("we can check it.", "purpose clause", "목적(주어 + can + 동사)", true),
        ],
      },
    ],
    examples: [
      { en: "We need more operating data to finalize the dryer size.", ko: "건조기 크기를 확정하려면 운전 데이터가 더 필요합니다." },
      { en: "We reduced the feed rate to keep the outlet moisture below 10 wt%.", ko: "출구 수분을 10 wt% 이하로 유지하기 위해 원료 투입량을 줄였습니다." },
      { en: "The Indonesian team visited Korea to see the pilot plant.", ko: "인도네시아 팀이 파일럿 플랜트를 보기 위해 한국을 방문했습니다." },
      { en: "In order to reduce steam consumption, we will add a heat recovery exchanger.", ko: "스팀 소비를 줄이기 위해 열회수 열교환기를 추가할 것입니다." },
      { en: "We need the vendor data for the pump sizing.", ko: "펌프 용량 산정을 위해 벤더 데이터가 필요합니다." },
    ],
    compare: [
      { a: "We visited the site to check the pump.", b: "We need a tool for checking leaks.", ko: "사람의 목적(~하려고)은 to + 동사원형, 물건의 용도(~하는 데 쓰는)는 for + V-ing입니다." },
      { a: "to reduce the cost", b: "in order to reduce the cost", ko: "뜻은 같습니다. in order to는 목적을 더 분명히 하거나 문장 맨 앞에 둘 때 자주 씁니다." },
      { a: "I will send it early to check it.", b: "I will send it early so that you can check it.", ko: "to + 동사원형의 주어는 문장의 주어(I)와 같습니다. 확인하는 사람이 상대방이면 so that + you can을 씁니다." },
    ],
    mistakes: [
      { wrong: "We need more data for finalize the design.", right: "We need more data to finalize the design.", ko: "목적은 to + 동사원형입니다. for 뒤에 동사원형은 올 수 없습니다." },
      { wrong: "We visited the site for to check the pump.", right: "We visited the site to check the pump.", ko: "for to는 쓰지 않습니다. to만 씁니다." },
      { wrong: "To reducing the cost, we changed the material.", right: "To reduce the cost, we changed the material.", ko: "목적의 to 뒤에는 V-ing가 아니라 동사원형을 씁니다." },
    ],
  },

  // ───────────────────────────── meeting functions ─────────────────────────────
  "polite-request": {
    skill: "polite-request",
    summaryKo: "회의나 이메일에서 요청할 때는 Could you (please) + 동사원형? 또는 Would it be possible to + 동사원형?을 씁니다. 명령문(Send …)만 쓰면 외국 동료에게 지시처럼 강하게 들릴 수 있습니다.",
    simpleKo:
      "요청은 '질문 모양'으로 만들면 부드러워집니다. 'Send the data.'(보내세요.) → 'Could you send the data?'(보내 주시겠어요?). 부탁이 클수록 Would it be possible to …?처럼 더 길고 공손하게 말합니다.",
    rules: [
      { formula: "Could you (please) + 동사원형?", ko: "가장 기본적인 정중한 요청입니다.", example: "Could you please send the updated datasheet?" },
      { formula: "Would it be possible to + 동사원형?", ko: "일정 변경처럼 부담이 큰 부탁에 씁니다.", example: "Would it be possible to move the meeting to Thursday?" },
      { formula: "Please + 동사원형 (+ by 기한).", ko: "이메일에서 짧고 정중하게 요청할 때 씁니다.", example: "Please send the vendor data by Friday." },
      { formula: "I would appreciate it if you could + 동사원형.", ko: "격식 있는 이메일에서 아주 정중하게 부탁할 때 씁니다.", example: "I would appreciate it if you could share the test results." },
    ],
    anatomy: [
      {
        sentence: "Could you please send the updated datasheet by Friday?",
        parts: [
          p("Could you", "polite modal + subject", "정중 조동사 + 주어", true),
          p("please", "polite marker", "공손 표현", true),
          p("send", "base verb", "동사원형", true),
          p("the updated datasheet", "object", "목적어"),
          p("by Friday?", "deadline", "기한"),
        ],
      },
      {
        sentence: "Would it be possible to move the meeting to Thursday?",
        parts: [
          p("Would it be possible", "polite frame", "정중 요청 틀", true),
          p("to move", "to + base verb", "to + 동사원형", true),
          p("the meeting", "object", "목적어"),
          p("to Thursday?", "new date", "변경할 날짜"),
        ],
      },
    ],
    examples: [
      { en: "Could you please send the updated datasheet by Friday?", ko: "금요일까지 수정된 데이터시트를 보내 주시겠습니까?" },
      { en: "Would it be possible to extend the deadline by one week?", ko: "마감을 일주일 연장할 수 있을까요?" },
      { en: "Could you check the steam pressure at the dryer inlet?", ko: "건조기 입구의 스팀 압력을 확인해 주시겠어요?" },
      { en: "Could we have a short call with the vendor tomorrow?", ko: "내일 벤더와 짧게 통화할 수 있을까요?" },
      { en: "I would appreciate it if you could share the test results.", ko: "시험 결과를 공유해 주시면 감사하겠습니다." },
    ],
    compare: [
      { a: "Send me the data.", b: "Could you send me the data?", ko: "명령문은 지시처럼 들리고, Could you …?는 부탁으로 들립니다. 동료나 고객에게는 Could you …?를 씁니다." },
      { a: "Can you check it?", b: "Could you check it?", ko: "can은 가까운 동료 사이의 가벼운 표현이고, could가 더 정중합니다. 고객·벤더에게는 could를 씁니다." },
      { a: "Could you please send it?", b: "Would it be possible to send it?", ko: "Would it be possible to …?는 상대에게 거절할 여지를 더 주는 표현이라 일정 변경 같은 큰 부탁에 적합합니다." },
    ],
    mistakes: [
      { wrong: "Could you please to send the data?", right: "Could you please send the data?", ko: "could 뒤에는 to 없이 동사원형을 씁니다." },
      { wrong: "Could you sending the report?", right: "Could you send the report?", ko: "could 뒤에는 V-ing가 아니라 동사원형이 옵니다." },
      { wrong: "Would it be possible send the drawing?", right: "Would it be possible to send the drawing?", ko: "Would it be possible 뒤에는 to + 동사원형이 필요합니다." },
      { wrong: "Please send me the data until Friday.", right: "Please send me the data by Friday.", ko: "마감 기한은 until이 아니라 by로 말합니다." },
    ],
  },

  "clarify-question": {
    skill: "clarify-question",
    summaryKo: "상대의 말을 확인할 때는 Do you mean …?, 정보를 정중하게 물을 때는 Could you tell me + 의문사 + 주어 + 동사?를 씁니다. 간접의문문 안에서는 평서문 어순(주어 + 동사)을 씁니다.",
    simpleKo:
      "잘 모르면 추측하지 말고 확인하는 것이 엔지니어의 기본입니다. 'Do you mean A or B?'처럼 선택지를 주면 상대가 답하기 쉽습니다. 'Could you tell me' 뒤에서는 질문 순서가 아니라 보통 문장 순서가 됩니다: what the design pressure is.",
    rules: [
      { formula: "Do you mean + 명사 / 절?", ko: "내가 이해한 것이 맞는지 확인합니다.", example: "Do you mean the design pressure or the operating pressure?" },
      { formula: "Could you tell me + 의문사 + 주어 + 동사?", ko: "간접의문문입니다. 의문사 뒤는 주어 + 동사 순서입니다.", example: "Could you tell me what the design pressure is?" },
      { formula: "Could you explain what you mean by + 명사?", ko: "용어나 표현의 뜻을 물을 때 씁니다.", example: "Could you explain what you mean by 'design margin'?" },
      { formula: "Just to confirm, + 평서문, right?", ko: "들은 내용을 다시 확인합니다.", example: "Just to confirm, the feed rate is 10 t/h, right?" },
    ],
    anatomy: [
      {
        sentence: "Could you tell me what the design pressure is?",
        parts: [
          p("Could you tell me", "polite frame", "정중 질문 틀"),
          p("what", "question word", "의문사", true),
          p("the design pressure", "subject", "주어", true),
          p("is?", "verb", "동사(주어 뒤)", true),
        ],
      },
      {
        sentence: "Do you mean the design pressure or the operating pressure?",
        parts: [
          p("Do you mean", "check phrase", "확인 표현", true),
          p("the design pressure", "option A", "선택지 A"),
          p("or", "conjunction", "또는"),
          p("the operating pressure?", "option B", "선택지 B"),
        ],
      },
    ],
    examples: [
      { en: "Do you mean the inlet temperature or the outlet temperature?", ko: "입구 온도를 말씀하시는 건가요, 출구 온도를 말씀하시는 건가요?" },
      { en: "Could you tell me when the vendor will send the drawings?", ko: "벤더가 도면을 언제 보낼지 알려 주시겠습니까?" },
      { en: "Just to confirm, the steam pressure is 6 bar(g), right?", ko: "확인차 여쭙니다. 스팀 압력이 6 bar(g) 맞습니까?" },
      { en: "Could you explain what you mean by 'design margin'?", ko: "'설계 여유'가 무슨 뜻인지 설명해 주시겠습니까?" },
      { en: "Is the 10 t/h on a wet basis or a dry basis?", ko: "10 t/h는 습량 기준인가요, 건량 기준인가요?" },
    ],
    compare: [
      { a: "What is the design pressure?", b: "Could you tell me what the design pressure is?", ko: "직접 질문은 is가 주어 앞에 오고, 간접의문문은 is가 주어 뒤로 갑니다. 간접의문문이 더 정중합니다." },
      { a: "What do you mean?", b: "Do you mean the dry basis?", ko: "What do you mean?은 말투에 따라 '무슨 말씀이세요?'처럼 따지는 느낌이 날 수 있습니다. 내가 이해한 내용을 제시하는 Do you mean …?이 부드럽고 정확합니다." },
      { a: "Sorry?", b: "Could you repeat the flow rate?", ko: "짧은 Sorry?도 되지만, 숫자나 단위를 놓쳤을 때는 무엇을 다시 듣고 싶은지 말하는 편이 정확합니다." },
    ],
    mistakes: [
      { wrong: "Could you tell me what is the design pressure?", right: "Could you tell me what the design pressure is?", ko: "Could you tell me 뒤의 간접의문문은 '주어 + 동사' 순서입니다." },
      { wrong: "Can you tell me when will the vendor send it?", right: "Can you tell me when the vendor will send it?", ko: "간접의문문에서는 will도 주어 뒤에 둡니다." },
      { wrong: "What means 'dry basis'?", right: "What does 'dry basis' mean?", ko: "일반동사 의문문에는 does가 필요하고, 동사는 원형(mean)을 씁니다." },
    ],
  },

  // ───────────────────────────── passive, comparison, degree ─────────────────────────────
  passive: {
    skill: "passive",
    summaryKo: "행동한 사람보다 대상(장비·문서·결과)이 중요할 때 수동태 'be + 과거분사'를 씁니다. 행위자를 꼭 말해야 할 때만 by + 행위자를 붙입니다.",
    simpleKo:
      "능동태는 '누가 했다'(The vendor tested the pump), 수동태는 '무엇이 되었다'(The pump was tested)입니다. 보고서에서는 누가 했는지보다 장비 상태가 중요할 때가 많아서 수동태를 자주 씁니다. 시제는 be동사로 바꿉니다: is tested / was tested / will be tested / has been tested.",
    rules: [
      { formula: "is / are + p.p.", ko: "현재의 사실이나 일반적인 절차입니다.", example: "The steam is supplied by the site boiler." },
      { formula: "was / were + p.p.", ko: "과거에 된 일입니다.", example: "The feed pump was replaced last week." },
      { formula: "will be / must be + p.p.", ko: "미래의 일이나 필요입니다.", example: "The dryer will be delivered in July." },
      { formula: "has / have been + p.p.", ko: "이미 ~되었다(지금 결과가 중요)입니다.", example: "The revised P&ID has been sent to the client." },
    ],
    anatomy: [
      {
        sentence: "The feed pump was replaced last week.",
        parts: [
          p("The feed pump", "subject", "주어(대상)"),
          p("was", "be (past)", "be동사(과거)", true),
          p("replaced", "p.p.", "과거분사", true),
          p("last week.", "time", "시간"),
        ],
      },
      {
        sentence: "The dryer will be delivered by the vendor in July.",
        parts: [
          p("The dryer", "subject", "주어(대상)"),
          p("will be", "be (future)", "be동사(미래)", true),
          p("delivered", "p.p.", "과거분사", true),
          p("by the vendor", "agent", "행위자"),
          p("in July.", "time", "시간"),
        ],
      },
    ],
    examples: [
      { en: "The feed pump was replaced last week.", ko: "원료 펌프는 지난주에 교체되었습니다." },
      { en: "The steam is supplied by the site boiler.", ko: "스팀은 현장 보일러에서 공급됩니다." },
      { en: "The dryer will be delivered in July.", ko: "건조기는 7월에 납품될 예정입니다." },
      { en: "The revised P&ID has been sent to the client.", ko: "수정된 P&ID가 고객에게 발송되었습니다." },
      { en: "All valves must be closed before maintenance.", ko: "정비 전에 모든 밸브를 닫아야 합니다." },
    ],
    compare: [
      { a: "The vendor tested the pump.", b: "The pump was tested by the vendor.", ko: "같은 사실이지만 능동태는 벤더(누가)를, 수동태는 펌프(무엇이)를 주제로 말합니다." },
      { a: "The schedule is delayed.", b: "The schedule was delayed.", ko: "is delayed는 '지금 지연된 상태', was delayed는 '과거에 지연되었다(지금은 회복되었을 수도 있음)'입니다." },
      { a: "The pump was repaired.", b: "The pump has been repaired.", ko: "was repaired는 과거의 사건, has been repaired는 '수리되어 지금 사용할 수 있다'는 현재 결과를 강조합니다." },
    ],
    mistakes: [
      { wrong: "The pump was replace last week.", right: "The pump was replaced last week.", ko: "수동태는 be + 과거분사입니다. 동사원형(replace)을 쓰지 않습니다." },
      { wrong: "The dryer will deliver in July.", right: "The dryer will be delivered in July.", ko: "건조기가 스스로 납품하는 것이 아니므로 수동태(will be delivered)를 씁니다." },
      { wrong: "The problem was happened yesterday.", right: "The problem happened yesterday.", ko: "happen, occur, arrive처럼 목적어를 받지 않는 동사는 수동태로 쓰지 않습니다." },
      { wrong: "The data sent to the client.", right: "The data was sent to the client.", ko: "be동사가 빠지면 '데이터가 보냈다'는 능동 의미가 됩니다." },
    ],
  },

  comparative: {
    skill: "comparative",
    summaryKo: "두 값을 비교할 때 짧은 형용사는 -er than(higher than), 긴 형용사는 more + 형용사 + than(more stable than), 같음은 the same as / as … as를 씁니다.",
    simpleKo:
      "짧은 말(high, low, fast)은 끝에 -er을 붙이고, 긴 말(stable, efficient)은 앞에 more를 붙입니다. 둘을 동시에 쓰지 않습니다(more higher는 틀림). 비교 대상 앞에는 than을 씁니다.",
    rules: [
      { formula: "형용사-er + than", ko: "1음절 형용사와 -y로 끝나는 2음절 형용사(easy → easier)에 씁니다.", example: "The actual moisture is higher than the design value." },
      { formula: "more + 형용사 + than", ko: "2음절 이상의 긴 형용사에 씁니다.", example: "The new dryer is more efficient than the old one." },
      { formula: "the same as / as + 형용사 + as", ko: "같음을 나타냅니다.", example: "The outlet temperature is the same as last week." },
      { formula: "not as + 형용사 + as", ko: "~만큼 …하지 않습니다.", example: "The pilot data is not as stable as the lab data." },
    ],
    anatomy: [
      {
        sentence: "The actual moisture is higher than the design value.",
        parts: [
          p("The actual moisture", "subject", "주어"),
          p("is", "be", "be동사"),
          p("higher", "comparative", "비교급(-er)", true),
          p("than", "comparison word", "비교 대상 표시", true),
          p("the design value.", "compared item", "비교 대상"),
        ],
      },
      {
        sentence: "The new dryer is more efficient than the old one.",
        parts: [
          p("The new dryer", "subject", "주어"),
          p("is", "be", "be동사"),
          p("more efficient", "comparative", "비교급(more + 형용사)", true),
          p("than", "comparison word", "비교 대상 표시", true),
          p("the old one.", "compared item", "비교 대상"),
        ],
      },
    ],
    examples: [
      { en: "The actual feed moisture is higher than the design value.", ko: "실제 원료 수분이 설계값보다 높습니다." },
      { en: "The new dryer is more energy-efficient than the old one.", ko: "새 건조기는 기존 건조기보다 에너지 효율이 높습니다." },
      { en: "The new pump is much quieter than the old one.", ko: "새 펌프는 기존 펌프보다 훨씬 조용합니다." },
      { en: "The steam consumption is the same as last month.", ko: "스팀 소비량은 지난달과 같습니다." },
      { en: "The pilot results are not as stable as the lab results.", ko: "파일럿 결과는 실험실 결과만큼 안정적이지 않습니다." },
      { en: "Option B is cheaper, but it needs more maintenance.", ko: "B안이 더 저렴하지만 정비가 더 많이 필요합니다." },
    ],
    compare: [
      { a: "the same as", b: "similar to", ko: "the same as는 '같다(동일)', similar to는 '비슷하다'입니다. 숫자가 완전히 같지 않으면 similar to를 씁니다." },
      { a: "less stable than", b: "not as stable as", ko: "둘 다 '~보다 덜 안정적'이라는 뜻입니다. 회의에서는 not as … as가 더 자연스럽고 부드럽게 들립니다." },
      { a: "lower than", b: "less than", ko: "lower는 온도·압력처럼 높낮이가 있는 값에, less는 양(less steam, less power)에 자연스럽습니다." },
    ],
    mistakes: [
      { wrong: "The moisture is more higher than the design value.", right: "The moisture is higher than the design value.", ko: "-er과 more를 함께 쓰지 않습니다. higher 하나로 충분합니다." },
      { wrong: "The new dryer is efficient than the old one.", right: "The new dryer is more efficient than the old one.", ko: "than으로 비교하려면 비교급(more efficient)이 필요합니다." },
      { wrong: "The temperature is same with last week.", right: "The temperature is the same as last week.", ko: "'같다'는 the same as입니다. the를 빼거나 with를 쓰지 않습니다." },
      { wrong: "The pressure is higher then the design value.", right: "The pressure is higher than the design value.", ko: "비교는 than입니다. then은 '그다음에'라는 뜻입니다." },
    ],
  },

  degree: {
    skill: "degree",
    summaryKo: "정도는 a little / slightly(조금), much / far(훨씬), about / around / approximately(약)로 표현합니다. some은 명사 앞에서 '약간의 양'을 나타내며, 형용사 앞의 '조금'에는 쓰지 않습니다.",
    simpleKo:
      "'조금 늦다'는 a little delayed, '조금 높다'는 slightly higher, '훨씬 높다'는 much higher, '약 2주'는 about two weeks입니다. 비교급 앞에는 very가 아니라 much를 씁니다.",
    rules: [
      { formula: "a little / slightly + 형용사 / p.p.", ko: "조금, 약간.", example: "The schedule is a little delayed." },
      { formula: "much / far / slightly + 비교급", ko: "비교급의 정도를 나타냅니다. very는 쓰지 않습니다.", example: "The steam consumption is much higher than expected." },
      { formula: "about / around / approximately + 숫자", ko: "약, 대략.", example: "The dryer needs about 2.5 t/h of steam." },
      { formula: "some / a little + 셀 수 없는 명사 · a few + 셀 수 있는 복수", ko: "약간의 양이나 개수입니다.", example: "We need some more data and a few days." },
    ],
    anatomy: [
      {
        sentence: "The steam consumption is much higher than expected.",
        parts: [
          p("The steam consumption", "subject", "주어"),
          p("is", "be", "be동사"),
          p("much", "degree", "정도(훨씬)", true),
          p("higher", "comparative", "비교급", true),
          p("than expected.", "comparison", "비교 기준"),
        ],
      },
      {
        sentence: "The commissioning is about two weeks behind schedule.",
        parts: [
          p("The commissioning", "subject", "주어"),
          p("is", "be", "be동사"),
          p("about", "approximation", "대략", true),
          p("two weeks", "amount", "양(기간)", true),
          p("behind schedule.", "state", "상태"),
        ],
      },
    ],
    examples: [
      { en: "The equipment delivery is slightly delayed.", ko: "장비 납품이 약간 지연되고 있습니다." },
      { en: "The steam consumption is much higher than expected.", ko: "스팀 소비량이 예상보다 훨씬 높습니다." },
      { en: "We are about two weeks behind schedule.", ko: "일정이 약 2주 늦어졌습니다." },
      { en: "The outlet moisture is a little above the target.", ko: "출구 수분이 목표치보다 조금 높습니다." },
      { en: "The new pump uses about 15% less power.", ko: "새 펌프는 전력을 약 15% 덜 사용합니다." },
      { en: "The pressure drop increased slightly during the test.", ko: "시험 중에 압력 강하가 약간 증가했습니다." },
    ],
    compare: [
      { a: "a little delayed", b: "some delay", ko: "a little은 형용사·과거분사 앞에서 '조금', some은 명사 앞에서 '약간의 양'입니다. 'some delayed'는 틀립니다." },
      { a: "much higher", b: "very high", ko: "비교급(higher) 앞에는 much / far / slightly를, 원급(high) 앞에는 very를 씁니다. 'very higher'는 틀립니다." },
      { a: "a little steam", b: "a few days", ko: "a little은 셀 수 없는 명사, a few는 셀 수 있는 복수 명사 앞에 씁니다." },
    ],
    mistakes: [
      { wrong: "Our design schedule some lated.", right: "Our design schedule is a little delayed.", ko: "'조금'은 some이 아니라 a little / slightly입니다. be동사(is)도 필요하고, 'lated'는 없는 단어입니다." },
      { wrong: "The temperature is very higher than before.", right: "The temperature is much higher than before.", ko: "비교급 앞에서는 very가 아니라 much를 씁니다." },
      { wrong: "We need a few information.", right: "We need a little information.", ko: "information은 셀 수 없으므로 a few가 아니라 a little 또는 some을 씁니다." },
      { wrong: "It takes about of two weeks.", right: "It takes about two weeks.", ko: "about 뒤에는 바로 숫자를 씁니다." },
    ],
  },

  // ───────────────────────────── B2+ structures ─────────────────────────────
  "relative-clause": {
    skill: "relative-clause",
    summaryKo: "명사를 뒤에서 설명할 때 that / which(사물), who(사람)로 시작하는 관계절을 명사 바로 뒤에 붙입니다. 관계사가 목적어를 대신하면 관계절 안에 it / them을 다시 쓰지 않습니다.",
    simpleKo:
      "한국어는 '지난주에 우리가 교체한 펌프'처럼 설명이 명사 앞에 오지만, 영어는 '펌프 + [우리가 지난주에 교체한]'처럼 명사 뒤에 붙입니다: the pump that we replaced last week. that이 이미 펌프를 가리키므로 it을 또 쓰지 않습니다.",
    rules: [
      { formula: "명사 + that / which + 동사 …", ko: "관계사가 주어 역할을 합니다(생략 불가).", example: "We need a pump that can handle 15 m³/h." },
      { formula: "명사 + (that) + 주어 + 동사 …", ko: "관계사가 목적어 역할을 합니다(that 생략 가능).", example: "The pump (that) we replaced last week is working well." },
      { formula: "사람 + who + 동사 …", ko: "사람을 설명할 때 씁니다.", example: "The engineer who designed the dryer will join the call." },
      { formula: "명사, which …,", ko: "쉼표 + which는 추가 정보입니다. 이때는 that을 쓰지 않습니다.", example: "The new dryer, which arrived in May, is working well." },
    ],
    anatomy: [
      {
        sentence: "The pump that we replaced last week is working well.",
        parts: [
          p("The pump", "noun", "명사(선행사)", true),
          p("that we replaced last week", "relative clause", "관계절(명사 설명)", true),
          p("is working", "verb", "동사"),
          p("well.", "adverb", "부사"),
        ],
      },
      {
        sentence: "We need a dryer that can handle 60 wt% moisture.",
        parts: [
          p("We need", "subject + verb", "주어 + 동사"),
          p("a dryer", "noun", "명사(선행사)", true),
          p("that", "relative pronoun", "관계대명사(주어 역할)", true),
          p("can handle", "verb", "동사"),
          p("60 wt% moisture.", "object", "목적어"),
        ],
      },
    ],
    examples: [
      { en: "The pump that we replaced last week is working well.", ko: "지난주에 교체한 펌프는 잘 작동하고 있습니다." },
      { en: "We need a dryer that can handle 60 wt% feed moisture.", ko: "원료 수분 60 wt%를 처리할 수 있는 건조기가 필요합니다." },
      { en: "The engineer who designed the decanter will join the call.", ko: "디캔터를 설계한 엔지니어가 통화에 참여할 것입니다." },
      { en: "This is the datasheet we received from the vendor.", ko: "이것이 벤더에게서 받은 데이터시트입니다." },
      { en: "The new dryer, which arrived in May, is now running at the pilot plant.", ko: "5월에 도착한 새 건조기는 지금 파일럿 플랜트에서 운전 중입니다." },
    ],
    compare: [
      { a: "The pump that we replaced is working well.", b: "The pump, which we replaced last week, is working well.", ko: "쉼표 없는 that절은 '여러 펌프 중 바로 그 펌프'를 골라 정하고, 쉼표 + which는 이미 정해진 대상에 정보를 덧붙입니다." },
      { a: "the engineer who designed it", b: "the dryer which / that we designed", ko: "사람은 who, 사물은 which / that을 씁니다. that은 쉼표가 없을 때 사람과 사물 모두에 쓸 수 있습니다." },
      { a: "the data that we received", b: "the data we received", ko: "관계사가 목적어일 때는 that을 생략해도 됩니다. 주어일 때(the data that shows …)는 생략할 수 없습니다." },
    ],
    mistakes: [
      { wrong: "The pump that we replaced it last week is working well.", right: "The pump that we replaced last week is working well.", ko: "that이 이미 목적어(the pump)를 대신하므로 it을 다시 쓰지 않습니다." },
      { wrong: "The last week we replaced pump is working well.", right: "The pump that we replaced last week is working well.", ko: "한국어처럼 설명을 명사 앞에 두지 않습니다. 명사 뒤에 that절로 붙입니다." },
      { wrong: "The engineer which designed the dryer will join.", right: "The engineer who designed the dryer will join.", ko: "사람에게는 which가 아니라 who를 씁니다." },
      { wrong: "We need a dryer can handle high moisture.", right: "We need a dryer that can handle high moisture.", ko: "관계사가 주어 역할을 할 때는 that을 생략할 수 없습니다." },
    ],
  },

  reporting: {
    skill: "reporting",
    summaryKo: "회의 결정이나 다른 사람의 말을 전할 때는 We agreed that / We decided to / The vendor said that …을 씁니다. 과거에 한 말을 전할 때는 보통 시제를 한 단계 과거로 바꿉니다(will → would, can → could, is → was).",
    simpleKo:
      "회의록은 '누가 + 말했다/결정했다 + 내용' 순서입니다: The vendor said that the dryer would arrive in July. 그 내용이 지금도 사실이거나 유효한 계획이면 시제를 바꾸지 않아도 됩니다.",
    rules: [
      { formula: "We agreed that + 주어 + 동사", ko: "합의한 내용을 전합니다.", example: "We agreed that the Indonesian team would send the feed data." },
      { formula: "We decided to + 동사원형", ko: "우리가 하기로 결정한 행동입니다.", example: "We decided to use an indirect dryer." },
      { formula: "주어 + said (that) + 주어 + would / could / was …", ko: "다른 사람의 말을 전합니다. 시제를 보통 한 단계 과거로 바꿉니다.", example: "The vendor said that the dryer would arrive in July." },
      { formula: "주어 + asked + 사람 + to + 동사원형 / asked if + 주어 + 동사", ko: "요청이나 질문을 전합니다.", example: "The client asked us to reduce the CAPEX." },
    ],
    anatomy: [
      {
        sentence: "The vendor said that the dryer would arrive in July.",
        parts: [
          p("The vendor", "speaker", "말한 사람"),
          p("said", "reporting verb", "전달 동사", true),
          p("that", "conjunction", "접속사", true),
          p("the dryer", "subject", "주어"),
          p("would arrive", "verb (backshifted)", "동사(will → would)", true),
          p("in July.", "time", "시간"),
        ],
      },
      {
        sentence: "We agreed that the client would send the feed data by Friday.",
        parts: [
          p("We", "subject", "주어"),
          p("agreed", "reporting verb", "합의 동사", true),
          p("that", "conjunction", "접속사", true),
          p("the client", "subject", "주어"),
          p("would send", "verb", "동사"),
          p("the feed data", "object", "목적어"),
          p("by Friday.", "deadline", "기한"),
        ],
      },
    ],
    examples: [
      { en: "We agreed that the Indonesian team would send the feed analysis by Friday.", ko: "인도네시아 팀이 금요일까지 원료 분석 결과를 보내기로 합의했습니다." },
      { en: "We decided to use an indirect steam dryer for the pilot plant.", ko: "파일럿 플랜트에는 간접 스팀 건조기를 쓰기로 결정했습니다." },
      { en: "The vendor said that the delivery could take 16 weeks.", ko: "벤더는 납품에 16주가 걸릴 수 있다고 했습니다." },
      { en: "Pak Budi asked us to check the condensate return line.", ko: "Pak Budi가 응축수 회수 라인을 확인해 달라고 요청했습니다." },
      { en: "The client asked if we could reduce the CAPEX by 10%.", ko: "고객이 CAPEX를 10% 줄일 수 있는지 물었습니다." },
      { en: "To summarize, we will finalize the PFD next week.", ko: "정리하면, 다음 주에 PFD를 확정합니다." },
    ],
    compare: [
      { a: "The vendor said that the dryer would arrive in July.", b: "The vendor said that the dryer will arrive in July.", ko: "would가 기본 형태입니다. 7월 도착이 지금도 유효한 계획임을 강조할 때는 will도 쓸 수 있습니다." },
      { a: "The vendor said that …", b: "The vendor told us that …", ko: "say는 바로 내용이 오고, tell은 사람 목적어가 필요합니다. 'said us'는 틀립니다." },
      { a: "We agreed to send the data.", b: "We agreed that the client would send the data.", ko: "agreed to + 동사원형은 '우리가 ~하기로', agreed that + 절은 다른 사람이 할 일도 말할 수 있습니다." },
    ],
    mistakes: [
      { wrong: "The vendor said us that the dryer would arrive in July.", right: "The vendor told us that the dryer would arrive in July.", ko: "사람(us)을 말하려면 said가 아니라 told를 씁니다." },
      { wrong: "We decided use an indirect dryer.", right: "We decided to use an indirect dryer.", ko: "decide 뒤에 동사가 오면 to + 동사원형을 씁니다." },
      { wrong: "The client asked us reduce the cost.", right: "The client asked us to reduce the cost.", ko: "ask + 사람 + to + 동사원형 구조입니다." },
      { wrong: "The client asked can we reduce the CAPEX.", right: "The client asked if we could reduce the CAPEX.", ko: "질문을 전할 때는 if + 주어 + 동사(평서문 어순)로 바꾸고, 시제도 한 단계 과거로 바꿉니다." },
    ],
  },

  "cond-2": {
    skill: "cond-2",
    summaryKo: "2형 조건문은 현재나 미래에 대한 가상, 즉 사실과 다르거나 일어날 가능성이 낮은 일을 말합니다: If + 과거형, would / could / might + 동사원형. 과거형을 쓰지만 과거 이야기가 아닙니다.",
    simpleKo:
      "if 뒤의 과거형은 '시간'이 아니라 '현실에서 한 걸음 떨어져 있다'는 표시입니다. If we had more budget은 '(지금 예산이 부족하지만) 예산이 더 있다면'입니다. 현실적인 계획은 1형(If we have …, we will …), 가상은 2형(If we had …, we would …)입니다.",
    rules: [
      { formula: "If + 과거형, would + 동사원형", ko: "현재 사실과 반대이거나 가능성이 낮은 가정과 그 결과입니다.", example: "If we had more operating data, we would decide the dryer size now." },
      { formula: "If + 과거형, could / might + 동사원형", ko: "가상 상황에서 가능한(could) 또는 있을 수도 있는(might) 결과입니다.", example: "If the steam pressure were higher, we could use a smaller dryer." },
      { formula: "If + 주어 + were …", ko: "가정의 be동사는 주어와 관계없이 were가 표준입니다(구어에서는 was도 씁니다).", example: "If the vendor were closer, delivery would be faster." },
      { formula: "If I were you, I would + 동사원형", ko: "조언할 때 씁니다.", example: "If I were you, I would ask for a second quotation." },
    ],
    anatomy: [
      {
        sentence: "If we had more operating data, we would decide the dryer size now.",
        parts: [
          p("If", "conjunction", "조건 접속사"),
          p("we", "subject", "주어"),
          p("had", "past verb", "과거형(현재 사실의 반대)", true),
          p("more operating data,", "object", "목적어"),
          p("we", "subject", "주어"),
          p("would decide", "would + base verb", "would + 동사원형", true),
          p("the dryer size", "object", "목적어"),
          p("now.", "time", "시간(지금)"),
        ],
      },
      {
        sentence: "If we decided now, we might have to change the specification later.",
        parts: [
          p("If", "conjunction", "조건 접속사"),
          p("we", "subject", "주어"),
          p("decided now,", "past verb", "과거형(지금에 대한 가정)", true),
          p("we", "subject", "주어"),
          p("might have to change", "might + base verb", "might + 동사원형", true),
          p("the specification", "object", "목적어"),
          p("later.", "adverb", "부사(나중에)"),
        ],
      },
    ],
    examples: [
      { en: "If we had more operating data, we would decide the dryer size now.", ko: "운전 데이터가 더 있다면 지금 건조기 크기를 정할 텐데요. (실제로는 데이터가 부족합니다.)" },
      { en: "If the steam pressure were higher, we could use a smaller dryer.", ko: "스팀 압력이 더 높다면 더 작은 건조기를 쓸 수 있을 텐데요." },
      { en: "If the vendor offered a shorter delivery time, we would place the order today.", ko: "벤더가 더 짧은 납기를 제시한다면 오늘 발주할 텐데요." },
      { en: "If we used two smaller pumps, the system would be more flexible.", ko: "작은 펌프 두 대를 쓴다면 시스템이 더 유연해질 것입니다." },
      { en: "If I were you, I would ask for a second quotation.", ko: "제가 당신이라면 견적을 하나 더 받아 보겠습니다." },
    ],
    compare: [
      { a: "If we decide now, we will save two weeks.", b: "If we decided now, we would save two weeks.", ko: "If we decide now는 '지금 실제로 결정할 수 있고, 결정하면'이라는 현실적인 조건입니다. If we decided now는 '(실제로는 지금 결정하지 않겠지만 / 할 수 없지만) 지금 결정한다고 가정하면'이라는 현재의 가상입니다. 두 문장 모두 지금·미래에 대한 이야기입니다." },
      { a: "If we decided now, we would save time.", b: "If we had decided last month, we would have saved time.", ko: "decided / would save는 지금·미래에 대한 가상이고, had decided / would have saved는 이미 지난 과거에 대한 가상(실제로는 결정하지 않았고, 바꿀 수 없음)입니다." },
      { a: "we would use a smaller dryer", b: "we could / might use a smaller dryer", ko: "would는 '~할 것이다'(가정의 결과), could는 '~할 수 있을 것이다'(가능), might는 '~할지도 모른다'(불확실)입니다." },
    ],
    mistakes: [
      { wrong: "If we would have more data, we would decide now.", right: "If we had more data, we would decide now.", ko: "if절에는 would를 쓰지 않습니다. if절은 과거형(had)입니다." },
      { wrong: "If we had more data, we will decide now.", right: "If we had more data, we would decide now.", ko: "가상의 결과에는 will이 아니라 would를 씁니다. will을 쓰면 현실 조건과 가상이 섞입니다." },
      { wrong: "If we had decided now, we would save time.", right: "If we decided now, we would save time.", ko: "had decided는 과거에 대한 가정이므로 now와 함께 쓸 수 없습니다. 지금에 대한 가정은 decided입니다." },
      { wrong: "If the price were lower, we would ordered more.", right: "If the price were lower, we would order more.", ko: "would 뒤에는 동사원형을 씁니다." },
    ],
  },

  "polite-disagree": {
    skill: "polite-disagree",
    summaryKo: "반대 의견은 상대의 말을 먼저 인정하고(I see your point / I understand) 근거와 함께 부드럽게 말합니다. I'm not sure that …, I'm afraid …, Could we consider …? 같은 완곡한 표현을 씁니다.",
    simpleKo:
      "'No, that's wrong.'은 사람을 공격하는 것처럼 들릴 수 있습니다. '쿠션 + 반대 + 이유 + 대안' 순서로 말하세요: I see your point, but I'm not sure the dryer is big enough, because the feed moisture is higher. Could we check the data again?",
    rules: [
      { formula: "I see your point, but + 주어 + 동사", ko: "상대 의견을 인정한 뒤 반대합니다.", example: "I see your point, but the steam supply is limited." },
      { formula: "I'm not sure (that) + 주어 + 동사", ko: "'아니다'라고 직접 말하지 않고 의문을 표현합니다.", example: "I'm not sure that this pump is large enough." },
      { formula: "I'm afraid + 주어 + 동사", ko: "좋지 않은 소식이나 거절을 부드럽게 전합니다.", example: "I'm afraid we can't finish the FEED by May." },
      { formula: "Could we consider + 명사 / V-ing?", ko: "대안을 제안합니다.", example: "Could we consider using two smaller dryers?" },
    ],
    anatomy: [
      {
        sentence: "I see your point, but I'm not sure that this pump is large enough.",
        parts: [
          p("I see your point,", "acknowledge", "인정(쿠션)", true),
          p("but", "contrast", "반대 전환"),
          p("I'm not sure that", "hedge", "완곡 표현", true),
          p("this pump", "subject", "주어"),
          p("is large enough.", "claim", "내용"),
        ],
      },
      {
        sentence: "Could we consider using two smaller dryers?",
        parts: [
          p("Could we consider", "suggestion", "대안 제안", true),
          p("using", "V-ing", "동명사", true),
          p("two smaller dryers?", "object", "목적어"),
        ],
      },
    ],
    examples: [
      { en: "I see your point, but the steam supply at the site is limited.", ko: "말씀은 이해하지만, 현장의 스팀 공급이 제한적입니다." },
      { en: "I'm not sure that the lab data represents the real feed.", ko: "실험 데이터가 실제 원료를 대표하는지 확신이 서지 않습니다." },
      { en: "I'm afraid we can't finish the FEED package by May.", ko: "죄송하지만 5월까지 FEED 패키지를 끝내기는 어렵습니다." },
      { en: "I understand your concern, but the vendor has a good reference in Malaysia.", ko: "우려는 이해하지만, 그 벤더는 말레이시아에 좋은 납품 실적이 있습니다." },
      { en: "Could we consider using two smaller dryers instead of one large one?", ko: "큰 건조기 한 대 대신 작은 건조기 두 대를 쓰는 방안을 검토해 볼 수 있을까요?" },
      { en: "That's a good idea, but we might need more data first.", ko: "좋은 생각이지만, 먼저 데이터가 더 필요할 수 있습니다." },
    ],
    compare: [
      { a: "You are wrong.", b: "I'm not sure that's correct.", ko: "You are wrong은 사람을 비판하는 느낌이고, I'm not sure that's correct는 내용에 대한 의문으로 들립니다." },
      { a: "I disagree.", b: "I see your point, but …", ko: "I disagree도 틀린 표현은 아니지만 직설적입니다. 상대의 체면을 중요하게 여기는 회의에서는 '인정 + but'이 더 안전합니다." },
      { a: "I'm afraid we can't …", b: "I'm scared we can't …", ko: "I'm afraid + 절은 '유감이지만 ~입니다'라는 정중한 표현이고, I'm scared는 실제로 '무섭다'는 뜻입니다." },
    ],
    mistakes: [
      { wrong: "I'm not agree with you.", right: "I don't agree with you.", ko: "agree는 동사이므로 be동사가 아니라 don't로 부정합니다. 더 부드럽게는 I'm not sure I agree.라고 말합니다." },
      { wrong: "Your idea is wrong.", right: "I see your point, but I'm not sure it will work here.", ko: "문법 오류는 아니지만 너무 직설적입니다. 먼저 인정하고 이유를 덧붙이세요." },
      { wrong: "Could we consider to use two dryers?", right: "Could we consider using two dryers?", ko: "consider 뒤에 동사가 오면 V-ing를 씁니다." },
    ],
  },

  "cond-3": {
    skill: "cond-3",
    summaryKo: "3형 조건문은 이미 지난 과거 사실과 반대되는 가정과 그 결과를 말합니다: If + had + 과거분사, would have + 과거분사. 과거의 결정을 돌아보거나 교훈을 정리할 때 씁니다.",
    simpleKo:
      "'(지난달에) ~했더라면, …했을 텐데'입니다. 실제로는 하지 않았고, 이미 지난 일이라 바꿀 수 없습니다. 앞부분은 had + p.p., 뒷부분은 would have + p.p.입니다. 두 부분 모두 '과거보다 한 단계 더 뒤'라고 기억하세요.",
    rules: [
      { formula: "If + had + p.p., would have + p.p.", ko: "과거 사실과 반대되는 가정과 그 과거의 결과입니다.", example: "If we had decided earlier, we would have saved two weeks." },
      { formula: "If + had + p.p., could / might have + p.p.", ko: "과거에 가능했던(could) 또는 그랬을지도 모르는(might) 결과입니다.", example: "If we had tested the real feed, we might have found the problem earlier." },
      { formula: "If + had not + p.p., would have + p.p.", ko: "실제로 한 일의 반대를 가정합니다.", example: "If the operator hadn't stopped the pump, the seal would have failed." },
      { formula: "If + had + p.p., would + 동사원형 + now", ko: "혼합 조건문: 과거 가정의 결과가 지금 상태에 영향을 줍니다.", example: "If we had ordered the dryer in March, it would be here now." },
    ],
    anatomy: [
      {
        sentence: "If we had decided earlier, we would have saved two weeks.",
        parts: [
          p("If", "conjunction", "조건 접속사"),
          p("we", "subject", "주어"),
          p("had decided", "had + p.p.", "had + 과거분사(과거 사실의 반대)", true),
          p("earlier,", "time", "시간(과거)"),
          p("we", "subject", "주어"),
          p("would have saved", "would have + p.p.", "would have + 과거분사(과거의 결과)", true),
          p("two weeks.", "object", "목적어"),
        ],
      },
      {
        sentence: "If the vendor had sent the data on time, we could have finished the design.",
        parts: [
          p("If", "conjunction", "조건 접속사"),
          p("the vendor", "subject", "주어"),
          p("had sent", "had + p.p.", "had + 과거분사", true),
          p("the data", "object", "목적어"),
          p("on time,", "adverb", "부사(제때)"),
          p("we", "subject", "주어"),
          p("could have finished", "could have + p.p.", "could have + 과거분사", true),
          p("the design.", "object", "목적어"),
        ],
      },
    ],
    examples: [
      { en: "If we had decided earlier, we would have saved two weeks.", ko: "더 일찍 결정했더라면 2주를 절약했을 것입니다. (실제로는 늦게 결정했습니다.)" },
      { en: "If the vendor had sent the data on time, we could have finished the design last month.", ko: "벤더가 데이터를 제때 보냈더라면 지난달에 설계를 끝낼 수 있었을 것입니다." },
      { en: "If we had tested the real feed, we might have found the fouling problem earlier.", ko: "실제 원료로 시험했더라면 파울링 문제를 더 일찍 발견했을지도 모릅니다." },
      { en: "If the operator hadn't stopped the pump, the seal would have failed.", ko: "운전원이 펌프를 멈추지 않았더라면 씰이 파손되었을 것입니다." },
      { en: "If we had ordered the dryer in March, it would be here now.", ko: "3월에 건조기를 발주했더라면 지금 이미 도착해 있을 것입니다." },
    ],
    compare: [
      { a: "If we decide now,", b: "If we had decided earlier,", ko: "decide now는 지금 실제로 할 수 있는 선택(1형), had decided earlier는 이미 지난 과거에 대한 반대 가정(3형)입니다. 3형은 결과를 바꿀 수 없고, 교훈이나 원인 설명에 씁니다." },
      { a: "If we decided now, we would save time.", b: "If we had decided last month, we would have saved time.", ko: "2형(decided / would save)은 지금·미래에 대한 가상이고, 3형(had decided / would have saved)은 과거에 대한 가상입니다." },
      { a: "If we had ordered in March, we would have received it in June.", b: "If we had ordered in March, it would be here now.", ko: "결과도 과거이면 would have + p.p.(3형), 결과가 지금 상태이면 would + 동사원형(혼합 조건문)입니다." },
    ],
    mistakes: [
      { wrong: "If we would have decided earlier, we would have saved time.", right: "If we had decided earlier, we would have saved time.", ko: "if절에는 would have가 아니라 had + 과거분사를 씁니다." },
      { wrong: "If we had decided earlier, we would save two weeks.", right: "If we had decided earlier, we would have saved two weeks.", ko: "2주를 절약하는 것도 과거의 결과이므로 would have + 과거분사를 씁니다. 결과가 지금 상태일 때만 would + 동사원형을 씁니다." },
      { wrong: "If we had decided now, we could save time.", right: "If we decided now, we could save time.", ko: "had decided는 과거에 대한 가정이므로 now와 함께 쓸 수 없습니다. 지금에 대한 가정은 decided(2형), 실제 가능한 조건은 decide(1형)입니다." },
      { wrong: "If we have decided earlier, we would have saved time.", right: "If we had decided earlier, we would have saved time.", ko: "과거에 대한 가정은 have가 아니라 had + 과거분사입니다." },
    ],
  },
};
