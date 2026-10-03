"use client";
import { useEffect, useState } from "react";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";

/**
 * A curved arrow from the marked source paragraph to its guide card in the right panel,
 * following scroll and resize. Hidden whenever either end is off screen.
 */
export function GuideArrow() {
  const focus = useReaderStore(s => s.guideFocus);
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    if (!focus) { setPath(null); return; }
    let frame = 0, last = "";
    const tick = () => {
      const marks = [...document.querySelectorAll<HTMLElement>(`[data-guide-mark="${CSS.escape(focus.unitId)}"]`)];
      const card = document.querySelector<HTMLElement>(`[data-guide-item="${CSS.escape(focus.item)}"]`);
      let next = "";
      if (marks.length && card) {
        const box = marks.map(mark => { const rect = mark.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, right: rect.right, left: rect.left }; }).reduce((a, b) => ({ top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), right: Math.max(a.right, b.right), left: Math.min(a.left, b.left) }));
        const target = card.getBoundingClientRect(), height = window.innerHeight;
        const visible = box.bottom > 0 && box.top < height && target.bottom > 0 && target.top < height && target.left > box.right;
        if (visible) {
          const sx = box.right + 4, sy = Math.max(12, Math.min(height - 12, (Math.max(box.top, 0) + Math.min(box.bottom, height)) / 2));
          const ex = target.left - 6, ey = target.top + Math.min(26, target.height / 2), bend = Math.max(40, (ex - sx) * .45);
          next = `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${(sx + bend).toFixed(1)} ${sy.toFixed(1)}, ${(ex - bend).toFixed(1)} ${ey.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}`;
        }
      }
      if (next !== last) { last = next; setPath(next || null); }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [focus]);
  if (!path) return null;
  return <svg className="pf-guide-arrow" aria-hidden="true">
    <defs><marker id="pf-guide-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z"/></marker></defs>
    <path className="pf-guide-arrow-glow" d={path}/>
    <path className="pf-guide-arrow-line" d={path} markerEnd="url(#pf-guide-head)"/>
  </svg>;
}
