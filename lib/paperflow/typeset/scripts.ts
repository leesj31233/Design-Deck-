import type { Measure } from "./line-breaker";

/**
 * Sub- and superscripts inside translated prose. The translator sees plain text ("CO2", "Ki"),
 * so the scripts are recovered on the way out: from the paper's own glyph positions (`tokens`),
 * from chemical formulas, and from TeX-like markup the model sometimes writes ("K_i", "m^2").
 */
export interface ScriptTable {
  /** Plain token → marked form, e.g. "CO2" → "CO_{2}", "m2" → "m^{2}". */
  tokens: Record<string, string>;
  /** The paper prints citations as superscript numbers rather than "[13]". */
  superCitations: boolean;
}
export interface Segment { text: string; kind?: "sub" | "sup"; citation?: boolean }

export const SCRIPT_SCALE = .7;
const MARKUP = /([_^])\{([^{}]*)\}/g;
const ELEMENTS = new Set("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Mo Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce W Pt Au Hg Pb Bi U".split(" "));
const SINGLE_GASES = new Set(["H", "N", "O", "F", "Cl"]);
const CITATION = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g;
/** Runs of Latin text where a formula or symbol can live; Hangul and spaces end them. */
const LATIN_RUN = /[A-Za-z0-9_^{}[\]().\/+\-−*'′,:;]+/g;

/** "CO_{2}" → segments. */
export function parseMarkup(marked: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of marked.matchAll(MARKUP)) {
    if (match.index > last) out.push({ text: marked.slice(last, match.index) });
    out.push({ text: match[2], kind: match[1] === "_" ? "sub" : "sup" });
    last = match.index + match[0].length;
  }
  if (last < marked.length) out.push({ text: marked.slice(last) });
  return out;
}
export const plainOf = (marked: string) => marked.replace(MARKUP, "$2");

/** Strip punctuation that belongs to the sentence, not the symbol: "(CO2)," → ["(", "CO2", "),"]. */
export function coreOf(token: string): [string, string, string] {
  let start = 0, end = token.length;
  const count = (char: string) => token.slice(start, end).split(char).length - 1;
  const pairs: Record<string, string> = { "(": ")", "[": "]", ")": "(", "]": "[" };
  // An opening bracket stays only when the symbol closes it ("k2[CmHn]"); a closing one only when it was opened.
  for (let changed = true; changed && start < end;) {
    changed = false;
    // "(Vy)": a pair that wraps the whole symbol is sentence punctuation.
    if (token[start] === "(" && token[end - 1] === ")" && end - start > 2 && !/[()]/.test(token.slice(start + 1, end - 1))) { start++; end--; changed = true; continue; }
    if ("([".includes(token[start]) && count(token[start]) > count(pairs[token[start]])) { start++; changed = true; }
    const last = token[end - 1];
    if (end > start && (".,;:'′".includes(last) || ")]".includes(last) && count(last) > count(pairs[last]))) { end--; changed = true; }
  }
  return [token.slice(0, start), token.slice(start, end), token.slice(end)];
}

/** "CO2" → "CO_{2}", "0.5O2" → "0.5O_{2}", "NOx" → "NO_{x}"; anything that is not a formula → null. */
export function chemicalMarkup(token: string): string | null {
  const special = token.match(/^(NO|SO)x$/);
  if (special) return `${special[1]}_{x}`;
  const match = token.match(/^(\d*\.?\d*)((?:[A-Z][a-z]?\d*)+)([+-]?)$/);
  if (!match || !/[A-Za-z]\d/.test(match[2])) return null;
  const parts = [...match[2].matchAll(/([A-Z][a-z]?)(\d*)/g)];
  if (!parts.every(part => ELEMENTS.has(part[1]))) return null;
  if (parts.length === 1 && !SINGLE_GASES.has(parts[0][1])) return null;
  // "CO2" yes; "C2" or "B12" (labels, vitamins) no: a lone symbol needs to be a diatomic gas.
  return match[1] + parts.map(part => part[2] ? `${part[1]}_{${part[2]}}` : part[1]).join("") + (match[3] ? `^{${match[3]}}` : "");
}

