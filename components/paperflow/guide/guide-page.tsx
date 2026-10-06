"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { loadGuide } from "@/lib/paperflow/guide/client";
import { useGuideAnchors } from "@/lib/paperflow/guide/locate";
import type { MarkKind, PageSection } from "@/lib/paperflow/guide/guide";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import "./guide.css";

/** Width of each side column beside the page while the guide is on. */
export const NOTE_GUTTER = 236;
export const KIND_LABEL: Record<MarkKind, string> = { result: "RESULT", condition: "CONDITION", method: "METHOD", mechanism: "MECHANISM", limitation: "LIMITATION" };
const SECTION_LABEL: Record<PageSection, string> = { INTRO: "INTRODUCTION", METHOD: "METHOD", RESULT: "RESULTS", DISCUSSION: "DISCUSSION", CONCLUSION: "CONCLUSION", OTHER: "PAGE" };

/** Guide type size follows the paper's body text at the current zoom, so both read together. */
export const guideFont = (scale: number) => Math.max(11, Math.min(14.5, 12.2 * scale));

/**
 * The guide beside one page. Left: what this page says, its key points in priority order (label,
 * keyword, fact) and what comes next; it stays in view while the page scrolls. Right: a margin note
 * for each highlight, numbered like its mark, keyword first, compressed, never a re-translation.
 */
export function GuidePageColumn({ documentId, pageIndex, width, height, room, scale }: { documentId: string; pageIndex: number; width: number; height: number; room: number; scale: number }) {
  const on = useReaderStore(s => s.guideOverlay), layers = useReaderStore(s => s.guideLayers), reduced = useReducedMotion();
  const guide = useQuery({ queryKey: ["guide", documentId], queryFn: () => loadGuide(documentId), enabled: on });
  const anchors = useGuideAnchors(state => state.pages[pageIndex]);
  const page = guide.data?.pages.find(item => item.page === pageIndex + 1);
  const marks = useMemo(() => (page?.marks ?? []).filter(mark => layers.kinds.includes(mark.kind)), [page, layers.kinds]);
  const column = Math.min(NOTE_GUTTER - 20, Math.max(150, room - 18)), font = guideFont(scale);
  // Notes follow their marks down the margin and never overlap each other.
  const notes = useMemo(() => {
    if (!anchors?.length) return [];
    let floor = 0;
    return anchors.map(anchor => {
      const mark = marks[anchor.number - 1];
      if (!mark) return null;
      const lines = 2 + Math.ceil(mark.note.length / 14);
      const top = Math.max(anchor.y * height - font * 1.6, floor);
      floor = top + lines * font * 1.32 + 18;
      return { anchor, mark, top };
    }).filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [anchors, marks, height, font]);
  if (!on || !guide.data || room < 150) return null;
  const enter = (delay: number) => reduced ? {} : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { delay, type: "spring" as const, stiffness: 280, damping: 28 } };

  return <div className="pf-gpage" style={{ width, height, fontSize: font }} aria-label={`${pageIndex + 1}페이지 가이드`}>
    {layers.pages && page && <div className="pf-gpage-left" style={{ left: -column - 18, width: column }}>
      <motion.section className="pf-gpage-card" data-section={page.section} {...enter(.05)}>
        <header><b>p.{page.page}</b><span>{SECTION_LABEL[page.section]}</span></header>
        <h4>{page.title}</h4>
        {page.items.length > 0 && <ul>{page.items.map(item => <li key={item.label + item.keyword} data-label={item.label}>
          <small>{item.label}</small><strong>{item.keyword}</strong><p>{item.text}</p>
        </li>)}</ul>}
        {page.next && <footer><small>NEXT</small>{page.next}</footer>}
      </motion.section>
    </div>}
    {layers.marks && notes.length > 0 && <div className="pf-gpage-right" style={{ left: width + 18, width: column }}>
      <svg className="pf-gpage-leaders" width={column + 18} height={height} style={{ left: -18 }} aria-hidden="true">
        {notes.map(note => { const y0 = note.anchor.y * height, y1 = note.top + font * .9; return <path key={note.anchor.key} data-kind={note.mark.kind} d={`M 0 ${y0.toFixed(1)} C 10 ${y0.toFixed(1)}, 8 ${y1.toFixed(1)}, 18 ${y1.toFixed(1)}`}/>; })}
      </svg>
      {notes.map((note, order) => <motion.aside key={note.anchor.key} className="pf-gnote" data-kind={note.mark.kind} style={{ top: note.top }} {...enter(.12 + order * .06)}>
        <header><i>{note.anchor.number}</i><small>{KIND_LABEL[note.mark.kind]}</small></header>
        {note.mark.keyword && <strong>{note.mark.keyword}</strong>}
        <p>{note.mark.note}</p>
      </motion.aside>)}
    </div>}
  </div>;
}
