"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Button } from "@/components/ui/button";
import { researchTerms } from "@/lib/paperflow/translation/research-style";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";
import type { Annotation } from "@/lib/paperflow/anchors/types";

function rank(values: string[]) { return [...values.reduce((map, item) => map.set(item, (map.get(item) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 6); }
export function CollectionInsights({ docs, annotations }: { docs: StoredDocument[]; annotations: Annotation[] }) {
  const authors = rank(docs.flatMap(d => d.authors ?? [])), journals = rank(docs.map(d => d.journal).filter((s): s is string => Boolean(s)));
  const topics = rank(docs.flatMap(d => d.keywords ?? researchTerms.filter(term => d.title.toLowerCase().includes(term.toLowerCase()))));
  const read = docs.reduce((sum, d) => sum + (d.visitedPages?.length ?? (d.lastOpenedAt ? 1 : 0)), 0);
  return <GlassPanel className="pf-insights"><h2>나의 연구 패턴</h2><div className="pf-insight-totals"><span><strong>{docs.length}</strong>논문</span><span><strong>{read}</strong>읽은 페이지</span><span><strong>{annotations.filter(a => a.type === "highlight").length}</strong>마킹</span><span><strong>{annotations.filter(a => a.note).length}</strong>메모</span></div><div className="pf-insight-columns">{([["저자", authors], ["저널", journals], ["관심 키워드", topics]] as const).map(([label, items]) => <div key={label}><h3>{label}</h3>{items.length ? items.map(([name, count]) => <p key={name}>{name} <small>{count}편</small></p>) : <p className="pf-muted">논문 서지정보가 쌓이면 표시된다.</p>}</div>)}</div><p className="pf-muted">Hot은 최근 7일간 이 기기에서 연 횟수이다. 외부 논문 인기도를 뜻하지 않는다. JIF는 출처와 연도를 확인한 값만 표시한다.</p></GlassPanel>;
}
export function ResearchMap({ docs, annotations }: { docs: StoredDocument[]; annotations: Annotation[] }) {
  const [focus, setFocus] = useState<string | null>(null);
  const edges = useMemo(() => docs.flatMap((a, i) => docs.slice(i + 1).flatMap(b => {
    const shared = (a.keywords ?? []).filter(term => b.keywords?.includes(term));
    const commonAuthors = a.authors.filter(author => b.authors.includes(author));
    return shared.length || commonAuthors.length ? [{ a, b, reason: [...shared, ...commonAuthors].slice(0, 3).join(", ") }] : [];
  })), [docs]);
  const shown = focus ? docs.filter(d => d.id === focus || edges.some(e => (e.a.id === focus && e.b.id === d.id) || (e.b.id === focus && e.a.id === d.id))) : docs;
  const positions = new Map(shown.map((d, i) => [d.id, { x: 50 + 38 * Math.cos(2 * Math.PI * i / shown.length - Math.PI / 2), y: 50 + 36 * Math.sin(2 * Math.PI * i / shown.length - Math.PI / 2) }]));
  const visibleEdges = edges.filter(e => positions.has(e.a.id) && positions.has(e.b.id));
  return <section className="pf-research-map"><GlassPanel><h2>내 논문의 연결</h2><p>논문을 누르면 공유 키워드와 저자로 연결된 이웃을 볼 수 있다. 연결선을 누르면 근거가 표시된다.</p><Button size="sm" variant="ghost" onClick={() => setFocus(null)}>전체 보기</Button><div className="pf-wiki-map" role="img" aria-label={`${shown.length}편의 논문과 ${visibleEdges.length}개의 연결선`}><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{visibleEdges.map(e => { const a = positions.get(e.a.id)!, b = positions.get(e.b.id)!; return <line key={e.a.id + e.b.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>; })}</svg>{shown.map(d => { const point = positions.get(d.id)!; return <button key={d.id} className="pf-wiki-node" style={{ left: `${point.x}%`, top: `${point.y}%` }} aria-pressed={focus === d.id} onClick={() => setFocus(d.id)} title={d.title}>{d.title.slice(0, 53)}{d.title.length > 53 ? "…" : ""}</button>; })}</div><div className="pf-map-links">{visibleEdges.filter(e => !focus || e.a.id === focus || e.b.id === focus).map(e => <p className="pf-map-edge" key={e.a.id + e.b.id}><span>{e.a.title}</span> ↔ <span>{e.b.title}</span><small>공유: {e.reason}</small></p>)}</div>{docs.length === 0 && <p>PDF를 가져오면 연구맵이 시작된다.</p>}{docs.length > 0 && edges.length === 0 && <p>공통 키워드 또는 저자를 가진 논문이 아직 없다.</p>}</GlassPanel>{focus && <Link href={`/reader/${focus}`}>선택한 논문 읽기 →</Link>}</section>;
}
