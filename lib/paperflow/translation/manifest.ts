import type { PdfDocumentHandle, PdfPageHandle, PdfTextItem } from "../pdf/pdf-adapter";
import { letterCount, textHealth } from "../pdf/ocr";
import { openDatabase, requestResult, transactionDone } from "../persistence/indexeddb";
import { analyzePage, proseScore } from "../layout/page-blocks";
import { buildTextLines, type TextLine } from "../layout/text-lines";
import { classifyBlock, extractKeywords, looksLikeReference, nextSection, pageContext, readsAsProse, type BlockRole, type Section } from "../layout/classify";
import { centerInside, figureRegions, tableRegions, type Region } from "../layout/graphics";
import type { Box } from "../pdf/pdf-adapter";
import type { PageSize, PdfParagraph } from "../layout/types";
import { buildScriptTable, type ScriptTable } from "../typeset/scripts";

export type { BlockRole } from "../layout/classify";
export const EXTRACTOR_VERSION = "layout-v3.34";

export interface ManifestBlock extends PdfParagraph { role: BlockRole; readingOrder: number; columnIndex: number; translatable: boolean; exclusionReason: string | null; unitId?: string }
/** A logical paragraph. Column and page breaks split blocks, never the sentence sent to the translator. */
/** `manual`: headings and table cells are translated only when the reader asks (hover → 번역), never in the whole-paper run. */
export interface TranslationUnit { id: string; role: BlockRole; blockIds: string[]; pages: number[]; text: string; pageChars: Record<number, number>; manual?: boolean }
export interface TranslationManifest {
  documentId: string; version: string; createdAt: string; pageCount: number;
  pages: PageSize[]; blocks: ManifestBlock[]; units: TranslationUnit[]; keywords: string[];
  extractedPages: number; ocrPages: number; ocrCandidates?: number[];
  /** How the paper prints sub/superscripts and citations, for the translated text. */
  scripts?: ScriptTable;
  /** Where the extraction time went (ms), to keep long papers fast. */
  timing?: { text: number; images: number; ocr: number; layout: number; total: number };
}

/** Reads a page from its pixels (scanned pages, unusable embedded fonts). */
export type OcrProvider = (page: PdfPageHandle, signal?: AbortSignal) => Promise<PdfTextItem[]>;

async function sha(value: string) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...hash].map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function stableBlockId(documentId: string, pageIndex: number, role: BlockRole, source: string, bbox: Pick<PdfParagraph, "x" | "y" | "width" | "height">) {
  const normalized = source.normalize("NFKC").replace(/\s+/g, " ").trim();
  const geometry = [bbox.x, bbox.y, bbox.width, bbox.height].map(value => Math.round(value * 1000)).join(":");
  return sha(`${documentId}|${pageIndex}|${role}|${normalized}|${geometry}`);
}

const TRANSLATABLE: ReadonlySet<BlockRole> = new Set(["ABSTRACT", "HEADING", "BODY", "CAPTION", "TABLE"]);
/** Mostly Hangul among the letters (English terms inside Korean prose do not count against it). */
export function isKorean(text: string) {
  const hangul = (text.match(/[가-힣]/g) ?? []).length, others = (text.match(/[A-Za-z぀-ヿ一-鿿]/g) ?? []).length;
  return hangul >= 4 && hangul >= others * .3;
}

