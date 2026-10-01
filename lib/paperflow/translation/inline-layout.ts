import type { ParagraphLine } from "./paragraphs";

export interface FlowRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  firstLineIndent: number;
}

export interface TranslatedLine {
  region: number;
  text: string;
  x: number;
  y: number;
}

/** Preserve the text contour: an abstract wrapping an illustration is not a rectangle. */
export function paragraphRegions(lines: ParagraphLine[]): FlowRegion[] {
  const regions: FlowRegion[] = [];
  for (const line of lines) {
    const previous = regions.at(-1);
    const expands =
      previous &&
      line.x + line.width > previous.x + previous.width + Math.max(previous.width * 0.15, line.height * 4);
    const shifts = previous && Math.abs(line.x - previous.x) > line.height * 2;

    if (!previous || expands || shifts || line.y < previous.y) {
      regions.push({ ...line, firstLineIndent: 0 });
      continue;
    }

    // Preserve the original first-line start before widening the region to
    // subsequent lines. This is what keeps journal paragraph indentation.
    const firstLineStart = previous.x + previous.firstLineIndent;
    const right = Math.max(previous.x + previous.width, line.x + line.width);
    previous.x = Math.min(previous.x, line.x);
    previous.width = right - previous.x;
    previous.firstLineIndent = Math.max(0, firstLineStart - previous.x);
    previous.height = Math.max(previous.height, line.y + line.height - previous.y);
  }
  return regions;
}

type Measure = (text: string, fontSize: number) => number;

type Attempt = {
  lines: TranslatedLine[];
  remaining: string;
  fontSize: number;
  lineHeight: number;
};

/**
 * Fit Korean at natural tracking with a compact journal-like leading.
 * The previous implementation used 1.46 line-height and a coarse font-size
 * decrement, which caused avoidable clipping and scroll boxes.
 */
export function layoutTranslation(
  text: string,
  regions: FlowRegion[],
  originalSize: number,
  measure: Measure,
) {
  const source = text.replace(/\s+/g, " ").trim();
  if (!source || !regions.length) {
    return {
      lines: [] as TranslatedLine[],
      remaining: source,
      fontSize: originalSize,
      lineHeight: originalSize * 1.28,
      overflow: null as null | { region: number; text: string },
    };
  }

  const attempt = (fontSize: number, leading = 1.28): Attempt => {
    const lineHeight = fontSize * leading;
    const result: TranslatedLine[] = [];
    let remaining = source;

    regions.forEach((region, regionIndex) => {
      const count = Math.max(1, Math.floor((region.height + fontSize * 0.18) / lineHeight));
      for (let row = 0; row < count && remaining; row++) {
        const indent = regionIndex === 0 && row === 0 ? Math.min(region.firstLineIndent, region.width * 0.32) : 0;
        const maxWidth = Math.max(fontSize * 2, region.width - indent);
        let low = 1;
        let high = remaining.length;
        let length = 0;

        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          if (measure(remaining.slice(0, middle), fontSize) <= maxWidth) {
            length = middle;
            low = middle + 1;
          } else {
            high = middle - 1;
          }
        }

        length = Math.max(1, length);
        if (length < remaining.length) {
          const wordEnd = remaining.lastIndexOf(" ", length);
          if (wordEnd > length * 0.5) length = wordEnd;
          const code = remaining.charCodeAt(length - 1);
          if (code >= 0xd800 && code <= 0xdbff && length > 1) length--;
        }

        result.push({
          region: regionIndex,
          text: remaining.slice(0, length).trimEnd(),
          x: indent,
          y: row * lineHeight,
        });
        remaining = remaining.slice(length).trimStart();
      }
    });

    return { lines: result, remaining, fontSize, lineHeight };
  };

  let best = attempt(originalSize);
  if (best.remaining) {
    const minimum = originalSize * 0.76;
    let low = minimum;
    let high = originalSize;

    for (let index = 0; index < 9; index++) {
      const middle = (low + high) / 2;
      const candidate = attempt(middle);
      if (candidate.remaining) {
        high = middle;
      } else {
        best = candidate;
        low = middle;
      }
    }

    if (best.remaining) best = attempt(minimum);
  }

  // Emergency compact-leading pass. This avoids most internal scroll regions
  // without shrinking the font to unreadable sizes.
  if (best.remaining) {
    const compact = attempt(originalSize * 0.74, 1.16);
    if (!compact.remaining || compact.remaining.length < best.remaining.length) best = compact;
  }

  if (best.remaining && regions.length) {
    const last = regions.length - 1;
    const lastLines = best.lines.filter(line => line.region === last).map(line => line.text);
    return {
      ...best,
      lines: best.lines.filter(line => line.region !== last),
      overflow: { region: last, text: [...lastLines, best.remaining].join(" ") },
    };
  }

  return { ...best, overflow: null };
}
