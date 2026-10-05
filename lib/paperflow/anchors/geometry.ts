import type { Rect } from "../types";

/** Drop degenerate rects, remove rects contained in others and merge rects on the same line. */
export function mergeLineRects(input: Rect[], tolerance = 1): Rect[] {
  const rects = input
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const withoutContained = rects.filter(
    (r, i) => !rects.some((o, j) => j !== i && contains(o, r, tolerance) && !(contains(r, o, tolerance) && j > i)),
  );

  const merged: Rect[] = [];
  for (const rect of withoutContained) {
    const last = merged[merged.length - 1];
    if (last && sameLine(last, rect, tolerance) && rect.x <= last.x + last.width + rect.height * 0.6) {
      const x = Math.min(last.x, rect.x);
      const y = Math.min(last.y, rect.y);
      const right = Math.max(last.x + last.width, rect.x + rect.width);
      const bottom = Math.max(last.y + last.height, rect.y + rect.height);
      merged[merged.length - 1] = { x, y, width: right - x, height: bottom - y };
    } else {
      merged.push({ ...rect });
    }
  }
  return merged;
}

function contains(outer: Rect, inner: Rect, t: number) {
  return (
    inner.x >= outer.x - t &&
    inner.y >= outer.y - t &&
    inner.x + inner.width <= outer.x + outer.width + t &&
    inner.y + inner.height <= outer.y + outer.height + t
  );
}

function sameLine(a: Rect, b: Rect, t: number) {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap >= Math.min(a.height, b.height) * 0.5 - t;
}

export function normalizeRects(rects: Rect[], pageWidth: number, pageHeight: number): Rect[] {
  return rects.map((r) => ({
    x: round(r.x / pageWidth),
    y: round(r.y / pageHeight),
    width: round(r.width / pageWidth),
    height: round(r.height / pageHeight),
  }));
}

export function denormalizeRects(rects: Rect[], pageWidth: number, pageHeight: number): Rect[] {
  return rects.map((r) => ({ x: r.x * pageWidth, y: r.y * pageHeight, width: r.width * pageWidth, height: r.height * pageHeight }));
}

function round(n: number) {
  return Math.round(n * 1e5) / 1e5;
}

/**
 * Two normalized rect lists describe the same geometry when every rect has a
 * counterpart within `tolerance` (fraction of the page) on every edge.
 */
export function rectsMatch(a: Rect[], b: Rect[], tolerance = 0.006): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const near = (r: Rect, o: Rect) =>
    Math.abs(r.x - o.x) <= tolerance &&
    Math.abs(r.y - o.y) <= tolerance &&
    Math.abs(r.x + r.width - (o.x + o.width)) <= tolerance &&
    Math.abs(r.y + r.height - (o.y + o.height)) <= tolerance;
  return a.every((r) => b.some((o) => near(r, o))) && b.every((r) => a.some((o) => near(r, o)));
}

export function boundingRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}
