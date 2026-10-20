"use client";
import { useEffect, useRef } from "react";
import { nextMark, type ScreenMark } from "@/lib/paperflow/guide/next-mark";

/** Where a highlight lands after a jump: this share of the viewport's height from its top. */
const READING_LINE = .42;
/** A press within this time after a jump measures from the mark being scrolled to, not the moving page. */
const IN_FLIGHT_MS = 700;

type Anchors = Record<number, { key: string; number: number; y: number }[]>;

/**
 * Keyboard reading through the AI guide's highlights: g toggles the guide; with it on, j or ] (and
 * Shift+↓) brings the next highlight below the reading line to 42% of the viewport, k or [ (and
 * Shift+↑) the previous one. Keys are left alone while typing or with Ctrl, Meta or Alt held.
 */
export function GuideKeys({ enabled, toggle, anchors }: { enabled: boolean; toggle: () => void; anchors: () => Anchors }): null {
  const props = useRef({ enabled, toggle, anchors });
  useEffect(() => { props.current = { enabled, toggle, anchors }; });
  const last = useRef<{ key: string; page: number; at: number } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
      const { enabled, toggle, anchors } = props.current;
      if (event.key === "g" && !event.shiftKey) { event.preventDefault(); toggle(); return; }
      if (!enabled) return;
      const direction = event.key === "j" || event.key === "]" || (event.shiftKey && event.key === "ArrowDown") ? 1
        : event.key === "k" || event.key === "[" || (event.shiftKey && event.key === "ArrowUp") ? -1 : 0;
      if (!direction) return;
      const viewport = document.querySelector<HTMLElement>("[data-pdf-viewport]");
      if (!viewport) return;
      // Every highlight's position on screen, from its page's box.
      const marks: ScreenMark[] = [];
      for (const [index, items] of Object.entries(anchors())) {
        const page = document.querySelector<HTMLElement>(`[data-pdf-page="${index}"]`);
        if (!page) continue;
        const box = page.getBoundingClientRect();
        for (const item of items) marks.push({ page: Number(index), key: item.key, screenY: box.top + item.y * box.height });
      }
      const frame = viewport.getBoundingClientRect(), line = frame.top + frame.height * READING_LINE;
      // Pressed again while still scrolling: step on from the mark on its way, not from where the page is now.
      const flying = last.current && performance.now() - last.current.at < IN_FLIGHT_MS ? marks.find(mark => mark.key === last.current!.key && mark.page === last.current!.page) : undefined;
      const next = nextMark(marks, flying?.screenY ?? line, direction);
      event.preventDefault();
      if (!next) return;
      last.current = { key: next.key, page: next.page, at: performance.now() };
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      viewport.scrollBy({ top: next.screenY - line, behavior: reduced ? "auto" : "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
