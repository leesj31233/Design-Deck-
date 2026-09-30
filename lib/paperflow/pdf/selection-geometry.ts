import { createTextAnchor } from "../anchors/create-anchor";
import { clientRectToPageRect } from "../anchors/geometry";
import { mergeLineRects } from "../anchors/merge-line-rects";
import type { Rect, TextAnchor } from "../anchors/types";
function rangeText(range: Range): string {
  const fragment = range.cloneContents();
  fragment.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
  return fragment.textContent ?? "";
}
export function rangeRects(range: Range, page: HTMLElement): Rect[] {
  const bounds = page.getBoundingClientRect();
  return mergeLineRects(Array.from(range.getClientRects()).filter(r => r.width > 0.5 && r.height > 0.5).map(r => {
    const x = Math.max(bounds.left, r.left), y = Math.max(bounds.top, r.top);
    return clientRectToPageRect({ x, y, width: Math.max(0, Math.min(bounds.right, r.right) - x), height: Math.max(0, Math.min(bounds.bottom, r.bottom) - y) }, bounds);
  }).filter(r => r.width > 0.5 && r.height > 0.5));
}
export function captureSelection(selection: Selection, page: HTMLElement, layer: HTMLElement, documentId: string, pageIndex: number): TextAnchor | null {
  if (selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!layer.contains(range.startContainer) || !layer.contains(range.endContainer)) return null;
  const quote = rangeText(range);
  if (!quote.trim()) return null;
  const before = document.createRange(); before.selectNodeContents(layer); before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange(); after.selectNodeContents(layer); after.setStart(range.endContainer, range.endOffset);
  const bounds = page.getBoundingClientRect(), rects = rangeRects(range, page);
  return createTextAnchor({ documentId, pageIndex, textQuote: quote, prefix: rangeText(before), suffix: rangeText(after), rects, width: bounds.width, height: bounds.height });
}

// Map normalized text offsets back to the actual PDF.js text nodes; never infer
// word positions from string length or draw a rectangle for the whole paragraph.
export function textIndex(layer: HTMLElement, page: HTMLElement) {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const nodes: { node: Text; start: number }[] = []; let raw = "";
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) { nodes.push({ node: node as Text, start: raw.length }); raw += node.textContent; }
    else if (node.nodeName === "BR") raw += "\n";
  }
  let text = ""; const offsets: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = /\s/u.test(raw[i]) ? " " : raw[i];
    if (c === " " && (!text || text.endsWith(" "))) continue;
    text += c; offsets.push(i);
  }
  if (text.endsWith(" ")) { text = text.slice(0, -1); offsets.pop(); }
  const locate = (offset: number) => { const item = [...nodes].reverse().find(n => n.start <= offset); return item ? { node: item.node, offset: Math.min(item.node.length, offset - item.start) } : null; };
  return { text, rectsFor(start: number, length: number): Rect[] {
    const a = locate(offsets[start]), b = locate((offsets[start + length - 1] ?? -1) + 1);
    if (!a || !b) return [];
    const range = document.createRange(); range.setStart(a.node, a.offset); range.setEnd(b.node, b.offset);
    const bounds = page.getBoundingClientRect();
    return rangeRects(range, page).map(r => ({ x: r.x / bounds.width, y: r.y / bounds.height, width: r.width / bounds.width, height: r.height / bounds.height }));
  } };
}
