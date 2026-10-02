import type { PdfTextItem } from "../pdf/pdf-adapter";

/** One visual line of text inside a single column. Coordinates are pt, top-left origin. */
export interface TextLine {
  text: string;
  x: number; right: number; y: number; bottom: number;
  /** Dominant glyph size; sub/superscripts do not count. */
  size: number;
  /** -1 = crosses the gutter, 0 = left column, 1 = right column. */
  column: number;
  /** Built from pieces separated by large horizontal gaps (table rows, figure labels). */
  tabular: boolean;
  /** Dominant face is a sans family (pdf.js font classification). */
  sans?: boolean;
  /** Left edge of each main item, for splitting run-in headings. */
  items: { text: string; x: number; right: number }[];
}

export const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

type Piece = { main: PdfTextItem[]; scripts: PdfTextItem[]; size: number; base: number; x: number; right: number };

const CITATION = /^[\d,\s–−-]+$/;
const baselineOf = (item: PdfTextItem) => item.baseline ?? item.y + item.height * .8;

/**
 * Join PDF text items into visual lines by baseline. Items only join across a
 * gap smaller than roughly one em, so narrow column gutters (Elsevier's
 * ARTICLE INFO / ABSTRACT split is ~11pt) never fuse two columns. Ligature
 * glyphs (fi, ff) often come from a second font with another ascent, so the
 * baseline, not the glyph box, decides which line an item belongs to.
 */
export function buildTextLines(items: PdfTextItem[]): TextLine[] {
  const source = items.filter(item => item.text.trim() && item.width > 0 && item.height > 0).sort((a, b) => a.x - b.x || a.y - b.y);
  const pieces: Piece[] = [];
  for (const item of source) {
    const base = baselineOf(item);
    let target: Piece | undefined, script = false;
    for (let index = pieces.length - 1; index >= 0; index--) {
      const piece = pieces[index];
      const size = Math.max(piece.size, item.height);
      const gap = item.x - piece.right;
      // The smaller face decides the word gap: a 32 pt "■" must not bridge a column gutter.
      if (gap > Math.max(Math.min(piece.size, item.height) * .9, 3.5) || gap < -size * 2) continue;
      const small = item.height < piece.size * .82;
      const decorative = piece.main.every(main => !/[A-Za-z0-9]/.test(main.text));
      if (small && decorative && Math.abs(base - piece.base) < piece.size * .5) { target = piece; break; }
      if (small && base > piece.base - piece.size * .75 && base < piece.base + piece.size * .45 && gap < piece.size * .45) { target = piece; script = Math.abs(base - piece.base) > piece.size * .08; break; }
      if (Math.abs(base - piece.base) < size * .3) { target = piece; break; }
    }
    if (!target) { pieces.push({ main: [item], scripts: [], size: item.height, base, x: item.x, right: item.x + item.width }); continue; }
    if (script) target.scripts.push(item);
    else if (target.main.every(main => main.height < item.height * .82) || /[A-Za-z0-9]/.test(item.text) && target.main.every(main => !/[A-Za-z0-9]/.test(main.text))) {
      // A line that began with a superscript marker or a decorative "■": promote the real text.
      target.scripts.push(...target.main); target.main = [item]; target.size = item.height; target.base = base;
    } else target.main.push(item);
    target.x = Math.min(target.x, item.x); target.right = Math.max(target.right, item.x + item.width);
  }
  return pieces.map(piece => {
    const dominant = [...piece.main].sort((a, b) => b.text.trim().length - a.text.trim().length)[0];
    const size = dominant.height;
    const all = [...piece.main.map(item => ({ item, script: false })), ...piece.scripts.map(item => ({ item, script: true }))].sort((a, b) => a.item.x - b.item.x);
    let text = "", previousRight = -Infinity;
    // In a formula a raised digit is an exponent, never a citation.
    const formula = all.some(({ item }) => /[=≤≥∝]/.test(item.text));
    for (const { item, script } of all) {
      const gap = item.x - previousRight, value = item.text.replace(/\s+/g, " ");
      const superscript = script && baselineOf(item) < piece.base - size * .15;
      if (superscript && !formula && CITATION.test(value.trim()) && /(?:[A-Za-z]{3,}|[.,;:)\]])$/.test(text.trimEnd())) {
        text = text.trimEnd() + `[${value.trim().replace(/\s+/g, "")}]`;
      } else if (script) text += value.trim();
      else {
        if (text && gap > size * .12 && !text.endsWith(" ") && !value.startsWith(" ")) text += " ";
        text += value;
      }
      previousRight = Math.max(previousRight, item.x + item.width);
    }
    // A missing glyph inside a word ("NO■x") is an artefact of the PDF font, not text.
    text = text.replace(/(?<=[A-Za-z0-9])[■□](?=[A-Za-z0-9])/g, "");
    const regular = piece.main.filter(item => Math.abs(item.height - size) < size * .15);
    const top = piece.base - size * .8, bottom = Math.max(piece.base + size * .2, ...regular.map(item => item.y + item.height).filter(value => value < piece.base + size * .5));
    return { text: text.replace(/\s+/g, " ").trim(), x: piece.x, right: piece.right, y: Math.min(top, ...regular.map(item => item.y).filter(value => value > top - size * .3)), bottom, size, column: 0, tabular: false, sans: /sans/i.test(dominant.fontFamily) && !/serif/i.test(dominant.fontFamily.replace(/sans-serif/i, "")), items: piece.main.map(item => ({ text: item.text, x: item.x, right: item.x + item.width })) };
  }).filter(line => line.text);
}

