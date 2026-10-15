/**
 * Intelligence items: verified sources, companies, projects, equipment vendors, market data and open
 * questions collected for one research programme (NAYSOR: EFB/POME → washing, drying, pellets,
 * torrefaction, biochar). Each item keeps its evidence: where it came from, how reliable the source
 * type is, and whether the fact is independently confirmed, a company claim or an estimate.
 */
export type IntelKind = "source" | "company" | "project" | "vendor" | "equipment" | "market" | "gap";
export type IntelStatus = "verified" | "claimed" | "estimate" | "unverified";
export type IntelStage = "research" | "pilot" | "construction" | "commissioning" | "commercial-production" | "commercial-sales" | "stopped";

export interface IntelDatum { label: string; value: string; unit?: string; basis?: string; where?: string }
export interface IntelRelation { to: string; type: string }
export interface IntelApplicability { new?: string; fit?: string; designChange?: string; testVars?: string; capex?: string; quality?: string; scaleup?: string; questions?: string }
/** What the reader decided about an item: kept, filed, noted. Synced; never overwritten by a new pack. */
export interface IntelUserState { star?: boolean; folderId?: string | null; note?: string; hidden?: boolean; read?: boolean; docId?: string; updatedAt?: string }

export interface IntelItem {
  id: string; kind: IntelKind; topics: string[];
  title: string; titleKo?: string; summaryKo?: string;
  org?: string; authors?: string; date?: string; url: string; pdfUrl?: string; lang?: string; country?: string;
  sourceType?: string; reliability?: number; status?: IntelStatus; stage?: IntelStage;
  data?: IntelDatum[]; relations?: IntelRelation[]; equipment?: Record<string, string>; naysor?: IntelApplicability;
  checkedAt?: string;
  /** The pack it came in and when it was stored here. */
  pack?: string; addedAt?: string; updatedAt?: string;
  user?: IntelUserState;
}

/** A written briefing that comes with a pack (executive summary, benchmark, pilot implications…), Markdown. */
export interface IntelBrief { id: string; title: string; body: string; order?: number; pack?: string; updatedAt?: string }
export interface IntelPack { format: "paperflow-intel"; version: 1; id: string; title?: string; generatedAt: string; items: IntelItem[]; briefs?: IntelBrief[] }

export interface TopicNode { id: string; label: string; children?: TopicNode[] }
/** The topic tree on the left of the Intelligence tab (an item can sit under several topics). */
export const TOPIC_TREE: TopicNode[] = [
  { id: "g-process", label: "공정 기술", children: [
    { id: "efb-washing", label: "EFB 세척·회분/K·Cl 저감" }, { id: "dewatering", label: "탈수·압착" }, { id: "drying", label: "건조" },
    { id: "pelletizing", label: "펠릿화" }, { id: "torrefaction", label: "반탄화 (Torrefaction)" }, { id: "carbonization", label: "탄화·열분해" }
  ] },
  { id: "g-biochar", label: "바이오차", children: [{ id: "biochar-quality", label: "바이오차 품질" }, { id: "biochar-production", label: "바이오차 생산" }, { id: "cdr", label: "탄소제거·인증 (CDR)" }] },
  { id: "g-env", label: "환경·정책", children: [{ id: "efb-pome-impact", label: "EFB/POME 환경피해" }, { id: "palm-byproducts", label: "팜오일공장 부산물" }, { id: "policy", label: "정부 보고서·정책" }] },
  { id: "g-market", label: "시장", children: [{ id: "market-price", label: "가격·시중판매가" }, { id: "market-demand", label: "수요·구매처" }, { id: "producers", label: "생산지·생산기업" }, { id: "cofiring", label: "석탄 혼소" }] },
  { id: "g-industry", label: "기업·장비", children: [{ id: "vendors", label: "장비 벤더" }] }
];
export const TOPIC_LABEL = new Map(TOPIC_TREE.flatMap(group => [[group.id, group.label] as const, ...(group.children ?? []).map(child => [child.id, child.label] as const)]));
export const topicIds = (node: TopicNode): string[] => [node.id, ...(node.children ?? []).flatMap(topicIds)];

export const KIND_LABEL: Record<IntelKind, string> = { source: "자료", company: "기업", project: "프로젝트", vendor: "벤더", equipment: "장비", market: "시장", gap: "확인 필요" };
export const STATUS_LABEL: Record<IntelStatus, string> = { verified: "확인됨", claimed: "기업 주장", estimate: "추정", unverified: "미확인" };
export const STAGE_LABEL: Record<IntelStage, string> = { research: "연구", pilot: "파일럿", construction: "건설", commissioning: "시운전", "commercial-production": "상업생산", "commercial-sales": "상업판매", stopped: "중단" };
/** Source priority 1–7 (lower is stronger), as in the research brief. */
export const RELIABILITY_LABEL: Record<number, string> = { 1: "정부·규제기관", 2: "실증·운전 보고서", 3: "SCI 논문·연구기관", 4: "상장사 보고서", 5: "특허·카탈로그", 6: "시장분석기관", 7: "언론·홍보" };
export const LANG_LABEL: Record<string, string> = { en: "영어", ko: "한국어", ja: "일본어", zh: "중국어", id: "인도네시아어", ms: "말레이어", de: "독일어", fr: "프랑스어", nl: "네덜란드어", fi: "핀란드어", sv: "스웨덴어" };
export const APPLICABILITY_LABEL: [keyof IntelApplicability, string][] = [
  ["new", "새로 확인한 것"], ["fit", "NAYSOR 가정과 비교"], ["designChange", "설계 변경 검토"], ["testVars", "파일럿 검증 변수"],
  ["capex", "CAPEX/OPEX 영향"], ["quality", "제품 품질·가격 영향"], ["scaleup", "스케일업 위험"], ["questions", "기업·벤더에 물을 것"]
];
