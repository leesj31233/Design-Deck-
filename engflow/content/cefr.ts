import type { Cefr } from "../core/types";

/** CEFR global descriptors adapted to engineering meetings, with example responses. */
export const CEFR_DESCRIPTORS: Record<Cefr, { titleKo: string; canDoKo: string; example: string; exampleNoteKo: string }> = {
  A1: {
    titleKo: "기초 단어와 표현",
    canDoKo: "아주 기본적인 단어와 짧은 표현으로 자신의 이름, 역할, 간단한 숫자를 말할 수 있습니다.",
    example: "Pump. Stop. Problem.",
    exampleNoteKo: "단어 나열로 의미를 추측하게 해야 합니다.",
  },
  A2: {
    titleKo: "간단한 일상 업무 소통",
    canDoKo: "익숙한 업무에 대해 짧고 단순한 문장으로 말하고, 간단한 요청과 확인을 할 수 있습니다.",
    example: "The pump is stopped. We are checking it now.",
    exampleNoteKo: "현재 상태를 짧게 전달하지만 원인과 다음 조치는 설명하지 못합니다.",
  },
  B1: {
    titleKo: "익숙한 업무와 간단한 문제 설명",
    canDoKo: "익숙한 업무와 직접적인 문제를 설명하고, 이유와 다음 단계를 간단히 연결해 말할 수 있습니다.",
    example: "The pump stopped this morning because the suction pressure was too low. We are checking the strainer now.",
    exampleNoteKo: "원인(because)과 현재 조치를 연결하지만 영향과 대안까지는 다루지 못합니다.",
  },
  B2: {
    titleKo: "기술 문제 설명과 결정의 근거 제시",
    canDoKo: "기술적 문제를 구조적으로 설명하고, 결정의 근거를 제시하며, 체계적인 업무 회의에 참여할 수 있습니다.",
    example:
      "The pump tripped this morning because the suction pressure dropped below the minimum. We think the strainer is blocked, so we will clean it and restart the pump this afternoon. If the pressure is still low, we might need to check the tank level control.",
    exampleNoteKo: "원인 → 판단 → 조치 → 조건부 대안을 명확한 구조로 전달합니다.",
  },
  C1: {
    titleKo: "복잡한 논의에서 유연하고 정확한 소통",
    canDoKo: "복잡한 전문 논의에서 정확하고 유연하게 의견을 조율하고, 불확실성과 위험을 균형 있게 표현할 수 있습니다.",
    example:
      "The trip was caused by low suction pressure, most likely from a partially blocked strainer. We can restart after cleaning it, but if we had installed the differential pressure alarm we proposed in the HAZOP, we would have caught this earlier — so I'd suggest we add it before the next campaign.",
    exampleNoteKo: "가능성의 정도, 과거 가정, 제안을 자연스럽게 결합하지만 여전히 쉬운 단어를 씁니다.",
  },
  C2: {
    titleKo: "미묘한 뉘앙스까지 거의 완전한 구사",
    canDoKo: "까다로운 협상과 논쟁에서도 미묘한 뉘앙스를 정확하게 구분해 거의 완전하게 소통할 수 있습니다.",
    example:
      "I'd rather not attribute the trip to the strainer alone; the pressure trend suggests the level controller was hunting beforehand, which would have starved the suction even with a clean strainer.",
    exampleNoteKo: "원어민 수준의 정밀성. 이 앱의 목표(B2–C1)를 넘어서는 수준입니다.",
  },
};

/**
 * TOEIC Speaking reference data. Collected 2026-10 from search-index excerpts
 * of ETS regional PDFs and YBM Korea pages; the hosts could not be opened
 * directly from the build environment, so treat every figure as needing a
 * manual check against the official documents before relying on it.
 */
