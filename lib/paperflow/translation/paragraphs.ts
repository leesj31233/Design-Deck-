export interface ParagraphLine { x: number; y: number; width: number; height: number }
export interface PdfParagraph { id: string; pageIndex: number; text: string; kind: "body" | "title" | "caption" | "skip"; x: number; y: number; width: number; height: number; lines: ParagraphLine[]; fontFamily: string; fontWeight: number; fontStyle: string; color?: string }

type Line = { spans: HTMLElement[]; text: string; x: number; y: number; right: number; bottom: number; height: number; forceBodyWeight?: boolean };

export function paragraphKind(text: string, y: number, height: number, pageHeight: number): PdfParagraph["kind"] {
  const value = text.trim();
  if (!value || /^https?:\/\/|^(?:www\.|doi:|©|copyright|received:|accepted:|published:|correspondence|keywords?:|article info|cite this|read online)/i.test(value)) return "skip";
  if (/^(?:[^A-Za-z]*)(?:contents|table of contents|references|author information|acknowledg(?:e)?ments?)/i.test(value) || /\.{3,}\s*\d+\s*$/.test(value) || /^\[\d+\]\s+[A-Z]/.test(value)) return "skip";
  if (/^(?:fig(?:ure)?\.?|table)\s*[a-z]?\d+[a-z]?[.:]/i.test(value)) return "caption";
  if (/^■?\s*APPENDIX\s+\d+:\s+[A-Z0-9\s-]{8,}$/.test(value)) return "title";
  if (y < pageHeight * .4 && /,/.test(value) && /\band\b|\*/i.test(value) && (value.match(/[A-Z][a-z]+(?:-[A-Z][a-z]+)*\s+[A-Z][a-z]+(?:-[A-Z][a-z]+)*/g) ?? []).length >= 3 && !/[.!?]\s*$/.test(value)) return "skip";
  if (/^[A-Z][a-z]+(?:-[A-Z][a-z]+)?(?:-[A-Z][a-z]+)?\s+[A-Z][a-z]+\s*[−–-]\s*(?:School|Department|University|Institute)\b/.test(value)) return "skip";
  if (/^(?:abstract|\d+(?:\.\d+)*\.?\s*)?(?:introduction|methods?|results?|discussion|conclusions?|computational models?|general models?|boiler mesh|experimental setup|materials and methods)\.?\s*$/i.test(value) || /^\d+(?:\.\d+)*\.?\s*[A-Za-z][A-Za-z\s-]{2,65}\.?$/.test(value)) return "title";
  // Dense journal pages can carry real prose almost to the trim edge.
  if (y < pageHeight * .06 || y + height > pageHeight * .975) return "skip";
  if (/^(?:\[?\d+\]?\s+)?(?:[A-Z][a-z]+\s+[A-Z]\.|[A-Z][a-z]+,\s+[A-Z])/.test(value) && /(?:et al\.|\b(?:university|department|journal|institute|author|received|published)\b)/i.test(value)) return "skip";
  if ((value.match(/\b[A-Za-z]+\b/g) ?? []).length < 3 && !/[.!?;:]\s*$/.test(value)) return "skip";
  return "body";
}

// Equations must remain PDF artwork: translating their PDF.js glyph stream
// produces prose such as "bykd (Pg-PS)" and can cover the formula itself.
export function isEquationLine(value: string): boolean {
  const text = value.trim();
  const words = text.match(/[A-Za-z]{3,}/g) ?? [];
  const symbols = text.match(/[=+−→×∑∫(){}_^]/g) ?? [];
  return words.length < 5 && (symbols.length >= 2 || /\(\s*\d+\s*\)$/.test(text) && symbols.length > 0 || text.includes("=") && (text.length < 75 || /[α-ωΑ-Ω∑∫₀-₉]/.test(text)));
}

