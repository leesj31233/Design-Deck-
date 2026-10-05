/** Geometry is normalized to the page (0–1) unless a field says pt. */
export interface ParagraphLine { x: number; y: number; width: number; height: number }
export type ParagraphKind = "body" | "title" | "caption" | "skip";

export interface PdfParagraph {
  id: string; pageIndex: number; text: string; kind: ParagraphKind;
  x: number; y: number; width: number; height: number; lines: ParagraphLine[];
  fontFamily: string; fontWeight: number; fontStyle: string; color?: string;
  /** Dominant glyph size in pt (PDF text matrix height). */
  fontSize?: number;
  /** Baseline-to-baseline distance in pt. */
  pitch?: number;
  /** First-line indent in pt relative to the block's body lines. */
  indent?: number;
  /** Text column this block belongs to, normalized. */
  column?: { left: number; right: number };
  /** Analyzer hint that the block reads as the abstract/front matter of page 1. */
  hint?: "title" | "front-matter" | "label" | "keywords" | "figure-text" | "table" | "equation" | "furniture" | "run-in-heading";
  /** Share of the text set in a fixed-width (code) face. */
  mono?: number;
  /** Page areas to hide with the translation (a drop cap beside the first lines), normalized. */
  extraMasks?: ParagraphLine[];
  /** A table cell's whole box between its rules (or its neighbours), normalized: the translation stays inside it. */
  cell?: { x: number; y: number; width: number; height: number; align?: "left" | "center" };
  /** Raw visual lines, used for keyword extraction only. */
  lineTexts?: string[];
  /** Tokens printed with sub/superscripts and the count of raised citations; folded into the manifest. */
  marks?: string[]; raised?: number;
}

export interface PageSize {
  width: number; height: number;
  /** Pictures (normalized) the translated text must not cover. */
  images?: { x: number; y: number; width: number; height: number }[];
  /** Ruled tables (normalized): their cells stay as printed. */
  tables?: { x: number; y: number; width: number; height: number }[];
}