export async function buildPageBlocks(documentId: string, pageIndex: number, raw: PdfTextItem[], width: number, height: number, initialSection: Section = "none", rules: Box[] = [], found: { tables: Region[] } = { tables: [] }): Promise<ManifestBlock[]> {
  const analyzed = analyzePage(raw, pageIndex, width, height);
  const context = pageContext(analyzed, pageIndex);
  // Ruled tables first: a rule always ends a paragraph, so a caption or a sentence never runs on into the cells.
  const proseBand = (band: Region) => analyzed.some(paragraph => centerInside(paragraph, band, 0) && (paragraph.fontSize ?? context.bodySize) >= context.bodySize * .95 && readsAsProse(paragraph.text));
  found.tables = tableRegions(rules, width, height, proseBand);
  const paragraphs = splitAtTables(analyzed, found.tables);
  const classified: { role: BlockRole; reason: string | null; columnIndex: number }[] = [];
  let section = initialSection, tableUntil = -1, tableColumn = -2;
  for (const [index, paragraph] of paragraphs.entries()) {
    let { role, reason } = classifyBlock(paragraph, index, context, section);
    const columnIndex = paragraph.x + paragraph.width / 2 < .5 ? 0 : 1;
    // Rows after a table caption stay data until real prose resumes.
    if (role === "CAPTION" && /^(?:table|tabel|tabla|tab(?:elle)?\.?|표|表)/i.test(paragraph.text)) { tableUntil = paragraph.y + .45; tableColumn = paragraph.width > .6 || Math.abs(paragraph.x + paragraph.width / 2 - .5) < .08 ? -1 : columnIndex; }
    else if (role === "BODY" && paragraph.y < tableUntil && (tableColumn === -1 || tableColumn === columnIndex) && !/[a-z]{3,}[.!?]\s|[\uac00-\ud7a3\u3040-\u30ff\u4e00-\u9fff][.!?。！？]/.test(paragraph.text + " ")) { role = "TABLE"; reason = "table-data"; }
    else if (role === "BODY") tableUntil = -1;
    section = nextSection(role, reason, paragraph.text, section);
    classified.push({ role, reason, columnIndex });
  }
  keepTablesTogether(paragraphs, classified, context.bodySize);
  // A ruled drawing with a figure caption and no table caption is a figure (a flow chart, a framed plot): its labels stay as printed.
  const captionNear = (table: Region, pattern: RegExp) => paragraphs.some((paragraph, index) => classified[index].role === "CAPTION" && pattern.test(paragraph.text.trim()) && paragraph.x < table.x + table.width && paragraph.x + paragraph.width > table.x && (Math.abs(paragraph.y + paragraph.height - table.y) < .06 || Math.abs(paragraph.y - (table.y + table.height)) < .06 || centerInside(paragraph, table)));
  const TABLE_CAPTION = /^(?:table|tabel|tabla|tab(?:elle)?\.?|표|表)\s*[\dA-Z]/i, FIGURE_CAPTION = /^(?:fig(?:ure)?\.?|gambar|abb(?:ildung)?\.?|figura|그림|図|scheme|chart)\s*[\dA-Z]/i;
  found.tables = found.tables.filter(table => {
    if (captionNear(table, TABLE_CAPTION)) return true;
    // A frame around one paragraph (an author box, a highlighted note) is a panel, not a table.
    if (buildTableCells(raw, table, rules, width, height, pageIndex, []).length <= 1) return false;
    if (!captionNear(table, FIGURE_CAPTION)) return true;
    paragraphs.forEach((paragraph, index) => { if (classified[index].role !== "CAPTION" && centerInside(paragraph, table)) classified[index] = { ...classified[index], role: "FIGURE_TEXT", reason: "figure-label" }; });
    return false;
  });
  keepRuledTables(paragraphs, classified, context.bodySize, found.tables);
  // A ruled table becomes cells: each can be translated on request inside its own box.
  for (const table of found.tables) {
    const inside = paragraphs.map((_, index) => index).filter(index => classified[index].role === "TABLE" && centerInside(paragraphs[index], table));
    if (!inside.length) continue;
    const cells = buildTableCells(raw, table, rules, width, height, pageIndex, paragraphs.filter((_, index) => classified[index].role === "CAPTION"));
    if (!cells.length) continue;
    const at = inside[0];
    for (const index of [...inside].reverse()) { paragraphs.splice(index, 1); classified.splice(index, 1); }
    paragraphs.splice(at, 0, ...cells);
    classified.splice(at, 0, ...cells.map(cell => ({ role: "TABLE" as BlockRole, reason: /[A-Za-z\u3040-\u30ff\u4e00-\u9fff]{3,}/.test(cell.text) ? null : "table-data", columnIndex: cell.x + cell.width / 2 < .5 ? 0 : 1 })));
  }
  adoptEquationPieces(paragraphs, classified, height);
  adoptOrphanLines(paragraphs, classified, height, found.tables);
  continueCaptions(paragraphs, classified);
  const blocks: ManifestBlock[] = [];
  for (const [index, paragraph] of paragraphs.entries()) {
    const { role, columnIndex } = classified[index];
    let { reason } = classified[index];
    // Text already in Korean is shown as printed: never spend a credit translating Korean into Korean.
    if (reason === null && isKorean(paragraph.text)) reason = "korean-source";
    const translatable = TRANSLATABLE.has(role) && reason === null;
    const id = await stableBlockId(documentId, pageIndex, role, paragraph.text, paragraph);
    blocks.push({ ...paragraph, id, role, readingOrder: blocks.length, columnIndex, translatable, exclusionReason: translatable ? null : reason ?? "not-translated" });
  }
  return blocks;
}

/**
 * Text inside a table the page draws with rules stays as printed, every cell alike (no table half in
 * Korean, half in English). A ruled box whose text is body-size prose is a framed text box instead.
 */
function keepRuledTables(paragraphs: PdfParagraph[], classified: { role: BlockRole; reason: string | null }[], bodySize: number, tables: Region[]) {
  for (const table of tables) {
    const inside = paragraphs.map((paragraph, index) => ({ paragraph, index })).filter(({ paragraph }) => centerInside(paragraph, table));
    const chars = inside.reduce((sum, { paragraph }) => sum + paragraph.text.length, 0);
    // A framed text box holds paragraphs (two or more sentences over several lines); a column of row labels does not.
    const prose = inside.filter(({ paragraph }) => (paragraph.fontSize ?? bodySize) >= bodySize * .95 && paragraph.lines.length >= 2 && readsAsProse(paragraph.text) && (paragraph.text.match(/[a-z)\]][.!?](?:\s|$)/g) ?? []).length >= 2).reduce((sum, { paragraph }) => sum + paragraph.text.length, 0);
    // A "Table n" caption right above or below makes it a table even when its cells are sentences.
    const captioned = paragraphs.some((paragraph, index) => classified[index].role === "CAPTION" && /^(?:table|tabel|tabla|tab(?:elle)?\.?|표|表)\s*[\dA-Z]/i.test(paragraph.text.trim())
      && paragraph.x < table.x + table.width && paragraph.x + paragraph.width > table.x
      && (Math.abs(paragraph.y + paragraph.height - table.y) < .06 || Math.abs(paragraph.y - (table.y + table.height)) < .06));
    if (!inside.length || prose > chars * .6 && !captioned) continue;
    for (const { index } of inside) if (classified[index].role !== "CAPTION") classified[index] = { ...classified[index], role: "TABLE", reason: "table-data" };
  }
}

