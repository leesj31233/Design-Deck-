/**
 * Terms a briefing uses without explaining: hovering one shows its full name, what it means and why it
 * matters here. Packs can add or override terms (`glossary` in the pack).
 */
export interface GlossaryTerm { term: string; full: string; meaning: string; note?: string; aliases?: string[] }

export const BASE_GLOSSARY: GlossaryTerm[] = [
  { term: "FIT", full: "Feed-in Tariff (고정가격 매입제도)", meaning: "재생에너지 전력을 정부가 정한 고정 가격으로 일정 기간 사들이는 제도.", note: "일본 바이오매스 발전소가 PKS·EFB 펠릿을 수입하는 근거. 연료는 지속가능성·GHG 기준을 충족해야 한다." },
  { term: "FIP", full: "Feed-in Premium (시장연동 프리미엄 제도)", meaning: "발전사업자가 전력을 시장가로 팔고, 기준가와의 차액만큼 프리미엄을 받는 제도.", note: "일본은 2022년부터 FIT에서 FIP로 전환 중. 연료 요건은 FIT와 같다." },
  { term: "LCA", full: "Life Cycle Assessment (전과정평가)", meaning: "원료 채취부터 가공·운송·사용·폐기까지 제품 전 과정의 환경영향(주로 온실가스)을 정량화하는 방법.", note: "일본 FIT/FIP는 바이오매스 연료의 LCA GHG가 화석연료 대비 일정 비율 이상 낮아야 인정한다. 세척 폐수 메탄이 큰 변수." },
  { term: "GHG", full: "Greenhouse Gas (온실가스)", meaning: "CO2, CH4, N2O 등 지구온난화를 일으키는 기체. 보통 CO2 환산량(CO2e)으로 합산한다." },
  { term: "GGL", full: "Green Gold Label", meaning: "네덜란드 기반 바이오매스 연료 지속가능성 인증. 원료 추적성, 지속가능성, GHG 산정을 검증한다.", note: "일본 FIT/FIP에서 팜 부산물(PKS·EFB) 연료에 인정되는 제3자 인증 중 하나. TESS가 2026년 9월 EFB 펠릿으로 취득." },
  { term: "ISCC", full: "International Sustainability and Carbon Certification", meaning: "바이오매스·바이오연료의 지속가능성과 탄소 배출을 인증하는 국제 제도(ISCC EU, ISCC PLUS 등).", note: "유럽 수출(예: 이탈리아향 PKS)과 일본 FIT 연료 인정에 쓰인다." },
  { term: "RSPO", full: "Roundtable on Sustainable Palm Oil", meaning: "지속가능한 팜오일 생산을 위한 국제 인증·원탁회의." },
  { term: "ISPO", full: "Indonesian Sustainable Palm Oil", meaning: "인도네시아 정부의 의무 팜오일 지속가능성 인증." },
  { term: "MSPO", full: "Malaysian Sustainable Palm Oil", meaning: "말레이시아 정부의 의무 팜오일 지속가능성 인증.", note: "일본 FIT/FIP의 팜 부산물 연료 인증으로도 인정된다." },
  { term: "SBP", full: "Sustainable Biomass Program", meaning: "목재 펠릿·칩 중심의 바이오매스 지속가능성 인증." },
  { term: "EFB", full: "Empty Fruit Bunch (빈 과방)", meaning: "팜 열매송이에서 과육을 떼어낸 뒤 남는 섬유질 송이. 팜오일 공장(CPO mill)의 최대 고형 부산물.", note: "함수율 60–70%, K·Cl·회분이 높아 세척 없이는 연료 품질이 낮다." },
  { term: "POME", full: "Palm Oil Mill Effluent (팜오일 공장 폐수)", meaning: "팜오일 착유 과정에서 나오는 고농도 유기성 폐수. 개방 라군에서 다량의 메탄을 배출한다." },
  { term: "PKS", full: "Palm Kernel Shell (팜 핵 껍데기)", meaning: "팜 핵을 감싼 단단한 껍데기. 회분이 낮고 열량이 높아 일본 발전소용 수출 연료로 거래된다.", note: "EFB 펠릿의 직접 경쟁 연료이자 가격 기준점(2026-07 약 $92–100/t fob)." },
  { term: "CPO", full: "Crude Palm Oil (원유 팜오일)", meaning: "팜 열매에서 짜낸 정제 전 팜오일." },
  { term: "FFB", full: "Fresh Fruit Bunch (생 팜 열매송이)", meaning: "수확한 팜 열매송이. 공장 처리용량은 보통 FFB t/h로 표시한다.", note: "FFB 처리량과 EFB 발생량(FFB의 약 20–23%)을 혼동하지 말 것." },
  { term: "FOB", full: "Free On Board (본선인도조건)", meaning: "수출항에서 배에 실을 때까지 판매자가 비용을 부담하는 가격 조건. 해상운임·보험은 구매자 부담." },
  { term: "CFR", full: "Cost and Freight (운임포함인도조건)", meaning: "판매자가 도착항까지 해상운임을 부담하는 가격 조건(보험 제외)." },
  { term: "CIF", full: "Cost, Insurance and Freight (운임·보험료포함인도조건)", meaning: "판매자가 도착항까지 운임과 보험료를 부담하는 가격 조건." },
  { term: "NCV", full: "Net Calorific Value (저위발열량)", meaning: "연소 시 생기는 수증기의 응축열을 제외한 발열량. 연료 거래·발전 효율 계산에 주로 쓴다.", aliases: ["LHV"] },
  { term: "HHV", full: "Higher Heating Value (고위발열량)", meaning: "수증기 응축열까지 포함한 발열량. NCV보다 크다. 비교할 때 기준을 맞춰야 한다.", aliases: ["GCV"] },
  { term: "REC", full: "Renewable Energy Certificate (신재생에너지 공급인증서)", meaning: "한국 RPS 제도에서 재생에너지 발전량을 증명하는 인증서. 바이오매스는 가중치가 낮아지는 추세.", note: "2024-12 이후 신규 목질계 바이오매스 설비에는 REC가 부여되지 않는다." },
  { term: "RPS", full: "Renewable Portfolio Standard (신재생에너지 공급의무화)", meaning: "대형 발전사에 발전량의 일정 비율을 재생에너지로 공급하도록 의무화한 한국 제도." },
  { term: "CDR", full: "Carbon Dioxide Removal (탄소 제거)", meaning: "대기 중 CO2를 제거해 장기간 저장하는 활동. 바이오차는 탄소를 토양 등에 수백 년 이상 고정한다.", note: "연료 판매에 따른 '배출 감축'과는 다른 개념으로, 크레딧으로 팔 수 있는 것은 제거량이다." },
  { term: "MRV", full: "Measurement, Reporting and Verification (측정·보고·검증)", meaning: "탄소 감축·제거량을 측정하고 보고하며 제3자가 검증하는 체계." },
  { term: "CORC", full: "CO2 Removal Certificate", meaning: "Puro.earth가 발행하는 탄소 제거 인증서(1 CORC = 1 tCO2e 제거).", aliases: ["CORCs"] },
  { term: "Puro", full: "Puro.earth", meaning: "바이오차 등 내구성 탄소 제거를 인증하는 레지스트리. 2025년 방법론에서 EFB를 원료로 명시했다.", aliases: ["Puro.earth"] },
  { term: "Verra", full: "Verra (VCS 레지스트리)", meaning: "세계 최대 자발적 탄소시장 인증기관. 바이오차 방법론은 VM0044." },
  { term: "VM0044", full: "Verra VM0044 — Methodology for Biochar Utilization in Soil and Non-Soil Applications", meaning: "Verra의 바이오차 탄소 제거 방법론. 원료 적격성, 영속성 계수, 투자 분석을 요구한다." },
  { term: "H/Corg", full: "Hydrogen to organic carbon molar ratio", meaning: "바이오차의 수소/유기탄소 몰비. 낮을수록 탄화도가 높아 탄소가 오래 유지된다.", note: "Puro·EBC는 0.7 미만 요구. EFB 바이오차는 400°C 0.60, 600°C 0.33." },
  { term: "PAH", full: "Polycyclic Aromatic Hydrocarbons (다환방향족탄화수소)", meaning: "불완전 연소·열분해에서 생기는 유해 유기물. 바이오차 안전성 기준 항목." },
  { term: "EBC", full: "European Biochar Certificate", meaning: "유럽 바이오차 품질·안전 인증(H/Corg, PAH, 중금속 기준 등)." },
  { term: "NDC", full: "Nationally Determined Contribution (국가 온실가스 감축목표)", meaning: "파리협정에 따라 각국이 제출하는 감축 목표. 탄소 크레딧 해외 이전 시 국가 승인이 필요할 수 있다." },
  { term: "TEA", full: "Techno-Economic Analysis (기술경제성 평가)", meaning: "공정 설계와 비용·수익을 결합해 경제성을 평가하는 방법." },
  { term: "CAPEX", full: "Capital Expenditure (설비투자비)", meaning: "설비·건설 등 초기 투자 비용." },
  { term: "OPEX", full: "Operating Expenditure (운영비)", meaning: "원료, 유틸리티, 인건비, 유지보수 등 운영 비용." },
  { term: "EBITDA", full: "Earnings Before Interest, Taxes, Depreciation and Amortization", meaning: "이자·세금·감가상각 전 영업이익. 현금창출력 지표." },
  { term: "IRR", full: "Internal Rate of Return (내부수익률)", meaning: "투자의 순현재가치를 0으로 만드는 할인율." },
  { term: "NPV", full: "Net Present Value (순현재가치)", meaning: "미래 현금흐름을 현재가치로 할인해 투자비를 뺀 값." },
  { term: "MSP", full: "Minimum Selling Price (최소판매가격)", meaning: "목표 수익률(보통 NPV=0)을 달성하는 제품 최소 가격." },
  { term: "EPC", full: "Engineering, Procurement and Construction", meaning: "설계·조달·시공을 일괄 수행하는 계약 방식." },
  { term: "IPP", full: "Independent Power Producer (민간 발전사업자)", meaning: "전력회사가 아닌 독립 발전사업자." },
  { term: "PLN", full: "PT Perusahaan Listrik Negara", meaning: "인도네시아 국영 전력회사. 석탄발전소 바이오매스 혼소를 추진한다.", aliases: ["PLN EPI"] },
  { term: "TNB", full: "Tenaga Nasional Berhad", meaning: "말레이시아 최대 전력회사. EFB 펠릿 혼소 실증을 진행했다." },
  { term: "MPOB", full: "Malaysian Palm Oil Board (말레이시아 팜오일청)", meaning: "말레이시아 팜오일 산업 규제·연구 기관. EFB 펠릿 품질 연구를 발표했다." },
  { term: "BRIN", full: "Badan Riset dan Inovasi Nasional (인도네시아 국가연구혁신청)", meaning: "인도네시아 국가 연구기관." },
  { term: "METI", full: "Ministry of Economy, Trade and Industry (일본 경제산업성)", meaning: "일본 FIT/FIP와 바이오매스 연료 지속가능성 기준을 관장한다." },
  { term: "ESDM", full: "Kementerian Energi dan Sumber Daya Mineral (인도네시아 에너지광물자원부)", meaning: "인도네시아 에너지 정책·바이오매스 혼소 규정 소관 부처." },
  { term: "MOTIE", full: "Ministry of Trade, Industry and Energy (산업통상자원부)", meaning: "한국 RPS·REC 제도 소관 부처." },
  { term: "MVR", full: "Mechanical Vapor Recompression (기계적 증기 재압축)", meaning: "증발한 수증기를 압축해 다시 열원으로 쓰는 고효율 증발 기술. 세척수 농축·회수에 쓰인다." },
  { term: "HTC", full: "Hydrothermal Carbonization (수열탄화)", meaning: "물 속에서 180–250°C, 가압 조건으로 바이오매스를 탄화하는 공정. 습한 원료를 건조 없이 처리한다." },
  { term: "TORWASH", full: "TORWASH (Torrefaction + Washing)", meaning: "TNO/ECN이 개발한 수열 처리와 세척을 결합한 공정. K·Cl을 크게 제거한다(랩 결과)." },
  { term: "CFB", full: "Circulating Fluidized Bed (순환유동층)", meaning: "연료와 모래 등 층물질을 순환시키며 연소하는 보일러. 저품위 연료에 유리하다." },
  { term: "CSTR", full: "Continuous Stirred-Tank Reactor (연속 교반조)", meaning: "교반기로 내용물을 균일하게 섞으며 연속 운전하는 탱크. 세척·침출 공정에 쓰인다." },
  { term: "PFD", full: "Process Flow Diagram (공정흐름도)", meaning: "주요 설비와 물질·에너지 흐름을 나타낸 도면." },
  { term: "P&ID", full: "Piping and Instrumentation Diagram (배관계장도)", meaning: "배관, 밸브, 계기, 제어 루프까지 표시한 상세 도면." },
  { term: "FEED", full: "Front-End Engineering Design (기본설계)", meaning: "상세설계 전 단계로, 공정·설비 사양과 투자비를 확정하는 설계. Pre-FEED는 그 이전의 개념 검토.", aliases: ["Pre-FEED"] },
  { term: "TRL", full: "Technology Readiness Level (기술성숙도)", meaning: "기초연구(1)부터 상업 운전(9)까지 기술 성숙 단계를 나타내는 척도." },
  { term: "DM", full: "Dry Matter (건물, 건조 고형분)", meaning: "수분을 제외한 고형분 질량. %DM은 건물 기준 함량.", aliases: ["%DM"] },
  { term: "ISO 17225", full: "ISO 17225 — Solid biofuels: Fuel specifications and classes", meaning: "고체 바이오연료 규격 국제표준. 17225-2는 목재 펠릿, 17225-6은 비목재 펠릿(EFB 등) 등급을 정한다.", aliases: ["ISO 17225-6", "ISO 17225-2"] },
  { term: "SNI", full: "Standar Nasional Indonesia (인도네시아 국가표준)", meaning: "인도네시아 국가표준. SNI 8675:2018은 바이오매스 펠릿 규격." },
  { term: "cal%", full: "Calorific percentage (열량 기준 혼소율)", meaning: "보일러 투입 총 열량 중 바이오매스가 차지하는 비율. 질량 기준 혼소율과 다르다." }
];

/** Terms as one lookup (aliases included), longest first so "PLN EPI" wins over "PLN". */
export function glossaryIndex(extra: GlossaryTerm[] = []) {
  const byKey = new Map<string, GlossaryTerm>();
  for (const term of [...BASE_GLOSSARY, ...extra]) for (const key of [term.term, ...(term.aliases ?? [])]) byKey.set(key, term);
  const keys = [...byKey.keys()].sort((a, b) => b.length - a.length);
  // Only syntax characters may be escaped under the unicode flag ("\&" or "\%" would be an error).
  const escape = (key: string) => key.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  // Whole words only: "FIT" in "FIT-compliant" yes, inside "PROFIT" no.
  let pattern: RegExp | null = null;
  // A pack's term can never break the page: without a valid pattern, terms are simply not underlined.
  try { pattern = keys.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${keys.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "gu") : null; } catch { pattern = null; }
  return { byKey, pattern };
}
