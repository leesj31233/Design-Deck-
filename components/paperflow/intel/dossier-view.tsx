"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowUpRight, BookOpenText, FileSearch, Maximize2, X } from "lucide-react";
import { RELIABILITY_LABEL, STATUS_LABEL, type DossierEvent, type DossierFigure, type DossierSource, type IntelDossier } from "@/lib/paperflow/intel/types";
import { Markdown, type EntityRenderer, type TermMarker } from "./markdown";
import "./dossier.css";
/** A source's PDF: its pdfUrl, or its own URL when that is a PDF. */
const pdfOf = (source: DossierSource) => source.pdfUrl ?? (source.url && /\.pdf($|[?#])/i.test(source.url) ? source.url : undefined);

/**
 * A case file: one case taken apart from its primary documents. The first page shows what matters
 * for a decision — the headline, key facts with their sources, the documents' own figures (process
 * flow, map, site photos), the timeline and where sources disagree — then the analysis and the
 * source list. Opens wide for reading; a figure opens full size.
 */
export function DossierView({ dossier, entity, terms, onPdf, busy, layout = "panel", onOpenPage, extraFigures, extraTimeline, library }: { dossier: IntelDossier; entity: EntityRenderer; terms: Omit<TermMarker, "seen">; onPdf: (source: DossierSource) => void; busy?: string | null;
  /** "page": laid out as a page (the company page); "panel": compact, with a button to the page. */
  layout?: "panel" | "page"; onOpenPage?: () => void; extraFigures?: DossierFigure[]; extraTimeline?: DossierEvent[];
  /** The library: a source whose PDF is already there opens straight in the reader. */
  library?: { has: (id: string) => boolean; open: (id: string) => void } }) {
  const [wide, setWide] = useState(false), [figure, setFigure] = useState<number | null>(null), [lead, setLead] = useState(0);
  useEffect(() => { if (!wide && figure === null) return; const key = (event: KeyboardEvent) => { if (event.key === "Escape") { if (figure !== null) setFigure(null); else setWide(false); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [wide, figure]);
  const sources = new Map((dossier.sources ?? []).map(source => [source.ref, source]));
  const cite = (ref?: string) => ref ? <SourceChip refs={ref.split(/\s*,\s*/)} sources={sources}/> : null;
  const citeMany = (refs: string[], key: number) => <SourceChip key={key} refs={refs} sources={sources}/>;
  const figures = [...(dossier.figures ?? []), ...(extraFigures ?? [])];
  const events = [...(dossier.timeline ?? []), ...(extraTimeline ?? [])].sort((a, b) => a.date.localeCompare(b.date));

  const facts = dossier.facts?.length ? <div className="pf-dossier-facts">{dossier.facts.map((fact, index) => <div key={index} data-status={fact.status}><dt>{fact.label}</dt><dd>{fact.value}{cite(fact.ref)}</dd></div>)}</div> : null;
  const gallery = figures.length ? <div className="pf-dossier-figures">
    <figure className="pf-dossier-lead"><button type="button" onClick={() => setFigure(lead)} aria-label="그림 크게 보기"><img src={figures[lead].src} alt={figures[lead].caption}/></button><figcaption>{figures[lead].caption}{figures[lead].where && <small> · {figures[lead].where}</small>}{cite(figures[lead].ref)}</figcaption></figure>
    {figures.length > 1 && <div className="pf-dossier-thumbs">{figures.map((item, index) => <button key={index} type="button" aria-pressed={index === lead} onClick={() => setLead(index)} title={item.caption}><img src={item.src} alt="" loading="lazy"/></button>)}</div>}
  </div> : null;
  const timeline = events.length ? <section><h5>타임라인</h5><ol className="pf-dossier-timeline">{events.map((event, index) => <li key={index} data-status={event.status}><time>{event.date}</time><span>{event.event}{cite(event.ref)}</span></li>)}</ol></section> : null;
  const conflicts = dossier.conflicts?.length ? <section className="pf-dossier-conflicts"><h5><AlertTriangle size={14}/>자료 간 불일치</h5>{dossier.conflicts.map((conflict, index) => <div key={index}><b>{conflict.topic}</b><ul>{conflict.versions.map((version, inner) => <li key={inner}>{version.value}{cite(version.ref)}</li>)}</ul>{conflict.judgement && <p>{conflict.judgement}</p>}</div>)}</section> : null;
  const sections = dossier.sections?.map((section, index) => <section key={index} className="pf-dossier-section"><h5>{section.title}</h5><Markdown source={section.body} entity={entity} terms={terms} cite={citeMany}/></section>);
  const sourceList = dossier.sources?.length ? <section><h5>출처 ({dossier.sources.length})</h5><ol className="pf-dossier-sources">{dossier.sources.map(source => <li key={source.ref} id={`dossier-src-${source.ref}`}>
    <span className="pf-dossier-ref">[{source.ref}]</span>
    <div><strong>{source.title}</strong><small>{[source.org, source.date, source.where, source.reliability ? `R${source.reliability} ${RELIABILITY_LABEL[source.reliability] ?? ""}` : null].filter(Boolean).join(" · ")}</small>
      <span className="pf-dossier-links">{source.url && <a href={source.url} target="_blank" rel="noreferrer noopener"><ArrowUpRight size={13}/>원문</a>}{source.libraryDoc && library?.has(source.libraryDoc) ? <button type="button" className="pf-dossier-read" onClick={() => library.open(source.libraryDoc!)}><BookOpenText size={13}/>리더에서 보기·번역</button> : pdfOf(source) && <button type="button" disabled={busy === pdfOf(source)} onClick={() => onPdf({ ...source, pdfUrl: pdfOf(source) })}><BookOpenText size={13}/>{busy === pdfOf(source) ? "가져오는 중…" : "PDF 번역해서 읽기"}</button>}</span></div>
  </li>)}</ol></section> : null;

  const head = <header className="pf-dossier-head"><p><FileSearch size={13}/>케이스 파일{dossier.asOf ? ` · ${dossier.asOf} 기준` : ""}</p><h4>{dossier.headline}</h4></header>;
  const lightbox = figure !== null && figures[figure] && createPortal(<div className="pf-dossier-lightbox" role="dialog" aria-label={figures[figure].caption} onClick={() => setFigure(null)}>
    <button type="button" className="pf-dossier-close" aria-label="닫기"><X size={20}/></button>
    <figure onClick={event => event.stopPropagation()}><img src={figures[figure].src} alt={figures[figure].caption}/><figcaption>{figures[figure].caption}{figures[figure].where && ` · ${figures[figure].where}`}{figures[figure].ref && sources.get(figures[figure].ref!) ? ` — ${sources.get(figures[figure].ref!)!.title}` : ""}</figcaption></figure>
  </div>, document.body);

  if (layout === "page") return <>
    <div className="pf-dossier-page pf-dossier-inline">
      {head}
      <div className="pf-dossier-front"><div>{facts}{conflicts}</div><div>{gallery}</div></div>
      <div className="pf-dossier-body"><div>{sections}</div><aside>{timeline}{sourceList}</aside></div>
    </div>
    {lightbox}
  </>;
  return <>
    <div className="pf-dossier">
      {gallery}
      {head}
      <button type="button" className="pf-dossier-wide" onClick={() => onOpenPage ? onOpenPage() : setWide(true)}><Maximize2 size={14}/>{onOpenPage ? "기업 페이지로 크게 보기" : "케이스 파일 크게 보기"}</button>
      {facts}{sections}{conflicts}{timeline}{sourceList}
    </div>
    {wide && createPortal(<div className="pf-intel pf-dossier-sheet" role="dialog" aria-label={dossier.headline}>
      <div className="pf-dossier-page">
        <button type="button" className="pf-dossier-close" aria-label="닫기 (Esc)" onClick={() => setWide(false)}><X size={20}/></button>
        {head}
        <div className="pf-dossier-front"><div>{facts}{conflicts}</div><div>{gallery}</div></div>
        <div className="pf-dossier-body"><div>{sections}</div><aside>{timeline}{sourceList}</aside></div>
      </div>
    </div>, document.body)}
    {lightbox}
  </>;
}

/** host name of a URL, without www. */
const site = (url?: string) => { if (!url) return undefined; try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; } };

/**
 * A citation as a chip: the first source's publisher (or site) and "+n" for the rest, like a
 * footnote you can read in place — hover or focus shows each source with a link to the original.
 */
function SourceChip({ refs, sources }: { refs: string[]; sources: Map<string, DossierSource> }) {
  const found = refs.map(ref => sources.get(ref)).filter((source): source is DossierSource => Boolean(source));
  if (!found.length) return <span className="pf-cite" data-missing>[{refs.join(", ")}]</span>;
  const first = found[0], label = (site(first.url) || first.org?.split(/[\/(—,]/)[0].trim() || first.title).slice(0, 24);
  return <span className="pf-cite-wrap" tabIndex={0}>
    <a className="pf-cite" href={first.url ?? `#dossier-src-${first.ref}`} target={first.url ? "_blank" : undefined} rel="noreferrer noopener">{label}{found.length > 1 && <i>+{found.length - 1}</i>}</a>
    <span className="pf-cite-card" role="tooltip">{found.map(source => <span key={source.ref}>
      <small>[{source.ref}] {[site(source.url) ?? source.org, source.date].filter(Boolean).join(" · ")}</small>
      {source.url ? <a href={source.url} target="_blank" rel="noreferrer noopener">{source.title}</a> : <b>{source.title}</b>}
      {source.where && <em>{source.where}</em>}
    </span>)}</span>
  </span>;
}
