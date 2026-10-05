"use client";
import type { PDFDocumentProxy } from "pdfjs-dist";

// The legacy build targets currently shipping browsers (incl. iPad Safari); the modern
// build relies on very recent JS built-ins (e.g. Map#getOrInsertComputed, Math.sumPrecise).
type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

/** Loads pdf.js on the client only and points it at the same-origin worker (see scripts/copy-pdfjs-assets.mjs). */
export function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= (import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJs>).then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    return pdfjs;
  });
  return pdfjsPromise;
}

export type OpenedPdf = { pdf: PDFDocumentProxy; close: () => Promise<void> };

export async function openPdf(bytes: ArrayBuffer): Promise<OpenedPdf> {
  const pdfjs = await loadPdfJs();
  // pdf.js transfers the buffer to the worker; hand it a copy so the original stays intact.
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
  });
  return { pdf: await task.promise, close: () => task.destroy() };
}

export type OutlineEntry = { title: string; pageIndex: number | null; depth: number };

export async function readOutline(pdf: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const outline = await pdf.getOutline();
  if (!outline) return [];
  const result: OutlineEntry[] = [];
  const walk = async (items: typeof outline, depth: number) => {
    for (const item of items) {
      let pageIndex: number | null = null;
      try {
        const dest = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
        if (dest && dest[0]) pageIndex = await pdf.getPageIndex(dest[0] as Parameters<PDFDocumentProxy["getPageIndex"]>[0]);
      } catch {
        pageIndex = null;
      }
      result.push({ title: item.title, pageIndex, depth });
      if (item.items?.length) await walk(item.items, depth + 1);
    }
  };
  await walk(outline, 0);
  return result;
}
