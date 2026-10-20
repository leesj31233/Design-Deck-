"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, TrendingUp, BookOpenText, Building2, MapPinned, Newspaper, ChevronRight, Download, EyeOff, FileDown, FileText, FolderOpen, Layers, Library, Loader2, Radar, Search, Star, Upload, X } from "lucide-react";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";
import { archiveFolders } from "@/lib/paperflow/library/archive-folders";
import { importDocument } from "@/lib/paperflow/pdf/import-document";
import { INTEL_EVENT, intelRepository, readPack } from "@/lib/paperflow/intel/repository";
import { registerCsv, registerMarkdown } from "@/lib/paperflow/intel/export";
import { linkedDoc, libraryName, pdfUrlOf, suggestDoc } from "@/lib/paperflow/intel/library-link";
import { APPLICABILITY_LABEL, PATENT_STATUS_LABEL, SOURCE_TYPE_LABEL, UPDATE_LABEL, KIND_LABEL, LANG_LABEL, PERIOD_LABEL, PROFILE_LABEL, RELIABILITY_LABEL, STAGE_LABEL, STATUS_LABEL, TOPIC_LABEL, TOPIC_TREE, topicIds, type BriefPeriod, type IntelBrief, type IntelItem, type IntelKind, type IntelStatus, CLASS_LABEL, CLASS_ORDER, CLASS_SHORT, itemClasses, itemDate, type IntelClass } from "@/lib/paperflow/intel/types";
import { usePaperflow } from "../shell/paperflow-context";
import { FolderGlyph } from "../library/archive-folders";
import { BriefDocument } from "./brief-document";
import { DossierView } from "./dossier-view";
import { FigureAdder } from "./figure-adder";
import { PanelMarks } from "./panel-marks";
import { SourceTree } from "./source-tree";
import { CardCover, CoverImage } from "./card-cover";
import { ItemArticle } from "./item-article";
import { PatentBoard, patentLink } from "./patent-board";
import { IntelProgressBar } from "./intel-progress";
import { CompanyMark, CompanyPage, companyName } from "./company-page";
import { IntelMap } from "./intel-map";
import { EntityDirectory } from "./entity-directory";
import { PriceBoard } from "./price-board";
import { entityWeb } from "@/lib/paperflow/intel/web";
import { PLACES_BRIEF, cleanPlaces, type BasePlaces } from "@/lib/paperflow/intel/places";
import { PRICES_BRIEF, cleanPrices, productClass, type PriceBoard as PriceBoardData } from "@/lib/paperflow/intel/prices";
import { REGISTRY_BRIEF, entityClasses, entityItems, indexRegistry, type IntelEntity, type IntelRegistry } from "@/lib/paperflow/intel/registry";
import { glossaryIndex, type GlossaryTerm } from "@/lib/paperflow/intel/glossary";
import "./intel.css";

type Scope = { type: "all" } | { type: "star" } | { type: "pdf" } | { type: "topic"; id: string } | { type: "folder"; id: string } | { type: "kind"; kind: IntelKind };
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
/** NAYSOR News (the public site): no library, no pack import; PDFs are read and marked in PAPERFLOW. */
export type IntelSite = { loading: boolean; paperflow: string };

