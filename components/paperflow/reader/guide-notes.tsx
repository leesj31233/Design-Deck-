"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { useTranslationStore } from "@/lib/paperflow/translation/translation-store";
import { loadGuide } from "@/lib/paperflow/guide/client";
import type { GuideKind, GuideSection } from "@/lib/paperflow/guide/guide";
import type { ParagraphLine } from "@/lib/paperflow/layout/types";
import { quoteLines } from "./guide-marks";

/** Colour means type: yellow result, blue condition, green method, purple mechanism, red limitation. */
export const KIND_INK: Record<GuideKind, { ink: string; marker: string; label: string }> = {
  result: { ink: "#b08800", marker: "rgba(255,212,59,.42)", label: "RESULT" },
  condition: { ink: "#1864ab", marker: "rgba(116,192,252,.34)", label: "CONDITION" },
  method: { ink: "#2b8a3e", marker: "rgba(140,233,154,.38)", label: "METHOD" },
  mechanism: { ink: "#7048e8", marker: "rgba(177,151,252,.32)", label: "MECHANISM" },
  limitation: { ink: "#c92a2a", marker: "rgba(255,135,135,.30)", label: "LIMITATION" }
};
/** Korean names of the page guide's sections. */
export const SECTION_LABEL: Record<GuideSection, string> = { abstract: "ABSTRACT", introduction: "INTRODUCTION", methods: "METHODS", results: "RESULTS", discussion: "DISCUSSION", conclusion: "CONCLUSION", other: "PAGE" };
/** Width of each side column beside the page while the guide is on. */
export const NOTE_GUTTER = 214;

type Placed = { key: string; index: number; kind: GuideKind; note: string; lines: ParagraphLine[]; side: "left" | "right"; anchorX: number; anchorY: number; noteY: number };

