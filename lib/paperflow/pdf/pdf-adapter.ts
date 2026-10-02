import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
export interface PdfTextItem { text: string; x: number; y: number; width: number; height: number; fontName: string; fontFamily: string; hasEOL: boolean; /** Baseline in pt; ligature glyphs often sit in another font with a different ascent. */ baseline?: number }
export interface PdfPageHandle {
  width: number; height: number;
  getTextItems(signal?: AbortSignal): Promise<PdfTextItem[]>;
  getRasterImageCount?(): Promise<number>;
  render(canvas: HTMLCanvasElement, scale: number, signal: AbortSignal): Promise<void>;
  renderText(container: HTMLElement, scale: number, signal: AbortSignal): Promise<void>;
}
export interface PdfDocumentHandle { readMetadata(): Promise<{ text: string; info: Record<string, unknown> }>; pageCount: number; fingerprint?: string; getPage(pageNumber: number): Promise<PdfPageHandle>; destroy(): Promise<void> }
let library: Promise<typeof import("pdfjs-dist")> | undefined;
async function getLibrary() {
  library ??= import("pdfjs-dist").then(pdf => { pdf.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs"; return pdf; });
  return library;
}
type Box = [number, number, number, number];
/**
 * Figures are sometimes a whole PDF page pasted in as a form XObject and clipped to the figure
 * (MDPI does this): the text layer then carries the entire pasted manuscript although only the
 * part inside the figure is painted. Returns, for fonts used only inside such forms, the form
 * boxes (PDF space) their text is visible in.
 */
export function clippedFormFonts(fnArray: number[], argsArray: unknown[][], ops: Record<string, number>): Map<string, Box[]> {
  const inside = new Map<string, Box[]>(), outside = new Set<string>(), stack: (Box | null)[] = [];
  let pendingGroup: Box | null = null;
  const toBox = (bbox: unknown, matrix: unknown): Box | null => {
    const b = bbox && typeof bbox === "object" ? Object.values(bbox as Record<string, number>).map(Number) : null;
    if (!b || b.length < 4 || b.some(value => !Number.isFinite(value))) return null;
    const m = Array.isArray(matrix) && matrix.length === 6 ? matrix.map(Number) : [1, 0, 0, 1, 0, 0];
    const xs = [b[0], b[2]].flatMap(x => [b[1], b[3]].map(y => m[0] * x + m[2] * y + m[4]));
    const ys = [b[0], b[2]].flatMap(x => [b[1], b[3]].map(y => m[1] * x + m[3] * y + m[5]));
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  fnArray.forEach((fn, index) => {
    const args = argsArray[index] ?? [];
    if (fn === ops.beginGroup) { const group = args[0] as { bbox?: unknown; matrix?: unknown } | undefined; pendingGroup = toBox(group?.bbox, group?.matrix); }
    else if (fn === ops.paintFormXObjectBegin) { stack.push(toBox(args[1], args[0]) ?? pendingGroup); pendingGroup = null; }
    else if (fn === ops.paintFormXObjectEnd) stack.pop();
    else if (fn === ops.setFont && typeof args[0] === "string") {
      const box = stack.at(-1);
      if (!stack.length) outside.add(args[0]);
      else if (box) inside.set(args[0], [...(inside.get(args[0]) ?? []), box]);
    }
  });
  for (const font of outside) inside.delete(font);
  return inside;
}

function pageHandle(page: PDFPageProxy): PdfPageHandle {
  const base = page.getViewport({ scale: 1 });
  return {
    width: base.width, height: base.height,
    async getTextItems(signal) {
      const [content, library, operators] = await Promise.all([page.getTextContent(), getLibrary(), page.getOperatorList()]);
      signal?.throwIfAborted();
      const forms = clippedFormFonts(operators.fnArray, operators.argsArray, library.OPS as unknown as Record<string, number>);
      return content.items.flatMap(item => {
        if (!("str" in item) || !item.str.trim()) return [];
        const boxes = forms.get(item.fontName);
        if (boxes && !boxes.some(([x1, y1, x2, y2]) => item.transform[4] >= x1 - 2 && item.transform[4] <= x2 + 2 && item.transform[5] >= y1 - 2 && item.transform[5] <= y2 + 2)) return [];
        // Rotated text (axis titles, side labels) belongs to figures and would stretch a column.
        const [m0, m1, m2, m3] = item.transform;
        if (Math.abs(m1) > Math.abs(m0) * .1 || Math.abs(m2) > Math.abs(m3) * .1) return [];
        const [x, baseline] = base.convertToViewportPoint(item.transform[4], item.transform[5]);
        const height = Math.max(1, Math.abs(item.height) || Math.hypot(item.transform[2], item.transform[3]));
        const style = content.styles[item.fontName];
        const ascent = typeof style?.ascent === "number" ? style.ascent : .8;
        return [{ text: item.str, x, y: baseline - height * ascent, width: Math.abs(item.width), height, fontName: item.fontName, fontFamily: style?.fontFamily ?? "serif", hasEOL: item.hasEOL, baseline }];
      });
    },
    async getRasterImageCount() {
      const pdf = await getLibrary(), operators = await page.getOperatorList();
      const imageOps = new Set([pdf.OPS.paintImageXObject, pdf.OPS.paintInlineImageXObject, pdf.OPS.paintImageMaskXObject]);
      return operators.fnArray.filter(operation => imageOps.has(operation)).length;
    },
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
      try {
        await layer.render();
        let index = 0;
        for (const item of text.items) {
          if (!("str" in item)) continue;
          const span = layer.textDivs[index++];
          if (span) span.dataset.pfSourceFont = item.fontName;
        }
      } finally { signal.removeEventListener("abort", cancel); }
    }
  };
}
function documentHandle(document: PDFDocumentProxy, destroy: () => Promise<void>): PdfDocumentHandle {
  const pages = new Map<number, Promise<PdfPageHandle>>();
  return { async readMetadata() { const metadata = await document.getMetadata(); const page = await document.getPage(1); const text = await page.getTextContent(); return { info: metadata.info as Record<string, unknown>, text: text.items.map(item => "str" in item ? item.str : "").join(" ") }; }, pageCount: document.numPages, fingerprint: document.fingerprints[0] ?? undefined,
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
