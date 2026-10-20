import type { TranslationManifest } from "./manifest";

export type TargetBox = { x: number; y: number; width: number; height: number };
export interface ManualTarget { kind: "table" | "heading"; key: string; box: TargetBox; units: string[]; label: string }

const TABLE_LABEL = /^((?:table|tabel|tabla|tab(?:elle)?\.?|표|表)\s*[\dA-Z]+(?:[.-]\d+)?)/i;
const centre = (box: TargetBox, area: TargetBox) => box.x + box.width / 2 > area.x && box.x + box.width / 2 < area.x + area.width && box.y + box.height / 2 > area.y && box.y + box.height / 2 < area.y + area.height;
const cache = new WeakMap<TranslationManifest, Map<number, ManualTarget[]>>();

/**
 * The things a reader translates on request on one page: each ruled table (with its "Table n" caption)
 * and each heading. A table without a caption at the top of a page continues the previous page's table
 * and is named after it ("Table 2 (계속)").
 */
export function manualTargets(manifest: TranslationManifest, pageIndex: number): ManualTarget[] {
  let pages = cache.get(manifest);
  if (!pages) cache.set(manifest, pages = new Map());
  const known = pages.get(pageIndex);
  if (known) return known;
  const blocks = manifest.blocks.filter(block => block.pageIndex === pageIndex);
  const unitOf = new Map(manifest.units.map(unit => [unit.id, unit]));
  const tables = (manifest.pages[pageIndex]?.tables ?? []).map((table, index): ManualTarget => {
    const cells = blocks.filter(block => block.role === "TABLE" && block.translatable && block.unitId && centre(block, table));
    // The caption sits just above the table (or below, in some styles); the nearest one names it.
    const captions = blocks.filter(block => (block.role === "CAPTION" || block.role === "HEADING" || block.role === "BODY") && TABLE_LABEL.test(block.text.trim()) && block.text.trim().length < 400)
      .map(block => ({ block, gap: block.y + block.height <= table.y + .01 ? table.y - block.y - block.height : block.y >= table.y + table.height - .01 ? block.y - table.y - table.height : Infinity }))
      .filter(entry => entry.gap < .06 && entry.block.x < table.x + table.width && entry.block.x + entry.block.width > table.x).sort((a, b) => a.gap - b.gap);
    const caption = captions[0]?.block;
    const box = caption ? { x: Math.min(table.x, caption.x), y: Math.min(table.y, caption.y), width: Math.max(table.x + table.width, caption.x + caption.width) - Math.min(table.x, caption.x), height: Math.max(table.y + table.height, caption.y + caption.height) - Math.min(table.y, caption.y) } : table;
    let label = caption ? TABLE_LABEL.exec(caption.text.trim())![1].replace(/\s+/g, " ").replace(/\.$/, "") : "";
    if (!label && index === 0 && pageIndex > 0) {
      const previous = manualTargets(manifest, pageIndex - 1).filter(target => target.kind === "table").at(-1);
      if (previous?.label) label = `${previous.label.replace(/ \(계속\)$/, "")} (계속)`;
    }
    return { kind: "table", key: `t${index}`, box, units: [...new Set(cells.map(cell => cell.unitId!))], label: label || "표" };
  }).filter(target => target.units.length);
  const headings = blocks.filter(block => block.role === "HEADING" && block.unitId && unitOf.get(block.unitId)?.manual)
    .map((block): ManualTarget => ({ kind: "heading", key: block.id, box: { x: block.x, y: block.y, width: block.width, height: block.height }, units: [block.unitId!], label: "제목" }));
  const result = [...tables, ...headings];
  pages.set(pageIndex, result);
  return result;
}
