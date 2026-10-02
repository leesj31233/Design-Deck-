import type { PdfTextItem } from "../pdf/pdf-adapter";
import { isEquationLine, paragraphKind, type PdfParagraph } from "./paragraphs";

type Line = { items: PdfTextItem[]; text: string; x: number; y: number; right: number; bottom: number; height: number; column: number };
const topLeft = (a: Line, b: Line) => a.y - b.y || a.x - b.x;

/** Deterministic page analysis from PDF text objects; no Reader DOM or zoom state. */
export function analyzeNativePage(items: PdfTextItem[], pageIndex: number, width: number, height: number): PdfParagraph[] {
  const lines = buildLines(items, width);
  const ordered = readingOrder(lines, width).flatMap(line => {
    const appendix = line.text.match(/^(■\s*APPENDIX\s+\d+:\s+[A-Z0-9\s-]{8,}?)(?:\s+)([A-Z][a-z].{12,})$/);
    if (appendix) {
      const split = line.x + (line.right - line.x) * Math.min(.8, appendix[1].length / line.text.length);
      return [{ ...line, text: appendix[1], right: split }, { ...line, text: appendix[2], x: split + 2 }];
    }
    const match = line.text.match(/^(\d+(?:\.\d+)+\.?\s+[A-Z][A-Za-z\s-]{2,65}?\.)(?:\s+)(.{12,})$/);
    if (!match) return [line];
    const split = line.x + (line.right - line.x) * Math.min(.68, match[1].length / line.text.length);
    return [{ ...line, text: match[1], right: split }, { ...line, text: match[2], x: split + 2 }];
  });
  const equationRows = ordered.filter(line => isEquationLine(line.text));
  const equationLike = (line: Line) => isEquationLine(line.text) || line.text.length < 55 && paragraphKind(line.text, line.y, line.height, height) === "body" && line.x > width * (line.column === 1 ? .53 : .09) && line.right - line.x < width * .25 && !/[.!?;:]\s*$/.test(line.text) && equationRows.some(row => row.column === line.column && Math.abs(row.y - line.y) < Math.max(row.height, line.height) * 2.5);
  const groups: Line[][] = [];
  for (const line of ordered) {
    const group = groups.at(-1), previous = group?.at(-1);
    const kind = equationLike(line) ? "skip" : paragraphKind(line.text, line.y, line.height, height);
    const priorKind = previous && paragraphKind(previous.text, previous.y, previous.height, height);
    const gap = previous ? line.y - previous.bottom : 0;
    const indent = previous && group && group.length > 1 && line.x - group[1].x > Math.max(7, previous.height * .75) && (/[.!?;:]\s*$/.test(previous.text) || previous.right - previous.x < (group[1].right - group[1].x) * .84);
    const structural = kind === "title" || kind === "caption" || priorKind === "title" || (priorKind === "caption" && /[.!?]\s*$/.test(previous!.text));
    if (!previous || line.column !== previous.column || gap > previous.height * .85 || gap < -previous.height || indent || structural || equationLike(line) || equationLike(previous)) groups.push([line]);
    else group!.push(line);
  }
  const sizes = lines.map(line => line.height).sort((a, b) => a - b), median = sizes[Math.floor(sizes.length / 2)] ?? 12;
  const referenceStart = ordered.find(line => /^(?:[^A-Za-z]*)references\b/i.test(line.text));
  return groups.filter(group => group.length).map((group, index) => {
    const x = Math.min(...group.map(line => line.x)), y = Math.min(...group.map(line => line.y));
    const right = Math.max(...group.map(line => line.right)), bottom = Math.max(...group.map(line => line.bottom));
    const text = group.map(line => line.text).join(" ").replace(/([a-z])[-‐]\s+(?=[a-z])/g, "$1").replace(/\s+/g, " ").trim();
    // PDF equation fonts sometimes leak repeated decorative glyphs into adjacent prose.
    const proseText = text.length > 150 ? text.replace(/[ÄÉÑÅ](?:\s*[ÄÉÑÅ])+/g, " ").replace(/\bas follows:\s*i\s*$/i, "as follows:").replace(/\s+/g, " ").trim() : text;
    const representative = group.flatMap(line => line.items).sort((a, b) => b.text.length - a.text.length)[0];
    const fontWeight = /bold|demi|semibold|heavy/i.test(representative.fontName) || group.length <= 3 && group[0].height > median * 1.25 ? 700 : 400;
    const rawKind = paragraphKind(text, y, bottom - y, height);
    const candidate = rawKind === "skip" && group.length >= 3 && text.length > 100 && !isEquationLine(text) ? "body" : rawKind;
    const afterReferences = referenceStart && y >= referenceStart.y && group[0].column === referenceStart.column;
    const coverTitle = pageIndex === 0 && candidate === "body" && fontWeight >= 700 && y < height * .3 && text.length > 25 && group.length <= 3;
    const kind = afterReferences || group.some(line => equationLike(line)) ? "skip" : coverTitle ? "title" : candidate === "body" && group[0].height < median * .72 ? "skip" : candidate;
    return { id: `native-${pageIndex}-${index}`, pageIndex, text: proseText, kind, x: x / width, y: y / height, width: (right - x) / width, height: (bottom - y) / height,
      lines: group.map(line => ({ x: line.x / width, y: line.y / height, width: (line.right - line.x) / width, height: (line.bottom - line.y) / height })),
      fontFamily: representative.fontFamily, fontWeight: kind === "title" ? 700 : fontWeight, fontStyle: "normal" } satisfies PdfParagraph;
  }).filter(block => block.kind === "title" || block.text.length >= 12);
}

