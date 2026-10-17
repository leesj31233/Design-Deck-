import { describe, expect, it } from "vitest";
import { createTextAnchor, normalizeQuote } from "@/lib/paperflow/anchors/create-anchor";
import { clientRectToPageRect, normalizeRect } from "@/lib/paperflow/anchors/geometry";
import { recoverAnchor, recoverByQuote, recoverByContext } from "@/lib/paperflow/anchors/recover-anchor";
import type { TextAnchor } from "@/lib/paperflow/anchors/types";
const rect = { x: .1, y: .2, width: .4, height: .02 };
const anchor: TextAnchor = { version: 1, documentId: "paper", pageIndex: 0, textQuote: "coal co-firing", prefix: "study of", suffix: "in boilers", rects: [], normalizedRects: [rect], createdAt: "2026-09-23" };
const page = { documentId: "paper", pageIndex: 0, text: "A study of coal co-firing in boilers", rectsFor: () => [rect] };
describe("selection geometry", () => {
  it("converts client coordinates at scrolled page origin", () => { expect(clientRectToPageRect({ x: 150, y: 270, width: 80, height: 12 }, { x: 100, y: 200, width: 500, height: 700 })).toEqual({ x: 50, y: 70, width: 80, height: 12 }); });
  it("normalizes geometry independently of zoom", () => { expect(normalizeRect({ x: 50, y: 100, width: 200, height: 10 }, 500, 500)).toEqual(rect); });
  it.each([{ x: -1, y: 1, width: 10, height: 10 }, { x: 90, y: 0, width: 20, height: 1 }, { x: NaN, y: 0, width: 1, height: 1 }])("rejects off-page or corrupt geometry", rect => expect(() => normalizeRect(rect, 100, 100)).toThrow());
  it("creates multiline anchors retaining distinct rects and original quote", () => {
    const result = createTextAnchor({ documentId: "paper", pageIndex: 2, textQuote: "coal\nco-firing", prefix: "A study of ", rects: [{ x: 10, y: 10, width: 40, height: 10 }, { x: 10, y: 25, width: 60, height: 10 }], width: 100, height: 100 });
    expect(result.normalizedRects).toHaveLength(2); expect(result.textQuote).toBe("coal\nco-firing"); expect(result.pageIndex).toBe(2);
  });
  it("rejects collapsed and empty selections", () => expect(() => createTextAnchor({ documentId: "paper", pageIndex: 0, textQuote: " ", rects: [], width: 100, height: 100 })).toThrow());
});
describe("deterministic anchor recovery", () => {
  it("normalizes whitespace", () => expect(normalizeQuote("  coal\n\tco-firing  ")).toBe("coal co-firing"));
  it("prefers stored valid geometry", () => expect(recoverAnchor(anchor, page)).toMatchObject({ status: "resolved", method: "geometry", confidence: 1 }));
  it("falls back from corrupt stored rect to exact quote", () => expect(recoverAnchor({ ...anchor, normalizedRects: [{ ...rect, x: NaN }] }, page)).toMatchObject({ status: "resolved", method: "quote" }));
  it("recovers unique normalized quote", () => expect(recoverByQuote("heat\n flux was measured", "heat flux")).toBe(0));
  it("does not choose the first repeated quote", () => expect(recoverByQuote("coal coal", "coal")).toBeNull());
  it("uses prefix/suffix to disambiguate duplicate quote", () => { expect(recoverByContext("first coal condition. second coal result", "coal", "second", "result")).toBe(29); });
  it("keeps identical repeated contexts unresolved", () => expect(recoverAnchor({ ...anchor, textQuote: "coal", prefix: "", suffix: "", normalizedRects: [] }, { ...page, text: "coal coal" })).toMatchObject({ status: "unresolved" }));
  it("does not cross document/page boundaries even with valid geometry", () => { expect(recoverAnchor(anchor, { ...page, pageIndex: 1 }).status).toBe("unresolved"); expect(recoverAnchor(anchor, { ...page, documentId: "other" }).status).toBe("unresolved"); });
  it("reports missing DOM geometry as unresolved", () => expect(recoverAnchor({ ...anchor, normalizedRects: [] }, { ...page, rectsFor: () => [] }).status).toBe("unresolved"));
  it("allows high-confidence fuzzy match within unique local context", () => {
    const quote = "The realizable turbulence model predicts heat flux";
    expect(recoverAnchor({ ...anchor, normalizedRects: [], textQuote: quote, prefix: "Introduction:", suffix: "Conclusion." }, { ...page, text: `Introduction: ${quote.replace("predicts", "predict")} Conclusion.` })).toMatchObject({ status: "resolved", method: "fuzzy" });
  });
  it("rejects low-confidence fuzzy result and missing context", () => {
    const base = { ...anchor, normalizedRects: [], textQuote: "The realizable turbulence model predicts heat flux", prefix: "Introduction:", suffix: "Conclusion." };
    expect(recoverAnchor(base, { ...page, text: "Introduction: A different model determines combustion completely Conclusion." }).status).toBe("unresolved");
    expect(recoverAnchor({ ...base, prefix: "" }, page).status).toBe("unresolved");
  });
});
