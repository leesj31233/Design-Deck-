"use client";
import "./collection-insights.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { DocumentCover } from "./document-cover";
import { researchProfile } from "@/lib/paperflow/scholar/profile";
import { authorStats } from "@/lib/paperflow/scholar/enrich";
import { insightCards } from "@/lib/paperflow/library/insights";
import type { ScholarAuthorStats } from "@/lib/paperflow/scholar/openalex";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";
import type { Annotation } from "@/lib/paperflow/anchors/types";

const hue = (text: string) => [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7);
const initials = (name: string) => name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();

/** The author's portrait when Wikimedia Commons has one (looked up by ORCID), else their initials. */
function Portrait({ name, orcid }: { name: string; orcid?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!orcid) return;
    let alive = true;
    void fetch(`/api/scholar/photo?orcid=${encodeURIComponent(orcid)}`).then(response => response.json()).then(body => { if (alive) setUrl(body.url ?? null); }).catch(() => undefined);
    return () => { alive = false; };
  }, [orcid]);
  return url ? <img className="pf-pattern-portrait" src={url} alt={`${name} (Wikimedia Commons)`} loading="lazy" draggable={false}/> : <span className="pf-pattern-portrait" style={{ background: `linear-gradient(135deg, hsl(${hue(name)} 62% 52%), hsl(${(hue(name) + 40) % 360} 62% 40%))` }} aria-hidden="true">{initials(name)}</span>;
}

/**
 * A slowly drifting row of cards whose edges fade out. It pauses while hovered or focused, can be
 * dragged sideways, and stands still (but still drags) for readers who prefer reduced motion.
 */
function Marquee({ children, speed = 26 }: { children: ReactNode; speed?: number }) {
  const reduced = useReducedMotion();
  const track = useRef<HTMLDivElement>(null), offset = useRef(0), held = useRef(false), drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  useEffect(() => {
    let frame = 0, last = performance.now();
    const tick = (now: number) => {
      const node = track.current, half = node ? node.scrollWidth / 2 : 0, dt = Math.min(64, now - last) / 1000;
      last = now;
      if (node && half > 0) {
        if (!reduced && !held.current && !drag.current) offset.current += speed * dt;
        // Two copies of the cards side by side: wrapping by one copy's width is seamless.
        offset.current = ((offset.current % half) + half) % half;
        node.style.transform = `translate3d(${-offset.current}px,0,0)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, speed]);
  return <div className="pf-marquee" onPointerEnter={() => { held.current = true; }} onPointerLeave={() => { held.current = false; drag.current = null; }} onFocus={() => { held.current = true; }} onBlur={() => { held.current = false; }}
    onPointerDown={event => { if (event.button !== 0) return; drag.current = { x: event.clientX, start: offset.current, moved: false }; }}
    onPointerMove={event => { const state = drag.current; if (!state) return; const dx = event.clientX - state.x; if (Math.abs(dx) > 4 && !state.moved) { state.moved = true; event.currentTarget.setPointerCapture(event.pointerId); } if (state.moved) offset.current = state.start - dx; }}
    onPointerUp={event => { if (drag.current?.moved) event.currentTarget.releasePointerCapture(event.pointerId); setTimeout(() => { drag.current = null; }, 0); }}
    onClickCapture={event => { if (drag.current?.moved) { event.preventDefault(); event.stopPropagation(); } }}>
    <div className="pf-marquee-track" ref={track}>
      <div className="pf-marquee-set">{children}</div>
      <div className="pf-marquee-set" aria-hidden="true" inert>{children}</div>
    </div>
  </div>;
}

/** 나의 연구 패턴: who and what I read most, from the whole pool (library and archive). */
export function CollectionInsights({ docs, annotations }: { docs: StoredDocument[]; annotations: Annotation[] }) {
  const cards = useMemo(() => insightCards(researchProfile(docs, annotations), docs), [docs, annotations]);
  const [stats, setStats] = useState<ScholarAuthorStats | null>(null);
  const authorId = cards.author?.openAlex ? cards.author.id : "";
  useEffect(() => { let alive = true; setStats(null); if (authorId) void authorStats([authorId]).then(items => { if (alive) setStats(items[0] ?? null); }); return () => { alive = false; }; }, [authorId]);
  const { author, journals, keywords, totals } = cards;
  if (!docs.length) return null;

  return <section className="pf-pattern" aria-label="나의 연구 패턴">
    <header className="pf-pattern-head"><h2>나의 연구 패턴</h2><small>서재와 아카이브 전체 · 읽은 정도로 가중</small></header>
    <Marquee>
      {author && <article className="pf-pattern-card pf-pattern-author">
        <span className="pf-pattern-label">가장 많이 읽은 저자</span>
        <div className="pf-pattern-author-row"><Portrait name={author.name} orcid={author.orcid ?? stats?.orcid}/><span><b>{author.name}</b><small>{stats?.institution?.name ?? author.institution ?? "소속 미확인"}</small></span></div>
        <div className="pf-pattern-stats"><em><strong>{author.reads}</strong>회 읽음</em><em>내 서재 <strong>{author.papers.length}</strong>편</em>{stats?.hIndex ? <em>h-index <strong>{stats.hIndex}</strong></em> : null}{stats?.worksCount ? <em>논문 <strong>{stats.worksCount.toLocaleString("ko-KR")}</strong>편</em> : null}</div>
        {stats?.topics.length ? <div className="pf-pattern-fields"><span className="pf-pattern-label">권위 분야</span>{stats.topics.slice(0, 3).map(topic => <i key={topic}>{topic}</i>)}</div> : <small className="pf-pattern-muted">{author.openAlex ? "OpenAlex 정보를 불러오는 중…" : "‘연구 정보 분석’ 후 분야와 h-index가 표시됩니다."}</small>}
      </article>}
      {journals.map((journal, index) => <Link key={journal.id} className="pf-pattern-card pf-pattern-journal" href={`/reader/${journal.coverDocumentId}`} draggable={false}>
        <span className="pf-pattern-cover"><DocumentCover documentId={journal.coverDocumentId} title={journal.name}/></span>
        <span className="pf-pattern-journal-copy"><span className="pf-pattern-label">자주 읽는 저널 {index + 1}</span><b>{journal.name}</b><small>{journal.publisher ?? ""}</small><em>{journal.papers.length}편</em></span>
      </Link>)}
      {keywords.length > 0 && <article className="pf-pattern-card pf-pattern-keywords">
        <span className="pf-pattern-label">관심 키워드</span>
        <div className="pf-pattern-chips">{keywords.map(keyword => <i key={keyword.name} data-strong={keyword.papers > 2 || undefined}>{keyword.name}<small>{keyword.papers}</small></i>)}</div>
      </article>}
      <article className="pf-pattern-card pf-pattern-totals">
        <span className="pf-pattern-label">누적 기록</span>
        <dl><div><dt>논문</dt><dd>{totals.papers}</dd></div><div><dt>읽은 페이지</dt><dd>{totals.pagesRead}</dd></div><div><dt>마킹</dt><dd>{totals.highlights}</dd></div><div><dt>메모</dt><dd>{totals.notes}</dd></div></dl>
      </article>
    </Marquee>
  </section>;
}