/** Groups PDF.js text spans in reading order without changing the source PDF layer. */
export function extractParagraphs(layer: HTMLElement, page: HTMLElement, pageIndex: number, canvas?: HTMLCanvasElement): PdfParagraph[] {
  const bounds = page.getBoundingClientRect();
  const lines: Line[] = [];
  for (const span of layer.querySelectorAll<HTMLElement>("span")) {
    const value = span.textContent?.trim();
    if (!value) continue;
    const rect = span.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const last = lines.at(-1);
    const overlap = last ? Math.min(last.bottom, rect.bottom) - Math.max(last.y, rect.top) : 0;
    if (last && overlap >= Math.min(rect.height, last.height) * .3 && rect.left >= last.x - rect.height * .25 && rect.left - last.right < rect.height * 2.5) {
      const script = rect.height < last.height * .85;
      last.spans.push(span); last.text += (!script && rect.left - last.right > rect.height * .16 ? " " : "") + value;
      last.y = Math.min(last.y, rect.top); last.right = Math.max(last.right, rect.right); last.bottom = Math.max(last.bottom, rect.bottom); last.height = Math.max(last.height, rect.height);
    } else lines.push({ spans: [span], text: value, x: rect.left, y: rect.top, right: rect.right, bottom: rect.bottom, height: rect.height });
  }
  // PDF.js often places a bold subsection label and the first sentence on one
  // visual line. Give them separate boxes so translated prose cannot repaint
  // the label with body styling.
  const separatedLines = lines.flatMap(line => {
    const parts: Line[] = [];
    let rest = line;
    for (let index = 0; index < 3; index++) {
      const match = rest.text.match(/^(\d+(?:\.\d+)+\.?\s+[A-Z][A-Za-z -]{2,55}?\.)(?:\s+)(.{12,})$/);
      if (!match) break;
      const split = rest.x + (rest.right - rest.x) * Math.min(.65, match[1].length / rest.text.length);
      parts.push({ ...rest, text: match[1], right: split });
      rest = { ...rest, text: match[2], x: split + 2, forceBodyWeight: true };
    }
    return [...parts, rest];
  });
  const groups: Line[][] = [];
  for (const line of separatedLines) {
    if (isEquationLine(line.text)) { groups.push([]); continue; }
    const group = groups.at(-1), previous = group?.at(-1);
    const verticalGap = previous ? line.y - previous.bottom : 0;
    const lineKind = paragraphKind(line.text, line.y - bounds.top, line.height, bounds.height);
    const previousKind = previous && paragraphKind(previous.text, previous.y - bounds.top, previous.height, bounds.height);
    const separate = lineKind === "title" || lineKind === "caption" || lineKind === "skip" || previousKind === "title" || previousKind === "skip";
    const columnJump = previous ? line.y < previous.y - previous.height || line.x > previous.right + previous.height * 1.4 : false;
    const paragraphIndent = previous && group && group.length > 1 && line.x - group[1].x > previous.height * 1.4 && /[.!?;:]\s*$/.test(previous.text);
    if (!group || !previous || separate || columnJump || verticalGap > previous.height * .72 || paragraphIndent) groups.push([line]);
    else group.push(line);
  }
  const bodySizes = lines.map(line => line.height).sort((a, b) => a - b), bodySize = bodySizes[Math.floor(bodySizes.length / 2)] ?? 12;
  const contentsPage = lines.some(line => /^(?:table of )?contents\s*$/i.test(line.text.trim())) && lines.filter(line => /\.{3,}\s*\d+\s*$/.test(line.text)).length >= 2;
  const stopLines = lines.filter(line => /^(?:[^A-Za-z]*)(?:author information|references)/i.test(line.text.trim()));
  return groups.filter(group => group.length > 0).map((group, index) => {
    const x = Math.min(...group.map(line => line.x)), y = Math.min(...group.map(line => line.y));
    const right = Math.max(...group.map(line => line.right)), bottom = Math.max(...group.map(line => line.bottom));
    const id = `p${pageIndex}-${index}`;
    for (const line of group) for (const span of line.spans) span.dataset.pfParagraph = id;
    const representative = group.flatMap(line => line.spans).sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0];
    const style = getComputedStyle(representative);
    const sourceFont = representative.dataset.pfSourceFont ?? "";
    const fontWeight = group[0].forceBodyWeight ? 400 : /bold|demi|semibold|heavy/i.test(sourceFont) || group.length <= 3 && group[0].height > bodySize * 1.25 ? 700 : Number(style.fontWeight) || 400;
    const text = group.map(line => line.text).join(" ").replace(/\s+/g, " ").trim();
    const afterMetadata = stopLines.some(line => y >= line.y && x >= line.x - bounds.width * .08 && x <= line.x + bounds.width * .45);
    const candidateKind = contentsPage || afterMetadata ? "skip" : paragraphKind(text, y - bounds.top, bottom - y, bounds.height);
    const groupSizes = group.map(line => line.height).sort((a, b) => a - b);
    const coverTitle = pageIndex === 0 && candidateKind === "body" && fontWeight >= 700 && y - bounds.top < bounds.height * .3 && text.length > 25 && group.length <= 3;
    const kind = coverTitle ? "title" : candidateKind === "body" && groupSizes[Math.floor(groupSizes.length / 2)] < bodySize * .72 ? "skip" : candidateKind;
    for (const line of group) for (const span of line.spans) span.dataset.pfKind = kind;
    return { id, pageIndex, text, kind, x: (x - bounds.left) / bounds.width, y: (y - bounds.top) / bounds.height, width: (right - x) / bounds.width, height: (bottom - y) / bounds.height, lines: group.map(line => ({ x: (line.x - bounds.left) / bounds.width, y: (line.y - bounds.top) / bounds.height, width: (line.right - line.x) / bounds.width, height: (line.bottom - line.y) / bounds.height })), fontFamily: sourceFont ? `${sourceFont}, ${style.fontFamily}` : style.fontFamily, fontWeight: kind === "title" ? 700 : fontWeight, fontStyle: style.fontStyle, color: sampleInk(canvas, representative, bounds) };
  }).filter(paragraph => paragraph.kind === "title" || paragraph.text.length >= 12);
}

function sampleInk(canvas: HTMLCanvasElement | undefined, span: HTMLElement, page: DOMRect): string | undefined {
  if (!canvas?.width) return;
  try {
    const rect = span.getBoundingClientRect(), context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const x = Math.max(0, Math.floor((rect.left - page.left) / page.width * canvas.width));
    const y = Math.max(0, Math.floor((rect.top - page.top) / page.height * canvas.height));
    const width = Math.min(canvas.width - x, Math.max(1, Math.ceil(rect.width / page.width * canvas.width)));
    const height = Math.min(canvas.height - y, Math.max(1, Math.ceil(rect.height / page.height * canvas.height)));
    if (width * height > 80000) return;
    const data = context.getImageData(x, y, width, height).data, counts = new Map<string, number>();
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.max(r, g, b) > 195 || Math.max(r, g, b) - Math.min(r, g, b) < 12 && Math.max(r, g, b) > 75) continue;
      const key = [r, g, b].map(n => Math.floor(n / 16) * 16).join(",");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const color = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    return color ? `rgb(${color})` : undefined;
  } catch { return; }
}
