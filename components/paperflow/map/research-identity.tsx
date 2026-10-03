"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { DocumentCover } from "../library/document-cover";
import { domainColor, type ResearchProfile } from "@/lib/paperflow/scholar/profile";
import { authorStats, sourceStats } from "@/lib/paperflow/scholar/enrich";
import type { ScholarAuthorStats, ScholarSourceStats } from "@/lib/paperflow/scholar/openalex";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";

const flag = (country?: string) => country && /^[A-Z]{2}$/.test(country) ? String.fromCodePoint(...[...country].map(char => 0x1f1e6 + char.charCodeAt(0) - 65)) : "";
const hue = (text: string) => [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7);
const initials = (name: string) => name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();

function AuthorPortrait({ name, orcid }: { name: string; orcid?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!orcid) return;
    let alive = true;
    void fetch(`/api/scholar/photo?orcid=${encodeURIComponent(orcid)}`).then(response => response.json()).then(body => { if (alive) setUrl(body.url ?? null); }).catch(() => undefined);
    return () => { alive = false; };
  }, [orcid]);
  return url ? <img className="pf-portrait" src={url} alt={`${name} (Wikimedia Commons)`} loading="lazy"/> : <span className="pf-portrait" style={{ background: `linear-gradient(135deg, hsl(${hue(name)} 70% 58%), hsl(${(hue(name) + 40) % 360} 70% 46%))` }} aria-hidden="true">{initials(name)}</span>;
}

