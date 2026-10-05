import type { AnchorStatus, Rect, TextAnchor } from "../types";
import { normalizeRects, rectsMatch } from "./geometry";

export const CONTEXT_LENGTH = 32;

/** Measures a character range of the current page text, returning normalized rects. */
export type RangeMeasurer = (start: number, end: number) => Rect[];

export type PageTextModel = {
  /** Concatenated page text, in the same order the text layer renders it. */
  text: string;
  measure?: RangeMeasurer;
};

export type AnchorResolution = {
  status: AnchorStatus;
  /** Character range in the current page text, when resolved. */
  start?: number;
  end?: number;
  /** Normalized rects to render, when resolved. */
  normalizedRects?: Rect[];
  /** Text that was actually matched (differs from the quote for fuzzy matches). */
  matchedText?: string;
  /** True when the rendered position differs from the captured one. */
  relocated: boolean;
  /** Human-readable explanation shown in the inspector. */
  reason: string;
};

export function createTextAnchor(params: {
  documentId: string;
  pageIndex: number;
  pageText: string;
  start: number;
  end: number;
  rects: Rect[];
  pageWidth: number;
  pageHeight: number;
}): TextAnchor {
  const { documentId, pageIndex, pageText, start, end, rects, pageWidth, pageHeight } = params;
  return {
    documentId,
    pageIndex,
    textQuote: pageText.slice(start, end),
    prefix: pageText.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: pageText.slice(end, end + CONTEXT_LENGTH),
    rects,
    normalizedRects: normalizeRects(rects, pageWidth, pageHeight),
    textPosition: { start, end },
  };
}

/**
 * Resolve an anchor against the current page text.
 *
 * Recovery order (never skipped, never silent):
 *   1. exact geometry  — stored position still holds the quote and lays out identically
 *   2. exact quote     — the quote occurs exactly once on the page
 *   3. prefix/suffix   — the quote occurs several times; context picks a unique winner
 *   4. fuzzy local     — a near match close to the stored position (requires user review)
 *   5. unresolved      — nothing trustworthy; the highlight is not drawn
 */
export function resolveAnchor(anchor: TextAnchor, page: PageTextModel): AnchorResolution {
  const { text, measure } = page;
  const quote = anchor.textQuote;
  if (!quote) return unresolved("Anchor has no quote.");

  const pos = anchor.textPosition;
  const measureOr = (start: number, end: number) => (measure ? measure(start, end) : anchor.normalizedRects);

  // 1. Exact geometry.
  if (pos && text.slice(pos.start, pos.end) === quote) {
    const current = measure ? measure(pos.start, pos.end) : anchor.normalizedRects;
    if (!measure || rectsMatch(current, anchor.normalizedRects)) {
      return {
        status: "exact",
        start: pos.start,
        end: pos.end,
        normalizedRects: anchor.normalizedRects,
        matchedText: quote,
        relocated: false,
        reason: "Geometry and quote match the saved anchor.",
      };
    }
    // Same text, different layout (e.g. renderer change): re-measured, flagged.
    return {
      status: "quote",
      start: pos.start,
      end: pos.end,
      normalizedRects: current,
      matchedText: quote,
      relocated: true,
      reason: "Quote matches at the saved position but page layout changed; rectangles were re-measured.",
    };
  }

  // 2. Exact quote.
  const occurrences = findAll(text, quote);
  if (occurrences.length === 1) {
    const start = occurrences[0];
    return {
      status: "quote",
      start,
      end: start + quote.length,
      normalizedRects: measureOr(start, start + quote.length),
      matchedText: quote,
      relocated: true,
      reason: "Saved position no longer matched; the quote was found once elsewhere on the page.",
    };
  }

  // 3. Prefix / suffix disambiguation.
  if (occurrences.length > 1) {
    const scored = occurrences
      .map((start) => ({ start, score: contextScore(text, start, quote.length, anchor.prefix, anchor.suffix) }))
      .sort((a, b) => b.score - a.score);
    const [best, second] = scored;
    if (best.score > 0 && best.score > second.score) {
      return {
        status: "context",
        start: best.start,
        end: best.start + quote.length,
        normalizedRects: measureOr(best.start, best.start + quote.length),
        matchedText: quote,
        relocated: true,
        reason: `The quote occurs ${occurrences.length}× on the page; surrounding text selected one occurrence.`,
      };
    }
  }

  // 4. Fuzzy local match.
  const fuzzy = fuzzyFind(text, quote, pos?.start);
  if (fuzzy) {
    return {
      status: "fuzzy",
      start: fuzzy.start,
      end: fuzzy.end,
      normalizedRects: measureOr(fuzzy.start, fuzzy.end),
      matchedText: text.slice(fuzzy.start, fuzzy.end),
      relocated: true,
      reason:
        occurrences.length > 1
          ? `The quote occurs ${occurrences.length}× with indistinguishable context; nearest candidate needs review.`
          : "Only an approximate match was found near the saved position; please review.",
    };
  }

  // 5. Unresolved.
  return unresolved("The quote could not be found on this page.");
}

