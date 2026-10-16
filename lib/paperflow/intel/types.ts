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
export interface IntelPerson { name: string; title: string; background?: string; ref?: string; url?: string }
export interface IntelFinancials { fiscalYear: string; currency?: string; revenue?: string; operatingProfit?: string; netIncome?: string; totalAssets?: string; equity?: string; employees?: string; marketCap?: string; source: string; note?: string }
export const FINANCIAL_LABEL: [keyof IntelFinancials, string][] = [["revenue", "매출"], ["operatingProfit", "영업이익"], ["netIncome", "순이익"], ["totalAssets", "총자산"], ["equity", "자본총계"], ["marketCap", "시가총액"], ["employees", "직원 수"]];
export type PlaceKind = "hq" | "plant" | "project" | "site" | "port" | "other";
export interface IntelPlace { lat: number; lng: number; label: string; kind: PlaceKind; address?: string; precision: "exact" | "street" | "city" | "region"; ref?: string }
export const PLACE_LABEL: Record<PlaceKind, string> = { hq: "본사", plant: "공장", project: "프로젝트", site: "현장", port: "항만", other: "기타" };
export interface IntelUserState { star?: boolean; folderId?: string | null; note?: string; hidden?: boolean; read?: boolean; docId?: string | null; updatedAt?: string;
  /** Figures the reader added (a pasted screenshot, a photo), compressed to WebP; shown with the case's own. */
  figures?: { src: string; caption: string; addedAt: string }[] }

export interface IntelItem {
  id: string; kind: IntelKind; topics: string[]; classes?: IntelClass[];
  title: string; titleKo?: string; summaryKo?: string;
  org?: string; authors?: string; date?: string; url: string; pdfUrl?: string;
  /** The library copy of its PDF, put there by the research routine (document id = SHA-256). */
  libraryDoc?: string; lang?: string; country?: string;
  sourceType?: string; reliability?: number; status?: IntelStatus; stage?: IntelStage;
  data?: IntelDatum[]; relations?: IntelRelation[]; equipment?: Record<string, string>; naysor?: IntelApplicability;
  /** A company or project at a glance: industry, role, headquarters, stock code, website, projects… */
  profile?: Record<string, string>;
  /** A case file: the case taken apart from its primary documents, with their figures on the first page. */
  dossier?: IntelDossier;
  /** A small cover (WebP data URL): page 1 of a paper or report, an article's lead image or front page. */
  cover?: string;
  /** The cover is kept apart from the item (its own store and sync row); this says one exists. */
  hasCover?: boolean;
  /** A company's (or project owner's) logo, from its own website (WebP/PNG data URL, small). */
  logo?: string;
  /** The logo is light on a dark ground, so its tile is dark. */
  logoDark?: boolean;
  /** Latest reported figures from the annual report or filing, as printed (with units), and where they come from. */
  financials?: IntelFinancials;
  /** Source of each profile field: a case-file source number ("2" or "2, 4") or a URL. */
  profileRefs?: Record<string, string>;
  /** Executives named in public sources: name, title, professional background — no contact details, no photos. */
  people?: IntelPerson[];
  /** Where it is: headquarters, plants, project sites — for the map. Only places a source states. */
  geo?: IntelPlace[];
  /** News about companies/projects (a report, a new plan, an article, a withdrawal…): shown under "오늘자 업데이트" and in each company's archive. */
  update?: IntelUpdate;
  checkedAt?: string;
  /** The pack it came in and when it was stored here. */
  pack?: string; addedAt?: string; updatedAt?: string;
  user?: IntelUserState;
}

export type UpdateType = "report" | "vision" | "news" | "contract" | "plant" | "certification" | "exit" | "price" | "policy" | "research";
export const UPDATE_LABEL: Record<UpdateType, string> = { report: "보고서 공개", vision: "비전·계획 발표", news: "관련 기사", contract: "계약·제휴", plant: "공장·설비", certification: "인증", exit: "사업 철수·중단", price: "가격", policy: "정책·규제", research: "연구 결과" };
/** `date`: when it happened (or was published); `entities`: the companies/projects it is about (item ids). */
export interface IntelUpdate { type: UpdateType; date: string; entities: string[]; headline?: string }

