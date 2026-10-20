"use client";
import { useEffect, useState } from "react";
import { annotationColors } from "@/lib/paperflow/anchors/types";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";

/**
 * Highlighter colour while dragging: Ctrl steps through the colours, 1–5 picks one. A small chip
 * follows the pointer during the drag; the colour sticks for the next drag.
 */
export function HighlightColorChip() {
  const tool = useReaderStore(state => state.tool), color = useReaderStore(state => state.highlightColor);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (tool !== "highlight") return;
    let dragging = false, hide: ReturnType<typeof setTimeout> | undefined;
    const choose = (next: (typeof annotationColors)[number]) => { useReaderStore.getState().set({ highlightColor: next }); setPulse(value => value + 1); };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element) || !event.target.closest("[data-pdf-page]")) return;
      dragging = true; clearTimeout(hide); setPointer({ x: event.clientX, y: event.clientY });
    };
    const move = (event: PointerEvent) => { if (dragging) setPointer({ x: event.clientX, y: event.clientY }); };
    const up = () => { if (!dragging) return; dragging = false; hide = setTimeout(() => setPointer(null), 500); };
    const key = (event: KeyboardEvent) => {
      if (!dragging) return;
      const current = useReaderStore.getState().highlightColor;
      if (event.key === "Control" && !event.repeat) choose(annotationColors[(annotationColors.indexOf(current) + 1) % annotationColors.length]);
      else if (/^[1-5]$/.test(event.key)) { event.preventDefault(); choose(annotationColors[Number(event.key) - 1]); }
    };
    document.addEventListener("pointerdown", down, true); document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true); document.addEventListener("keydown", key, true);
    return () => {
      clearTimeout(hide);
      document.removeEventListener("pointerdown", down, true); document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true); document.removeEventListener("keydown", key, true);
    };
  }, [tool]);
  if (tool !== "highlight" || !pointer) return null;
  return <div className="pf-hl-chip dd-glass" style={{ left: pointer.x + 16, top: pointer.y + 20 }} aria-hidden="true">
    {annotationColors.map((value, index) => <span key={value} data-color={value} data-active={value === color || undefined} title={`${index + 1}`}><i key={value === color ? pulse : 0}/></span>)}
    <em>Ctrl</em>
  </div>;
}
