"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { ArrowRight, ChevronLeft, ChevronRight, Coins, ExternalLink, EyeOff, FileDown, Heart, Loader2, Quote, Search, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { researchProfile } from "@/lib/paperflow/scholar/profile";
import type { ScholarWork } from "@/lib/paperflow/scholar/openalex";
import type { PaperBrief, SearchPlan } from "@/lib/paperflow/scholar/discover-ai";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";
import type { Annotation } from "@/lib/paperflow/anchors/types";
import { notifyText } from "@/lib/paperflow/notifications";
import { PaperCover } from "./paper-cover";
import "./discover.css";

type Card = ScholarWork & { abstract?: string; why: string };
interface Section { id: string; title: string; note: string; items: Card[] }
type View = "shelves" | "saved";

const HIDDEN_KEY = "paperflow-hidden-recommendations", SAVED_KEY = "pf-rec-saved", BRIEF_KEY = "pf-rec-ko";
const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* kept for this visit */ } };
const EXAMPLES = ["최근 3년 biochar 토양 탄소 저장 리뷰", "열분해 온도에 따른 바이오차 특성, 오픈액세스만", "많이 인용된 MRV carbon credit 논문"];

/** Korean titles and one-liners, from this browser's cache first, then the server (cached for everyone). */
function useBriefs() {
  const [briefs, setBriefs] = useState<Record<string, PaperBrief>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => { setBriefs(read(BRIEF_KEY, {})); }, []);
  const want = useCallback((cards: Card[]) => {
    const missing = cards.filter(card => !asked.current.has(card.openalexId) && !read<Record<string, PaperBrief>>(BRIEF_KEY, {})[card.openalexId]).slice(0, 24);
    if (!missing.length) return;
    for (const card of missing) asked.current.add(card.openalexId);
    // Six papers per request, all at once: the first cards fill in within seconds.
    for (let at = 0; at < missing.length; at += 6) {
      const chunk = missing.slice(at, at + 6);
      void fetch("/api/scholar/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: chunk.map(card => ({ id: card.openalexId, title: card.title, abstract: card.abstract ?? "" })) }) })
        .then(response => response.ok ? response.json() : { briefs: [] })
        .then((body: { briefs?: PaperBrief[] }) => {
          if (!body.briefs?.length) return;
          const next = { ...read<Record<string, PaperBrief>>(BRIEF_KEY, {}), ...Object.fromEntries(body.briefs.map(brief => [brief.id, brief])) };
          // Keep the cache to the latest 600 papers.
          const trimmed = Object.fromEntries(Object.entries(next).slice(-600));
          write(BRIEF_KEY, trimmed); setBriefs(trimmed);
          if (body.briefs.length) window.dispatchEvent(new Event("paperflow:credits-changed"));
        }).catch(() => undefined);
    }
  }, []);
  return { briefs, want };
}

function PaperCard({ card, brief, saved, onSave, onHide, onOpen, index }: { card: Card; brief?: PaperBrief; saved: boolean; onSave: () => void; onHide?: () => void; onOpen: () => void; index: number }) {
  const reduced = useReducedMotion();
  return <motion.article className="pf-paper-card" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * .035, type: "spring", stiffness: 260, damping: 26 }}>
    <button type="button" className="pf-paper-card-hit" onClick={onOpen} aria-label={`${brief?.titleKo ?? card.title} 자세히 보기`}>
      <PaperCover journal={card.source?.name} publisher={card.source?.publisher} year={card.year} topic={card.topics[0]?.name} openAccess={card.isOa} review={card.type === "review"}/>
      <div className="pf-paper-card-body">
        <h4>{brief?.titleKo ?? card.title}</h4>
        {brief ? <p className="pf-paper-card-line">{brief.oneLine}</p> : <p className="pf-paper-card-line pf-paper-card-wait"><span/><span/></p>}
        <small className="pf-paper-card-en" title={card.title}>{brief ? card.title : card.source?.name}</small>
        <div className="pf-paper-card-meta"><span>{card.year ?? "–"}</span><span><Quote size={10}/>{card.citedBy.toLocaleString("ko-KR")}</span>{card.isOa && <em>OA</em>}</div>
      </div>
    </button>
    <div className="pf-paper-card-actions">
      <button type="button" aria-pressed={saved} aria-label={saved ? "찜 해제" : "찜하기"} title={saved ? "찜 해제" : "찜하기"} onClick={onSave}><Heart size={14}/></button>
      {onHide && <button type="button" aria-label="이 추천 숨기기" title="숨기기" onClick={onHide}><EyeOff size={14}/></button>}
    </div>
  </motion.article>;
}

