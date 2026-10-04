import { PDFDocument, rgb, LineCapStyle, type PDFPage, type RGB } from "pdf-lib";
import { annotationRepository } from "../persistence/annotation-repository";
import { documentRepository } from "../persistence/document-repository";
import { translationRepository } from "../persistence/translation-repository";
import { pdfAdapter, type PdfTextItem } from "./pdf-adapter";
import { PdfFontBook, advance } from "./pdf-fonts";
import { ensureManifest } from "../translation/manifest";
import { typesetPage, type PageLayout, type Rect, type SetLine } from "../typeset/page-typesetter";
import { canvasMeasure, ensurePaperFonts } from "../typeset/measure";
import { SCRIPT_SCALE, scriptedMeasure, type ScriptTable } from "../typeset/scripts";
import { inkColor, linkInk, styledPieces, type Piece } from "../typeset/ink";
import type { Annotation, AnnotationColor } from "../anchors/types";

/** Background resolution in pixels per point: figures and untranslated text stay sharp when zoomed. */
const PIXELS_PER_POINT = 2.5;
const highlightColors: Record<AnnotationColor, string> = { yellow: "rgba(255,225,45,.38)", green: "rgba(74,211,122,.33)", blue: "rgba(69,155,255,.33)", pink: "rgba(255,106,164,.33)", purple: "rgba(166,121,245,.33)" };
const TEXT = rgb(20 / 255, 20 / 255, 20 / 255), MARK = rgb(23 / 255, 106 / 255, 202 / 255);
const MARK_LABEL = "한국어 번역본 · 개인 학습용";

const toRgb = (css: string | undefined, fallback: RGB) => { const [r, g, b] = (css?.match(/\d+/g) ?? []).map(Number); return css && [r, g, b].every(Number.isFinite) ? rgb(r / 255, g / 255, b / 255) : fallback; };

function lightest(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  let best = -1, color = "rgb(255,255,255)";
  for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
    const px = Math.max(0, Math.min(context.canvas.width - 1, Math.round(x + width * (col + .5) / 6)));
    const py = Math.max(0, Math.min(context.canvas.height - 1, Math.round(y + height * (row + .5) / 3)));
    const [r, g, b] = context.getImageData(px, py, 1, 1).data;
    if (r + g + b > best) { best = r + g + b; color = `rgb(${r},${g},${b})`; }
  }
  return color;
}

interface Glyphs extends Piece { bold: boolean }

/** Words of a typeset line, each a list of styled pieces (scripts, link colours, bold label). */
function lineWords(line: SetLine, scripts: ScriptTable | undefined, referenceColor?: string, citationColor?: string) {
  const words: Glyphs[][] = [[]];
  for (const run of line.runs) {
    const pieces = line.kind === "heading" ? styledPieces(run.text, scripts) : styledPieces(run.text, scripts, referenceColor, citationColor);
    for (const piece of pieces) piece.text.split(" ").forEach((part, index) => {
      if (index) words.push([]);
      if (part) words.at(-1)!.push({ ...piece, text: part, bold: run.bold || line.bold });
    });
  }
  return words.filter(word => word.length);
}

/**
 * Korean text as real PDF text at the reader's positions. Justified lines end on the column
 * edge exactly as on screen: the space between words absorbs the difference.
 */
