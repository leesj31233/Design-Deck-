import { PDFDocument } from "pdf-lib";
import { annotationRepository } from "../persistence/annotation-repository";
import { documentRepository } from "../persistence/document-repository";
import { translationRepository } from "../persistence/translation-repository";
import { pdfAdapter } from "./pdf-adapter";
import { ensureManifest } from "../translation/manifest";
import { typesetPage } from "../typeset/page-typesetter";
import { canvasMeasure, ensurePaperFonts, paperFontStack } from "../typeset/measure";
import { SCRIPT_SCALE, scriptSegments, scriptedMeasure } from "../typeset/scripts";
import type { AnnotationColor } from "../anchors/types";

const highlightColors: Record<AnnotationColor, string> = { yellow: "rgba(255,225,45,.38)", green: "rgba(74,211,122,.33)", blue: "rgba(69,155,255,.33)", pink: "rgba(255,106,164,.33)", purple: "rgba(166,121,245,.33)" };
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
function wrap(text: string, maxWidth: number, context: CanvasRenderingContext2D) {
  const lines: string[] = []; let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
/**
 * Flatten the reader view into a portable PDF with the same typesetter as the
 * reader: same page, same columns, no continuation pages. The source file is never modified.
 */
export async function exportAnnotatedPdf(documentId: string, onProgress?: (done: number, total: number) => void): Promise<{ unfit: number }> {
  const [record, blob, texts, annotations] = await Promise.all([
    documentRepository.getDocument(documentId), documentRepository.getDocumentBlob(documentId), translationRepository.unitTexts(documentId), annotationRepository.listByDocument(documentId)
  ]);
  if (!record || !blob) throw new Error("저장된 원본 PDF를 찾지 못했다.");
  const bytes = await blob.arrayBuffer();
  const pdf = await pdfAdapter.open(bytes.slice(0));
  const output = await PDFDocument.create();
  const scale = 2;
  let unfit = 0;
  try {
    const manifest = await ensureManifest(documentId, () => pdfAdapter.open(bytes.slice(0)));
    await ensurePaperFonts([...texts.values()].join(""));
    const measure = scriptedMeasure(canvasMeasure(), manifest.scripts), family = paperFontStack();
    for (let index = 0; index < pdf.pageCount; index++) {
      const page = await pdf.getPage(index + 1);
      const canvas = document.createElement("canvas");
      await page.render(canvas, scale, new AbortController().signal);
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      const layout = typesetPage({ manifest, pageIndex: index, measure, translations: texts, inkAt: rect => {
        const x = Math.max(0, Math.floor(rect.x * scale)), y = Math.max(0, Math.floor(rect.y * scale)), w = Math.min(canvas.width - x, Math.ceil(rect.width * scale)), h = Math.min(canvas.height - y, Math.ceil(rect.height * scale));
        if (w < 1 || h < 1) return true;
        const data = context.getImageData(x, y, w, h).data;
        let paper = 0, ink = 0;
        for (let offset = 0; offset < data.length; offset += 4) paper = Math.max(paper, data[offset] + data[offset + 1] + data[offset + 2]);
        for (let offset = 0; offset < data.length; offset += 4) if (data[offset] + data[offset + 1] + data[offset + 2] < paper - 110) ink++;
        return ink > Math.max(2, w * h * .0015);
      } });
      unfit += layout.unfit.length;
      // Sample every mask colour before painting any of them.
      const colors = layout.masks.map(mask => lightest(context, mask.x * scale, mask.y * scale, mask.width * scale, mask.height * scale));
      layout.masks.forEach((mask, offset) => { context.fillStyle = colors[offset]; context.fillRect(mask.x * scale, mask.y * scale, mask.width * scale, mask.height * scale); });
      const typed = context as CanvasRenderingContext2D & { fontKerning: string; letterSpacing: string; wordSpacing: string };
      typed.fontKerning = "none"; context.textBaseline = "alphabetic"; context.fillStyle = "#111";
      for (const line of layout.lines) {
        // Same baseline as the reader's 1.15 line box positioned at y − 0.08 em.
        let x = line.x * scale; const baseline = (line.y + line.fontSize * .8325) * scale;
        typed.wordSpacing = `${line.wordSpacing * scale}px`; typed.letterSpacing = `${line.letterSpacing * scale}px`;
        for (const run of line.runs) for (const segment of scriptSegments(run.text, manifest.scripts)) {
          const size = line.fontSize * scale * (segment.kind ? SCRIPT_SCALE : 1), shift = segment.kind === "sub" ? line.fontSize * scale * .21 : segment.kind === "sup" ? -line.fontSize * scale * .35 : 0;
          context.font = `${run.bold || line.bold ? 700 : 400} ${size}px ${line.sans ? paperFontStack(true) : family}`;
          context.fillText(segment.text, x, baseline + shift);
          x += context.measureText(segment.text).width;
        }
      }
      typed.wordSpacing = "0px"; typed.letterSpacing = "0px";
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
    // User memos are the only appended pages; translated text always stays on its own page.
    const notes = annotations.filter(item => item.note?.trim()).map(item => ({ pageIndex: item.pageIndex, note: item.note! }));
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
        const lines = wrap(note.note, width - 110, context);
        if (y + lines.length * 33 + 70 > height - 50) { await newPage(); context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); y = 70; }
        context.fillStyle = "#176aca"; context.font = 'bold 18px "Noto Sans KR", "Malgun Gothic", sans-serif'; context.fillText(`원문 ${note.pageIndex + 1}페이지`, 55, y); y += 32;
        context.fillStyle = "#17243b"; context.font = '21px "Noto Sans KR", "Malgun Gothic", sans-serif';
        for (const line of lines) { context.fillText(line, 55, y); y += 33; }
        y += 31;
      }
      await newPage();
    }
    const saved = await output.save();
    const file = new Blob([new Uint8Array(saved)], { type: "application/pdf" });
    const url = URL.createObjectURL(file), link = document.createElement("a");
    link.href = url; link.download = record.filename.replace(/\.pdf$/i, "") + "-paperflow.pdf"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { unfit };
  } finally { await pdf.destroy(); }
}