/** One section as a shelf you scroll sideways, with soft edges; its Korean briefs load when it comes into view. */
function Shelf({ section, children, onVisible }: { section: Section; children: React.ReactNode; onVisible: () => void }) {
  const row = useRef<HTMLDivElement>(null), seen = useInView(row, { margin: "200px 0px", once: true });
  const [edges, setEdges] = useState({ start: false, end: true });
  useEffect(() => { if (seen) onVisible(); }, [seen]); // eslint-disable-line react-hooks/exhaustive-deps
  const measure = () => { const el = row.current; if (el) setEdges({ start: el.scrollLeft > 8, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 8 }); };
  const scroll = (direction: number) => row.current?.scrollBy({ left: direction * row.current.clientWidth * .85, behavior: "smooth" });
  return <section className="pf-shelf">
    <header><div><h3>{section.title}</h3><small>{section.note}</small></div>
      <span className="pf-shelf-nav"><button type="button" aria-label="이전" disabled={!edges.start} onClick={() => scroll(-1)}><ChevronLeft size={16}/></button><button type="button" aria-label="다음" disabled={!edges.end} onClick={() => scroll(1)}><ChevronRight size={16}/></button></span>
    </header>
    <div className="pf-shelf-frame" data-start={edges.start || undefined} data-end={edges.end || undefined}>
      <div ref={row} className="pf-shelf-row" onScroll={measure}>{children}</div>
    </div>
  </section>;
}

