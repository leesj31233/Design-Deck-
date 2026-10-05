/**
 * PAPERFLOW domain types (Phase 1).
 *
 * Coordinate conventions:
 * - `rects` are in PDF user-space points at scale 1, rotation 0, origin top-left
 *   (i.e. pdf.js viewport coordinates with `scale: 1`).
 * - `normalizedRects` are the same rects divided by page width/height (0..1).
 *   They are what the UI renders, so highlights are zoom-independent.
 */

export type Rect = { x: number; y: number; width: number; height: number };

export type TextAnchor = {
  documentId: string;
  pageIndex: number;
  textQuote: string;
  prefix?: string;
  suffix?: string;
  rects: Rect[];
  normalizedRects: Rect[];
  /** Character offsets into the page text model at capture time. Advisory only. */
  textPosition?: { start: number; end: number };
};

export const HIGHLIGHT_COLORS = [
  { id: "yellow", name: "Key finding", swatch: "#ffd60a", fill: "rgba(255, 214, 10, 0.38)" },
  { id: "green", name: "Method", swatch: "#30d158", fill: "rgba(48, 209, 88, 0.30)" },
  { id: "blue", name: "Definition", swatch: "#64d2ff", fill: "rgba(100, 210, 255, 0.36)" },
  { id: "violet", name: "Question", swatch: "#bf5af2", fill: "rgba(191, 90, 242, 0.26)" },
  { id: "red", name: "Contradiction", swatch: "#ff6482", fill: "rgba(255, 100, 130, 0.28)" },
] as const;

export type HighlightColorId = (typeof HIGHLIGHT_COLORS)[number]["id"];

export function highlightColor(id: HighlightColorId) {
  return HIGHLIGHT_COLORS.find((c) => c.id === id) ?? HIGHLIGHT_COLORS[0];
}

export type Highlight = {
  id: string;
  documentId: string;
  anchor: TextAnchor;
  color: HighlightColorId;
  createdAt: number;
  updatedAt: number;
  /**
   * Earlier anchors, kept when the user explicitly accepted a re-anchored
   * position. Recovery itself never rewrites `anchor`.
   */
  previousAnchors?: TextAnchor[];
};

/** How an anchor was resolved against the current page text. */
export type AnchorStatus = "exact" | "quote" | "context" | "fuzzy" | "unresolved";

export type DocumentRecord = {
  id: string;
  title: string;
  fileName: string;
  /** SHA-256 of the original bytes. The binary is never modified after import. */
  sha256: string;
  byteLength: number;
  pageCount?: number;
  source: "bundled-sample" | "local-import";
  /** For bundled samples the binary is fetched from this URL instead of IndexedDB. */
  url?: string;
  importedAt: number;
  lastOpenedAt?: number;
  lastPage?: number;
};

export type ReaderMode = "original" | "hybrid" | "korean";

export type SelectionAction =
  | "translate"
  | "explain"
  | "note"
  | "search-papers"
  | "formula"
  | "compare"
  | "copy-citation";
