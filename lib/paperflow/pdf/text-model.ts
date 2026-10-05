/**
 * Page text model shared by anchors, selection capture and search.
 *
 * The page text is the concatenation of pdf.js text items in content-stream
 * order, with "\n" appended after items flagged `hasEOL`. `itemStarts[i]` is the
 * offset of text item `i` — the same index as pdf.js `TextLayer.textDivs[i]`.
 */
export type TextItemLike = { str: string; hasEOL?: boolean };

export type PageText = { text: string; itemStarts: number[]; itemLengths: number[] };

export function buildPageText(items: TextItemLike[]): PageText {
  let text = "";
  const itemStarts: number[] = [];
  const itemLengths: number[] = [];
  for (const item of items) {
    itemStarts.push(text.length);
    itemLengths.push(item.str.length);
    text += item.str;
    if (item.hasEOL) text += "\n";
  }
  return { text, itemStarts, itemLengths };
}

/** Index of the item containing `offset`, or the next item when `offset` falls on a separator. */
export function itemAtOffset(model: PageText, offset: number, bias: "forward" | "backward" = "forward"): number {
  const { itemStarts, itemLengths } = model;
  let lo = 0;
  let hi = itemStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (itemStarts[mid] <= offset) lo = mid + 1;
    else hi = mid - 1;
  }
  const idx = Math.max(0, hi);
  const inside = offset < itemStarts[idx] + itemLengths[idx] || (bias === "backward" && offset === itemStarts[idx] + itemLengths[idx]);
  if (inside) return idx;
  return bias === "forward" ? Math.min(idx + 1, itemStarts.length - 1) : idx;
}

/** Trim surrounding whitespace from a [start, end) range. */
export function trimRange(text: string, start: number, end: number): { start: number; end: number } {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  return { start: s, end: e };
}
