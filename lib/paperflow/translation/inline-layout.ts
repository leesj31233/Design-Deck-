import type { ParagraphLine } from "./paragraphs";

export interface FlowRegion { x: number; y: number; width: number; height: number }
export interface TranslatedLine { region: number; text: string; y: number }

/** Preserve the text contour: an abstract wrapping an illustration is not a rectangle. */
export function paragraphRegions(lines: ParagraphLine[]): FlowRegion[] {
  const regions: FlowRegion[] = [];
  for (const line of lines) {
    const previous = regions.at(-1);
    const expands = previous && line.x + line.width > previous.x + previous.width + Math.max(previous.width * .15, line.height * 4);
    const shifts = previous && Math.abs(line.x - previous.x) > line.height * 2;
    if (!previous || expands || shifts || line.y < previous.y) regions.push({ ...line });
    else {
      const right = Math.max(previous.x + previous.width, line.x + line.width);
      previous.x = Math.min(previous.x, line.x); previous.width = right - previous.x;
      previous.height = Math.max(previous.height, line.y + line.height - previous.y);
    }
  }
  return regions;
}

type Measure = (text: string, fontSize: number) => number;
/** Fit Korean at natural tracking and consistent leading, never stretch glyphs. */
export function layoutTranslation(text: string, regions: FlowRegion[], originalSize: number, measure: Measure) {
  const source = text.replace(/\s+/g, " ").trim();
  const minimum = 1;
  const attempt = (fontSize: number) => {
    const lineHeight = fontSize * 1.18, result: TranslatedLine[] = [];
    let remaining = source;
    regions.forEach((region, regionIndex) => {
      const count = Math.max(1, Math.floor((region.height + fontSize * .15) / lineHeight));
      for (let row = 0; row < count && remaining; row++) {
        let low = 1, high = remaining.length, length = 0;
        while (low <= high) { const middle = Math.floor((low + high) / 2); if (measure(remaining.slice(0, middle), fontSize) <= region.width) { length = middle; low = middle + 1; } else high = middle - 1; }
        length = Math.max(1, length);
        if (length < remaining.length) {
          const wordEnd = remaining.lastIndexOf(" ", length);
          if (wordEnd > length * .5) length = wordEnd;
          // Keep surrogate pairs intact when a long unbroken token must wrap.
          const code = remaining.charCodeAt(length - 1); if (code >= 0xd800 && code <= 0xdbff && length > 1) length--;
        }
        result.push({ region: regionIndex, text: remaining.slice(0, length).trimEnd(), y: row * lineHeight });
        remaining = remaining.slice(length).trimStart();
      }
    });
    return { lines: result, remaining, fontSize, lineHeight };
  };
  let layout = attempt(originalSize);
  for (let size = originalSize - .2; layout.remaining && size >= minimum; size -= .2) layout = attempt(size);
  if (layout.remaining) layout = attempt(minimum);
  return { ...layout, fits: !layout.remaining };
}
