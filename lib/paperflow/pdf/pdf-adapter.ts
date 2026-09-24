import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
export interface PdfPageHandle {
  width: number; height: number;
  render(canvas: HTMLCanvasElement, scale: number, signal: AbortSignal): Promise<void>;
  renderText(container: HTMLElement, scale: number, signal: AbortSignal): Promise<void>;
}
export interface PdfDocumentHandle { pageCount: number; fingerprint?: string; getPage(pageNumber: number): Promise<PdfPageHandle>; destroy(): Promise<void> }
let library: Promise<typeof import("pdfjs-dist")> | undefined;
async function getLibrary() {
  library ??= import("pdfjs-dist").then(pdf => { pdf.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs"; return pdf; });
  return library;
}
function pageHandle(page: PDFPageProxy): PdfPageHandle {
  const base = page.getViewport({ scale: 1 });
  return {
    width: base.width, height: base.height,
    async render(canvas, scale, signal) {
      signal.throwIfAborted();
      const viewport = page.getViewport({ scale }), ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio);
      const task = page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      const cancel = () => task.cancel(); signal.addEventListener("abort", cancel, { once: true });
      try { await task.promise; } finally { signal.removeEventListener("abort", cancel); }
    },
    async renderText(container, scale, signal) {
      const [pdf, text] = await Promise.all([getLibrary(), page.getTextContent()]);
      signal.throwIfAborted();
      container.replaceChildren();
      const layer = new pdf.TextLayer({ textContentSource: text, container, viewport: page.getViewport({ scale }) });
      const cancel = () => layer.cancel(); signal.addEventListener("abort", cancel, { once: true });
      try { await layer.render(); } finally { signal.removeEventListener("abort", cancel); }
    }
  };
}
function documentHandle(document: PDFDocumentProxy, destroy: () => Promise<void>): PdfDocumentHandle {
  const pages = new Map<number, Promise<PdfPageHandle>>();
  return { pageCount: document.numPages, fingerprint: document.fingerprints[0] ?? undefined,
    getPage(number) {
      if (!pages.has(number)) pages.set(number, document.getPage(number).then(pageHandle));
      // Keep a bounded wrapper cache. PDF.js owns the underlying page lifecycle.
      for (const key of pages.keys()) if (Math.abs(key - number) > 2) pages.delete(key);
      return pages.get(number)!;
    },
    async destroy() { pages.clear(); await destroy(); }
  };
}
export const pdfAdapter = {
  async open(source: ArrayBuffer | Uint8Array, signal?: AbortSignal): Promise<PdfDocumentHandle> {
    const pdf = await getLibrary(); signal?.throwIfAborted();
    const task = pdf.getDocument({ data: new Uint8Array(source), cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/", wasmUrl: "/pdfjs/wasm/" });
    const cancel = () => { void task.destroy(); }; signal?.addEventListener("abort", cancel, { once: true });
    try { return documentHandle(await task.promise, () => task.destroy()); }
    catch (error) { await task.destroy(); throw error; }
    finally { signal?.removeEventListener("abort", cancel); }
  }
};
