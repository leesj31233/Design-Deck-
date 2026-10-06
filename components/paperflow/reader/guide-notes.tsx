"use client";
import "./guide-notes.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { useTranslationStore } from "@/lib/paperflow/translation/translation-store";
import { loadGuide } from "@/lib/paperflow/guide/client";
import { locateQuote } from "@/lib/paperflow/guide/locate";
import { textIndex } from "@/lib/paperflow/pdf/selection-geometry";
import type { GuideKind, GuideSection, GuideSummary, PaperGuide } from "@/lib/paperflow/guide/guide";
import type { Rect } from "@/lib/paperflow/anchors/types";

/** Colour means type: yellow result, blue condition, green method, purple mechanism, red limitation. */
export const KIND_INK: Record<GuideKind, { ink: string; marker: string; label: string }> = {
  result: { ink: "#a67c00", marker: "rgba(255,221,64,.62)", label: "RESULT" },
  condition: { ink: "#1864ab", marker: "rgba(132,199,255,.55)", label: "CONDITION" },
  method: { ink: "#2b8a3e", marker: "rgba(140,233,154,.58)", label: "METHOD" },
  mechanism: { ink: "#6741d9", marker: "rgba(190,170,255,.55)", label: "MECHANISM" },
  limitation: { ink: "#c92a2a", marker: "rgba(255,150,150,.52)", label: "LIMITATION" }
};
export const SECTION_LABEL: Record<GuideSection, string> = { abstract: "ABSTRACT", introduction: "INTRODUCTION", methods: "METHODS", results: "RESULTS", discussion: "DISCUSSION", conclusion: "CONCLUSION", other: "PAGE" };
const SUMMARY: [keyof GuideSummary, string][] = [["why", "왜"], ["what", "무엇"], ["how", "어떻게"], ["result", "결과"], ["conclusion", "결론"]];
/** Width of each side column beside the page while the guide is on. */
export const NOTE_GUTTER = 214;

/** The guide's marks on one page, placed on the printed glyphs (page fractions). Empty rects: the quote was not found in the text layer. */
export type GuideMarkRects = { key: string; rects: Rect[] }[];

/** This page's guide marks located in the PDF.js text layer, so each highlight sits exactly on its words. */
export function useGuideMarkRects(documentId: string, pageIndex: number, textReady: boolean, layer: RefObject<HTMLElement | null>, surface: RefObject<HTMLElement | null>, scale: number): GuideMarkRects {
  const on = useReaderStore(s => s.guideOverlay);
  const guide = useQuery({ queryKey: ["guide", documentId], queryFn: () => loadGuide(documentId), enabled: on });
  const marks = guide.data?.pages.find(page => page.page === pageIndex + 1)?.marks;
  const [found, setFound] = useState<GuideMarkRects>([]);
  useEffect(() => {
    if (!on || !textReady || !marks?.length || !layer.current || !surface.current) { setFound([]); return; }
    const index = textIndex(layer.current, surface.current);
    setFound(marks.map((mark, order) => { const at = mark.quote ? locateQuote(index.text, mark.quote) : null; return { key: `${mark.unitId}-${order}`, rects: at ? index.rectsFor(at.start, at.length) : [] }; }));
  }, [on, textReady, marks, layer, surface, scale]);
  return found;
}

/** The guide's highlights, drawn like the reader's own highlighter: under the glyphs (multiply), never a wash over them. */
export function GuideHighlights({ documentId, pageIndex, rects }: { documentId: string; pageIndex: number; rects: GuideMarkRects }) {
  const on = useReaderStore(s => s.guideOverlay), reduced = useReducedMotion();
  const guide = useQuery({ queryKey: ["guide", documentId], queryFn: () => loadGuide(documentId), enabled: on });
  const marks = guide.data?.pages.find(page => page.page === pageIndex + 1)?.marks ?? [];
  if (!on || !rects.length) return null;
  return <div className="pf-highlight-layer pf-guide-highlights" aria-hidden="true">{rects.flatMap((item, order) => item.rects.map((rect, index) => <motion.span key={`${item.key}-${index}`} className="pf-guide-highlight" data-kind={marks[order]?.kind}
    style={{ left: `${rect.x * 100}%`, top: `${(rect.y + rect.height * .1) * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * .8 * 100}%`, background: KIND_INK[marks[order]?.kind ?? "result"].marker, transformOrigin: "left center" }}
    initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: .1 * order + index * .05, duration: .3, ease: "easeOut" }}/>))}</div>;
}