export const TOEIC_SPEAKING = {
  scale: "0–200 (10점 단위)",
  /** ETS minimum scores (cut scores) per CEFR level for TOEIC Speaking. C2 is not mapped. */
  cefrMinimum: { A1: 50, A2: 90, B1: 120, B2: 160, C1: 180 } as Partial<Record<Cefr, number>>,
  /** Same mapping for TOEIC Writing (the closest analogue to this app's written test). */
  writingCefrMinimum: { A1: 30, A2: 70, B1: 120, B2: 150, C1: 180 } as Partial<Record<Cefr, number>>,
  /** Korean score-report labels (YBM, since the 4 June 2022 test). */
  koreanLabels: [
    { label: "AH", range: "200" },
    { label: "AM", range: "180–190" },
    { label: "AL", range: "160–170" },
    { label: "IH", range: "140–150" },
    { label: "IM3", range: "130" },
    { label: "IM2", range: "120" },
    { label: "IM1", range: "110" },
    { label: "IL", range: "90–100" },
    { label: "NH", range: "60–80" },
    { label: "NM/NL", range: "0–50" },
  ],
  sources: [
    { label: "ETS — Mapping the TOEIC tests on the CEFR (reference PDF)", url: "https://www.eu.ets.org/content/dam/ets-org/eu/pdfs/toeic/toeic-mapping-cefr-reference.pdf" },
    { label: "ETS — TOEIC Speaking & Writing mapping", url: "https://www.eu.ets.org/content/dam/ets-org/eu/pdfs/toeic/mapping-speaking-writing.pdf" },
    { label: "Tannenbaum & Wylie, ETS RR-08-34 (2008)", url: "https://www.ets.org/Media/Research/pdf/RR-08-34.pdf" },
    { label: "YBM 한국토익위원회 — TOEIC Speaking 등급 안내", url: "https://www.toeicswt.co.kr/common/template/viewContents.php?contentsCode=78" },
  ],
  caveatsKo: [
    "CEFR과 TOEIC Speaking은 서로 바꿔 쓸 수 있는 척도가 아닙니다. ETS 표는 각 CEFR 단계의 '최소 점수(cut score)'이며 동등 점수가 아닙니다.",
    "ETS는 이 값을 엄격한 기준이 아닌 참고 지침으로 사용하라고 안내합니다.",
    "이 앱의 레벨 테스트는 글로 쓴 답(작문)만 평가합니다. 말하기를 평가하지 않았으므로 공인 TOEIC Speaking 점수나 등급을 산출할 수 없습니다.",
    "IM1–IM3 세부 구간과 IH 구간은 공식 안내와 언론 보도를 함께 참고했습니다. 실제 성적표 기준은 YBM 공식 안내를 확인하세요.",
  ],
};

/**
 * Contextual (non-official) reading of a CEFR estimate against the Korean
 * TOEIC Speaking labels, derived from the ETS minimum scores above.
 */
export function toeicContext(level: Cefr): { minScore: number | null; nextMin: number | null; labelsKo: string } {
  const min = TOEIC_SPEAKING.cefrMinimum[level] ?? null;
  const order: Cefr[] = ["A1", "A2", "B1", "B2", "C1"];
  const next = order[order.indexOf(level) + 1];
  const nextMin = next ? TOEIC_SPEAKING.cefrMinimum[next] ?? null : null;
  const labelFor = (score: number) => {
    if (score >= 200) return "AH";
    if (score >= 180) return "AM";
    if (score >= 160) return "AL";
    if (score >= 140) return "IH";
    if (score >= 130) return "IM3";
    if (score >= 120) return "IM2";
    if (score >= 110) return "IM1";
    if (score >= 90) return "IL";
    if (score >= 60) return "NH";
    return "NM/NL";
  };
  if (min === null) return { minScore: null, nextMin: null, labelsKo: level === "C2" ? "ETS는 C2를 TOEIC Speaking에 대응시키지 않습니다." : "대응 정보 없음" };
  const upper = nextMin ? nextMin - 10 : 200;
  const lowLabel = labelFor(min);
  const highLabel = labelFor(upper);
  return { minScore: min, nextMin, labelsKo: lowLabel === highLabel ? lowLabel : `${lowLabel}–${highLabel}` };
}
