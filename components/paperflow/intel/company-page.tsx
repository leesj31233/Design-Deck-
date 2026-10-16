"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowUpRight, BookOpenText, Building2, Star } from "lucide-react";
import { intelRepository } from "@/lib/paperflow/intel/repository";
import { KIND_LABEL, PROFILE_LABEL, RELIABILITY_LABEL, STAGE_LABEL, STATUS_LABEL, UPDATE_LABEL, type DossierEvent, type DossierFigure, type DossierSource, type IntelItem } from "@/lib/paperflow/intel/types";
import { Markdown, type EntityRenderer, type TermMarker } from "./markdown";
import { CompactTimeline, Lightbox, SourceChip, pdfOf, siteOf } from "./dossier-parts";
import { SourceTree } from "./source-tree";
import { PanelMarks } from "./panel-marks";
import { FigureAdder } from "./figure-adder";
import { CardCover } from "./card-cover";
import "./company-document.css";

const display = (item: IntelItem) => item.titleKo || item.title;
/** The company's name without the descriptive tail ("X — 세척 EFB 펠릿 …"). */
export const companyName = (item: IntelItem) => (item.profile?.name ?? display(item)).split(/ [—–] /)[0].replace(/\(케이스 파일\)/, "").trim();
/** The descriptive tail of the title, when there is one. */
const tagline = (item: IntelItem) => { const parts = display(item).split(/ [—–] /); return parts.length > 1 ? parts.slice(1).join(" — ").replace(/\(케이스 파일\)/, "").trim() : ""; };

