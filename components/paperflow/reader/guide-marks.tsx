"use client";
import { useMemo } from "react";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { useTranslationStore } from "@/lib/paperflow/translation/translation-store";
import type { ParagraphLine } from "@/lib/paperflow/layout/types";

const squash = (text: string) => text.toLowerCase().replace(/[\s ]+/g, " ").replace(/[‐-―]/g, "-").trim();

/**
 * Lines of a block that hold the quoted sentence. Line texts are not kept in the manifest, so the
 * quote's character span is mapped onto the lines by their printed widths. Without a quote, or when it is not in this block, null.
 */
export function quoteLines(text: string, lines: ParagraphLine[], quote: string | undefined): ParagraphLine[] | null {
  if (!quote || !lines.length) return null;
  const body = squash(text), needle = squash(quote), start = body.indexOf(needle);
  if (start < 0) return null;
  // Characters map onto lines by their printed width (a short last line holds less text).
  const total = lines.reduce((sum, line) => sum + line.width, 0);
  const lineAt = (offset: number) => { const target = offset / body.length * total; let cumulative = 0; for (let index = 0; index < lines.length; index++) { cumulative += lines[index].width; if (cumulative > target) return index; } return lines.length - 1; };
  return lines.slice(lineAt(start), lineAt(start + needle.length - 1) + 1);
}

/** The source of the guide item being explained, marked on its page: the quoted lines, else the whole paragraph. */
export function GuideMarks({ pageIndex }: { pageIndex: number }) {
  const focus = useReaderStore(s => s.guideFocus);
  const manifest = useTranslationStore(s => s.manifest);
  const rects = useMemo(() => {
    if (!focus || !manifest) return [];
    const unitBlocks = manifest.blocks.filter(block => block.unitId === focus.unitId);
    const quoted = unitBlocks.map(block => ({ block, lines: quoteLines(block.text, block.lines, focus.quote) })).filter(item => item.lines);
    // The quote may sit on another page of a paragraph that spans two: then this page shows nothing.
    if (quoted.length) return quoted.filter(item => item.block.pageIndex === pageIndex).flatMap(item => item.lines!.map((line, index) => ({ id: `${item.block.id}:${index}`, ...line })));
    return unitBlocks.filter(block => block.pageIndex === pageIndex).map(block => ({ id: block.id, x: block.x, y: block.y, width: block.width, height: block.height }));
  }, [focus, manifest, pageIndex]);
  if (!focus || !rects.length) return null;
  return <div className="pf-guide-marks" key={focus.key} aria-hidden="true">
    {rects.map(rect => <span key={rect.id} data-guide-mark={focus.unitId} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}/>)}
  </div>;
}
