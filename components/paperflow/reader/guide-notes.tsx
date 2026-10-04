"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { useTranslationStore } from "@/lib/paperflow/translation/translation-store";
import { loadGuide } from "@/lib/paperflow/guide/client";
import type { GuideKind } from "@/lib/paperflow/guide/guide";
import type { ParagraphLine } from "@/lib/paperflow/layout/types";
import { quoteLines } from "./guide-marks";

/** Ink per kind of note: marker colour on the sentence, pen colour in the margin. */
export const KIND_INK: Record<GuideKind, { ink: string; marker: string; label: string }> = {
  result: { ink: "#d9480f", marker: "rgba(255,146,43,.30)", label: "핵심 결과" },
  number: { ink: "#1864ab", marker: "rgba(77,171,247,.28)", label: "수치" },
  method: { ink: "#2b8a3e", marker: "rgba(105,219,124,.30)", label: "방법" },
  limitation: { ink: "#862e9c", marker: "rgba(218,119,242,.26)", label: "한계" },
  definition: { ink: "#0b7285", marker: "rgba(59,201,219,.26)", label: "정의" }
};
export const NOTE_GUTTER = 176;

type Placed = { key: string; index: number; kind: GuideKind; note: string; lines: ParagraphLine[]; side: "left" | "right"; anchorX: number; anchorY: number; noteY: number };

/** A tapered "dragon tail" stroke from the sentence to its note: thin start, full body, arrowhead. */
function tail(x0: number, y0: number, x1: number, y1: number) {
  const dir = Math.sign(x1 - x0) || 1, bend = Math.max(28, Math.abs(x1 - x0) * .5);
  const c1 = { x: x0 + dir * bend, y: y0 - 10 }, c2 = { x: x1 - dir * bend * .8, y: y1 + 6 };
  const at = (t: number) => { const u = 1 - t; return { x: u * u * u * x0 + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * x1, y: u * u * u * y0 + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * y1 }; };
  const left: string[] = [], right: string[] = [], steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps * .92, p = at(t), q = at(Math.min(1, t + .01)), dx = q.x - p.x, dy = q.y - p.y, length = Math.hypot(dx, dy) || 1;
    const width = .6 + 3.2 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** .7;
    left.push(`${(p.x - dy / length * width / 2).toFixed(1)},${(p.y + dx / length * width / 2).toFixed(1)}`);
    right.unshift(`${(p.x + dy / length * width / 2).toFixed(1)},${(p.y - dx / length * width / 2).toFixed(1)}`);
  }
  const end = at(1), before = at(.9), angle = Math.atan2(end.y - before.y, end.x - before.x), size = 7;
  const head = [[end.x, end.y], [end.x - size * Math.cos(angle - .45), end.y - size * Math.sin(angle - .45)], [end.x - size * Math.cos(angle + .45), end.y - size * Math.sin(angle + .45)]].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return { body: `M${left.join(" L")} L${right.join(" L")} Z`, head };
}

/**
 * The AI guide written on the paper like a careful reader's notes: the key sentence gets a soft
 * marker stroke, a tapered arrow swings out to the margin, and a short handwritten note in the
 * colour of its kind sits beside the page. Page 1 also carries the paper's storyline.
 */