export interface Gutter { left: number; right: number; center: number }

/**
 * Find the whitespace channel between two text columns. Journals do not put
 * it at the page centre on every page (front matter often uses a 1/3 split),
 * so search for the x position that the fewest lines cross.
 */
export function findGutter(lines: TextLine[], width: number): Gutter | null {
  const size = median(lines.map(line => line.size)) || 9;
  const content = lines.filter(line => line.right - line.x > width * .06 && line.size > size * .55);
  let best: { x: number; cross: number; balance: number } | null = null;
  for (let x = Math.round(width * .22); x <= width * .78; x++) {
    const left = content.filter(line => line.right <= x + 1), right = content.filter(line => line.x >= x - 1);
    if (left.length < 4 || right.length < 4) continue;
    // Only lines where both columns actually have text nearby can disprove a
    // gutter; titles, full-width abstracts and footnotes span the page legitimately.
    const near = (line: TextLine, side: TextLine[]) => side.some(other => Math.abs(other.y - line.y) < size * 3);
    const cross = content.filter(line => line.x < x - 1 && line.right > x + 1 && near(line, left) && near(line, right)).length;
    const balance = Math.min(left.filter(line => near(line, right)).length, right.filter(line => near(line, left)).length);
    if (balance < 3 || cross > Math.max(1, balance * .15)) continue;
    if (!best || cross < best.cross || cross === best.cross && balance > best.balance) best = { x, cross, balance };
  }
  if (!best) return null;
  const x = best.x;
  const leftEdge = Math.max(...content.filter(line => line.right <= x + 1).map(line => line.right));
  const rightEdge = Math.min(...content.filter(line => line.x >= x - 1).map(line => line.x));
  if (rightEdge - leftEdge < 4) return null;
  return { left: leftEdge, right: rightEdge, center: (leftEdge + rightEdge) / 2 };
}

/** Assign columns, merge same-baseline fragments within a column, and return reading order. */
export function orderLines(lines: TextLine[], gutter: Gutter | null): TextLine[] {
  for (const line of lines) line.column = !gutter ? 0 : line.right <= gutter.center + 2 ? 0 : line.x >= gutter.center - 2 ? 1 : -1;
  const merged: TextLine[] = [];
  for (const line of [...lines].sort((a, b) => (a.y + a.bottom) / 2 - (b.y + b.bottom) / 2 || a.x - b.x)) {
    const center = (line.y + line.bottom) / 2;
    const host = merged.find(other => other.column === line.column && Math.abs((other.y + other.bottom) / 2 - center) < Math.min(other.size, line.size) * .35 && Math.abs(other.size - line.size) < Math.max(other.size, line.size) * .25);
    if (!host) { merged.push({ ...line }); continue; }
    const [first, second] = host.x <= line.x ? [host, line] : [line, host];
    const gap = second.x - first.right;
    host.tabular = host.tabular || line.tabular || gap > Math.max(host.size, line.size) * 1.2;
    host.text = `${first.text} ${second.text}`; host.items = [...first.items, ...second.items];
    host.x = Math.min(host.x, line.x); host.right = Math.max(host.right, line.right);
    host.y = Math.min(host.y, line.y); host.bottom = Math.max(host.bottom, line.bottom); host.size = Math.max(host.size, line.size);
  }
  const byTop = (a: TextLine, b: TextLine) => a.y - b.y || a.x - b.x;
  if (!gutter) return merged.sort(byTop);
  const separators = merged.filter(line => line.column === -1).sort(byTop), columns = merged.filter(line => line.column !== -1);
  const result: TextLine[] = [];
  let lower = -Infinity;
  const band = (upper: number) => {
    const inside = columns.filter(line => line.y >= lower && line.y < upper);
    result.push(...inside.filter(line => line.column === 0).sort(byTop), ...inside.filter(line => line.column === 1).sort(byTop));
  };
  for (const separator of separators) { band(separator.y); result.push(separator); lower = separator.y; }
  band(Infinity);
  return result;
}