function drawLine(page: PDFPage, book: PdfFontBook, line: SetLine, scripts: ScriptTable | undefined, color: RGB, referenceColor?: string, citationColor?: string) {
  const size = line.fontSize, baseline = page.getHeight() - (line.y + size * .8325);
  const words = lineWords(line, scripts, referenceColor, citationColor);
  if (!words.length) return;
  const pieceSize = (piece: Glyphs) => piece.kind ? size * SCRIPT_SCALE : size;
  const widths = words.map(word => word.reduce((sum, piece) => sum + book.width(piece.text, pieceSize(piece), piece.bold, line.sans), 0));
  const space = book.width(" ", size, false, line.sans), natural = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  const justified = line.wordSpacing !== 0 || line.letterSpacing !== 0;
  let gap = space, letter = 0;
  // A sans heading is measured in the reader's sans face but drawn with Noto Serif KR here, so it
  // can come out wider than its line: words must never touch, a slightly longer line is fine.
  if (justified && words.length > 1) gap = Math.max(space * .6, space + (line.width - natural) / (words.length - 1));
  else if (justified) letter = Math.max(-size * .03, (line.width - natural) / Math.max(1, [...words[0].map(piece => piece.text).join("")].length - 1));
  let x = line.x;
  words.forEach((word, index) => {
    for (const piece of word) {
      const pieceSizeValue = pieceSize(piece), dy = piece.kind === "sub" ? -size * .21 : piece.kind === "sup" ? size * .35 : 0;
      const pieceColor = piece.color ? toRgb(piece.color, color) : color;
      for (const run of book.runs(piece.text, piece.bold, line.sans)) {
        if (letter) for (const char of run.text) { page.drawText(char, { x, y: baseline + dy, size: pieceSizeValue, font: run.font, color: pieceColor }); x += advance(run.font, char, pieceSizeValue) + letter; }
        else { page.drawText(run.text, { x, y: baseline + dy, size: pieceSizeValue, font: run.font, color: pieceColor }); x += advance(run.font, run.text, pieceSizeValue); }
      }
    }
    if (index < words.length - 1) x = line.x + widths.slice(0, index + 1).reduce((a, b) => a + b, 0) + gap * (index + 1);
  });
}

/** The source text that stays visible keeps an invisible text layer: it can be searched and selected. */
function drawSourceLayer(page: PDFPage, book: PdfFontBook, items: PdfTextItem[], masks: Rect[]) {
  const hidden = (item: PdfTextItem) => { const cx = item.x + item.width / 2, cy = item.y + item.height / 2; return masks.some(mask => cx >= mask.x && cx <= mask.x + mask.width && cy >= mask.y && cy <= mask.y + mask.height); };
  for (const item of items) {
    const text = [...item.text].filter(char => book.hasLatin(char.codePointAt(0)!)).join("");
    if (!text.trim() || hidden(item)) continue;
    const natural = advance(book.times, text, item.height);
    const size = natural > 0 ? item.height * Math.max(.6, Math.min(1.5, item.width / natural)) : item.height;
    page.drawText(text, { x: item.x, y: page.getHeight() - (item.baseline ?? item.y + item.height * .8), size, font: book.times, opacity: 0 });
  }
}

/** Top-right mark: the page is a Paperflow translation, not the publisher's edition. */
function drawMark(page: PDFPage, book: PdfFontBook) {
  const size = 6.2, brand = "PAPERFLOW", gapWidth = 4;
  const brandWidth = book.width(brand, size, true, true), labelWidth = book.width(MARK_LABEL, size, false);
  const width = brandWidth + gapWidth + labelWidth + 10, height = size + 6, x = page.getWidth() - width - 18, top = page.getHeight() - 9;
  page.drawRectangle({ x, y: top - height, width, height, color: rgb(1, 1, 1), opacity: .92, borderColor: MARK, borderWidth: .6 });
  let cursor = x + 5;
  for (const run of book.runs(brand, true, true)) { page.drawText(run.text, { x: cursor, y: top - height + 3.6, size, font: run.font, color: MARK }); cursor += advance(run.font, run.text, size); }
  cursor += gapWidth;
  for (const run of book.runs(MARK_LABEL, false)) { page.drawText(run.text, { x: cursor, y: top - height + 3.6, size, font: run.font, color: MARK }); cursor += advance(run.font, run.text, size); }
}

function drawInk(page: PDFPage, annotations: Annotation[]) {
  const width = page.getWidth(), height = page.getHeight();
  for (const annotation of annotations) {
    if (annotation.type !== "ink" || !annotation.points?.length) continue;
    const path = annotation.points.map((point, index) => `${index ? "L" : "M"} ${(point.x * width).toFixed(2)} ${(point.y * height).toFixed(2)}`).join(" ");
    page.drawSvgPath(path, { x: 0, y: height, borderColor: MARK, borderWidth: 2.5, borderLineCap: LineCapStyle.Round });
  }
}

