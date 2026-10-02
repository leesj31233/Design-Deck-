"use client";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslationStore, visibleTranslations } from "@/lib/paperflow/translation/translation-store";
import { cachedPageLayout, pageLayout } from "@/lib/paperflow/typeset/layout-cache";
import { paperFontStack } from "@/lib/paperflow/typeset/measure";
import type { PageLayout, Rect } from "@/lib/paperflow/typeset/page-typesetter";

/** Layout is in PDF points; render at 4× and scale down so tiny captions never hit the browser's minimum font size. */
const K = 4;

/** One small read of the rendered page; every mask takes the paper colour under its own text. */
function backgroundSampler(canvas: HTMLCanvasElement, width: number, height: number) {
  const columns = 120, rows = Math.max(1, Math.round(columns * height / width));
  const probe = document.createElement("canvas"); probe.width = columns; probe.height = rows;
  const context = probe.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width) return () => "#fff";
  context.drawImage(canvas, 0, 0, columns, rows);
  const data = context.getImageData(0, 0, columns, rows).data;
  return (rect: Rect) => {
    let best = -1, color = "#fff";
    const x0 = Math.max(0, Math.floor(rect.x / width * columns)), x1 = Math.min(columns - 1, Math.ceil((rect.x + rect.width) / width * columns));
    const y0 = Math.max(0, Math.floor(rect.y / height * rows)), y1 = Math.min(rows - 1, Math.ceil((rect.y + rect.height) / height * rows));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const offset = (y * columns + x) * 4, light = data[offset] + data[offset + 1] + data[offset + 2];
      if (light > best) { best = light; color = `rgb(${data[offset]},${data[offset + 1]},${data[offset + 2]})`; }
    }
    return color;
  };
}

export type OverlayState = "none" | "pending" | "ready" | "error";
/** Ink probe on the rendered page: any pixel clearly darker than the paper around it. */
function inkProbe(canvas: HTMLCanvasElement, width: number) {
  return (rect: Rect) => {
    if (!canvas.width) return true;
    const ratio = canvas.width / width, x = Math.max(0, Math.floor(rect.x * ratio)), y = Math.max(0, Math.floor(rect.y * ratio));
    const w = Math.min(canvas.width - x, Math.ceil(rect.width * ratio)), h = Math.min(canvas.height - y, Math.ceil(rect.height * ratio));
    if (w < 1 || h < 1) return true;
    try { return hasInk(canvas.getContext("2d", { willReadFrequently: true })!.getImageData(x, y, w, h).data, w * h); } catch { return true; }
  };
}
function hasInk(data: Uint8ClampedArray, pixels: number) {
  let paper = 0, ink = 0;
  for (let offset = 0; offset < data.length; offset += 4) paper = Math.max(paper, data[offset] + data[offset + 1] + data[offset + 2]);
  for (let offset = 0; offset < data.length; offset += 4) if (data[offset] + data[offset + 1] + data[offset + 2] < paper - 110) ink++;
  return ink > Math.max(2, pixels * .0015);
}

/** Figure / table / equation references and bracketed citations inside translated prose. */
const REFERENCE = /((?:Figures?|Figs?\.|Tables?|Equations?|Eqs?\.|eqs?)\s*\(?\d+[a-z]?\)?(?:\s*(?:and|,|–|-)\s*\(?\d+[a-z]?\)?)*|\[\d+(?:\s*[,–-]\s*\d+)*\])/;

/** Dominant ink colour of a source heading (journal headings are often blue). */
export function inkColor(canvas: HTMLCanvasElement, rect: Rect, width: number) {
  const ratio = canvas.width / width, x = Math.max(0, Math.floor(rect.x * ratio)), y = Math.max(0, Math.floor(rect.y * ratio));
  const w = Math.min(canvas.width - x, Math.ceil(rect.width * ratio)), h = Math.min(canvas.height - y, Math.ceil(rect.height * ratio));
  if (w < 2 || h < 2 || w * h > 400_000) return undefined;
  try {
    const data = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(x, y, w, h).data, votes = new Map<string, number>();
    for (let offset = 0; offset < data.length; offset += 12) {
      const r = data[offset], g = data[offset + 1], b = data[offset + 2];
      if (Math.min(r, g, b) > 200) continue;
      const key = [r, g, b].map(value => Math.round(value / 24) * 24).join(",");
      votes.set(key, (votes.get(key) ?? 0) + 1);
    }
    const best = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
    return best ? `rgb(${best})` : undefined;
  } catch { return undefined; }
}

