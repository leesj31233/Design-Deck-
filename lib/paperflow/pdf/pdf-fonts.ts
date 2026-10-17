import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

interface Face { family: string; weight: number; url: string; ranges: [number, number][] }

/* eslint-disable @typescript-eslint/no-explicit-any -- fontkit internals are untyped */
/**
 * fontkit subsets a TrueType font by copying each glyph's bytes through the `loca` table, but a
 * WOFF2 font stores `glyf` transformed and has no `loca`: every glyph comes out empty. For WOFF2
 * fonts, write each glyph record from its decoded points instead (hinting dropped; PDF needs none).
 * fontkit's own path re-encoder is not used: it corrupts some outlines into long spikes.
 */
type Point = { x: number; y: number; onCurve: boolean; endContour: boolean };
function simpleGlyph(points: Point[], empty: any) {
  const contours = points.flatMap((point, index) => point.endContour ? [index] : []);
  const xs = points.map(point => Math.round(point.x)), ys = points.map(point => Math.round(point.y));
  // Header, end points, no instructions, one flag per point, then 16-bit x and y deltas.
  const length = 10 + contours.length * 2 + 2 + points.length * 5, out = empty.constructor.alloc(length + (length % 2));
  let at = 0;
  const int16 = (value: number) => { out.writeInt16BE(value, at); at += 2; };
  int16(contours.length); int16(Math.min(...xs)); int16(Math.min(...ys)); int16(Math.max(...xs)); int16(Math.max(...ys));
  for (const end of contours) { out.writeUInt16BE(end, at); at += 2; }
  out.writeUInt16BE(0, at); at += 2;
  for (const point of points) out.writeUInt8(point.onCurve ? 1 : 0, at++);
  xs.forEach((x, index) => int16(x - (index ? xs[index - 1] : 0)));
  ys.forEach((y, index) => int16(y - (index ? ys[index - 1] : 0)));
  return out;
}
let woff2SubsetPatched = false;
function patchWoff2Subset(sample: Uint8Array) {
  if (woff2SubsetPatched) return;
  const proto = Object.getPrototypeOf((fontkit as any).create(sample).createSubset());
  const original = proto._addGlyph;
  proto._addGlyph = function (this: any, gid: number) {
    if (this.font.directory?.tag !== "wOF2") return original.call(this, gid);
    const glyph = this.font.getGlyph(gid), decoded = glyph._decode(), empty = this.font._getTableStream("glyf").readBuffer(0);
    // WOFF2 glyphs arrive decoded: simple outlines carry their points (composites do not occur in these slices).
    let points: Point[] = decoded?.points ?? [];
    // A variable font's decoded points are its default instance (Noto Serif KR: weight 200);
    // apply the weight this font was embedded for, as the browser does.
    const processor = this.font._variationProcessor;
    if (points.length && processor) {
      const Point = (points[0] as any).constructor;
      const varied = points.map(point => new Point(point.onCurve, point.endContour, point.x, point.y));
      // Four phantom points close the list, each its own contour, as fontkit builds them.
      try { processor.transformPoints(gid, [...varied, ...[0, 1, 2, 3].map(() => new Point(false, true, 0, 0))]); points = varied; }
      catch (error) { console.warn("PAPERFLOW: glyph weight variation failed", gid, error); }
    }
    const buffer = points.length && decoded.numberOfContours > 0 ? simpleGlyph(points, empty) : empty;
    this.glyf.push(buffer);
    this.loca.offsets.push(this.offset);
    this.hmtx.metrics.push({ advance: glyph.advanceWidth, bearing: glyph._getMetrics().leftBearing });
    this.offset += buffer.length;
    return this.glyf.length - 1;
  };
  woff2SubsetPatched = true;
}
/** fontkit for pdf-lib that opens a variable font at the weight its bytes were registered with. */
const weights = new WeakMap<Uint8Array, number>();
const weightedFontkit = { create(bytes: Uint8Array, name?: string) { const font = (fontkit as any).create(bytes, name); const weight = weights.get(bytes); if (weight && font.fvar) font.variationCoords = [weight]; return font; } };
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Width as drawn: pdf-lib draws a string glyph after glyph without kerning, but its
 * `widthOfTextAtSize` applies kerning pairs (AT, LA, VO…), which would eat the next word space.
 */
export function advance(font: PDFFont, text: string, size: number) {
  let width = 0;
  for (const char of text) width += font.widthOfTextAtSize(char, size);
  return width;
}