/** Link colours the journal uses for figure references and citations, read from the rendered page. */
function linkColors(canvas: HTMLCanvasElement, items: PdfTextItem[], width: number) {
  const rect = (item: PdfTextItem) => ({ x: item.x, y: item.y, width: item.width, height: item.height });
  const reference = items.map(item => /^(?:Figures?|Fig\.|Tables?|Equations?|eqs?)\s*\d/i.test(item.text) ? linkInk(canvas, rect(item), width) : undefined).find(Boolean);
  const citation = items.map(item => /^\[?\d+(?:[,–-]\d+)*\]?$/.test(item.text.trim()) ? linkInk(canvas, rect(item), width) : undefined).find(Boolean);
  return { reference, citation };
}

/** Wrap memo text to a width in points with the PDF fonts. */
function wrap(book: PdfFontBook, text: string, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && book.width(next, size, false) > maxWidth) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

async function memoPages(output: PDFDocument, book: PdfFontBook, notes: { pageIndex: number; note: string }[]) {
  const width = 595, height = 842, margin = 56, size = 10.5, pitch = 16.5, title = "Paperflow · 연구 메모";
  await book.prepare(title, true);
  for (const note of notes) { await book.prepare(note.note, false); await book.prepare(`원문 ${note.pageIndex + 1}페이지`, true); }
  let page: PDFPage | null = null, y = 0;
  const text = (value: string, x: number, at: number, fontSize: number, bold: boolean, color: RGB) => { let cursor = x; for (const run of book.runs(value, bold)) { page!.drawText(run.text, { x: cursor, y: at, size: fontSize, font: run.font, color }); cursor += advance(run.font, run.text, fontSize); } };
  const start = () => { page = output.addPage([width, height]); drawMark(page, book); text(title, margin, height - margin - 10, 16, true, rgb(23 / 255, 36 / 255, 59 / 255)); y = height - margin - 46; };
  for (const note of notes) {
    const lines = wrap(book, note.note, size, width - margin * 2);
    if (!page || y - (lines.length + 1) * pitch < margin) start();
    text(`원문 ${note.pageIndex + 1}페이지`, margin, y, 9, true, MARK); y -= pitch;
    for (const line of lines) { if (y < margin) start(); text(line, margin, y, size, false, rgb(23 / 255, 36 / 255, 59 / 255)); y -= pitch; }
    y -= pitch * .8;
  }
}

/**
 * Export the reader view as a PDF with the same typesetter: same page, same columns, no
 * continuation pages. Figures and the untranslated source are a high-resolution page image
 * with an invisible text layer; the Korean translation is real text (selectable, searchable),
 * with the user's highlights and pen marks. The source file is never modified.
 */
