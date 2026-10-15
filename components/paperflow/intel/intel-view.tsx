"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, BookOpenText, Building2, Newspaper, ChevronRight, Download, EyeOff, FileDown, FileText, FolderOpen, Layers, Library, Loader2, Radar, Search, Star, Upload, X } from "lucide-react";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";
import { archiveFolders } from "@/lib/paperflow/library/archive-folders";
import { importDocument } from "@/lib/paperflow/pdf/import-document";
import { INTEL_EVENT, intelRepository, readPack } from "@/lib/paperflow/intel/repository";
import { registerCsv, registerMarkdown } from "@/lib/paperflow/intel/export";
import { APPLICABILITY_LABEL, UPDATE_LABEL, KIND_LABEL, LANG_LABEL, PERIOD_LABEL, PROFILE_LABEL, RELIABILITY_LABEL, STAGE_LABEL, STATUS_LABEL, TOPIC_LABEL, TOPIC_TREE, topicIds, type BriefPeriod, type IntelBrief, type IntelItem, type IntelKind, type IntelStatus } from "@/lib/paperflow/intel/types";
import { usePaperflow } from "../shell/paperflow-context";
import { FolderGlyph } from "../library/archive-folders";
import { BriefDocument } from "./brief-document";
import { DossierView } from "./dossier-view";
import { FigureAdder } from "./figure-adder";
import { PanelMarks } from "./panel-marks";
import { SourceTree } from "./source-tree";
import { CardCover } from "./card-cover";
import { CompanyMark, CompanyPage, companyName } from "./company-page";
import { glossaryIndex, type GlossaryTerm } from "@/lib/paperflow/intel/glossary";
import "./intel.css";

type Scope = { type: "all" } | { type: "star" } | { type: "topic"; id: string } | { type: "folder"; id: string } | { type: "kind"; kind: IntelKind };
const KIND_ORDER: IntelKind[] = ["source", "project", "company", "vendor", "equipment", "market", "gap"];
const STATUS_ORDER: IntelStatus[] = ["verified", "claimed", "estimate", "unverified"];
/** Dated updates first (newest on top), the standing analysis after them. */
const PERIOD_ORDER: BriefPeriod[] = ["daily", "weekly", "monthly", "quarterly", "core"];

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type })), anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const display = (item: IntelItem) => item.titleKo || item.title;

/**
 * 인텔리전스: a research programme's information flow. Verified sources, companies and projects,
 * equipment vendors, market data and open questions arrive in packs (collected and checked by Claude),
 * are sorted into a topic tree and the reader's own archive folders, and each keeps its evidence
 * (source type, reliability, confirmed / claimed / estimate). Open-access PDFs go straight into the
 * library, where they are read, translated (any language into Korean) and marked like any paper.
 */
