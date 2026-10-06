import { create } from "zustand";
import type { MarkKind } from "./guide";

/**
 * Where a guide highlight lands. On the English page it is the quoted span itself; on a translated
 * paragraph it is the Korean sentence that translates the quoted English sentence (sentence by
 * sentence when the counts agree, by position otherwise), so the mark always covers real glyphs.
 */
const fold = (text: string) => text.toLowerCase().replace(/[‐-―]/g, "-").replace(/[“”]/g, "\"").replace(/[‘’]/g, "'").replace(/[◦∘˚º°]/g, "°");

/**
 * Start and length of the quote in normalised page text, or null. Spaces are ignored while matching
 * (the text layer splits "317 ◦C" or "CO 2" differently from the quote); the span is mapped back onto the
 * page text. Falls back to the quote's first eight words when the full quote is broken by a line-end hyphen.
 */
export function locateQuote(pageText: string, quote: string): { start: number; length: number } | null {
  const positions: number[] = [];
  let compact = "";
  const folded = fold(pageText);
  for (let at = 0; at < folded.length; at++) if (!/\s/.test(folded[at])) { compact += folded[at]; positions.push(at); }
  const find = (needle: string) => {
    const squeezed = fold(needle).replace(/\s+/g, "");
    const at = squeezed.length >= 12 ? compact.indexOf(squeezed) : -1;
    return at < 0 ? null : { start: positions[at], length: positions[Math.min(positions.length - 1, at + squeezed.length - 1)] - positions[at] + 1 };
  };
  const words = quote.replace(/\s+/g, " ").trim().split(" ");
  return find(words.join(" ")) ?? (words.length > 8 ? find(words.slice(0, 8).join(" ")) : null);
}

const SENTENCE_EN = /(?<=[.!?])\s+(?=[A-Z0-9("[])/;
const SENTENCE_KO = /(?<=[.!?。])\s+/;
export const sentences = (text: string, korean = false) => text.split(korean ? SENTENCE_KO : SENTENCE_EN).map(part => part.trim()).filter(Boolean);

/** The Korean sentence(s) that translate the English sentence(s) holding the quote. */
export function koreanFor(english: string, korean: string, quote: string): string | null {
  const en = sentences(english), ko = sentences(korean, true);
  if (!en.length || !ko.length) return null;
  const flat = fold(english.replace(/\s+/g, " ")), needle = fold(quote.replace(/\s+/g, " ").trim()), at = flat.indexOf(needle);
  if (at < 0) return null;
  // Sentence index of the quote's first and last character.
  let offset = 0, first = -1, last = -1;
  for (const [index, sentence] of en.entries()) {
    const begin = flat.indexOf(fold(sentence).slice(0, 24), offset), end = begin + sentence.length;
    if (begin < 0) continue;
    if (first < 0 && at < end) first = index;
    if (at + needle.length <= end + 1) { last = index; break; }
    offset = end;
  }
  if (first < 0) return null;
  if (last < 0) last = en.length - 1;
  const map = (index: number) => en.length === ko.length ? index : Math.min(ko.length - 1, Math.round(index / Math.max(1, en.length - 1) * (ko.length - 1)));
  return ko.slice(map(first), map(last) + 1).join(" ");
}

/** Where each guide mark sits on its page (normalised), for the margin notes beside it. */
export interface MarkAnchor { key: string; number: number; kind: MarkKind; y: number; top: number; bottom: number }
interface AnchorState { pages: Record<number, MarkAnchor[]>; set: (page: number, anchors: MarkAnchor[]) => void }
export const useGuideAnchors = create<AnchorState>(set => ({
  pages: {},
  set: (page, anchors) => set(state => {
    const before = state.pages[page] ?? [];
    const same = before.length === anchors.length && before.every((item, index) => item.key === anchors[index].key && Math.abs(item.y - anchors[index].y) < .001);
    return same ? state : { pages: { ...state.pages, [page]: anchors } };
  })
}));

/** The highlight at the reader's reading line ("page:key"), so its mark and margin note stand out as you scroll. */
export const useGuideReading = create<{ active: string | null; set: (active: string | null) => void }>(set => ({
  active: null,
  set: active => set(state => state.active === active ? state : { active })
}));

/**
 * The anchor nearest the reading line (42% down the viewport), within a third of the viewport height.
 * `pages` gives each page's anchors with the page's on-screen top and height.
 */
export function readingAnchor(pages: { page: number; top: number; height: number; anchors: MarkAnchor[] }[], viewTop: number, viewHeight: number): string | null {
  const line = viewTop + viewHeight * .42;
  let best: string | null = null, distance = viewHeight / 3;
  for (const page of pages) for (const anchor of page.anchors) {
    const gap = Math.abs(page.top + anchor.y * page.height - line);
    if (gap < distance) { distance = gap; best = `${page.page}:${anchor.key}`; }
  }
  return best;
}