/** Split a paragraph whose lines run across a ruled table's edge: the lines inside are cells. */
function splitAtTables(paragraphs: PdfParagraph[], tables: Region[]): PdfParagraph[] {
  if (!tables.length) return paragraphs;
  return paragraphs.flatMap(paragraph => {
    const texts = paragraph.lineTexts;
    if (!texts || texts.length !== paragraph.lines.length || paragraph.lines.length < 2) return [paragraph];
    const inside = paragraph.lines.map(line => tables.some(table => centerInside(line, table, 0)));
    if (inside.every(Boolean) || !inside.some(Boolean)) return [paragraph];
    const part = (keep: boolean, suffix: string): PdfParagraph | null => {
      const indexes = inside.map((value, index) => value === keep ? index : -1).filter(index => index >= 0);
      if (!indexes.length) return null;
      const lines = indexes.map(index => paragraph.lines[index]), lineTexts = indexes.map(index => texts[index]);
      const x = Math.min(...lines.map(line => line.x)), y = Math.min(...lines.map(line => line.y));
      return { ...paragraph, id: paragraph.id + suffix, lines, lineTexts, text: lineTexts.join(" ").replace(/\s+/g, " ").trim(), x, y, width: Math.max(...lines.map(line => line.x + line.width)) - x, height: Math.max(...lines.map(line => line.y + line.height)) - y, indent: keep ? 0 : paragraph.indent, kind: keep ? "body" : paragraph.kind };
    };
    return [part(false, ""), part(true, "-cells")].filter((value): value is PdfParagraph => value !== null).sort((a, b) => a.y - b.y);
  });
}

/**
 * A display equation's fraction parts ("dCg" over "dx", "2γ cos θ" over "Pmax =") are separate text
 * lines: short math fragments right above or below an equation, overlapping it, belong to it.
 */
function adoptEquationPieces(paragraphs: PdfParagraph[], classified: { role: BlockRole; reason: string | null }[], height: number) {
  const equations = paragraphs.filter((_, index) => classified[index].role === "EQUATION");
  if (!equations.length) return;
  paragraphs.forEach((paragraph, index) => {
    const { role } = classified[index], text = paragraph.text.trim();
    if (!["BODY", "FIGURE_TEXT"].includes(role) || paragraph.lines.length > 2 || text.length > 16 || /[a-z]{4,}/.test(text)) return;
    const near = equations.some(equation => {
      const size = equation.fontSize ?? 9, overlapX = Math.min(paragraph.x + paragraph.width, equation.x + equation.width) - Math.max(paragraph.x, equation.x);
      const gap = (paragraph.y > equation.y ? paragraph.y - (equation.y + equation.height) : equation.y - (paragraph.y + paragraph.height)) * height;
      return overlapX > 0 && gap < size * 1.3;
    });
    if (near) classified[index] = { ...classified[index], role: "EQUATION", reason: "equation" };
  });
}

/** A figure caption set across both columns: the right-hand half starts at the caption's height in its type size. */
function continueCaptions(paragraphs: PdfParagraph[], classified: { role: BlockRole; reason: string | null }[]) {
  paragraphs.forEach((caption, index) => {
    if (classified[index].role !== "CAPTION") return;
    paragraphs.forEach((other, otherIndex) => {
      if (otherIndex === index || classified[otherIndex].role === "CAPTION" || other.text.length < 40) return;
      const sameStart = Math.abs(other.y - caption.y) < .008, sameSize = Math.abs((other.fontSize ?? 0) - (caption.fontSize ?? 0)) < (caption.fontSize ?? 1) * .06;
      const besides = other.x > caption.x + caption.width - .02 || other.x + other.width < caption.x + .02;
      if (sameStart && sameSize && besides) classified[otherIndex] = { ...classified[otherIndex], role: "CAPTION", reason: null };
    });
  });
}

/**
 * Cells of a ruled table: its text lines (split at column gaps) stacked into cells while they stay in
 * one column, the same type size, close together, and no rule runs between or through them.
 */
