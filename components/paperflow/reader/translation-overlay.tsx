"use client";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslationStore, visibleTranslations } from "@/lib/paperflow/translation/translation-store";
import { cachedPageLayout, pageLayout } from "@/lib/paperflow/typeset/layout-cache";
import { paperFontStack } from "@/lib/paperflow/typeset/measure";
import type { PageLayout, Rect } from "@/lib/paperflow/typeset/page-typesetter";
import type { ScriptTable } from "@/lib/paperflow/typeset/scripts";
import { inkColor, styledPieces } from "@/lib/paperflow/typeset/ink";
import { manualTargets } from "@/lib/paperflow/translation/manual-targets";

export { inkColor };

/**
 * Layout is in PDF points and is painted at the page's own pixel scale. A scaled-down layer
 * loses LCD antialiasing, and unhinted stems then land on different pixel phases: some
 * syllables come out visibly darker than their neighbours. Only very small zoom levels
 * paint larger and scale down, so captions never hit a browser minimum font size.
 */
const MIN_PAINT_SCALE = 1;

/**
 * One small read of the rendered page; every mask takes the paper colour under its own text: the most
 * common light colour there (a grey table header stays grey), not the lightest pixel nearby, which
 * may be the white paper beside a shaded cell.
 */
function backgroundSampler(canvas: HTMLCanvasElement, width: number, height: number) {
  const columns = 240, rows = Math.max(1, Math.round(columns * height / width));
  const probe = document.createElement("canvas"); probe.width = columns; probe.height = rows;
  const context = probe.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width) return () => "#fff";
  context.drawImage(canvas, 0, 0, columns, rows);
  const data = context.getImageData(0, 0, columns, rows).data;
  return (rect: Rect) => {
    const x0 = Math.max(0, Math.floor(rect.x / width * columns)), x1 = Math.min(columns - 1, Math.ceil((rect.x + rect.width) / width * columns));
    const y0 = Math.max(0, Math.floor(rect.y / height * rows)), y1 = Math.min(rows - 1, Math.ceil((rect.y + rect.height) / height * rows));
    let lightest = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const offset = (y * columns + x) * 4; lightest = Math.max(lightest, data[offset] + data[offset + 1] + data[offset + 2]); }
    const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const offset = (y * columns + x) * 4, r = data[offset], g = data[offset + 1], b = data[offset + 2];
      // Glyph pixels (and anti-aliased glyph edges) are not paper.
      if (r + g + b < lightest - 90) continue;
      const key = (r >> 3) << 10 | (g >> 3) << 5 | b >> 3, bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bin.count++; bin.r += r; bin.g += g; bin.b += b; bins.set(key, bin);
    }
    let best: { count: number; r: number; g: number; b: number } | null = null;
    for (const bin of bins.values()) if (!best || bin.count > best.count) best = bin;
    return best ? `rgb(${Math.round(best.r / best.count)},${Math.round(best.g / best.count)},${Math.round(best.b / best.count)})` : "#fff";
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

interface Props { documentId: string; pageIndex: number; scale: number; canvas: HTMLCanvasElement | null; canvasVersion: number; referenceColor?: string; citationColor?: string; onState?: (state: OverlayState) => void; onOriginal: (unitId: string) => void; onRetry: (unitId: string) => void }

/**
 * Scripts as the paper prints them (CO₂, Kᵢ, m², raised citations), then link colours on
 * references, as the journal did. Widths were measured with the same segments.
 */
function paintText(text: string, scripts: ScriptTable | undefined, referenceColor: string | undefined, citationColor: string | undefined) {
  const pieces = styledPieces(text, scripts, referenceColor, citationColor);
  if (pieces.length === 1 && !pieces[0].kind && !pieces[0].color) return text;
  return pieces.map((piece, index) => piece.kind || piece.color ? <span key={index} className={piece.kind === "sub" ? "pf-sub" : piece.kind === "sup" ? "pf-sup" : undefined} style={piece.color ? { color: piece.color } : undefined}>{piece.text}</span> : piece.text);
}