export function IntelView({ docs }: { docs: StoredDocument[] }) {
  const [items, setItems] = useState<IntelItem[] | null>(null), [briefs, setBriefs] = useState<IntelBrief[]>([]);
  const [scope, setScope] = useState<Scope>({ type: "all" }), [mode, setMode] = useState<"items" | "briefs" | "companies">("items");
  const [query, setQuery] = useState(""), [kinds, setKinds] = useState<Set<IntelKind>>(new Set()), [statuses, setStatuses] = useState<Set<IntelStatus>>(new Set());
  const [sort, setSort] = useState<"reliability" | "date">("reliability"), [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState<string | null>(null), [briefId, setBriefId] = useState<string | null>(null);
  const [fetching, setFetching] = useState<string | null>(null);
  /** A company or project opened as its own page (the briefings' side panel is its small version). */
  const [pageId, setPageId] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null), { notify } = usePaperflow(), router = useRouter(), client = useQueryClient(), reduced = useReducedMotion();
  const folders = useMemo(() => archiveFolders(docs), [docs]);
  // On narrower screens the detail floats over the page (a side sheet, a bottom sheet on a phone). The
  // page wrapper is animated (transformed), which would pin a fixed panel to it and under the tab bar,
  // so there it is rendered into <body>.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const query = window.matchMedia("(max-width: 1180px)"), sync = () => setNarrow(query.matches); sync(); query.addEventListener("change", sync); return () => query.removeEventListener("change", sync); }, []);
  // A briefing read full-screen also needs the panel above it.
  const [briefFocus, setBriefFocus] = useState(false);
  useEffect(() => { const watch = new MutationObserver(() => setBriefFocus(Boolean(document.querySelector(".pf-brief-focus-layer")))); watch.observe(document.body, { childList: true }); return () => watch.disconnect(); }, []);
  const floating = (node: React.ReactNode) => narrow || briefFocus ? createPortal(<div className="pf-intel pf-intel-portal">{node}</div>, document.body) : node;

  // The pack's glossary travels as a hidden briefing ("__glossary__", JSON); the rest are briefings to read.
  const [extraTerms, setExtraTerms] = useState<GlossaryTerm[]>([]);
  const load = useCallback(async () => {
    const [list, written] = await Promise.all([intelRepository.list(), intelRepository.briefs()]);
    setItems(list); setBriefs(written.filter(brief => brief.id !== "__glossary__"));
    try { const glossary = written.find(brief => brief.id === "__glossary__"); setExtraTerms(glossary ? JSON.parse(glossary.body) : []); } catch { setExtraTerms([]); }
  }, []);
  /** Abbreviations and terms (FIT, LCA, GGL…): a dotted underline the first time, the explanation on hover or tap. */
  const terms = useMemo(() => {
    const { byKey, pattern } = glossaryIndex(extraTerms);
    return { pattern, render: (key: string, label: string, nodeKey: string) => { const term = byKey.get(key)!; return <span key={nodeKey} className="pf-term" tabIndex={0}>{label}<span className="pf-term-tip" role="tooltip"><strong>{term.term}</strong><small>{term.full}</small><span>{term.meaning}</span>{term.note && <em>{term.note}</em>}</span></span>; } };
  }, [extraTerms]);
  useEffect(() => { void load(); window.addEventListener(INTEL_EVENT, load); return () => window.removeEventListener(INTEL_EVENT, load); }, [load]);

  const visible = useMemo(() => (items ?? []).filter(item => showHidden || !item.user?.hidden), [items, showHidden]);
  const inScope = useCallback((item: IntelItem) => {
    if (scope.type === "star") return Boolean(item.user?.star);
    if (scope.type === "folder") return item.user?.folderId === scope.id;
    if (scope.type === "kind") return item.kind === scope.kind;
    if (scope.type === "topic") { const node = TOPIC_TREE.find(group => group.id === scope.id); const ids = node ? topicIds(node) : [scope.id]; return item.topics.some(topic => ids.includes(topic)); }
    return true;
  }, [scope]);
  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return visible.filter(item => inScope(item) && (!kinds.size || kinds.has(item.kind)) && (!statuses.size || (item.status && statuses.has(item.status)))
      && words.every(word => [item.title, item.titleKo, item.summaryKo, item.org, item.country, item.authors, ...(item.data ?? []).map(datum => `${datum.label} ${datum.value}`), ...Object.values(item.equipment ?? {})].join(" ").toLowerCase().includes(word)))
      // Open questions sit after the evidence; among evidence, the stronger source (or the newer) first.
      .sort((a, b) => Number(a.kind === "gap") - Number(b.kind === "gap") || (sort === "date" ? (b.date ?? "").localeCompare(a.date ?? "") : (a.reliability ?? 9) - (b.reliability ?? 9) || (b.date ?? "").localeCompare(a.date ?? "")));
  }, [visible, inScope, kinds, statuses, query, sort]);
  const count = useCallback((test: (item: IntelItem) => boolean) => visible.filter(test).length, [visible]);
  const current = useMemo(() => (items ?? []).find(item => item.id === selected) ?? null, [items, selected]);
  const byId = useMemo(() => new Map((items ?? []).map(item => [item.id, item])), [items]);
  // Items that point at the one open (a company's projects, the reports that mention it).
  /** News items (reports, plans, articles, withdrawals…), newest first. */
  const updates = useMemo(() => (items ?? []).filter(item => item.update && !item.user?.hidden).sort((a, b) => b.update!.date.localeCompare(a.update!.date) || (b.addedAt ?? "").localeCompare(a.addedAt ?? "")), [items]);
  const latestDay = updates[0]?.update!.date ?? null;
  const [allRecent, setAllRecent] = useState(false);
  const shownUpdates = useMemo(() => { if (!latestDay) return []; if (!allRecent) return updates.filter(item => item.update!.date === latestDay); const week = new Date(Date.parse(latestDay) - 7 * 864e5).toISOString().slice(0, 10); return updates.filter(item => item.update!.date >= week); }, [updates, latestDay, allRecent]);
  /** Everything about a company or project: news that names it, and items related to it. */
  const newsOf = useCallback((id: string) => updates.filter(item => item.update!.entities.includes(id) || item.relations?.some(relation => relation.to === id)), [updates]);
  const companies = useMemo(() => (items ?? []).filter(item => (item.kind === "company" || item.kind === "project") && !item.user?.hidden).map(item => ({ item, news: newsOf(item.id) }))
    .sort((a, b) => (b.news[0]?.update!.date ?? "").localeCompare(a.news[0]?.update!.date ?? "") || Number(Boolean(b.item.dossier)) - Number(Boolean(a.item.dossier)) || display(a.item).localeCompare(display(b.item))), [items, newsOf]);
  const pageItem = useMemo(() => (pageId ? (items ?? []).find(item => item.id === pageId) ?? null : null), [items, pageId]);
  const relatedOf = useCallback((item: IntelItem) => { const ids = new Set([...(item.relations ?? []).map(relation => relation.to), ...newsOf(item.id).map(entry => entry.id)]); return (items ?? []).filter(entry => entry.id !== item.id && (ids.has(entry.id) || entry.relations?.some(relation => relation.to === item.id))).slice(0, 24); }, [items, newsOf]);
  const mentions = useMemo(() => current ? (items ?? []).filter(item => item.id !== current.id && item.relations?.some(relation => relation.to === current.id)) : [], [items, current]);
  const briefGroups = useMemo(() => PERIOD_ORDER.map(period => [period, briefs.filter(brief => (brief.period ?? "core") === period).sort((a, b) => period === "core" ? (a.order ?? 0) - (b.order ?? 0) : (b.date ?? "").localeCompare(a.date ?? ""))] as const).filter(([, list]) => list.length), [briefs]);
  const openBrief = useMemo(() => briefs.find(brief => brief.id === briefId) ?? briefGroups[0]?.[1][0] ?? null, [briefs, briefId, briefGroups]);
  /**
   * A company, project or report named in a briefing: a link with a preview card on hover (what it
   * is, where, at what stage), and the full record in the side panel on click, never a new tab.
   */
  const entity = useCallback((id: string, label: string, key: number) => {
    const item = byId.get(id);
    if (!item) return <span key={key} className="pf-md-entity" data-missing>{label}</span>;
    const facts = [KIND_LABEL[item.kind], item.profile?.industry, item.country, item.stage ? STAGE_LABEL[item.stage] : null, item.status ? STATUS_LABEL[item.status] : null].filter(Boolean);
    return <span key={key} className="pf-md-entity-wrap">
      <button type="button" className="pf-md-entity" data-kind={item.kind} data-open={selected === id || undefined} onClick={() => setSelected(id)}>{label}</button>
      <span className="pf-md-preview" role="tooltip">
        {item.logo && <img className="pf-md-preview-logo" src={item.logo} alt=""/>}
        <small>{facts.join(" · ")}</small>
        <strong>{display(item)}</strong>
        {item.summaryKo && <em>{item.summaryKo}</em>}
        {item.data?.length ? <span className="pf-md-preview-data">{item.data.slice(0, 2).map((datum, index) => <span key={index}>{datum.label} <b>{datum.value}</b>{datum.unit ? ` ${datum.unit}` : ""}</span>)}</span> : null}
        <i>눌러서 오른쪽에 자세히</i>
      </span>
    </span>;
  }, [byId, selected]);

  const importFile = async (chosen: File | undefined) => {
    if (!chosen) return;
    try {
      const pack = readPack(await chosen.text());
      if (!pack.items.length && !pack.briefs?.length) { notify("자료 팩에 가져올 항목이 없습니다."); return; }
      const result = await intelRepository.importPack(pack);
      notify(`자료 팩을 가져왔습니다 · 새 항목 ${result.added} · 갱신 ${result.updated}${result.briefs ? ` · 브리핑 ${result.briefs}` : ""}`);
    } catch (error) { notify(error instanceof Error ? error.message : "자료 팩을 읽지 못했습니다."); }
    finally { if (file.current) file.current.value = ""; }
  };
  /** An open PDF (an item's, or a case file's source) fetched by the server and imported into the library. */
  const pdfToLibrary = async (url: string, title: string, busyKey: string, itemId?: string) => {
    if (fetching) return;
    setFetching(busyKey);
    try {
      const response = await fetch(`/api/intel/pdf?url=${encodeURIComponent(url)}`);
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? "PDF를 가져오지 못했습니다."); }
      const name = `${title.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 90).trim()}.pdf`;
      const record = await importDocument(new File([await response.blob()], name, { type: "application/pdf" }));
      if (itemId) await intelRepository.setUser(itemId, { docId: record.id, read: true });
      await client.invalidateQueries({ queryKey: ["documents"] });
      notify("서재에 담았습니다. 열어서 번역하고 마킹할 수 있습니다.");
    } catch (error) { notify(error instanceof Error ? error.message : "PDF를 가져오지 못했습니다."); }
    finally { setFetching(null); }
  };
  const toLibrary = (item: IntelItem) => item.pdfUrl ? pdfToLibrary(item.pdfUrl, item.title || item.id, item.id, item.id) : Promise.resolve();
  const docOf = (item: IntelItem) => item.user?.docId && docs.some(doc => doc.id === item.user!.docId && !doc.deletedAt) ? item.user.docId : null;
  const toggle = <T,>(set: Set<T>, value: T) => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); return next; };

  /** A preview or term tip that would run past the window edge slides back inside it. */
  /**
   * A preview or term tip that would run past its frame (the window, the side panel, a wide case file)
   * slides back inside it. Listens on the document: the panel can be rendered outside this section.
   */
  useEffect(() => {
    const place = (event: Event) => {
      const host = (event.target as Element | null)?.closest?.(".pf-term, .pf-md-entity-wrap");
      const tip = host?.querySelector<HTMLElement>(".pf-term-tip, .pf-md-preview");
      if (!tip) return;
      tip.style.left = "0px";
      requestAnimationFrame(() => {
        const box = tip.getBoundingClientRect();
        if (!box.width) return;
        const frame = host!.closest(".pf-intel-detail, .pf-dossier-page, .pf-brief-focus-layer")?.getBoundingClientRect(), left = (frame?.left ?? 0) + 8, right = (frame?.right ?? window.innerWidth) - 8;
        tip.style.left = `${Math.max(Math.min(0, right - box.right), left - box.left)}px`;
      });
    };
    document.addEventListener("mouseover", place); document.addEventListener("focusin", place);
    return () => { document.removeEventListener("mouseover", place); document.removeEventListener("focusin", place); };
  }, []);
  if (items === null) return <div className="pf-empty" role="status">인텔리전스를 불러오는 중…</div>;
  const empty = !items.length;
  const scopeLabel = scope.type === "all" ? "전체" : scope.type === "star" ? "핵심 표시" : scope.type === "folder" ? folders.find(folder => folder.id === scope.id)?.name ?? "폴더" : scope.type === "kind" ? KIND_LABEL[scope.kind] : TOPIC_LABEL.get(scope.id) ?? scope.id;

  return <section className="pf-intel" aria-label="인텔리전스">
    <header className="pf-intel-head">
      <div><p className="pf-intel-eyebrow"><Radar size={14}/> Information flow</p><h2>EFB/POME 자원화 인텔리전스</h2><p>검증된 논문·정부 보고서·기업 자료·장비 벤더·시장 정보만 모아, 근거와 신뢰도를 함께 봅니다.</p></div>
      <div className="pf-intel-actions">
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={event => void importFile(event.target.files?.[0])}/>
        <button type="button" className="pf-intel-primary" onClick={() => file.current?.click()}><Upload size={15}/>자료 팩 가져오기</button>
        {!empty && <><button type="button" onClick={() => download(`source-register-${new Date().toISOString().slice(0, 10)}.csv`, registerCsv(filtered), "text/csv;charset=utf-8")}><FileDown size={15}/>출처 대장 CSV</button>
          <button type="button" onClick={() => download(`source-register-${new Date().toISOString().slice(0, 10)}.md`, registerMarkdown(filtered), "text/markdown;charset=utf-8")}><FileText size={15}/>Markdown</button></>}
      </div>
    </header>

    {empty ? <div className="pf-intel-empty">
      <Radar size={34}/><h3>아직 자료가 없습니다</h3>
      <p>Claude가 조사해 검증한 자료 팩(.json)을 가져오면 주제별 트리, 기업·벤더·시장 정보, 브리핑이 채워집니다. 계정에 로그인되어 있으면 다른 기기에도 같이 보입니다.</p>
      <button type="button" className="pf-intel-primary" onClick={() => file.current?.click()}><Upload size={15}/>자료 팩 가져오기</button>
    </div> : <div className="pf-intel-body" data-detail={current ? "open" : undefined} data-mode={pageItem ? "page" : mode}>
      <nav className="pf-intel-tree" aria-label="주제">
        <button type="button" aria-current={scope.type === "all" || undefined} onClick={() => setScope({ type: "all" })}><Layers size={15}/>전체<i>{visible.length}</i></button>
        <button type="button" aria-current={scope.type === "star" || undefined} onClick={() => setScope({ type: "star" })}><Star size={15}/>핵심 표시<i>{count(item => Boolean(item.user?.star))}</i></button>
        {TOPIC_TREE.map(group => <div key={group.id} className="pf-intel-group">
          <button type="button" className="pf-intel-group-head" aria-current={scope.type === "topic" && scope.id === group.id || undefined} onClick={() => setScope({ type: "topic", id: group.id })}>{group.label}<i>{count(item => item.topics.some(topic => topicIds(group).includes(topic)))}</i></button>
          {group.children?.map(child => { const total = count(item => item.topics.includes(child.id)); return <button type="button" key={child.id} data-empty={!total || undefined} aria-current={scope.type === "topic" && scope.id === child.id || undefined} onClick={() => setScope({ type: "topic", id: child.id })}><ChevronRight size={13}/>{child.label}<i>{total}</i></button>; })}
        </div>)}
        <div className="pf-intel-group">
          <span className="pf-intel-group-head">구분</span>
          {KIND_ORDER.map(kind => { const total = count(item => item.kind === kind); return total ? <button type="button" key={kind} aria-current={scope.type === "kind" && scope.kind === kind || undefined} onClick={() => setScope({ type: "kind", kind })}><ChevronRight size={13}/>{KIND_LABEL[kind]}<i>{total}</i></button> : null; })}
        </div>
        {folders.length > 0 && <div className="pf-intel-group">
          <span className="pf-intel-group-head">내 폴더 <small>아카이브와 같은 폴더</small></span>
          {folders.map(folder => <button type="button" key={folder.id} aria-current={scope.type === "folder" && scope.id === folder.id || undefined} onClick={() => setScope({ type: "folder", id: folder.id })}><span className="pf-intel-folder" style={{ color: folder.color }}><FolderGlyph icon={folder.icon} size={14}/></span>{folder.name}<i>{count(item => item.user?.folderId === folder.id)}</i></button>)}
        </div>}
      </nav>

      {pageItem ? <CompanyPage item={pageItem} news={newsOf(pageItem.id)} related={relatedOf(pageItem)} byId={byId} mentions={(items ?? []).filter(entry => entry.id !== pageItem.id && entry.relations?.some(relation => relation.to === pageItem.id))} entity={entity} terms={terms}
        onOpen={id => { const target = byId.get(id); if (target && (target.kind === "company" || target.kind === "project")) { setPageId(id); setSelected(null); window.scrollTo({ top: 0 }); } else setSelected(id); }}
        onBack={() => setPageId(null)} onPdf={source => void pdfToLibrary(source.pdfUrl!, source.title, source.pdfUrl!)} busy={fetching} notify={notify}/> : <div className="pf-intel-main">
        <div className="pf-intel-toolbar">
          <label className="pf-intel-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="기업, 장비, 수치, 국가로 찾기 (예: screw press, Malakoff, K 제거)" aria-label="인텔리전스 검색"/>{query && <button type="button" aria-label="지우기" onClick={() => setQuery("")}><X size={14}/></button>}</label>
          <div className="pf-intel-modes" role="tablist" aria-label="보기">
            <button type="button" role="tab" aria-selected={mode === "items"} onClick={() => setMode("items")}><Layers size={14}/>항목</button>
            <button type="button" role="tab" aria-selected={mode === "briefs"} onClick={() => setMode("briefs")}><BookOpenText size={14}/>브리핑<i>{briefs.length}</i></button>
            <button type="button" role="tab" aria-selected={mode === "companies"} onClick={() => setMode("companies")}><Building2 size={14}/>기업 분석<i>{companies.length}</i></button>
          </div>
        </div>
        {latestDay && <section className="pf-intel-today" aria-label="오늘자 업데이트">
          <header><Newspaper size={15}/><strong>{allRecent ? "최근 7일 업데이트" : "오늘자 업데이트"}</strong><time>{latestDay}</time><span>{shownUpdates.length}건</span>
            <button type="button" onClick={() => setAllRecent(!allRecent)}>{allRecent ? "최신 날짜만" : "최근 7일 보기"}</button></header>
          <ul>{shownUpdates.slice(0, allRecent ? 30 : 12).map(item => <li key={item.id}><button type="button" data-open={selected === item.id || undefined} onClick={() => setSelected(item.id)}>
            <span className="pf-intel-update-type" data-type={item.update!.type}>{UPDATE_LABEL[item.update!.type]}</span>
            <span className="pf-intel-update-text"><b>{item.update!.headline ?? display(item)}</b>{item.update!.entities.length > 0 && <small>{item.update!.entities.map(id => byId.get(id)).filter(Boolean).map(entity => display(entity!).split(/ [—–-] /)[0]).join(" · ")}{allRecent ? ` · ${item.update!.date}` : ""}</small>}</span>
          </button></li>)}</ul>
        </section>}
        {mode === "items" && <div className="pf-intel-filters">
          <span>{scopeLabel} · {filtered.length}건</span>
          <div role="group" aria-label="구분">{KIND_ORDER.filter(kind => count(item => item.kind === kind)).map(kind => <button type="button" key={kind} aria-pressed={kinds.has(kind)} onClick={() => setKinds(toggle(kinds, kind))}>{KIND_LABEL[kind]}</button>)}</div>
          <div role="group" aria-label="확인 상태">{STATUS_ORDER.filter(status => count(item => item.status === status)).map(status => <button type="button" key={status} data-status={status} aria-pressed={statuses.has(status)} onClick={() => setStatuses(toggle(statuses, status))}>{STATUS_LABEL[status]}</button>)}</div>
          <select aria-label="정렬" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="reliability">신뢰도 순</option><option value="date">최신 순</option></select>
          <label className="pf-intel-hidden"><input type="checkbox" checked={showHidden} onChange={event => setShowHidden(event.target.checked)}/>숨긴 항목</label>
        </div>}

        {mode === "companies" ? <ul className="pf-intel-companies">
          {companies.filter(({ item }) => !query || [display(item), item.title, item.org, item.country, ...Object.values(item.profile ?? {})].join(" ").toLowerCase().includes(query.toLowerCase())).map(({ item, news }) => { const cover = item.dossier?.figures?.[0]?.src ?? item.user?.figures?.[0]?.src; return <li key={item.id}>
            <article className="pf-intel-company" data-selected={selected === item.id || undefined} tabIndex={0} onClick={() => { setPageId(item.id); setSelected(null); window.scrollTo({ top: 0 }); }} onKeyDown={event => { if (event.key === "Enter") { setPageId(item.id); setSelected(null); } }}>
              <div className="pf-intel-company-cover">{cover ? <img src={cover} alt="" loading="lazy"/> : <Building2 size={26}/>}{item.logo && <i className="pf-intel-company-logo"><img src={item.logo} alt=""/></i>}{item.dossier && <span>케이스 파일</span>}</div>
              <div className="pf-intel-company-body">
                <header><span className="pf-intel-kind">{KIND_LABEL[item.kind]}</span>{item.stage && <span className="pf-intel-stage">{STAGE_LABEL[item.stage]}</span>}{item.profile?.ticker && <span className="pf-intel-stage">{item.profile.ticker}</span>}</header>
                <h3>{companyName(item)}</h3>
                <p className="pf-intel-meta">{[item.profile?.industry, item.country ?? item.profile?.hq].filter(Boolean).join(" · ")}</p>
                {news[0] ? <p className="pf-intel-company-news"><span className="pf-intel-update-type" data-type={news[0].update!.type}>{UPDATE_LABEL[news[0].update!.type]}</span><time>{news[0].update!.date}</time>{news[0].update!.headline ?? display(news[0])}</p> : <p className="pf-intel-company-news" data-empty>아직 새 소식 없음</p>}
                <footer><span>소식 {news.length}</span>{item.profile?.capacity && <span>{item.profile.capacity}</span>}</footer>
              </div>
            </article>
          </li>; })}
        </ul> : mode === "items" ? <ul className="pf-intel-list">
          {filtered.map(item => <li key={item.id}>
            <article className="pf-intel-card" data-kind={item.kind} data-selected={selected === item.id || undefined} data-hidden={item.user?.hidden || undefined} tabIndex={0} onClick={() => setSelected(item.id)} onKeyDown={event => { if (event.key === "Enter") setSelected(item.id); }}>
              <CardCover item={item}/>
              <header>
                <span className="pf-intel-kind">{KIND_LABEL[item.kind]}</span>
                {item.reliability && item.kind !== "gap" && <span className="pf-intel-tier" data-tier={item.reliability} title={RELIABILITY_LABEL[item.reliability]}>R{item.reliability} {RELIABILITY_LABEL[item.reliability]}</span>}
                {item.status && <span className="pf-intel-status" data-status={item.status}>{STATUS_LABEL[item.status]}</span>}
                {item.stage && <span className="pf-intel-stage">{STAGE_LABEL[item.stage]}</span>}
                <button type="button" className="pf-intel-star" aria-pressed={Boolean(item.user?.star)} aria-label={item.user?.star ? "핵심 표시 해제" : "핵심으로 표시"} onClick={event => { event.stopPropagation(); void intelRepository.setUser(item.id, { star: !item.user?.star }); }}><Star size={16}/></button>
              </header>
              <h3>{display(item)}</h3>
              {item.titleKo && item.titleKo !== item.title && <p className="pf-intel-original" lang={item.lang}>{item.title}</p>}
              <p className="pf-intel-meta">{[item.org, item.date, item.country, item.lang && item.lang !== "ko" ? LANG_LABEL[item.lang] ?? item.lang : null].filter(Boolean).join(" · ")}</p>
              {item.summaryKo && <p className="pf-intel-summary">{item.summaryKo}</p>}
              {item.data?.length ? <div className="pf-intel-data">{item.data.slice(0, 3).map((datum, index) => <span key={index} title={[datum.basis, datum.where].filter(Boolean).join(" · ")}><em>{datum.label}</em><b>{datum.value}</b>{datum.unit && <small>{datum.unit}</small>}</span>)}</div> : null}
              <footer>
                {item.topics.slice(0, 3).map(topic => <span key={topic}>{TOPIC_LABEL.get(topic) ?? topic}</span>)}
                {docOf(item) && <span className="pf-intel-inlib"><Library size={12}/>서재에 있음</span>}
                {item.pdfUrl && !docOf(item) && <span className="pf-intel-pdf"><FileText size={12}/>PDF</span>}
              </footer>
            </article>
          </li>)}
          {!filtered.length && <li className="pf-intel-none">조건에 맞는 항목이 없습니다.</li>}
        </ul> : <div className="pf-intel-briefs">
          {briefs.length ? <>
            <nav aria-label="브리핑 목록">{briefGroups.map(([period, list]) => <div key={period} className="pf-intel-brief-group"><span>{PERIOD_LABEL[period]}</span>
              {list.map(brief => <button type="button" key={brief.id} aria-current={openBrief?.id === brief.id || undefined} onClick={() => setBriefId(brief.id)}>{brief.date && period !== "core" && <time>{brief.date}</time>}{brief.title}</button>)}</div>)}</nav>
            {openBrief && <article className="pf-intel-brief"><BriefDocument key={openBrief.id} brief={openBrief} entity={entity} terms={terms}/></article>}
          </> : <p className="pf-intel-none">이 자료 팩에는 브리핑이 없습니다.</p>}
        </div>}
      </div>}

      {floating(<AnimatePresence>{current && <motion.aside key={current.id} className="pf-intel-detail" aria-label="자세히"
        initial={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>
        <header>
          <div className="pf-intel-badges">
            <span className="pf-intel-kind">{KIND_LABEL[current.kind]}</span>
            {current.reliability && current.kind !== "gap" && <span className="pf-intel-tier" data-tier={current.reliability}>R{current.reliability} {RELIABILITY_LABEL[current.reliability]}</span>}
            {current.status && <span className="pf-intel-status" data-status={current.status}>{STATUS_LABEL[current.status]}</span>}
            {current.stage && <span className="pf-intel-stage">{STAGE_LABEL[current.stage]}</span>}
          </div>
          <button type="button" className="pf-intel-close" aria-label="닫기" onClick={() => setSelected(null)}><X size={18}/></button>
        </header>
        <PanelMarks itemId={current.id}>
        {(current.kind === "company" || current.kind === "project") && <div className="pf-panel-identity"><CompanyMark item={current} size={44}/><div><b>{companyName(current)}</b><small>{[current.profile?.industry, current.profile?.ticker, current.country].filter(Boolean).join(" · ")}</small></div><button type="button" onClick={() => { setPageId(current.id); setSelected(null); window.scrollTo({ top: 0 }); }}>기업 페이지 열기</button></div>}
        <h3>{display(current)}</h3>
        {current.titleKo && current.titleKo !== current.title && <p className="pf-intel-original" lang={current.lang}>{current.title}</p>}
        <p className="pf-intel-meta">{[current.org, current.authors, current.date, current.country, current.lang ? LANG_LABEL[current.lang] ?? current.lang : null].filter(Boolean).join(" · ")}</p>
        {current.dossier && <DossierView dossier={current.dossier} entity={entity} terms={terms} busy={fetching} onOpenPage={current.kind === "company" || current.kind === "project" ? () => { setPageId(current.id); setSelected(null); window.scrollTo({ top: 0 }); } : undefined} onPdf={source => void pdfToLibrary(source.pdfUrl!, source.title, source.pdfUrl!)}/>}

        <div className="pf-intel-buttons">
          {current.url && <a href={current.url} target="_blank" rel="noreferrer noopener"><ArrowUpRight size={15}/>원문 열기</a>}
          {docOf(current) ? <button type="button" className="pf-intel-primary" onClick={() => router.push(`/reader/${docOf(current)}`)}><BookOpenText size={15}/>서재에서 읽기·번역</button>
            : current.pdfUrl ? <button type="button" className="pf-intel-primary" disabled={fetching === current.id} onClick={() => void toLibrary(current)}>{fetching === current.id ? <Loader2 size={15} className="pf-spin"/> : <Download size={15}/>}PDF 서재에 담기</button> : null}
          <button type="button" aria-pressed={Boolean(current.user?.star)} onClick={() => void intelRepository.setUser(current.id, { star: !current.user?.star })}><Star size={15}/>{current.user?.star ? "핵심" : "핵심 표시"}</button>
          <button type="button" onClick={() => void intelRepository.setUser(current.id, { hidden: !current.user?.hidden })}><EyeOff size={15}/>{current.user?.hidden ? "다시 보이기" : "숨기기"}</button>
        </div>
        <label className="pf-intel-folderpick"><FolderOpen size={15}/><span>폴더</span>
          <select value={current.user?.folderId ?? ""} onChange={event => void intelRepository.setUser(current.id, { folderId: event.target.value || null })}>
            <option value="">폴더 없음</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          {!folders.length && <small>아카이브에서 폴더를 만들면 여기서 고를 수 있습니다.</small>}
        </label>

        <SourceTree item={current} byId={byId} mentions={mentions} onOpen={setSelected}/>
        {current.profile && <section><h4>{current.kind === "project" ? "프로젝트 정보" : "기업 정보"}</h4><dl className="pf-intel-specs">{Object.entries(current.profile).map(([key, value]) => <div key={key}><dt>{PROFILE_LABEL[key] ?? key}</dt><dd>{/^https?:\/\//.test(value) ? <a href={value} target="_blank" rel="noreferrer noopener">{value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a> : value}</dd></div>)}</dl></section>}
        {current.summaryKo && <section><h4>요약</h4><p>{current.summaryKo}</p></section>}
        {current.data?.length ? <section><h4>정량 데이터</h4><div className="pf-intel-table"><table><thead><tr><th>항목</th><th>값</th><th>기준</th><th>위치</th></tr></thead><tbody>
          {current.data.map((datum, index) => <tr key={index}><td>{datum.label}</td><td><b>{datum.value}</b>{datum.unit ? ` ${datum.unit}` : ""}</td><td>{datum.basis}</td><td>{datum.where}</td></tr>)}
        </tbody></table></div></section> : null}
        {current.equipment && <section><h4>장비 사양</h4><dl className="pf-intel-specs">{Object.entries(current.equipment).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></section>}
        {current.naysor && <section className="pf-intel-naysor"><h4>NAYSOR 적용성</h4><dl>{APPLICABILITY_LABEL.filter(([key]) => current.naysor?.[key]).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{current.naysor![key]}</dd></div>)}</dl></section>}
        {current.relations?.length ? <section><h4>관계</h4><ul className="pf-intel-relations">{current.relations.map((relation, index) => { const target = byId.get(relation.to); return <li key={index}><span>{relation.type}</span>{target ? <button type="button" onClick={() => setSelected(target.id)}>{display(target)}</button> : <b>{relation.to}</b>}</li>; })}</ul></section> : null}
        {(current.kind === "company" || current.kind === "project") && newsOf(current.id).length > 0 && <section><h4>최근 소식 · {newsOf(current.id).length}</h4><ol className="pf-intel-newslist">{newsOf(current.id).map(item => <li key={item.id}><button type="button" onClick={() => setSelected(item.id)}><time>{item.update!.date}</time><span className="pf-intel-update-type" data-type={item.update!.type}>{UPDATE_LABEL[item.update!.type]}</span><span>{item.update!.headline ?? display(item)}</span></button></li>)}</ol></section>}
        {mentions.length > 0 && <section><h4>{current.kind === "company" ? "이 기업이 나오는 프로젝트·자료" : "이 항목을 언급한 자료"} · {mentions.length}</h4><ul className="pf-intel-mentions">{mentions.map(item => <li key={item.id}><button type="button" onClick={() => setSelected(item.id)}><span>{KIND_LABEL[item.kind]}{item.stage ? ` · ${STAGE_LABEL[item.stage]}` : ""}</span>{display(item)}</button></li>)}</ul></section>}
        <FigureAdder key={current.id} item={current} notify={notify}/>
        <section><h4>내 메모</h4><textarea key={current.id} defaultValue={current.user?.note ?? ""} placeholder="판단, 다음 확인할 것, 연락처…" onBlur={event => { if (event.target.value !== (current.user?.note ?? "")) void intelRepository.setUser(current.id, { note: event.target.value.slice(0, 4000) }); }}/></section>
        </PanelMarks>
        <footer className="pf-intel-provenance">{[current.sourceType && `출처 유형 ${current.sourceType}`, current.checkedAt && `확인 ${current.checkedAt}`, current.pack && `팩 ${current.pack}`].filter(Boolean).join(" · ")}</footer>
      </motion.aside>}</AnimatePresence>)}
    </div>}
  </section>;
}
