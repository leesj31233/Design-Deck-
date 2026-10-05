"use client";
import * as React from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { loadPdfJs } from "@/lib/paperflow/pdf/pdfjs";
import { buildPageText } from "@/lib/paperflow/pdf/text-model";
import { createPageRuntime, type PageRuntime } from "@/lib/paperflow/pdf/dom-text";
import { highlightColor, type Highlight } from "@/lib/paperflow/types";
import { useShallow } from "zustand/react/shallow";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";

const MAX_CANVAS_PIXELS = 16_777_216;

export type PageSize = { width: number; height: number };

export const PdfPage = React.memo(function PdfPage({
  pdf,
  pageIndex,
  size,
  scale,
  active,
  highlights,
  onRuntime,
  onPainted,
}: {
  pdf: PDFDocumentProxy;
  pageIndex: number;
  size: PageSize;
  scale: number;
  active: boolean;
  highlights: Highlight[];
  onRuntime: (pageIndex: number, runtime: PageRuntime | null) => void;
  onPainted: (pageIndex: number, scale: number) => void;
}) {
  const pageRef = React.useRef<HTMLDivElement>(null);
  const canvasHostRef = React.useRef<HTMLDivElement>(null);
  const textLayerRef = React.useRef<HTMLDivElement>(null);
  const [painted, setPainted] = React.useState<number | null>(null);
  const cssWidth = Math.floor(size.width * scale);
  const cssHeight = Math.floor(size.height * scale);

  // Canvas: re-rendered per scale into an off-DOM canvas, then swapped in (no blank flash on zoom).
  React.useEffect(() => {
    if (!active) {
      canvasHostRef.current?.replaceChildren();
      setPainted(null);
      return;
    }
    let task: RenderTask | null = null;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageIndex + 1);
      if (cancelled) return;
      const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
      let outputScale = scale * dpr;
      const area = size.width * size.height * outputScale * outputScale;
      if (area > MAX_CANVAS_PIXELS) outputScale *= Math.sqrt(MAX_CANVAS_PIXELS / area);
      const viewport = page.getViewport({ scale: outputScale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.setAttribute("aria-hidden", "true");
      task = page.render({ canvas, viewport });
      try {
        await task.promise;
      } catch {
        return; // cancelled
      }
      if (cancelled) return;
      canvasHostRef.current?.replaceChildren(canvas);
      setPainted(scale);
      onPainted(pageIndex, scale);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageIndex, scale, active, size.width, size.height, onPainted]);

  // Text layer: positioned in %, sized by --total-scale-factor, so it survives zoom without re-render.
  React.useEffect(() => {
    const container = textLayerRef.current;
    const element = pageRef.current;
    if (!active || !container || !element) return;
    let cancelled = false;
    let layer: import("pdfjs-dist").TextLayer | null = null;
    (async () => {
      const [pdfjs, page] = await Promise.all([loadPdfJs(), pdf.getPage(pageIndex + 1)]);
      const content = await page.getTextContent();
      if (cancelled) return;
      container.replaceChildren();
      layer = new pdfjs.TextLayer({ textContentSource: content, container, viewport: page.getViewport({ scale: 1 }) });
      try {
        await layer.render();
      } catch {
        return;
      }
      if (cancelled) return;
      const end = document.createElement("div");
      end.className = "endOfContent";
      container.append(end);
      const items = content.items.filter((i): i is TextItem => "str" in i);
      onRuntime(
        pageIndex,
        createPageRuntime({
          pageIndex,
          element,
          textLayer: container,
          divs: layer.textDivs,
          model: buildPageText(items),
          width: size.width,
          height: size.height,
        }),
      );
    })();
    return () => {
      cancelled = true;
      layer?.cancel();
      container.replaceChildren();
      onRuntime(pageIndex, null);
    };
  }, [pdf, pageIndex, active, size.width, size.height, onRuntime]);

  return (
    <div
      ref={pageRef}
      data-page-index={pageIndex}
      className="pf-page mx-auto"
      role="region"
      aria-label={`Page ${pageIndex + 1}`}
      style={
        {
          width: cssWidth,
          height: cssHeight,
          "--total-scale-factor": scale,
          "--scale-factor": scale,
          "--scale-round-x": "1px",
          "--scale-round-y": "1px",
        } as React.CSSProperties
      }
    >
      <div ref={canvasHostRef} className="absolute inset-0" />
      {painted === null ? <div className="absolute inset-0 grid place-items-center text-[11px] text-neutral-400">Rendering page {pageIndex + 1}…</div> : null}
      <HighlightLayer highlights={highlights} />
      <div ref={textLayerRef} className="pf-text-layer" />
    </div>
  );
});

function HighlightLayer({ highlights }: { highlights: Highlight[] }) {
  // Subscribe only to this page's resolutions so other pages do not re-render.
  const resolutions = useReaderStore(useShallow((s) => Object.fromEntries(highlights.map((h) => [h.id, s.resolutions[h.id]]))));
  const activeId = useReaderStore((s) => (highlights.some((h) => h.id === s.activeHighlightId) ? s.activeHighlightId : null));
  return (
    <div className="pf-highlights" aria-hidden="true">
      {highlights.map((h) => {
        const resolution = resolutions[h.id];
        if (!resolution?.normalizedRects || resolution.status === "unresolved") return null;
        const color = highlightColor(h.color);
        return resolution.normalizedRects.map((r, i) => (
          <div
            key={`${h.id}-${i}`}
            className="pf-highlight"
            data-highlight-id={h.id}
            data-status={resolution.status}
            data-active={activeId === h.id}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%`, background: color.fill }}
          />
        ));
      })}
    </div>
  );
}