/** A source of a case file; `ref` is how the text cites it ([1], [2]…). */
export interface DossierSource { ref: string; title: string; org?: string; date?: string; url?: string; pdfUrl?: string; libraryDoc?: string; where?: string; kind?: string; reliability?: number }
export interface DossierFigure { src: string; caption: string; ref?: string; where?: string }
export interface DossierFact { label: string; value: string; ref?: string; status?: IntelStatus }
export interface DossierEvent { date: string; event: string; ref?: string; status?: IntelStatus }
/** Where sources disagree: each version with its source, and what is believed (if anything). */
export interface DossierConflict { topic: string; versions: { value: string; ref?: string }[]; judgement?: string }
export interface IntelDossier {
  headline: string; asOf?: string;
  facts?: DossierFact[]; figures?: DossierFigure[]; timeline?: DossierEvent[]; conflicts?: DossierConflict[];
  /** Markdown sections (citations as [1], [2]; entity links allowed). */
  sections?: { title: string; body: string }[];
  sources?: DossierSource[];
}

/** A written briefing that comes with a pack (executive summary, benchmark, pilot implications…), Markdown. */
/** core: the standing analysis; daily/weekly/monthly/quarterly: dated updates, newest first. */
export type BriefPeriod = "core" | "daily" | "weekly" | "monthly" | "quarterly";
export const PERIOD_LABEL: Record<BriefPeriod, string> = { core: "핵심 분석", daily: "일간", weekly: "주간", monthly: "월간", quarterly: "분기" };
export interface IntelBrief { id: string; title: string; body: string; order?: number; period?: BriefPeriod; date?: string; pack?: string; updatedAt?: string; classes?: IntelClass[] }
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
  { id: "g-industry", label: "기업·장비", children: [{ id: "vendors", label: "장비 벤더" }, { id: "pellet-standard", label: "펠릿 등급·규격 (SNI·ISO)" }] },
  { id: "g-coal", label: "저품위탄 고품위화", children: [
    { id: "coal-market", label: "저품위탄 시장·수급" }, { id: "coal-price", label: "석탄 기준가 (HBA·지수)" }, { id: "coal-drying", label: "석탄 건조 기술" },
    { id: "coal-coating", label: "잔사유·중질유 코팅" }, { id: "coal-stability", label: "자연발화·안정화" }, { id: "coal-policy", label: "석탄 정책·규제" }
  ] },
  { id: "g-cashew", label: "캐슈넛 부산물", children: [
    { id: "cashew-market", label: "캐슈넛 시장·가격" }, { id: "cashew-processing", label: "가공지·가공기업" }, { id: "cnsl", label: "CNSL (껍질 오일)" }, { id: "cashew-pyrolysis", label: "껍질 열분해·탄화" }
  ] },
  { id: "g-feedstock", label: "원료 수급", children: [{ id: "feedstock-supply", label: "원료 생산·공급지·주요 기업" }] }
];

/**
 * Lines of business, kept apart and shared where they meet: Class 1 is palm EFB/POME turned into ashless white
 * pellets, black pellets and biochar (with certification, standards, co-firing); Class 2 is upgrading low-rank
 * coal (drying, residue-oil coating); Class 3 is cashew-nut by-products (shell oil, shell pyrolysis). An item or
 * organisation can carry several.
 */
export type IntelClass = "c1" | "c2" | "c3";
export const CLASS_ORDER: IntelClass[] = ["c1", "c2", "c3"];
export const CLASS_LABEL: Record<IntelClass, string> = { c1: "EFB/POME 펠릿·바이오차", c2: "저품위탄 고품위화", c3: "캐슈넛 부산물·열분해" };
export const CLASS_SHORT: Record<IntelClass, string> = { c1: "C1", c2: "C2", c3: "C3" };
export const isClass = (value: unknown): value is IntelClass => value === "c1" || value === "c2" || value === "c3";
const TOPIC_CLASS: Record<string, IntelClass> = Object.fromEntries([...["coal-market", "coal-price", "coal-drying", "coal-coating", "coal-stability", "coal-policy"].map(id => [id, "c2"]), ...["cashew-market", "cashew-processing", "cnsl", "cashew-pyrolysis"].map(id => [id, "c3"])]);
/** An item's classes: as written, or read from its topics (coal topics Class 2, cashew topics Class 3, the rest Class 1). */
export function itemClasses(item: Pick<IntelItem, "classes" | "topics">): IntelClass[] {
  if (item.classes?.length) return item.classes;
  const found = new Set(item.topics.map(topic => TOPIC_CLASS[topic] ?? (topic === "feedstock-supply" ? undefined : "c1")).filter((klass): klass is IntelClass => Boolean(klass)));
  return found.size ? CLASS_ORDER.filter(klass => found.has(klass)) : ["c1"];
}
export const TOPIC_LABEL = new Map(TOPIC_TREE.flatMap(group => [[group.id, group.label] as const, ...(group.children ?? []).map(child => [child.id, child.label] as const)]));
export const topicIds = (node: TopicNode): string[] => [node.id, ...(node.children ?? []).flatMap(topicIds)];

