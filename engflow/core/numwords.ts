/**
 * Number words, shared by the tokenizer (so "three" matches "3" everywhere) and the number reader
 * (numbers.ts). No imports: text.ts depends on this file.
 */

export type NumberKind = "unit" | "teen" | "tens" | "hundred" | "scale";

const UNITS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9 };
/** "first" and "second" are left out on their own ("at first", "wait a second"); they count inside "twenty-first". */
const ORDINALS: Record<string, [number, NumberKind]> = {
  third: [3, "unit"], fourth: [4, "unit"], fifth: [5, "unit"], sixth: [6, "unit"], seventh: [7, "unit"], eighth: [8, "unit"], ninth: [9, "unit"],
  tenth: [10, "teen"], eleventh: [11, "teen"], twelfth: [12, "teen"], thirteenth: [13, "teen"], fourteenth: [14, "teen"], fifteenth: [15, "teen"],
  sixteenth: [16, "teen"], seventeenth: [17, "teen"], eighteenth: [18, "teen"], nineteenth: [19, "teen"], twentieth: [20, "tens"], thirtieth: [30, "tens"],
};
export const COMPOUND_ORDINALS: Record<string, number> = { first: 1, second: 2 };

export function wordKind(s: string): [number, NumberKind] | null {
  if (s in UNITS) return [UNITS[s], "unit"];
  if (s in TEENS) return [TEENS[s], "teen"];
  if (s in TENS) return [TENS[s], "tens"];
  if (s === "hundred") return [100, "hundred"];
  if (s in SCALES) return [SCALES[s], "scale"];
  if (s in ORDINALS) return ORDINALS[s];
  return null;
}

/** Whether a number word of kind `k` can continue a number that so far ended with `prev`. */
export function canFollow(prev: NumberKind | null, k: NumberKind): boolean {
  if (prev === null) return true;
  if (k === "unit") return prev === "tens" || prev === "hundred" || prev === "scale";
  if (k === "teen" || k === "tens") return prev === "hundred" || prev === "scale";
  if (k === "hundred") return prev === "unit" || prev === "teen" || prev === "tens";
  return prev !== "scale"; // "two hundred thousand"
}

/** "90", "1.6", "15th", "1990s", "90k", "10mm", "5pm": the leading number of a digit token. */
export function digitValue(s: string): number | null {
  const m = /^(\d+(?:\.\d+)?)([a-z%]*)$/.exec(s);
  if (!m) return null;
  const v = Number(m[1]);
  return m[2] === "k" ? v * 1000 : v;
}

/**
 * One token's number in a canonical spelling, so "three" = "3", "twenty-five" = "25", "15th" = "15",
 * "four-week" = "4-week"; undefined when the token is not a number. "first"/"second" alone are not.
 */
export function numberKey(norm: string): string | undefined {
  if (/^\d+(\.\d+)?$/.test(norm)) return String(Number(norm));
  // Ordinals stay ordinals ("for the third time" is not "three times"): "15th" = "fifteenth" = "15th".
  const ord = /^(\d+)(st|nd|rd|th)$/.exec(norm);
  if (ord) return `${Number(ord[1])}th`;
  if (!/^[a-z0-9-]+$/.test(norm)) return undefined;
  const parts = norm.split("-");
  // Leading number words or digits, then anything else ("four-week", "twenty-five-minute", "3-4").
  let cur = 0;
  let prev: NumberKind | null = null;
  let isOrdinal = false;
  let k = 0;
  for (; k < parts.length && !isOrdinal; k++) {
    const p = parts[k];
    const compound: number | null = prev === "tens" && p in COMPOUND_ORDINALS ? COMPOUND_ORDINALS[p] : null;
    const wk: [number, NumberKind] | null = compound !== null ? [compound, "unit"] : wordKind(p);
    if (!wk || wk[1] === "hundred" || wk[1] === "scale" || !canFollow(prev, wk[1])) break;
    cur += wk[0];
    prev = wk[1];
    isOrdinal = compound !== null || p in ORDINALS;
  }
  if (k === 0) {
    if (parts.length > 1 && /^\d+$/.test(parts[0])) return [String(Number(parts[0])), ...parts.slice(1).map((p) => numberKey(p) ?? p)].join("-");
    return undefined;
  }
  return [isOrdinal ? `${cur}th` : String(cur), ...parts.slice(k).map((p) => numberKey(p) ?? p)].join("-");
}
