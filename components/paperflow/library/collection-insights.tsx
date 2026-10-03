"use client";
import { GlassPanel } from "@/components/ui/glass-panel";
import { researchTerms } from "@/lib/paperflow/translation/research-style";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";
import type { Annotation } from "@/lib/paperflow/anchors/types";

function rank(values: string[]) { return [...values.reduce((map, item) => map.set(item, (map.get(item) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 6); }
export function CollectionInsights({ docs, annotations }: { docs: StoredDocument[]; annotations: Annotation[] }) {
  const authors = rank(docs.flatMap(d => d.authors ?? [])), journals = rank(docs.map(d => d.journal).filter((s): s is string => Boolean(s)));
  const topics = rank(docs.flatMap(d => d.keywords ?? researchTerms.filter(term => d.title.toLowerCase().includes(term.toLowerCase()))));
  const read = docs.reduce((sum, d) => sum + (d.visitedPages?.length ?? (d.lastOpenedAt ? 1 : 0)), 0);
  return <GlassPanel className="pf-insights"><h2>나의 연구 패턴</h2><div className="pf-insight-totals"><span><strong>{docs.length}</strong>논문</span><span><strong>{read}</strong>읽은 페이지</span><span><strong>{annotations.filter(a => a.type === "highlight").length}</strong>마킹</span><span><strong>{annotations.filter(a => a.type === "ink" || a.type === "note" || Boolean(a.note)).length}</strong>메모</span></div><div className="pf-insight-columns">{([["저자", authors], ["저널", journals], ["관심 키워드", topics]] as const).map(([label, items]) => <div key={label}><h3>{label}</h3>{items.length ? items.map(([name, count]) => <p key={name}>{name} <small>{count}편</small></p>) : <p className="pf-muted">논문 서지정보가 쌓이면 표시된다.</p>}</div>)}</div><p className="pf-muted">Hot은 최근 7일간 이 기기에서 연 횟수이다. 외부 논문 인기도를 뜻하지 않는다. JIF는 출처와 연도를 확인한 값만 표시한다.</p></GlassPanel>;
}
