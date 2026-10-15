"use client";
import { ArrowLeft, ArrowUpRight, BookOpenText, Building2, Star } from "lucide-react";
import { intelRepository } from "@/lib/paperflow/intel/repository";
import { APPLICABILITY_LABEL, KIND_LABEL, PROFILE_LABEL, STAGE_LABEL, STATUS_LABEL, UPDATE_LABEL, type DossierEvent, type DossierFigure, type DossierSource, type IntelItem } from "@/lib/paperflow/intel/types";
import type { EntityRenderer, TermMarker } from "./markdown";
import { DossierView } from "./dossier-view";
import { SourceTree } from "./source-tree";
import { PanelMarks } from "./panel-marks";
import { FigureAdder } from "./figure-adder";
import { CardCover } from "./card-cover";

const display = (item: IntelItem) => item.titleKo || item.title;
/** The company's name without the descriptive tail ("X — 세척 EFB 펠릿 …"). */
export const companyName = (item: IntelItem) => (item.profile?.name ?? display(item)).split(/ [—–] /)[0].replace(/\(케이스 파일\)/, "").trim();

/** A company or project's identity mark: its logo when known, otherwise its initials on a tinted tile. */
export function CompanyMark({ item, size = 56 }: { item: IntelItem; size?: number }) {
  if (item.logo) return <span className="pf-company-mark" data-logo style={{ height: size, minWidth: size }}><img src={item.logo} alt=""/></span>;
  const name = companyName(item), latin = /^[A-Za-z0-9]/.test(name.replace(/^(PT|Maatschappij)\s+/i, "")), initials = latin && name.replace(/^(PT|Maatschappij)\s+/i, "").split(/[\s/·]+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return <span className="pf-company-mark" style={{ width: size, height: size }}>{initials ? initials : <Building2 size={size / 2.4}/>}</span>;
}

/**
 * A company (or project) as its own page — the archive the briefings point into: identity (logo,
 * profile, stock code, website), the case file laid out as a page (key facts, the documents' own
 * figures, timeline with every news item, conflicts, analysis, sources), the chain of references,
 * related items as visual cards, NAYSOR's reading of it, and the reader's own marks, memos and figures.
 */
export function CompanyPage({ item, read, news, related, byId, mentions, entity, terms, onOpen, onBack, onPdf, busy, notify }: {
  item: IntelItem; /** Read the item's PDF in the reader (the library copy, or the original brought in). */ read?: { label: string; run: () => void }; news: IntelItem[]; related: IntelItem[]; byId: Map<string, IntelItem>; mentions: IntelItem[];
  entity: EntityRenderer; terms: Omit<TermMarker, "seen">; onOpen: (id: string) => void; onBack: () => void; onPdf: (source: DossierSource) => void; busy?: string | null; notify: (message: string) => void;
}) {
  const extraTimeline: DossierEvent[] = news.map(entry => ({ date: entry.update!.date, event: `[${UPDATE_LABEL[entry.update!.type]}] ${entry.update!.headline ?? display(entry)}`, status: entry.status }));
  const extraFigures: DossierFigure[] = (item.user?.figures ?? []).map(figure => ({ src: figure.src, caption: `${figure.caption} (내가 추가)` }));
  const profile = Object.entries(item.profile ?? {}).filter(([key]) => !["name", "logo"].includes(key));
  return <article className="pf-company-page">
    <nav className="pf-company-back"><button type="button" onClick={onBack}><ArrowLeft size={15}/>인텔리전스로 돌아가기</button></nav>
    <header className="pf-company-hero">
      <CompanyMark item={item} size={72}/>
      <div>
        <p className="pf-company-kicker">{[KIND_LABEL[item.kind], item.stage ? STAGE_LABEL[item.stage] : null, item.status ? STATUS_LABEL[item.status] : null, item.profile?.ticker].filter(Boolean).join(" · ")}</p>
        <h2>{companyName(item)}</h2>
        <p className="pf-company-sub">{display(item)}</p>
        <div className="pf-company-actions">
          {item.profile?.website && /^https?:/.test(item.profile.website) && <a href={item.profile.website} target="_blank" rel="noreferrer noopener"><ArrowUpRight size={14}/>공식 웹사이트</a>}
          {read && <button type="button" className="pf-company-read" onClick={read.run}><BookOpenText size={14}/>{read.label}</button>}
          {item.url && <a href={item.url} target="_blank" rel="noreferrer noopener"><ArrowUpRight size={14}/>대표 원문</a>}
          <button type="button" aria-pressed={Boolean(item.user?.star)} onClick={() => void intelRepository.setUser(item.id, { star: !item.user?.star })}><Star size={14}/>{item.user?.star ? "핵심" : "핵심 표시"}</button>
        </div>
      </div>
    </header>
    <PanelMarks itemId={`page-${item.id}`}>
      {profile.length > 0 && <section className="pf-company-profile"><dl>{profile.map(([key, value]) => <div key={key}><dt>{PROFILE_LABEL[key] ?? key}</dt><dd>{/^https?:\/\//.test(value) ? <a href={value} target="_blank" rel="noreferrer noopener">{value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a> : value}</dd></div>)}</dl></section>}
      {item.dossier ? <DossierView dossier={item.dossier} entity={entity} terms={terms} onPdf={onPdf} busy={busy} layout="page" extraFigures={extraFigures} extraTimeline={extraTimeline}/>
        : <section className="pf-company-plain">
          {item.summaryKo && <p className="pf-company-summary">{item.summaryKo}</p>}
          {news.length > 0 && <><h3>소식</h3><ol className="pf-dossier-timeline">{extraTimeline.sort((a, b) => b.date.localeCompare(a.date)).map((event, index) => <li key={index}><time>{event.date}</time><span>{event.event}</span></li>)}</ol></>}
          <p className="pf-company-pending">아직 케이스 파일이 없습니다. 매일 수집 작업이 이 기업의 원 자료(공시·보고서·보도자료)와 그림으로 케이스 파일을 만들어 채웁니다.</p>
        </section>}
      {item.data?.length ? <section><h3>정량 데이터</h3><div className="pf-intel-table"><table><thead><tr><th>항목</th><th>값</th><th>기준</th><th>위치</th></tr></thead><tbody>{item.data.map((datum, index) => <tr key={index}><td>{datum.label}</td><td><b>{datum.value}</b>{datum.unit ? ` ${datum.unit}` : ""}</td><td>{datum.basis}</td><td>{datum.where}</td></tr>)}</tbody></table></div></section> : null}
      {item.naysor && <section className="pf-intel-naysor"><h3>NAYSOR 적용성</h3><dl>{APPLICABILITY_LABEL.filter(([key]) => item.naysor?.[key]).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{item.naysor![key]}</dd></div>)}</dl></section>}
      <SourceTree item={item} byId={byId} mentions={mentions} onOpen={onOpen}/>
      {related.length > 0 && <section><h3>관련 자료 · {related.length}</h3><ul className="pf-company-related">{related.map(entry => <li key={entry.id}><button type="button" onClick={() => onOpen(entry.id)}><CardCover item={entry}/><span><small>{KIND_LABEL[entry.kind]}{entry.date ? ` · ${entry.date}` : ""}</small><b>{display(entry)}</b></span></button></li>)}</ul></section>}
      <FigureAdder item={item} notify={notify}/>
    </PanelMarks>
  </article>;
}
