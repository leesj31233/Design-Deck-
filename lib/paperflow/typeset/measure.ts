import type { Measure } from "./line-breaker";

/**
 * Latin terms keep a Times-like journal face; Hangul falls through to the
 * self-hosted Noto Serif KR. Canvas and DOM resolve the same stack, so a line
 * measured here is exactly the line the reader paints.
 */
let koreanSerif = '"Noto Serif KR", "Batang", "AppleMyungjo"';
let generation = 0;
/** Changes whenever measured widths may have changed; part of every layout cache key. */
export function fontGeneration() { return generation; }
export function setKoreanSerifFamily(family: string) {
  const next = `${family}, "Batang", "AppleMyungjo"`;
  if (next === koreanSerif) return;
  koreanSerif = next; measures.clear(); generation++;
}
export function paperFontStack(sans = false) {
  return sans ? `Arial, Helvetica, "Liberation Sans", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif` : `"Times New Roman", Times, "Liberation Serif", ${koreanSerif}, serif`;
}

const REFERENCE = 64;
const measures = new Map<string, Measure>();

export function canvasMeasure(family = paperFontStack()): Measure {
  const existing = measures.get(family);
  if (existing) return existing;
  const context = document.createElement("canvas").getContext("2d")!;
  // Must match `.pf-tx-line { font-kerning: none }`; kerning across tokens would desynchronise widths.
  (context as CanvasRenderingContext2D & { fontKerning: string }).fontKerning = "none";
  // Unhinted advances scale linearly with size, like `.pf-tx-layer { text-rendering: geometricPrecision }`.
  (context as CanvasRenderingContext2D & { textRendering: string }).textRendering = "geometricPrecision";
  const cache = new Map<string, number>();
  const sansFamily = paperFontStack(true);
  const measure: Measure = (text, bold, sans = false) => {
    const key = (bold ? "b" : "r") + (sans ? "s" : "") + text;
    let width = cache.get(key);
    if (width === undefined) {
      context.font = `${bold ? 700 : 400} ${REFERENCE}px ${sans ? sansFamily : family}`;
      width = context.measureText(text).width / REFERENCE;
      if (cache.size > 60000) cache.clear();
      cache.set(key, width);
    }
    return width;
  };
  measures.set(family, measure);
  return measure;
}

/** Load the unicode-range slices of the Korean face that this text needs before measuring it. */
const loaded = new Set<string>();
export async function ensurePaperFonts(text: string) {
  if (typeof document === "undefined" || !document.fonts) return;
  const missing = [...new Set(text.replace(/\s/g, ""))].filter(char => !loaded.has(char));
  if (!missing.length) return;
  const sample = missing.join("");
  try {
    await Promise.all([document.fonts.load(`400 16px ${paperFontStack()}`, sample), document.fonts.load(`700 16px ${paperFontStack()}`, sample)]);
  } catch { /* A missing web font falls back to system serif; layout stays consistent because canvas and DOM share the stack. */ }
  for (const char of missing) loaded.add(char);
  // Widths measured before a face arrived are stale.
  measures.clear(); generation++;
}
