import type { Rect } from "./page-typesetter";
import { scriptSegments, type ScriptTable } from "./scripts";

/** Figure / table / equation references and bracketed citations inside translated prose. */
export const REFERENCE = /((?:Figures?|Figs?\.|Tables?|Equations?|Eqs?\.|eqs?)\s*\(?\d+[a-z]?\)?(?:\s*(?:and|,|–|-)\s*\(?\d+[a-z]?\)?)*|\[\d+(?:\s*[,–-]\s*\d+)*\])/;

/** Dominant ink colour of a source area (journal headings and links are often blue). */
export function inkColor(canvas: HTMLCanvasElement, rect: Rect, width: number) {
  const ratio = canvas.width / width, x = Math.max(0, Math.floor(rect.x * ratio)), y = Math.max(0, Math.floor(rect.y * ratio));
  const w = Math.min(canvas.width - x, Math.ceil(rect.width * ratio)), h = Math.min(canvas.height - y, Math.ceil(rect.height * ratio));
  if (w < 2 || h < 2 || w * h > 400_000) return undefined;
  try {
    const data = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(x, y, w, h).data, votes = new Map<string, number>();
    for (let offset = 0; offset < data.length; offset += 12) {
      const r = data[offset], g = data[offset + 1], b = data[offset + 2];
      if (Math.min(r, g, b) > 200) continue;
      const key = [r, g, b].map(value => Math.round(value / 24) * 24).join(",");
      votes.set(key, (votes.get(key) ?? 0) + 1);
    }
    const best = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
    return best ? `rgb(${best})` : undefined;
  } catch { return undefined; }
}

/** A link colour (clearly chromatic), darkened when anti-aliasing sampled it pale. */
export function linkInk(canvas: HTMLCanvasElement, rect: Rect, width: number) {
  const color = inkColor(canvas, rect, width);
  const [r, g, b] = (color?.match(/\d+/g) ?? []).map(Number);
  if (!color || Math.max(r, g, b) - Math.min(r, g, b) <= 60) return undefined;
  const light = r + g + b > 420 ? .62 : 1;
  return `rgb(${Math.round(r * light)},${Math.round(g * light)},${Math.round(b * light)})`;
}

export interface Piece { text: string; kind?: "sub" | "sup"; color?: string }
/**
 * Translated text as painted: scripts as the paper prints them (CO₂, Kᵢ, m², raised citations),
 * then link colours on references. The reader and the PDF export both paint these pieces.
 */
export function styledPieces(text: string, scripts: ScriptTable | undefined, referenceColor?: string, citationColor?: string): Piece[] {
  const colour = (piece: string): Piece[] => !referenceColor && !citationColor ? [{ text: piece }] : piece.split(REFERENCE).map((part, index) => index % 2 ? { text: part, color: part.startsWith("[") ? citationColor : referenceColor } : { text: part }).filter(part => part.text);
  return scriptSegments(text, scripts).flatMap(segment => segment.kind ? [{ text: segment.text, kind: segment.kind, color: segment.citation ? citationColor : undefined }] : colour(segment.text));
}
