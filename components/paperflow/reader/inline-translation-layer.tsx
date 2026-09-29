"use client";
import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { PdfParagraph } from "@/lib/paperflow/translation/paragraphs";
import { paragraphRegions, layoutTranslation } from "@/lib/paperflow/translation/inline-layout";
import { paperFontStack, koreanFontStack, paperFontRuns } from "@/lib/paperflow/translation/paper-font";

export interface InlineTranslation { text?: string; provider?: "device" | "MyMemory"; pending: boolean; error?: string }
export type InlineTranslations = Record<string, InlineTranslation>;

function backgroundAt(canvas: HTMLCanvasElement, region: { x: number; y: number; width: number; height: number }, width: number, height: number) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return "rgb(255,255,255)";
  const colors = new Map<string, number>(), sx = canvas.width / width, sy = canvas.height / height;
  try {
    // The dominant source pixel is the paper/background, even over printed glyphs.
    for (let row = 0; row < 5; row++) for (let col = 0; col < 14; col++) {
      const x = Math.min(canvas.width - 1, Math.max(0, Math.round((region.x + region.width * (col + .5) / 14) * sx)));
      const y = Math.min(canvas.height - 1, Math.max(0, Math.round((region.y + region.height * (row + .5) / 5) * sy)));
      const pixel = context.getImageData(x, y, 1, 1).data;
      const key = `${pixel[0]},${pixel[1]},${pixel[2]}`; colors.set(key, (colors.get(key) ?? 0) + 1);
    }
    return `rgb(${[...colors].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "255,255,255"})`;
  } catch { return "rgb(255,255,255)"; }
}

function TranslatedParagraph({ paragraph, translation, canvas, width, height, onOriginal, onRetry }: { paragraph: PdfParagraph; translation: InlineTranslation; canvas: HTMLCanvasElement; width: number; height: number; onOriginal: () => void; onRetry: () => void }) {
  const reduced = useReducedMotion(), fontFamily = koreanFontStack(paragraph.fontFamily), latinFont = paperFontStack(paragraph.fontFamily);
  const composition = useMemo(() => {
    const sourceLines = paragraph.lines.map(line => ({ x: line.x * width, y: line.y * height, width: line.width * width, height: line.height * height }));
    const regions = paragraphRegions(sourceLines);
    const sizes = sourceLines.map(line => line.height).sort((a, b) => a - b);
    const fontSize = (sizes[Math.floor(sizes.length / 2)] || 12) * .96;
    const measureCanvas = document.createElement("canvas"), context = measureCanvas.getContext("2d")!;
    const layout = layoutTranslation(translation.text ?? "", regions, fontSize, (text, size) => paperFontRuns(text).reduce((total, run) => { context.font = `${paragraph.fontStyle} ${paragraph.fontWeight} ${size}px ${run.latin ? latinFont : fontFamily}`; return total + context.measureText(run.text).width; }, 0));
    return { regions, layout, colors: regions.map(region => backgroundAt(canvas, region, width, height)) };
  }, [paragraph, translation.text, canvas, width, height, fontFamily, latinFont]);
  const { regions, layout, colors } = composition, first = regions[0];
  if (!first) return null;
  if (!translation.text) return <div className="pf-inline-status" style={{ left: first.x, top: first.y }} role={translation.error ? "alert" : "status"}>
    {translation.pending ? <><span className="pf-loader"/>문단 번역 중…</> : <button onClick={onRetry} title={translation.error}>번역 재시도</button>}
  </div>;
  return <section className="pf-inline-paragraph pf-translated-text" aria-label="한국어 번역 문단" data-paragraph-id={paragraph.id} data-overflow={Boolean(layout.overflow)} style={{ fontFamily, fontSize: layout.fontSize, fontWeight: paragraph.fontWeight, fontStyle: paragraph.fontStyle }}>
    {regions.map((region, index) => <div key={index} className="pf-inline-region" data-inline-region style={{ left: region.x - .5, top: region.y - .5, width: region.width + 1, height: region.height + 1, backgroundColor: colors[index] }}>
      {layout.lines.filter(line => line.region === index).map((line, row) => <motion.span className="pf-inline-line" key={row} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .18 }} style={{ top: line.y + .5 }}>{paperFontRuns(line.text).map((run, part) => <span key={part} style={run.latin ? { fontFamily: latinFont } : undefined}>{run.text}</span>)}{" "}</motion.span>)}
      {layout.overflow?.region === index && <div className="pf-inline-overflow" tabIndex={0} aria-label="긴 번역 문단 · 스크롤하여 계속 읽기" style={{ lineHeight: `${layout.lineHeight}px` }}>{layout.overflow.text}</div>}
    </div>)}
    <motion.button className="pf-inline-original" aria-label="이 문단 원문 보기" onClick={onOriginal} whileTap={reduced ? undefined : { scale: .94 }} style={{ left: first.x + Math.max(0, first.width - 52), top: first.y - 23 }}>원문</motion.button>
  </section>;
}

export function InlineTranslationLayer({ paragraphs, translations, canvas, width, height, onOriginal, onRetry }: { paragraphs: PdfParagraph[]; translations: InlineTranslations; canvas: HTMLCanvasElement; width: number; height: number; onOriginal: (id: string) => void; onRetry: (paragraph: PdfParagraph) => void }) {
  return <div className="pf-inline-layer">{paragraphs.filter(paragraph => translations[paragraph.id]).map(paragraph => <TranslatedParagraph key={paragraph.id} paragraph={paragraph} translation={translations[paragraph.id]} canvas={canvas} width={width} height={height} onOriginal={() => onOriginal(paragraph.id)} onRetry={() => onRetry(paragraph)}/>)}</div>;
}
