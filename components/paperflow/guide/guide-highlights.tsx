"use client";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadGuide } from "@/lib/paperflow/guide/client";
import { koreanFor, locateQuote, useGuideAnchors, type MarkAnchor, readingAnchor, useGuideReading, useAskMarks } from "@/lib/paperflow/guide/locate";
import type { GuideMark, MarkKind } from "@/lib/paperflow/guide/guide";
import { textIndex } from "@/lib/paperflow/pdf/selection-geometry";
import { textRectsOf } from "@/lib/paperflow/pdf/selection-guard";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { useTranslationStore } from "@/lib/paperflow/translation/translation-store";
import "./guide.css";

type Box = { x: number; y: number; width: number; height: number };
/** Where a mark ends as read: the right end of its lowest line (text-layer boxes are not always in reading order). */
const endOf = (boxes: Box[]) => { const bottom = Math.max(...boxes.map(box => box.y)), line = boxes.filter(box => box.y > bottom - box.height * .5); return line.reduce((best, box) => box.x + box.width > best.x + best.width ? box : best, line[0]); };
interface Placed { key: string; number: number; kind: MarkKind | "ask"; boxes: Box[]; flash?: boolean; /** Badge text when it is not the guide number (an answer's "Q1"). */ label?: string }

/** Screen rects of a Korean sentence inside a translated paragraph's lines on this page. */
function koreanRects(surface: HTMLElement, unitId: string, sentence: string): DOMRect[] {
  const lines = [...surface.querySelectorAll<HTMLElement>(`.pf-tx-unit[data-paragraph-id="${CSS.escape(unitId)}"] .pf-tx-line`)];
  if (!lines.length) return [];
  // Compare without spaces: the line breaker drops the space where a line wraps.
  const map: { node: Text; offset: number }[] = [];
  let compact = "";
  for (const line of lines) {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { const node = walker.currentNode as Text; for (let at = 0; at < node.data.length; at++) if (!/\s/.test(node.data[at])) { compact += node.data[at]; map.push({ node, offset: at }); } }
  }
  const needle = sentence.replace(/\s+/g, "");
  let start = compact.indexOf(needle), length = needle.length;
  // The page may hold only the start or the end of the sentence (a paragraph across pages).
  if (start < 0) { const head = needle.slice(0, 18); start = head.length >= 8 ? compact.indexOf(head) : -1; length = start >= 0 ? Math.min(needle.length, compact.length - start) : 0; }
  if (start < 0) { const tail = needle.slice(-18); const at = tail.length >= 8 ? compact.indexOf(tail) : -1; if (at >= 0 && at + tail.length <= needle.length + at) { start = Math.max(0, at + tail.length - needle.length); length = at + tail.length - start; } }
  if (start < 0 || !length) return [];
  const range = document.createRange(), from = map[start], to = map[Math.min(map.length - 1, start + length - 1)];
  range.setStart(from.node, from.offset); range.setEnd(to.node, to.offset + 1);
  return textRectsOf(range);
}

/** Merge rects of one visual line into a single band. */
function bands(rects: Box[]): Box[] {
  const sorted = [...rects].filter(rect => rect.width > .001 && rect.height > .001).sort((a, b) => a.y - b.y || a.x - b.x), out: Box[] = [];
  for (const rect of sorted) {
    const last = out.at(-1);
    if (last && Math.abs(last.y + last.height / 2 - (rect.y + rect.height / 2)) < Math.min(last.height, rect.height) * .5 && rect.x - (last.x + last.width) < .02) {
      const right = Math.max(last.x + last.width, rect.x + rect.width), top = Math.min(last.y, rect.y), bottom = Math.max(last.y + last.height, rect.y + rect.height);
      last.x = Math.min(last.x, rect.x); last.width = right - last.x; last.y = top; last.height = bottom - top;
    } else out.push({ ...rect });
  }
  return out;
}

/**
 * The guide's highlights on one page, laid exactly on the glyphs they mark: the quoted English span,
 * or on a translated paragraph the Korean sentence that translates it. Drawn like a highlighter
 * under the ink (multiply), so the text reads clearer, never washed over. Each mark gets a number
 * that its margin note repeats.
 */