function buildLines(items: PdfTextItem[], pageWidth: number): Line[] {
  const source = [...items].filter(item => item.text.trim() && item.width > 0).sort((a, b) => a.y - b.y || a.x - b.x);
  const buckets: PdfTextItem[][] = [];
  const region = (item: PdfTextItem) => item.x < pageWidth / 2 - 4 && item.x + item.width > pageWidth / 2 + 4 ? -1 : item.x + item.width / 2 < pageWidth / 2 ? 0 : 1;
  for (const item of source) {
    const center = item.y + item.height / 2;
    const bucket = buckets.findLast(group => {
      const first = group[0];
      if (Math.abs(center - (first.y + first.height / 2)) > Math.max(item.height, first.height) * .8) return false;
      const right = Math.max(...group.map(value => value.x + value.width));
      const left = Math.min(...group.map(value => value.x));
      const gap = item.x > right ? item.x - right : left > item.x + item.width ? left - item.x - item.width : 0;
      if (region(first) !== region(item) && region(first) !== -1 && region(item) !== -1 && gap > Math.max(item.height, first.height) * .9) return false;
      return gap < Math.max(item.height * 2.2, 5);
    });
    if (bucket) bucket.push(item); else buckets.push([item]);
  }
  return buckets.map(group => {
    group.sort((a, b) => a.x - b.x);
    let text = "", previous: PdfTextItem | undefined;
    for (const item of group) {
      const gap = previous ? item.x - previous.x - previous.width : 0;
      if (previous && gap > Math.max(1, item.height * .14)) text += " ";
      text += item.text; previous = item;
    }
    const x = Math.min(...group.map(item => item.x)), right = Math.max(...group.map(item => item.x + item.width));
    const y = Math.min(...group.map(item => item.y)), bottom = Math.max(...group.map(item => item.y + item.height));
    return { items: group, text: text.trim(), x, y, right, bottom, height: bottom - y, column: 0 };
  });
}

function readingOrder(lines: Line[], width: number): Line[] {
  if (lines.length < 6) return lines.sort(topLeft);
  const center = width / 2, gutter = width * .035;
  const span = (line: Line) => line.right - line.x > width * .62 || line.x < center - gutter && line.right > center + gutter && line.right - line.x > width * .4;
  const left = lines.filter(line => !span(line) && line.right <= center + gutter);
  const right = lines.filter(line => !span(line) && line.x >= center - gutter);
  if (left.length < 3 || right.length < 3) return lines.sort(topLeft);
  for (const line of left) line.column = 0;
  for (const line of right) line.column = 1;
  for (const line of lines.filter(span)) line.column = -1;
  const separators = lines.filter(span).sort(topLeft), remaining = lines.filter(line => !span(line));
  const result: Line[] = []; let lower = -Infinity;
  const addBand = (upper: number) => {
    const band = remaining.filter(line => line.y >= lower && line.y < upper);
    result.push(...band.filter(line => line.column === 0).sort(topLeft), ...band.filter(line => line.column === 1).sort(topLeft), ...band.filter(line => line.column !== 0 && line.column !== 1).sort(topLeft));
  };
  for (const separator of separators) { addBand(separator.y); result.push(separator); lower = separator.y; }
  addBand(Infinity);
  // A wide heading can geometrically overlap a body line. Never lose a text item.
  return [...new Set([...result, ...lines.filter(line => !result.includes(line)).sort(topLeft)])];
}