function buildTableCells(raw: PdfTextItem[], table: Region, rules: Box[], width: number, height: number, pageIndex: number, captions: PdfParagraph[]): PdfParagraph[] {
  const x0 = table.x * width, y0 = table.y * height, x1 = (table.x + table.width) * width, y1 = (table.y + table.height) * height;
  const inCaption = (x: number, y: number) => captions.some(caption => x > caption.x * width && x < (caption.x + caption.width) * width && y > caption.y * height && y < (caption.y + caption.height) * height);
  const items = raw.filter(item => { const cx = item.x + item.width / 2, cy = item.y + item.height / 2; return cx > x0 - 2 && cx < x1 + 2 && cy > y0 - 2 && cy < y1 + 2 && !inCaption(cx, cy); });
  // A text line that runs across a column border is two cells: split it at the vertical rule.
  const down0 = rules.filter(rule => rule.width <= 1.5);
  const lines = buildTextLines(items).flatMap(line => {
    const cuts = down0.filter(rule => rule.x > line.x + 2 && rule.x < line.right - 2 && rule.y < line.bottom && rule.y + rule.height > line.y).map(rule => rule.x).sort((a, b) => a - b);
    if (!cuts.length) return [line];
    const parts: TextLine[] = [];
    for (const [index, edge] of [...cuts, Infinity].entries()) {
      const from = index ? cuts[index - 1] : -Infinity, pieces = line.items.filter(item => (item.x + item.right) / 2 > from && (item.x + item.right) / 2 < edge);
      if (pieces.length) parts.push({ ...line, text: pieces.map(item => item.text).join(" ").replace(/\s+/g, " ").trim(), x: Math.min(...pieces.map(item => item.x)), right: Math.max(...pieces.map(item => item.right)), items: pieces });
    }
    return parts.filter(part => part.text);
  }).sort((a, b) => a.y - b.y || a.x - b.x);
  const across = rules.filter(rule => rule.height <= 1.5), down = rules.filter(rule => rule.width <= 1.5);
  type Cell = { lines: TextLine[]; x: number; right: number; y: number; bottom: number; size: number };
  const cells: Cell[] = [];
  for (const line of lines) {
    const host = cells.find(cell => {
      if (Math.abs(cell.size - line.size) > cell.size * .15 || line.y < cell.bottom - cell.size * .4 || line.y - cell.bottom > cell.size * .8) return false;
      const shared = Math.min(cell.right, line.right) - Math.max(cell.x, line.x);
      if (shared < Math.min(cell.right - cell.x, line.right - line.x) * .3) return false;
      if (across.some(rule => rule.y > cell.bottom - 1 && rule.y < line.y + 1 && rule.x < Math.min(cell.right, line.right) && rule.x + rule.width > Math.max(cell.x, line.x))) return false;
      return !down.some(rule => rule.x > Math.min(cell.x, line.x) + 2 && rule.x < Math.max(cell.right, line.right) - 2 && rule.y < line.bottom && rule.y + rule.height > cell.y);
    });
    if (host) { host.lines.push(line); host.x = Math.min(host.x, line.x); host.right = Math.max(host.right, line.right); host.bottom = Math.max(host.bottom, line.bottom); }
    else cells.push({ lines: [line], x: line.x, right: line.right, y: line.y, bottom: line.bottom, size: line.size });
  }
  // Each cell may use its whole box: up to the nearest rule, or halfway to the next cell where there is none.
  const vOverlap = (a: { y: number; bottom: number }, b: { y: number; bottom: number }) => Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
  const hOverlap = (a: { x: number; right: number }, b: { x: number; right: number }) => Math.min(a.right, b.right) - Math.max(a.x, b.x);
  const boxOf = (cell: Cell) => {
    // The box reaches to just inside the rules (it is also the mask); the typesetter keeps its own margin.
    const pad = 1, descent = cell.size * .3;
    let left = x0, right = x1, top = y0, bottom = y1;
    for (const rule of down) if (rule.y < cell.bottom && rule.y + rule.height > cell.y) {
      if (rule.x <= cell.x + 1) left = Math.max(left, rule.x + pad); else if (rule.x >= cell.right - 1) right = Math.min(right, rule.x - pad);
    }
    for (const rule of across) if (rule.x < cell.right && rule.x + rule.width > cell.x) {
      if (rule.y <= cell.y + 1) top = Math.max(top, rule.y + pad); else if (rule.y >= cell.bottom - 1) bottom = Math.min(bottom, rule.y - pad);
    }
    for (const other of cells) if (other !== cell) {
      if (vOverlap(cell, other) > 0) {
        if (other.right <= cell.x + 1) left = Math.max(left, (other.right + cell.x) / 2); else if (other.x >= cell.right - 1) right = Math.min(right, (other.x + cell.right) / 2);
      }
      if (hOverlap(cell, other) > 0) {
        if (other.bottom <= cell.y + 1) top = Math.max(top, (other.bottom + descent + cell.y) / 2); else if (other.y >= cell.bottom - 1) bottom = Math.min(bottom, (other.y + cell.bottom + descent) / 2);
      }
    }
    left = Math.min(left, cell.x); right = Math.max(right, cell.right); top = Math.min(top, cell.y); bottom = Math.max(bottom, cell.bottom);
    return { x: left / width, y: top / height, width: (right - left) / width, height: (bottom - top) / height };
  };
  // Alignment is read per column: a cell that starts where another cell of its column starts is set
  // flush left (the body of most tables); one that does not, but sits in the middle of its box, is centred
  // (headers, short labels).
  const boxes = cells.map(boxOf);
  const alignOf = (index: number): "left" | "center" => {
    const cell = cells[index], box = boxes[index];
    const column = cells.filter((other, at) => at !== index && Math.min(boxes[at].x + boxes[at].width, box.x + box.width) - Math.max(boxes[at].x, box.x) > Math.min(boxes[at].width, box.width) * .6);
    const matches = column.filter(other => Math.abs(other.x - cell.x) < 2.5).length;
    if (matches >= Math.min(2, column.length)) return "left";
    return Math.abs((cell.x + cell.right) / 2 - (box.x + box.width / 2) * width) < Math.max(3, box.width * width * .1) && cell.x - box.x * width > 4 ? "center" : "left";
  };
  return cells.map((cell, index): PdfParagraph => {
    const text = cell.lines.map(line => line.text).join(" ").replace(/([a-z])[-‐]\s+(?=[a-z])/g, "$1").replace(/\s+/g, " ").trim();
    const pitch = cell.lines.length > 1 ? (cell.lines.at(-1)!.y - cell.lines[0].y) / (cell.lines.length - 1) : cell.size * 1.2;
    return { id: `cell-${pageIndex}-${index}`, pageIndex, text, kind: "body", x: cell.x / width, y: cell.y / height, width: (cell.right - cell.x) / width, height: (cell.bottom - cell.y) / height,
      lines: cell.lines.map(line => ({ x: line.x / width, y: line.y / height, width: (line.right - line.x) / width, height: (line.bottom - line.y) / height })),
      fontFamily: cell.lines.some(line => line.sans) ? "sans-serif" : "serif", fontWeight: cell.lines.filter(line => line.bold).length > cell.lines.length / 2 ? 700 : 400, fontStyle: "normal", fontSize: cell.size, pitch, indent: 0,
      column: { left: cell.x / width, right: cell.right / width }, cell: { ...boxes[index], align: alignOf(index) }, lineTexts: cell.lines.map(line => line.text) };
  }).filter(cell => cell.text);
}

