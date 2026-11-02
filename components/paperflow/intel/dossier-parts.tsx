"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { DossierEvent, DossierFigure, DossierSource } from "@/lib/paperflow/intel/types";

/** A source's PDF: its pdfUrl, or its own URL when that is a PDF. */
export const pdfOf = (source: DossierSource) => source.pdfUrl ?? (source.url && /\.pdf($|[?#])/i.test(source.url) ? source.url : undefined);

/** host name of a URL, without www. */
export const siteOf = (url?: string) => { if (!url) return undefined; try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; } };

/**
 * A citation as a small number: the sources it points at open in a card on hover or focus, with the
 * publisher, date, where in the document, and a link to the original. Numbers keep prose readable;
 * the card carries the detail.
 */
export function SourceChip({ refs, sources }: { refs: string[]; sources: Map<string, DossierSource> }) {
  const found = refs.map(ref => sources.get(ref)).filter((source): source is DossierSource => Boolean(source));
  if (!found.length) return <span className="pf-cite" data-missing>[{refs.join(", ")}]</span>;
  const first = found[0];
  return <span className="pf-cite-wrap" tabIndex={0}>
    <a className="pf-cite" href={first.url ?? `#dossier-src-${first.ref}`} target={first.url ? "_blank" : undefined} rel="noreferrer noopener" aria-label={`출처 ${found.map(source => source.ref).join(", ")}`}>{found.map(source => source.ref).join("·")}</a>
    <span className="pf-cite-card" role="tooltip">{found.map(source => <span key={source.ref}>
      <small>[{source.ref}] {[siteOf(source.url) ?? source.org, source.date].filter(Boolean).join(" · ")}</small>
      {source.url ? <a href={source.url} target="_blank" rel="noreferrer noopener">{source.title}</a> : <b>{source.title}</b>}
      {source.where && <em>{source.where}</em>}
    </span>)}</span>
  </span>;
}

/** A figure opened full size over the page; Escape or a click outside closes it. */
export function Lightbox({ figure, source, onClose }: { figure: DossierFigure | null; source?: DossierSource; onClose: () => void }) {
  useEffect(() => { if (!figure) return; const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [figure, onClose]);
  if (!figure) return null;
  return createPortal(<div className="pf-dossier-lightbox" role="dialog" aria-label={figure.caption} onClick={onClose}>
    <button type="button" className="pf-dossier-close" aria-label="닫기"><X size={20}/></button>
    <figure onClick={event => event.stopPropagation()}><img src={figure.src} alt={figure.caption}/><figcaption>{figure.caption}{figure.where && ` · ${figure.where}`}{source ? ` — ${source.title}` : ""}</figcaption></figure>
  </div>, document.body);
}

/** "2026-07-06" → "2026.07", "2023-09-10~14" → "2023.09", "~2030-06" → "~2030.06", "2026 3분기" stays. */
export function shortDate(date: string) {
  const match = /^(~?)(\d{4})(?:-(\d{2}))?/.exec(date.trim());
  if (!match) return date;
  const rest = date.trim().slice(match[0].length);
  const tail = /^\s*(Q\d|[1-4]분기|H[12])/.exec(rest)?.[1];
  return `${match[1]}${match[2]}${match[3] ? `.${match[3]}` : ""}${tail ? ` ${tail}` : ""}`;
}

/** Whether an event is still a plan: a future date, or wording about targets and schedules. */
export function isPlanned(event: DossierEvent, today = new Date().toISOString().slice(0, 10)) {
  const match = /(\d{4})(?:-(\d{2}))?/.exec(event.date);
  if (!match) return false;
  const quarter = /([1-4])분기|Q([1-4])/.exec(event.date), month = match[2] ?? (quarter ? String(Number(quarter[1] ?? quarter[2]) * 3).padStart(2, "0") : "12");
  const future = `${match[1]}-${month}` > today.slice(0, 7);
  // "~2004" is an approximate past date, not a plan; a target named for this year or later still is.
  return future || Number(match[1]) >= Number(today.slice(0, 4)) && /목표|계획|예정|구상/.test(event.event) && !/완료|준공|취득|개시했|시작했/.test(event.event);
}

const tokens = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}.-]+/u).filter(word => word.length >= 3));
/** The same event told twice (a news item and the case file's own line in the same month) is shown once. */
function dedupe(events: DossierEvent[]) {
  const kept: DossierEvent[] = [];
  for (const event of events) {
    const month = event.date.replace(/^~/, "").slice(0, 7), mine = tokens(event.event);
    const twin = kept.find(other => other.date.replace(/^~/, "").slice(0, 7) === month && [...tokens(other.event)].filter(word => mine.has(word)).length >= 2);
    if (!twin) kept.push(event);
  }
  return kept;
}

/**
 * The timeline as a compact column: the date once, a one- or two-line title, and the rest on a click.
 * Facts and plans are told apart; each line keeps its source.
 */
export function CompactTimeline({ events, cite, newestFirst = false }: { events: DossierEvent[]; cite: (ref?: string) => React.ReactNode; newestFirst?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const sorted = [...dedupe(events)].sort((a, b) => a.date.replace(/^~/, "").localeCompare(b.date.replace(/^~/, "")) * (newestFirst ? -1 : 1));
  return <ol className="pf-tl">{sorted.map((event, index) => {
    // "Title — detail" or "Title: detail" splits into the line and its detail; otherwise the first clause is the line.
    const text = event.event.replace(/^\[[^\]]+\]\s*/, "");
    const split = /^(.{8,70}?)(?:\s[—–]\s|:\s)(.+)$/.exec(text);
    const title = split ? split[1] : text, detail = split ? split[2] : null, planned = isPlanned(event);
    const tag = /^\[([^\]]+)\]/.exec(event.event)?.[1];
    return <li key={index} data-planned={planned || undefined} data-open={open === index || undefined}>
      <time dateTime={event.date}>{shortDate(event.date)}{cite(event.ref)}</time>
      <div>
        <button type="button" onClick={() => setOpen(open === index ? null : index)} aria-expanded={open === index}>
          {tag && <i>{tag}</i>}{title}{planned && <em>계획</em>}
        </button>
        {(open === index) && <p>{detail ?? (title === text ? null : text)}{event.status && <small>{event.status === "verified" ? "확인됨" : event.status === "claimed" ? "회사 발표" : event.status === "estimate" ? "추정" : "미확인"}</small>}</p>}
      </div>
    </li>;
  })}</ol>;
}
