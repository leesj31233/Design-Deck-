"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ExternalLink, FileDown, EyeOff, Quote } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { researchProfile } from "@/lib/paperflow/scholar/profile";
import type { ScholarWork } from "@/lib/paperflow/scholar/openalex";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";
import type { Annotation } from "@/lib/paperflow/anchors/types";

type Card = ScholarWork & { abstract?: string; why: string };
interface Section { id: string; title: string; note: string; items: Card[] }
const HIDDEN_KEY = "paperflow-hidden-recommendations";
function hiddenIds(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]")); } catch { return new Set(); } }

/** Recommendations from the reader's own research profile (topics, authors, the works their library cites). */
export function DiscoverView({ docs, annotations }: { docs: StoredDocument[]; annotations: Annotation[] }) {
  const reduced = useReducedMotion();
  const library = useMemo(() => docs.filter(doc => !doc.archived), [docs]);
  const request = useMemo(() => {
    const profile = researchProfile(library, annotations);
    const cited = new Map<string, number>();
    for (const doc of library) for (const id of new Set(doc.scholar?.referencedIds ?? [])) cited.set(id, (cited.get(id) ?? 0) + 1);
    return {
      topics: profile.topics.filter(topic => topic.level === "topic").slice(0, 6).map(topic => topic.id),
      authors: profile.authors.filter(author => /^A\d+/.test(author.id)).slice(0, 10).map(author => author.id),
      fields: profile.topics.filter(topic => topic.level === "field").slice(0, 3).map(topic => topic.id),
      owned: library.map(doc => doc.scholar?.openalexId).filter(Boolean),
      cited: [...cited].filter(([, count]) => count > 1 || library.length < 4).map(([id, count]) => ({ id, count }))
    };
  }, [library, annotations]);
  const ready = request.topics.length > 0 || request.authors.length > 0;
  const recommendations = useQuery({
    queryKey: ["recommendations", request], enabled: ready, staleTime: 6 * 3600_000,
    queryFn: async () => { const response = await fetch("/api/scholar/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); if (!response.ok) throw new Error("추천을 불러오지 못했다."); return (await response.json()).sections as Section[]; }
  });
  const [tab, setTab] = useState("all"), [hidden, setHidden] = useState(hiddenIds);
  const hide = (id: string) => setHidden(current => { const next = new Set(current).add(id); try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next])); } catch { /* Hiding still works for this visit. */ } return next; });
  const sections = (recommendations.data ?? []).map(section => ({ ...section, items: section.items.filter(item => !hidden.has(item.openalexId)) })).filter(section => section.items.length);
  const shown = tab === "all" ? sections : sections.filter(section => section.id === tab);

  if (!ready) return <section className="pf-discover-empty"><h2>추천을 준비하려면 연구 정보가 필요하다</h2><p>연구맵에서 ‘연구 정보 분석’을 실행하면 관심 주제와 저자가 정리되고, 그에 맞는 논문을 추천한다.</p></section>;
  return <section className="pf-discover">
    <div className="pf-discover-head">
      <p>관심 주제 {request.topics.length}개 · 저자 {request.authors.length}명 · 내 서재가 인용한 문헌 {request.cited.length}편을 바탕으로 OpenAlex에서 고른 논문이다. 서재에 이미 있는 논문은 제외한다.</p>
      {sections.length > 1 && <SegmentedControl value={tab} onValueChange={setTab} items={[{ value: "all", label: "전체" }, ...sections.map(section => ({ value: section.id, label: section.title }))]}/>}
    </div>
    {recommendations.isPending && <div className="pf-discover-loading" role="status">{Array.from({ length: 6 }, (_, index) => <span key={index}/>)}</div>}
    {recommendations.error && <p role="alert" className="pf-error">{(recommendations.error as Error).message}</p>}
    {shown.map(section => <div key={section.id} className="pf-discover-section">
      <header><h3>{section.title}</h3><small>{section.note}</small></header>
      <div className="pf-discover-grid">{section.items.map((item, index) => <motion.article key={item.openalexId} className="pf-rec" initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * .03, type: "spring", stiffness: 280, damping: 28 }}>
        <span className="pf-rec-why">{item.why}</span>
        <h4>{item.title}</h4>
        <small className="pf-rec-meta">{[item.source?.name, item.year, item.authors.slice(0, 3).map(author => author.name).join(", ") + (item.authors.length > 3 ? " 외" : "")].filter(Boolean).join(" · ")}</small>
        {item.abstract && <p className="pf-rec-abstract">{item.abstract}</p>}
        <footer>
          <span className="pf-rec-cited"><Quote size={11}/>{item.citedBy.toLocaleString("ko-KR")} 인용{item.isOa && <em>Open Access</em>}</span>
          <span className="pf-rec-actions">
            {item.doi && <a href={`https://doi.org/${item.doi}`} target="_blank" rel="noreferrer noopener" aria-label="원문 페이지 열기"><ExternalLink size={13}/>원문</a>}
            {item.isOa && item.oaUrl && <a href={item.oaUrl} target="_blank" rel="noreferrer noopener" aria-label="오픈액세스 원문 받기"><FileDown size={13}/>OA</a>}
            <button type="button" onClick={() => hide(item.openalexId)} aria-label="이 추천 숨기기"><EyeOff size={13}/></button>
          </span>
        </footer>
      </motion.article>)}</div>
    </div>)}
    {recommendations.isSuccess && !sections.length && <p className="pf-discover-empty">지금은 추천할 새 논문이 없다. 논문이 더 쌓이면 다시 확인한다.</p>}
  </section>;
}
