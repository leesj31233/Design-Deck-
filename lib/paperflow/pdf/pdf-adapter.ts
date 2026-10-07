import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { canvasRatio, maxCanvasPixels } from "../device";
import { installStreamIteration } from "./stream-iteration";
export interface PdfTextItem { text: string; x: number; y: number; width: number; height: number; fontName: string; fontFamily: string; hasEOL: boolean; /** Set in a bold face (from the embedded font's own name or flags). */ bold?: boolean; /** Baseline in pt; ligature glyphs often sit in another font with a different ascent. */ baseline?: number }
export interface PdfPageHandle {
  width: number; height: number;
  getTextItems(signal?: AbortSignal): Promise<PdfTextItem[]>;
  /** Share of the page covered by its largest raster image (a scanned page is one image of the whole page). */
  getLargestImageShare?(): Promise<number>;
  /** Pictures and ruled lines the text layer cannot see, in page points from the top left. */
  getGraphics?(): Promise<PageGraphics>;
  render(canvas: HTMLCanvasElement, scale: number, signal: AbortSignal): Promise<void>;
  renderText(container: HTMLElement, scale: number, signal: AbortSignal): Promise<void>;
}
export interface Box { x: number; y: number; width: number; height: number }
/** Raster images, and long horizontal / vertical strokes (table rules, frames). */
export interface PageGraphics { images: Box[]; rules: Box[] }
export interface PdfDocumentHandle { readMetadata(): Promise<{ text: string; info: Record<string, unknown> }>; pageCount: number; fingerprint?: string; getPage(pageNumber: number): Promise<PdfPageHandle>; destroy(): Promise<void> }
let library: Promise<typeof import("pdfjs-dist")> | undefined;
async function getLibrary() {
  // Older Safari (iPadOS 18) cannot iterate the text streams PDF.js 6 reads: add that first.
  installStreamIteration();
  library ??= import("pdfjs-dist").then(pdf => { pdf.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs"; return pdf; });
  return library;
}
/**
 * One PDF.js worker for every document this tab opens: starting a worker (and parsing its 1 MB
 * script) for each paper was a good part of the wait before the first page. Destroying a document
 * leaves a shared worker running.
 */
let sharedWorker: Promise<InstanceType<typeof import("pdfjs-dist").PDFWorker>> | undefined;
function getWorker() {
  sharedWorker ??= getLibrary().then(pdf => new pdf.PDFWorker());
  sharedWorker.catch(() => { sharedWorker = undefined; });
  return sharedWorker;
}
/** Start PDF.js and its worker ahead of time (the library calls this when idle, the reader at once). */
export function warmPdf() { if (typeof window !== "undefined") void getWorker().catch(() => undefined); }
type Quad = [number, number, number, number];
/**
 * Figures are sometimes a whole PDF page pasted in as a form XObject and clipped to the figure
 * (MDPI does this): the text layer then carries the entire pasted manuscript although only the
 * part inside the figure is painted. Returns, for fonts used only inside such forms, the form
 * boxes (PDF space) their text is visible in.
 */
export function clippedFormFonts(fnArray: number[], argsArray: unknown[][], ops: Record<string, number>): Map<string, Quad[]> {
  const inside = new Map<string, Quad[]>(), outside = new Set<string>(), stack: (Quad | null)[] = [];
  let pendingGroup: Quad | null = null;
  const toBox = (bbox: unknown, matrix: unknown): Quad | null => {
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

/** Fonts of the page that are bold faces. The operator list has loaded them, with their PDF names. */
export function boldFonts(page: PDFPageProxy, names: string[]) {
  const bold = new Set<string>();
  for (const name of new Set(names)) {
    try {
      if (!page.commonObjs.has(name)) continue;
      const font = page.commonObjs.get(name) as { bold?: boolean; black?: boolean; name?: string };
      if (font?.bold || font?.black || /bold|black|heavy|demi|[-,]bd\b/i.test(font?.name ?? "")) bold.add(name);
    } catch { /* not loaded: regular */ }
  }
  return bold;
}

function pageHandle(page: PDFPageProxy): PdfPageHandle {
  const base = page.getViewport({ scale: 1 });
  let graphics: Promise<PageGraphics> | undefined;
  return {
    width: base.width, height: base.height,
    async getTextItems(signal) {
      const [content, library, operators] = await Promise.all([page.getTextContent(), getLibrary(), page.getOperatorList()]);
      signal?.throwIfAborted();
      const forms = clippedFormFonts(operators.fnArray, operators.argsArray, library.OPS as unknown as Record<string, number>);
      // A pasted page also repeats the page's own caption and sentences inside its box: keep the page's copy.
      const pageText = forms.size ? content.items.filter(item => "str" in item && !forms.has(item.fontName)).map(item => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ") : "";
      // Some producers draw each glyph run twice, slightly offset, to fake bold: keep one copy.
      const seen = new Set<string>();
      const bold = boldFonts(page, content.items.flatMap(item => "str" in item ? [item.fontName] : []));
      return content.items.flatMap(item => {
        if (!("str" in item) || !item.str.trim()) return [];
        const boxes = forms.get(item.fontName);
        if (boxes && !boxes.some(([x1, y1, x2, y2]) => item.transform[4] >= x1 - 2 && item.transform[4] <= x2 + 2 && item.transform[5] >= y1 - 2 && item.transform[5] <= y2 + 2)) return [];
        if (boxes && (/^(?:fig(?:ure)?\.?|table|scheme)\s*\d/i.test(item.str.trim()) || item.str.trim().length >= 8 && pageText.includes(item.str.replace(/\s+/g, " ").trim()))) return [];
        // Direction on the page as displayed (the page /Rotate included): text that reads upright there is
        // kept, wherever the producer rotated it in user space; rotated text (axis titles, side labels)
        // belongs to figures and would stretch a column.
        const [v0, v1, v2, v3, v4, v5] = base.transform, [t0, t1, t2, t3, t4, t5] = item.transform;
        const m0 = v0 * t0 + v2 * t1, m1 = v1 * t0 + v3 * t1, m2 = v0 * t2 + v2 * t3, m3 = v1 * t2 + v3 * t3;
        if (Math.abs(m1) > Math.abs(m0) * .1 || Math.abs(m2) > Math.abs(m3) * .1 || m0 <= 0) return [];
        const x = v0 * t4 + v2 * t5 + v4, baseline = v1 * t4 + v3 * t5 + v5;
        const key = `${item.str}|${Math.round(x / 1.5)}|${Math.round(baseline / 1.5)}`;
        if (seen.has(key)) return [];
        seen.add(key);
        const height = Math.max(1, Math.abs(item.height) || Math.abs(m3));
        const style = content.styles[item.fontName];
        const ascent = typeof style?.ascent === "number" ? style.ascent : .8;
        return [{ text: item.str, x, y: baseline - height * ascent, width: Math.abs(item.width), height, fontName: item.fontName, fontFamily: style?.fontFamily ?? "serif", hasEOL: item.hasEOL, baseline, bold: bold.has(item.fontName) || undefined }];
      });
    },
    async getGraphics() {
      graphics ??= readGraphics(page, base);
      return graphics;
    },
    async getLargestImageShare() {
      const { images } = await this.getGraphics!(), area = base.width * base.height || 1;
      return Math.min(1, Math.max(0, ...images.map(image => image.width * image.height / area)));
    },
    async render(canvas, scale, signal) {
      signal.throwIfAborted();
      // Pixel ratio capped by the device, then by a pixel budget per canvas (a zoomed page on a dense screen).
      const viewport = page.getViewport({ scale }), budget = Math.sqrt(maxCanvasPixels() / Math.max(1, viewport.width * viewport.height)), ratio = Math.max(.75, Math.min(canvasRatio(), budget));
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
    const [pdf, worker] = await Promise.all([getLibrary(), getWorker().catch(() => undefined)]); signal?.throwIfAborted();
    const task = pdf.getDocument({ data: new Uint8Array(source), worker, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/", wasmUrl: "/pdfjs/wasm/" });
    const cancel = () => { void task.destroy(); }; signal?.addEventListener("abort", cancel, { once: true });
    try { return documentHandle(await task.promise, () => task.destroy()); }
    catch (error) { await task.destroy(); throw error; }
    finally { signal?.removeEventListener("abort", cancel); }
  }
};

type Matrix = [number, number, number, number, number, number];
const multiply = ([a, b, c, d, e, f]: Matrix, [g, h, i, j, k, l]: Matrix): Matrix => [g * a + h * c, g * b + h * d, i * a + j * c, i * b + j * d, k * a + l * c + e, k * b + l * d + f];
const isMatrix = (value: unknown): value is Matrix => !!value && typeof value === "object" && (value as ArrayLike<number>).length === 6;

/**
 * Walk the page's drawing operators once: an image fills the unit square under the current
 * transform; a path's straight segments that run long and axis-aligned are rules. Everything is
 * mapped through the page viewport, so boxes are in the same top-left points as the text items.
 */
export async function readGraphics(page: PDFPageProxy, viewport: { transform: number[]; width: number; height: number }): Promise<PageGraphics> {
  const pdf = await getLibrary(), operators = await page.getOperatorList(), ops = pdf.OPS;
  const imageOps = new Set([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject]);
  const view = viewport.transform as Matrix, images: Box[] = [], rules: Box[] = [];
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const point = (m: Matrix, x: number, y: number) => { const t = multiply(view, m); return [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]] as const; };
  const boxOf = (corners: (readonly [number, number])[]): Box => { const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]); return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }; };
  const segment = (a: readonly [number, number], b: readonly [number, number]) => {
    const box = boxOf([a, b]);
    if (box.width >= 12 && box.height <= 1.5 || box.height >= 12 && box.width <= 1.5) rules.push(box);
  };
  operators.fnArray.forEach((operation, index) => {
    const args = operators.argsArray[index] as unknown[];
    if (operation === ops.save) stack.push(matrix);
    else if (operation === ops.restore) matrix = stack.pop() ?? matrix;
    else if (operation === ops.transform && isMatrix(args)) matrix = multiply(matrix, [...(args as unknown as number[])] as Matrix);
    else if (operation === ops.paintFormXObjectBegin) { stack.push(matrix); if (isMatrix(args?.[0])) matrix = multiply(matrix, [...(args[0] as number[])] as Matrix); }
    else if (operation === ops.paintFormXObjectEnd) matrix = stack.pop() ?? matrix;
    else if (imageOps.has(operation)) {
      const box = boxOf([point(matrix, 0, 0), point(matrix, 1, 0), point(matrix, 0, 1), point(matrix, 1, 1)]);
      if (box.width > 4 && box.height > 4) images.push(box);
    } else if (operation === ops.constructPath) {
      const data = (args?.[1] as unknown[] | undefined)?.[0];
      if (!data || typeof data !== "object" || typeof (data as ArrayLike<number>).length !== "number") return;
      const path = data as ArrayLike<number>;
      let current: readonly [number, number] | null = null, start: readonly [number, number] | null = null;
      for (let i = 0; i < path.length;) {
        const command = path[i++];
        if (command === 0) { current = start = point(matrix, path[i], path[i + 1]); i += 2; }
        else if (command === 1) { const next = point(matrix, path[i], path[i + 1]); if (current) segment(current, next); current = next; i += 2; }
        else if (command === 2) { current = point(matrix, path[i + 4], path[i + 5]); i += 6; }
        else if (command === 3) { current = point(matrix, path[i + 2], path[i + 3]); i += 4; }
        else if (command === 4) { if (current && start) segment(current, start); current = start; }
        else break;
      }
    }
  });
  return { images, rules };
}