interface Props { documentId: string; pageIndex: number; scale: number; canvas: HTMLCanvasElement | null; canvasVersion: number; referenceColor?: string; citationColor?: string; onState?: (state: OverlayState) => void; onOriginal: (unitId: string) => void; onRetry: (unitId: string) => void }

export const TranslationOverlay = memo(function TranslationOverlay({ pageIndex, scale, canvas, canvasVersion, referenceColor, citationColor, onState, onOriginal, onRetry }: Props) {
  // Colour only the reference itself, as the journal did; the measured width is unchanged.
  const paint = (text: string) => !referenceColor && !citationColor ? text : text.split(REFERENCE).map((piece, index) => index % 2 ? <span key={index} style={{ color: piece.startsWith("[") ? citationColor : referenceColor }}>{piece}</span> : piece);
  const version = useTranslationStore(state => state.pageVersions[pageIndex] ?? 0);
  const manifest = useTranslationStore(state => state.manifest);
  const [layout, setLayout] = useState<PageLayout | null>(() => manifest ? cachedPageLayout(manifest, pageIndex, visibleTranslations(useTranslationStore.getState())) ?? null : null);
  const [typesetFailed, setTypesetFailed] = useState(false);
  useEffect(() => {
    if (!manifest) return;
    let alive = true;
    const visible = visibleTranslations(useTranslationStore.getState());
    const hit = cachedPageLayout(manifest, pageIndex, visible);
    if (hit !== undefined) { setLayout(hit); setTypesetFailed(false); return; }
    // The ink probe reads the rendered page, so wait for the canvas.
    if (!canvas?.width) return;
    onState?.("pending");
    void pageLayout(manifest, pageIndex, visible, inkProbe(canvas, manifest.pages[pageIndex].width)).then(result => {
      if (alive) { setLayout(result); setTypesetFailed(false); }
    }).catch(error => {
      // Never leave a blank page: report and fall back to the original.
      console.error(`PAPERFLOW: page ${pageIndex + 1} typesetting failed`, error);
      if (alive) { setLayout(null); setTypesetFailed(true); }
    });
    return () => { alive = false; };
  }, [manifest, pageIndex, version, onState, canvas, canvasVersion]);
  useEffect(() => { onState?.(typesetFailed ? "error" : layout ? "ready" : "none"); }, [layout, typesetFailed, onState]);

  const colors = useMemo(() => {
    if (!layout || !canvas || !canvasVersion) return null;
    const sample = backgroundSampler(canvas, layout.width, layout.height);
    return layout.masks.map(sample);
  }, [layout, canvas, canvasVersion]);

  // A primitive selector: the page re-renders only when its own pending/failed set changes.
  const status = useTranslationStore(state => {
    if (!state.manifest) return "0|";
    const units = state.manifest.units.filter(unit => unit.pages.includes(pageIndex));
    return `${units.filter(unit => state.pending.has(unit.id)).length}|${units.filter(unit => state.failed.has(unit.id)).map(unit => unit.id).join(",")}`;
  });
  const [pendingCount, failedList] = status.split("|"), pending = Number(pendingCount), failed = failedList ? failedList.split(",") : [];

  const headingInk = useMemo(() => {
    if (!layout || !canvas || !canvasVersion) return new Map<string, string>();
    return new Map(layout.units.filter(unit => layout.lines.some(line => line.unitId === unit.unitId && line.kind === "heading")).flatMap(unit => { const color = inkColor(canvas, unit.box, layout.width); return color ? [[unit.unitId, color] as const] : []; }));
  }, [layout, canvas, canvasVersion]);

  // Canvas and DOM shaping can still differ by a fraction of a point: read each line once
  // after paint and nudge its spacing so justified lines end exactly on the column edge.
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!layout || !root.current) return;
    const nodes = root.current.querySelectorAll<HTMLElement>(".pf-tx-line");
    const widths = Array.from(nodes, node => node.offsetWidth);
    nodes.forEach((node, index) => {
      const target = Number(node.dataset.w), text = node.textContent ?? "", spaces = (text.match(/ /g) ?? []).length, chars = [...text].length;
      const error = target - widths[index] + Number(node.dataset.ls ?? 0), size = Number(node.style.fontSize.replace("px", ""));
      const justified = node.dataset.justify === "1";
      // Only correct shaping drift; a gap bigger than ~an em is a layout decision, not drift.
      if (!justified && error >= 0 || Math.abs(error) > size * 1.2) return;
      if (spaces && Math.abs(error / spaces) < size * .5) node.style.wordSpacing = `${Number(node.dataset.ws) + error / spaces}px`;
      else if (chars > 1) node.style.letterSpacing = `${Number(node.dataset.ls) + error / (chars - 1)}px`;
    });
  }, [layout]);

  const byUnit = useMemo(() => {
    const groups = new Map<string, PageLayout["lines"]>();
    for (const line of layout?.lines ?? []) groups.set(line.unitId, [...(groups.get(line.unitId) ?? []), line]);
    return groups;
  }, [layout]);

  return <>
    {layout && <div ref={root} className="pf-tx-layer" data-unfit={layout.unfit.length || undefined} data-body-scale={layout.bodyScale} style={{ width: layout.width * K, height: layout.height * K, transform: `scale(${scale / K})`, fontFamily: paperFontStack() }}>
      {layout.masks.map((mask, index) => <div key={index} className="pf-tx-mask" style={{ left: mask.x * K, top: mask.y * K, width: mask.width * K, height: mask.height * K, background: colors?.[index] ?? "#fff" }}/>)}
      {[...byUnit].map(([unitId, lines]) => <div key={unitId} className="pf-tx-unit" data-paragraph-id={unitId} data-kind={lines[0].kind}>
        {lines.map((line, index) => <span key={index} className="pf-tx-line" data-w={(line.width * K).toFixed(2)} data-ws={(line.wordSpacing * K).toFixed(3)} data-ls={(line.letterSpacing * K).toFixed(3)} data-justify={line.wordSpacing || line.letterSpacing ? "1" : "0"} style={{ left: line.x * K, top: (line.y - line.fontSize * .08) * K, fontSize: line.fontSize * K, lineHeight: `${line.fontSize * 1.15 * K}px`, wordSpacing: line.wordSpacing * K, letterSpacing: line.letterSpacing * K, fontWeight: line.bold ? 700 : 400, fontFamily: line.sans ? paperFontStack(true) : undefined, color: line.kind === "heading" ? headingInk.get(unitId) : undefined }}>{line.runs.map((run, part) => run.bold && !line.bold ? <b key={part}>{line.kind === "body" ? paint(run.text) : run.text}</b> : <span key={part}>{line.kind === "heading" ? run.text : paint(run.text)}</span>)}</span>)}
        <button type="button" className="pf-tx-original" style={{ left: (lines[0].x + lines[0].width) * K - 150, top: lines[0].y * K - 76 }} onClick={() => onOriginal(unitId)} aria-label="이 문단 원문 보기">원문</button>
      </div>)}
    </div>}
    {(pending > 0 || failed.length > 0) && <div className="pf-tx-page-status" role="status">
      {pending > 0 && <span><i className="pf-loader" aria-hidden="true"/>이 페이지 {pending}문단 번역 중</span>}
      {failed.length > 0 && <button type="button" onClick={() => failed.forEach(onRetry)}>{failed.length}문단 실패 · 다시 시도</button>}
    </div>}
  </>;
});