/** A thin leader line from the sentence to its note: a short horizontal run, then an elbow into the note. */
function leader(x0: number, y0: number, x1: number, y1: number) {
  const mid = x0 + (x1 - x0) * .55;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} L${mid.toFixed(1)} ${y0.toFixed(1)} L${mid.toFixed(1)} ${y1.toFixed(1)} L${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/**
 * The AI guide on the paper (L12-L13), laid out like a lab notebook's margin. Left of each page: what
 * the page is, its main point and key numbers (page 1 also carries the one-sentence definition).
 * The few sentences worth marking get a marker stroke in the colour of their type and a thin leader
 * line to a compressed keyword note ("Vertisol / 2% → Germination +175%") on their side of the page.
 */
export function GuideNotes({ documentId, pageIndex, width, height, room }: { documentId: string; pageIndex: number; width: number; height: number; room: number }) {
  const on = useReaderStore(s => s.guideOverlay), reduced = useReducedMotion();
  const manifest = useTranslationStore(s => s.manifest?.documentId === documentId ? s.manifest : null);
  const guide = useQuery({ queryKey: ["guide", documentId], queryFn: () => loadGuide(documentId), enabled: on });
  const [open, setOpen] = useState<string | null>(null), [columnHeight, setColumnHeight] = useState(0);
  const column = useRef<HTMLDivElement>(null);
  const compact = room < 150;
  const pageGuide = guide.data?.pages?.find(item => item.page === pageIndex + 1);
  const first = pageIndex === 0 && Boolean(guide.data?.definition);

  // Notes in the left column start below the page summary card, whatever its measured height.
  useLayoutEffect(() => {
    const node = column.current;
    if (!node) { setColumnHeight(0); return; }
    const observer = new ResizeObserver(() => setColumnHeight(node.offsetHeight));
    observer.observe(node); setColumnHeight(node.offsetHeight);
    return () => observer.disconnect();
  }, [pageGuide, first, on, compact]);

  const placed = useMemo<Placed[]>(() => {
    if (!guide.data || !manifest) return [];
    const items: Placed[] = [];
    (pageGuide?.marks ?? []).forEach((finding, index) => {
      const blocks = manifest.blocks.filter(block => block.unitId === finding.unitId && block.pageIndex === pageIndex);
      const quoted = blocks.map(block => quoteLines(block.text, block.lines, finding.quote)).find(Boolean);
      const lines = quoted ?? blocks.flatMap(block => block.lines.slice(0, 2));
      if (!lines.length) return;
      const minX = Math.min(...lines.map(line => line.x)), maxX = Math.max(...lines.map(line => line.x + line.width));
      const top = Math.min(...lines.map(line => line.y)), bottom = Math.max(...lines.map(line => line.y + line.height));
      const side = (minX + maxX) / 2 < .5 ? "left" : "right";
      items.push({ key: `${finding.unitId}-${index}`, index, kind: finding.kind, note: finding.note, lines, side, anchorX: (side === "left" ? minX : maxX) * width, anchorY: (top + bottom) / 2 * height, noteY: (top + bottom) / 2 * height });
    });
    // Notes in one column never overlap: each starts below the one before it.
    for (const side of ["left", "right"] as const) {
      let floor = side === "left" && columnHeight ? columnHeight + 22 : 8;
      for (const item of items.filter(entry => entry.side === side).sort((a, b) => a.anchorY - b.anchorY)) { item.noteY = Math.max(item.noteY - 16, floor); floor = item.noteY + 26 + Math.ceil(item.note.length / 16) * 19; }
    }
    return items;
  }, [guide.data, manifest, pageGuide, pageIndex, width, height, columnHeight]);

  if (!on || !guide.data) return null;
  const noteWidth = Math.min(NOTE_GUTTER - 26, Math.max(120, room - 22));
  const noteLeft = (side: "left" | "right") => side === "left" ? -noteWidth - 16 : width + 16;

  return <div className="pf-guide-notes" style={{ width, height }} aria-label="AI 가이드 정리">
    <svg className="pf-guide-ink" width={width} height={height} style={{ overflow: "visible" }} aria-hidden="true">
      {placed.map((item, order) => <g key={item.key}>
        {item.lines.map((line, index) => <motion.rect key={index} x={line.x * width - 2} y={line.y * height + line.height * height * .08} height={line.height * height * .86} rx={3} fill={KIND_INK[item.kind].marker} style={{ mixBlendMode: "multiply" }}
          initial={reduced ? false : { width: 0 }} animate={{ width: line.width * width + 4 }} transition={{ delay: .08 * order + index * .06, duration: .35, ease: "easeOut" }}/>)}
        {!compact && (() => { const target = item.side === "left" ? noteLeft("left") + noteWidth + 4 : noteLeft("right") - 4, x0 = item.anchorX + (item.side === "left" ? -3 : 3);
          return <motion.g initial={reduced ? false : { opacity: 0 }} animate={{ opacity: .85 }} transition={{ delay: .08 * order + .25 }}><circle cx={x0} cy={item.anchorY} r={2.2} fill={KIND_INK[item.kind].ink}/><path d={leader(x0, item.anchorY, target, item.noteY + 9)} fill="none" stroke={KIND_INK[item.kind].ink} strokeWidth={1} strokeLinejoin="round"/></motion.g>; })()}
      </g>)}
    </svg>
    {!compact && (first || pageGuide) && <motion.div ref={column} className="pf-guide-column" style={{ left: noteLeft("left"), width: noteWidth }} initial={reduced ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 240, damping: 26 }}>
      {first && <section className="pf-guide-flow">
        <h4>이 논문은?</h4>
        <p>{guide.data.definition}</p>
        {guide.data.takeaway && <p className="pf-guide-flow-take">{guide.data.takeaway}</p>}
      </section>}
      {pageGuide && <section className="pf-guide-page">
        <h4><span>p.{pageGuide.page}</span>{SECTION_LABEL[pageGuide.section]}</h4>
        <p className="pf-guide-page-summary">{pageGuide.about}</p>
        {pageGuide.key && <p className="pf-guide-page-key"><b>핵심</b>{pageGuide.key}</p>}
        {pageGuide.numbers.length > 0 && <ul className="pf-guide-page-numbers">{pageGuide.numbers.map(number => <li key={number}>{number}</li>)}</ul>}
      </section>}
    </motion.div>}
    {placed.map((item, order) => compact
      ? <button key={item.key} type="button" className="pf-guide-pin" style={{ top: item.anchorY - 11, left: item.side === "left" ? 4 : width - 26, background: KIND_INK[item.kind].ink }} onClick={() => setOpen(open === item.key ? null : item.key)} aria-label={`가이드 메모 ${item.index + 1}`}>{item.index + 1}
          {open === item.key && <span className="pf-guide-pin-note" style={{ color: KIND_INK[item.kind].ink, [item.side === "left" ? "left" : "right"]: 0 }}>{item.note}</span>}</button>
      : <motion.p key={item.key} className="pf-guide-margin" data-side={item.side} style={{ top: item.noteY, left: noteLeft(item.side), width: noteWidth, borderColor: KIND_INK[item.kind].ink }}
          initial={reduced ? false : { opacity: 0, x: item.side === "left" ? 8 : -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .08 * order + .32, type: "spring", stiffness: 260, damping: 26 }}>
          <small style={{ color: KIND_INK[item.kind].ink }}>{KIND_INK[item.kind].label}</small>{item.note}
        </motion.p>)}
  </div>;
}