export const TranslationOverlay = memo(function TranslationOverlay({ pageIndex, scale, canvas, canvasVersion, referenceColor, citationColor, onState, onRetry }: Props) {
  const version = useTranslationStore(state => state.pageVersions[pageIndex] ?? 0);
  const manifest = useTranslationStore(state => state.manifest);
  const paint = (text: string, colored: boolean) => paintText(text, manifest?.scripts, colored ? referenceColor : undefined, colored ? citationColor : undefined);
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
    if (!state.manifest) return "0||";
    const units = state.manifest.units.filter(unit => unit.pages.includes(pageIndex));
    // A table being translated is named ("Table 2 번역 중"), not counted as paragraphs.
    const tables = manualTargets(state.manifest, pageIndex).filter(target => target.kind === "table" && target.units.some(id => state.pending.has(id)));
    const inTables = new Set(tables.flatMap(target => target.units));
    return `${units.filter(unit => state.pending.has(unit.id) && !inTables.has(unit.id)).length}|${units.filter(unit => state.failed.has(unit.id)).map(unit => unit.id).join(",")}|${tables.map(target => target.label).join(", ")}`;
  });
  const [pendingCount, failedList, pendingTables] = status.split("|"), pending = Number(pendingCount), failed = failedList ? failedList.split(",") : [];

  const headingInk = useMemo(() => {
    if (!layout || !canvas || !canvasVersion) return new Map<string, string>();
    return new Map(layout.units.filter(unit => layout.lines.some(line => line.unitId === unit.unitId && line.kind === "heading")).flatMap(unit => { const color = inkColor(canvas, unit.box, layout.width); return color ? [[unit.unitId, color] as const] : []; }));
  }, [layout, canvas, canvasVersion]);

  // At reading sizes the browser rounds glyph advances, so a painted line runs up to ~2% wider
  // or narrower than its linear measurement. Read each line once after paint and spread the
  // difference over its glyphs: that is where the drift comes from, and word gaps stay even.
  const root = useRef<HTMLDivElement>(null);
  const K = Math.max(scale, MIN_PAINT_SCALE);
  useLayoutEffect(() => {
    if (!layout || !root.current) return;
    const nodes = root.current.querySelectorAll<HTMLElement>(".pf-tx-line");
    // React leaves an unchanged style prop alone, so undo an earlier correction before measuring.
    nodes.forEach(node => { node.style.letterSpacing = `${node.dataset.ls}px`; node.style.wordSpacing = `${node.dataset.ws}px`; });
    const ratio = root.current.getBoundingClientRect().width / Math.max(1, root.current.offsetWidth);
    // The line box is as wide as its measure (so a press beside short text still lands on it): read the text's own width.
    const widths = Array.from(nodes, node => { const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect().width / ratio; });
    nodes.forEach((node, index) => {
      const target = Number(node.dataset.w), text = node.textContent ?? "", chars = [...text].length;
      const error = target - widths[index] + Number(node.dataset.ls ?? 0), size = Number(node.style.fontSize.replace("px", ""));
      const justified = node.dataset.justify === "1";
      // A ragged last line may end short; it must never run long. Anything beyond drift is a layout decision.
      if (!justified && error >= 0 || Math.abs(error) > Math.max(size * 1.2, target * .06)) return;
      if (chars > 1) node.style.letterSpacing = `${Number(node.dataset.ls) + error / (chars - 1)}px`;
    });
  }, [layout, K]);

  const byUnit = useMemo(() => {
    const groups = new Map<string, PageLayout["lines"]>();
    for (const line of layout?.lines ?? []) groups.set(line.unitId, [...(groups.get(line.unitId) ?? []), line]);
    return groups;
  }, [layout]);

  return <>
    {layout && <div ref={root} className="pf-tx-layer" data-unfit={layout.unfit.length || undefined} data-body-scale={layout.bodyScale} style={{ width: layout.width * K, height: layout.height * K, transform: K === scale ? undefined : `scale(${scale / K})`, fontFamily: paperFontStack() }}>
      {layout.masks.map((mask, index) => <div key={index} className="pf-tx-mask" style={{ left: mask.x * K, top: mask.y * K, width: mask.width * K, height: mask.height * K, background: colors?.[index] ?? "#fff" }}/>)}
      {[...byUnit].map(([unitId, lines]) => <div key={unitId} className="pf-tx-unit" data-paragraph-id={unitId} data-kind={lines[0].kind}>
        {lines.map((line, index) => <span key={index} className="pf-tx-line" data-w={(line.width * K).toFixed(2)} data-ws={(line.wordSpacing * K).toFixed(3)} data-ls={(line.letterSpacing * K).toFixed(3)} data-justify={line.wordSpacing || line.letterSpacing ? "1" : "0"} style={{ left: line.x * K, top: (line.y - line.fontSize * .08 - Math.max(0, line.lineHeight - line.fontSize * 1.15) / 2) * K, width: line.width * K, fontSize: line.fontSize * K, lineHeight: `${Math.max(line.lineHeight, line.fontSize * 1.15) * K}px`, wordSpacing: line.wordSpacing * K, letterSpacing: line.letterSpacing * K, fontWeight: line.bold ? 700 : 400, fontFamily: line.sans ? paperFontStack(true) : undefined, color: line.kind === "heading" ? headingInk.get(unitId) : undefined }}>{line.runs.map((run, part) => run.bold && !line.bold ? <b key={part}>{paint(run.text, line.kind === "body")}</b> : <span key={part}>{paint(run.text, line.kind !== "heading")}</span>)}</span>)}
      </div>)}
    </div>}
    {(pending > 0 || pendingTables || failed.length > 0) && <div className="pf-tx-page-status" role="status">
      {pendingTables && <span><i className="pf-loader" aria-hidden="true"/>{pendingTables} 번역 중</span>}
      {pending > 0 && <span><i className="pf-loader" aria-hidden="true"/>이 페이지 {pending}문단 번역 중</span>}
      {failed.length > 0 && <button type="button" onClick={() => failed.forEach(onRetry)}>{failed.length}문단 실패 · 다시 시도</button>}
    </div>}
  </>;
});
