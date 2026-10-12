import type { ErrorCategory } from "../core/types";

/**
 * The learner's real historical mistakes, imported as the starting error
 * history. They are marked "imported" — they seed the review queue but are
 * never counted as verified mastery evidence.
 */
export interface SeedMistake {
  id: string;
  label: string;
  incorrect: string;
  correct: string;
  skill: string;
  relatedSkills: string[];
  category: ErrorCategory;
  whyKo: string;
  ruleKo: string;
  examples: { en: string; ko: string }[];
}

export const SEEDS: SeedMistake[] = [
  {
    id: "seed-too-early",
    label: "too early / too late",
    incorrect: "I think so late",
    correct: "I think it's too early.",
    skill: "too-adj",
    relatedSkills: ["agreement"],
    category: "meaning-shift",
    whyKo: "'so late'는 '너무 늦었다'는 뜻이라 '아직 결정하기 이르다'는 의도와 반대입니다. 또 'I think' 뒤에는 주어와 동사(it's)가 있는 완전한 절이 와야 합니다.",
    ruleKo: "too + 형용사 (+ to 동사): '지나치게 ~해서 …할 수 없다'. 판단을 말할 때는 It's too early to decide. 처럼 가주어 it을 씁니다.",
    examples: [
      { en: "It's too early to select the dryer.", ko: "건조기를 선정하기에는 너무 이릅니다." },
      { en: "It's too late to change the P&ID for this revision.", ko: "이번 리비전에서 P&ID를 바꾸기에는 너무 늦었습니다." },
      { en: "I think it's still too early to finalize the heat balance.", ko: "열수지를 확정하기에는 아직 이르다고 생각합니다." },
    ],
  },
  {
    id: "seed-still-waiting",
    label: "be + V-ing / wait for",
    incorrect: "We still waiting data",
    correct: "We are still waiting for data.",
    skill: "progressive",
    relatedSkills: ["verb-prep"],
    category: "be-verb",
    whyKo: "진행형에는 be동사가 반드시 필요합니다(We are waiting). 그리고 wait는 목적어를 바로 받지 못해서 기다리는 대상 앞에 for를 씁니다.",
    ruleKo: "주어 + be + (still) + V-ing + for + 명사. 'still'은 be동사 뒤, -ing 앞에 둡니다.",
    examples: [
      { en: "We are still waiting for the lab results.", ko: "우리는 아직 실험 결과를 기다리고 있습니다." },
      { en: "The vendor is waiting for our final datasheet.", ko: "벤더가 우리의 최종 데이터시트를 기다리고 있습니다." },
      { en: "We are waiting for approval from the client.", ko: "고객의 승인을 기다리고 있습니다." },
    ],
  },
  {
    id: "seed-check-object",
    label: "check + object",
    incorrect: "Check for actual feed rate",
    correct: "Check the actual feed rate.",
    skill: "verb-object",
    relatedSkills: ["articles"],
    category: "preposition",
    whyKo: "check는 목적어를 바로 받는 타동사입니다. 'check for'는 '~이 있는지 찾아보다'(check for leaks)라는 다른 뜻이 됩니다. 특정한 값 앞에는 the가 필요합니다.",
    ruleKo: "check + the + 명사 (값을 확인) / check for + 명사 (존재 여부를 점검: check for leaks).",
    examples: [
      { en: "Please check the steam pressure at the dryer inlet.", ko: "건조기 입구의 스팀 압력을 확인해 주세요." },
      { en: "We need to check the moisture content again.", ko: "수분 함량을 다시 확인해야 합니다." },
      { en: "Check the flange for leaks before startup.", ko: "기동 전에 플랜지에 누설이 있는지 점검하세요." },
    ],
  },
  {
    id: "seed-receive-when",
    label: "receive (data) / if vs when",
    incorrect: "If we accept data",
    correct: "When we receive the data,",
    skill: "collocation",
    relatedSkills: ["if-when"],
    category: "word-choice",
    whyKo: "데이터를 '받다'는 receive입니다. accept는 '(제안·조건을) 수락하다'라는 뜻이라 의미가 달라집니다. 또 데이터를 받는 것이 확실한 일이면 if(만약)가 아니라 when(~하면/~할 때)을 씁니다.",
    ruleKo: "receive + 데이터/문서/결과 (받다) · accept + 제안/조건/결과물 (승인하다). if = 일어날지 불확실, when = 일어날 것이 확실.",
    examples: [
      { en: "When we receive the vendor data, we will update the datasheet.", ko: "벤더 데이터를 받으면 데이터시트를 업데이트하겠습니다." },
      { en: "If we receive the data by Friday, we can finish the mass balance.", ko: "금요일까지 데이터를 받는다면 물질수지를 끝낼 수 있습니다." },
      { en: "The client accepted our proposal.", ko: "고객이 우리 제안을 수락했습니다." },
    ],
  },
  {
    id: "seed-before-ing",
    label: "before + V-ing",
    incorrect: "Before complete our design",
    correct: "Before completing our design,",
    skill: "prep-gerund",
    relatedSkills: ["time-clause"],
    category: "verb-form",
    whyKo: "before가 전치사로 쓰이면 뒤에 명사나 동명사(V-ing)가 옵니다. 동사원형(complete)은 바로 올 수 없습니다. 주어를 넣으면 'before we complete'도 가능합니다.",
    ruleKo: "before + 명사 (before the meeting) / before + V-ing (before completing) / before + 주어 + 동사 (before we complete).",
    examples: [
      { en: "Before completing the design, we need the final feed composition.", ko: "설계를 완료하기 전에 최종 원료 조성이 필요합니다." },
      { en: "Before we start the pump, we must check the suction valve.", ko: "펌프를 기동하기 전에 흡입 밸브를 확인해야 합니다." },
      { en: "After reviewing the P&ID, we will send our comments.", ko: "P&ID를 검토한 후에 코멘트를 보내겠습니다." },
    ],
  },
  {
    id: "seed-schedule-delayed",
    label: "be + a little delayed",
    incorrect: "Our design schedule some lated",
    correct: "Our design schedule is a little delayed.",
    skill: "be-adj",
    relatedSkills: ["degree"],
    category: "be-verb",
    whyKo: "상태를 말할 때는 be동사가 필요합니다(is delayed). 'lated'는 영어 단어가 아니고, '조금'은 some이 아니라 a little / slightly로 표현합니다.",
    ruleKo: "주어 + be + (a little / slightly) + delayed / behind schedule. some은 수량(some data)에, a little은 정도에 씁니다.",
    examples: [
      { en: "The equipment delivery is slightly delayed.", ko: "장비 납품이 약간 지연되고 있습니다." },
      { en: "We are about two weeks behind schedule.", ko: "일정이 약 2주 늦어졌습니다." },
      { en: "The commissioning is a little delayed because of the steam supply.", ko: "스팀 공급 문제로 시운전이 조금 지연되고 있습니다." },
    ],
  },
  {
    id: "seed-object-order",
    label: "verb + object + first",
    incorrect: "We check it first the actual feed rate",
    correct: "We check the actual feed rate first.",
    skill: "word-order",
    relatedSkills: ["verb-object"],
    category: "word-order",
    whyKo: "영어는 '동사 + 목적어'를 먼저 붙여 쓰고 first 같은 부사는 그 뒤에 둡니다. 목적어(the actual feed rate)가 있는데 it을 또 쓰면 목적어가 두 번 나옵니다.",
    ruleKo: "주어 + 동사 + 목적어 + 부사(first / again / later). 또는 문장 맨 앞: First, we check the actual feed rate.",
    examples: [
      { en: "We will review the P&ID first.", ko: "먼저 P&ID를 검토하겠습니다." },
      { en: "First, we need to confirm the design basis.", ko: "먼저 설계 기준을 확정해야 합니다." },
      { en: "Please send the datasheet again.", ko: "데이터시트를 다시 보내 주세요." },
    ],
  },
];

export const SEED_BY_ID: Record<string, SeedMistake> = Object.fromEntries(SEEDS.map((s) => [s.id, s]));