/** A company or project's identity mark: its logo when known, otherwise its initials on a tinted tile. */
export function CompanyMark({ item, size = 56 }: { item: IntelItem; size?: number }) {
  if (item.logo) return <span className="pf-company-mark" data-logo data-dark={item.logoDark || undefined} style={{ height: size, minWidth: size }}><img src={item.logo} alt=""/></span>;
  const name = companyName(item), latin = /^[A-Za-z0-9]/.test(name.replace(/^(PT|Maatschappij)\s+/i, "")), initials = latin && name.replace(/^(PT|Maatschappij)\s+/i, "").split(/[\s/·]+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return <span className="pf-company-mark" style={{ width: size, height: size }}>{initials ? initials : <Building2 size={size / 2.4}/>}</span>;
}

/** Analysis addressed to NAYSOR is kept out of a company's own page: the page states what is known about the company. */
const isOpinion = (title: string) => /NAYSOR|나이소르|시사점|해야 할 일/.test(title);
const STATUS_SHORT: Record<string, string> = { verified: "확인됨", claimed: "회사 발표", estimate: "추정", unverified: "미확인" };
const PROFILE_ORDER = ["parent", "hq", "country", "founded", "ticker", "size", "industry", "role", "capacity", "status", "projects", "products"];

/**
 * A company, project or vendor as a research document: who it is first (name, country, business,
 * parent, listing, verification date), then the key numbers, the case file's figures at a readable
 * size, what the documents establish section by section, the data tables, where sources disagree,
 * and the numbered sources. The history sits in a column on the right (a fold on phones). Every
 * statement keeps its source number; the card shows the source on hover.
 */
export function CompanyPage({ item, read, library, news, related, byId, mentions, entity, terms, onOpen, onBack, onPdf, busy, notify }: {
  item: IntelItem; read?: { label: string; run: () => void }; library?: { has: (id: string) => boolean; open: (id: string) => void }; news: IntelItem[]; related: IntelItem[]; byId: Map<string, IntelItem>; mentions: IntelItem[];
  entity: EntityRenderer; terms: Omit<TermMarker, "seen">; onOpen: (id: string) => void; onBack: () => void; onPdf: (source: DossierSource) => void; busy?: string | null; notify: (message: string) => void;
}) {
  const dossier = item.dossier;
  const sources = useMemo(() => new Map((dossier?.sources ?? []).map(source => [source.ref, source])), [dossier]);
  const cite = (ref?: string) => ref ? <SourceChip refs={ref.split(/\s*,\s*/)} sources={sources}/> : null;
  const citeMany = (refs: string[], key: number) => <SourceChip key={key} refs={refs} sources={sources}/>;
  const [figureAt, setFigureAt] = useState<number | null>(null), [lead, setLead] = useState(0);

  const newsEvents: DossierEvent[] = news.map(entry => ({ date: entry.update!.date, event: `[${UPDATE_LABEL[entry.update!.type]}] ${entry.update!.headline ?? display(entry)}`, status: entry.status }));
  const events = [...(dossier?.timeline ?? []), ...newsEvents];
  const figures: DossierFigure[] = [...(dossier?.figures ?? []), ...(item.user?.figures ?? []).map(figure => ({ src: figure.src, caption: `${figure.caption} (내가 추가)` }))];
  const sections = (dossier?.sections ?? []).filter(section => !isOpinion(section.title));
  const [overview, ...rest] = sections;
  const profile = PROFILE_ORDER.flatMap(key => item.profile?.[key] ? [[key, item.profile[key]] as const] : []);
  const kpis = (item.data ?? []).slice(0, 5);
  const checked = dossier?.asOf ?? item.checkedAt;
  const kicker = [item.country, item.profile?.industry, KIND_LABEL[item.kind], item.stage ? STAGE_LABEL[item.stage] : null].filter(Boolean).join(" · ");
  let number = 0;
  const heading = (title: string) => <h2 className="pf-cdoc-h"><span>{String(++number).padStart(2, "0")}</span>{title}</h2>;

  const timeline = events.length ? <CompactTimeline events={events} cite={cite}/> : <p className="pf-cdoc-none">기록된 사건이 없습니다.</p>;
  const link = (value: string) => /^https?:\/\//.test(value) ? <a href={value} target="_blank" rel="noreferrer noopener">{value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a> : value;

  return <article className="pf-cdoc">
    <nav className="pf-company-back"><button type="button" onClick={onBack}><ArrowLeft size={15}/>인텔리전스로 돌아가기</button></nav>
    <header className="pf-cdoc-head">
      <div className="pf-cdoc-id">
        <p className="pf-cdoc-kicker">{kicker}</p>
        <h1>{companyName(item)}</h1>
        {tagline(item) && <p className="pf-cdoc-tagline">{tagline(item)}</p>}
        {profile.length > 0 && <dl className="pf-cdoc-profile">{profile.filter(([key]) => key !== "website").map(([key, value]) => <div key={key} data-long={value.length > 70 || undefined}><dt>{PROFILE_LABEL[key] ?? key}</dt><dd>{link(value)}</dd></div>)}</dl>}
        <div className="pf-cdoc-actions">
          {item.profile?.website && /^https?:/.test(item.profile.website) && <a href={item.profile.website} target="_blank" rel="noreferrer noopener"><ArrowUpRight size={14}/>{siteOf(item.profile.website)}</a>}
          {read && <button type="button" className="pf-company-read" onClick={read.run}><BookOpenText size={14}/>{read.label}</button>}
          {item.url && <a href={item.url} target="_blank" rel="noreferrer noopener"><ArrowUpRight size={14}/>대표 원문</a>}
          <button type="button" aria-pressed={Boolean(item.user?.star)} onClick={() => void intelRepository.setUser(item.id, { star: !item.user?.star })}><Star size={14}/>{item.user?.star ? "핵심" : "핵심 표시"}</button>
          {checked && <span className="pf-cdoc-checked">자료 확인 {checked}</span>}
        </div>
      </div>
      <div className="pf-cdoc-logo" data-dark={item.logoDark || undefined}>{item.logo ? <img src={item.logo} alt={`${companyName(item)} 로고`}/> : <CompanyMark item={item} size={64}/>}</div>
    </header>

    <div className="pf-cdoc-body">
      <PanelMarks itemId={`page-${item.id}`}>
        <div className="pf-cdoc-main">
          {dossier ? <>
            <section>
              {heading("개요")}
              <p className="pf-cdoc-lede">{dossier.headline}</p>
              {overview && <Markdown source={overview.body} entity={entity} terms={terms} cite={citeMany}/>}
              {kpis.length > 0 && <ul className="pf-cdoc-kpis">{kpis.map((datum, index) => <li key={index}><small>{datum.label}</small><b>{datum.value}{datum.unit && <i> {datum.unit}</i>}</b>{datum.basis && <span>{datum.basis}</span>}</li>)}</ul>}
              {dossier.facts?.length ? <table className="pf-cdoc-facts"><tbody>{dossier.facts.map((fact, index) => <tr key={index}><th scope="row">{fact.label}</th><td>{fact.value}{cite(fact.ref)}</td><td>{fact.status && <span data-status={fact.status}>{STATUS_SHORT[fact.status]}</span>}</td></tr>)}</tbody></table> : null}
            </section>

            {figures.length > 0 && <section className="pf-cdoc-figures">
              {heading("원 자료의 그림·사진")}
              <figure className="pf-cdoc-lead"><button type="button" onClick={() => setFigureAt(lead)} aria-label="그림 크게 보기"><img src={figures[lead].src} alt={figures[lead].caption}/></button>
                <figcaption>{figures[lead].caption}{figures[lead].where && <small> · {figures[lead].where}</small>}{cite(figures[lead].ref)}</figcaption></figure>
              {figures.length > 1 && <ul className="pf-cdoc-thumbs">{figures.map((figure, index) => <li key={index}><button type="button" aria-pressed={index === lead} onClick={() => setLead(index)} title={figure.caption}><img src={figure.src} alt="" loading="lazy" decoding="async"/></button><span>{figure.caption}</span></li>)}</ul>}
            </section>}

            {rest.map((section, index) => <section key={index}>{heading(section.title)}<Markdown source={section.body} entity={entity} terms={terms} cite={citeMany}/></section>)}

            {item.data?.length ? <section>{heading("제품·성능 데이터")}<div className="pf-intel-table"><table><thead><tr><th>항목</th><th>값</th><th>기준</th><th>출처 위치</th></tr></thead><tbody>{item.data.map((datum, index) => <tr key={index}><td>{datum.label}</td><td><b>{datum.value}</b>{datum.unit ? ` ${datum.unit}` : ""}</td><td>{datum.basis}</td><td>{datum.where}</td></tr>)}</tbody></table></div></section> : null}
            {item.equipment && Object.keys(item.equipment).length > 0 && <section>{heading("설비 사양")}<div className="pf-intel-table"><table><tbody>{Object.entries(item.equipment).map(([key, value]) => <tr key={key}><th scope="row">{key}</th><td>{value}</td></tr>)}</tbody></table></div></section>}

            {dossier.conflicts?.length ? <section className="pf-cdoc-conflicts">{heading("자료 간 불일치")}
              {dossier.conflicts.map((conflict, index) => <div key={index}><h3>{conflict.topic}</h3><ul>{conflict.versions.map((version, inner) => <li key={inner}>{version.value}{cite(version.ref)}</li>)}</ul>{conflict.judgement && <p><AlertTriangle size={13}/>{conflict.judgement}</p>}</div>)}
            </section> : null}

            {dossier.sources?.length ? <section className="pf-cdoc-sources">{heading(`출처 (${dossier.sources.length})`)}
              <ol>{dossier.sources.map(source => <li key={source.ref} id={`dossier-src-${source.ref}`}>
                <span className="pf-cdoc-ref">[{source.ref}]</span>
                <div>
                  {source.url ? <a href={source.url} target="_blank" rel="noreferrer noopener">{source.title}</a> : <b>{source.title}</b>}
                  <small>{[source.org, source.date, source.where, source.reliability ? `R${source.reliability} ${RELIABILITY_LABEL[source.reliability] ?? ""}` : null].filter(Boolean).join(" · ")}</small>
                  {(source.libraryDoc && library?.has(source.libraryDoc)) ? <button type="button" className="pf-cdoc-read" onClick={() => library.open(source.libraryDoc!)}><BookOpenText size={12}/>리더에서 보기·번역</button>
                    : pdfOf(source) ? <button type="button" className="pf-cdoc-read" disabled={busy === pdfOf(source)} onClick={() => onPdf({ ...source, pdfUrl: pdfOf(source) })}><BookOpenText size={12}/>{busy === pdfOf(source) ? "가져오는 중…" : "PDF 번역해서 읽기"}</button> : null}
                </div>
              </li>)}</ol>
            </section> : null}
          </> : <section>
            {heading("개요")}
            {item.summaryKo && <p className="pf-cdoc-lede">{item.summaryKo}</p>}
            {item.status && <p className="pf-cdoc-none">상태: {STATUS_LABEL[item.status]}</p>}
            <p className="pf-cdoc-none">아직 케이스 파일이 없습니다. 매일 수집 작업이 이 기업의 원 자료(공시·보고서·보도자료)와 그림으로 케이스 파일을 만들어 채웁니다.</p>
          </section>}

          <details className="pf-cdoc-fold"><summary>연혁 · {events.length}</summary>{timeline}</details>
          <SourceTree item={item} byId={byId} mentions={mentions} onOpen={onOpen}/>
          {related.length > 0 && <section>{heading(`관련 자료 (${related.length})`)}<ul className="pf-company-related">{related.map(entry => <li key={entry.id}><button type="button" onClick={() => onOpen(entry.id)}><CardCover item={entry}/><span><small>{KIND_LABEL[entry.kind]}{entry.date ? ` · ${entry.date}` : ""}</small><b>{display(entry)}</b></span></button></li>)}</ul></section>}
          <FigureAdder item={item} notify={notify}/>
        </div>
      </PanelMarks>
      <aside className="pf-cdoc-rail" aria-label="연혁"><h2 className="pf-cdoc-h"><span>연혁</span>{events.length}건</h2>{timeline}</aside>
    </div>
    <Lightbox figure={figureAt !== null ? figures[figureAt] ?? null : null} source={figureAt !== null && figures[figureAt]?.ref ? sources.get(figures[figureAt].ref!) : undefined} onClose={() => setFigureAt(null)}/>
  </article>;
}