/** The paper in detail: cover, Korean and English titles, what it is, the abstract, people, topics, links. */
function PaperDetail({ card, brief, saved, onSave, onClose }: { card: Card | null; brief?: PaperBrief; saved: boolean; onSave: () => void; onClose: () => void }) {
  return <Dialog open={Boolean(card)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="pf-paper-detail dd-scrollbar">
      {card && <>
        <div className="pf-paper-detail-side"><PaperCover size="lg" journal={card.source?.name} publisher={card.source?.publisher} year={card.year} topic={card.topics[0]?.name} openAccess={card.isOa} review={card.type === "review"}/></div>
        <div className="pf-paper-detail-main">
          <small className="pf-paper-detail-why">{card.why}</small>
          <DialogTitle>{brief?.titleKo ?? card.title}</DialogTitle>
          {brief && <p className="pf-paper-detail-en">{card.title}</p>}
          {brief?.oneLine && <DialogDescription className="pf-paper-detail-line">{brief.oneLine}</DialogDescription>}
          <dl className="pf-paper-detail-facts">
            <div><dt>저널</dt><dd>{card.source?.name ?? "–"}{card.source?.publisher ? ` · ${card.source.publisher}` : ""}</dd></div>
            <div><dt>연도 · 인용</dt><dd>{card.year ?? "–"} · {card.citedBy.toLocaleString("ko-KR")}회 인용{card.isOa ? " · Open Access" : ""}</dd></div>
            <div><dt>저자</dt><dd>{card.authors.slice(0, 6).map(author => author.name).join(", ")}{card.authors.length > 6 ? ` 외 ${card.authors.length - 6}명` : ""}</dd></div>
            {card.topics.length > 0 && <div><dt>주제</dt><dd className="pf-paper-detail-topics">{card.topics.slice(0, 4).map(topic => <span key={topic.id}>{topic.name}</span>)}</dd></div>}
          </dl>
          {card.abstract && <section className="pf-paper-detail-abstract"><h5>Abstract</h5><p>{card.abstract}</p></section>}
          <footer>
            <button type="button" className="pf-paper-detail-save" aria-pressed={saved} onClick={onSave}><Heart size={15}/>{saved ? "찜함" : "찜하기"}</button>
            {card.doi && <a href={`https://doi.org/${card.doi}`} target="_blank" rel="noreferrer noopener"><ExternalLink size={14}/>원문 페이지</a>}
            {card.isOa && card.oaUrl && <a href={card.oaUrl} target="_blank" rel="noreferrer noopener" data-primary=""><FileDown size={14}/>무료 PDF</a>}
          </footer>
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}

/**
 * 추천 논문 — chosen like a shop: an AI search bar on top (say what you want in plain words), then
 * shelves per kind of recommendation with journal-style covers, Korean titles and one line on what
 * each paper is. Open a card for the details; 찜 keeps it for later.
 */
export function DiscoverView({ docs, annotations }: { docs: StoredDocument[]; annotations: Annotation[] }) {
  const library = useMemo(() => docs.filter(doc => !doc.archived), [docs]);
  const request = useMemo(() => {
    const profile = researchProfile(library, annotations);
    const cited = new Map<string, number>();
    for (const doc of library) for (const id of new Set(doc.scholar?.referencedIds ?? [])) cited.set(id, (cited.get(id) ?? 0) + 1);
    return {
      topics: profile.topics.filter(topic => topic.level === "topic").slice(0, 6).map(topic => topic.id),
      authors: profile.authors.filter(author => /^A\d+/.test(author.id)).slice(0, 10).map(author => author.id),
      fields: profile.topics.filter(topic => topic.level === "field").slice(0, 3).map(topic => topic.id),
      owned: library.map(doc => doc.scholar?.openalexId).filter(Boolean) as string[],
      cited: [...cited].filter(([, count]) => count > 1 || library.length < 4).map(([id, count]) => ({ id, count })),
      topicNames: profile.topics.filter(topic => topic.level === "topic").slice(0, 6).map(topic => topic.name)
    };
  }, [library, annotations]);
  const ready = request.topics.length > 0 || request.authors.length > 0;
  const recommendations = useQuery({
    queryKey: ["recommendations", request.topics, request.authors, request.fields, request.owned, request.cited], enabled: ready, staleTime: 6 * 3600_000,
    // The last list is kept in this browser for 6 hours, so revisiting the page needs no server round trip.
    initialData: () => { const saved = read<{ key: string; at: number; sections: Section[] } | null>("pf-rec-cache", null); return saved && saved.key === JSON.stringify(request) ? saved.sections : undefined; },
    initialDataUpdatedAt: () => read<{ at: number } | null>("pf-rec-cache", null)?.at,
    queryFn: async () => { const response = await fetch("/api/scholar/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); if (!response.ok) throw new Error("추천을 불러오지 못했습니다."); const sections = (await response.json()).sections as Section[]; write("pf-rec-cache", { key: JSON.stringify(request), at: Date.now(), sections }); return sections; }
  });
  const [hidden, setHidden] = useState<Set<string>>(new Set()), [saved, setSaved] = useState<Card[]>([]), [view, setView] = useState<View>("shelves");
  const [detail, setDetail] = useState<Card | null>(null), [filters, setFilters] = useState({ oa: false, review: false });
  const [query, setQuery] = useState(""), [search, setSearch] = useState<{ query: string; plan?: SearchPlan; items: Card[]; total: number; credits: number } | null>(null), [searching, setSearching] = useState(false);
  useEffect(() => { setHidden(new Set(read<string[]>(HIDDEN_KEY, []))); setSaved(read<Card[]>(SAVED_KEY, [])); }, []);
  const { briefs, want } = useBriefs();
  const hide = (id: string) => setHidden(current => { const next = new Set(current).add(id); write(HIDDEN_KEY, [...next]); return next; });
  const isSaved = (id: string) => saved.some(card => card.openalexId === id);
  const toggleSave = (card: Card) => setSaved(current => { const next = current.some(item => item.openalexId === card.openalexId) ? current.filter(item => item.openalexId !== card.openalexId) : [card, ...current]; write(SAVED_KEY, next.slice(0, 200)); return next; });
  const keep = (card: Card) => !hidden.has(card.openalexId) && (!filters.oa || card.isOa) && (!filters.review || card.type === "review");
  const sections = (recommendations.data ?? []).map(section => ({ ...section, items: section.items.filter(keep) })).filter(section => section.items.length);

  const runSearch = async (text: string) => {
    const value = text.trim();
    if (!value || searching) return;
    setSearching(true); setView("shelves");
    try {
      const response = await fetch("/api/scholar/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: value, owned: request.owned }) });
      const body = await response.json().catch(() => ({ error: "검색 결과를 읽지 못했습니다." }));
      if (!response.ok) throw new Error(body.error || "검색하지 못했습니다.");
      setSearch({ query: value, plan: body.plan, items: body.items ?? [], total: body.total ?? 0, credits: body.credits ?? 0 });
      want(body.items ?? []);
      if (body.credits) window.dispatchEvent(new Event("paperflow:credits-changed"));
    } catch (error) { notifyText(error instanceof Error ? error.message : "검색하지 못했습니다."); }
    finally { setSearching(false); }
  };
  const card = (item: Card, index: number, hideable = true) => <PaperCard key={item.openalexId} card={item} index={index} brief={briefs[item.openalexId]} saved={isSaved(item.openalexId)} onSave={() => toggleSave(item)} onHide={hideable ? () => hide(item.openalexId) : undefined} onOpen={() => { setDetail(item); want([item]); }}/>;

  return <section className="pf-discover2">
    <form className="pf-discover-search" onSubmit={event => { event.preventDefault(); void runSearch(query); }}>
      <div className="pf-discover-search-box">
        <Sparkles size={17} aria-hidden="true"/>
        <input aria-label="원하는 논문 찾기" value={query} onChange={event => setQuery(event.target.value)} placeholder="찾는 논문을 말로 설명하세요 — 예: 최근 3년 biochar 토양 탄소 저장 리뷰"/>
        {query && <button type="button" className="pf-discover-clear" aria-label="지우기" onClick={() => { setQuery(""); setSearch(null); }}><X size={15}/></button>}
        <button type="submit" className="pf-discover-go" disabled={!query.trim() || searching}>{searching ? <Loader2 size={15} className="animate-spin"/> : <Search size={15}/>}AI 검색</button>
      </div>
      <div className="pf-discover-bar">
        <span className="pf-discover-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === "shelves"} onClick={() => setView("shelves")}>추천</button>
          <button type="button" role="tab" aria-selected={view === "saved"} onClick={() => setView("saved")}><Heart size={13}/>찜 {saved.length || ""}</button>
        </span>
        <span className="pf-discover-filters">
          <button type="button" aria-pressed={filters.oa} onClick={() => setFilters(value => ({ ...value, oa: !value.oa }))}>무료 PDF만</button>
          <button type="button" aria-pressed={filters.review} onClick={() => setFilters(value => ({ ...value, review: !value.review }))}>리뷰만</button>
        </span>
        {!search && <span className="pf-discover-examples">{EXAMPLES.map(text => <button key={text} type="button" onClick={() => { setQuery(text); void runSearch(text); }}>{text}<ArrowRight size={11}/></button>)}</span>}
      </div>
    </form>

    {view === "saved" ? <section className="pf-discover-results">
      <header><h3>찜한 논문</h3><small>{saved.length ? `${saved.length}편 · 이 브라우저에 저장됨` : "마음에 드는 논문의 하트를 눌러 모아 두세요."}</small></header>
      <div className="pf-discover-grid2">{saved.filter(keep).map((item, index) => card(item, index, false))}</div>
    </section> : <>
      <AnimatePresence>{search && <motion.section key={search.query} className="pf-discover-results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
        <header><h3>‘{search.query}’ 검색 결과</h3><small>{search.plan?.explain || `검색어: ${search.plan?.search ?? search.query}`} · {search.total.toLocaleString("ko-KR")}편 중 상위 {search.items.length}편{search.credits ? <> · <Coins size={11}/>{search.credits} 크레딧</> : ""}</small>
          <button type="button" className="pf-discover-close" onClick={() => { setSearch(null); setQuery(""); }}>추천으로 돌아가기</button></header>
        {search.items.filter(keep).length ? <div className="pf-discover-grid2">{search.items.filter(keep).map((item, index) => card(item, index))}</div> : <p className="pf-discover-none">조건에 맞는 논문을 찾지 못했습니다. 표현을 바꿔 보세요.</p>}
      </motion.section>}</AnimatePresence>
      {!search && <>
        {!ready && <section className="pf-discover-empty"><h2>추천을 준비하려면 연구 정보가 필요합니다</h2><p>연구맵에서 ‘연구 정보 분석’을 실행하면 관심 주제와 저자가 정리되고, 그에 맞는 논문을 추천합니다. 위 검색창으로는 지금 바로 찾을 수 있습니다.</p></section>}
        {ready && <p className="pf-discover-basis">관심 주제 {request.topicNames.slice(0, 3).map(name => <b key={name}>{name}</b>)}{request.topicNames.length > 3 ? ` 외 ${request.topicNames.length - 3}개` : ""} · 저자 {request.authors.length}명 · 내 서재가 인용한 문헌 {request.cited.length}편을 바탕으로 골랐습니다.</p>}
        {recommendations.isPending && ready && <div className="pf-shelf-loading" role="status" aria-label="추천을 불러오는 중">{Array.from({ length: 5 }, (_, index) => <span key={index}/>)}</div>}
        {recommendations.error && <p role="alert" className="pf-error">{(recommendations.error as Error).message}</p>}
        {sections.map(section => <Shelf key={section.id} section={section} onVisible={() => want(section.items)}>{section.items.map((item, index) => card(item, index))}</Shelf>)}
        {recommendations.isSuccess && !sections.length && <p className="pf-discover-none">지금은 추천할 새 논문이 없습니다. 위 검색창으로 직접 찾아보세요.</p>}
      </>}
    </>}
    <PaperDetail card={detail} brief={detail ? briefs[detail.openalexId] : undefined} saved={detail ? isSaved(detail.openalexId) : false} onSave={() => detail && toggleSave(detail)} onClose={() => setDetail(null)}/>
  </section>;
}
