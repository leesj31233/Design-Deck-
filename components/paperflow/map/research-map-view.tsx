"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { ResearchGraph } from "./research-graph";
import { ResearchIdentity } from "./research-identity";
import { researchGraph, researchProfile } from "@/lib/paperflow/scholar/profile";
import { enrichLibrary } from "@/lib/paperflow/scholar/enrich";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";
import type { Annotation } from "@/lib/paperflow/anchors/types";

const KIND_LABEL = { domain: "대분야", field: "분야", subfield: "세부 분야", topic: "주제", paper: "논문", author: "저자", journal: "저널" } as const;

/** 연구맵: the wiki-map of what this reader studies, with the identity cards below it. */
export function ResearchMapView({ docs, annotations }: { docs: StoredDocument[]; annotations: Annotation[] }) {
  const client = useQueryClient();
  const library = useMemo(() => docs.filter(doc => !doc.archived), [docs]);
  const profile = useMemo(() => researchProfile(library, annotations), [library, annotations]);
  const [layers, setLayers] = useState({ authors: true, journals: true });
  const graph = useMemo(() => researchGraph(profile, library, layers), [profile, library, layers]);
  const [selected, setSelected] = useState<string | null>(null), [query, setQuery] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const select = useCallback((id: string | null) => setSelected(id), []);
  const node = graph.nodes.find(item => item.id === selected);
  const papers = useMemo(() => {
    if (!selected) return [];
    if (selected.startsWith("paper:")) return library.filter(doc => `paper:${doc.id}` === selected);
    const ids = new Set(graph.edges.filter(edge => edge.source === selected || edge.target === selected).map(edge => edge.source === selected ? edge.target : edge.source).filter(id => id.startsWith("paper:")).map(id => id.slice(6)));
    const topic = profile.topics.find(item => item.id === selected);
    for (const id of topic?.papers ?? []) ids.add(id);
    return library.filter(doc => ids.has(doc.id)).sort((a, b) => (profile.engagement.get(b.id) ?? 0) - (profile.engagement.get(a.id) ?? 0));
  }, [selected, graph.edges, library, profile]);
  const analyze = async () => {
    setProgress({ done: 0, total: 0 });
    await enrichLibrary((done, total) => setProgress({ done, total }));
    await client.invalidateQueries({ queryKey: ["documents"] });
    setProgress(null);
  };
  const missing = library.length - profile.totals.analyzed;

  return <section className="pf-mapview">
    <div className="pf-mapview-head">
      <div className="pf-mapview-totals">
        <span><strong>{profile.totals.papers}</strong>논문</span><span><strong>{profile.topics.filter(topic => topic.level === "topic").length}</strong>주제</span>
        <span><strong>{profile.authors.length}</strong>저자</span><span><strong>{profile.journals.length}</strong>저널</span><span><strong>{profile.totals.pagesRead}</strong>읽은 페이지</span>
      </div>
      <div className="pf-mapview-actions">
        <SearchField aria-label="연구맵에서 찾기" placeholder="주제·저자·저널 찾기" value={query} onChange={event => setQuery(event.target.value)} onClear={() => setQuery("")}/>
        <label className="pf-layer"><input type="checkbox" checked={layers.authors} onChange={event => setLayers(value => ({ ...value, authors: event.target.checked }))}/>저자</label>
        <label className="pf-layer"><input type="checkbox" checked={layers.journals} onChange={event => setLayers(value => ({ ...value, journals: event.target.checked }))}/>저널</label>
        <Button size="sm" variant={missing ? "primary" : "ghost"} disabled={Boolean(progress)} onClick={() => void analyze()}><Sparkles size={14}/>{progress ? `분석 중 ${progress.done}/${progress.total || "…"}` : missing ? `연구 정보 분석 (${missing}편)` : "다시 분석"}</Button>
      </div>
    </div>
    <div className="pf-mapview-stage">
      {graph.nodes.length ? <ResearchGraph nodes={graph.nodes} edges={graph.edges} selected={selected} onSelect={select} query={query}/> : <div className="pf-mapview-empty">PDF를 가져오면 연구맵이 시작된다.</div>}
      <aside className="pf-map-inspector" data-open={Boolean(node) || undefined} aria-live="polite">
        {node ? <>
          <span className="pf-kicker">{KIND_LABEL[node.kind]}</span>
          <h3>{node.label}</h3>
          <p className="pf-map-weight"><i style={{ background: node.color }}/>관련 논문 {papers.length}편 · 학습 가중치 {node.weight.toFixed(1)}</p>
          <ol className="pf-map-papers">{papers.slice(0, 12).map(doc => <li key={doc.id}><Link href={`/reader/${doc.id}`}>{doc.title}</Link><small>{[doc.scholar?.source?.name ?? doc.journal, doc.scholar?.year ?? doc.year].filter(Boolean).join(" · ")}</small></li>)}</ol>
          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>닫기</Button>
        </> : <p className="pf-map-hint">구를 누르면 그 분야·저자·저널에 속한 내 논문이 보인다. 구의 크기는 실제로 읽은 양(페이지·마킹·메모)이다.</p>}
      </aside>
    </div>
    <ResearchIdentity profile={profile} docs={library}/>
  </section>;
}