const ORPHAN_REASONS = new Set(["table-data", "short-fragment", "figure-label", "small-label"]);
/**
 * One line of a paragraph split off as its own block ("ence Foundation under grant No. AST-2407709,"
 * between two lines of the acknowledgements) would stay in English among the Korean. A short
 * non-prose block in the same column, the same type size and directly against body text is body text.
 */
function adoptOrphanLines(paragraphs: PdfParagraph[], classified: { role: BlockRole; reason: string | null }[], height: number, tables: Region[]) {
  const isBody = (index: number) => classified[index]?.role === "BODY" && classified[index].reason === null;
  paragraphs.forEach((paragraph, index) => {
    if (!ORPHAN_REASONS.has(classified[index].reason ?? "") || paragraph.lines.length > 2 || tables.some(table => centerInside(paragraph, table))) return;
    const size = paragraph.fontSize ?? 0;
    const touches = (other: PdfParagraph | undefined, otherIndex: number) => {
      if (!other || !isBody(otherIndex) || Math.abs((other.fontSize ?? 0) - size) > size * .08) return false;
      if (Math.abs(other.x - paragraph.x) > .03 && !(paragraph.x > other.x - .01 && paragraph.x + paragraph.width < other.x + other.width + .01)) return false;
      const gap = (paragraph.y > other.y ? paragraph.y - (other.y + other.height) : other.y - (paragraph.y + paragraph.height)) * height;
      return gap < size * 1.6;
    };
    if (touches(paragraphs[index - 1], index - 1) || touches(paragraphs[index + 1], index + 1)) classified[index] = { ...classified[index], role: "BODY", reason: null };
  });
}

const TABLE_REASONS = new Set(["table-data", "table-column", "numeric-cells"]);
/**
 * A table keeps its cells as printed. Cell text that reads like a sentence ("ash remains in the
 * solid product.") is otherwise taken for body text, merged into the next paragraph and typeset
 * across the table and the column beside it. The area the recognised cells cover is the table:
 * small type inside it is table data. A bare "Table 1" label keeps the title line under it as its caption.
 */
function keepTablesTogether(paragraphs: PdfParagraph[], classified: { role: BlockRole; reason: string | null }[], bodySize: number) {
  const cells = paragraphs.map((paragraph, index) => ({ paragraph, index })).filter(({ index }) => classified[index].role === "TABLE" && TABLE_REASONS.has(classified[index].reason ?? ""));
  if (cells.length < 2) return;
  const titles = new Set<number>();
  paragraphs.forEach((label, index) => {
    if (classified[index].role !== "CAPTION" || !/^(?:table|tabel|tabla|tabelle|표|表)\s*[\dA-Z]+[a-z]?\.?$/i.test(label.text.trim())) return;
    const title = paragraphs.findIndex((other, otherIndex) => otherIndex !== index && other.y > label.y - .005 && other.y - (label.y + label.height) < .02 && other.x < label.x + .05 && other.x + other.width > label.x);
    if (title >= 0 && classified[title].role !== "TABLE") { classified[title] = { ...classified[title], role: "CAPTION", reason: null }; titles.add(title); }
  });
  const areas: { x0: number; y0: number; x1: number; y1: number; size: number; cells: number }[] = [];
  for (const { paragraph } of [...cells].sort((a, b) => a.paragraph.y - b.paragraph.y)) {
    const box = { x0: paragraph.x, y0: paragraph.y, x1: paragraph.x + paragraph.width, y1: paragraph.y + paragraph.height, size: paragraph.fontSize ?? 0, cells: 1 };
    const area = areas.find(other => box.y0 <= other.y1 + .04 && box.y1 >= other.y0 - .04);
    if (area) { area.x0 = Math.min(area.x0, box.x0); area.y0 = Math.min(area.y0, box.y0); area.x1 = Math.max(area.x1, box.x1); area.y1 = Math.max(area.y1, box.y1); area.size = Math.max(area.size, box.size); area.cells++; }
    else areas.push(box);
  }
  // A real table has several cells and is set smaller than the body; a stray numeric line in a paragraph is not a table.
  const tables = areas.filter(area => area.cells >= 3 && area.size < bodySize * .95);
  if (!tables.length) return;
  paragraphs.forEach((paragraph, index) => {
    const { role } = classified[index];
    if (titles.has(index) || !["BODY", "FIGURE_TEXT", "HEADING"].includes(role)) return;
    const size = paragraph.fontSize ?? bodySize, prose = proseScore(paragraph.text);
    if (size >= bodySize * .95 || prose.sentences >= 2 && prose.words >= 20) return;
    const cx = paragraph.x + paragraph.width / 2, cy = paragraph.y + paragraph.height / 2;
    const inside = tables.some(area => cx > area.x0 - .01 && cx < area.x1 + .01 && cy > area.y0 - .005 && cy < area.y1 + .005 && size <= area.size * 1.08);
    if (inside) classified[index] = { ...classified[index], role: "TABLE", reason: "table-data" };
  });
}

