export interface ParagraphLine { x: number; y: number; width: number; height: number }
export interface PdfParagraph { id: string; pageIndex: number; text: string; x: number; y: number; width: number; height: number; lines: ParagraphLine[]; fontFamily: string; fontWeight: number; fontStyle: string }

type Line = { spans: HTMLElement[]; text: string; x: number; y: number; right: number; bottom: number; height: number };

/** Groups PDF.js text spans in reading order without changing the source PDF layer. */
export function extractParagraphs(layer: HTMLElement, page: HTMLElement, pageIndex: number): PdfParagraph[] {
  const bounds = page.getBoundingClientRect();
  const lines: Line[] = [];
  for (const span of layer.querySelectorAll<HTMLElement>("span")) {
    const value = span.textContent?.trim();
    if (!value) continue;
    const rect = span.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const last = lines.at(-1);
    const overlap = last ? Math.min(last.bottom, rect.bottom) - Math.max(last.y, rect.top) : 0;
    if (last && overlap >= Math.min(rect.height, last.height) * .3 && rect.left >= last.x - 3 && rect.left - last.right < Math.max(18, rect.height * 2.5)) {
      const script = rect.height < last.height * .85;
      last.spans.push(span); last.text += (!script && rect.left - last.right > rect.height * .16 ? " " : "") + value;
      last.y = Math.min(last.y, rect.top); last.right = Math.max(last.right, rect.right); last.bottom = Math.max(last.bottom, rect.bottom); last.height = Math.max(last.height, rect.height);
    } else lines.push({ spans: [span], text: value, x: rect.left, y: rect.top, right: rect.right, bottom: rect.bottom, height: rect.height });
  }
  const groups: Line[][] = [];
  for (const line of lines) {
    const group = groups.at(-1), previous = group?.at(-1);
    const verticalGap = previous ? line.y - previous.bottom : 0;
    const columnJump = previous ? line.y < previous.y - previous.height || line.x > previous.right + previous.height * 1.4 : false;
    const paragraphIndent = previous && group && group.length > 1 && line.x - group[1].x > Math.max(18, previous.height * 1.15) && /[.!?;:]\s*$/.test(previous.text);
    if (!group || !previous || columnJump || verticalGap > Math.max(7, previous.height * .72) || paragraphIndent) groups.push([line]);
    else group.push(line);
  }
  const bodySizes = lines.map(line => line.height).sort((a, b) => a - b), bodySize = bodySizes[Math.floor(bodySizes.length / 2)] ?? 12;
  return groups.map((group, index) => {
    const x = Math.min(...group.map(line => line.x)), y = Math.min(...group.map(line => line.y));
    const right = Math.max(...group.map(line => line.right)), bottom = Math.max(...group.map(line => line.bottom));
    const id = `p${pageIndex}-${index}`;
    for (const line of group) for (const span of line.spans) span.dataset.pfParagraph = id;
    const representative = group.flatMap(line => line.spans).sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0];
    const style = getComputedStyle(representative);
    const fontWeight = group.length <= 3 && group[0].height > bodySize * 1.25 ? 600 : Number(style.fontWeight) || 400;
    return { id, pageIndex, text: group.map(line => line.text).join(" ").replace(/\s+/g, " ").trim(), x: (x - bounds.left) / bounds.width, y: (y - bounds.top) / bounds.height, width: (right - x) / bounds.width, height: (bottom - y) / bounds.height, lines: group.map(line => ({ x: (line.x - bounds.left) / bounds.width, y: (line.y - bounds.top) / bounds.height, width: (line.right - line.x) / bounds.width, height: (line.bottom - line.y) / bounds.height })), fontFamily: representative.dataset.pfSourceFont ? `${representative.dataset.pfSourceFont}, ${style.fontFamily}` : style.fontFamily, fontWeight, fontStyle: style.fontStyle };
  }).filter(paragraph => paragraph.text.length >= 12);
}