export function GuideNotes({ documentId, pageIndex, width, height, room }: { documentId: string; pageIndex: number; width: number; height: number; room: number }) {
  const on = useReaderStore(s => s.guideOverlay), reduced = useReducedMotion();
  const manifest = useTranslationStore(s => s.manifest?.documentId === documentId ? s.manifest : null);
  const guide = useQuery({ queryKey: ["guide", documentId], queryFn: () => loadGuide(documentId), enabled: on });
  const [open, setOpen] = useState<string | null>(null);
  const compact = room < 120;

  const placed = useMemo<Placed[]>(() => {
    if (!guide.data || !manifest) return [];
    const items: Placed[] = [];
    guide.data.findings.forEach((finding, index) => {
      if (finding.page - 1 !== pageIndex) return;
      const blocks = manifest.blocks.filter(block => block.unitId === finding.unitId && block.pageIndex === pageIndex);
      const quoted = blocks.map(block => quoteLines(block.text, block.lines, finding.quote)).find(Boolean);
      const lines = quoted ?? blocks.flatMap(block => block.lines.slice(0, 2));
      if (!lines.length) return;
      const minX = Math.min(...lines.map(line => line.x)), maxX = Math.max(...lines.map(line => line.x + line.width));
      const top = Math.min(...lines.map(line => line.y)), bottom = Math.max(...lines.map(line => line.y + line.height));
      const side = (minX + maxX) / 2 < .5 ? "left" : "right";
      items.push({ key: `${finding.unitId}-${index}`, index, kind: finding.kind, note: finding.note, lines, side, anchorX: (side === "left" ? minX : maxX) * width, anchorY: (top + bottom) / 2 * height, noteY: (top + bottom) / 2 * height });
    });
    // Notes on one side never overlap: each starts below the one before it.
    for (const side of ["left", "right"] as const) {
      let floor = side === "left" && pageIndex === 0 && guide.data.flow.length ? 40 + guide.data.flow.length * 26 + 70 : 8;
      for (const item of items.filter(entry => entry.side === side).sort((a, b) => a.anchorY - b.anchorY)) { item.noteY = Math.max(item.noteY - 14, floor); floor = item.noteY + 22 + Math.ceil(item.note.length / 9) * 22; }
    }
    return items;
  }, [guide.data, manifest, pageIndex, width, height]);

  if (!on || !guide.data) return null;
  const noteWidth = Math.min(NOTE_GUTTER - 24, Math.max(100, room - 20));
  const noteLeft = (side: "left" | "right") => side === "left" ? -noteWidth - 14 : width + 14;
  const flow = pageIndex === 0 && guide.data.flow.length > 0;

  return <div className="pf-guide-notes" style={{ width, height }} aria-label="AI 가이드 필기">
    <svg className="pf-guide-ink" width={width} height={height} style={{ overflow: "visible" }} aria-hidden="true">
      {placed.map((item, order) => <g key={item.key}>
        {item.lines.map((line, index) => <motion.rect key={index} x={line.x * width - 2} y={line.y * height + line.height * height * .08} height={line.height * height * .86} rx={3} fill={KIND_INK[item.kind].marker} style={{ mixBlendMode: "multiply", transformOrigin: `${line.x * width}px 0px` }}
          initial={reduced ? false : { width: 0 }} animate={{ width: line.width * width + 4 }} transition={{ delay: .08 * order + index * .06, duration: .35, ease: "easeOut" }}/>)}
        {!compact && (() => { const target = item.side === "left" ? noteLeft("left") + noteWidth + 4 : noteLeft("right") - 4, path = tail(item.anchorX + (item.side === "left" ? -3 : 3), item.anchorY, target, item.noteY + 12);
          return <motion.g initial={reduced ? false : { opacity: 0 }} animate={{ opacity: .9 }} transition={{ delay: .08 * order + .25 }}><path d={path.body} fill={KIND_INK[item.kind].ink}/><polygon points={path.head} fill={KIND_INK[item.kind].ink}/></motion.g>; })()}
      </g>)}
    </svg>
    {!compact && flow && <motion.div className="pf-guide-flow" style={{ left: noteLeft("left"), width: noteWidth }} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <b>논문 흐름</b>
      {guide.data.flow.map((step, index) => <span key={step + index}>{index > 0 && <i>↓</i>}{step}</span>)}
      {guide.data.takeaway && <em>★ {guide.data.takeaway}</em>}
    </motion.div>}
    {placed.map((item, order) => compact
      ? <button key={item.key} type="button" className="pf-guide-pin" style={{ top: item.anchorY - 11, left: item.side === "left" ? 4 : width - 26, background: KIND_INK[item.kind].ink }} onClick={() => setOpen(open === item.key ? null : item.key)} aria-label={`가이드 메모 ${item.index + 1}`}>{item.index + 1}
          {open === item.key && <span className="pf-guide-pin-note" style={{ color: KIND_INK[item.kind].ink, [item.side === "left" ? "left" : "right"]: 0 }}>{item.note}</span>}</button>
      : <motion.p key={item.key} className="pf-guide-note-hand" data-side={item.side} style={{ top: item.noteY, left: noteLeft(item.side), width: noteWidth, color: KIND_INK[item.kind].ink }}
          initial={reduced ? false : { opacity: 0, x: item.side === "left" ? 8 : -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .08 * order + .32, type: "spring", stiffness: 260, damping: 26 }}>
          <small>{KIND_INK[item.kind].label}</small>{item.note}
        </motion.p>)}
  </div>;
}