export const KIND_LABEL: Record<IntelKind, string> = { source: "자료", company: "기업", project: "프로젝트", vendor: "벤더", equipment: "장비", market: "시장", gap: "확인 필요" };
export const STATUS_LABEL: Record<IntelStatus, string> = { verified: "확인됨", claimed: "기업 주장", estimate: "추정", unverified: "미확인" };
export const STAGE_LABEL: Record<IntelStage, string> = { research: "연구", pilot: "파일럿", construction: "건설", commissioning: "시운전", "commercial-production": "상업생산", "commercial-sales": "상업판매", stopped: "중단" };
/** Source priority 1–7 (lower is stronger), as in the research brief. */
export const RELIABILITY_LABEL: Record<number, string> = { 1: "정부·규제기관", 2: "실증·운전 보고서", 3: "SCI 논문·연구기관", 4: "상장사 보고서", 5: "특허·카탈로그", 6: "시장분석기관", 7: "언론·홍보" };
/** What kind of document a source is, as a reader names it on a card. */
export const SOURCE_LABEL: Record<string, string> = { paper: "논문", gov: "정부 자료", "test-report": "실증 보고서", "annual-report": "기업 보고서", patent: "특허", "vendor-catalog": "카탈로그", "market-analyst": "시장 분석", press: "기사" };
export const LANG_LABEL: Record<string, string> = { en: "영어", ko: "한국어", ja: "일본어", zh: "중국어", id: "인도네시아어", ms: "말레이어", de: "독일어", fr: "프랑스어", nl: "네덜란드어", fi: "핀란드어", sv: "스웨덴어" };
export const PROFILE_LABEL: Record<string, string> = { legalName: "정식 명칭", industry: "산업", role: "역할", hq: "본사", country: "국가", ticker: "종목코드", listing: "상장", website: "웹사이트", founded: "설립", size: "규모", revenue: "매출", employees: "직원 수", capital: "자본금", parent: "모회사", owners: "주요 주주", ceo: "대표", projects: "수행 프로젝트", products: "제품", capacity: "생산능력", status: "현황" };
/** Identity fields shown in the company info box (short values); the rest describe the business. */
export const PROFILE_IDENTITY = ["legalName", "ticker", "listing", "parent", "owners", "hq", "country", "industry", "founded", "ceo", "revenue", "employees", "capital", "size"] as const;
export const PROFILE_BUSINESS = ["role", "products", "capacity", "projects", "status"] as const;
export const APPLICABILITY_LABEL: [keyof IntelApplicability, string][] = [
  ["new", "새로 확인한 것"], ["fit", "NAYSOR 가정과 비교"], ["designChange", "설계 변경 검토"], ["testVars", "파일럿 검증 변수"],
  ["capex", "CAPEX/OPEX 영향"], ["quality", "제품 품질·가격 영향"], ["scaleup", "스케일업 위험"], ["questions", "기업·벤더에 물을 것"]
];

const DAY = /\b(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?\b/g;
/**
 * An item's date for sorting and for its card: the newest real date among its own date (which may read "n.d." or
 * "2021 (datasheet); 2026-08 (customer story)"), its news date and the dates of the sources it is built on. A date
 * in the future (a planned start) does not count; an item with no date at all has none.
 */
export function itemDate(item: Pick<IntelItem, "date" | "update" | "dossier">, today = new Date().toISOString().slice(0, 10)): string | undefined {
  const found: string[] = [];
  const take = (text: string | undefined) => { for (const match of (text ?? "").matchAll(DAY)) { const year = Number(match[1]); if (year >= 1950 && year <= 2100) found.push([match[1], match[2], match[3]].filter(Boolean).join("-")); } };
  take(item.date); take(item.update?.date);
  for (const source of item.dossier?.sources ?? []) take(source.date);
  return found.filter(date => date <= today).sort().pop();
}
