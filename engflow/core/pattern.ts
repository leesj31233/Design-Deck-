import { isSpellingVariant, stem, type Token } from "./text";
import { ingOf, pastOf } from "./lexicon";
import { numberKey } from "./numwords";

/**
 * Compiles the pattern mini-language documented in types.ts and matches it
 * against a token stream. A match reports the token index range it covers
 * and whether any token matched only through spelling tolerance.
 */

interface Alt {
  exact: boolean;
  value: string;
  stem: string;
  any: boolean;
  /** The number the alternative says ("3" for "three"), matched in any spelling. */
  num?: string;
}

interface PatternToken {
  alts: Alt[];
  optional: boolean;
  gap: boolean; // "..."
}

export interface CompiledPattern {
  source: string;
  regex?: RegExp;
  tokens: PatternToken[];
}

export interface PatternMatch {
  /** Index range in the word-token array (inclusive start, exclusive end). */
  from: number;
  to: number;
  fuzzy: boolean;
}

const cache = new Map<string, CompiledPattern>();

export class PatternSyntaxError extends Error {}

export function compilePattern(source: string): CompiledPattern {
  const hit = cache.get(source);
  if (hit) return hit;
  let compiled: CompiledPattern;
  if (source.startsWith("re:")) {
    try {
      compiled = { source, regex: new RegExp(source.slice(3), "i"), tokens: [] };
    } catch (e) {
      throw new PatternSyntaxError(`Invalid regex pattern "${source}": ${(e as Error).message}`);
    }
  } else {
    const parts = source.trim().toLowerCase().replace(/[’]/g, "'").split(/\s+/).filter(Boolean);
    if (!parts.length) throw new PatternSyntaxError(`Empty pattern`);
    const tokens: PatternToken[] = parts.map((p) => {
      if (p === "...") return { alts: [], optional: false, gap: true };
      let optional = false;
      let body = p;
      if (body.endsWith("?") && body.length > 1) {
        optional = true;
        body = body.slice(0, -1);
      }
      const alts: Alt[] = body.split("|").map((a) => {
        if (!a) throw new PatternSyntaxError(`Empty alternative in "${source}"`);
        if (a === "*") return { exact: false, value: "*", stem: "*", any: true };
        const exact = a.startsWith("=");
        const value = exact ? a.slice(1) : a;
        if (!/^[a-z0-9][a-z0-9&.'-]*$/.test(value)) throw new PatternSyntaxError(`Invalid token "${a}" in "${source}"`);
        return { exact, value, stem: stem(value), any: false, num: numberKey(value) };
      });
      return { alts, optional, gap: false };
    });
    if (tokens.every((t) => t.optional || t.gap)) throw new PatternSyntaxError(`Pattern "${source}" has no required token`);
    compiled = { source, tokens };
  }
  cache.set(source, compiled);
  return compiled;
}

/**
 * Everyday synonyms a learner may use for a word in a meaning chunk ("a cab" for "a taxi", "fantastic" for
 * "great"). Only meaning chunks use them, never mistake patterns, and an exact alternative (=word) never does.
 */
const SYNONYM_GROUPS: string[][] = [
  ["taxi", "cab"],
  ["great", "fantastic", "wonderful", "amazing", "awesome", "excellent", "brilliant", "terrific"],
  ["maybe", "perhaps"],
  ["problem", "issue"],
  ["start", "begin"],
  ["buy", "purchase"],
  ["fix", "repair"],
  ["photo", "picture"],
  ["bathroom", "restroom", "toilet", "washroom"],
  ["movie", "film"],
  ["holiday", "vacation"],
  ["happy", "glad", "pleased", "delighted"],
  ["big", "large"],
  ["sick", "ill"],
  ["shop", "store"],
  ["elevator", "lift"],
  ["luggage", "baggage"],
  ["hard", "difficult", "tough"],
  ["easy", "simple"],
  ["error", "mistake"],
  ["choose", "pick", "select"],
  ["talk", "speak"],
  ["guess", "suppose"],
  ["loud", "noisy"],
  ["kind", "nice", "sweet"],
  ["delicious", "tasty"],
  ["finish", "complete"],
  ["help", "assist"],
  ["okay", "ok", "alright"],
  ["yes", "yeah", "yep"],
  ["kids", "children"],
  ["kid", "child"],
  ["quick", "fast"],
  ["soon", "shortly"],
  ["confirm", "verify"],
  ["afraid", "scared", "frightened"],
  ["worried", "concerned", "anxious"],
  ["tired", "exhausted"],
  ["cheap", "inexpensive"],
  ["expensive", "pricey", "costly"],
  ["fun", "enjoyable"],
  ["leave", "depart"],
  ["reservation", "booking"],
  ["suggest", "recommend", "propose"],
  ["need", "require"],
  ["usually", "normally", "typically", "generally"],
  ["often", "frequently"],
  ["almost", "nearly"],
  ["enough", "sufficient"],
  ["wrong", "incorrect"],
  ["answer", "reply", "respond", "response"],
  ["question", "query"],
  ["smart", "clever"],
  ["beautiful", "lovely", "gorgeous"],
  ["sorry", "apologize", "apologise", "apologies"],
];
const SYNONYM_OF = new Map<string, number>();
SYNONYM_GROUPS.forEach((g, k) => g.forEach((word) => SYNONYM_OF.set(stem(word), k)));

function tokenMatches(alt: Alt, tok: Token, synonyms = false): "exact" | "fuzzy" | null {
  if (alt.any) return "exact";
  if (alt.exact) return tok.norm === alt.value ? "exact" : null;
  if (tok.norm === alt.value || tok.stem === alt.stem) return "exact";
  // "IT" (the department) is read as "i.t" by the tokenizer; a pattern word "it" still matches it.
  if (alt.value === "it" && tok.norm === "i.t") return "exact";
  if (alt.num !== undefined && tok.num === alt.num) return "exact";
  // "five" in a pattern matches "a five-minute walk" ("5-minute"): the number is said either way.
  if (alt.num !== undefined && !alt.num.includes("-") && tok.num?.startsWith(`${alt.num}-`)) return "exact";
  if (synonyms && SYNONYM_OF.has(alt.stem) && SYNONYM_OF.get(alt.stem) === SYNONYM_OF.get(tok.stem)) return "exact";
  if (isSpellingVariant(tok.norm, alt.value)) return "fuzzy";
  // A misspelled inflected form ("wating" for wait → waiting).
  if (/^[a-z]+$/.test(alt.value) && [ingOf(alt.value), pastOf(alt.value), alt.value + "s"].some((f) => isSpellingVariant(tok.norm, f))) return "fuzzy";
  return null;
}

/**
 * Find the first match of a compiled pattern in `words`.
 * `slack` = number of unrelated tokens tolerated between consecutive pattern tokens.
 */
export function matchPattern(p: CompiledPattern, words: Token[], slack = 0, allowFuzzy = true, synonyms = false): PatternMatch | null {
  if (p.regex) {
    const joined = words.map((w) => w.norm).join(" ");
    const m = p.regex.exec(joined);
    if (!m) return null;
    // Map character offsets in the joined string back to token indices.
    let pos = 0;
    let from = -1;
    let to = words.length;
    for (let i = 0; i < words.length; i++) {
      const s = pos;
      const e = pos + words[i].norm.length;
      if (from < 0 && e > m.index) from = i;
      if (s >= m.index + m[0].length) {
        to = i;
        break;
      }
      pos = e + 1;
    }
    return { from: Math.max(0, from), to: Math.max(from + 1, to), fuzzy: false };
  }
  for (let start = 0; start < words.length; start++) {
    const r = matchFrom(p.tokens, 0, words, start, slack, allowFuzzy, true, synonyms);
    if (r) return { from: r.first, to: r.end, fuzzy: r.fuzzy };
  }
  return null;
}

interface Partial {
  first: number;
  end: number;
  fuzzy: boolean;
}

function matchFrom(
  pts: PatternToken[],
  pi: number,
  words: Token[],
  wi: number,
  slack: number,
  allowFuzzy: boolean,
  anchored: boolean,
  synonyms = false,
): Partial | null {
  if (pi === pts.length) return { first: wi, end: wi, fuzzy: false };
  const pt = pts[pi];
  if (pt.gap) {
    const maxGap = slack > 0 ? 6 : 3;
    for (let g = 0; g <= maxGap && wi + g <= words.length; g++) {
      const r = matchFrom(pts, pi + 1, words, wi + g, slack, allowFuzzy, true, synonyms);
      if (r) return { first: wi, end: r.end, fuzzy: r.fuzzy };
    }
    return null;
  }
  const maxSkip = anchored ? 0 : slack;
  for (let skip = 0; skip <= maxSkip && wi + skip < words.length; skip++) {
    const tok = words[wi + skip];
    // Two passes: an exact alternative always wins over a spelling-tolerant one.
    for (const pass of ["exact", "fuzzy"] as const) {
      if (pass === "fuzzy" && !allowFuzzy) break;
      for (const alt of pt.alts) {
        const kind = tokenMatches(alt, tok, synonyms);
        if (kind !== pass) continue;
        const r = matchFrom(pts, pi + 1, words, wi + skip + 1, slack, allowFuzzy, false, synonyms);
        if (r) return { first: wi + skip, end: Math.max(r.end, wi + skip + 1), fuzzy: r.fuzzy || kind === "fuzzy" };
      }
    }
  }
  if (pt.optional) {
    const r = matchFrom(pts, pi + 1, words, wi, slack, allowFuzzy, anchored, synonyms);
    if (r) return r;
  }
  return null;
}

/** Match any of several patterns; returns the first that matches. `synonyms`: also accept everyday synonyms (meaning chunks). */
export function matchAny(patterns: string[], words: Token[], slack = 0, synonyms = false): (PatternMatch & { pattern: string }) | null {
  let fuzzy: (PatternMatch & { pattern: string }) | null = null;
  for (const src of patterns) {
    const m = matchPattern(compilePattern(src), words, slack, true, synonyms);
    if (m && !m.fuzzy) return { ...m, pattern: src };
    if (m && !fuzzy) fuzzy = { ...m, pattern: src };
  }
  return fuzzy;
}
