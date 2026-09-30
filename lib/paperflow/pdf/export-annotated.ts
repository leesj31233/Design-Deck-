import { PDFDocument } from "pdf-lib";
import { annotationRepository } from "../persistence/annotation-repository";
import { documentRepository } from "../persistence/document-repository";
import { translationRepository, translationSourceKey } from "../persistence/translation-repository";
import { pdfAdapter } from "./pdf-adapter";
import { extractPageForTranslation } from "../translation/extract-page";
import { layoutTranslation, paragraphRegions } from "../translation/inline-layout";
import { koreanFontStack } from "../translation/paper-font";
import type { AnnotationColor } from "../anchors/types";

const highlightColors: Record<AnnotationColor, string> = { yellow: "rgba(255,225,45,.38)", green: "rgba(74,211,122,.33)", blue: "rgba(69,155,255,.33)", pink: "rgba(255,106,164,.33)", purple: "rgba(166,121,245,.33)" };
function background(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  const samples = new Map<string, number>();
  for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) {
    const px = Math.max(0, Math.min(context.canvas.width - 1, Math.round(x + width * (col + .5) / 8)));
    const py = Math.max(0, Math.min(context.canvas.height - 1, Math.round(y + height * (row + .5) / 3)));
    const value = context.getImageData(px, py, 1, 1).data;
    const key = `${value[0]},${value[1]},${value[2]}`;
    samples.set(key, (samples.get(key) ?? 0) + 1);
  }
  return `rgb(${[...samples].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "255,255,255"})`;
}
function wrap(text: string, maxWidth: number, context: CanvasRenderingContext2D) {
  const lines: string[] = []; let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
/** Flatten the reader view into a portable PDF; the source file is never modified. */
export async function exportAnnotatedPdf(documentId: string, onProgress?: (done: number, total: number) => void) {
  const [record, blob, translations, annotations] = await Promise.all([
    documentRepository.getDocument(documentId), documentRepository.getDocumentBlob(documentId), translationRepository.listByDocument(documentId), annotationRepository.listByDocument(documentId)
  ]);
  if (!record || !blob) throw new Error("저장된 원본 PDF를 찾지 못했다.");
  const translated = new Map(translations.map(item => [translationSourceKey(item.pageIndex, item.source), item.text]));
  const pdf = await pdfAdapter.open(await blob.arrayBuffer());
  const output = await PDFDocument.create();
  const scale = 1.8;
  try {
    await document.fonts.ready;
    for (let index = 0; index < pdf.pageCount; index++) {
      const page = await pdf.getPage(index + 1);
      const canvas = document.createElement("canvas");
      await page.render(canvas, scale, new AbortController().signal);
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      const paragraphs = await extractPageForTranslation(page, index, new AbortController().signal, canvas);
      for (const paragraph of paragraphs) {
        const text = translated.get(translationSourceKey(index, paragraph.text));
        if (!text) continue;
        const lines = paragraph.lines.map(line => ({ x: line.x * canvas.width, y: line.y * canvas.height, width: line.width * canvas.width, height: line.height * canvas.height }));
        const regions = paragraphRegions(lines);
        const heights = lines.map(line => line.height).sort((a, b) => a - b);
        const originalSize = (heights[Math.floor(heights.length / 2)] || 14) * .96;
        const family = koreanFontStack(paragraph.fontFamily);
        const font = (size: number) => `${paragraph.fontStyle} ${paragraph.fontWeight} ${size}px ${family}`;
        const layout = layoutTranslation(text, regions, originalSize, (value, size) => { context.font = font(size); return context.measureText(value).width; }, Math.max(0, lines[0]?.x - regions[0]?.x));
        if (!layout.fits) continue;
        const fills = regions.map(region => background(context, region.x, region.y, region.width, region.height));
        regions.forEach((region, regionIndex) => { context.fillStyle = fills[regionIndex]; context.fillRect(region.x - 1, region.y - 1, region.width + 2, region.height + 2); });
        context.font = font(layout.fontSize); context.textBaseline = "top"; context.fillStyle = paragraph.color ?? "#171717";
        for (const line of layout.lines) {
          const region = regions[line.region];
          context.fillText(line.text, region.x + line.x, region.y + line.y);
        }
      }
      for (const annotation of annotations.filter(item => item.pageIndex === index)) {
        if (annotation.type === "highlight") {
          context.fillStyle = highlightColors[annotation.color];
          for (const rect of annotation.anchor.normalizedRects) context.fillRect(rect.x * canvas.width, (rect.y + rect.height * .13) * canvas.height, rect.width * canvas.width, rect.height * .74 * canvas.height);
        } else if (annotation.type === "ink" && annotation.points?.length) {
          context.beginPath(); context.strokeStyle = "#176aca"; context.lineWidth = 2.5 * scale; context.lineCap = "round"; context.lineJoin = "round";
          annotation.points.forEach((point, offset) => { if (offset) context.lineTo(point.x * canvas.width, point.y * canvas.height); else context.moveTo(point.x * canvas.width, point.y * canvas.height); });
          context.stroke();
        }
      }
      const image = await output.embedJpg(canvas.toDataURL("image/jpeg", .9));
      output.addPage([page.width, page.height]).drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
      onProgress?.(index + 1, pdf.pageCount);
    }
    const notes = annotations.filter(item => item.note?.trim());
    if (notes.length) {
      const width = 900, height = 1200;
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d")!;
      let y = 0;
      const newPage = async () => {
        if (!y) return;
        const image = await output.embedJpg(canvas.toDataURL("image/jpeg", .9));
        output.addPage([612, 816]).drawImage(image, { x: 0, y: 0, width: 612, height: 816 });
        y = 0;
      };
      for (const note of notes) {
        if (!y) { context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); context.fillStyle = "#17243b"; context.font = 'bold 30px "Noto Sans KR", "Malgun Gothic", sans-serif'; context.fillText("Paperflow · 연구 메모", 55, 70); y = 130; }
        context.font = '21px "Noto Sans KR", "Malgun Gothic", sans-serif';
        const lines = wrap(note.note ?? "", width - 110, context);
        if (y + lines.length * 33 + 70 > height - 50) { await newPage(); context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); y = 70; }
        context.fillStyle = "#176aca"; context.font = 'bold 18px "Noto Sans KR", "Malgun Gothic", sans-serif'; context.fillText(`원문 ${note.pageIndex + 1}페이지`, 55, y); y += 32;
        context.fillStyle = "#17243b"; context.font = '21px "Noto Sans KR", "Malgun Gothic", sans-serif';
        for (const line of lines) { context.fillText(line, 55, y); y += 33; }
        y += 31;
      }
      await newPage();
    }
    const bytes = await output.save();
    const file = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(file), link = document.createElement("a");
    link.href = url; link.download = record.filename.replace(/\.pdf$/i, "") + "-paperflow.pdf"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } finally { await pdf.destroy(); }
}
