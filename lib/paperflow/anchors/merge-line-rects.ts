import type { Rect } from "./types";

/** Join overlapping glyph/word boxes into ink strokes, without crossing columns. */
export function mergeLineRects(rects: Rect[]): Rect[] {
  const strokes: Rect[] = [];
  for (const rect of [...rects].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const stroke = strokes.find(line => {
      const overlap = Math.min(line.y + line.height, rect.y + rect.height) - Math.max(line.y, rect.y);
      const sameLine = overlap >= Math.min(line.height, rect.height) * .72;
      const gap = Math.max(rect.x - line.x - line.width, line.x - rect.x - rect.width);
      return sameLine && gap <= Math.min(line.height, rect.height) * .45;
    });
    if (!stroke) { strokes.push({ ...rect }); continue; }
    const right = Math.max(stroke.x + stroke.width, rect.x + rect.width);
    const bottom = Math.max(stroke.y + stroke.height, rect.y + rect.height);
    stroke.x = Math.min(stroke.x, rect.x); stroke.y = Math.min(stroke.y, rect.y);
    stroke.width = right - stroke.x; stroke.height = bottom - stroke.y;
  }
  return strokes;
}