export async function exportAnnotatedPdf(documentId: string, onProgress?: (done: number, total: number) => void): Promise<{ unfit: number }> {
  const [record, blob, texts, annotations] = await Promise.all([
    documentRepository.getDocument(documentId), documentRepository.getDocumentBlob(documentId), translationRepository.unitTexts(documentId), annotationRepository.listByDocument(documentId)
  ]);
  if (!record || !blob) throw new Error("저장된 원본 PDF를 찾지 못했습니다.");
  const bytes = await blob.arrayBuffer();
  const pdf = await pdfAdapter.open(bytes.slice(0));
  const output = await PDFDocument.create();
  output.setTitle(`${record.title || record.filename.replace(/\.pdf$/i, "")} — Paperflow 한국어 번역본`);
  output.setSubject("Paperflow 기계 번역본(개인 학습용). 원문의 저작권은 저자와 출판사에 있습니다.");
  output.setProducer("Paperflow"); output.setCreator("Paperflow");
  const book = await PdfFontBook.create(output);
  await book.prepare(MARK_LABEL, false);
  let unfit = 0;
  try {
    const manifest = await ensureManifest(documentId, () => pdfAdapter.open(bytes.slice(0)));
    await ensurePaperFonts([...texts.values()].join(""));
    const measure = scriptedMeasure(canvasMeasure(), manifest.scripts);
    // The adapter multiplies by the device pixel ratio; ask for a fixed resolution and read back the real one.
    const renderScale = PIXELS_PER_POINT / Math.min(window.devicePixelRatio || 1, 2);
    for (let index = 0; index < pdf.pageCount; index++) {
      const page = await pdf.getPage(index + 1);
      const canvas = document.createElement("canvas");
      await page.render(canvas, renderScale, new AbortController().signal);
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      const factor = canvas.width / page.width;
      const layout: PageLayout = typesetPage({ manifest, pageIndex: index, measure, translations: texts, inkAt: rect => {
        const x = Math.max(0, Math.floor(rect.x * factor)), y = Math.max(0, Math.floor(rect.y * factor)), w = Math.min(canvas.width - x, Math.ceil(rect.width * factor)), h = Math.min(canvas.height - y, Math.ceil(rect.height * factor));
        if (w < 1 || h < 1) return true;
        const data = context.getImageData(x, y, w, h).data;
        let paper = 0, ink = 0;
        for (let offset = 0; offset < data.length; offset += 4) paper = Math.max(paper, data[offset] + data[offset + 1] + data[offset + 2]);
        for (let offset = 0; offset < data.length; offset += 4) if (data[offset] + data[offset + 1] + data[offset + 2] < paper - 110) ink++;
        return ink > Math.max(2, w * h * .0015);
      } });
      unfit += layout.unfit.length;
      const items = await page.getTextItems();
      // Colours come from the untouched page, before any mask is painted.
      const links = linkColors(canvas, items, page.width);
      const headingInk = new Map(layout.units.filter(unit => layout.lines.some(line => line.unitId === unit.unitId && line.kind === "heading")).flatMap(unit => { const color = inkColor(canvas, unit.box, page.width); return color ? [[unit.unitId, color] as const] : []; }));
      const colors = layout.masks.map(mask => lightest(context, mask.x * factor, mask.y * factor, mask.width * factor, mask.height * factor));
      layout.masks.forEach((mask, offset) => { context.fillStyle = colors[offset]; context.fillRect(mask.x * factor, mask.y * factor, mask.width * factor, mask.height * factor); });
      const pageNotes = annotations.filter(item => item.pageIndex === index);
      for (const annotation of pageNotes) if (annotation.type === "highlight") {
        context.fillStyle = highlightColors[annotation.color];
        for (const rect of annotation.anchor.normalizedRects) context.fillRect(rect.x * canvas.width, (rect.y + rect.height * .13) * canvas.height, rect.width * canvas.width, rect.height * .74 * canvas.height);
      }
      const out = output.addPage([page.width, page.height]);
      out.drawImage(await output.embedJpg(canvas.toDataURL("image/jpeg", .9)), { x: 0, y: 0, width: page.width, height: page.height });
      drawSourceLayer(out, book, items, layout.masks);
      for (const line of layout.lines) await book.prepare(line.runs.map(run => run.text).join(""), line.bold || line.runs.some(run => run.bold));
      for (const line of layout.lines) drawLine(out, book, line, manifest.scripts, line.kind === "heading" ? toRgb(headingInk.get(line.unitId), TEXT) : TEXT, links.reference, links.citation);
      drawInk(out, pageNotes);
      drawMark(out, book);
      canvas.width = canvas.height = 0;
      onProgress?.(index + 1, pdf.pageCount);
    }
    // User memos are the only appended pages; translated text always stays on its own page.
    const notes = annotations.filter(item => item.note?.trim()).map(item => ({ pageIndex: item.pageIndex, note: item.note! }));
    if (notes.length) await memoPages(output, book, notes);
    const saved = await output.save();
    const file = new Blob([new Uint8Array(saved)], { type: "application/pdf" });
    const url = URL.createObjectURL(file), link = document.createElement("a");
    link.href = url; link.download = record.filename.replace(/\.pdf$/i, "") + "-paperflow.pdf"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { unfit };
  } finally { await pdf.destroy(); }
}
