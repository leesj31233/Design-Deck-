"use client";
import { useEffect, useRef, useState } from "react";
import type { PdfPageHandle } from "@/lib/paperflow/pdf/pdf-adapter";
import { captureSelection, textIndex } from "@/lib/paperflow/pdf/selection-geometry";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { recoverAnchor } from "@/lib/paperflow/anchors/recover-anchor";
import type { Annotation } from "@/lib/paperflow/anchors/types";
import { readableError } from "@/lib/paperflow/errors";
import { HighlightLayer, type ResolvedAnnotation } from "./highlight-layer";
import { usePaperflow } from "../shell/paperflow-context";
import { extractParagraphs, type PdfParagraph } from "@/lib/paperflow/translation/paragraphs";
export function PdfPage({ page, scale, documentId, pageIndex, annotations, selected, onResolved, onParagraphs, onParagraph }: { page: PdfPageHandle; scale: number; documentId: string; pageIndex: number; annotations: Annotation[]; selected?: string; onResolved: (results: ResolvedAnnotation[]) => void; onParagraphs: (paragraphs: PdfParagraph[]) => void; onParagraph: (paragraph: PdfParagraph) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), layer = useRef<HTMLDivElement>(null), surface = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false), [textReady, setTextReady] = useState(false), [error, setError] = useState("");
  const [resolved, setResolved] = useState<ResolvedAnnotation[]>([]);
  const { notify } = usePaperflow();
  useEffect(() => {
    const controller = new AbortController(), canvasNode = canvas.current!, layerNode = layer.current!;
    setReady(false); setTextReady(false); setError("");
    const started = performance.now();
    void page.render(canvasNode, scale, controller.signal).then(async () => {
      if (controller.signal.aborted) return;
      setReady(true); performance.measure("paperflow:page-render", { start: started });
      try { await page.renderText(layerNode, scale, controller.signal); if (!controller.signal.aborted) setTextReady(true); }
      catch (reason) { if (!controller.signal.aborted) setError(`원문은 표시되지만 텍스트 레이어를 불러오지 못했습니다: ${readableError(reason)}`); }
    }).catch(reason => { if (!controller.signal.aborted) setError(`페이지를 표시하지 못했습니다: ${readableError(reason)}`); });
    return () => { controller.abort(); layerNode.replaceChildren(); canvasNode.width = 0; canvasNode.height = 0; };
  }, [page, scale]);
  useEffect(() => {
    if (!textReady || !surface.current || !layer.current) return;
    const paragraphs = extractParagraphs(layer.current, surface.current, pageIndex);
    onParagraphs(paragraphs);
    const index = textIndex(layer.current, surface.current);
    const results = annotations.filter(a => a.pageIndex === pageIndex).map(annotation => ({ annotation, recovery: recoverAnchor(annotation.anchor, { ...index, documentId, pageIndex }) }));
    setResolved(results); onResolved(results);
  }, [annotations, textReady, scale, documentId, pageIndex, onResolved, onParagraphs]);
  useEffect(() => {
    if (!textReady) return;
    const handle = () => {
      const selection = window.getSelection();
      if (!selection || !surface.current || !layer.current) return;
      if (selection.isCollapsed) {
        if (!document.activeElement?.closest("[data-selection-ui], [data-inspector]")) useReaderStore.getState().set({ activeSelection: null });
        return;
      }
      // Ignore selections made in the inspector rather than replacing the source.
      if (!layer.current.contains(selection.anchorNode)) return;
      try { const start = performance.now(); performance.mark("paperflow:selection-start"); const anchor = captureSelection(selection, surface.current, layer.current, documentId, pageIndex); useReaderStore.getState().set({ activeSelection: anchor }); if (anchor) performance.measure("paperflow:selection-capture", { start }); }
      catch (reason) { notify(readableError(reason)); }
    };
    document.addEventListener("selectionchange", handle);
    return () => document.removeEventListener("selectionchange", handle);
  }, [textReady, documentId, pageIndex, notify]);
  const openParagraph = (target: EventTarget | null) => {
    if (!layer.current || !target || !(target instanceof Element) || window.getSelection()?.toString().trim()) return;
    const id = target.closest<HTMLElement>("[data-pf-paragraph]")?.dataset.pfParagraph;
    if (!id) return;
    const paragraphs = extractParagraphs(layer.current, surface.current!, pageIndex);
    const paragraph = paragraphs.find(item => item.id === id);
    if (paragraph) onParagraph(paragraph);
  };
  return <div className="pf-page-wrap"><div ref={surface} className="pf-pdf-page" data-pdf-page={pageIndex} data-ready={ready && textReady} style={{ width: page.width * scale, height: page.height * scale, "--scale-factor": scale, "--total-scale-factor": scale } as React.CSSProperties}>
    {!ready && !error && <div className="pf-page-loading" role="status">원문 페이지를 불러오는 중…</div>}
    <canvas ref={canvas} aria-label={`원본 PDF ${pageIndex + 1}페이지`} style={{ width: "100%", height: "100%" }}/>
    <div ref={layer} className="textLayer" aria-label={`선택 가능한 원문 ${pageIndex + 1}페이지`} onClick={event => openParagraph(event.target)}/>
    {textReady && <HighlightLayer annotations={resolved} selected={selected}/>}
  </div>{error && <p className="pf-error" role="alert">{error}</p>}{textReady && !layer.current?.textContent?.trim() && <p className="pf-page-notice">이미지 기반 페이지입니다. 텍스트 선택에는 OCR이 필요합니다.</p>}</div>;
}
