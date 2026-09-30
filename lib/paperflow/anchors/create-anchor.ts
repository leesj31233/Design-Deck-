import { normalizeRect } from "./geometry";
import type { Rect, TextAnchor } from "./types";
export const normalizeQuote = (text: string) => text.replace(/\s+/gu, " ").trim();
export function createTextAnchor(input: { documentId: string; pageIndex: number; textQuote: string; prefix?: string; suffix?: string; rects: Rect[]; width: number; height: number }): TextAnchor {
  if (!normalizeQuote(input.textQuote) || !input.rects.length || !Number.isInteger(input.pageIndex) || input.pageIndex < 0) throw new Error("유효한 원문을 선택해 주세요.");
  return { version: 1, documentId: input.documentId, pageIndex: input.pageIndex, textQuote: input.textQuote, prefix: input.prefix?.slice(-80), suffix: input.suffix?.slice(0, 80), rects: input.rects, normalizedRects: input.rects.map(r => normalizeRect(r, input.width, input.height)), createdAt: new Date().toISOString() };
}