/** Who and what this reader actually studies: fields, journals, authors, institutions, keywords, years. */
export function ResearchIdentity({ profile, docs }: { profile: ResearchProfile; docs: StoredDocument[] }) {
  const reduced = useReducedMotion();
  const [journals, setJournals] = useState<Map<string, ScholarSourceStats>>(new Map()), [authors, setAuthors] = useState<Map<string, ScholarAuthorStats>>(new Map());
  const topJournals = profile.journals.slice(0, 6), topAuthors = profile.authors.filter(author => /^A\d+/.test(author.id)).slice(0, 8);
  const journalKey = topJournals.map(item => item.id).join(","), authorKey = topAuthors.map(item => item.id).join(",");
  useEffect(() => { let alive = true; void sourceStats(journalKey ? journalKey.split(",") : []).then(items => { if (alive) setJournals(new Map(items.map(item => [item.id, item]))); }); return () => { alive = false; }; }, [journalKey]);
  useEffect(() => { let alive = true; void authorStats(authorKey ? authorKey.split(",") : []).then(items => { if (alive) setAuthors(new Map(items.map(item => [item.id, item]))); }); return () => { alive = false; }; }, [authorKey]);
  const fields = profile.topics.filter(topic => topic.level === "subfield").slice(0, 8), fieldMax = Math.max(1, ...fields.map(item => item.weight));
  const domains = profile.topics.filter(topic => topic.level === "domain"), domainTotal = domains.reduce((sum, item) => sum + item.weight, 0) || 1;
  const yearMax = Math.max(1, ...profile.years.map(item => item.count));
  const title = (id: string) => docs.find(doc => doc.id === id)?.title ?? "";
  const enter = (index: number) => reduced ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: index * .05, type: "spring" as const, stiffness: 260, damping: 26 } };

  return <div className="pf-identity">
    <motion.section className="pf-identity-card pf-identity-fields" {...enter(0)}>
      <header><h3>관심 분야</h3><small>읽은 정도로 가중한 분야 비중 · OpenAlex 분류</small></header>
      <div className="pf-domain-bar" role="img" aria-label="대분야 비중">{domains.map(domain => <i key={domain.id} style={{ width: `${domain.weight / domainTotal * 100}%`, background: domainColor(domain.id) }} title={`${domain.name} ${Math.round(domain.weight / domainTotal * 100)}%`}/>)}</div>
      <div className="pf-domain-legend">{domains.map(domain => <span key={domain.id}><i style={{ background: domainColor(domain.id) }}/>{domain.name} {Math.round(domain.weight / domainTotal * 100)}%</span>)}</div>
      <ol className="pf-field-bars">{fields.map(field => <li key={field.id}><span>{field.name}</span><b style={{ width: `${field.weight / fieldMax * 100}%`, background: domainColor(field.domain) }}/><small>{field.papers.length}편</small></li>)}</ol>
      {!fields.length && <p className="pf-identity-empty">‘연구 정보 분석’을 실행하면 분야가 채워진다.</p>}
    </motion.section>

    <motion.section className="pf-identity-card pf-identity-journals" {...enter(1)}>
      <header><h3>자주 읽는 저널</h3><small>표지: 그 저널에서 가장 깊이 읽은 내 논문의 첫 페이지</small></header>
      <div className="pf-journal-grid">{topJournals.map(journal => { const stats = journals.get(journal.id); return <Link key={journal.id} className="pf-journal" href={`/reader/${journal.coverDocumentId}`} title={title(journal.coverDocumentId)}>
        <span className="pf-journal-cover"><DocumentCover documentId={journal.coverDocumentId} title={journal.name}/></span>
        <span className="pf-journal-meta"><b>{journal.name}</b><small>{journal.publisher ?? stats?.publisher ?? ""}</small>
          <span className="pf-journal-stats"><em>{journal.papers.length}편</em>{stats?.meanCitedness2y ? <em title="OpenAlex 2년 평균 피인용 — JIF와 같은 방식의 공개 지표">2Y 인용 {stats.meanCitedness2y.toFixed(1)}</em> : null}{stats?.hIndex ? <em>h {stats.hIndex}</em> : null}</span></span>
      </Link>; })}</div>
      {!topJournals.length && <p className="pf-identity-empty">저널 정보가 아직 없다.</p>}
    </motion.section>

    <motion.section className="pf-identity-card pf-identity-authors" {...enter(2)}>
      <header><h3>자주 읽는 저자</h3><small>사진은 Wikidata에 공개된 경우만 · h-index는 OpenAlex</small></header>
      <ul className="pf-author-list">{topAuthors.map(author => { const stats = authors.get(author.id); return <li key={author.id}>
        <AuthorPortrait name={author.name} orcid={author.orcid ?? stats?.orcid}/>
        <span><b>{author.name}</b><small>{flag(stats?.institution?.country ?? author.country)} {stats?.institution?.name ?? author.institution ?? "소속 미확인"}</small>
          <span className="pf-author-stats"><em>내 서재 {author.papers.length}편</em>{author.firstAuthor ? <em>1저자 {author.firstAuthor}</em> : null}{stats?.hIndex ? <em>h-index {stats.hIndex}</em> : null}</span>
          {stats?.topics.length ? <small className="pf-author-topics">{stats.topics.slice(0, 3).join(" · ")}</small> : null}</span>
      </li>; })}</ul>
      {!topAuthors.length && <p className="pf-identity-empty">저자 정보가 아직 없다.</p>}
    </motion.section>

    <motion.section className="pf-identity-card pf-identity-side" {...enter(3)}>
      <header><h3>기관 · 키워드 · 연도</h3></header>
      <ul className="pf-institutions">{profile.institutions.slice(0, 6).map(item => <li key={item.id}><span>{flag(item.country)} {item.name}</span><small>{item.papers.length}편</small></li>)}</ul>
      <div className="pf-keyword-cloud">{profile.keywords.slice(0, 28).map(keyword => <span key={keyword.id} style={{ fontSize: `${11 + Math.min(9, keyword.papers.length * 1.6)}px` }}>{keyword.name}</span>)}</div>
      <div className="pf-years" role="img" aria-label="발표 연도 분포">{profile.years.map(item => <span key={item.year} title={`${item.year}: ${item.count}편`}><i style={{ height: `${item.count / yearMax * 100}%` }}/><small>{String(item.year).slice(2)}</small></span>)}</div>
    </motion.section>
  </div>;
}