export function IntelView({ docs, site, launch }: { docs: StoredDocument[]; site?: IntelSite; launch?: { item: string; read: boolean; related?: boolean } }) {
  const [items, setItems] = useState<IntelItem[] | null>(null), [briefs, setBriefs] = useState<IntelBrief[]>([]);
  const [scope, setScope] = useState<Scope>({ type: "all" }), [mode, setMode] = useState<"items" | "prices" | "briefs" | "analysis" | "companies" | "patents" | "map">("items");
  const [query, setQuery] = useState(""), [kinds, setKinds] = useState<Set<IntelKind>>(new Set()), [statuses, setStatuses] = useState<Set<IntelStatus>>(new Set());
  const [sort, setSort] = useState<"reliability" | "date">("date"), [showHidden, setShowHidden] = useState(false);
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
  // On a wide screen an item opens as the page itself, in the middle, with the list as a rail on the right.
  const focusDetail = !narrow && mode === "items" && Boolean(selected);
  // The browser's back button closes what is open (an item, a company page) instead of leaving the tab:
  // opening adds one history entry at the same address; moving between items replaces it; back closes.
  const openKey = pageId ? `page:${pageId}` : selected ? `item:${selected}` : null;
  useEffect(() => {
    const state = window.history.state as Record<string, unknown> | null;
    if (!openKey) return;
    if (state?.pfIntel === openKey) return;
    if (state?.pfIntel) window.history.replaceState({ ...state, pfIntel: openKey }, "", window.location.href);
    else window.history.pushState({ ...(state ?? {}), pfIntel: openKey }, "", window.location.href);
  }, [openKey]);
  useEffect(() => {
    const back = (event: PopStateEvent) => {
      const key = (event.state as Record<string, unknown> | null)?.pfIntel as string | undefined;
      if (!key) { setSelected(null); setPageId(null); return; }
      if (key.startsWith("page:")) { setPageId(key.slice(5)); setSelected(null); } else { setSelected(key.slice(5)); setPageId(null); }
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  // The opened item starts at the top of the page.
  useEffect(() => { if (focusDetail) document.querySelector(".pf-intel-body")?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" }); }, [selected, focusDetail, reduced]);
  // A briefing read full-screen also needs the panel above it.
  const [briefFocus, setBriefFocus] = useState(false);
  useEffect(() => { const watch = new MutationObserver(() => setBriefFocus(Boolean(document.querySelector(".pf-brief-focus-layer")))); watch.observe(document.body, { childList: true }); return () => watch.disconnect(); }, []);
  const floating = (node: React.ReactNode) => narrow || briefFocus ? createPortal(<div className="pf-intel pf-intel-portal">{node}</div>, document.body) : node;

  // The pack's glossary travels as a hidden briefing ("__glossary__", JSON); the rest are briefings to read.
  const [extraTerms, setExtraTerms] = useState<GlossaryTerm[]>([]);
  // The entity registry travels the same way ("__registry__"): organisations, their codes and items.
  const [registry, setRegistry] = useState<IntelRegistry | null>(null);
  // And the price board ("__prices__"): pellet, PKS and biochar prices by market, shown above the briefings.
  const [prices, setPrices] = useState<PriceBoardData | null>(null), [places, setPlaces] = useState<BasePlaces | null>(null);
  const load = useCallback(async () => {
    const [list, written] = await Promise.all([intelRepository.list(), intelRepository.briefs()]);
    setItems(list); setBriefs(written.filter(brief => !brief.id.startsWith("__")));
    try { const stored = written.find(brief => brief.id === PLACES_BRIEF); setPlaces(stored ? cleanPlaces(JSON.parse(stored.body)) : null); } catch { setPlaces(null); }
    try { const stored = written.find(brief => brief.id === PRICES_BRIEF); setPrices(stored ? cleanPrices(JSON.parse(stored.body)) : null); } catch { setPrices(null); }
    try { const stored = written.find(brief => brief.id === REGISTRY_BRIEF); setRegistry(stored ? JSON.parse(stored.body) : null); } catch { setRegistry(null); }
    try { const glossary = written.find(brief => brief.id === "__glossary__"); setExtraTerms(glossary ? JSON.parse(glossary.body) : []); } catch { setExtraTerms([]); }
  }, []);
  /** Abbreviations and terms (FIT, LCA, GGL…): a dotted underline the first time, the explanation on hover or tap. */
  const terms = useMemo(() => {
    const { byKey, pattern } = glossaryIndex(extraTerms);
    return { pattern, render: (key: string, label: string, nodeKey: string) => { const term = byKey.get(key)!; return <span key={nodeKey} className="pf-term" tabIndex={0}>{label}<span className="pf-term-tip" role="tooltip"><strong>{term.term}</strong><small>{term.full}</small><span>{term.meaning}</span>{term.note && <em>{term.note}</em>}</span></span>; } };
  }, [extraTerms]);
  useEffect(() => { void load(); window.addEventListener(INTEL_EVENT, load); return () => window.removeEventListener(INTEL_EVENT, load); }, [load]);
  const launched = useRef<object | null>(null);

  // Class 1 (EFB/POME pellets, biochar) or Class 2 (low-rank coal upgrading): the whole tab follows the choice.
  const [klass, setKlassState] = useState<IntelClass | "all">("all");
  useEffect(() => { try { const saved = localStorage.getItem("pf-intel-class"); if (saved === "c1" || saved === "c2") setKlassState(saved); } catch { /* the default works */ } }, []);
  const setKlass = (next: IntelClass | "all") => { setKlassState(next); try { localStorage.setItem("pf-intel-class", next); } catch { /* remembered for this visit only */ } };
  const inClass = useCallback((item: IntelItem) => klass === "all" || itemClasses(item).includes(klass), [klass]);
  const visible = useMemo(() => (items ?? []).filter(item => (showHidden || !item.user?.hidden) && inClass(item)), [items, showHidden, inClass]);
  // A dated briefing (daily, weekly, monthly) is the day's news for every class: it shows whichever class is chosen.
  const classBriefs = useMemo(() => briefs.filter(brief => klass === "all" || (brief.period && brief.period !== "core") || (brief.classes ?? (/^brief-c2-/.test(brief.id) ? ["c2"] : ["c1"])).includes(klass)), [briefs, klass]);
  const classPrices = useMemo(() => { if (!prices) return null; const series = prices.series.filter(entry => klass === "all" || productClass(entry.product) === klass); return series.length ? { ...prices, series } : null; }, [prices, klass]);
  const inScope = useCallback((item: IntelItem) => {
    if (scope.type === "star") return Boolean(item.user?.star);
    if (scope.type === "pdf") return Boolean(pdfUrlOf(item) || linkedDoc(item, docs));
    if (scope.type === "folder") return item.user?.folderId === scope.id;
    if (scope.type === "kind") return item.kind === scope.kind;
    if (scope.type === "topic") { const node = TOPIC_TREE.find(group => group.id === scope.id); const ids = node ? topicIds(node) : [scope.id]; return item.topics.some(topic => ids.includes(topic)); }
    return true;
  }, [scope, docs]);
  // Each item's date: the newest real one among its own, its news and its sources ("n.d." sorts last, not first).
  const dates = useMemo(() => new Map((items ?? []).flatMap(item => { const date = itemDate(item); return date ? [[item.id, date] as const] : []; })), [items]);
  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return visible.filter(item => inScope(item) && (!kinds.size || kinds.has(item.kind)) && (!statuses.size || (item.status && statuses.has(item.status)))
      && words.every(word => [item.title, item.titleKo, item.summaryKo, item.org, item.country, item.authors, ...(item.data ?? []).map(datum => `${datum.label} ${datum.value}`), ...Object.values(item.equipment ?? {})].join(" ").toLowerCase().includes(word)))
      // Open questions sit after the evidence; among evidence, the stronger source (or the newer) first.
      .sort((a, b) => Number(a.kind === "gap") - Number(b.kind === "gap") || (sort === "date" ? (dates.get(b.id) ?? "").localeCompare(dates.get(a.id) ?? "") : (a.reliability ?? 9) - (b.reliability ?? 9) || (dates.get(b.id) ?? "").localeCompare(dates.get(a.id) ?? "")));
  }, [visible, inScope, kinds, statuses, query, sort, dates]);
  const count = useCallback((test: (item: IntelItem) => boolean) => visible.filter(test).length, [visible]);
  const current = useMemo(() => (items ?? []).find(item => item.id === selected) ?? null, [items, selected]);
  const byId = useMemo(() => new Map((items ?? []).map(item => [item.id, item])), [items]);
  // Items that point at the one open (a company's projects, the reports that mention it).
  /** News items (reports, plans, articles, withdrawals…), newest first. */
  // News that has happened: an update dated in the future (an event announced ahead) is not "today's".
  const todayKey = useMemo(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }, []);
  const updates = useMemo(() => (items ?? []).filter(item => item.update && item.update.date <= todayKey && !item.user?.hidden && inClass(item)).sort((a, b) => b.update!.date.localeCompare(a.update!.date) || (b.addedAt ?? "").localeCompare(a.addedAt ?? "")), [items, inClass, todayKey]);
  const latestDay = updates[0]?.update!.date ?? null;
  const [allRecent, setAllRecent] = useState(false);
  const shownUpdates = useMemo(() => { if (!latestDay) return []; if (!allRecent) return updates.filter(item => item.update!.date === latestDay); const week = new Date(Date.parse(latestDay) - 7 * 864e5).toISOString().slice(0, 10); return updates.filter(item => item.update!.date >= week); }, [updates, latestDay, allRecent]);
  /** Everything about a company or project: news that names it, and items related to it. */
  const newsOf = useCallback((id: string) => updates.filter(item => item.update!.entities.includes(id) || item.relations?.some(relation => relation.to === id)), [updates]);
  const companies = useMemo(() => (items ?? []).filter(item => (item.kind === "company" || item.kind === "project") && !item.user?.hidden).map(item => ({ item, news: newsOf(item.id) }))
    .sort((a, b) => (b.news[0]?.update!.date ?? "").localeCompare(a.news[0]?.update!.date ?? "") || Number(Boolean(b.item.dossier)) - Number(Boolean(a.item.dossier)) || display(a.item).localeCompare(display(b.item))), [items, newsOf]);
  const registryIndex = useMemo(() => indexRegistry(registry), [registry]);
  // An organisation known only from the registry (a parent, a ministry) still gets a page: "entity:<code>".
  const pageItem = useMemo((): IntelItem | null => {
    if (!pageId) return null;
    if (pageId.startsWith("entity:")) {
      const entity = registryIndex.byCode.get(pageId.slice(7));
      return entity ? { id: pageId, kind: entity.category === "vendor" ? "vendor" : "company", title: entity.name, url: entity.website ?? "", country: entity.country, topics: [], summaryKo: entity.note, profile: { name: entity.name, ...(entity.legalName ? { legalName: entity.legalName } : {}), ...(entity.country ? { country: entity.country } : {}), ...(entity.website ? { website: entity.website } : {}) } } : null;
    }
    return (items ?? []).find(item => item.id === pageId) ?? null;
  }, [items, pageId, registryIndex]);
  // A company page knows its organisation: code, parent, subsidiaries, and everything collected about them.
  const pageEntity = pageItem ? (pageItem.id.startsWith("entity:") ? registryIndex.byCode.get(pageItem.id.slice(7)) : registryIndex.byItem.get(pageItem.id)) : undefined;
  // 특허(IP): patents, and the organisation the patent tab is narrowed to (from a company page).
  const [patentEntity, setPatentEntity] = useState<IntelEntity | null>(null);
  const patents = useMemo(() => visible.filter(item => item.kind === "patent" && item.patent), [visible]);
  const patentOf = useCallback((item: IntelItem, entity: IntelEntity) => {
    const names = [entity.name, ...entity.aliases].map(name => name.replace(/(.*?)/g, "").replace(/^(PT|CV)s+/i, "").trim().toLowerCase()).filter(name => name.length >= 3);
    const own = new Set([entity.canonicalItemId, ...entity.itemIds].filter(Boolean));
    return Boolean(item.patent?.entityCodes?.includes(entity.code) || item.patent?.applicants.some(applicant => names.some(name => applicant.toLowerCase().includes(name))) || item.relations?.some(relation => own.has(relation.to)));
  }, []);
  const openPatents = useCallback((entity: IntelEntity | null) => { setPatentEntity(entity); setPageId(null); setSelected(null); setMode("patents"); window.scrollTo({ top: 0 }); }, []);
  const openEntity = useCallback((entity: IntelEntity) => { setPageId(entity.canonicalItemId ?? `entity:${entity.code}`); setSelected(null); window.scrollTo({ top: 0 }); }, []);
  const relatedOf = useCallback((item: IntelItem) => { const ids = new Set([...(item.relations ?? []).map(relation => relation.to), ...newsOf(item.id).map(entry => entry.id)]); return (items ?? []).filter(entry => entry.id !== item.id && (ids.has(entry.id) || entry.relations?.some(relation => relation.to === item.id))).slice(0, 24); }, [items, newsOf]);
  const mentions = useMemo(() => current ? (items ?? []).filter(item => item.id !== current.id && item.relations?.some(relation => relation.to === current.id)) : [], [items, current]);
  // 브리핑 = the executive summaries (the essence, one per class) and the dated briefings (daily, weekly, monthly);
  // 분석 업데이트 = the standing analyses (supply, standards, chronologies, evidence tables…), which are information
  // updates rather than briefings. Daily briefings fold away so they do not pile up.
  const isExecutive = (brief: IntelBrief) => /Executive Summary/i.test(brief.title);
  const analysisBriefs = useMemo(() => classBriefs.filter(brief => (brief.period ?? "core") === "core" && !isExecutive(brief)), [classBriefs]);
  const readingBriefs = useMemo(() => classBriefs.filter(brief => isExecutive(brief) || (brief.period ?? "core") !== "core"), [classBriefs]);
  const [allDaily, setAllDaily] = useState(false);
  const briefClass = (brief: IntelBrief) => brief.classes?.[0] ?? (/^brief-c2-|Class 2/.test(`${brief.id} ${brief.title}`) ? "c2" : /^brief-c3-|Class 3/.test(`${brief.id} ${brief.title}`) ? "c3" : /Class 1|^brief-c1-/.test(`${brief.id} ${brief.title}`) ? "c1" : "common");
  const briefGroups = useMemo((): [string, string, IntelBrief[]][] => {
    const byOrder = (a: IntelBrief, b: IntelBrief) => (a.order ?? 0) - (b.order ?? 0), byDate = (a: IntelBrief, b: IntelBrief) => (b.date ?? "").localeCompare(a.date ?? "");
    if (mode === "analysis") return ([["c1", "Class 1 · EFB/POME 펠릿·바이오차"], ["c2", "Class 2 · 저품위탄 고품위화"], ["c3", "Class 3 · 캐슈넛 부산물"], ["common", "공통"]] as const).map(([key, label]) => [key, label, analysisBriefs.filter(brief => briefClass(brief) === key).sort(byOrder)] as [string, string, IntelBrief[]]).filter(([, , list]) => list.length);
    const groups: [string, string, IntelBrief[]][] = [["exec", "Executive Summary", readingBriefs.filter(isExecutive).sort(byOrder)]];
    for (const period of ["daily", "weekly", "monthly", "quarterly"] as BriefPeriod[]) groups.push([period, `${PERIOD_LABEL[period]} 브리핑`, readingBriefs.filter(brief => brief.period === period).sort(byDate)]);
    return groups.filter(([, , list]) => list.length);
  }, [mode, analysisBriefs, readingBriefs]); // eslint-disable-line react-hooks/exhaustive-deps
  const scopeBriefs = mode === "analysis" ? analysisBriefs : readingBriefs;
  const openBrief = useMemo(() => scopeBriefs.find(brief => brief.id === briefId) ?? briefGroups[0]?.[2][0] ?? null, [scopeBriefs, briefId, briefGroups]);
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
    const existing = docs.find(doc => !doc.deletedAt && doc.filename === libraryName(title));
    if (existing) { if (itemId) await intelRepository.setUser(itemId, { docId: existing.id, read: true }); router.push(`/reader/${existing.id}`); return; }
    setFetching(busyKey);
    try {
      const response = await fetch(`/api/intel/pdf?url=${encodeURIComponent(url)}`);
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? "PDF를 가져오지 못했습니다."); }
      const name = libraryName(title);
      const record = await importDocument(new File([await response.blob()], name, { type: "application/pdf" }));
      if (itemId) await intelRepository.setUser(itemId, { docId: record.id, read: true });
      await client.invalidateQueries({ queryKey: ["documents"] });
      notify("서재에 담았습니다. 리더에서 번역하고 마킹할 수 있습니다.");
      router.push(`/reader/${record.id}`);
    } catch (error) { notify(error instanceof Error ? error.message : "PDF를 가져오지 못했습니다."); }
    finally { setFetching(null); }
  };
  const toLibrary = (item: IntelItem) => { const pdf = pdfUrlOf(item); return pdf ? pdfToLibrary(pdf, item.title || item.id, item.id, item.id) : Promise.resolve(); };
  const docOf = (item: IntelItem) => linkedDoc(item, docs)?.id ?? null;
  const linkDoc = (item: IntelItem, docId: string | null) => void intelRepository.setUser(item.id, { docId }).then(() => notify(docId ? "서재의 PDF를 연결했습니다." : "연결을 풀었습니다."));
  const toggle = <T,>(set: Set<T>, value: T) => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); return next; };

  /** A figure placed in a briefing: the item's case-file figure n (or its cover), its caption and a way to the item. */
  const briefFigure = (id: string, index: number, caption: string, key: number) => {
    const item = byId.get(id), figures = [...(item?.dossier?.figures ?? []), ...(item?.user?.figures ?? [])], picked = figures[index - 1] ?? (item?.cover || item?.hasCover ? { src: item.cover, caption: display(item) } : undefined);
    if (!item || !picked) return null;
    return <figure key={key} className="pf-brief-figure"><button type="button" onClick={() => setSelected(id)} aria-label={`${display(item)} 자세히`}>{picked.src ? <img src={picked.src} alt={caption || picked.caption} loading="lazy"/> : <CoverImage item={item} alt={caption || picked.caption}/>}</button><figcaption><b>{caption || picked.caption}</b><span>{item.kind === "company" || item.kind === "project" ? companyName(item) : display(item)}</span></figcaption></figure>;
  };
  /** The companies, projects and documents a briefing links to, in order of first mention, as a visual strip. */
  const briefCast = (body: string) => {
    const found = [...new Set([...body.matchAll(/\]\(intel:([\w.:-]+)\)/g)].map(match => match[1]))].map(id => byId.get(id)).filter((item): item is IntelItem => Boolean(item));
    if (!found.length) return null;
    return <section className="pf-brief-cast" aria-label="이 브리핑에 나오는 기업·자료"><h4>이 브리핑에 나오는 기업·자료 · {found.length}</h4><ul>{found.slice(0, 24).map(item => <li key={item.id}><button type="button" data-open={selected === item.id || undefined} onClick={() => setSelected(item.id)}>
      {(item.kind === "company" || item.kind === "project") && !item.cover && !item.hasCover && !item.dossier ? <span className="pf-brief-cast-mark"><CompanyMark item={item} size={40}/></span> : <CardCover item={item}/>}
      <span><small>{KIND_LABEL[item.kind]}{item.update ? ` · ${UPDATE_LABEL[item.update.type]}` : ""}</small><b>{item.kind === "company" || item.kind === "project" ? companyName(item) : display(item)}</b></span>
    </button></li>)}</ul></section>;
  };
  /**
   * A preview or term tip that would run past its frame (the window, the side panel, a wide case file)
   * slides back inside it. Listens on the document: the panel can be rendered outside this section.
   */
  useEffect(() => {
    const place = (event: Event) => {
      const host = (event.target as Element | null)?.closest?.(".pf-term, .pf-md-entity-wrap, .pf-cite-wrap");
      const tip = host?.querySelector<HTMLElement>(".pf-term-tip, .pf-md-preview, .pf-cite-card");
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
  // Arriving from NAYSOR News ("…/library?intel=<id>&read=1"): the item opens, and its PDF goes to the reader.
  useEffect(() => {
    if (!launch || launched.current === launch || !items) return;
    const target = byId.get(launch.item);
    if (!target) return;
    launched.current = launch;
    // 관련 이슈: the organisation (or project) the document belongs to, else the item itself.
    const owner = launch.related ? registryIndex.byItem.get(target.id) : undefined;
    if (owner) { openEntity(owner); return; }
    if (launch.related && (target.kind === "company" || target.kind === "project")) { setPageId(target.id); return; }
    setMode("items"); setSelected(target.id);
    if (launch.read) { const doc = linkedDoc(target, docs)?.id; if (doc) router.push(`/reader/${doc}`); else if (pdfUrlOf(target)) void toLibrary(target); }
  });
  /** On NAYSOR News a PDF is read in PAPERFLOW (translated, marked, kept with the reader's account). */
  const inPaperflow = (item: IntelItem) => site ? `${site.paperflow}/library?intel=${encodeURIComponent(item.id)}&read=1` : "";
  if (items === null) return <div className="pf-empty" role="status">인텔리전스를 불러오는 중…</div>;
  const empty = !items.length;
  const scopeLabel = scope.type === "all" ? "전체" : scope.type === "star" ? "핵심 표시" : scope.type === "pdf" ? "PDF 보고서" : scope.type === "folder" ? folders.find(folder => folder.id === scope.id)?.name ?? "폴더" : scope.type === "kind" ? KIND_LABEL[scope.kind] : TOPIC_LABEL.get(scope.id) ?? scope.id;

  return <section className="pf-intel" aria-label="인텔리전스">
    <IntelProgressBar/>
    <header className="pf-intel-head">
      <div><p className="pf-intel-eyebrow"><Radar size={14}/> Information flow</p><h2>{klass === "all" ? "NAYSOR 인텔리전스" : `Class ${klass === "c1" ? 1 : 2} · ${CLASS_LABEL[klass]}`}</h2><p>검증된 논문·정부 보고서·기업 자료·장비 벤더·시장 정보만 모아, 근거와 신뢰도를 함께 봅니다.</p>
        <div className="pf-intel-classes" role="tablist" aria-label="사업 분류">
          <button type="button" role="tab" aria-selected={klass === "all"} onClick={() => setKlass("all")}>전체</button>
          {CLASS_ORDER.map((key, index) => <button key={key} type="button" role="tab" aria-selected={klass === key} data-class={key} onClick={() => setKlass(key)}><b>Class {index + 1}</b>{CLASS_LABEL[key]}<i>{(items ?? []).filter(item => itemClasses(item).includes(key)).length}</i></button>)}
        </div></div>
      <div className="pf-intel-actions">
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={event => void importFile(event.target.files?.[0])}/>
        {!site && <button type="button" className="pf-intel-primary" onClick={() => file.current?.click()}><Upload size={15}/>자료 팩 가져오기</button>}
        {!empty && <><button type="button" onClick={() => download(`source-register-${new Date().toISOString().slice(0, 10)}.csv`, registerCsv(filtered), "text/csv;charset=utf-8")}><FileDown size={15}/>출처 대장 CSV</button>
          <button type="button" onClick={() => download(`source-register-${new Date().toISOString().slice(0, 10)}.md`, registerMarkdown(filtered), "text/markdown;charset=utf-8")}><FileText size={15}/>Markdown</button></>}
      </div>
    </header>

    {empty && site ? <div className="pf-empty" role="status">{site.loading ? "NAYSOR News를 불러오는 중…" : "아직 공개된 자료가 없습니다."}</div> : empty ? <div className="pf-intel-empty">
      <Radar size={34}/><h3>아직 자료가 없습니다</h3>
      <p>Claude가 조사해 검증한 자료 팩(.json)을 가져오면 주제별 트리, 기업·벤더·시장 정보, 브리핑이 채워집니다. 계정에 로그인되어 있으면 다른 기기에도 같이 보입니다.</p>
      <button type="button" className="pf-intel-primary" onClick={() => file.current?.click()}><Upload size={15}/>자료 팩 가져오기</button>
    </div> : <div className="pf-intel-body" data-detail={current ? "open" : undefined} data-mode={pageItem ? "page" : mode} data-focus={focusDetail || undefined}>
      <nav className="pf-intel-tree" aria-label="주제">
        <button type="button" aria-current={scope.type === "all" || undefined} onClick={() => setScope({ type: "all" })}><Layers size={15}/>전체<i>{visible.length}</i></button>
        <button type="button" aria-current={scope.type === "star" || undefined} onClick={() => setScope({ type: "star" })}><Star size={15}/>핵심 표시<i>{count(item => Boolean(item.user?.star))}</i></button>
<button type="button" aria-current={scope.type === "pdf" || undefined} title="리더에서 열어 번역할 수 있는 PDF 보고서·논문" onClick={() => setScope({ type: "pdf" })}><FileText size={15}/>PDF 보고서<i>{count(item => Boolean(pdfUrlOf(item) || docOf(item)))}</i></button>
        {TOPIC_TREE.filter(group => klass === "all" || count(item => item.topics.some(topic => topicIds(group).includes(topic))) > 0).map(group => <div key={group.id} className="pf-intel-group">
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

      {pageItem ? <CompanyPage patents={pageEntity ? { count: patents.filter(item => patentOf(item, pageEntity)).length, open: () => openPatents(pageEntity) } : undefined} reports={(pageEntity ? entityItems(pageEntity, registryIndex, byId) : [pageItem]).flatMap(entry => pdfUrlOf(entry) && entry.kind !== "patent" ? [{ id: entry.id, title: display(entry), url: pdfUrlOf(entry)!, date: itemDate(entry) }] : []).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 12)} article={pageItem.article ? <ItemArticle item={pageItem} entity={entity} terms={terms} figure={briefFigure}/> : undefined} item={pageItem} web={pageEntity ? entityWeb(pageEntity, registryIndex, byId, items ?? []) : undefined} library={{ has: id => docs.some(doc => doc.id === id && !doc.deletedAt), open: id => router.push(`/reader/${id}`) }} read={site ? (pdfUrlOf(pageItem) ? { label: "PAPERFLOW에서 번역·마킹", run: () => void window.open(inPaperflow(pageItem), "_blank", "noopener") } : undefined) : docOf(pageItem) ? { label: "리더에서 읽기·번역", run: () => router.push(`/reader/${docOf(pageItem)}`) } : pdfUrlOf(pageItem) ? { label: "PDF 번역해서 읽기", run: () => void toLibrary(pageItem) } : undefined} news={newsOf(pageItem.id)} related={pageEntity ? entityItems(pageEntity, registryIndex, byId) : relatedOf(pageItem)} org={pageEntity ? { entity: pageEntity, parent: pageEntity.parentCode ? registryIndex.byCode.get(pageEntity.parentCode) : undefined, children: registryIndex.children.get(pageEntity.code) ?? [], open: openEntity } : undefined} byId={byId} mentions={(items ?? []).filter(entry => entry.id !== pageItem.id && entry.relations?.some(relation => relation.to === pageItem.id))} entity={entity} terms={terms}
        onOpen={id => { const target = byId.get(id); if (target && (target.kind === "company" || target.kind === "project")) { setPageId(id); setSelected(null); window.scrollTo({ top: 0 }); } else setSelected(id); }}
        onBack={() => setPageId(null)} onPdf={source => site ? void window.open(source.pdfUrl!, "_blank", "noopener") : void pdfToLibrary(source.pdfUrl!, source.title, source.pdfUrl!)} busy={fetching} notify={notify}/> : <div className="pf-intel-main">
        <div className="pf-intel-toolbar">
          <label className="pf-intel-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="기업, 장비, 수치, 국가로 찾기 (예: screw press, Malakoff, K 제거)" aria-label="인텔리전스 검색"/>{query && <button type="button" aria-label="지우기" onClick={() => setQuery("")}><X size={14}/></button>}</label>
          <div className="pf-intel-modes" role="tablist" aria-label="보기">
            <button type="button" role="tab" aria-selected={mode === "items"} onClick={() => setMode("items")}><Layers size={14}/>항목</button>
            <button type="button" role="tab" aria-selected={mode === "prices"} onClick={() => setMode("prices")}><TrendingUp size={14}/>가격 보드<i>{classPrices?.series.length ?? 0}</i></button>
            <button type="button" role="tab" aria-selected={mode === "briefs"} onClick={() => setMode("briefs")}><BookOpenText size={14}/>브리핑<i>{readingBriefs.length}</i></button>
            <button type="button" role="tab" aria-selected={mode === "analysis"} onClick={() => setMode("analysis")}><Layers size={14}/>분석 업데이트<i>{analysisBriefs.length}</i></button>
            <button type="button" role="tab" aria-selected={mode === "companies"} onClick={() => setMode("companies")}><Building2 size={14}/>기업 분석<i>{registry ? (klass === "all" ? registry.entities.length : registry.entities.filter(entity => entityClasses(entity, byId).includes(klass)).length) : companies.length}</i></button>
            <button type="button" role="tab" aria-selected={mode === "patents"} onClick={() => { setPatentEntity(null); setMode("patents"); }}><FileText size={14}/>특허(IP)<i>{patents.length}</i></button>
            <button type="button" role="tab" aria-selected={mode === "map"} onClick={() => setMode("map")}><MapPinned size={14}/>지도<i>{visible.filter(item => item.geo?.length).length}</i></button>
          </div>
        </div>
        {latestDay && mode !== "map" && <section className="pf-intel-today" aria-label="오늘자 업데이트">
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
          <select aria-label="정렬" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="date">최신 순</option><option value="reliability">신뢰도 순</option></select>
          <label className="pf-intel-hidden"><input type="checkbox" checked={showHidden} onChange={event => setShowHidden(event.target.checked)}/>숨긴 항목</label>
        </div>}

        {mode === "prices" ? (classPrices ? <PriceBoard board={classPrices} title={klass === "c2" ? "석탄 가격 (저품위탄·기준가)" : klass === "c3" ? "캐슈넛·껍질·CNSL 가격" : klass === "c1" ? "펠릿·바이오차 가격" : "가격 보드 — 펠릿·바이오차·석탄·캐슈넛"} onItem={setSelected}/> : <p className="pf-intel-none">이 분류에는 아직 가격 시리즈가 없습니다.</p>) : mode === "map" ? <IntelMap items={visible} query={query} selected={selected} places={places} klass={klass} onOpen={id => { const target = byId.get(id); if (target && (target.kind === "company" || target.kind === "project")) { setPageId(id); setSelected(null); window.scrollTo({ top: 0 }); } else setSelected(id); }}/> : mode === "patents" ? <PatentBoard items={patents} entity={patentEntity} onClearEntity={() => setPatentEntity(null)} onOpen={setSelected} matches={patentOf}/> : mode === "companies" && registry ? <EntityDirectory index={registryIndex} byId={byId} query={query} klass={klass} onOpen={openEntity}/> : mode === "companies" ? <ul className="pf-intel-companies">
          {companies.filter(({ item }) => !query || [display(item), item.title, item.org, item.country, ...Object.values(item.profile ?? {})].join(" ").toLowerCase().includes(query.toLowerCase())).map(({ item, news }) => { const cover = item.dossier?.figures?.[0]?.src ?? item.user?.figures?.[0]?.src; return <li key={item.id}>
            <article className="pf-intel-company" data-selected={selected === item.id || undefined} tabIndex={0} onClick={() => { setPageId(item.id); setSelected(null); window.scrollTo({ top: 0 }); }} onKeyDown={event => { if (event.key === "Enter") { setPageId(item.id); setSelected(null); } }}>
              <div className="pf-intel-company-cover">{cover ? <img src={cover} alt="" loading="lazy"/> : item.logo ? <span className="pf-intel-company-logo-big"><img src={item.logo} alt=""/></span> : <CompanyMark item={item} size={64}/>}{item.logo && <i className="pf-intel-company-logo" data-dark={item.logoDark || undefined}><img src={item.logo} alt=""/></i>}{item.dossier && <span>케이스 파일</span>}</div>
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
              <CardCover item={item} library={linkedDoc(item, docs)?.cover}/>
              <header>
                {registryIndex.byItem.get(item.id) && <code className="pf-intel-code" title={registryIndex.byItem.get(item.id)!.name}>{registryIndex.byItem.get(item.id)!.code}</code>}{klass === "all" && itemClasses(item).map(key => <small key={key} className="pf-class-tag" data-class={key}>{CLASS_SHORT[key]}</small>)}<span className="pf-intel-kind">{KIND_LABEL[item.kind]}</span>
                {item.reliability && item.kind !== "gap" && <span className="pf-intel-tier" data-tier={item.reliability} title={RELIABILITY_LABEL[item.reliability]}>R{item.reliability} {RELIABILITY_LABEL[item.reliability]}</span>}
                {item.status && <span className="pf-intel-status" data-status={item.status}>{STATUS_LABEL[item.status]}</span>}
                {item.stage && <span className="pf-intel-stage">{STAGE_LABEL[item.stage]}</span>}
                <button type="button" className="pf-intel-star" aria-pressed={Boolean(item.user?.star)} aria-label={item.user?.star ? "핵심 표시 해제" : "핵심으로 표시"} onClick={event => { event.stopPropagation(); void intelRepository.setUser(item.id, { star: !item.user?.star }); }}><Star size={16}/></button>
              </header>
              <h3>{display(item)}</h3>
              {item.titleKo && item.titleKo !== item.title && <p className="pf-intel-original" lang={item.lang}>{item.title}</p>}
              <p className="pf-intel-meta">{[item.org, dates.get(item.id) ?? null, item.country, item.lang && item.lang !== "ko" ? LANG_LABEL[item.lang] ?? item.lang : null].filter(Boolean).join(" · ")}</p>
              {item.summaryKo && <p className="pf-intel-summary">{item.summaryKo}</p>}
              {item.data?.length ? <div className="pf-intel-data">{item.data.slice(0, 3).map((datum, index) => <span key={index} title={[datum.basis, datum.where].filter(Boolean).join(" · ")}><em>{datum.label}</em><b>{datum.value}</b>{datum.unit && <small>{datum.unit}</small>}</span>)}</div> : null}
              <footer>
                {item.topics.slice(0, 3).map(topic => <span key={topic}>{TOPIC_LABEL.get(topic) ?? topic}</span>)}
                {docOf(item) && <span className="pf-intel-inlib"><Library size={12}/>서재에 있음</span>}
                {pdfUrlOf(item) && !docOf(item) && <span className="pf-intel-pdf"><FileText size={12}/>PDF</span>}
              </footer>
            </article>
          </li>)}
          {!filtered.length && <li className="pf-intel-none">조건에 맞는 항목이 없습니다.</li>}
        </ul> : <><div className="pf-intel-briefs">
          {scopeBriefs.length ? <>
            <nav aria-label={mode === "analysis" ? "분석 업데이트 목록" : "브리핑 목록"}>{briefGroups.map(([key, label, list]) => <div key={key} className="pf-intel-brief-group" data-group={key}><span>{label}{key === "daily" ? ` · ${list.length}` : ""}</span>
              {(key === "daily" && !allDaily ? list.slice(0, 3) : list).map(brief => <button type="button" key={brief.id} aria-current={openBrief?.id === brief.id || undefined} onClick={() => setBriefId(brief.id)}>{brief.date && key !== "exec" && mode !== "analysis" && <time>{brief.date}</time>}{brief.title.replace(/^Class [123]s*/, "")}</button>)}
              {key === "daily" && list.length > 3 && <button type="button" className="pf-intel-brief-more" onClick={() => setAllDaily(!allDaily)}>{allDaily ? "접기" : `이전 일일 브리핑 ${list.length - 3}개`}</button>}</div>)}</nav>
            {openBrief && <article className="pf-intel-brief"><BriefDocument key={openBrief.id} brief={openBrief} entity={entity} terms={terms} cast={briefCast(openBrief.body)} figure={briefFigure}/></article>}
          </> : <p className="pf-intel-none">이 자료 팩에는 브리핑이 없습니다.</p>}
        </div></>}
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
        {(current.kind === "company" || current.kind === "project") && <div className="pf-panel-identity"><CompanyMark item={current} size={44}/><div><b>{registryIndex.byItem.get(current.id) && <code className="pf-intel-code">{registryIndex.byItem.get(current.id)!.code}</code>}{registryIndex.byItem.get(current.id)?.name ?? companyName(current)}</b><small>{[current.profile?.industry, current.profile?.ticker, current.country].filter(Boolean).join(" · ")}</small></div><button type="button" onClick={() => { setPageId(current.id); setSelected(null); window.scrollTo({ top: 0 }); }}>기업 페이지 열기</button></div>}
        <h3>{display(current)}</h3>
        {current.titleKo && current.titleKo !== current.title && <p className="pf-intel-original" lang={current.lang}>{current.title}</p>}
        <ul className="pf-meta-chips" aria-label="원문 정보">{([["원문 날짜", current.date], ["발행", current.org], ["저자", current.authors], ["원문 언어", current.lang ? LANG_LABEL[current.lang] ?? current.lang : undefined], ["국가", current.country], ["자료 유형", current.sourceType ? SOURCE_TYPE_LABEL[current.sourceType] ?? current.sourceType : undefined]] as const).filter(([, value]) => value).map(([label, value]) => <li key={label}><small>{label}</small>{value}</li>)}</ul>
        {current.patent && <dl className="pf-intel-specs pf-intel-patent">{([["번호", current.patent.number], ["특허청", current.patent.office], ["상태", PATENT_STATUS_LABEL[current.patent.status]], ["출원인", current.patent.applicants.join(", ")], ["발명자", current.patent.inventors?.join(", ")], ["우선일", current.patent.priorityDate], ["출원일", current.patent.filingDate], ["공개일", current.patent.publicationDate], ["등록일", current.patent.grantDate], ["분류(CPC/IPC)", current.patent.cpc?.join(" · ")], ["패밀리", current.patent.family?.join(", ")]] as const).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}<div><dt>공보</dt><dd><a href={patentLink(current.patent.number)} target="_blank" rel="noreferrer noopener">Google Patents에서 열기</a></dd></div></dl>}
        {current.dossier && !current.article && <DossierView dossier={current.dossier} layout={focusDetail ? "page" : "panel"} library={{ has: id => docs.some(doc => doc.id === id && !doc.deletedAt), open: id => router.push(`/reader/${id}`) }} entity={entity} terms={terms} busy={fetching} onOpenPage={current.kind === "company" || current.kind === "project" ? () => { setPageId(current.id); setSelected(null); window.scrollTo({ top: 0 }); } : undefined} onPdf={source => void pdfToLibrary(source.pdfUrl!, source.title, source.pdfUrl!)}/>}

        <div className="pf-intel-buttons">
          {current.url && <a href={current.url} target="_blank" rel="noreferrer noopener"><ArrowUpRight size={15}/>원문 열기</a>}
          {site ? (pdfUrlOf(current) ? <a className="pf-intel-primary" href={inPaperflow(current)} target="_blank" rel="noopener" title="PAPERFLOW 계정으로 PDF를 번역하고 마킹·메모합니다"><BookOpenText size={15}/>PAPERFLOW에서 번역·마킹</a> : null)
            : docOf(current) ? <button type="button" className="pf-intel-primary" onClick={() => router.push(`/reader/${docOf(current)}`)}><BookOpenText size={15}/>리더에서 읽기·번역</button>
            : pdfUrlOf(current) ? <button type="button" className="pf-intel-primary" disabled={fetching === current.id} onClick={() => void toLibrary(current)}>{fetching === current.id ? <Loader2 size={15} className="pf-spin"/> : <BookOpenText size={15}/>}PDF 번역해서 읽기</button> : null}
          <button type="button" aria-pressed={Boolean(current.user?.star)} onClick={() => void intelRepository.setUser(current.id, { star: !current.user?.star })}><Star size={15}/>{current.user?.star ? "핵심" : "핵심 표시"}</button>
          <button type="button" onClick={() => void intelRepository.setUser(current.id, { hidden: !current.user?.hidden })}><EyeOff size={15}/>{current.user?.hidden ? "다시 보이기" : "숨기기"}</button>
        </div>
        {!site && <><label className="pf-intel-folderpick"><FolderOpen size={15}/><span>폴더</span>
          <select value={current.user?.folderId ?? ""} onChange={event => void intelRepository.setUser(current.id, { folderId: event.target.value || null })}>
            <option value="">폴더 없음</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          {!folders.length && <small>아카이브에서 폴더를 만들면 여기서 고를 수 있습니다.</small>}
        </label>
        {(() => {
          // A report the reader owns (a paid subscription PDF, say) lives in the library: link it here to read and translate it from the item.
          const linked = docOf(current), guess = !linked ? suggestDoc(current, docs, new Set((items ?? []).flatMap(entry => entry.id === current.id ? [] : [entry.libraryDoc, entry.user?.docId].filter((id): id is string => Boolean(id))))) : undefined;
          return <div className="pf-intel-doclink">
            {guess && <button type="button" onClick={() => linkDoc(current, guess.id)}><Library size={14}/><span>서재의 <b>{guess.title || guess.filename}</b> 이(가) 이 자료로 보입니다 — 연결</span></button>}
            <label><FileText size={15}/><span>서재 PDF</span>
              <select value={linked ?? ""} onChange={event => linkDoc(current, event.target.value || null)}>
                <option value="">{pdfUrlOf(current) ? "연결 안 함 (원문 PDF를 가져와 읽기)" : "연결 안 함"}</option>
                {docs.filter(doc => !doc.deletedAt).sort((a, b) => (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt)).map(doc => <option key={doc.id} value={doc.id}>{(doc.title || doc.filename).slice(0, 70)}</option>)}
              </select>
            </label>
          </div>;
        })()}</>}

        {current.article ? <ItemArticle item={current} entity={entity} terms={terms} figure={briefFigure}/> : <>
          {(current.cover || current.hasCover) && !current.dossier && <figure className="pf-article-figure" data-hero><CoverImage item={current} alt={display(current)}/></figure>}
          {current.summaryKo && <section><h4>요약</h4><p>{current.summaryKo}</p></section>}
        </>}
        {current.profile && <section><h4>{current.kind === "project" ? "프로젝트 정보" : "기업 정보"}</h4><dl className="pf-intel-specs">{Object.entries(current.profile).map(([key, value]) => <div key={key}><dt>{PROFILE_LABEL[key] ?? key}</dt><dd>{/^https?:\/\//.test(value) ? <a href={value} target="_blank" rel="noreferrer noopener">{value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a> : value}</dd></div>)}</dl></section>}
        {current.data?.length ? <section><h4>정량 데이터</h4><div className="pf-intel-table"><table><thead><tr><th>항목</th><th>값</th><th>기준</th><th>위치</th></tr></thead><tbody>
          {current.data.map((datum, index) => <tr key={index}><td>{datum.label}</td><td><b>{datum.value}</b>{datum.unit ? ` ${datum.unit}` : ""}</td><td>{datum.basis}</td><td>{datum.where}</td></tr>)}
        </tbody></table></div></section> : null}
        {current.equipment && <section><h4>장비 사양</h4><dl className="pf-intel-specs">{Object.entries(current.equipment).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></section>}
        {current.naysor && <section className="pf-intel-naysor"><h4>NAYSOR 적용성</h4><dl>{APPLICABILITY_LABEL.filter(([key]) => current.naysor?.[key]).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{current.naysor![key]}</dd></div>)}</dl></section>}
        {current.dossier && current.article && <details className="pf-intel-raw"><summary>케이스 파일 원자료 — 사실표 · 연혁 · 출처</summary><DossierView dossier={current.dossier} layout={focusDetail ? "page" : "panel"} library={{ has: id => docs.some(doc => doc.id === id && !doc.deletedAt), open: id => router.push(`/reader/${id}`) }} entity={entity} terms={terms} busy={fetching} onPdf={source => void pdfToLibrary(source.pdfUrl!, source.title, source.pdfUrl!)}/></details>}
        <div className="pf-intel-tail"><h4 className="pf-intel-tail-head">연결된 자료</h4>
        {(current.kind === "company" || current.kind === "project") && newsOf(current.id).length > 0 && <section><h4>최근 소식 · {newsOf(current.id).length}</h4><ol className="pf-intel-newslist">{newsOf(current.id).map(item => <li key={item.id}><button type="button" onClick={() => setSelected(item.id)}><time>{item.update!.date}</time><span className="pf-intel-update-type" data-type={item.update!.type}>{UPDATE_LABEL[item.update!.type]}</span><span>{item.update!.headline ?? display(item)}</span></button></li>)}</ol></section>}
        {mentions.length > 0 && <section><h4>{current.kind === "company" ? "이 기업이 나오는 프로젝트·자료" : "이 항목을 언급한 자료"} · {mentions.length}</h4><ul className="pf-intel-mentions">{mentions.map(item => <li key={item.id}><button type="button" onClick={() => setSelected(item.id)}><span>{KIND_LABEL[item.kind]}{item.stage ? ` · ${STAGE_LABEL[item.stage]}` : ""}</span>{display(item)}</button></li>)}</ul></section>}
        <SourceTree item={current} byId={byId} mentions={[]} onOpen={setSelected}/>
        </div>
        <FigureAdder key={current.id} item={current} notify={notify}/>
        <section><h4>내 메모</h4><textarea key={current.id} defaultValue={current.user?.note ?? ""} placeholder="판단, 다음 확인할 것, 연락처…" onBlur={event => { if (event.target.value !== (current.user?.note ?? "")) void intelRepository.setUser(current.id, { note: event.target.value.slice(0, 4000) }); }}/></section>
        </PanelMarks>
        <footer className="pf-intel-provenance">{[current.sourceType && `출처 유형 ${current.sourceType}`, current.checkedAt && `확인 ${current.checkedAt}`, current.pack && `팩 ${current.pack}`].filter(Boolean).join(" · ")}</footer>
      </motion.aside>}</AnimatePresence>)}
    </div>}
  </section>;
}