/** The self-hosted Noto Serif KR slices (`next/font`) as declared by the page's @font-face rules. */
function koreanFaces(): Face[] {
  const faces: Face[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue("font-family").replace(/["']/g, "").trim();
      if (!/noto serif kr/i.test(family)) continue;
      // `src` is relative to the stylesheet (…/chunks/x.css → ../media/y.woff2), not to the page.
      const relative = rule.style.getPropertyValue("src").match(/url\(["']?([^"')]+)["']?\)/)?.[1];
      const url = relative && new URL(relative, sheet.href ?? location.href).href;
      const ranges = (rule.style.getPropertyValue("unicode-range") || "U+0-10FFFF").split(",").map(part => {
        const [from, to] = part.trim().replace(/^U\+/i, "").split("-");
        const start = parseInt(from.replace(/\?/g, "0"), 16), end = to ? parseInt(to, 16) : parseInt(from.replace(/\?/g, "F"), 16);
        return [start, end] as [number, number];
      });
      if (url) faces.push({ family, weight: Number(rule.style.getPropertyValue("font-weight")) || 400, url, ranges });
    }
  }
  return faces;
}

/**
 * Fonts for real, selectable PDF text. Latin uses the PDF base Times / Helvetica (the reader's
 * Times New Roman / Arial metrics); everything else uses the matching Noto Serif KR slice,
 * embedded as a subset only when the text needs it.
 */
export class PdfFontBook {
  private standard = new Map<string, PDFFont>();
  private latin = new Set<number>();
  private faces = koreanFaces();
  private loaded = new Map<string, PDFFont>();

  private constructor(private doc: PDFDocument) {}

  static async create(doc: PDFDocument) {
    doc.registerFontkit(weightedFontkit as unknown as typeof fontkit);
    const book = new PdfFontBook(doc);
    for (const name of [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.Helvetica, StandardFonts.HelveticaBold]) book.standard.set(name, await doc.embedFont(name));
    for (const code of book.standard.get(StandardFonts.TimesRoman)!.getCharacterSet()) book.latin.add(code);
    return book;
  }

  private face(code: number, bold: boolean) {
    const covering = this.faces.filter(face => face.ranges.some(([from, to]) => code >= from && code <= to));
    return covering.find(face => face.weight === (bold ? 700 : 400)) ?? covering[0];
  }
  /** next/font serves one variable file for every weight: the key includes the weight. */
  private key(code: number, bold: boolean) { const face = this.face(code, bold); return face && { url: face.url, weight: bold ? 700 : 400, id: `${face.url}|${bold ? 700 : 400}` }; }

  /** Load every slice this text needs, so drawing can stay synchronous. */
  async prepare(text: string, bold: boolean) {
    const wanted = new Map<string, { url: string; weight: number }>();
    for (const char of new Set(text)) {
      const code = char.codePointAt(0)!;
      if (char.trim() && !this.latin.has(code)) { const key = this.key(code, bold); if (key) wanted.set(key.id, key); }
    }
    await Promise.all([...wanted].filter(([id]) => !this.loaded.has(id)).map(async ([id, { url, weight }]) => {
      // A slice that cannot be loaded leaves its characters out instead of failing the export.
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const bytes = new Uint8Array(await response.arrayBuffer());
        patchWoff2Subset(bytes);
        weights.set(bytes, weight);
        this.loaded.set(id, await this.doc.embedFont(bytes, { subset: true }));
      } catch (error) { console.warn("PAPERFLOW: PDF font slice unavailable", url, error); }
    }));
  }

  /** Font for one character; undefined when no font has it (the character is skipped). */
  fontFor(char: string, bold: boolean, sans = false): PDFFont | undefined {
    const code = char.codePointAt(0)!;
    if (this.latin.has(code) || char === " ") return this.standard.get(sans ? (bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica) : bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman);
    const key = this.key(code, bold);
    return key ? this.loaded.get(key.id) : undefined;
  }

  /** Split text into runs of one font. */
  runs(text: string, bold: boolean, sans = false) {
    const out: { text: string; font: PDFFont }[] = [];
    for (const char of text) {
      const font = this.fontFor(char, bold, sans);
      if (!font) continue;
      const last = out.at(-1);
      if (last && last.font === font) last.text += char; else out.push({ text: char, font });
    }
    return out;
  }

  width(text: string, size: number, bold: boolean, sans = false) {
    return this.runs(text, bold, sans).reduce((sum, run) => sum + advance(run.font, run.text, size), 0);
  }

  /** Base Times for the invisible source-text layer. */
  get times() { return this.standard.get(StandardFonts.TimesRoman)!; }
  hasLatin(code: number) { return this.latin.has(code); }
}
