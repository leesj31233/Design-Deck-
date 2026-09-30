import type { PdfPageHandle } from "@/lib/paperflow/pdf/pdf-adapter";
import { extractParagraphs } from "./paragraphs";

/** Read a page without scrolling it into view or painting it into the reader. */
export async function extractPageForTranslation(page: PdfPageHandle, pageIndex: number, signal: AbortSignal, canvas?: HTMLCanvasElement) {
  const surface = document.createElement("div");
  surface.className = "pf-pdf-page";
  surface.style.cssText = `position:fixed;left:-10000px;top:0;width:${page.width}px;height:${page.height}px;--scale-factor:1;--total-scale-factor:1;pointer-events:none`;
  const layer = document.createElement("div");
  layer.className = "textLayer";
  surface.append(layer);
  document.body.append(surface);
  try {
    await page.renderText(layer, 1, signal);
    signal.throwIfAborted();
    return extractParagraphs(layer, surface, pageIndex, canvas).filter(paragraph => paragraph.kind !== "skip" && (paragraph.kind === "title" || paragraph.text.length >= 12));
  } finally {
    surface.remove();
  }
}
