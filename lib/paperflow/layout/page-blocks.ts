import type { PdfTextItem } from "../pdf/pdf-adapter";
import type { PdfParagraph } from "./types";
import { buildTextLines, findGutter, median, orderLines, type Gutter, type TextLine } from "./text-lines";

const SECTION_NAMES = /^(?:■\s*)?(?:abstract|introduction|background|literature review|methods?|methodology|materials and methods|experimental(?: section| setup| methods)?|results(?: and discussion)?|discussion|conclusions?|concluding remarks|summary|acknowledg(?:e)?ments?|references|nomenclature|appendix(?: [a-z0-9]+)?|supporting information|author information|notes|abbreviations)\.?$/i;
const NUMBERED_HEADING = /^(?:■\s*)?(?:\d+(?:\.\d+){0,4}\.?|[IVX]{1,5}\.|[A-H]\.)\s+[A-Z(]/;
const RUN_IN_HEADING = /^(\d+(?:\.\d+)+\.?\s+[A-Z][^.]{2,90}?[.:])\s+([A-Z(\[\d].*)$/;
export const CAPTION_START = /^(?:fig(?:ure)?\.?|table|scheme|chart|plate)\s*[A-Z]?\d+[a-z]?\s*[.:|]/i;
const SENTENCE_END = /[.!?](?:["”’)\]]|\[[\d,–−-]+\])?\s*$/;

const words = (text: string) => text.match(/[A-Za-z]{3,}/g) ?? [];
/** "■ APPENDIX 1: DEVOLATILIZATION AND CHAR", "5. CONCLUSIONS": capitalised section titles. */
export function capsHeading(text: string) {
  const value = text.replace(/^[■●▪\s]+/, "").trim(), letters = value.replace(/[^A-Za-z]/g, "");
  return letters.length >= 4 && value.length <= 110 && (letters.match(/[A-Z]/g) ?? []).length / letters.length > .85 && !/[.!?]\s*$/.test(value.replace(/^\d+(?:\.\d+)*\.\s*/, ""));
}

/** Display equations stay PDF artwork; prose lines that merely contain math do not. */
export function isEquationLine(text: string, widthRatio = 0): boolean {
  const value = text.trim();
  if (!value) return false;
  const prose = words(value).filter(word => !/^(?:exp|log|sin|cos|tan|max|min|lim|sup|inf|det|mod)$/i.test(word));
  // "Nu = 0.3 + Nu_lam + Nu_turb (10)": an equals sign plus an equation number is a display equation.
  if (value.includes("=") && /\(\s*\d+[a-z]?\s*\)\s*$/.test(value) && prose.length < 8) return true;
  if (widthRatio >= .82 && prose.length >= 4) return false;
  if (/[ÑÅ]{2,}/.test(value) && prose.length < 6) return true;
  if (/[⎫⎬⎭⎧⎨⎩]/.test(value)) return true;
  const symbols = (value.match(/[=+−×÷∑∫√∂∆≤≥≈∝→←^_|]/g) ?? []).length;
  if (/\(\s*\d+[a-z]?\s*\)\s*$/.test(value) && symbols >= 1 && prose.length < 6) return true;
  if (value.includes("=") && prose.length <= 3) return true;
  return symbols >= 3 && prose.length < 3;
}

/** Number of prose words, sentence ends and capitalised-word ratio. */
export function proseScore(text: string) {
  const tokens = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  const capitals = tokens.filter(token => /^[A-Z]/.test(token)).length;
  return { words: tokens.length, sentences: (text.match(/[a-z)\]]{1}[.!?](?:\s|$)/g) ?? []).length, capitalRatio: tokens.length ? capitals / tokens.length : 1 };
}

type Group = { lines: TextLine[]; kind: PdfParagraph["kind"]; hint?: PdfParagraph["hint"] };

function headingLine(line: TextLine, columnWidth: number, bodySize: number) {
  const text = line.text.trim();
  if (line.size < bodySize * .9 || text.length > 120) return false;
  if (SECTION_NAMES.test(text)) return true;
  if (capsHeading(text) && line.right - line.x < columnWidth * 1.03) return true;
  if (!NUMBERED_HEADING.test(text) || SENTENCE_END.test(text) && !/^\d+(?:\.\d+)*\.?\s+[A-Z][^.]{2,90}\.$/.test(text)) return false;
  return line.right - line.x < columnWidth * .92 && (text.match(/\s/g) ?? []).length <= 16;
}

/** Deterministic page analysis from PDF text objects: no DOM, zoom, or canvas state. */
export function analyzePage(items: PdfTextItem[], pageIndex: number, width: number, height: number): PdfParagraph[] {
  const raw = buildTextLines(items);
  if (!raw.length) return [];
  const gutter = findGutter(raw, width);
  const ordered = splitRunInHeadings(orderLines(raw, gutter));
  const bodySize = median(ordered.filter(line => line.text.length > 40).map(line => line.size)) || median(ordered.map(line => line.size)) || 9;
  const columnBounds = (column: number) => column === 0 && gutter ? { left: Math.min(...ordered.filter(line => line.column === 0).map(line => line.x)), right: gutter.left } : column === 1 && gutter ? { left: gutter.right, right: Math.max(...ordered.filter(line => line.column === 1).map(line => line.right)) } : { left: Math.min(...ordered.map(line => line.x)), right: Math.max(...ordered.map(line => line.right)) };
  const bounds = new Map([-1, 0, 1].map(column => [column, columnBounds(column)]));
  const leftEdge = new Map([-1, 0, 1].map(column => [column, modeEdge(ordered.filter(line => line.column === column && line.text.length > 30).map(line => line.x))]));
  const rightEdge = new Map([-1, 0, 1].map(column => [column, modeEdge(ordered.filter(line => line.column === column && line.text.length > 30).map(line => line.right))]));
  const pitches = ordered.slice(1).map((line, index) => ({ line, previous: ordered[index] })).filter(({ line, previous }) => line.column === previous.column && Math.abs(line.size - previous.size) < line.size * .1 && line.y > previous.y && line.y - previous.y < line.size * 2.2).map(({ line, previous }) => line.y - previous.y);
  const bodyPitch = median(pitches) || bodySize * 1.2;
  const groups: Group[] = [], noise: TextLine[] = [];
  for (const line of ordered) {
    const column = bounds.get(line.column)!, columnWidth = column.right - column.left;
    // Operators of inline math are often drawn on their own baseline ("+ + +").
    // They belong to the prose line they sit in and must not split the paragraph.
    if (!/[A-Za-z0-9]/.test(line.text) && line.right - line.x < columnWidth * .7) { noise.push(line); continue; }
    const equation = isEquationLine(line.text, (line.right - line.x) / Math.max(1, columnWidth));
    const heading = !equation && headingLine(line, columnWidth, bodySize);
    const group = groups.at(-1), previous = group?.lines.at(-1);
    // "Figure 5a shows…" can open a line in the middle of a paragraph; a caption starts after a
    // finished sentence or a gap, or is set smaller than the body.
    const caption = CAPTION_START.test(line.text) && (!previous || line.size < bodySize * .97 || SENTENCE_END.test(previous.text) || line.y - previous.bottom > previous.size * .8 || line.column !== previous.column);
    const left = leftEdge.get(line.column) ?? column.left, right = rightEdge.get(line.column) ?? column.right;
    // A long heading wraps onto a second line of the same size.
    const sameHeadingFace = previous && Math.abs(line.size - previous.size) < previous.size * .08 && line.y - previous.y < Math.max(bodyPitch, previous.size * 1.2) * 1.45;
    const headingWrap = group?.kind === "title" && previous && !equation && !caption && sameHeadingFace && (capsHeading(line.text) && capsHeading(previous.text) || !heading && !capsHeading(previous.text) && previous.right > right - previous.size * 4 && !SENTENCE_END.test(previous.text) && line.right - line.x < (right - left) * .9);
    // The second line of a wrapped heading ("■ APPENDIX 1: …" / "COMBUSTION") stays with its heading.
    let split = !group || !previous || equation || heading && !headingWrap || caption || group.kind === "title" && !headingWrap || group.hint === "equation";
    if (!split && previous && group && !headingWrap) {
      const pitch = line.y - previous.y;
      const indented = line.x > left + Math.max(line.size * .6, 3) && line.x < left + line.size * 4 && previous.x <= left + line.size * .6;
      const previousShort = previous.right < right - line.size * 1.6 && SENTENCE_END.test(previous.text);
      split = line.column !== previous.column || pitch < -line.size * .5 || pitch > Math.max(bodyPitch, previous.size * 1.15) * 1.45
        || Math.abs(line.size - previous.size) > Math.max(line.size, previous.size) * .14
        || indented || previousShort || line.tabular !== previous.tabular && line.text.length < 60;
    }
    if (split) groups.push({ lines: [line], kind: heading && !headingWrap ? "title" : caption ? "caption" : equation ? "skip" : "body", hint: equation ? "equation" : undefined });
    else group!.lines.push(line);
  }
  // A caption's second line can sit in another column band; keep it with its caption.
  for (let index = 0; index < groups.length; index++) {
    const current = groups[index];
    if (current.kind !== "body") continue;
    const first = current.lines[0];
    const host = groups.find(group => group.kind === "caption" && group !== current && (() => {
      const last = group.lines.at(-1)!;
      return Math.abs(first.size - last.size) < last.size * .06 && first.y > last.y && first.y - last.bottom < last.size * .9 && first.x < last.right && first.right > last.x;
    })());
    if (host) { host.lines.push(...current.lines); groups.splice(index--, 1); }
  }
  const paragraphs = groups.map((group, index) => toParagraph(group, index, pageIndex, width, height, bodySize, bounds, leftEdge, gutter));
  return [...paragraphs, ...noise.map((line, index) => ({ ...toParagraph({ lines: [line], kind: "skip", hint: "furniture" }, groups.length + index, pageIndex, width, height, bodySize, bounds, leftEdge, gutter), text: line.text }))];
}

function modeEdge(values: number[]) {
  if (!values.length) return undefined;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(Math.round(value / 2) * 2, (counts.get(Math.round(value / 2) * 2) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/** "2.2. Boiler Operating Conditions. For boundary…" → heading line + prose line. */
function splitRunInHeadings(lines: TextLine[]): TextLine[] {
  // "3.2. Computational Models. 3.2.1. General Models. The CFD…" carries two headings.
  let result = lines;
  for (let pass = 0; pass < 3; pass++) result = splitOnce(result);
  return result;
}

function splitOnce(lines: TextLine[]): TextLine[] {
  return lines.flatMap(line => {
    const match = line.text.match(RUN_IN_HEADING);
    if (!match || isEquationLine(match[1]) || words(match[1]).length < 2) return [line];
    const headingLength = match[1].length;
    let consumed = 0, splitX = line.x + (line.right - line.x) * Math.min(.7, headingLength / line.text.length);
    for (const item of line.items) {
      consumed += item.text.length;
      if (consumed >= headingLength - 1) {
        // The heading ends inside this item: interpolate within it.
        const start = consumed - item.text.length, inside = Math.max(0, Math.min(1, (headingLength - start) / Math.max(1, item.text.length)));
        splitX = item.x + (item.right - item.x) * inside;
        break;
      }
    }
    const rest = line.items.filter(item => item.x >= splitX - 1);
    return [{ ...line, text: match[1], right: splitX, items: [] }, { ...line, text: match[2], x: splitX + line.size * .25, items: rest.length ? rest : [{ text: match[2], x: splitX + line.size * .25, right: line.right }] }].map((part, index) => ({ ...part, runIn: index === 0 || (line as TextLine & { runIn?: boolean }).runIn } as TextLine));
  });
}

function toParagraph(group: Group, index: number, pageIndex: number, width: number, height: number, bodySize: number, bounds: Map<number, { left: number; right: number }>, leftEdge: Map<number, number | undefined>, gutter: Gutter | null): PdfParagraph {
  const lines = group.lines;
  const x = Math.min(...lines.map(line => line.x)), y = Math.min(...lines.map(line => line.y));
  const right = Math.max(...lines.map(line => line.right)), bottom = Math.max(...lines.map(line => line.bottom));
  const text = lines.map(line => line.text).join(" ").replace(/([a-z])[-‐]\s+(?=[a-z])/g, "$1").replace(/\s+/g, " ").trim();
  const size = median(lines.map(line => line.size)) || bodySize;
  const pitch = lines.length > 1 ? median(lines.slice(1).map((line, offset) => line.y - lines[offset].y).filter(value => value > 0)) || size * 1.2 : size * 1.2;
  const columnIndex = lines[0].column, column = bounds.get(columnIndex) ?? { left: x, right };
  const bodyLeft = lines.length > 1 ? Math.min(...lines.slice(1).map(line => line.x)) : leftEdge.get(columnIndex) ?? x;
  const indent = Math.max(0, lines[0].x - bodyLeft);
  const tabular = lines.filter(line => line.tabular).length >= Math.max(1, lines.length * .4);
  const runIn = (lines[0] as TextLine & { runIn?: boolean }).runIn;
  const hint = group.hint ?? (tabular ? "table" : runIn ? "run-in-heading" : group.kind === "title" && group.lines.length === 1 && lines[0].size > bodySize * 1.25 ? "title" : undefined);
  return {
    id: `native-${pageIndex}-${index}`, pageIndex, text, kind: group.kind,
    x: x / width, y: y / height, width: (right - x) / width, height: (bottom - y) / height,
    lines: lines.map(line => ({ x: line.x / width, y: line.y / height, width: (line.right - line.x) / width, height: (line.bottom - line.y) / height })),
    fontFamily: lines.filter(line => line.sans).length > lines.length / 2 ? "sans-serif" : "serif", fontWeight: group.kind === "title" ? 700 : 400, fontStyle: "normal",
    fontSize: size, pitch, indent: indent > size * .5 ? indent : 0,
    column: columnIndex === -1 && gutter ? { left: Math.min(x, column.left) / width, right: Math.max(right, column.right) / width } : { left: Math.min(column.left, x) / width, right: Math.max(column.right, right) / width },
    hint, lineTexts: lines.map(line => line.text)
  };
}
