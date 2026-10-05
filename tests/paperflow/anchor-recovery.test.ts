import { describe, expect, it } from "vitest";
import { createTextAnchor, fuzzyFind, normalizeForMatch, resolveAnchor, type RangeMeasurer } from "@/lib/paperflow/anchors/anchor";
import { mergeLineRects, rectsMatch } from "@/lib/paperflow/anchors/geometry";

const PAGE =
  "2. Numerical method. A realizable k-ε turbulence model was selected to calculate the effect of turbulence in the boiler. " +
  "Particle trajectories of torrefied EFB were tracked with the DPM. NOx formation was evaluated as a post-process. " +
  "The heat flux to the furnace wall increased as the co-firing ratio increased.";

const W = 600;
const H = 800;
/** Fake layout: one character = 5pt wide, 70 characters per line, 12pt line height. */
function layout(offsetY = 0): RangeMeasurer {
  return (start, end) => {
    const rects = [];
    for (let i = start; i < end; i++) {
      const line = Math.floor(i / 70);
      rects.push({ x: (i % 70) * 5 + 40, y: line * 12 + 60 + offsetY, width: 5, height: 10 });
    }
    return mergeLineRects(rects).map((r) => ({ x: r.x / W, y: r.y / H, width: r.width / W, height: r.height / H }));
  };
}

function anchorFor(text: string, quote: string, occurrence = 0) {
  let start = -1;
  for (let i = 0; i <= occurrence; i++) start = text.indexOf(quote, start + 1);
  const end = start + quote.length;
  const normalized = layout()(start, end);
  const rects = normalized.map((r) => ({ x: r.x * W, y: r.y * H, width: r.width * W, height: r.height * H }));
  return createTextAnchor({ documentId: "doc", pageIndex: 0, pageText: text, start, end, rects, pageWidth: W, pageHeight: H });
}

describe("createTextAnchor", () => {
  it("captures quote, context and normalized geometry", () => {
    const a = anchorFor(PAGE, "realizable k-ε turbulence model");
    expect(a.textQuote).toBe("realizable k-ε turbulence model");
    expect(a.prefix?.endsWith("Numerical method. A ")).toBe(true);
    expect(a.suffix?.startsWith(" was selected")).toBe(true);
    expect(a.normalizedRects[0].x).toBeCloseTo(a.rects[0].x / W, 4);
  });
});

describe("resolveAnchor — recovery order", () => {
  it("1. exact geometry when text and layout are unchanged", () => {
    const a = anchorFor(PAGE, "torrefied EFB");
    const r = resolveAnchor(a, { text: PAGE, measure: layout() });
    expect(r.status).toBe("exact");
    expect(r.relocated).toBe(false);
    expect(r.normalizedRects).toEqual(a.normalizedRects);
  });

  it("flags re-measured geometry when the layout moved but text did not", () => {
    const a = anchorFor(PAGE, "torrefied EFB");
    const r = resolveAnchor(a, { text: PAGE, measure: layout(40) });
    expect(r.status).toBe("quote");
    expect(r.relocated).toBe(true);
  });

  it("2. exact quote when text shifted on the page", () => {
    const a = anchorFor(PAGE, "torrefied EFB");
    const shifted = "Inserted header line. " + PAGE;
    const r = resolveAnchor(a, { text: shifted, measure: layout() });
    expect(r.status).toBe("quote");
    expect(shifted.slice(r.start, r.end)).toBe("torrefied EFB");
    expect(r.relocated).toBe(true);
  });

  it("3. prefix/suffix disambiguates repeated quotes", () => {
    const text = "Case A: co-firing ratio of 10%. Case B: co-firing ratio of 20%. Case C: co-firing ratio of 30%.";
    const a = anchorFor(text, "co-firing ratio", 1);
    const shifted = "Note. " + text;
    const r = resolveAnchor(a, { text: shifted });
    expect(r.status).toBe("context");
    expect(shifted.slice((r.end ?? 0), (r.end ?? 0) + 8)).toBe(" of 20%.");
  });

  it("4. fuzzy local match on whitespace / hyphenation drift, flagged for review", () => {
    const a = anchorFor(PAGE, "heat flux to the furnace wall increased");
    const drifted = PAGE.replace("heat flux to the furnace wall", "heat flux to the fur-\nnace  wall");
    const r = resolveAnchor(a, { text: drifted });
    expect(r.status).toBe("fuzzy");
    expect(r.relocated).toBe(true);
    expect(r.matchedText).toContain("fur-\nnace");
  });

  it("4. fuzzy local match tolerates small edits", () => {
    const a = anchorFor(PAGE, "NOx formation was evaluated as a post-process");
    const edited = PAGE.replace("NOx formation was evaluated", "NOx formation were evaluated");
    const r = resolveAnchor(a, { text: edited });
    expect(r.status).toBe("fuzzy");
    expect(r.matchedText).toMatch(/NOx formation were evaluated as a post-process/);
  });

  it("repeated quote with identical context falls to fuzzy (never silent)", () => {
    const text = "the same sentence. the same sentence. the same sentence.";
    const a = anchorFor(text, "same sentence", 1);
    const changed = "x " + text.replace("the same sentence. the same sentence. the same sentence.", "the same sentence. the same sentence. the same sentence.");
    a.prefix = "";
    a.suffix = "";
    const r = resolveAnchor(a, { text: changed });
    expect(r.status).toBe("fuzzy");
  });

  it("5. unresolved when the passage is gone", () => {
    const a = anchorFor(PAGE, "Particle trajectories of torrefied EFB were tracked with the DPM.");
    const r = resolveAnchor(a, { text: "Completely different page content about steam cycles." });
    expect(r.status).toBe("unresolved");
    expect(r.normalizedRects).toBeUndefined();
  });
});

describe("matching helpers", () => {
  it("normalizeForMatch maps back to original indices", () => {
    const n = normalizeForMatch("ﬁ  rst  Line");
    expect(n.value).toBe("fi rst line");
    expect(n.map[0]).toBe(0);
    expect(n.map[n.value.length - 1]).toBe(11);
  });

  it("fuzzyFind rejects distant / too-different text", () => {
    expect(fuzzyFind("boiler efficiency improved", "radiation heat transfer coefficient")).toBeNull();
  });

  it("rectsMatch uses tolerance and both directions", () => {
    const a = [{ x: 0.1, y: 0.1, width: 0.2, height: 0.02 }];
    expect(rectsMatch(a, [{ x: 0.102, y: 0.1, width: 0.2, height: 0.02 }])).toBe(true);
    expect(rectsMatch(a, [...a, { x: 0.5, y: 0.5, width: 0.1, height: 0.02 }])).toBe(false);
  });

  it("mergeLineRects merges per-glyph rects on one line and keeps lines separate", () => {
    const merged = mergeLineRects([
      { x: 0, y: 0, width: 5, height: 10 },
      { x: 5, y: 0, width: 5, height: 10 },
      { x: 0, y: 12, width: 5, height: 10 },
      { x: 1, y: 1, width: 2, height: 2 },
    ]);
    expect(merged).toEqual([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 0, y: 12, width: 5, height: 10 },
    ]);
  });
});
