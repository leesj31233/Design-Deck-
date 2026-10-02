import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildPageBlocks } from "../../lib/paperflow/translation/manifest";
import type { PdfTextItem } from "../../lib/paperflow/pdf/pdf-adapter";

it.skipIf(!process.env.PAPERFLOW_LAYOUT_SAMPLE)("classifies a real two-column journal paper without DOM extraction", async () => {
  const bytes = new Uint8Array(readFileSync(process.env.PAPERFLOW_LAYOUT_SAMPLE!));
  const task = getDocument({ data: bytes, disableFontFace: true, useSystemFonts: true });
  const pdf = await task.promise;
  const extractionStarted = performance.now();
  let total = 0, target = 0;
  let section: "none" | "authors" | "references" = "none";
  for (let index = 0; index < pdf.numPages; index++) {
    const page = await pdf.getPage(index + 1), viewport = page.getViewport({ scale: 1 }), content = await page.getTextContent();
    const items: PdfTextItem[] = content.items.flatMap(item => {
      if (!("str" in item) || !item.str.trim()) return [];
      const [x, baseline] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      const height = Math.max(1, Math.abs(item.height) || Math.hypot(item.transform[2], item.transform[3]));
      const style = content.styles[item.fontName];
      return [{ text: item.str, x, y: baseline - height * (typeof style?.ascent === "number" ? style.ascent : .8), width: Math.abs(item.width), height, fontName: item.fontName, fontFamily: style?.fontFamily ?? "serif", hasEOL: item.hasEOL }];
    });
    if (process.env.PAPERFLOW_LAYOUT_DEBUG === "1" && (index === 0 || index === 10)) console.log(JSON.stringify(items.filter(item => index === 0 ? item.y > 95 && item.y < 145 : item.y > 240 && item.y < 320).map(item => ({ t: item.text, x: Math.round(item.x), y: Math.round(item.y), w: Math.round(item.width), h: Math.round(item.height) })).slice(0, 80)));
    if (process.env.PAPERFLOW_LAYOUT_DEBUG === "4" && index === 12) console.log(JSON.stringify(items.filter(item => item.x > viewport.width * .5 && item.y > viewport.height * .57 && item.y < viewport.height * .66).map(item => ({ t: item.text, x: Math.round(item.x), y: Math.round(item.y), w: Math.round(item.width), h: Math.round(item.height) })).slice(0, 100)));
    const blocks = await buildPageBlocks("sample", index, items, viewport.width, viewport.height, section);
    if (process.env.PAPERFLOW_LAYOUT_DEBUG === "2" && [2, 5, 10, 12, 13].includes(index)) console.log(blocks.map(block => `${block.role.padEnd(10)} ${block.x.toFixed(2)},${block.y.toFixed(2)} ${block.text.slice(0, 130)}`).join("\n"));
    if (process.env.PAPERFLOW_LAYOUT_DEBUG === "3" && index === 12) console.log(JSON.stringify(blocks.filter(block => block.x > .48 && block.y > .48 && block.y < .7).map(block => ({ role: block.role, x: block.x, y: block.y, width: block.width, height: block.height, text: block.text, lines: block.lines }))));
    if (index === 2) expect(blocks.find(block => block.text.includes("ultimate analysis"))?.translatable).toBe(false);
    if (index === 5) expect(blocks.find(block => block.text.startsWith("convective24"))?.translatable).toBe(true);
    if (index === 10) expect(blocks.find(block => block.text.startsWith("increment could"))?.translatable).toBe(true);
    if (index === 13) expect(blocks.filter(block => block.role === "EQUATION").length).toBeGreaterThan(3);
    if (index === 13) expect(blocks.find(block => block.text.startsWith("Table A1."))?.role).toBe("CAPTION");
    if (index === 12) {
      const malformed = blocks.filter(block => /[ÑÅ]{2,}/.test(block.text));
      expect(malformed.every(block => !block.translatable)).toBe(true);
    }
    if (blocks.some(block => block.exclusionReason === "reference-section")) section = "references";
    else if (blocks.some(block => block.exclusionReason === "author-section")) section = "authors";
    total += blocks.length; target += blocks.filter(block => block.translatable).length;
    console.log(JSON.stringify({ page: index + 1, blocks: blocks.length, targets: blocks.filter(block => block.translatable).length, maxChars: Math.max(...blocks.filter(block => block.translatable).map(block => block.text.length), 0), roles: Object.fromEntries([...new Set(blocks.map(block => block.role))].map(role => [role, blocks.filter(block => block.role === role).length])), first: blocks.slice(0, 5).map(block => `${block.role}@${block.x.toFixed(2)},${block.y.toFixed(2)}:${block.text.slice(0, 85)}`) }));
  }
  expect(total).toBeGreaterThan(pdf.numPages * 2);
  expect(target).toBeGreaterThan(pdf.numPages);
  if (process.env.PAPERFLOW_LAYOUT_BENCHMARK === "1") console.log(JSON.stringify({ pages: pdf.numPages, totalBlocks: total, translatableBlocks: target, extractionMs: Math.round(performance.now() - extractionStarted) }));
  await task.destroy();
});
