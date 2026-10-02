"use client";
import { useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { PdfParagraph } from "@/lib/paperflow/translation/paragraphs";
import { paragraphRegions, translationFlowRegions, layoutTranslation, type FlowRegion } from "@/lib/paperflow/translation/inline-layout";
import { planColumnReflow } from "@/lib/paperflow/translation/column-reflow";
import { paperFontStack, koreanFontStack, paperFontRuns } from "@/lib/paperflow/translation/paper-font";

export interface InlineTranslation { text?: string; provider?: "device" | "MyMemory" | "OpenAI"; pending: boolean; error?: string }
export type InlineTranslations = Record<string, InlineTranslation>;
export interface TranslationContinuation { id: string; text: string; pageIndex: number }
type LayoutResult = ReturnType<typeof layoutTranslation>;
type Prepared = { paragraph: PdfParagraph; translation: InlineTranslation; sourceRegions: FlowRegion[]; masks: { region: FlowRegion; color: string }[]; regions: FlowRegion[]; layout: LayoutResult; fontFamily: string; latinFont: string };

function subtractObstacle(region: FlowRegion, obstacle: FlowRegion): FlowRegion[] {
  const left = Math.max(region.x, obstacle.x - 2), right = Math.min(region.x + region.width, obstacle.x + obstacle.width + 2);
  const top = Math.max(region.y, obstacle.y - 2), bottom = Math.min(region.y + region.height, obstacle.y + obstacle.height + 2);
  if (left >= right || top >= bottom) return [region];
  return [
    { x: region.x, y: region.y, width: left - region.x, height: region.height },
    { x: right, y: region.y, width: region.x + region.width - right, height: region.height },
    { x: left, y: region.y, width: right - left, height: top - region.y },
    { x: left, y: bottom, width: right - left, height: region.y + region.height - bottom }
  ].filter(part => part.width > 2 && part.height > 1);
}

function backgroundAt(canvas: HTMLCanvasElement, region: FlowRegion, width: number, height: number) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return "rgb(255,255,255)";
  const colors = new Map<string, number>(), sx = canvas.width / width, sy = canvas.height / height;
  try {
    for (let row = 0; row < 5; row++) for (let col = 0; col < 14; col++) {
      const x = Math.min(canvas.width - 1, Math.max(0, Math.round((region.x + region.width * (col + .5) / 14) * sx)));
      const y = Math.min(canvas.height - 1, Math.max(0, Math.round((region.y + region.height * (row + .5) / 5) * sy)));
      const pixel = context.getImageData(x, y, 1, 1).data;
      const key = `${pixel[0]},${pixel[1]},${pixel[2]}`; colors.set(key, (colors.get(key) ?? 0) + 1);
    }
    return `rgb(${[...colors].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "255,255,255"})`;
  } catch { return "rgb(255,255,255)"; }
}

function TranslatedParagraph({ plan, onOriginal }: { plan: Prepared; onOriginal: () => void }) {
  const reduced = useReducedMotion();
  const { paragraph, regions, layout, fontFamily, latinFont } = plan, first = regions[0];
  if (!first) return null;
  return <section className="pf-inline-paragraph pf-translated-text" aria-label="한국어 번역 문단" data-paragraph-id={paragraph.id} data-kind={paragraph.kind} style={{ fontFamily, fontSize: layout.fontSize, fontWeight: paragraph.fontWeight, fontStyle: paragraph.fontStyle, color: paragraph.color }}>
    {regions.map((region, index) => <div key={index} className="pf-inline-region" data-inline-region style={{ left: region.x - .5, top: region.y - .5, width: region.width + 1, height: region.height + 1 }}>
      {layout.lines.filter(line => line.region === index).map((line, row) => <span className="pf-inline-line" key={row} style={{ left: line.x + .5, top: line.y + .5, wordSpacing: line.wordSpacing }}>{line.text.split(/(Figure\s*\d+[a-z]?|Fig\.\s*\d+[a-z]?)/gi).flatMap((piece, part) => paperFontRuns(piece).map((run, runIndex) => <span key={`${part}-${runIndex}`} style={{ fontFamily: run.latin ? latinFont : undefined, color: /^(?:Figure|Fig\.)\s*\d+/i.test(piece) && paragraph.kind !== "title" ? "#0878c7" : undefined, fontWeight: /^(?:Figure|Fig\.)\s*\d+/i.test(piece) && paragraph.kind === "caption" ? 700 : undefined }}>{run.text}</span>))}</span>)}
    </div>)}
    <motion.button className="pf-inline-original" aria-label="이 문단 원문 보기" onClick={onOriginal} whileTap={reduced ? undefined : { scale: .94 }} style={{ left: first.x + Math.max(0, first.width - 52), top: first.y - 23 }}>원문</motion.button>
  </section>;
}

