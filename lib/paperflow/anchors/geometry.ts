import type { Rect } from "./types";
export function validRect(r: Rect, width = 1, height = 1): boolean {
  return !!r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 && r.x + r.width <= width + 0.00001 && r.y + r.height <= height + 0.00001;
}
export function clientRectToPageRect(rect: Rect, page: Rect): Rect {
  return { x: rect.x - page.x, y: rect.y - page.y, width: rect.width, height: rect.height };
}
export function normalizeRect(rect: Rect, width: number, height: number): Rect {
  if (width <= 0 || height <= 0 || !validRect(rect, width, height)) throw new Error("선택 영역이 페이지 범위를 벗어났습니다.");
  return { x: rect.x / width, y: rect.y / height, width: rect.width / width, height: rect.height / height };
}
export function unionRects(rects: Rect[]): Rect {
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
  return { x, y, width: Math.max(...rects.map(r => r.x + r.width)) - x, height: Math.max(...rects.map(r => r.y + r.height)) - y };
}
