import type { PdfPageHandle, PdfTextItem } from "./pdf-adapter";

/**
 * OCR for scanned pages and pages whose embedded text is unusable (fonts without a Unicode map).
 * Runs entirely in the browser with Tesseract (no server, no per-page cost): the page is rendered
 * at about 170 dpi, recognised, and every line comes back as a text item in page points, so the
 * normal layout analysis builds paragraphs from it exactly as from a born-digital PDF.
 */
type Box = { x0: number; y0: number; x1: number; y1: number };
export type OcrLine = { words: { text: string; confidence: number; bbox: Box }[]; bbox: Box; baseline?: Box & { has_baseline: boolean }; rowAttributes?: { ascenders: number; descenders: number; row_height: number } };
type OcrWorker = { recognize: (image: HTMLCanvasElement, options?: object, output?: object) => Promise<{ data: { blocks: { paragraphs: { lines: OcrLine[] }[] }[] | null } }>; terminate: () => Promise<unknown> };
let worker: Promise<OcrWorker> | null = null, workerLanguages = "";
const SCALE = 2.4;

/**
 * The recogniser for the paper's script: English alone reads a Japanese slide as "PREIREA SHEEN", so a
 * document whose text shows kana, Chinese or Hangul is read with that language model (plus English for
 * the Latin terms inside it). Switching languages starts a new recogniser.
 */
async function getWorker(languages = "eng"): Promise<OcrWorker> {
  if (worker && workerLanguages !== languages) { const old = worker; worker = null; void old.then(current => current.terminate()).catch(() => undefined); }
  workerLanguages = languages;
  worker ??= import("tesseract.js").then(({ createWorker }) => createWorker(languages) as unknown as Promise<OcrWorker>);
  return worker;
}
/** Tesseract language codes for the script a document is written in. */
export function ocrLanguages(sample: string) {
  const kana = (sample.match(/[぀-ヿ]/g) ?? []).length, han = (sample.match(/[一-鿿]/g) ?? []).length, hangul = (sample.match(/[가-힣]/g) ?? []).length;
  // Kana occur only in Japanese; a few among the kanji settle it.
  if (kana >= 3 && kana + han >= 10) return "jpn+eng";
  if (hangul >= 30) return "kor+eng";
  if (han >= 30) return "chi_sim+eng";
  return "eng";
}
/** Free the recogniser (a few hundred MB of memory) once a paper is done. */
export async function releaseOcr() { const current = worker; worker = null; if (current) await (await current).terminate().catch(() => undefined); }

export async function ocrPage(page: PdfPageHandle, signal?: AbortSignal, languages = "eng"): Promise<PdfTextItem[]> {
  const canvas = document.createElement("canvas"), controller = new AbortController();
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    // render() multiplies by the screen's pixel ratio; OCR needs a fixed ~170 dpi, not a 4x phone canvas.
    await page.render(canvas, SCALE / Math.min(window.devicePixelRatio || 1, 2), controller.signal);
    const recogniser = await getWorker(languages);
    signal?.throwIfAborted();
    const { data } = await recogniser.recognize(canvas, {}, { blocks: true });
    // The canvas may carry the device pixel ratio on top of the scale: convert pixels back to points.
    const toPoints = page.width / canvas.width;
    const items: PdfTextItem[] = [];
    for (const block of data.blocks ?? []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) items.push(...ocrLineItems(line, toPoints));
    return items;
  } finally { canvas.width = canvas.height = 0; }
}

/**
 * One OCR line as one text item: a shared size and baseline (per-word boxes would make "a" or "is"
 * look like subscripts), split only at wide gaps so table cells and side-by-side labels stay apart.
 * Lines Tesseract is unsure of (figure art, screenshots) are dropped instead of sent to translation.
 */
export function ocrLineItems(line: OcrLine, toPoints: number): PdfTextItem[] {
  const words = line.words.filter(word => word.text.trim() && word.confidence >= 35);
  if (!words.length || words.reduce((sum, word) => sum + word.confidence, 0) / words.length < 50) return [];
  const row = line.rowAttributes, bboxHeight = line.bbox.y1 - line.bbox.y0;
  const sizePx = row && row.row_height > 0 ? Math.min(bboxHeight * 1.15, row.row_height + Math.abs(row.descenders || 0)) : bboxHeight;
  const baselineAt = (x: number) => line.baseline?.has_baseline && line.baseline.x1 > line.baseline.x0 ? line.baseline.y0 + (line.baseline.y1 - line.baseline.y0) * Math.min(1, Math.max(0, (x - line.baseline.x0) / (line.baseline.x1 - line.baseline.x0))) : line.bbox.y1 - sizePx * .2;
  const runs: typeof words[] = [];
  for (const word of words) {
    const run = runs.at(-1), last = run?.at(-1);
    if (run && last && word.bbox.x0 - last.bbox.x1 < sizePx * 1.4) run.push(word); else runs.push([word]);
  }
  return runs.map((run, index) => {
    const x0 = run[0].bbox.x0, x1 = run.at(-1)!.bbox.x1, base = baselineAt((x0 + x1) / 2), size = Math.max(1, sizePx * toPoints);
    // Chinese and Japanese are written without spaces: recognised characters join directly.
    const text = run.map(word => word.text).reduce((joined, word) => !joined ? word : CJK_END.test(joined) && CJK_START.test(word) ? joined + word : `${joined} ${word}`, "");
    return { text, x: x0 * toPoints, y: base * toPoints - size * .8, width: Math.max(1, (x1 - x0) * toPoints), height: size, fontName: "ocr", fontFamily: "serif", hasEOL: index === runs.length - 1, baseline: base * toPoints };
  });
}

const CJK_END = /[　-ヿ一-鿿＀-￯]$/, CJK_START = /^[　-ヿ一-鿿＀-￯]/;
const LETTER = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ぀-ヿ一-鿿가-힣]/g;
/** What the embedded text of a page is worth: empty, garbled (no usable Unicode) or fine. */
export function textHealth(items: PdfTextItem[]) {
  const text = items.map(item => item.text).join("").replace(/\s/g, "");
  const odd = (text.match(/[-�]/g) ?? []).length, letters = (text.match(LETTER) ?? []).length;
  if (text.length < 80) return "empty" as const;
  // Numbers, punctuation and symbols are text too (a page of tables is not garbled); fonts without a
  // Unicode map show up as private-use / replacement glyphs or control characters instead.
  const readable = letters + (text.match(/[\d\p{P}\p{S}]/gu) ?? []).length;
  const control = (text.match(/\p{Cc}/gu) ?? []).length;
  return odd > text.length * .05 || control > text.length * .05 || readable < text.length * .6 ? "garbled" as const : "ok" as const;
}
export const letterCount = (items: PdfTextItem[]) => items.reduce((sum, item) => sum + (item.text.match(LETTER) ?? []).length, 0);
