export interface ParagraphLine {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfParagraph {
  id: string;
  pageIndex: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: ParagraphLine[];
  fontFamily: string;
  fontWeight: number;
  fontStyle: string;
  color?: string;
}

type SpanItem = {
  span: HTMLElement;
  text: string;
  x: number;
  y: number;
  right: number;
  bottom: number;
  height: number;
};

type Line = {
  spans: HTMLElement[];
  text: string;
  x: number;
  y: number;
  right: number;
  bottom: number;
  height: number;
};

// Equations must remain PDF artwork: translating their PDF.js glyph stream
// produces prose such as "bykd (Pg-PS)" and can cover the formula itself.
export function isEquationLine(value: string): boolean {
  const text = value.trim();
  const words = text.match(/[A-Za-z]{3,}/g) ?? [];
  const symbols = text.match(/[=+−→×∑∫(){}_^]/g) ?? [];
  return words.length < 5 && (symbols.length >= 2 || (/\(\s*\d+\s*\)$/.test(text) && symbols.length > 0));
}

/**
 * Groups PDF.js text spans by geometry rather than DOM insertion order.
 * PDF text streams often interleave two columns, captions and decorations;
 * relying on querySelectorAll order therefore causes skipped or shuffled prose.
 */
export function extractParagraphs(
  layer: HTMLElement,
  page: HTMLElement,
  pageIndex: number,
  canvas?: HTMLCanvasElement,
): PdfParagraph[] {
  const bounds = page.getBoundingClientRect();
  const items: SpanItem[] = [];

  for (const span of layer.querySelectorAll<HTMLElement>("span")) {
    const value = span.textContent?.trim();
    if (!value) continue;
    const rect = span.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    items.push({
      span,
      text: value,
      x: rect.left,
      y: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      height: rect.height,
    });
  }

  const lines = orderLinesForReading(clusterLines(items), bounds);
  const groups: Line[][] = [];

  for (const line of lines) {
    if (isEquationLine(line.text)) {
      groups.push([]);
      continue;
    }

    const group = groups.at(-1);
    const previous = group?.at(-1);
    const verticalGap = previous ? line.y - previous.bottom : 0;
    const columnJump = previous
      ? line.y < previous.y - previous.height || line.x > previous.right + previous.height * 1.4
      : false;
    const paragraphIndent = Boolean(
      previous &&
        group &&
        group.length > 1 &&
        line.x - group[1].x > Math.max(18, previous.height * 1.15) &&
        /[.!?;:]\s*$/.test(previous.text),
    );

    if (
      !group ||
      !previous ||
      columnJump ||
      verticalGap > Math.max(7, previous.height * 0.72) ||
      paragraphIndent
    ) {
      groups.push([line]);
    } else {
      group.push(line);
    }
  }

  const bodySizes = lines.map(line => line.height).sort((a, b) => a - b);
  const bodySize = bodySizes[Math.floor(bodySizes.length / 2)] ?? 12;

  return groups
    .filter(group => group.length > 0)
    .map(group => {
      const x = Math.min(...group.map(line => line.x));
      const y = Math.min(...group.map(line => line.y));
      const right = Math.max(...group.map(line => line.right));
      const bottom = Math.max(...group.map(line => line.bottom));
      const text = group
        .map(line => line.text)
        .join(" ")
        .replace(/-\s+(?=[a-z])/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      const id = stableParagraphId(pageIndex, text, (x - bounds.left) / bounds.width, (y - bounds.top) / bounds.height);

      for (const line of group) {
        for (const span of line.spans) span.dataset.pfParagraph = id;
      }

      const representative = group
        .flatMap(line => line.spans)
        .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0];
      const style = getComputedStyle(representative);
      const sourceFont = representative.dataset.pfSourceFont ?? "";
      const fontWeight =
        /bold|demi|semibold|heavy/i.test(sourceFont) ||
        (group.length <= 3 && group[0].height > bodySize * 1.25)
          ? 700
          : Number(style.fontWeight) || 400;

      return {
        id,
        pageIndex,
        text,
        x: (x - bounds.left) / bounds.width,
        y: (y - bounds.top) / bounds.height,
        width: (right - x) / bounds.width,
        height: (bottom - y) / bounds.height,
        lines: group.map(line => ({
          x: (line.x - bounds.left) / bounds.width,
          y: (line.y - bounds.top) / bounds.height,
          width: (line.right - line.x) / bounds.width,
          height: (line.bottom - line.y) / bounds.height,
        })),
        fontFamily: sourceFont ? `${sourceFont}, ${style.fontFamily}` : style.fontFamily,
        fontWeight,
        fontStyle: style.fontStyle,
        color: sampleInk(canvas, representative, bounds),
      };
    })
    // Keep short section headings while still dropping isolated page furniture.
    .filter(paragraph => paragraph.text.length >= 12 || (paragraph.fontWeight >= 600 && paragraph.text.length >= 4));
}

function clusterLines(items: SpanItem[]): Line[] {
  const sorted = [...items].sort((a, b) => {
    const ay = a.y + a.height / 2;
    const by = b.y + b.height / 2;
    if (Math.abs(ay - by) > Math.max(a.height, b.height) * 0.45) return ay - by;
    return a.x - b.x;
  });
  const lines: SpanItem[][] = [];

  for (const item of sorted) {
    let target: SpanItem[] | undefined;
    for (let index = lines.length - 1; index >= Math.max(0, lines.length - 6); index--) {
      const candidate = lines[index];
      const top = Math.min(...candidate.map(span => span.y));
      const bottom = Math.max(...candidate.map(span => span.bottom));
      const height = Math.max(...candidate.map(span => span.height));
      const overlap = Math.min(bottom, item.bottom) - Math.max(top, item.y);
      if (overlap >= Math.min(height, item.height) * 0.35) {
        target = candidate;
        break;
      }
    }
    if (target) target.push(item);
    else lines.push([item]);
  }

  return lines.map(spans => {
    const ordered = [...spans].sort((a, b) => a.x - b.x);
    const height = Math.max(...ordered.map(span => span.height));
    let text = "";
    let previous: SpanItem | undefined;
    for (const item of ordered) {
      const gap = previous ? item.x - previous.right : 0;
      const script = previous ? item.height < Math.max(previous.height, height) * 0.82 : false;
      if (text && !script && gap > Math.max(1.5, height * 0.15)) text += " ";
      text += item.text;
      previous = item;
    }
    return {
      spans: ordered.map(item => item.span),
      text: text.trim(),
      x: Math.min(...ordered.map(item => item.x)),
      y: Math.min(...ordered.map(item => item.y)),
      right: Math.max(...ordered.map(item => item.right)),
      bottom: Math.max(...ordered.map(item => item.bottom)),
      height,
    };
  });
}

function orderLinesForReading(lines: Line[], page: DOMRect): Line[] {
  if (lines.length < 6) return [...lines].sort(topThenLeft);
  const center = page.left + page.width / 2;
  const gutter = page.width * 0.035;
  const fullWidth = (line: Line) => {
    const width = line.right - line.x;
    const crossesCenter = line.x < center - gutter && line.right > center + gutter;
    return width > page.width * 0.62 || (crossesCenter && width > page.width * 0.4);
  };
  const left = lines.filter(line => !fullWidth(line) && line.right <= center + gutter);
  const right = lines.filter(line => !fullWidth(line) && line.x >= center - gutter);

  if (left.length < 3 || right.length < 3) return [...lines].sort(topThenLeft);

  const spanning = lines.filter(fullWidth).sort(topThenLeft);
  const remaining = lines.filter(line => !fullWidth(line));
  const result: Line[] = [];
  let lower = -Infinity;

  for (const separator of spanning) {
    const band = remaining.filter(line => line.y >= lower && line.y < separator.y - line.height * 0.35);
    result.push(...orderColumnBand(band, center, gutter));
    result.push(separator);
    lower = separator.bottom;
  }

  result.push(...orderColumnBand(remaining.filter(line => line.y >= lower), center, gutter));
  return dedupeLines(result);
}

function orderColumnBand(lines: Line[], center: number, gutter: number): Line[] {
  const left = lines.filter(line => line.x < center - gutter).sort(topThenLeft);
  const right = lines.filter(line => line.x >= center - gutter).sort(topThenLeft);
  const ambiguous = lines.filter(line => !left.includes(line) && !right.includes(line)).sort(topThenLeft);
  return [...left, ...right, ...ambiguous];
}

function topThenLeft(a: Line, b: Line) {
  const tolerance = Math.min(a.height, b.height) * 0.35;
  if (Math.abs(a.y - b.y) > tolerance) return a.y - b.y;
  return a.x - b.x;
}

function dedupeLines(lines: Line[]) {
  return [...new Set(lines)];
}

function stableParagraphId(pageIndex: number, text: string, x: number, y: number) {
  const normalized = `${pageIndex}|${Math.round(x * 1000)}|${Math.round(y * 1000)}|${text.toLowerCase().replace(/\s+/g, " ")}`;
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index++) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `p${pageIndex}-${(hash >>> 0).toString(36)}`;
}

function sampleInk(canvas: HTMLCanvasElement | undefined, span: HTMLElement, page: DOMRect): string | undefined {
  if (!canvas?.width) return;
  try {
    const rect = span.getBoundingClientRect();
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const x = Math.max(0, Math.floor(((rect.left - page.left) / page.width) * canvas.width));
    const y = Math.max(0, Math.floor(((rect.top - page.top) / page.height) * canvas.height));
    const width = Math.min(canvas.width - x, Math.max(1, Math.ceil((rect.width / page.width) * canvas.width)));
    const height = Math.min(canvas.height - y, Math.max(1, Math.ceil((rect.height / page.height) * canvas.height)));
    if (width * height > 80000) return;
    const data = context.getImageData(x, y, width, height).data;
    const counts = new Map<string, number>();
    for (let index = 0; index < data.length; index += 16) {
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      if (Math.max(r, g, b) > 195 || (Math.max(r, g, b) - Math.min(r, g, b) < 12 && Math.max(r, g, b) > 75)) continue;
      const key = [r, g, b].map(value => Math.floor(value / 16) * 16).join(",");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const color = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    return color ? `rgb(${color})` : undefined;
  } catch {
    return;
  }
}
