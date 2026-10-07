"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, FileText, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { loadGuide } from "@/lib/paperflow/guide/client";
import { useGuideAnchors, useGuideReading } from "@/lib/paperflow/guide/locate";
import type { GuidePage, MarkKind, PageSection, PaperGuide } from "@/lib/paperflow/guide/guide";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import "./guide.css";

/** Width of each margin beside the page while the guide is on: a wide screen gives the notes more room. */
export const noteGutter = (viewport: number) => Math.round(Math.max(240, Math.min(400, viewport * .21)));
export const KIND_LABEL: Record<MarkKind, string> = { result: "RESULT", condition: "CONDITION", method: "METHOD", mechanism: "MECHANISM", limitation: "LIMITATION" };
const SECTION_LABEL: Record<PageSection, string> = { INTRO: "INTRODUCTION", METHOD: "METHOD", RESULT: "RESULTS", DISCUSSION: "DISCUSSION", CONCLUSION: "CONCLUSION", OTHER: "PAGE" };

/** Points that interpret the page go to the right margin with the highlight notes; the rest stay left. */
const RIGHT_LABELS = new Set(["RESULT", "MEANING", "MECHANISM", "LIMITATION"]);

/** Margin notes read at about the paper's own body size at the current zoom. */
export const guideFont = (scale: number) => Math.max(11.5, Math.min(15, 12.6 * scale));

/** What this page says: section, title, key points in priority order, what comes next. */
function PageCard({ page }: { page: GuidePage }) {
  return <>
    <header><b>p.{page.page}</b><span>{SECTION_LABEL[page.section]}</span></header>
    <h4>{page.title}</h4>
    {page.items.length > 0 && <ul>{page.items.map(item => <li key={item.label + item.keyword} data-label={item.label}>
      <small>{item.label}</small><strong>{item.keyword}</strong><p>{item.text}</p>
    </li>)}</ul>}
    {page.next && <footer><small>NEXT</small>{page.next}</footer>}
  </>;
}

