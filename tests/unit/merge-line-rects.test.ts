import { expect, it } from "vitest";
import { mergeLineRects } from "../../lib/paperflow/anchors/merge-line-rects";

it("joins words and overlapping duplicates while preserving line and column breaks", () => {
  const rects = mergeLineRects([
    { x: 10, y: 10, width: 30, height: 12 },
    { x: 10, y: 10, width: 30, height: 12 },
    { x: 43, y: 10.2, width: 20, height: 12 },
    { x: 10, y: 26, width: 55, height: 12 },
    { x: 120, y: 10, width: 30, height: 12 },
  ]);
  expect(rects).toHaveLength(3);
  expect(rects[0]).toEqual({ x: 10, y: 10, width: 53, height: 12.2 });
  expect(rects.some(r => r.x === 120 && r.width === 30)).toBe(true);
});
