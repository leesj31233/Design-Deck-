export type Rect = { x: number; y: number; width: number; height: number };
export type TextAnchor = {
  surface?: "source" | "translation"; paragraphId?: string; sourceQuote?: string;
  version: 1; documentId: string; pageIndex: number; textQuote: string;
  prefix?: string; suffix?: string; rects: Rect[]; normalizedRects: Rect[]; createdAt: string;
};
export type AnchorRecoveryResult =
  | { status: "resolved"; method: "geometry" | "quote" | "context" | "fuzzy"; confidence: number; rects: Rect[] }
  | { status: "unresolved"; reason: string };
export type AnnotationColor = "yellow" | "green" | "blue" | "pink" | "purple";
export const annotationColors: AnnotationColor[] = ["yellow", "green", "blue", "pink", "purple"];
export type Annotation = {
  points?: { x: number; y: number }[];
  id: string; type: "highlight" | "ink" | "note"; documentId: string; pageIndex: number; color: AnnotationColor;
  anchor: TextAnchor; note?: string; createdAt: string; updatedAt: string;
  resolutionStatus: "resolved" | "unresolved";
};