/** Page 1's margin opens with the paper itself: what it is, its background, how it was done, what to remember. */
function Overview({ guide }: { guide: PaperGuide }) {
  const ten = guide.tenSeconds;
  const rows: [string, string][] = ([["왜", ten.why], ["무엇을", ten.what], ["어떻게", ten.how], ["결과", ten.found], ["결론", ten.conclusion]] as [string, string][]).filter(([, text]) => text);
  return <section className="pf-goverview">
    <span className="pf-gmemo-kicker">이 논문은</span>
    <p className="pf-goverview-def">{guide.definition}</p>
    {guide.intro && <p>{guide.intro}</p>}
    {rows.length > 0 && <dl>{rows.map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl>}
    {guide.takeaway && <blockquote>{guide.takeaway}</blockquote>}
    <button type="button" className="pf-goverview-more" onClick={() => useReaderStore.getState().set({ guideBriefOpen: true })}><FileText size={13}/>브리프 전체 · 결과 · 조건 · 한계 · Figure · 용어</button>
  </section>;
}

/**
 * The guide in both margins of one page, as study notes rather than labels. Left: a memo the height of
 * the page (on page 1 it opens with the paper's overview), then where this page sits in the argument
 * and each key point discussed in two or three sentences. Right: a note beside each highlight saying
 * what the sentence means and implies; notes are measured and stacked so they never overlap.
 */
export function GuidePageColumn({ documentId, pageIndex, width, height, room, scale }: { documentId: string; pageIndex: number; width: number; height: number; room: number; scale: number }) {
  const on = useReaderStore(s => s.guideOverlay), layers = useReaderStore(s => s.guideLayers), reduced = useReducedMotion();
  const guide = useQuery({ queryKey: ["guide", documentId], queryFn: () => loadGuide(documentId), enabled: on });
  const anchors = useGuideAnchors(state => state.pages[pageIndex]);
  const active = useGuideReading(state => state.active);
  const page = guide.data?.pages.find(item => item.page === pageIndex + 1);
  const marks = useMemo(() => (page?.marks ?? []).filter(mark => layers.kinds.includes(mark.kind)), [page, layers.kinds]);
  const column = Math.max(150, Math.min(420, room - 18)), font = guideFont(scale), [open, setOpen] = useState(false);
  // Real note heights, measured after each layout; until then an estimate from the text length.
  const [heights, setHeights] = useState<Record<string, number>>({});
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const rightItems = useMemo(() => (page?.items ?? []).filter(item => RIGHT_LABELS.has(item.label)), [page]);
  const leftItems = useMemo(() => (page?.items ?? []).filter(item => !RIGHT_LABELS.has(item.label)), [page]);
  const memoKey = "right-memo";
  const notes = useMemo(() => {
    if (!anchors?.length) return [];
    const perLine = Math.max(8, (column - 26) / (font * .98)), gap = font * .8;
    const placed = [...anchors].sort((a, b) => a.y - b.y).flatMap(anchor => {
      const mark = marks[anchor.number - 1];
      if (!mark) return [];
      const size = heights[anchor.key] ?? (3 + Math.ceil(mark.note.length / perLine)) * font * 1.55 + 22;
      return [{ anchor, mark, size, top: anchor.y * height - font * 1.4 }];
    });
    // Down: each note at its mark, below the one above. Up: none past the page's bottom edge.
    let floor = 0;
    for (const note of placed) { note.top = Math.max(note.top, floor); floor = note.top + note.size + gap; }
    // Leave room at the bottom for the page's interpretation memo when there is one.
    let ceiling = height - (rightItems.length ? Math.min(height * .45, heights[memoKey] ?? height * .3) + gap : 0);
    for (const note of [...placed].reverse()) { note.top = Math.max(0, Math.min(note.top, ceiling - note.size)); ceiling = note.top - gap; }
    return placed;
  }, [anchors, marks, height, font, column, heights, rightItems.length]);
  const lastNote = notes.at(-1), memoTop = lastNote ? lastNote.top + lastNote.size + font * .8 : 0;
  useLayoutEffect(() => {
    let changed = false;
    const next: Record<string, number> = {};
    for (const [key, element] of noteRefs.current) {
      next[key] = element.offsetHeight;
      if (Math.abs((heights[key] ?? 0) - next[key]) > 1) changed = true;
    }
    if (changed) setHeights(next);
  });
  if (!on || !guide.data) return null;
  const enter = (delay: number) => reduced ? {} : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { delay, type: "spring" as const, stiffness: 280, damping: 28 } };

  // No margin beside the page (narrow window): the same guide folds into a chip in the page's corner.
  if (room < 150) {
    const numbered = (anchors ?? []).map(anchor => ({ anchor, mark: marks[anchor.number - 1] })).filter(item => item.mark);
    if (!(layers.pages && page) && !(layers.marks && numbered.length)) return null;
    return <div className="pf-gpage" style={{ width, height, fontSize: Math.max(11, font * .95) }} aria-label={`${pageIndex + 1}페이지 가이드`}>
      <div className="pf-gpage-compact" data-open={open || undefined}>
        <button type="button" className="pf-gpage-chip" aria-expanded={open} onClick={() => setOpen(value => !value)}>
          {open ? <X size={13} aria-hidden="true"/> : <BookOpenText size={13} aria-hidden="true"/>}
          <span>p.{pageIndex + 1} 가이드{numbered.length ? ` · ${numbered.length}` : ""}</span>
        </button>
        {open && <motion.section className="pf-gpage-card pf-gpage-pop" data-section={page?.section ?? "OTHER"} style={{ maxHeight: Math.max(220, height * .72), width: Math.min(340, width - 20) }} {...enter(0)}>
          {layers.pages && page && <PageCard page={page}/>}
          {layers.marks && numbered.length > 0 && <ol className="pf-gpage-notes">{numbered.map(({ anchor, mark }) => <li key={anchor.key} data-kind={mark.kind}>
            <i>{anchor.number}</i><div><small>{KIND_LABEL[mark.kind]}</small>{mark.keyword && <strong>{mark.keyword}</strong>}<p>{mark.note}</p></div>
          </li>)}</ol>}
        </motion.section>}
      </div>
    </div>;
  }

  const showMemo = layers.pages && (page || pageIndex === 0);
  return <div className="pf-gpage" style={{ width, height, fontSize: font }} aria-label={`${pageIndex + 1}페이지 가이드`}>
    {showMemo && <div className="pf-gside-left" style={{ left: -column - 18, width: column, height }}>
      <motion.article className="pf-gmemo dd-scrollbar" data-section={page?.section ?? "OTHER"} style={{ maxHeight: height }} {...enter(.05)}>
        {pageIndex === 0 && <Overview guide={guide.data}/>}
        {page && <>
          <header className="pf-gmemo-head"><b>p.{page.page}</b><span>{SECTION_LABEL[page.section]}</span></header>
          <h4>{page.title}</h4>
          {page.context && <p className="pf-gmemo-context">{page.context}</p>}
          {leftItems.map(item => <section key={item.label + item.keyword} className="pf-gmemo-item" data-label={item.label}>
            <small>{item.label}</small><strong>{item.keyword}</strong><p>{item.text}</p>
          </section>)}
          {page.next && <footer><small>NEXT</small>{page.next}</footer>}
        </>}
      </motion.article>
    </div>}
    {(layers.marks && notes.length > 0 || layers.pages && rightItems.length > 0) && <div className="pf-gpage-right" style={{ left: width + 18, width: column }}>
      {layers.pages && rightItems.length > 0 && <motion.article ref={(element: HTMLElement | null) => { if (element) noteRefs.current.set(memoKey, element); else noteRefs.current.delete(memoKey); }} className="pf-gmemo pf-gmemo-right dd-scrollbar" data-section={page?.section ?? "OTHER"} style={{ top: Math.min(memoTop, Math.max(0, height - 160)), maxHeight: Math.max(160, height - memoTop) }} {...enter(.2)}>
        <span className="pf-gmemo-kicker">이 페이지가 말하는 것</span>
        {rightItems.map(item => <section key={item.label + item.keyword} className="pf-gmemo-item" data-label={item.label}><small>{item.label}</small><strong>{item.keyword}</strong><p>{item.text}</p></section>)}
      </motion.article>}
      {layers.marks && <svg className="pf-gpage-leaders" width={column + 18} height={height} style={{ left: -18 }} aria-hidden="true">
        {notes.map(note => { const y0 = note.anchor.y * height, y1 = note.top + font * .9; return <path key={note.anchor.key} data-kind={note.mark.kind} data-active={active === `${pageIndex}:${note.anchor.key}` || undefined} d={`M 0 ${y0.toFixed(1)} C 10 ${y0.toFixed(1)}, 8 ${y1.toFixed(1)}, 18 ${y1.toFixed(1)}`}/>; })}
      </svg>}
      {layers.marks && notes.map((note, order) => <motion.aside key={note.anchor.key} ref={(element: HTMLElement | null) => { if (element) noteRefs.current.set(note.anchor.key, element); else noteRefs.current.delete(note.anchor.key); }} className="pf-gnote" data-kind={note.mark.kind} data-active={active === `${pageIndex}:${note.anchor.key}` || undefined} style={{ top: note.top }} {...enter(.12 + order * .06)}>
        <header><i>{note.anchor.number}</i><small>{KIND_LABEL[note.mark.kind]}</small>{note.mark.keyword && <strong>{note.mark.keyword}</strong>}</header>
        <p>{note.mark.note}</p>
      </motion.aside>)}
    </div>}
  </div>;
}