function unresolved(reason: string): AnchorResolution {
  return { status: "unresolved", relocated: false, reason };
}

export function findAll(haystack: string, needle: string): number[] {
  const result: number[] = [];
  if (!needle) return result;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return result;
    result.push(idx);
    from = idx + 1;
  }
}

/** Length of matching context on both sides (characters). */
function contextScore(text: string, start: number, length: number, prefix = "", suffix = ""): number {
  let score = 0;
  for (let i = 1; i <= prefix.length && start - i >= 0; i++) {
    if (text[start - i] !== prefix[prefix.length - i]) break;
    score++;
  }
  const after = start + length;
  for (let i = 0; i < suffix.length && after + i < text.length; i++) {
    if (text[after + i] !== suffix[i]) break;
    score++;
  }
  return score;
}

type Normalized = { value: string; map: number[] };

/**
 * Normalize for tolerant matching: NFKC (ligatures), lowercase, unify dashes and
 * quotes, drop soft line-break hyphenation and collapse whitespace. `map[i]` is the
 * original index of normalized character `i`.
 */
export function normalizeForMatch(input: string): Normalized {
  const chars: string[] = [];
  const map: number[] = [];
  let lastWasSpace = true;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    // "hyphen-\n" line-break hyphenation.
    if ((ch === "-" || ch === "­") && /\s/.test(input[i + 1] ?? "") && /\p{L}/u.test(input[i - 1] ?? "")) {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) j++;
      if (/\p{Ll}/u.test(input[j] ?? "")) {
        i = j - 1;
        continue;
      }
    }
    if (ch === "­") continue;
    const expanded = ch.normalize("NFKC").toLowerCase().replace(/[‐-―−]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    for (const e of expanded) {
      if (/\s/.test(e)) {
        if (lastWasSpace) continue;
        chars.push(" ");
        map.push(i);
        lastWasSpace = true;
      } else {
        chars.push(e);
        map.push(i);
        lastWasSpace = false;
      }
    }
  }
  while (chars[chars.length - 1] === " ") {
    chars.pop();
    map.pop();
  }
  return { value: chars.join(""), map };
}

const FUZZY_WINDOW = 3000;

/**
 * Approximate substring search (Sellers' algorithm) within a window around the
 * expected position. Returns a range in the original text.
 */
export function fuzzyFind(text: string, quote: string, near?: number): { start: number; end: number; distance: number } | null {
  const nq = normalizeForMatch(quote);
  if (nq.value.length < 4) return null;

  const winStart = near === undefined ? 0 : Math.max(0, near - FUZZY_WINDOW);
  const winEnd = near === undefined ? text.length : Math.min(text.length, near + quote.length + FUZZY_WINDOW);
  const window = text.slice(winStart, winEnd);
  const nt = normalizeForMatch(window);
  const q = nq.value;
  const t = nt.value;
  if (!t) return null;

  const maxDistance = Math.max(1, Math.floor(q.length * 0.15));

  // Exact match after normalization first (common: whitespace / hyphenation / ligatures).
  const normalizedHits = findAll(t, q);
  if (normalizedHits.length > 0) {
    const anchorIdx = near === undefined ? 0 : near - winStart;
    const best = normalizedHits.reduce((a, b) => (Math.abs(nt.map[b] - anchorIdx) < Math.abs(nt.map[a] - anchorIdx) ? b : a));
    return {
      start: winStart + nt.map[best],
      end: winStart + nt.map[best + q.length - 1] + 1,
      distance: 0,
    };
  }

  // Sellers: dp over text with free start; track start positions.
  const m = q.length;
  let prev = new Array<number>(m + 1);
  let prevStart = new Array<number>(m + 1);
  for (let i = 0; i <= m; i++) {
    prev[i] = i;
    prevStart[i] = 0;
  }
  let best: { end: number; start: number; distance: number } | null = null;
  for (let j = 1; j <= t.length; j++) {
    const cur = new Array<number>(m + 1);
    const curStart = new Array<number>(m + 1);
    cur[0] = 0;
    curStart[0] = j;
    for (let i = 1; i <= m; i++) {
      const cost = q[i - 1] === t[j - 1] ? 0 : 1;
      const sub = prev[i - 1] + cost;
      const del = prev[i] + 1;
      const ins = cur[i - 1] + 1;
      if (sub <= del && sub <= ins) {
        cur[i] = sub;
        curStart[i] = prevStart[i - 1];
      } else if (del <= ins) {
        cur[i] = del;
        curStart[i] = prevStart[i];
      } else {
        cur[i] = ins;
        curStart[i] = curStart[i - 1];
      }
    }
    if (cur[m] <= maxDistance && (!best || cur[m] < best.distance)) {
      best = { end: j, start: curStart[m], distance: cur[m] };
    }
    prev = cur;
    prevStart = curStart;
  }
  if (!best || best.end <= best.start) return null;
  return {
    start: winStart + nt.map[best.start],
    end: winStart + nt.map[best.end - 1] + 1,
    distance: best.distance,
  };
}