type Placed = { key: string; index: number; kind: GuideKind; note: string; side: "left" | "right"; anchorX: number; anchorY: number; noteY: number };

/** A thin leader line from the sentence to its note: a short horizontal run, then an elbow into the note. */
function leader(x0: number, y0: number, x1: number, y1: number) {
  const mid = x0 + (x1 - x0) * .55;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} L${mid.toFixed(1)} ${y0.toFixed(1)} L${mid.toFixed(1)} ${y1.toFixed(1)} L${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** Page 1, left margin: the whole paper first (L1-L4, L6). */
function PaperOverview({ guide }: { guide: PaperGuide }) {
  return <section className="pf-gm-card pf-gm-overview">
    <h4>이 논문은?</h4>
    <p className="pf-gm-definition">{guide.definition}</p>
    {SUMMARY.some(([key]) => guide.summary[key]) && <><h4>10초 요약</h4><dl className="pf-gm-summary">{SUMMARY.map(([key, label]) => guide.summary[key] && <div key={key}><dt>{label}</dt><dd>{guide.summary[key]}</dd></div>)}</dl></>}
    {guide.takeaway && <p className="pf-gm-takeaway">{guide.takeaway}</p>}
    {guide.flow.length > 0 && <><h4>연구 흐름</h4><ol className="pf-gm-flow">{guide.flow.map((step, index) => <li key={step.label + index}><b>{step.label}</b>{step.detail && <span>{step.detail}</span>}</li>)}</ol></>}
    {guide.conditions.length > 0 && <><h4>핵심 실험조건</h4><dl className="pf-gm-facts">{guide.conditions.slice(0, 6).map((fact, index) => <div key={fact.label + index}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></>}
  </section>;
}

/** Page 1, right margin: what came out of it and what to do with it (L7-L11). */
function PaperFindings({ guide }: { guide: PaperGuide }) {
  return <section className="pf-gm-card pf-gm-findings">
    {guide.results.length > 0 && <><h4>핵심 결과</h4><ol className="pf-gm-results">{guide.results.map((result, index) => <li key={result.claim + index}><b>{result.claim}</b>{result.detail && <span>{result.detail}</span>}{result.page && <em>p.{result.page}</em>}</li>)}</ol></>}
    {guide.mechanisms.length > 0 && <><h4>왜?</h4><ul className="pf-gm-claims">{guide.mechanisms.map((claim, index) => <li key={index}><i data-source={claim.source}>{claim.source === "author" ? "저자" : "AI"}</i>{claim.text}</li>)}</ul></>}
    {guide.applications.length > 0 && <><h4>가져갈 것</h4><ul className="pf-gm-list">{guide.applications.map(item => <li key={item}>{item}</li>)}</ul></>}
    {guide.limitations.length > 0 && <><h4>한계</h4><ul className="pf-gm-claims">{guide.limitations.map((claim, index) => <li key={index}><i data-source={claim.source}>{claim.source === "author" ? "저자" : "AI"}</i>{claim.text}</li>)}</ul></>}
    {guide.figures.length > 0 && <><h4>Figure · Table</h4><ul className="pf-gm-figures">{guide.figures.slice(0, 6).map((figure, index) => <li key={figure.label + index}><b>{figure.label}</b><span className="pf-gm-stars" aria-label={`중요도 ${figure.importance}/5`}>{"★".repeat(figure.importance)}<i>{"★".repeat(5 - figure.importance)}</i></span>{figure.title && <span>{figure.title}</span>}{figure.look[0] && <small>볼 것 · {figure.look[0]}</small>}</li>)}</ul></>}
  </section>;
}

/**
 * The AI guide in the page margins (L12-L13), sized to the paper at the current zoom. Page 1 carries
 * the whole paper (left: definition → summary → flow → conditions; right: results → why → takeaways →
 * limitations → figures); every page then gets its own card (이 페이지는? → 핵심 → 수치 → 세부) and a
 * thin leader line from each highlighted sentence to its compressed keyword note.
 */
export function GuideNotes({ documentId, pageIndex, width, height, room, scale, marks }: { documentId: string; pageIndex: number; width: number; height: number; room: number; scale: number; marks: GuideMarkRects }) {
  const on = useReaderStore(s => s.guideOverlay), reduced = useReducedMotion();
  const manifest = useTranslationStore(s => s.manifest?.documentId === documentId ? s.manifest : null);
  const guide = useQuery({ queryKey: ["guide", documentId], queryFn: () => loadGuide(documentId), enabled: on });
  const [open, setOpen] = useState<string | null>(null), [heights, setHeights] = useState({ left: 0, right: 0 });
  const left = useRef<HTMLDivElement>(null), right = useRef<HTMLDivElement>(null);
  const compact = room < 150;
  const pageGuide = guide.data?.pages?.find(item => item.page === pageIndex + 1);
  const first = pageIndex === 0 && Boolean(guide.data?.definition);
  // Guide type follows the paper: about the size of the PDF's body text at this zoom.
  const size = Math.min(14, Math.max(10.5, 8.4 * scale));

  // Notes in a column start below that column's cards, whatever their measured height.
  useLayoutEffect(() => {
    const nodes = [left.current, right.current];
    const measure = () => setHeights({ left: left.current?.offsetHeight ?? 0, right: right.current?.offsetHeight ?? 0 });
    const observer = new ResizeObserver(measure);
    nodes.forEach(node => node && observer.observe(node)); measure();
    return () => observer.disconnect();
  }, [pageGuide, first, on, compact, size]);

  const placed = useMemo<Placed[]>(() => {
    if (!guide.data || !manifest) return [];
    const items: Placed[] = [];
    (pageGuide?.marks ?? []).forEach((mark, index) => {
      // On the printed glyphs when the text layer has the quote, else beside its paragraph.
      const found = marks[index]?.rects ?? [];
      const boxes = found.length ? found : manifest.blocks.filter(block => block.unitId === mark.unitId && block.pageIndex === pageIndex).flatMap(block => block.lines.slice(0, 1));
      if (!boxes.length) return;
      const minX = Math.min(...boxes.map(box => box.x)), maxX = Math.max(...boxes.map(box => box.x + box.width));
      const top = Math.min(...boxes.map(box => box.y)), bottom = Math.max(...boxes.map(box => box.y + box.height));
      const side = (minX + maxX) / 2 < .5 ? "left" : "right", y = (top + bottom) / 2 * height;
      items.push({ key: `${mark.unitId}-${index}`, index, kind: mark.kind, note: mark.note, side, anchorX: (side === "left" ? minX : maxX) * width, anchorY: y, noteY: y });
    });
    // Notes in one column never overlap: each starts below the one before it.
    const line = size * 1.45, perLine = Math.max(8, Math.floor((NOTE_GUTTER - 40) / size));
    for (const side of ["left", "right"] as const) {
      const column = side === "left" ? heights.left : heights.right;
      let floor = column ? column + 18 : 8;
      for (const item of items.filter(entry => entry.side === side).sort((a, b) => a.anchorY - b.anchorY)) { item.noteY = Math.max(item.noteY - line, floor); floor = item.noteY + line + Math.ceil(item.note.length / perLine) * line + 10; }
    }
    return items;
  }, [guide.data, manifest, pageGuide, pageIndex, width, height, heights, marks, size]);

  if (!on || !guide.data) return null;
  const noteWidth = Math.min(NOTE_GUTTER - 26, Math.max(120, room - 22));
  const noteLeft = (side: "left" | "right") => side === "left" ? -noteWidth - 16 : width + 16;
  const enter = (dx: number) => reduced ? {} : { initial: { opacity: 0, x: dx }, animate: { opacity: 1, x: 0 }, transition: { type: "spring" as const, stiffness: 240, damping: 26 } };

  return <div className="pf-guide-notes" style={{ width, height, "--g": `${size}px` } as React.CSSProperties} aria-label="AI 가이드 정리">
    <svg className="pf-guide-ink" width={width} height={height} style={{ overflow: "visible" }} aria-hidden="true">
      {!compact && placed.map((item, order) => { const target = item.side === "left" ? noteLeft("left") + noteWidth + 4 : noteLeft("right") - 4, x0 = item.anchorX + (item.side === "left" ? -3 : 3);
        return <motion.g key={item.key} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: .8 }} transition={{ delay: .08 * order + .25 }}><circle cx={x0} cy={item.anchorY} r={2} fill={KIND_INK[item.kind].ink}/><path d={leader(x0, item.anchorY, target, item.noteY + size * .7)} fill="none" stroke={KIND_INK[item.kind].ink} strokeWidth={.9} strokeLinejoin="round"/></motion.g>; })}
    </svg>
    {!compact && (first || pageGuide) && <motion.div ref={left} className="pf-guide-column" style={{ left: noteLeft("left"), width: noteWidth, maxHeight: height }} {...enter(8)}>
      {first && <PaperOverview guide={guide.data}/>}
      {pageGuide && <section className="pf-gm-card pf-gm-page">
        <h4><span>p.{pageGuide.page}</span>{SECTION_LABEL[pageGuide.section]}</h4>
        <p className="pf-gm-about">{pageGuide.about}</p>
        {pageGuide.key && <p className="pf-gm-key"><b>핵심</b>{pageGuide.key}</p>}
        {pageGuide.numbers.length > 0 && <ul className="pf-gm-numbers">{pageGuide.numbers.map(number => <li key={number}>{number}</li>)}</ul>}
        {pageGuide.details.length > 0 && <ul className="pf-gm-details">{pageGuide.details.map((detail, index) => <li key={index}><i>{detail.tag}</i>{detail.text}</li>)}</ul>}
      </section>}
    </motion.div>}
    {!compact && first && <motion.div ref={right} className="pf-guide-column" style={{ left: noteLeft("right"), width: noteWidth, maxHeight: height }} {...enter(-8)}><PaperFindings guide={guide.data}/></motion.div>}
    {placed.map((item, order) => compact
      ? <button key={item.key} type="button" className="pf-guide-pin" style={{ top: item.anchorY - 11, left: item.side === "left" ? 4 : width - 26, background: KIND_INK[item.kind].ink }} onClick={() => setOpen(open === item.key ? null : item.key)} aria-label={`가이드 메모 ${item.index + 1}`}>{item.index + 1}
          {open === item.key && <span className="pf-guide-pin-note" style={{ [item.side === "left" ? "left" : "right"]: 0 }}><small style={{ color: KIND_INK[item.kind].ink }}>{KIND_INK[item.kind].label}</small>{item.note}</span>}</button>
      : <motion.p key={item.key} className="pf-guide-margin" data-side={item.side} style={{ top: item.noteY, left: noteLeft(item.side), width: noteWidth, borderColor: KIND_INK[item.kind].ink }}
          initial={reduced ? false : { opacity: 0, x: item.side === "left" ? 8 : -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .08 * order + .32, type: "spring", stiffness: 260, damping: 26 }}>
          <small style={{ color: KIND_INK[item.kind].ink }}>{KIND_INK[item.kind].label}</small>{item.note}
        </motion.p>)}
  </div>;
}
