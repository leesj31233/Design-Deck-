import type { PdfTextItem } from "../pdf/pdf-adapter";
import { coreOf } from "../typeset/scripts";

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
  /** Share of the line's characters set in a fixed-width (code) face. */
  mono?: number;
  /** Left edge of each main item, for splitting run-in headings. */
  items: { text: string; x: number; right: number }[];
  /** Most of the line is set in a bold face. */
  bold?: boolean;
  /** Tokens printed with sub/superscripts, marked "CO_{2}" / "m^{2}". */
  marks?: string[];
  /** Superscript citation numbers turned into "[n]". */
  raised?: number;
}

/** Characters set in a fixed-width face (pdf.js classifies Courier, NimbusMono, cmtt … as monospace). */
const boldShare = (items: PdfTextItem[]) => { const total = items.reduce((sum, item) => sum + item.text.trim().length, 0); return total ? items.filter(item => item.bold).reduce((sum, item) => sum + item.text.trim().length, 0) / total : 0; };
const monoShare = (items: PdfTextItem[]) => { const total = items.reduce((sum, item) => sum + item.text.trim().length, 0); return total ? items.filter(item => /mono/i.test(item.fontFamily)).reduce((sum, item) => sum + item.text.trim().length, 0) / total : 0; };

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
      const decorative = piece.main.every(main => !/[\p{L}\p{N}]/u.test(main.text));
      if (small && decorative && Math.abs(base - piece.base) < piece.size * .5) { target = piece; break; }
      if (small && base > piece.base - piece.size * .75 && base < piece.base + piece.size * .45 && gap < piece.size * .45) { target = piece; script = Math.abs(base - piece.base) > piece.size * .08; break; }
      if (Math.abs(base - piece.base) < size * .3) { target = piece; break; }
    }
    if (!target) { pieces.push({ main: [item], scripts: [], size: item.height, base, x: item.x, right: item.x + item.width }); continue; }
    if (script) target.scripts.push(item);
    else if (target.main.every(main => main.height < item.height * .82) || /[\p{L}\p{N}]/u.test(item.text) && target.main.every(main => !/[\p{L}\p{N}]/u.test(main.text))) {
      // A line that began with a superscript marker or a decorative "■": promote the real text.
      target.scripts.push(...target.main); target.main = [item]; target.size = item.height; target.base = base;
    } else target.main.push(item);
    target.x = Math.min(target.x, item.x); target.right = Math.max(target.right, item.x + item.width);
  }
  return pieces.map(piece => {
    const dominant = [...piece.main].sort((a, b) => b.text.trim().length - a.text.trim().length)[0];
    const size = dominant.height;
    const all = [...piece.main.map(item => ({ item, script: false })), ...piece.scripts.map(item => ({ item, script: true }))].sort((a, b) => a.item.x - b.item.x);
    let text = "", marked = "", raised = 0, previousRight = -Infinity, previousKind = "", citationOpen = false;
    // In a formula a raised digit is an exponent, never a citation.
    const formula = all.some(({ item }) => /[=≤≥∝]/.test(item.text));
    for (const { item, script } of all) {
      const gap = item.x - previousRight, value = item.text.replace(/\s+/g, " ");
      const superscript = script && baselineOf(item) < piece.base - size * .15;
      const kind = !script ? "" : baselineOf(item) > piece.base ? "_" : "^";
      // A raised number after a word, "%", a closing mark or a subscript ("tCO₂¹³") is a citation;
      // an exponent never carries a comma or a range.
      const cites = /(?:[A-Za-z]{3,}|[.,;:)\]%])$/.test(text.trimEnd()) || previousKind === "_" || /[,–-]/.test(value.trim());
      // "⁵³", "–", "⁵⁶" set as separate raised glyphs are one citation: "[53–56]".
      if (superscript && !formula && CITATION.test(value.trim()) && citationOpen && gap < size * .4) {
        const piece = value.trim().replace(/\s+/g, "");
        text = `${text.trimEnd().slice(0, -1)}${piece}]`; marked = `${marked.trimEnd().slice(0, -1)}${piece}]`;
        if (/\s$/.test(item.text)) { text += " "; marked += " "; citationOpen = false; }
      } else if (superscript && !formula && CITATION.test(value.trim()) && /\d/.test(value) && cites) {
        citationOpen = !/\s$/.test(item.text);
        text = text.trimEnd() + `[${value.trim().replace(/\s+/g, "")}]`;
        marked = marked.trimEnd() + `[${value.trim().replace(/\s+/g, "")}]`; raised++;
        // "rotation.¹⁷ Radiation": the word space can travel inside the raised item.
        if (/\s$/.test(item.text)) { text += " "; marked += " "; }
      } else if (script) {
        text += value.trim();
        // "K⁻¹" often arrives as two raised glyphs: keep one script.
        if (previousKind === kind && marked.endsWith("}") && gap < size * .15) marked = `${marked.slice(0, -1)}${value.trim()}}`;
        else marked += `${kind}{${value.trim()}}`;
        // "m" + "p " + "is the particle mass": the word space travels inside the subscript item.
        if (/\s$/.test(item.text)) { text += " "; marked += " "; }
      } else {
        if (text && gap > size * .12 && !text.endsWith(" ") && !value.startsWith(" ")) { text += " "; marked += " "; }
        text += value; marked += value;
      }
      if (!superscript) citationOpen = false;
      previousKind = kind && !(superscript && marked.endsWith("]")) ? kind : "";
      previousRight = Math.max(previousRight, item.x + item.width);
    }
    // A missing glyph inside a word ("NO■x") is an artefact of the PDF font, not text.
    text = text.replace(/(?<=[A-Za-z0-9])[■□](?=[A-Za-z0-9])/g, "").replace(/(?<=[\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef]) +(?=[\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef])/g, "");
    const regular = piece.main.filter(item => Math.abs(item.height - size) < size * .15);
    const top = piece.base - size * .8, bottom = Math.max(piece.base + size * .2, ...regular.map(item => item.y + item.height).filter(value => value < piece.base + size * .5));
    const marks = piece.scripts.length ? markedTokens(marked) : undefined;
    return { marks, raised: raised || undefined, text: text.replace(/\s+/g, " ").trim(), x: piece.x, right: piece.right, y: Math.min(top, ...regular.map(item => item.y).filter(value => value > top - size * .3)), bottom, size, column: 0, tabular: false, mono: monoShare(piece.main), bold: boldShare(piece.main) > .5 || undefined, sans: /sans/i.test(dominant.fontFamily) && !/serif/i.test(dominant.fontFamily.replace(/sans-serif/i, "")), items: piece.main.map(item => ({ text: item.text, x: item.x, right: item.x + item.width })) };
  }).filter(line => line.text);
}