export function GuideHighlights({ documentId, pageIndex, surface, layer, textReady, overlayReady, scale }: { documentId: string; pageIndex: number; surface: React.RefObject<HTMLDivElement | null>; layer: React.RefObject<HTMLDivElement | null>; textReady: boolean; overlayReady: boolean; scale: number }) {
  const active = useGuideReading(state => state.active);
  const on = useReaderStore(s => s.guideOverlay), layers = useReaderStore(s => s.guideLayers), focus = useReaderStore(s => s.guideFocus);
  const guide = useQuery({ queryKey: ["guide", documentId], queryFn: () => loadGuide(documentId), enabled: on });
  const marks = useMemo(() => (guide.data?.pages.find(page => page.page === pageIndex + 1)?.marks ?? []).filter(mark => layers.kinds.includes(mark.kind)), [guide.data, pageIndex, layers.kinds]);
  const focused = focus && focus.page === pageIndex + 1 && focus.quote ? focus : null;
  // An answer's evidence shows whether or not the guide is on.
  const askAll = useAskMarks(state => state.documentId === documentId ? state.marks : null);
  const asks = useMemo(() => (askAll ?? []).filter(mark => mark.page === pageIndex + 1), [askAll, pageIndex]);
  const guideMarks = useMemo(() => on && layers.marks ? marks : [], [on, layers.marks, marks]);
  // Which marked paragraphs show Korean right now: the highlight follows the visible text.
  const shownKey = useTranslationStore(state => [...marks.map(mark => mark.unitId), ...asks.map(mark => mark.unitId), focused?.unitId ?? ""].map(id => state.showTranslations && state.texts.has(id) && !state.hidden.has(id) ? "k" : "e").join(""));
  const [placed, setPlaced] = useState<Placed[]>([]);

  useLayoutEffect(() => {
    const page = surface.current, text = layer.current;
    if (!page || !text || !textReady || (!guideMarks.length && !focused && !asks.length)) { setPlaced([]); useGuideAnchors.getState().set(pageIndex, []); return; }
    let frame = 0;
    // Two frames: the Korean layer settles its letter spacing after its first paint.
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
      const bounds = page.getBoundingClientRect(), index = textIndex(text, page), store = useTranslationStore.getState();
      const toBox = (rect: DOMRect): Box => ({ x: (rect.left - bounds.left) / bounds.width, y: (rect.top - bounds.top) / bounds.height, width: rect.width / bounds.width, height: rect.height / bounds.height });
      const place = (mark: Pick<GuideMark, "unitId" | "quote">): Box[] => {
        const korean = store.showTranslations && store.texts.has(mark.unitId) && !store.hidden.has(mark.unitId) ? store.texts.get(mark.unitId)! : null;
        if (korean) {
          const english = store.manifest?.units.find(unit => unit.id === mark.unitId)?.text ?? "";
          const sentence = koreanFor(english, korean, mark.quote);
          return sentence ? bands(koreanRects(page, mark.unitId, sentence).map(toBox)) : [];
        }
        const found = locateQuote(index.text, mark.quote);
        return found ? bands(index.rectsFor(found.start, found.length)) : [];
      };
      const result: Placed[] = guideMarks.map((mark, at): Placed => ({ key: `${mark.unitId}:${at}`, number: at + 1, kind: mark.kind, boxes: place(mark) })).filter(item => item.boxes.length);
      for (const ask of asks) { const boxes = place(ask); if (boxes.length) result.push({ key: `ask:${ask.number}:${ask.unitId}`, number: 0, kind: "ask", boxes, label: `Q${ask.number}`, flash: focused?.quote === ask.quote }); }
      if (focused && !asks.some(ask => ask.unitId === focused.unitId && ask.quote === focused.quote) && !guideMarks.some(mark => mark.unitId === focused.unitId && mark.quote === focused.quote)) {
        const boxes = place({ unitId: focused.unitId, quote: focused.quote! });
        if (boxes.length) result.push({ key: `focus:${focused.key}`, number: 0, kind: "result", boxes, flash: true });
      }
      setPlaced(result);
      useGuideAnchors.getState().set(pageIndex, result.filter((item): item is Placed & { kind: MarkKind } => item.number > 0 && item.kind !== "ask").map((item): MarkAnchor => { const top = Math.min(...item.boxes.map(box => box.y)), bottom = Math.max(...item.boxes.map(box => box.y + box.height)); return { key: item.key, number: item.number, kind: item.kind, y: (top + bottom) / 2, top, bottom }; }));
    }); });
    return () => cancelAnimationFrame(frame);
  }, [guideMarks, asks, focused, textReady, overlayReady, scale, shownKey, pageIndex, surface, layer]);

  if (!placed.length) return null;
  const isActive = (item: Placed) => active === `${pageIndex}:${item.key}`;
  const isFocus = (item: Placed) => item.flash || (focused && item.key.startsWith(`${focused.unitId}:`));
  return <>
    <div className="pf-gmarks" aria-hidden="true">
      {placed.map(item => item.boxes.map((box, at) => <span key={`${item.key}-${at}`} data-kind={item.kind} data-focus={isFocus(item) || undefined} data-active={isActive(item) || undefined} style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%`, animationDelay: `${at * 70}ms` }}/>))}
    </div>
    <div className="pf-gmark-numbers" aria-hidden="true">
      {placed.filter(item => item.number > 0 || item.label).map(item => { const last = endOf(item.boxes); return <i key={item.key} data-kind={item.kind} data-active={isActive(item) || undefined} style={{ left: `${(last.x + last.width) * 100}%`, top: `${last.y * 100}%` }}>{item.label ?? item.number}</i>; })}
    </div>
  </>;
}

/**
 * Follows the reader down the paper: on scroll, the highlight nearest the reading line becomes active,
 * so its mark and its margin note stand out in turn. Renders nothing.
 */
export function GuideReadingLine() {
  const on = useReaderStore(s => s.guideOverlay);
  useEffect(() => {
    if (!on) { useGuideReading.getState().set(null); return; }
    const viewport = document.querySelector<HTMLElement>("[data-pdf-viewport]");
    if (!viewport) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const view = viewport.getBoundingClientRect(), pages = useGuideAnchors.getState().pages;
      const placed = Object.entries(pages).flatMap(([page, anchors]) => {
        if (!anchors.length) return [];
        const rect = document.querySelector(`[data-pdf-page="${page}"]`)?.getBoundingClientRect();
        return rect && rect.bottom > view.top && rect.top < view.bottom ? [{ page: Number(page), top: rect.top, height: rect.height, anchors }] : [];
      });
      useGuideReading.getState().set(readingAnchor(placed, view.top, view.height));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    viewport.addEventListener("scroll", schedule, { passive: true });
    const stop = useGuideAnchors.subscribe(schedule);
    schedule();
    return () => { viewport.removeEventListener("scroll", schedule); stop(); if (frame) cancelAnimationFrame(frame); useGuideReading.getState().set(null); };
  }, [on]);
  return null;
}
