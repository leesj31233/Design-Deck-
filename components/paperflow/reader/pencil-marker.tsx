"use client";
import { useEffect, useRef } from "react";
import type { AnnotationColor } from "@/lib/paperflow/anchors/types";

const TRAIL: Record<AnnotationColor, string> = { yellow: "rgba(255,214,10,.42)", green: "rgba(87,210,145,.40)", blue: "rgba(85,164,255,.38)", pink: "rgba(246,107,157,.38)", purple: "rgba(168,130,235,.40)" };
const LAYERS = ".textLayer, .pf-tx-layer";
const TEXT = ".pf-tx-line, .textLayer span";
const SKIP = "button, a, input, textarea, select, [contenteditable], [data-selection-ui], .pf-text-memo";

/** The line of text (a source span or a Korean line) under a point on the given page, if any. */
function textAt(x: number, y: number, page: HTMLElement, layer?: HTMLElement | null) {
  for (const element of document.elementsFromPoint(x, y)) {
    if (!page.contains(element)) continue;
    const line = element.closest<HTMLElement>(TEXT), root = line?.closest<HTMLElement>(LAYERS);
    if (line && root && line.textContent?.trim() && (!layer || root === layer)) return { line, root };
  }
  return null;
}

/**
 * The text position nearest a point inside a line: each character's box is measured and the point
 * lands before or after the closest one. This works the same in every browser, whatever the text
 * layer's own scaling, unlike caretRangeFromPoint (missing in Firefox, unreliable on transparent text).
 */
function caretAt(line: HTMLElement, x: number, y: number, side: "start" | "end") {
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT), probe = document.createRange();
  let best: { node: Text; offset: number } | null = null, bestScore = Infinity;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    for (let at = 0; at < node.data.length; at++) {
      if (!node.data[at].trim() && at !== node.data.length - 1) continue;
      probe.setStart(node, at); probe.setEnd(node, at + 1);
      const box = probe.getBoundingClientRect();
      if (!box.width && !box.height) continue;
      const dy = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
      const dx = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
      const score = dy * 4 + dx;
      if (score < bestScore) {
        bestScore = score;
        // A stroke takes in the whole character it starts or ends on.
        best = { node, offset: side === "start" ? at : at + 1 };
      }
    }
  }
  if (best) {
    // A stroke that stops inside a word takes the whole word, as a highlighter is meant to.
    const { node } = best, letter = (at: number) => /[\p{L}\p{N}]/u.test(node.data[at] ?? "");
    if (side === "start") while (best.offset > 0 && letter(best.offset - 1)) best.offset--;
    else while (best.offset < node.data.length && letter(best.offset)) best.offset++;
  }
  return best;
}

/**
 * Highlighter strokes with a pen. On an iPad an Apple Pencil drawn across a line marks it, as a real
 * highlighter would, instead of dragging out a selection or scrolling the page; fingers keep scrolling
 * and zooming. While the stroke is drawn a translucent trail follows the tip; when the pencil lifts the
 * text from where the stroke first touched a line to where it last touched one becomes a highlight in
 * the current colour (through the reader's normal highlight path, so it syncs and can be undone).
 * A quick tap with the pencil still clicks. Also works with a pen on a Windows tablet.
 */
