"use client";
import type { Rect } from "../types";
import { mergeLineRects, normalizeRects } from "../anchors/geometry";
import { itemAtOffset, type PageText } from "./text-model";

/** Live DOM bridge for one rendered page's text layer. */
export type PageRuntime = {
  pageIndex: number;
  element: HTMLElement;
  textLayer: HTMLElement;
  divs: HTMLElement[];
  model: PageText;
  /** Page size in PDF points (scale 1). */
  width: number;
  height: number;
  offsetFromPoint: (node: Node, offset: number) => number;
  /** Rects in PDF points for a text range. */
  measure: (start: number, end: number) => Rect[];
  measureNormalized: (start: number, end: number) => Rect[];
};

export function createPageRuntime(params: {
  pageIndex: number;
  element: HTMLElement;
  textLayer: HTMLElement;
  divs: HTMLElement[];
  model: PageText;
  width: number;
  height: number;
}): PageRuntime {
  const { element, divs, model, width, height } = params;
  const indexOf = new Map<Node, number>();
  divs.forEach((d, i) => indexOf.set(d, i));

  const offsetFromPoint = (node: Node, offset: number): number => {
    if (node.nodeType === Node.TEXT_NODE && node.parentElement && indexOf.has(node.parentElement)) {
      const i = indexOf.get(node.parentElement)!;
      return model.itemStarts[i] + Math.min(offset, model.itemLengths[i]);
    }
    if (indexOf.has(node)) {
      const i = indexOf.get(node)!;
      return model.itemStarts[i] + (offset > 0 ? model.itemLengths[i] : 0);
    }
    // Element boundary (text layer container, <br>, endOfContent…): first div starting after the point.
    const probe = document.createRange();
    try {
      probe.setStart(node, offset);
    } catch {
      return model.text.length;
    }
    for (let i = 0; i < divs.length; i++) {
      if (divs[i].isConnected && probe.comparePoint(divs[i], 0) >= 0) return model.itemStarts[i];
    }
    return model.text.length;
  };

  const measure = (start: number, end: number): Rect[] => {
    if (end <= start || divs.length === 0) return [];
    const first = itemAtOffset(model, start, "forward");
    const last = itemAtOffset(model, end, "backward");
    const pageBox = element.getBoundingClientRect();
    const scaleX = pageBox.width / width;
    const scaleY = pageBox.height / height;
    const client: Rect[] = [];
    for (let i = first; i <= last; i++) {
      const div = divs[i];
      const textNode = div?.firstChild;
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) continue;
      const from = Math.max(0, start - model.itemStarts[i]);
      const to = Math.min(model.itemLengths[i], end - model.itemStarts[i]);
      if (to <= from) continue;
      const range = document.createRange();
      range.setStart(textNode, from);
      range.setEnd(textNode, to);
      for (const r of Array.from(range.getClientRects())) {
        client.push({ x: (r.left - pageBox.left) / scaleX, y: (r.top - pageBox.top) / scaleY, width: r.width / scaleX, height: r.height / scaleY });
      }
    }
    return mergeLineRects(client).map((r) => clampRect(r, width, height));
  };

  return {
    ...params,
    offsetFromPoint,
    measure,
    measureNormalized: (start, end) => normalizeRects(measure(start, end), width, height),
  };
}

function clampRect(r: Rect, w: number, h: number): Rect {
  const x = Math.max(0, r.x);
  const y = Math.max(0, r.y);
  return { x, y, width: Math.min(w, r.x + r.width) - x, height: Math.min(h, r.y + r.height) - y };
}