/** Markup the model itself wrote: "K_i", "T_{w}", "m^2", "s^-1". */
function modelMarkup(core: string): string | null {
  if (!/[_^]/.test(core) || core.includes("__")) return null;
  const marked = core.replace(/([A-Za-z0-9)\]])([_^])(?:\{([^{}]{1,12})\}|([-−+]?[A-Za-z0-9]{1,4}))/g, (_, base: string, mark: string, braced?: string, bare?: string) => `${base}${mark}{${braced ?? bare}}`);
  return marked !== core && !/[_^](?!\{)/.test(marked) ? marked : null;
}

function merge(segments: Segment[]) {
  const out: Segment[] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    const last = out.at(-1);
    if (last && last.kind === segment.kind && last.citation === segment.citation) last.text += segment.text;
    else out.push({ ...segment });
  }
  return out;
}

function latinSegments(run: string, table: ScriptTable | undefined): Segment[] {
  const [lead, core, tail] = coreOf(run);
  if (!core) return [{ text: run }];
  const lookup = (part: string) => table?.tokens[part] ?? modelMarkup(part) ?? chemicalMarkup(part);
  let marked = lookup(core);
  // "CO-O2", "H2/O2", "CH4–air": formulas joined by a dash or slash.
  if (!marked && /[-–/]/.test(core)) {
    const parts = core.split(/([-–/])/).map(part => /^[-–/]$/.test(part) ? part : lookup(part) ?? part);
    if (parts.some(part => /[_^]\{/.test(part))) marked = parts.join("");
  }
  return marked ? [{ text: lead }, ...parseMarkup(marked), { text: tail }] : [{ text: run }];
}

/** Split translated text into plain and scripted pieces. */
export function scriptSegments(text: string, table?: ScriptTable): Segment[] {
  if (!/[A-Za-z0-9[]/.test(text)) return [{ text }];
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(LATIN_RUN)) {
    if (match.index > last) out.push({ text: text.slice(last, match.index) });
    last = match.index + match[0].length;
    let cursor = 0;
    const run = match[0];
    // Citations first: "[4,5]" becomes a raised "4,5" when the paper prints them that way.
    if (table?.superCitations) for (const citation of run.matchAll(CITATION)) {
      if (citation.index > cursor) out.push(...latinSegments(run.slice(cursor, citation.index), table));
      out.push({ text: citation[1].replace(/\s+/g, ""), kind: "sup", citation: true });
      cursor = citation.index + citation[0].length;
    }
    if (cursor < run.length) out.push(...latinSegments(run.slice(cursor), table));
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return merge(out);
}

/** Measure text the way it is painted: scripts at SCRIPT_SCALE of the line size. */
export function scriptedMeasure(measure: Measure, table?: ScriptTable): Measure {
  const cache = new Map<string, number>();
  return (text, bold, sans = false) => {
    if (!/[0-9_^[]/.test(text) && !(table && Object.keys(table.tokens).length && /[A-Za-z]/.test(text))) return measure(text, bold, sans);
    const key = (bold ? "b" : "r") + (sans ? "s" : "") + text;
    let width = cache.get(key);
    if (width === undefined) {
      width = scriptSegments(text, table).reduce((sum, segment) => sum + measure(segment.text, bold, sans) * (segment.kind ? SCRIPT_SCALE : 1), 0);
      if (cache.size > 20000) cache.clear();
      cache.set(key, width);
    }
    return width;
  };
}

/**
 * Build the paper's script table from marked source tokens. A token is only used when the
 * paper prints it with its scripts at least as often as without them.
 */
export function buildScriptTable(marked: string[], plainTexts: string[], citations: { raised: number; total: number }): ScriptTable {
  const votes = new Map<string, Map<string, number>>();
  for (const token of marked) {
    const plain = plainOf(token);
    if (plain.length < 2 || plain.length > 32 || plain === token) continue;
    const forms = votes.get(plain) ?? new Map<string, number>();
    forms.set(token, (forms.get(token) ?? 0) + 1);
    votes.set(plain, forms);
  }
  const occurrences = new Map<string, number>();
  for (const text of plainTexts) for (const run of text.match(LATIN_RUN) ?? []) {
    const core = coreOf(run)[1];
    if (votes.has(core)) occurrences.set(core, (occurrences.get(core) ?? 0) + 1);
  }
  const tokens: Record<string, string> = {};
  for (const [plain, forms] of votes) {
    const [best, count] = [...forms].sort((a, b) => b[1] - a[1])[0];
    if (count * 2 >= (occurrences.get(plain) ?? count)) tokens[plain] = best;
  }
  return { tokens, superCitations: citations.raised >= 3 && citations.raised * 2 >= citations.total };
}
