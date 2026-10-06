"use client";
import { useEffect, useState, type RefObject } from "react";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { useTranslationStore } from "@/lib/paperflow/translation/translation-store";
import { locateQuote } from "@/lib/paperflow/guide/locate";
import { textIndex } from "@/lib/paperflow/pdf/selection-geometry";
import type { Rect } from "@/lib/paperflow/anchors/types";

/**
 * The source of the guide item being explained, marked on its page: the quoted words found in the
 * PDF.js text layer, else the whole paragraph.
 */
export function GuideMarks({ pageIndex, textReady, layer, surface }: { pageIndex: number; textReady: boolean; layer: RefObject<HTMLElement | null>; surface: RefObject<HTMLElement | null> }) {
  const focus = useReaderStore(s => s.guideFocus);
  const manifest = useTranslationStore(s => s.manifest);
  const [rects, setRects] = useState<(Rect & { id: string })[]>([]);
  useEffect(() => {
    if (!focus || !manifest || focus.page - 1 !== pageIndex) { setRects([]); return; }
    if (focus.quote && textReady && layer.current && surface.current) {
      const index = textIndex(layer.current, surface.current), at = locateQuote(index.text, focus.quote);
      if (at) { setRects(index.rectsFor(at.start, at.length).map((rect, order) => ({ id: `q${order}`, ...rect }))); return; }
    }
    setRects(manifest.blocks.filter(block => block.unitId === focus.unitId && block.pageIndex === pageIndex).map(block => ({ id: block.id, x: block.x, y: block.y, width: block.width, height: block.height })));
  }, [focus, manifest, pageIndex, textReady, layer, surface]);
  if (!focus || !rects.length) return null;
  return <div className="pf-guide-marks" key={focus.key} aria-hidden="true">
    {rects.map(rect => <span key={rect.id} data-guide-mark={focus.unitId} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}/>)}
  </div>;
}