export function InlineTranslationLayer({ paragraphs, translations, obstacles = [], canvas, width, height, onOriginal, onRetry, onContinuations }: { paragraphs: PdfParagraph[]; translations: InlineTranslations; obstacles?: PdfParagraph[]; canvas: HTMLCanvasElement; width: number; height: number; onOriginal: (id: string) => void; onRetry: (paragraph: PdfParagraph) => void; onContinuations?: (items: TranslationContinuation[]) => void }) {
  const prepared = useMemo(() => {
    const byId = new Map(paragraphs.filter(paragraph => translations[paragraph.id]?.text).map(paragraph => [paragraph.id, paragraph]));
    const context = document.createElement("canvas").getContext("2d")!;
    const allSizes = paragraphs.flatMap(paragraph => paragraph.lines.map(line => line.height * height)).sort((a, b) => a - b);
    const bodySize = allSizes[Math.floor(allSizes.length / 2)] || 12;
    const source = new Map<string, { paragraph: PdfParagraph; sourceRegions: FlowRegion[]; flowRegions: FlowRegion[]; originalSize: number; fontFamily: string; latinFont: string }>();
    for (const paragraph of byId.values()) {
      const lines = paragraph.lines.map(line => ({ x: line.x * width, y: line.y * height, width: line.width * width, height: line.height * height }));
      if (!lines.length) continue;
      const sourceRegions = lines, flowRegions = paragraphRegions(lines), heights = lines.map(line => line.height).sort((a, b) => a - b);
      const rawSize = (heights[Math.floor(heights.length / 2)] || bodySize) * .96;
      const sizeLimit = bodySize * (paragraph.kind === "title" ? 1.55 : paragraph.kind === "caption" ? 1.12 : 1.18);
      source.set(paragraph.id, { paragraph, sourceRegions, flowRegions: translationFlowRegions(paragraph, flowRegions, width), originalSize: Math.min(rawSize, sizeLimit), fontFamily: koreanFontStack(paragraph.fontFamily), latinFont: paperFontStack(paragraph.fontFamily) });
    }
    const flow = [...source.values()].map(item => ({ id: item.paragraph.id, x: item.paragraph.x * width, y: item.paragraph.y * height, width: item.paragraph.width * width, height: item.paragraph.height * height, lineHeight: item.originalSize * 1.18, column: item.paragraph.kind === "title" && item.paragraph.width > .55 ? 2 : item.paragraph.x < .48 ? 0 : 1 }));
    const fixed = obstacles.map(item => {
      if ((item as PdfParagraph & { role?: string }).role === "EQUATION") {
        const x = (item.x < .48 ? .075 : .515) * width;
        return { x, y: item.y * height - bodySize * .35, width: (item.x < .48 ? .41 : .42) * width, height: item.height * height + bodySize * .7 };
      }
      return { x: item.x * width, y: item.y * height, width: item.width * width, height: item.height * height };
    });
    const placements = planColumnReflow(flow, fixed, height, (block, top, availableHeight) => {
      const item = source.get(block.id)!, translation = translations[block.id];
      const originalTop = item.sourceRegions[0].y, shift = top - originalTop;
      const regions = item.flowRegions.map(region => ({ ...region, y: region.y + shift }));
      const last = regions.at(-1)!;
      last.height = Math.max(0, availableHeight - (last.y - top));
      for (const region of regions) region.height = Math.max(0, Math.min(region.height, availableHeight - (region.y - top)));
      const firstIndent = Math.max(0, item.paragraph.lines[0].x * width - item.sourceRegions[0].x);
      const layout = layoutTranslation(translation.text!, regions, item.originalSize, (text, size) => paperFontRuns(text).reduce((sum, run) => { context.font = `${item.paragraph.fontStyle} ${item.paragraph.fontWeight} ${size}px ${run.latin ? item.latinFont : item.fontFamily}`; return sum + context.measureText(run.text).width; }, 0), firstIndent, item.paragraph.kind === "title" ? .94 : .82);
      const usedHeight = Math.max(0, ...layout.lines.map(line => regions[line.region].y + line.y + layout.lineHeight - top));
      const displayRegions = regions.map((region, index) => ({ ...region, height: Math.max(0, ...layout.lines.filter(line => line.region === index).map(line => line.y + layout.lineHeight + 1)) }));
      const masks = item.sourceRegions.flatMap(region => fixed.reduce((parts, obstacle) => parts.flatMap(part => subtractObstacle(part, obstacle)), [region]).map(part => ({ region: part, color: backgroundAt(canvas, part, width, height) })));
      return { usedHeight, output: { paragraph: item.paragraph, translation, sourceRegions: item.sourceRegions, masks, regions: displayRegions, layout, fontFamily: item.fontFamily, latinFont: item.latinFont } satisfies Prepared };
    });
    return placements.map(placement => placement.output);
  }, [paragraphs, translations, obstacles, canvas, width, height]);
  const continuations = prepared.filter(plan => plan.layout.remaining).map(plan => ({ id: plan.paragraph.id, text: plan.layout.remaining, pageIndex: plan.paragraph.pageIndex }));
  useEffect(() => { onContinuations?.(continuations); }, [onContinuations, continuations.map(item => `${item.id}:${item.text}`).join("|")]);
  return <div className="pf-inline-layer">
    {prepared.flatMap(plan => plan.masks.map(({ region, color }, index) => <div key={`mask-${plan.paragraph.id}-${index}`} className="pf-inline-source-mask" style={{ left: region.x, top: region.y, width: region.width, height: region.height, backgroundColor: color }}/>))}
    {prepared.map(plan => <TranslatedParagraph key={plan.paragraph.id} plan={plan} onOriginal={() => onOriginal(plan.paragraph.id)}/>)}
    {paragraphs.filter(paragraph => translations[paragraph.id] && !translations[paragraph.id].text).map(paragraph => <div key={paragraph.id} className="pf-inline-status" style={{ left: paragraph.x * width, top: paragraph.y * height }} role={translations[paragraph.id].error ? "alert" : "status"}>{translations[paragraph.id].pending ? <><span className="pf-loader"/>문단 번역 중…</> : <button onClick={() => onRetry(paragraph)} title={translations[paragraph.id].error}>번역 재시도</button>}</div>)}
  </div>;
}
