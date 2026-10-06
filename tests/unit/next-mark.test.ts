import { describe, expect, it } from "vitest";
import { nextMark } from "@/lib/paperflow/guide/next-mark";

const marks = [{ page: 0, key: "a", screenY: 100 }, { page: 0, key: "b", screenY: 400 }, { page: 1, key: "c", screenY: 900 }, { page: 1, key: "d", screenY: -300 }];

describe("guide highlight navigation", () => {
  it("finds the next highlight below and the previous one above the reading line", () => {
    expect(nextMark(marks, 300, 1)?.key).toBe("b");
    expect(nextMark(marks, 300, -1)?.key).toBe("a");
    expect(nextMark(marks, 50, -1)?.key).toBe("d");
    expect(nextMark(marks, 1000, 1)).toBeNull();
    expect(nextMark(marks, -500, -1)).toBeNull();
  });
  it("treats a mark within 6px of the line as reached, so repeated presses advance", () => {
    expect(nextMark(marks, 397, 1)?.key).toBe("c");
    expect(nextMark(marks, 405, -1)?.key).toBe("a");
    expect(nextMark(marks, 393, 1)?.key).toBe("b");
  });
  it("returns null without marks", () => {
    expect(nextMark([], 0, 1)).toBeNull();
    expect(nextMark([], 0, -1)).toBeNull();
  });
});
