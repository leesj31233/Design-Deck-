import type { PdfTextItem } from "../pdf/pdf-adapter";
import type { PdfParagraph } from "./types";
import { buildTextLines, dropGutterNumbers, dropLineNumbers, findGutter, median, orderLines, type Gutter, type TextLine } from "./text-lines";

const SECTION_NAMES = /^(?:■\s*)?(?:abstract|introduction|background|literature review|methods?|methodology|materials and methods|experimental(?: section| setup| methods)?|results(?: and discussion)?|discussion|conclusions?|concluding remarks|summary|acknowledg(?:e)?ments?|references|nomenclature|appendix(?: [a-z0-9]+)?|supporting information|author information|notes|abbreviations)\.?$/i;
const NUMBERED_HEADING = /^(?:■\s*)?(?:\d+(?:\.\d+){0,4}\.?|[IVX]{1,5}\.|[A-H]\.)\s+[A-Z(]/;
const RUN_IN_HEADING = /^(\d+(?:\.\d+)+\.?\s+[A-Z][^.]{2,90}?[.:])\s+([A-Z(\[\d].*)$/;
export const CAPTION_START = /^(?:fig(?:ure)?\.?|table|scheme|chart|plate|gambar|tabel|grafik|abb(?:ildung)?\.?|tab(?:elle)?\.?|figura|tabla|그림|표|図|表)\s*[A-Z]?\d+(?:\.\d+)?[a-z]?\s*[.:|]/i;
/** Elsevier sets the label alone on its own line: "Table 2" / "Investigated global reaction mechanisms." */
const CAPTION_LABEL = /^(?:fig(?:ure)?\.?|table|scheme|chart|plate|gambar|tabel|grafik|abb(?:ildung)?\.?|tab(?:elle)?\.?|figura|tabla|그림|표|図|表)\s*[A-Z]?\d+(?:\.\d+)?[a-z]?\s*$/i;
const TRAILING_FUNCTION_WORD = /\b(?:the|a|an|of|and|or|in|on|to|for|with|by|from|at|as|is|are|was|were|that|which|this|these)$/i;
const SENTENCE_END = /[.!?](?:["”’)\]]|\[[\d,–−-]+\])?\s*$/;

const words = (text: string) => text.match(/[A-Za-z]{3,}|[\uac00-\ud7a3]{2,}|[\u3040-\u30ff\u4e00-\u9fff]{2,}/g) ?? [];
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

/**
 * Number of prose words, sentence ends and capitalised-word ratio. Korean words are counted by
 * their spaces; Japanese and Chinese set none, so about two characters make a word there.
 */
export function proseScore(text: string) {
  const tokens = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  const capitals = tokens.filter(token => /^[A-Z]/.test(token)).length;
  const hangul = (text.match(/[\uac00-\ud7a3]+/g) ?? []).length, han = Math.round((text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) ?? []).length / 2);
  const words = tokens.length + hangul + han;
  const sentences = (text.match(/[a-z)\]]{1}[.!?](?:\s|$)/g) ?? []).length + (text.match(/[\uac00-\ud7a3\u3040-\u30ff\u4e00-\u9fff][.!?](?:\s|$)|[。！？]/g) ?? []).length;
  return { words, sentences, capitalRatio: words ? capitals / words : 1 };
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
/**
 * A drop cap ("W" two lines tall, then "ITH a recent …") is the first letter of the first word: it
 * joins that word, and its box is hidden with the paragraph so the Korean text can use its place.
 */
function mergeDropCaps(items: PdfTextItem[]) {
  const sizes = items.filter(item => item.text.trim().length > 3).map(item => item.height).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] ?? 10, caps: { x: number; y: number; width: number; height: number }[] = [], joined = new Map<PdfTextItem, PdfTextItem>();
  const kept = items.filter(cap => {
    if (!/^[A-Z]$/.test(cap.text.trim()) || cap.height < body * 1.8) return true;
    const partner = items.filter(other => other !== cap && !joined.has(other) && other.height < cap.height * .7 && other.x >= cap.x + cap.width - 3 && other.x <= cap.x + cap.width + body * 2.5 && Math.abs(other.y - cap.y) < body * .9)
      .sort((a, b) => a.x - b.x)[0];
    if (!partner) return true;
    caps.push({ x: cap.x, y: cap.y, width: cap.width, height: cap.height });
    joined.set(partner, { ...partner, text: cap.text.trim() + partner.text.trimStart(), x: cap.x, width: partner.width + partner.x - cap.x });
    return false;
  });
  return { items: kept.map(item => joined.get(item) ?? item), caps };
}

export function analyzePage(items: PdfTextItem[], pageIndex: number, width: number, height: number): PdfParagraph[] {
  const { items: textItems, caps } = mergeDropCaps(items);
  const raw = dropLineNumbers(buildTextLines(dropGutterNumbers(textItems, width)), width);
  if (!raw.length) return [];
  // A page whose table is set smaller than the body can have more table lines than prose lines,
  // and a table column may start inside the body gutter: look for the gutter among body lines.
  const gutter = findGutter(raw, width) ?? findGutter(dominantSizeLines(raw), width);
  const ordered = splitRunInHeadings(orderLines(raw, gutter, width));
  const bodySize = median(ordered.filter(line => line.text.length > 40).map(line => line.size)) || median(ordered.map(line => line.size)) || 9;
  const columnBounds = (column: number) => column === 0 && gutter ? { left: Math.min(...ordered.filter(line => line.column === 0).map(line => line.x)), right: gutter.left } : column === 1 && gutter ? { left: gutter.right, right: Math.max(...ordered.filter(line => line.column === 1).map(line => line.right)) } : { left: Math.min(...ordered.map(line => line.x)), right: Math.max(...ordered.map(line => line.right)) };
  const bounds = new Map([-1, 0, 1].map(column => [column, columnBounds(column)]));
  const leftEdge = new Map([-1, 0, 1].map(column => [column, modeEdge(ordered.filter(line => line.column === column && line.text.length > 30).map(line => line.x))]));
  const rightEdge = new Map([-1, 0, 1].map(column => [column, modeEdge(ordered.filter(line => line.column === column && line.text.length > 30).map(line => line.right))]));
  const pitches = ordered.slice(1).map((line, index) => ({ line, previous: ordered[index] })).filter(({ line, previous }) => line.column === previous.column && Math.abs(line.size - previous.size) < line.size * .1 && line.y > previous.y && line.y - previous.y < line.size * 3).map(({ line, previous }) => line.y - previous.y);
  const bodyPitch = median(pitches) || bodySize * 1.2;
  const groups: Group[] = [], noise: TextLine[] = [];
  for (const [lineIndex, line] of ordered.entries()) {
    const column = bounds.get(line.column)!, columnWidth = column.right - column.left;
    // Operators of inline math are often drawn on their own baseline ("+ + +").
    // They belong to the prose line they sit in and must not split the paragraph.
    if (!/[\p{L}\p{N}]/u.test(line.text) && line.right - line.x < columnWidth * .7) { noise.push(line); continue; }
    const equation = isEquationLine(line.text, (line.right - line.x) / Math.max(1, columnWidth));
    // "3.2. Mathematical model. Gas phase kinetics": an unnumbered title closing a run-in line is a heading too.
    // "In the CFD model, the" is the paragraph's first words, not a title: titles carry no comma and
    // do not stop on a function word.
    const runInTitle = (line as TextLine & { runInTail?: boolean }).runInTail && line.text.length < 70 && !SENTENCE_END.test(line.text) && words(line.text).length >= 2 && /^[A-Z]/.test(line.text) && !/,/.test(line.text) && !TRAILING_FUNCTION_WORD.test(line.text.trim()) && !continuesSentence(line, ordered[lineIndex + 1]);
    const heading = !equation && (headingLine(line, columnWidth, bodySize) || Boolean(runInTitle) || Boolean((line as TextLine & { forceHeading?: boolean }).forceHeading));
    const group = groups.at(-1), previous = group?.lines.at(-1);
    // "Figure 5a shows…" can open a line in the middle of a paragraph; a caption starts after a
    // finished sentence or a gap, or is set smaller than the body.
    const caption = (CAPTION_START.test(line.text) || CAPTION_LABEL.test(line.text.trim())) && (!previous || line.size < bodySize * .97 || SENTENCE_END.test(previous.text) || line.y - previous.bottom > previous.size * .8 || line.column !== previous.column);
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
        || indented || previousShort || line.tabular !== previous.tabular && line.text.length < 60
        // Code listing against prose: a fixed-width block never runs on into a sentence.
        || Math.max(line.mono ?? 0, previous.mono ?? 0) >= .8 && Math.min(line.mono ?? 0, previous.mono ?? 0) <= .2;
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
  for (const cap of caps) {
    const box = { x: cap.x / width, y: cap.y / height, width: cap.width / width, height: cap.height / height };
    const host = paragraphs.find(paragraph => paragraph.lines.some(line => Math.abs(line.x - box.x) < .004 && line.y < box.y + box.height && line.y + line.height > box.y));
    if (!host) continue;
    host.extraMasks = [...host.extraMasks ?? [], box];
    // Lines set beside the cap may start where the cap was once it is hidden.
    host.lines = host.lines.map(line => line.y < box.y + box.height && line.y + line.height > box.y && line.x > box.x ? { ...line, width: line.width + line.x - box.x, x: box.x } : line);
    host.x = Math.min(host.x, box.x);
  }
  return [...paragraphs, ...noise.map((line, index) => ({ ...toParagraph({ lines: [line], kind: "skip", hint: "furniture" }, groups.length + index, pageIndex, width, height, bodySize, bounds, leftEdge, gutter), text: line.text }))];
}

/** Lines set in the size that carries most of the page's text. */
function dominantSizeLines(lines: TextLine[]) {
  const mass = new Map<number, number>();
  for (const line of lines) { const key = Math.round(line.size * 2) / 2; mass.set(key, (mass.get(key) ?? 0) + line.text.length); }
  const dominant = [...mass].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  return lines.filter(line => Math.abs(line.size - dominant) < dominant * .1);
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
  let result = joinWrappedRunIn(lines);
  for (let pass = 0; pass < 3; pass++) result = splitOnce(result);
  return result;
}

/** The next line of the column carries on in lower case: "…for the boiler" / "water wall was…". */
function continuesSentence(line: TextLine, next: TextLine | undefined) {
  return Boolean(next && next.column === line.column && next.y > line.y && next.y - line.y < line.size * 1.8 && /^[a-z]/.test(next.text));
}

/** Most long words capitalised: "Heat Transfer of the Furnace Water Wall". */
function titleCase(text: string) {
  const long = text.match(/[A-Za-z][A-Za-z-]{3,}/g) ?? [];
  return long.length > 0 && long.filter(word => /^[A-Z]/.test(word)).length / long.length >= .6;
}

/**
 * A run-in heading too long for one line: "3.2.3. Heat Transfer of the Furnace Water Wall and Tube" /
 * "Bundles in the Convective Pass. The heat transfer…". The first line becomes a heading line and
 * the second line splits after the title.
 */
function joinWrappedRunIn(lines: TextLine[]): TextLine[] {
  const out: TextLine[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], next = lines[index + 1];
    const opening = /^\d+(?:\.\d+)+\.?\s+[A-Z][^.:]*$/.test(line.text) && titleCase(line.text) && !RUN_IN_HEADING.test(line.text);
    const close = next && next.column === line.column && next.y > line.y && next.y - line.y < line.size * 1.8 && Math.abs(next.size - line.size) < line.size * .08 ? next.text.match(/^([^.:]{2,70}?[.:])\s+([A-Z(\[\d].*)$/) : null;
    if (!opening || !close || !titleCase(close[1]) || line.text.length + close[1].length > 170) { out.push(line); continue; }
    out.push({ ...line, runIn: true, forceHeading: true } as TextLine, ...splitAt(next, close[1], close[2]));
    index++;
  }
  return out;
}

/** Split a line after `head` (heading part) and keep `tail` as the paragraph that runs in. */
function splitAt(line: TextLine, head: string, tail: string): TextLine[] {
  const headingLength = head.length;
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
  return [{ ...line, text: head, right: splitX, items: [] }, { ...line, text: tail, x: splitX + line.size * .25, items: rest.length ? rest : [{ text: tail, x: splitX + line.size * .25, right: line.right }] }].map((part, index) => ({ ...part, runIn: index === 0 || (line as TextLine & { runIn?: boolean }).runIn, runInTail: index === 1 } as TextLine));
}

function splitOnce(lines: TextLine[]): TextLine[] {
  return lines.flatMap(line => {
    const match = line.text.match(RUN_IN_HEADING);
    if (!match || isEquationLine(match[1]) || words(match[1]).length < 2) return [line];
    return splitAt(line, match[1], match[2]);
  });
}

function toParagraph(group: Group, index: number, pageIndex: number, width: number, height: number, bodySize: number, bounds: Map<number, { left: number; right: number }>, leftEdge: Map<number, number | undefined>, gutter: Gutter | null): PdfParagraph {
  const lines = group.lines;
  const x = Math.min(...lines.map(line => line.x)), y = Math.min(...lines.map(line => line.y));
  const right = Math.max(...lines.map(line => line.right)), bottom = Math.max(...lines.map(line => line.bottom));
  const text = lines.map(line => line.text).join(" ").replace(/([a-z])[-‐]\s+(?=[a-z])/g, "$1").replace(/\s+/g, " ").replace(/(?<=[\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef]) (?=[\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef])/g, "").trim();
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
    hint, lineTexts: lines.map(line => line.text),
    mono: lines.reduce((sum, line) => sum + (line.mono ?? 0) * line.text.length, 0) / Math.max(1, lines.reduce((sum, line) => sum + line.text.length, 0)),
    marks: lines.flatMap(line => line.marks ?? []), raised: lines.reduce((sum, line) => sum + (line.raised ?? 0), 0)
  };
}
