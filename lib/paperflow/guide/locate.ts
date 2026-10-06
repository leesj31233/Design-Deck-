import { create } from "zustand";
import type { MarkKind } from "./guide";

/**
 * Where a guide highlight lands. On the English page it is the quoted span itself; on a translated
 * paragraph it is the Korean sentence that translates the quoted English sentence (sentence by
 * sentence when the counts agree, by position otherwise), so the mark always covers real glyphs.
 */
/** One character as matching sees it: NFKC (math italic 𝑠 → s, ligature ﬁ → fi), lower case, one dash, one quote, one degree sign. */
const foldChar = (char: string) => char.normalize("NFKC").toLowerCase().replace(/[‐-―−]/g, "-").replace(/[“”″]/g, "\"").replace(/[‘’′]/g, "'").replace(/[◦∘˚º°]/g, "°");
const fold = (text: string) => [...text].map(foldChar).join("");

/** The text without spaces, each kept character pointing back to where it starts and ends in the original. */
function compactOf(text: string, dropBreakHyphens: boolean) {
  let compact = "";
  const starts: number[] = [], ends: number[] = [];
  const chars = [...text];
  let at = 0;
  chars.forEach((char, index) => {
    const from = at; at += char.length;
    if (/\s/.test(char)) return;
    // "per- sonalised": a hyphen that ends a line joins the word, in the variant that drops it.
    if (dropBreakHyphens && /[-‐‑]/.test(char) && /\s/.test(chars[index + 1] ?? "") && /\p{L}/u.test(chars[index - 1] ?? "")) return;
    for (const piece of foldChar(char)) if (!/\s/.test(piece)) { compact += piece; starts.push(from); ends.push(at); }
  });
  return { compact, starts, ends };
}

/**
 * Start and length of the quote in the text, or null. Spaces are ignored while matching (the text layer
 * splits "317 ◦C" or "CO 2" differently from the quote), characters are folded (math letters, dashes,
 * quotes, degree signs), and a line-end hyphen may join a word. Falls back to the quote's first, then
 * last, eight words when the whole quote is broken by something else (a column break, an inline figure).
 */
export function locateQuote(text: string, quote: string): { start: number; length: number } | null {
  const variants = [compactOf(text, false), compactOf(text, true)];
  const find = (needle: string) => {
    const squeezed = fold(needle).replace(/\s+/g, "");
    if (squeezed.length < 12) return null;
    for (const { compact, starts, ends } of variants) {
      const at = compact.indexOf(squeezed);
      if (at >= 0) return { start: starts[at], length: ends[at + squeezed.length - 1] - starts[at] };
    }
    return null;
  };
  const words = quote.replace(/\s+/g, " ").trim().split(" ");
  return find(words.join(" ")) ?? (words.length > 8 ? find(words.slice(0, 8).join(" ")) ?? find(words.slice(-8).join(" ")) : null);
}

const SENTENCE_EN = /(?<=[.!?])\s+(?=[A-Z0-9("[])/;
const SENTENCE_KO = /(?<=[.!?。])\s+/;
export const sentences = (text: string, korean = false) => text.split(korean ? SENTENCE_KO : SENTENCE_EN).map(part => part.trim()).filter(Boolean);

/** The Korean sentence(s) that translate the English sentence(s) holding the quote. */
export function koreanFor(english: string, korean: string, quote: string): string | null {
  const en = sentences(english), ko = sentences(korean, true);
  if (!en.length || !ko.length) return null;
  const found = locateQuote(english, quote);
  if (!found) return null;
  // Sentence index of the quote's first and last character.
  let cursor = 0, first = -1, last = -1;
  for (const [index, sentence] of en.entries()) {
    const begin = english.indexOf(sentence, cursor), end = begin < 0 ? cursor : begin + sentence.length;
    if (begin >= 0) cursor = end;
    if (first < 0 && found.start < end) first = index;
    if (found.start + found.length <= end) { last = index; break; }
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
