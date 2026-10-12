/**
 * Text processing for evaluation: tokenization with character offsets,
 * contraction expansion, a light symmetric stemmer and spelling-tolerant
 * comparison. Deterministic and dependency-free so it runs identically in
 * the browser, the artifact and Node tests.
 */

import { verbInfo } from "./lexicon";

export interface Token {
  /** Normalized (lower-case) token text. */
  norm: string;
  /** Original surface text of the source span. */
  raw: string;
  /** Character offsets of the source span in the original answer. */
  start: number;
  end: number;
  /** Light stem used for lenient matching. */
  stem: string;
  /** True for punctuation tokens (kept for reconstruction, skipped for matching). */
  punct: boolean;
  /** Expanded from a contraction ("it's" → "it" + "is"); shares the span. */
  expanded?: boolean;
}

const CONTRACTIONS: Record<string, string[]> = {
  "won't": ["will", "not"],
  "can't": ["can", "not"],
  "cannot": ["can", "not"],
  "shan't": ["shall", "not"],
  "let's": ["let", "us"],
  "i'm": ["i", "am"],
  "it's": ["it", "is"],
  "that's": ["that", "is"],
  "there's": ["there", "is"],
  "here's": ["here", "is"],
  "what's": ["what", "is"],
  "who's": ["who", "is"],
  "where's": ["where", "is"],
  "how's": ["how", "is"],
  "he's": ["he", "is"],
  "she's": ["she", "is"],
  "ain't": ["is", "not"],
};

const SUFFIX_CONTRACTIONS: [string, string][] = [
  ["n't", "not"],
  ["'re", "are"],
  ["'ve", "have"],
  ["'ll", "will"],
  ["'d", "would"],
  ["'m", "am"],
];

const IRREGULAR_STEMS: Record<string, string> = {
  is: "be", are: "be", am: "be", was: "be", were: "be", been: "be", being: "be", be: "be",
  has: "have", had: "have", having: "have", have: "have",
  does: "do", did: "do", done: "do", doing: "do",
  went: "go", gone: "go", goes: "go",
  made: "make", took: "take", taken: "take", got: "get", gotten: "get", gave: "give", given: "give",
  sent: "send", found: "find", ran: "run", began: "begin", begun: "begin", chose: "choose", chosen: "choose",
  kept: "keep", held: "hold", told: "tell", said: "say", thought: "think", brought: "bring", bought: "buy",
  built: "build", met: "meet", left: "leave", lost: "lose", led: "lead", paid: "pay", understood: "understand",
  wrote: "write", written: "write", spoke: "speak", spoken: "speak", saw: "see", seen: "see", knew: "know",
  known: "know", became: "become", came: "come", fell: "fall", fallen: "fall", rose: "rise", risen: "rise",
  grew: "grow", grown: "grow", shown: "show", meant: "mean", spent: "spend", sold: "sell", stood: "stand",
  felt: "feel", heard: "hear", forgot: "forget", forgotten: "forget", drew: "draw", drawn: "draw",
  used: "use", using: "use", uses: "use", data: "data", criteria: "criterion", analyses: "analysis",
  better: "good", best: "good", worse: "bad", worst: "bad", children: "child", people: "person",
  "e-mail": "email", emails: "email",
};

/** Light, symmetric stemmer: both pattern words and answer words go through it. */
export function stem(word: string): string {
  const w = word.toLowerCase();
  if (IRREGULAR_STEMS[w]) {
    // Normalize the irregular base the same way as regular words ("made" → "make" → "mak" = stem("make")).
    const base = IRREGULAR_STEMS[w];
    return base.length > 3 && base.endsWith("e") ? base.slice(0, -1) : base;
  }
  if (!/^[a-z]+$/.test(w) || w.length <= 3) return w;
  let s = w;
  if (s.endsWith("ies") && s.length > 4) s = s.slice(0, -3) + "y";
  else if (s.endsWith("ied") && s.length > 4) s = s.slice(0, -3) + "y";
  else if (s.endsWith("sses")) s = s.slice(0, -2);
  else if (s.endsWith("ing") && s.length > 5) s = undouble(s.slice(0, -3));
  else if (s.endsWith("ed") && s.length > 4) s = undouble(s.slice(0, -2));
  else if (s.endsWith("es") && s.length > 4 && /(ch|sh|x|ss|zz)es$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith("s") && !/(ss|us|is)$/.test(s) && s.length > 3) s = s.slice(0, -1);
  if (s.endsWith("e") && s.length > 3) s = s.slice(0, -1);
  return s;
}

function undouble(s: string): string {
  if (s.length > 2 && s[s.length - 1] === s[s.length - 2] && !/[lsz]/.test(s[s.length - 1])) return s.slice(0, -1);
  return s;
}