/** A block that can only be a bibliography entry: a DOI or database link, a numbered "12. Name, X." entry, or dense author initials with a year. */
function isEntry(text: string) {
  if (text.length > 1600) return false;
  if (/\[(?:CrossRef|PubMed|Google Scholar)\]|doi\.org\/|\bdoi:\s*10\./i.test(text)) return true;
  // "31. Wahidul, K.B. Life cycle …": the year may be on the entry's next line.
  if (/^\[?\d{1,3}[.\])]\s+[A-Z][A-Za-z'’-]+,?\s+(?:[A-Z]\.|[A-Z][a-z]+,)/.test(text)) return true;
  // Initials first ("[43] C. Maes, …", "16. M. J. Silvapulle, …", "M. C. Kelley, The Earth's …") and BibTeX.
  if (/^\[?\d{1,3}[.\])]\s+(?:[A-Z]\.\s?-?){1,3}\s?[A-Z][A-Za-z'’-]+/.test(text) || /^@\w+\{/.test(text)) return true;
  // Vancouver (PLOS, medicine): "33. Silverstein JT, Shearer KD, …", "41. Mayer J (1991) …".
  if (/^\[?\d{1,3}[.\])]?\s+[A-Z][A-Za-z'’-]+\s+[A-Z]{1,3}(?:[,.]|\s+\()/.test(text)) return true;
  if ((text.match(/\b[A-Z][a-z'’-]+\s+[A-Z]{1,3}(?=,|\s\(|\.)/g) ?? []).length >= 2 && /\b(?:19|20)\d{2}[a-z]?\b/.test(text)) return true;
  if (/^(?:[A-Z]\.\s?-?){1,3}\s?[A-Z][A-Za-z'’-]+,/.test(text) && /\b(?:19|20)\d{2}[a-z]?\b/.test(text)) return true;
  // "Dubois, L., and Thomas, D. (2018)": an initial before a comma, "and", "&" or the year.
  const initials = (text.match(/\b[A-Z]\.(?:\s?-?[A-Z]\.)*(?:[,;&]|\s(?:\(|and\b|&))/g) ?? []).length;
  return initials >= 2 && initials * 100 >= text.length * .6 && /\b(?:19|20)\d{2}[a-z]?\b/.test(text);
}

/**
 * Reference lists the headings missed (no heading, a heading in another language, a list carried over a
 * page or chapter break): three or more entries in a row, with the short continuation lines between
 * them, are references and are never sent for translation.
 */
/**
 * A running head or foot ("Smart Engineering Technology and Management", a journal line) repeats at
 * the top or bottom of many pages. Reading it on one page alone it can pass for a sentence; seen on
 * three or more pages in the same place, it is page furniture and stays as printed.
 */
export function markRunningHeads(blocks: ManifestBlock[]) {
  const key = (block: ManifestBlock) => block.text.toLowerCase().replace(/[^\p{L}]+/gu, "");
  const edge = (block: ManifestBlock) => block.lines.length <= 2 && block.text.length < 160 && (block.y < .11 || block.y + block.height > .9);
  const pages = new Map<string, Set<number>>();
  for (const block of blocks) if (edge(block) && key(block).length >= 6) pages.set(key(block), (pages.get(key(block)) ?? new Set()).add(block.pageIndex));
  for (const block of blocks) {
    if (!block.translatable || !edge(block) || (pages.get(key(block))?.size ?? 0) < 3) continue;
    Object.assign(block, { role: block.y < .5 ? "HEADER" : "FOOTER", translatable: false, exclusionReason: "running-head" });
  }
}

export function markReferenceRuns(blocks: ManifestBlock[]) {
  const candidates = blocks.filter(block => block.translatable);
  let start = 0;
  while (start < candidates.length) {
    if (!isEntry(candidates[start].text)) { start++; continue; }
    let end = start, entries = 1;
    for (let next = start + 1; next < candidates.length; next++) {
      if (isEntry(candidates[next].text)) { entries++; end = next; continue; }
      // The tail of an entry ("Publ. 2014, 4, 1–24.", "15 October 2018).") belongs to the list.
      if (candidates[next].text.length < 300 && looksLikeReference(candidates[next].text)) { end = next; continue; }
      // A wrapped entry's tail ("England, 2004; pp 89-160.") sits between two entries.
      if (candidates[next].text.length < 220 && next + 1 < candidates.length && isEntry(candidates[next + 1].text)) continue;
      break;
    }
    if (entries >= 3) for (const block of candidates.slice(start, end + 1)) { block.role = "REFERENCE"; block.translatable = false; block.exclusionReason = "reference-section"; }
    start = end + 1;
  }
}

const SENTENCE_END = /[.!?:。！？](?:["”’)\]]|\[[\d,–−-]+\])*\s*$/;
const MAX_UNIT_CHARS = 6000;

/** Join paragraph fragments split by a column or page break; headings and display equations always end a paragraph. */
export async function buildUnits(documentId: string, blocks: ManifestBlock[]): Promise<TranslationUnit[]> {
  const units: TranslationUnit[] = [];
  let open: { unit: TranslationUnit; last: ManifestBlock } | null = null;
  for (const block of blocks) {
    if (!block.translatable) {
      if (block.role === "EQUATION" || block.role === "TITLE" || block.role === "REFERENCE" || block.role === "AUTHOR") open = null;
      continue;
    }
    const prose = block.role === "BODY" || block.role === "ABSTRACT";
    // A block that opens in lowercase ("of memory cards used …") continues the sentence above even when a
    // hanging indent makes it look like a new paragraph; sent apart, the translator completes the first
    // half with the second and the second half is then translated twice.
    if (prose && open && !SENTENCE_END.test(open.last.text) && (!(block.indent && block.indent > 0) || /^[a-z]/.test(block.text)) && open.unit.text.length + block.text.length < MAX_UNIT_CHARS && (open.last.pageIndex !== block.pageIndex || open.last.columnIndex !== block.columnIndex || /^[a-z(\d]/.test(block.text))) {
      const hyphen = /[a-z][-‐]$/.test(open.unit.text) && /^[a-z]/.test(block.text);
      open.unit.text = hyphen ? open.unit.text.replace(/[-‐]$/, "") + block.text : `${open.unit.text} ${block.text}`;
      open.unit.blockIds.push(block.id);
      if (!open.unit.pages.includes(block.pageIndex)) open.unit.pages.push(block.pageIndex);
      open.unit.pageChars[block.pageIndex] = (open.unit.pageChars[block.pageIndex] ?? 0) + block.text.length;
      open.last = block;
      continue;
    }
    const unit: TranslationUnit = { id: "", role: block.role, blockIds: [block.id], pages: [block.pageIndex], text: block.text, pageChars: { [block.pageIndex]: block.text.length }, ...(block.role === "HEADING" || block.role === "TABLE" ? { manual: true } : {}) };
    units.push(unit);
    open = prose ? { unit, last: block } : block.role === "CAPTION" ? open : null;
  }
  for (const unit of units) unit.id = await sha(`${documentId}|unit|${unit.blockIds.join(",")}`);
  const byBlock = new Map(units.flatMap(unit => unit.blockIds.map(id => [id, unit.id] as const)));
  for (const block of blocks) block.unitId = byBlock.get(block.id);
  return units;
}

export async function buildTranslationManifest(documentId: string, pdf: PdfDocumentHandle, signal?: AbortSignal, onPage?: (completed: number) => void, ocr?: OcrProvider): Promise<TranslationManifest> {
  const blocks: ManifestBlock[] = [], ids = new Set<string>(), ocrCandidates: number[] = [], pages: PageSize[] = [], keywords: string[] = [];
  let ocrPages = 0, section: Section = "none";
  const marks: string[] = [], texts: string[] = [], citations = { raised: 0, total: 0 };
  const timing = { text: 0, images: 0, ocr: 0, layout: 0, total: 0 }, started = performance.now();
  let mark = started;
  const lap = (key: keyof typeof timing) => { const now = performance.now(); timing[key] += now - mark; mark = now; };
  for (let pageIndex = 0; pageIndex < pdf.pageCount; pageIndex++) {
    signal?.throwIfAborted();
    const page = await pdf.getPage(pageIndex + 1);
    let raw = await page.getTextItems(signal);
    lap("text");
    // A scanned page (no text, an image) or text without a usable Unicode map is read from its pixels.
    const health = textHealth(raw);
    // A page that is only a figure keeps its picture: OCR runs for unusable fonts, or an image covering most of the page (a scan).
    const scanned = health === "garbled" || (health === "empty" && (await page.getLargestImageShare?.() ?? 0) >= .5);
    lap("images");
    if (scanned) {
      let read: PdfTextItem[] | null = null;
      if (ocr) { try { read = await ocr(page, signal); } catch (error) { if (signal?.aborted) throw error; } }
      if (read && letterCount(read) > letterCount(raw) * 1.2 + 40) { raw = read; ocrPages++; }
      else if (!read) ocrCandidates.push(pageIndex);
      lap("ocr");
    }
    // The page's own drawing: ruled tables keep their cells, pictures are kept clear of translated text.
    const graphics = await page.getGraphics?.().catch(() => undefined);
    const found = { tables: [] as Region[] };
    const pageBlocks = await buildPageBlocks(documentId, pageIndex, raw, page.width, page.height, section, graphics?.rules ?? [], found);
    const tables = found.tables;
    const images = graphics ? figureRegions(graphics.images, page.width, page.height, pageBlocks) : [];
    pages.push({ width: page.width, height: page.height, ...(images.length ? { images } : {}), ...(tables.length ? { tables } : {}) });
    for (const block of pageBlocks) {
      section = nextSection(block.role, block.exclusionReason, block.text, section);
      if (block.role === "KEYWORDS" && pageIndex < 2) keywords.push(...extractKeywords(block));
      // The same paragraph twice at the same place (text drawn twice): keep the first, never fail the paper.
      if (ids.has(block.id)) continue;
      ids.add(block.id);
      if (block.translatable) {
        marks.push(...block.marks ?? []); texts.push(block.text);
        citations.raised += block.raised ?? 0; citations.total += (block.text.match(/\[\d+(?:\s*[,–-]\s*\d+)*\]/g) ?? []).length;
      }
      blocks.push({ ...block, readingOrder: blocks.length, lineTexts: undefined, marks: undefined, raised: undefined });
    }
    lap("layout");
    onPage?.(pageIndex + 1);
    // Yield so a long extraction never freezes the reader.
    await new Promise(resolve => setTimeout(resolve, 0));
    mark = performance.now();
  }
  markRunningHeads(blocks);
  markReferenceRuns(blocks);
  const units = await buildUnits(documentId, blocks);
  timing.total = performance.now() - started;
  for (const key of Object.keys(timing) as (keyof typeof timing)[]) timing[key] = Math.round(timing[key]);
  return { documentId, version: EXTRACTOR_VERSION, createdAt: new Date().toISOString(), pageCount: pdf.pageCount, pages, blocks, units, keywords: [...new Set(keywords)], extractedPages: pdf.pageCount, ocrPages, ocrCandidates, scripts: buildScriptTable(marks, texts, citations), timing };
}

const memory = new Map<string, TranslationManifest>();
/** Units of a paper and how many the whole-paper run covers, read without keeping the manifest in memory. */
export async function manifestUnitIds(documentId: string): Promise<string[] | null> {
  const cached = memory.get(documentId);
  if (cached) return cached.units.filter(unit => !unit.manual).map(unit => unit.id);
  const db = await openDatabase();
  const value = await requestResult<TranslationManifest | undefined>(db.transaction("translationManifests").objectStore("translationManifests").get(documentId));
  // An analysis from an older version still matches the translations stored with it: good enough for progress.
  return value ? value.units.filter(unit => !unit.manual && (value.version === EXTRACTOR_VERSION || !["HEADING", "TABLE"].includes(unit.role))).map(unit => unit.id) : null;
}
export const manifestRepository = {
  peek(documentId: string) { return memory.get(documentId) ?? null; },
  async get(documentId: string): Promise<TranslationManifest | null> {
    const cached = memory.get(documentId);
    if (cached) return cached;
    const db = await openDatabase();
    const value = await requestResult<TranslationManifest | undefined>(db.transaction("translationManifests").objectStore("translationManifests").get(documentId));
    if (value?.version !== EXTRACTOR_VERSION) return null;
    memory.set(documentId, value);
    return value;
  },
  async put(value: TranslationManifest) {
    memory.set(value.documentId, value);
    const db = await openDatabase(), tx = db.transaction("translationManifests", "readwrite"), done = transactionDone(tx);
    tx.objectStore("translationManifests").put(value);
    await done;
  }
};

/**
 * One build per document even when the library, reader and export ask at once. The build belongs to
 * everyone waiting for it: one caller giving up (a re-rendered reader, a stopped job) leaves it running
 * for the others, and it is cancelled only when nobody is waiting any more.
 */
type Build = { task: Promise<TranslationManifest>; controller: AbortController; waiters: number; done: number; listeners: Set<(completed: number) => void> };
const building = new Map<string, Build>();
export function ensureManifest(documentId: string, open: (signal: AbortSignal) => Promise<PdfDocumentHandle>, onPage?: (completed: number) => void, signal?: AbortSignal, ocr?: OcrProvider): Promise<TranslationManifest> {
  let build = building.get(documentId);
  if (!build) {
    const controller = new AbortController(), listeners = new Set<(completed: number) => void>();
    const entry: Build = { controller, listeners, waiters: 0, done: 0, task: null! };
    entry.task = (async () => {
      const stored = await manifestRepository.get(documentId);
      if (stored) return stored;
      const pdf = await open(controller.signal);
      try {
        const manifest = await buildTranslationManifest(documentId, pdf, controller.signal, completed => { entry.done = completed; for (const listener of listeners) listener(completed); }, ocr);
        await manifestRepository.put(manifest);
        return manifest;
      } finally { await pdf.destroy(); }
    })().finally(() => { if (building.get(documentId) === entry) building.delete(documentId); });
    building.set(documentId, entry);
    build = entry;
  }
  const current = build;
  current.waiters++;
  if (onPage) { current.listeners.add(onPage); if (current.done) onPage(current.done); }
  return new Promise<TranslationManifest>((resolve, reject) => {
    let settled = false;
    const leave = () => { settled = true; current.waiters--; if (onPage) current.listeners.delete(onPage); signal?.removeEventListener("abort", abort); };
    const abort = () => {
      if (settled) return;
      leave();
      if (current.waiters <= 0) { current.controller.abort(); if (building.get(documentId) === current) building.delete(documentId); }
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    current.task.then(value => { if (settled) return; leave(); resolve(value); }, error => { if (settled) return; leave(); reject(error); });
  });
}

export function manifestCounts(manifest: TranslationManifest, translatedIds: Set<string>, failedIds = new Set<string>(), cancelledIds = new Set<string>()) {
  // Headings and table cells are translated on request: the whole-paper progress counts the rest.
  const targets = (manifest.units ?? []).filter(unit => !unit.manual);
  for (const unit of targets) {
    const states = Number(translatedIds.has(unit.id)) + Number(failedIds.has(unit.id)) + Number(cancelledIds.has(unit.id));
    if (states > 1) throw new Error(`번역 단위 ${unit.id}에 중복 상태가 있습니다.`);
  }
  const translated = targets.filter(unit => translatedIds.has(unit.id)).length;
  const failed = targets.filter(unit => failedIds.has(unit.id)).length;
  const cancelled = targets.filter(unit => cancelledIds.has(unit.id)).length;
  const pending = targets.length - translated - failed - cancelled;
  return { totalBlocks: manifest.blocks.length, translatableBlocks: targets.length, excludedBlocks: manifest.blocks.filter(block => !block.translatable).length, translatedBlocks: translated, failedBlocks: failed, cancelledBlocks: cancelled, pendingBlocks: pending, ocrCandidatePages: manifest.ocrCandidates?.length ?? 0, progressPercent: targets.length ? Math.round(translated / targets.length * 100) : 100, complete: pending === 0 && failed === 0 && cancelled === 0 && !(manifest.ocrCandidates?.length) };
}
