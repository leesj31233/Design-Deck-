"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Maximize2, Orbit, SlidersHorizontal, Sparkles, Target, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { ResearchIdentity } from "./research-identity";
import { WikiGraphCanvas, type MapTheme, type WikiGraphHandle } from "./wiki-graph-canvas";
import { researchProfile } from "@/lib/paperflow/scholar/profile";
import { fieldSummary, wikiGraph, type WikiOptions } from "@/lib/paperflow/map/wiki-graph";
import { DEFAULT_FORCES, type Arrange, type Forces } from "@/lib/paperflow/map/physics";
import { enrichLibrary } from "@/lib/paperflow/scholar/enrich";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";
import type { Annotation } from "@/lib/paperflow/anchors/types";
import "./research-map.css";

const KIND_LABEL = { field: "분야", subfield: "세부 분야", topic: "주제", paper: "논문", author: "저자", journal: "저널", unsorted: "분석 전" } as const;
type Prefs = { theme: MapTheme; arrange: Arrange; depth: WikiOptions["depth"]; papers: boolean; authors: boolean; journals: boolean; labels: "auto" | "all" | "fields"; hidden: string[]; forces: Forces; pool: boolean };
const DEFAULT_PREFS: Prefs = { theme: "paper", arrange: "free", depth: "subfield", papers: true, authors: false, journals: false, labels: "auto", hidden: [], forces: DEFAULT_FORCES, pool: true };
const KEY = "pf-map-prefs";