/** Symbols worth remembering: short scripts on a short token ("CO_{2}", "K_{i}", "m^{2}"), not footnote marks on words. */
function markedTokens(marked: string) {
  return marked.split(/\s+/).map(token => coreOf(token)[1]).filter(token => {
    const scripts = [...token.matchAll(/[_^]\{([^{}]*)\}/g)].map(match => match[1]);
    if (!scripts.length || scripts.some(script => !/^[A-Za-z0-9+\-−.,*′']{1,6}$/.test(script))) return false;
    const base = token.replace(/[_^]\{[^{}]*\}/g, " ").trim();
    return token.length <= 48 && !/[a-z]{4,}|\[\d/.test(base) && !/^[\d%]+$/.test(base.replace(/\s/g, ""));
  });
}

/** Manuscript line numbers ("432" down the left margin) are not text of the paper. */
/**
 * Patents (and some theses) print line numbers 5, 10, 15 … in the gutter between the columns. They
 * must go before lines are built, or a number bridges the gutter and fuses a left-column line with
 * the right-column line beside it ("…nitrogen removed 45 air guide…"). Three or more multiples of
 * five stacked at one x near the middle of the page are such numbers.
 */
export function dropGutterNumbers(items: PdfTextItem[], width: number): PdfTextItem[] {
  items = items.flatMap(item => splitAtGutterNumber(item, width));
  const candidates = items.filter(item => /^\d{1,3}$/.test(item.text.trim()) && Number(item.text.trim()) % 5 === 0 && Math.abs(item.x + item.width / 2 - width / 2) < width * .12);
  if (candidates.length < 3) return items;
  const drop = new Set<PdfTextItem>();
  for (const item of candidates) {
    // OCR text layers place the same column of numbers a few points apart.
    const center = item.x + item.width / 2, stack = candidates.filter(other => Math.abs(other.x + other.width / 2 - center) < 30);
    if (stack.length >= 3) for (const other of stack) drop.add(other);
  }
  return drop.size ? items.filter(item => !drop.has(item)) : items;
}

/**
 * The invisible OCR layer of a scanned patent often stores one scan line as one item across both
 * columns, the gutter line number inside it ("…nitrogen removed45 air guide…"). Split such an item at
 * that number into its left- and right-column parts (positions in proportion to the characters).
 */
function splitAtGutterNumber(item: PdfTextItem, width: number): PdfTextItem[] {
  if (item.width < width * .55 || item.text.length < 20) return [item];
  const perChar = item.width / item.text.length;
  // A number glued to the words around it ("removed45 air", "08/099, 10 form"), never part of a quantity ("2800F").
  for (const match of item.text.matchAll(/(?<=[A-Za-z)\].,;:])\s?([1-9]\d?[05])(?=\s?[A-Za-z(])\s?/g)) {
    const at = match.index!, middle = item.x + (at + match[0].length / 2) * perChar;
    if (Math.abs(middle - width / 2) > width * .1) continue;
    const leftText = item.text.slice(0, at).trimEnd(), rightText = item.text.slice(at + match[0].length).trimStart();
    if (leftText.length < 3 || rightText.length < 3) continue;
    // Character positions are estimates: keep the gutter visibly open so the halves never rejoin as one line.
    const rightX = item.x + (item.text.length - rightText.length + .6) * perChar;
    return [{ ...item, text: leftText, width: (leftText.length - .6) * perChar, hasEOL: false }, { ...item, text: rightText, x: rightX, width: item.x + item.width - rightX }];
  }
  return [item];
}

export function dropLineNumbers(lines: TextLine[], width: number): TextLine[] {
  const numbers = lines.filter(line => /^\d{1,4}$/.test(line.text) && line.right < width * .2);
  return numbers.length >= 6 ? lines.filter(line => !numbers.includes(line)) : lines;
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
export function orderLines(lines: TextLine[], gutter: Gutter | null, width = 612): TextLine[] {
  for (const line of lines) line.column = !gutter ? 0 : line.right <= gutter.center + 2 ? 0 : line.x >= gutter.center - 2 ? 1 : -1;
  // A front-matter band can have its own split (Elsevier: narrow ARTICLE INFO beside a wide
  // ABSTRACT) while the body below uses the page gutter. Lines that "span" the page gutter but
  // share one left edge are a column of that band: find the band's own gutter.
  const spanning = lines.filter(line => line.column === -1 || !gutter);
  const edges = new Map<number, TextLine[]>(), bandEnds: number[] = [];
  for (const line of spanning) { const key = Math.round(line.x / 3); edges.set(key, [...(edges.get(key) ?? []), line]); }
  for (const cluster of edges.values()) {
    if (cluster.length < 4) continue;
    const top = Math.min(...cluster.map(line => line.y)), bottom = Math.max(...cluster.map(line => line.bottom));
    const inside = lines.filter(line => line.y >= top - 2 && line.bottom <= bottom + 2);
    const local = findGutter(inside, width);
    if (!local || gutter && Math.abs(local.center - gutter.center) < 20) continue;
    for (const line of inside) line.column = line.right <= local.center + 2 ? 0 : line.x >= local.center - 2 ? 1 : -1;
    bandEnds.push(bottom + 1);
    gutter ??= local;
  }
  const merged: TextLine[] = [];
  for (const line of [...lines].sort((a, b) => (a.y + a.bottom) / 2 - (b.y + b.bottom) / 2 || a.x - b.x)) {
    const center = (line.y + line.bottom) / 2;
    const host = merged.find(other => other.column === line.column && Math.abs((other.y + other.bottom) / 2 - center) < Math.min(other.size, line.size) * .35 && Math.abs(other.size - line.size) < Math.max(other.size, line.size) * .25);
    if (!host) { merged.push({ ...line }); continue; }
    const [first, second] = host.x <= line.x ? [host, line] : [line, host];
    const gap = second.x - first.right;
    host.tabular = host.tabular || line.tabular || gap > Math.max(host.size, line.size) * 1.2;
    host.mono = ((host.mono ?? 0) * host.text.length + (line.mono ?? 0) * line.text.length) / Math.max(1, host.text.length + line.text.length);
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
  // A front-matter band with its own split is read completely before the body below it.
  const stops = [...separators.map(line => ({ y: line.y, line })), ...bandEnds.map(y => ({ y, line: null as TextLine | null }))].sort((a, b) => a.y - b.y);
  for (const stop of stops) { band(stop.y); if (stop.line) result.push(stop.line); lower = stop.y; }
  band(Infinity);
  return result;
}