export function PencilMarker({ root, enabled, color, onMark }: { root: React.RefObject<HTMLElement | null>; enabled: boolean; color: AnnotationColor; onMark: () => void }) {
  const trail = useRef<HTMLCanvasElement>(null), latest = useRef({ color, onMark });
  latest.current = { color, onMark };
  useEffect(() => {
    const host = root.current, canvas = trail.current;
    if (!host || !canvas || !enabled) return;
    let stroke: { id: number; page: HTMLElement; points: [number, number][]; width: number } | null = null;
    const context = canvas.getContext("2d");
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const target = (event: Event) => {
      const element = event.target instanceof Element ? event.target : null;
      if (!element || !host.contains(element) || element.closest(SKIP)) return null;
      return element.closest<HTMLElement>(".pf-pdf-page");
    };
    const size = () => { canvas.width = Math.round(window.innerWidth * ratio); canvas.height = Math.round(window.innerHeight * ratio); context?.setTransform(ratio, 0, 0, ratio, 0, 0); };
    const paint = () => {
      if (!context || !stroke) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = TRAIL[latest.current.color]; context.lineWidth = stroke.width; context.lineCap = "butt"; context.lineJoin = "round";
      context.beginPath();
      stroke.points.forEach(([x, y], at) => at ? context.lineTo(x, y) : context.moveTo(x, y));
      context.stroke();
    };
    const clear = () => { context?.clearRect(0, 0, canvas.width, canvas.height); delete host.dataset.penMark; stroke = null; };

    // iPadOS scrolls (and starts its own text selection) on a pencil touch unless the touch is cancelled.
    const touch = (event: TouchEvent) => {
      const pencil = Array.from(event.changedTouches).some(point => (point as Touch & { touchType?: string }).touchType === "stylus");
      if (pencil && (stroke || target(event))) event.preventDefault();
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "pen" || event.button !== 0) return;
      const page = target(event);
      if (!page) return;
      event.preventDefault(); event.stopPropagation();
      window.getSelection()?.removeAllRanges();
      host.dataset.penMark = "true";
      const hit = textAt(event.clientX, event.clientY, page), lineHeight = hit ? hit.line.getBoundingClientRect().height : 0;
      stroke = { id: event.pointerId, page, points: [[event.clientX, event.clientY]], width: Math.max(10, Math.min(30, (lineHeight || 16) * .95)) };
      size(); paint();
    };
    const move = (event: PointerEvent) => {
      if (!stroke || event.pointerId !== stroke.id) return;
      event.preventDefault();
      const events = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
      for (const point of events.length ? events : [event]) stroke.points.push([point.clientX, point.clientY]);
      paint();
    };
    const up = (event: PointerEvent) => {
      if (!stroke || event.pointerId !== stroke.id) return;
      // The stroke is the pencil's own: nothing else (the highlighter's drag-to-select) acts on its lift.
      event.stopPropagation();
      const { page, points } = stroke;
      const [x0, y0] = points[0], [x1, y1] = points[points.length - 1];
      const travelled = points.reduce((sum, [x, y], at) => at ? sum + Math.hypot(x - points[at - 1][0], y - points[at - 1][1]) : 0, 0);
      clear();
      if (event.type === "pointercancel") return;
      if (travelled < 6) {
        // A tap: let it act as a click (open a paragraph, follow a citation).
        document.elementFromPoint(x1, y1)?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x1, clientY: y1, view: window }));
        return;
      }
      // Where the stroke first and last crossed text, on the same layer (Korean or source) it began on.
      let first: ReturnType<typeof textAt> = null, firstPoint = points[0];
      for (const point of points) { first = textAt(point[0], point[1], page); if (first) { firstPoint = point; break; } }
      if (!first) return;
      let last: ReturnType<typeof textAt> = null, lastPoint = points[points.length - 1];
      for (let at = points.length - 1; at >= 0; at--) { last = textAt(points[at][0], points[at][1], page, first.root); if (last) { lastPoint = points[at]; break; } }
      if (!last) return;
      const forward = Math.abs(y1 - y0) > Math.abs(x1 - x0) * 1.5 ? y1 >= y0 : x1 >= x0;
      const start = caretAt(first.line, firstPoint[0], firstPoint[1], forward ? "start" : "end"), end = caretAt(last.line, lastPoint[0], lastPoint[1], forward ? "end" : "start");
      if (!start || !end) return;
      const range = document.createRange();
      range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset);
      // A stroke drawn right to left (or bottom to top) covers the same text.
      if (range.collapsed) { range.setStart(end.node, end.offset); range.setEnd(start.node, start.offset); }
      if (range.collapsed || !range.toString().trim()) return;
      const selection = window.getSelection();
      selection?.removeAllRanges(); selection?.addRange(range);
      // The page turns the selection into an anchor on selectionchange; the highlight is saved from it.
      window.setTimeout(() => latest.current.onMark(), 40);
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", up, true);
    host.addEventListener("touchstart", touch, { passive: false }); host.addEventListener("touchmove", touch, { passive: false });
    return () => {
      clear();
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true);
      host.removeEventListener("touchstart", touch); host.removeEventListener("touchmove", touch);
    };
  }, [root, enabled]);
  return enabled ? <canvas ref={trail} className="pf-pen-trail" aria-hidden="true"/> : null;
}
