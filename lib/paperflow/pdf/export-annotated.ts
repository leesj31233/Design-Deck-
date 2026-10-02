import { PDFDocument } from "pdf-lib";
import { annotationRepository } from "../persistence/annotation-repository";
import { documentRepository } from "../persistence/document-repository";
import { translationRepository, translationSourceKey, TRANSLATION_PROMPT_VERSION } from "../persistence/translation-repository";
import { pdfAdapter } from "./pdf-adapter";
import { layoutTranslation, paragraphRegions, translationFlowRegions } from "../translation/inline-layout";
import { koreanFontStack } from "../translation/paper-font";
import { buildTranslationManifest, manifestRepository } from "../translation/manifest";
import { planColumnReflow } from "../translation/column-reflow";
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
function subtractRect(rect: { x: number; y: number; width: number; height: number }, obstacle: { x: number; y: number; width: number; height: number }) {
  const left = Math.max(rect.x, obstacle.x - 2), right = Math.min(rect.x + rect.width, obstacle.x + obstacle.width + 2);
  const top = Math.max(rect.y, obstacle.y - 2), bottom = Math.min(rect.y + rect.height, obstacle.y + obstacle.height + 2);
  if (left >= right || top >= bottom) return [rect];
  return [
    { x: rect.x, y: rect.y, width: left - rect.x, height: rect.height },
    { x: right, y: rect.y, width: rect.x + rect.width - right, height: rect.height },
    { x: left, y: rect.y, width: right - left, height: top - rect.y },
    { x: left, y: bottom, width: right - left, height: rect.y + rect.height - bottom }
  ].filter(part => part.width > 2 && part.height > 1);
}
/** Flatten the reader view into a portable PDF; the source file is never modified. */
export async function exportAnnotatedPdf(documentId: string, onProgress?: (done: number, total: number) => void) {
  const [record, blob, translations, annotations] = await Promise.all([
    documentRepository.getDocument(documentId), documentRepository.getDocumentBlob(documentId), translationRepository.listByDocument(documentId), annotationRepository.listByDocument(documentId)
  ]);
  if (!record || !blob) throw new Error("저장된 원본 PDF를 찾지 못했다.");
  const translated = new Map(translations.map(item => [translationSourceKey(item.pageIndex, item.source), item.text]));
  const translatedBlocks = new Map(translations.filter(item => item.blockId && item.promptVersion === TRANSLATION_PROMPT_VERSION).map(item => [item.blockId!, item.text]));
  const pdf = await pdfAdapter.open(await blob.arrayBuffer());
  const output = await PDFDocument.create();
  const scale = 1.8;
  try {
    await document.fonts.ready;
    let manifest = await manifestRepository.get(documentId);
    if (!manifest || manifest.pageCount !== pdf.pageCount) {
      manifest = await buildTranslationManifest(documentId, pdf);
      await manifestRepository.put(manifest);
    }
    const continuations: { pageIndex: number; text: string }[] = [];
    for (let index = 0; index < pdf.pageCount; index++) {
      const page = await pdf.getPage(index + 1);
      const canvas = document.createElement("canvas");
      await page.render(canvas, scale, new AbortController().signal);
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      const blocks = manifest.blocks.filter(block => block.pageIndex === index);
      const allSizes = blocks.filter(block => block.translatable).flatMap(block => block.lines.map(line => line.height * canvas.height)).sort((a, b) => a - b);
      const bodySize = allSizes[Math.floor(allSizes.length / 2)] || 14;
      const prepared = blocks.filter(block => block.translatable).map(block => {
        const text = translatedBlocks.get(block.id) ?? translated.get(translationSourceKey(index, block.text));
        if (!text) return null;
        const lines = block.lines.map(line => ({ x: line.x * canvas.width, y: line.y * canvas.height, width: line.width * canvas.width, height: line.height * canvas.height }));
        if (!lines.length) return null;
        const regions = paragraphRegions(lines), heights = lines.map(line => line.height).sort((a, b) => a - b);
        const originalSize = Math.min((heights[Math.floor(heights.length / 2)] || bodySize) * .96, bodySize * (block.kind === "title" ? 1.55 : block.kind === "caption" ? 1.12 : 1.18));
        return { block, text, lines, regions, flowRegions: translationFlowRegions(block, regions, canvas.width), originalSize, family: koreanFontStack(block.fontFamily), colors: lines.map(line => background(context, line.x, line.y, line.width, line.height)) };
      }).filter((item): item is NonNullable<typeof item> => Boolean(item));
      const byId = new Map(prepared.map(item => [item.block.id, item]));
      const fixed = blocks.filter(block => !block.translatable).map(block => block.role === "EQUATION" ? {
        x: (block.x < .48 ? .075 : .515) * canvas.width, y: block.y * canvas.height - bodySize * .35,
        width: (block.x < .48 ? .41 : .42) * canvas.width, height: block.height * canvas.height + bodySize * .7
      } : { x: block.x * canvas.width, y: block.y * canvas.height, width: block.width * canvas.width, height: block.height * canvas.height });
      const placements = planColumnReflow(prepared.map(item => ({ id: item.block.id, x: item.block.x * canvas.width, y: item.block.y * canvas.height, width: item.block.width * canvas.width, height: item.block.height * canvas.height, lineHeight: item.originalSize * 1.18, column: item.block.kind === "title" && item.block.width > .55 ? 2 : item.block.x < .48 ? 0 : 1 })), fixed, canvas.height, (flow, top, availableHeight) => {
        const item = byId.get(flow.id)!;
        const shift = top - item.regions[0].y, regions = item.flowRegions.map(region => ({ ...region, y: region.y + shift }));
        const last = regions.at(-1)!;
        last.height = Math.max(0, availableHeight - (last.y - top));
        for (const region of regions) region.height = Math.max(0, Math.min(region.height, availableHeight - (region.y - top)));
        const font = (size: number) => `${item.block.fontStyle} ${item.block.fontWeight} ${size}px ${item.family}`;
        const layout = layoutTranslation(item.text, regions, item.originalSize, (value, size) => { context.font = font(size); return context.measureText(value).width; }, Math.max(0, item.lines[0].x - item.regions[0].x), item.block.kind === "title" ? .94 : .82);
        const usedHeight = Math.max(0, ...layout.lines.map(line => regions[line.region].y + line.y + layout.lineHeight - top));
        return { usedHeight, output: { item, regions, layout, font } };
      });
      // Erase all translated source rectangles before drawing any shifted text.
      for (const item of prepared) item.lines.forEach((line, lineIndex) => { context.fillStyle = item.colors[lineIndex]; for (const part of fixed.reduce((parts, obstacle) => parts.flatMap(rect => subtractRect(rect, obstacle)), [line])) context.fillRect(part.x, part.y, part.width, part.height); });
      for (const placement of placements) {
        const { item, regions, layout, font } = placement.output;
        if (layout.remaining) continuations.push({ pageIndex: index, text: layout.remaining });
        context.font = font(layout.fontSize); context.textBaseline = "top"; context.fillStyle = item.block.color ?? "#171717";
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
    const notes = [
      ...continuations.map(item => ({ pageIndex: item.pageIndex, note: `이어지는 번역: ${item.text}` })),
      ...annotations.filter(item => item.note?.trim()).map(item => ({ pageIndex: item.pageIndex, note: item.note! }))
    ];
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
    const bytes = await output.save();
    const file = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(file), link = document.createElement("a");
    link.href = url; link.download = record.filename.replace(/\.pdf$/i, "") + "-paperflow.pdf"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } finally { await pdf.destroy(); }
}