function Segmented<T extends string>({ value, items, onChange, label }: { value: T; items: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return <div className="pf-wm-seg" role="radiogroup" aria-label={label}>{items.map(item => <button type="button" key={item.value} role="radio" aria-checked={value === item.value} data-on={value === item.value || undefined} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}

/**
 * 연구맵: my research pool as a living wiki graph. The fields I read are the hubs, sized by how much
 * I actually read in them; papers are dots on their topics; fields read together are linked. The pool
 * panel lists every field with its share of my reading — focus one, hide one, or arrange the whole map.
 */
export function ResearchMapView({ docs, annotations }: { docs: StoredDocument[]; annotations: Annotation[] }) {
  const client = useQueryClient();
  // My whole research pool: the library and the archive alike (the trash is already left out).
  const library = docs;
  const profile = useMemo(() => researchProfile(library, annotations), [library, annotations]);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (saved) setPrefs({ ...DEFAULT_PREFS, ...saved, theme: "paper", forces: { ...DEFAULT_FORCES, ...saved.forces } }); } catch { /* defaults */ } }, []);
  const update = useCallback((patch: Partial<Prefs>) => setPrefs(current => { const next = { ...current, ...patch }; try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ } return next; }), []);
  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const graph = useMemo(() => wikiGraph(profile, library, { depth: prefs.depth, papers: prefs.papers, authors: prefs.authors, journals: prefs.journals, hidden }), [profile, library, prefs.depth, prefs.papers, prefs.authors, prefs.journals, hidden]);
  const fields = useMemo(() => fieldSummary(profile, library), [profile, library]);
  const [selected, setSelected] = useState<string | null>(null), [query, setQuery] = useState(""), [tuning, setTuning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const canvas = useRef<WikiGraphHandle>(null);
  const select = useCallback((id: string | null) => setSelected(id), []);
  const node = graph.nodes.find(item => item.id === selected);
  const papers = useMemo(() => {
    if (!node) return [];
    const ids = new Set(node.kind === "paper" ? node.papers : node.papers);
    return library.filter(doc => ids.has(doc.id)).sort((a, b) => (profile.engagement.get(b.id) ?? 0) - (profile.engagement.get(a.id) ?? 0));
  }, [node, library, profile]);
  const analyze = async () => {
    setProgress({ done: 0, total: 0 });
    await enrichLibrary((done, total) => setProgress({ done, total }));
    await client.invalidateQueries({ queryKey: ["documents"] });
    setProgress(null);
  };
  const missing = library.length - profile.totals.analyzed;
  const toggleField = (id: string) => update({ hidden: hidden.has(id) ? prefs.hidden.filter(item => item !== id) : [...prefs.hidden, id] });
  const solo = (id: string) => update({ hidden: fields.map(field => field.id).filter(item => item !== id) });
  const focusField = (id: string) => { if (hidden.has(id)) toggleField(id); setSelected(id); requestAnimationFrame(() => canvas.current?.flyTo(id)); };
  const topShare = Math.max(.01, ...fields.map(field => field.share));

  return <section className="pf-mapview">
    <div className="pf-mapview-head">
      <div className="pf-mapview-totals">
        <span><strong>{profile.totals.papers}</strong>논문</span><span><strong>{fields.filter(field => field.id !== "unsorted").length}</strong>분야</span>
        <span><strong>{profile.topics.filter(topic => topic.level === "topic").length}</strong>주제</span><span><strong>{profile.totals.pagesRead}</strong>읽은 페이지</span>
      </div>
      <div className="pf-mapview-actions">
        <SearchField aria-label="연구맵에서 찾기" placeholder="분야·주제·논문 찾기" value={query} onChange={event => setQuery(event.target.value)} onClear={() => setQuery("")}/>
        <Button size="sm" variant={missing ? "primary" : "ghost"} disabled={Boolean(progress)} onClick={() => void analyze()}><Sparkles size={14}/>{progress ? `분석 중 ${progress.done}/${progress.total || "…"}` : missing ? `연구 정보 분석 (${missing}편)` : "다시 분석"}</Button>
      </div>
    </div>
    <div className="pf-wm-stage" data-theme={prefs.theme}>
      {graph.nodes.length ? <WikiGraphCanvas ref={canvas} nodes={graph.nodes} edges={graph.edges} theme={prefs.theme} arrange={prefs.arrange} forces={prefs.forces} labels={prefs.labels} selected={selected} query={query} onSelect={select}/> : <div className="pf-mapview-empty">PDF를 가져오면 연구맵이 시작됩니다.</div>}

      {/* Research pool: every field I read, by share of my reading. */}
      <aside className="pf-wm-pool" data-open={prefs.pool || undefined}>
        <button type="button" className="pf-wm-pool-head" onClick={() => update({ pool: !prefs.pool })} aria-expanded={prefs.pool}><Orbit size={14}/>내 연구 풀<span>{fields.length}</span></button>
        {prefs.pool && <ol>{fields.map(field => <li key={field.id} data-hidden={hidden.has(field.id) || undefined} data-active={selected === field.id || undefined}>
          <button type="button" className="pf-wm-field" onClick={() => focusField(field.id)}>
            <i style={{ background: field.color }}/><span className="pf-wm-field-name">{field.name}</span><small>{field.papers}편</small>
            <span className="pf-wm-bar"><b style={{ width: `${Math.max(4, field.share / topShare * 100)}%`, background: field.color }}/></span>
          </button>
          <span className="pf-wm-field-tools">
            <button type="button" aria-label={`${field.name}만 보기`} title="이 분야만 보기" onClick={() => solo(field.id)}><Target size={13}/></button>
            <button type="button" aria-label={hidden.has(field.id) ? `${field.name} 보이기` : `${field.name} 숨기기`} title={hidden.has(field.id) ? "보이기" : "숨기기"} onClick={() => toggleField(field.id)}>{hidden.has(field.id) ? <EyeOff size={13}/> : <Eye size={13}/>}</button>
          </span>
        </li>)}</ol>}
        {prefs.pool && prefs.hidden.length > 0 && <button type="button" className="pf-wm-showall" onClick={() => update({ hidden: [] })}>모든 분야 보기</button>}
      </aside>

      {/* Controls: look, arrangement, depth, layers, physics. */}
      <div className="pf-wm-controls">
        <Segmented label="정렬" value={prefs.arrange} onChange={arrange => update({ arrange })} items={[{ value: "free", label: "자유" }, { value: "fields", label: "분야별" }, { value: "ring", label: "많이 읽은 순" }, { value: "years", label: "연도" }]}/>
        <Segmented label="깊이" value={prefs.depth} onChange={depth => update({ depth })} items={[{ value: "field", label: "분야" }, { value: "subfield", label: "세부" }, { value: "topic", label: "주제" }]}/>
        <div className="pf-wm-row">
          <label className="pf-wm-check"><input type="checkbox" checked={prefs.papers} onChange={event => update({ papers: event.target.checked })}/>논문 점</label>
          <label className="pf-wm-check"><input type="checkbox" checked={prefs.authors} onChange={event => update({ authors: event.target.checked })}/>저자</label>
          <label className="pf-wm-check"><input type="checkbox" checked={prefs.journals} onChange={event => update({ journals: event.target.checked })}/>저널</label>
          <button type="button" className="pf-wm-icon" aria-label="물리 설정" aria-pressed={tuning} onClick={() => setTuning(value => !value)}><SlidersHorizontal size={14}/></button>
          <button type="button" className="pf-wm-icon" aria-label="흔들어 다시 배치" onClick={() => canvas.current?.shake()}><Waves size={14}/></button>
          <button type="button" className="pf-wm-icon" aria-label="전체 보기" onClick={() => canvas.current?.fit()}><Maximize2 size={14}/></button>
        </div>
        {tuning && <div className="pf-wm-sliders">
          {([["repel", "반발력", .2, 3], ["linkDistance", "연결 거리", .4, 2.5], ["linkStrength", "연결 힘", .2, 2.5], ["gravity", "중심 인력", 0, 3]] as const).map(([key, label, min, max]) => <label key={key}><span>{label}</span><input type="range" min={min} max={max} step={.05} value={prefs.forces[key]} onChange={event => update({ forces: { ...prefs.forces, [key]: Number(event.target.value) } })}/></label>)}
          <label><span>라벨</span><select value={prefs.labels} onChange={event => update({ labels: event.target.value as Prefs["labels"] })}><option value="auto">확대할수록</option><option value="fields">분야만</option><option value="all">모두</option></select></label>
          <button type="button" className="pf-wm-showall" onClick={() => update({ forces: DEFAULT_FORCES })}>기본값</button>
        </div>}
      </div>

      <aside className="pf-map-inspector" data-open={Boolean(node) || undefined} aria-live="polite">
        {node && <>
          <span className="pf-kicker">{KIND_LABEL[node.kind]}</span>
          <h3>{node.label}</h3>
          <p className="pf-map-weight"><i style={{ background: node.color }}/>{node.kind === "paper" ? `학습 가중치 ${node.weight.toFixed(1)}` : `내 논문 ${papers.length}편 · 학습 가중치 ${node.weight.toFixed(1)}`}</p>
          {node.kind === "field" && <div className="pf-wm-inspect-actions"><Button size="sm" variant="ghost" onClick={() => solo(node.id)}><Target size={13}/>이 분야만 보기</Button><Button size="sm" variant="ghost" onClick={() => { toggleField(node.id); setSelected(null); }}><EyeOff size={13}/>숨기기</Button></div>}
          <ol className="pf-map-papers">{papers.slice(0, 14).map(doc => <li key={doc.id}><Link href={`/reader/${doc.id}`}>{doc.title.replace(/\.pdf$/i, "")}</Link><small>{[doc.scholar?.source?.name ?? doc.journal, doc.scholar?.year ?? doc.year].filter(Boolean).join(" · ")}</small></li>)}</ol>
          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>닫기</Button>
        </>}
      </aside>
      <p className="pf-wm-hint">드래그로 구를 옮기면 이웃이 따라오고 · 휠로 확대 · 빈 곳을 끌어 이동 · 구 크기 = 실제로 읽은 양</p>
    </div>
    <ResearchIdentity profile={profile} docs={library}/>
  </section>;
}
