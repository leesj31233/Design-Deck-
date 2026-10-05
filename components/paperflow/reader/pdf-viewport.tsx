"use client";
import * as React from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageRuntime } from "@/lib/paperflow/pdf/dom-text";
import { trimRange } from "@/lib/paperflow/pdf/text-model";
import type { Highlight } from "@/lib/paperflow/types";
import { record } from "@/lib/paperflow/perf";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { PdfPage, type PageSize } from "./pdf-page";

const PAGE_GAP = 20;
const PADDING_Y = 24;
const PADDING_X = 32;
/** CSS px per PDF point at 100% (pdf.js convention: 96 / 72). */
export const PT_TO_CSS = 96 / 72;

export function PdfViewport({
  pdf,
  sizes,
  highlights,
  runtimes,
  onRuntimeChange,
}: {
  pdf: PDFDocumentProxy;
  sizes: PageSize[];
  highlights: Highlight[];
  runtimes: React.RefObject<Map<number, PageRuntime>>;
  onRuntimeChange: (pageIndex: number, runtime: PageRuntime | null) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const zoom = useReaderStore((s) => s.zoom);
  const fit = useReaderStore((s) => s.fit);
  const navigation = useReaderStore((s) => s.navigation);
  const setVisiblePage = useReaderStore((s) => s.setVisiblePage);
  const setZoom = useReaderStore((s) => s.setZoom);
  const setSelection = useReaderStore((s) => s.setSelection);
  const setActiveHighlight = useReaderStore((s) => s.setActiveHighlight);
  const scale = (zoom / 100) * PT_TO_CSS;

  const [viewportBox, setViewportBox] = React.useState({ width: 0, height: 0 });
  const [range, setRange] = React.useState({ first: 0, last: 1 });
  const pendingNav = React.useRef<{ page: number; startedAt: number } | null>(null);
  const painted = React.useRef(new Map<number, number>());

  // Page offsets for the current scale.
  const offsets = React.useMemo(() => {
    const result: number[] = [];
    let y = PADDING_Y;
    for (const s of sizes) {
      result.push(y);
      y += Math.floor(s.height * scale) + PAGE_GAP;
    }
    result.push(y - PAGE_GAP + PADDING_Y);
    return result;
  }, [sizes, scale]);
  const totalHeight = offsets[offsets.length - 1] ?? 0;
  const maxWidth = Math.max(0, ...sizes.map((s) => s.width));

  // Resize tracking + fit modes.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setViewportBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    if (!fit || !viewportBox.width || !maxWidth) return;
    const widthZoom = ((viewportBox.width - PADDING_X * 2) / (maxWidth * PT_TO_CSS)) * 100;
    const firstHeight = sizes[0]?.height ?? 792;
    const pageZoom = ((viewportBox.height - PADDING_Y * 2) / (firstHeight * PT_TO_CSS)) * 100;
    const next = fit === "width" ? Math.min(widthZoom, 200) : Math.min(widthZoom, pageZoom);
    if (Math.abs(next - zoom) > 0.5) setZoom(next, fit);
  }, [fit, viewportBox, maxWidth, sizes, zoom, setZoom]);

  // Keep the reading position stable across zoom changes.
  const lastScale = React.useRef(scale);
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || lastScale.current === scale) return;
    const ratio = scale / lastScale.current;
    el.scrollTop = (el.scrollTop + el.clientHeight / 2) * ratio - el.clientHeight / 2;
    lastScale.current = scale;
  }, [scale]);

  // Visible page + render window (visible pages plus one before / two after for prefetch).
  const updateVisible = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el || sizes.length === 0) return;
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    const probe = top + el.clientHeight * 0.35;
    let first = 0;
    while (first < sizes.length - 1 && offsets[first + 1] <= top) first++;
    let last = first;
    while (last < sizes.length - 1 && offsets[last + 1] < bottom) last++;
    let current = first;
    while (current < sizes.length - 1 && offsets[current + 1] <= probe) current++;
    setRange((r) => {
      const next = { first: Math.max(0, first - 1), last: Math.min(sizes.length - 1, last + 2) };
      return r.first === next.first && r.last === next.last ? r : next;
    });
    if (!pendingNav.current) setVisiblePage(current + 1);
  }, [offsets, sizes.length, setVisiblePage]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateVisible);
    };
    updateVisible();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [updateVisible, viewportBox]);

  // Navigation requests (rail, shortcuts, palette). Instant jump: page turns must feel immediate.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !navigation) return;
    const index = navigation.page - 1;
    pendingNav.current = { page: index, startedAt: navigation.startedAt };
    el.scrollTo({ top: Math.max(0, offsets[index] - PADDING_Y + 4), behavior: "instant" as ScrollBehavior });
    updateVisible();
    requestAnimationFrame(() => {
      const nav = pendingNav.current;
      if (nav && nav.page === index && painted.current.get(index) === scale) {
        record("page-turn", performance.now() - nav.startedAt);
        pendingNav.current = null;
      }
    });
    // Offsets are read at request time only; re-running on zoom would re-jump.
  }, [navigation]);

  const onPainted = React.useCallback((pageIndex: number, paintedScale: number) => {
    painted.current.set(pageIndex, paintedScale);
    const nav = pendingNav.current;
    if (nav && nav.page === pageIndex) {
      record("page-turn", performance.now() - nav.startedAt);
      pendingNav.current = null;
    }
  }, []);

  const highlightsByPage = React.useMemo(() => {
    const map = new Map<number, Highlight[]>();
    for (const h of highlights) {
      const list = map.get(h.anchor.pageIndex) ?? [];
      list.push(h);
      map.set(h.anchor.pageIndex, list);
    }
    return map;
  }, [highlights]);

  // ---- Selection capture -------------------------------------------------------------
  const captureSelection = React.useCallback(
    (eventTime: number) => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const startPage = closestPage(range.startContainer);
      if (startPage === null) return setSelection(null);
      const runtime = runtimes.current.get(startPage);
      if (!runtime) return setSelection(null);
      const start = runtime.offsetFromPoint(range.startContainer, range.startOffset);
      const endPage = closestPage(range.endContainer);
      // Cross-page selections are clamped to the first page (anchors are single-page).
      const end = endPage === startPage ? runtime.offsetFromPoint(range.endContainer, range.endOffset) : runtime.model.text.length;
      const trimmed = trimRange(runtime.model.text, start, end);
      if (trimmed.end - trimmed.start < 1) return setSelection(null);
      const rects = runtime.measure(trimmed.start, trimmed.end);
      if (rects.length === 0) return setSelection(null);
      const pageBox = runtime.element.getBoundingClientRect();
      const sx = pageBox.width / runtime.width;
      const sy = pageBox.height / runtime.height;
      const firstRect = rects[0];
      const lastRect = rects[rects.length - 1];
      setSelection({
        pageIndex: startPage,
        start: trimmed.start,
        end: trimmed.end,
        quote: runtime.model.text.slice(trimmed.start, trimmed.end),
        pageText: runtime.model.text,
        rects,
        pageWidth: runtime.width,
        pageHeight: runtime.height,
        clientRect: {
          top: pageBox.top + firstRect.y * sy,
          bottom: pageBox.top + (lastRect.y + lastRect.height) * sy,
          left: pageBox.left + Math.min(...rects.map((r) => r.x)) * sx,
          right: pageBox.left + Math.max(...rects.map((r) => r.x + r.width)) * sx,
        },
        createdAt: eventTime,
      });
    },
    [runtimes, setSelection],
  );

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const layers = () => el.querySelectorAll<HTMLElement>(".pf-text-layer");
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest(".pf-page")) layers().forEach((l) => l.classList.add("selecting"));
    };
    const onUp = (e: PointerEvent) => {
      layers().forEach((l) => l.classList.remove("selecting"));
      if (!(e.target as HTMLElement).closest(".pf-page")) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelection(null);
        setActiveHighlight(hitTestHighlight(e.clientX, e.clientY));
        return;
      }
      captureSelection(e.timeStamp);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key.startsWith("Arrow")) captureSelection(e.timeStamp);
    };
    // Touch (iPad) selection handles do not emit pointerup on the page; follow selectionchange.
    let touchTimer = 0;
    const onSelectionChange = () => {
      if (!matchMedia("(pointer: coarse)").matches) return;
      window.clearTimeout(touchTimer);
      touchTimer = window.setTimeout(() => captureSelection(performance.now()), 120);
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("keyup", onKeyUp);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.clearTimeout(touchTimer);
    };
  }, [captureSelection, setSelection, setActiveHighlight]);

  // Scrolling moves the selection; dismiss the bar rather than leave it detached.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let lastTop = el.scrollTop;
    const onScroll = () => {
      if (Math.abs(el.scrollTop - lastTop) > 24 && useReaderStore.getState().selection) {
        useReaderStore.getState().setSelection(null);
      }
      lastTop = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      ref={scrollRef}
      id="pf-reader-viewport"
      tabIndex={0}
      aria-label="Document pages"
      className="dd-scrollbar dd-focus relative h-full overflow-auto bg-[var(--pf-workspace)] outline-none"
    >
      <div className="relative" style={{ height: totalHeight, minWidth: Math.floor(maxWidth * scale) + PADDING_X * 2 }}>
        {sizes.map((size, i) => (
          <div key={i} className="absolute inset-x-0" style={{ top: offsets[i], paddingInline: PADDING_X }}>
            <PdfPage
              pdf={pdf}
              pageIndex={i}
              size={size}
              scale={scale}
              active={i >= range.first && i <= range.last}
              highlights={highlightsByPage.get(i) ?? EMPTY}
              onRuntime={onRuntimeChange}
              onPainted={onPainted}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const EMPTY: Highlight[] = [];

function closestPage(node: Node): number | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const page = el?.closest<HTMLElement>("[data-page-index]");
  return page ? Number(page.dataset.pageIndex) : null;
}

function hitTestHighlight(x: number, y: number): string | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(".pf-highlight"))) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el.dataset.highlightId ?? null;
  }
  return null;
}