const WORD_RE = /[A-Za-z0-9]+(?:[’'&./-][A-Za-z0-9]+)*(?:’|')?|[^\sA-Za-z0-9]/g;

/** Tokenize an answer keeping offsets; contractions expand into several tokens sharing one span. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const src = text.replace(/[‘’]/g, "'");
  let m: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(src))) {
    const raw = text.slice(m.index, m.index + m[0].length);
    const start = m.index;
    const end = m.index + m[0].length;
    let norm = m[0].toLowerCase();
    if (!/[a-z0-9]/.test(norm)) {
      tokens.push({ norm, raw, start, end, stem: norm, punct: true });
      continue;
    }
    // Trailing apostrophe (possessive plural) and trailing dots of abbreviations are dropped.
    norm = norm.replace(/'$/, "").replace(/\.$/, "");
    const parts = expandContraction(norm);
    for (const p of parts) {
      tokens.push({ norm: p, raw, start, end, stem: stem(p), punct: false, expanded: parts.length > 1 || undefined });
    }
  }
  // "'d" is "had" before a past participle ("we'd measured"), otherwise "would".
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (!t.expanded || t.norm !== "would" || !/'d$/i.test(t.raw.replace(/’/g, "'"))) continue;
    const next = tokens.slice(i + 1).find((x) => !x.punct && x.norm !== "not" && x.norm !== "already" && x.norm !== "just" && x.norm !== "never");
    const info = next ? verbInfo(next.norm) : null;
    if (next && (next.norm === "better" || (info && (info.form === "pp" || info.form === "past") && info.base !== next.norm))) {
      t.norm = "had";
      t.stem = stem("had");
    }
  }
  return tokens;
}

function expandContraction(w: string): string[] {
  if (CONTRACTIONS[w]) return CONTRACTIONS[w];
  for (const [suf, full] of SUFFIX_CONTRACTIONS) {
    if (w.endsWith(suf) && w.length > suf.length) {
      const head = w.slice(0, -suf.length);
      if (suf === "n't") return [head === "wo" ? "will" : head === "ca" ? "can" : head, "not"];
      return [head, full];
    }
  }
  if (w.endsWith("'s")) return [w.slice(0, -2)]; // possessive 's carries no grammar signal here
  if (w.includes("'")) return [w.replace(/'/g, "")];
  return [w];
}

export function words(tokens: Token[]): Token[] {
  return tokens.filter((t) => !t.punct);
}

/** Normalized comparison key for exact-match detection. */
export function normalizeForMatch(text: string): string {
  return words(tokenize(text)).map((t) => t.norm).join(" ");
}

/** Damerau–Levenshtein distance (optimal string alignment), bounded. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Spelling tolerance: one edit for 6–8 letter words, two for 9+. Shorter words must be exact (late/later, plan/plant). */
export function isSpellingVariant(a: string, b: string): boolean {
  if (a === b) return false;
  if (!/^[a-z]+$/.test(a) || !/^[a-z]+$/.test(b)) return false;
  const len = Math.max(a.length, b.length);
  if (len < 6 || Math.min(a.length, b.length) < 5) return false;
  const allowed = len >= 9 ? 2 : 1;
  if (a[0] !== b[0] && len < 9) return false;
  return editDistance(a, b, allowed) <= allowed;
}

/* ───────────── Word classes used by alignment and rules ───────────── */

export const BE_FORMS = new Set(["am", "is", "are", "was", "were", "be", "been", "being"]);
export const AUXILIARIES = new Set(["have", "has", "had", "will", "would", "do", "does", "did", "shall"]);
export const MODALS = new Set(["can", "could", "may", "might", "must", "should", "will", "would", "shall"]);
export const ARTICLES = new Set(["a", "an", "the"]);
export const PREPOSITIONS = new Set([
  "for", "to", "of", "in", "on", "at", "with", "by", "from", "about", "into", "onto", "during", "until", "till",
  "after", "before", "under", "over", "between", "within", "without", "through", "per", "via", "against", "toward", "towards",
]);
export const SUBJECT_PRONOUNS = new Set(["i", "we", "you", "they", "he", "she", "it"]);
export const DETERMINERS = new Set([
  "a", "an", "the", "our", "your", "their", "his", "her", "its", "my", "this", "that", "these", "those", "some", "any",
  "more", "all", "each", "every", "no", "enough", "another", "other",
]);
export const CONJUNCTIONS = new Set(["and", "but", "or", "so", "because", "if", "when", "while", "although", "though", "unless", "since", "as", "that", "which", "who", "whether"]);
export const NEGATIONS = new Set(["not", "no", "never", "none", "nothing"]);

export function isFunctionWord(w: string): boolean {
  return (
    BE_FORMS.has(w) || AUXILIARIES.has(w) || MODALS.has(w) || ARTICLES.has(w) || PREPOSITIONS.has(w) ||
    SUBJECT_PRONOUNS.has(w) || DETERMINERS.has(w) || CONJUNCTIONS.has(w) || w === "not"
  );
}

export function capitalizeSentence(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return t;
  const first = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(first) ? first : first + ".";
}

/** Join tokens back into readable text (punctuation attaches to the previous word). */
export function joinWords(parts: { text: string; punct?: boolean }[]): string {
  let out = "";
  for (const p of parts) {
    if (!p.text) continue;
    if (!out) out = p.text;
    else if (p.punct && /^[.,!?;:%)]$/.test(p.text)) out += p.text;
    else if (out.endsWith("(")) out += p.text;
    else out += " " + p.text;
  }
  return out;
}
