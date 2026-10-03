"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PdfPageHandle } from "@/lib/paperflow/pdf/pdf-adapter";
import { captureSelection, textIndex } from "@/lib/paperflow/pdf/selection-geometry";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { recoverAnchor } from "@/lib/paperflow/anchors/recover-anchor";
import type { Annotation } from "@/lib/paperflow/anchors/types";
import { readableError } from "@/lib/paperflow/errors";
import { useTranslationStore } from "@/lib/paperflow/translation/translation-store";
import { HighlightLayer, type ResolvedAnnotation } from "./highlight-layer";
import { InkLayer } from "./ink-layer";
import { TranslationOverlay, type OverlayState } from "./translation-overlay";
import { GuideMarks } from "./guide-marks";
import { linkInk } from "@/lib/paperflow/typeset/ink";
import { usePaperflow } from "../shell/paperflow-context";

export interface PdfPageProps {
  page: PdfPageHandle; scale: number; documentId: string; pageIndex: number;
  annotations: Annotation[]; selected?: string;
  onResolved: (pageIndex: number, results: ResolvedAnnotation[]) => void;
  /** A click on source text: the unit under the pointer. */
  onUnit: (unitId: string) => void;
  onOriginal: (unitId: string) => void;
  onRetry: (unitId: string) => void;
}

export const PdfPage = memo(function PdfPage({ page, scale, documentId, pageIndex, annotations, selected, onResolved, onUnit, onOriginal, onRetry }: PdfPageProps) {
  const canvas = useRef<HTMLCanvasElement>(null), layer = useRef<HTMLDivElement>(null), surface = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false), [textReady, setTextReady] = useState(false), [error, setError] = useState("");
  const [canvasVersion, setCanvasVersion] = useState(0), [overlay, setOverlay] = useState<OverlayState>("none"), [patience, setPatience] = useState(true);
  const [resolved, setResolved] = useState<ResolvedAnnotation[]>([]);
  const [linkColors, setLinkColors] = useState<{ reference?: string; citation?: string }>({});
  const { notify } = usePaperflow();
  const pageAnnotations = useMemo(() => annotations.filter(annotation => annotation.pageIndex === pageIndex), [annotations, pageIndex]);
  // A translated page keeps its paper hidden until the Korean layer is painted: no English flash on revisit.
  const expectsTranslation = useTranslationStore(state => state.showTranslations && Boolean(state.manifest?.units.some(unit => unit.pages.includes(pageIndex) && state.texts.has(unit.id) && !state.hidden.has(unit.id))));
  const markUnits = useMemo(() => pageAnnotations.filter(annotation => annotation.anchor.surface === "translation").map(annotation => annotation.anchor.paragraphId ?? ""), [pageAnnotations]);
  // Primitive selector: a finished batch elsewhere in the paper does not re-render this page.
  const visibleMarks = useTranslationStore(state => state.showTranslations ? markUnits.filter(id => state.texts.has(id) && !state.hidden.has(id)).join(",") : "");

  useEffect(() => {
    const controller = new AbortController(), canvasNode = canvas.current!, layerNode = layer.current!;
    setReady(false); setTextReady(false); setError("");
    const started = performance.now();
    void page.render(canvasNode, scale, controller.signal).then(async () => {
      if (controller.signal.aborted) return;
      setReady(true); setCanvasVersion(version => version + 1); performance.measure("paperflow:page-render", { start: started });
      try { await page.renderText(layerNode, scale, controller.signal); if (!controller.signal.aborted) setTextReady(true); }
      catch (reason) { if (!controller.signal.aborted) setError(`원문은 표시되지만 텍스트 레이어를 불러오지 못했습니다: ${readableError(reason)}`); }
    }).catch(reason => { if (!controller.signal.aborted) setError(`페이지를 표시하지 못했습니다: ${readableError(reason)}`); });
    return () => { controller.abort(); layerNode.replaceChildren(); canvasNode.width = 0; canvasNode.height = 0; };
  }, [page, scale]);

  // Journals often print "Figure 3" and citations in a link colour; carry it into the Korean text.
  useEffect(() => {
    if (!textReady || !layer.current || !surface.current || !canvas.current) return;
    const bounds = surface.current.getBoundingClientRect(), spans = Array.from(layer.current.querySelectorAll<HTMLElement>("span"));
    const colourOf = (span: HTMLElement) => {
      const box = span.getBoundingClientRect();
      return linkInk(canvas.current!, { x: (box.left - bounds.left) / bounds.width * page.width, y: (box.top - bounds.top) / bounds.height * page.height, width: box.width / bounds.width * page.width, height: box.height / bounds.height * page.height }, page.width);
    };
    const reference = spans.find(span => /^(?:Figures?|Fig\.|Tables?|Equations?|eqs?)\s*\d/i.test(span.textContent ?? "") && colourOf(span));
    const citation = spans.find(span => /^\[?\d+(?:[,–-]\d+)*\]?$/.test(span.textContent?.trim() ?? "") && colourOf(span));
    setLinkColors({ reference: reference && colourOf(reference), citation: citation && colourOf(citation) });
  }, [textReady, canvasVersion, page]);

  // Highlights on the source text: recovered once per text layer / annotation change, not per translation.
  useEffect(() => {
    if (!textReady || !surface.current || !layer.current) return;
    const index = textIndex(layer.current, surface.current);
    const results = pageAnnotations.filter(a => a.type === "highlight" && a.anchor.surface !== "translation").map(annotation => ({ annotation, recovery: recoverAnchor(annotation.anchor, { ...index, documentId, pageIndex }) }));
    setResolved(results); onResolved(pageIndex, results);
  }, [pageAnnotations, textReady, scale, documentId, pageIndex, onResolved]);

  useEffect(() => {
    if (!textReady) return;
    const handle = () => {
      const selection = window.getSelection();
      if (!selection || !surface.current || !layer.current) return;
      if (selection.isCollapsed) {
        if (!document.activeElement?.closest("[data-selection-ui], [data-inspector]")) useReaderStore.getState().set({ activeSelection: null });
        return;
      }
      const element = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
      const translated = element?.closest<HTMLElement>("[data-paragraph-id]");
      if (translated && surface.current.contains(translated)) {
        const anchor = captureSelection(selection, surface.current, translated, documentId, pageIndex);
        if (anchor) {
          const unitId = translated.dataset.paragraphId;
          anchor.surface = "translation"; anchor.paragraphId = unitId;
          anchor.sourceQuote = useTranslationStore.getState().manifest?.units.find(unit => unit.id === unitId)?.text;
          useReaderStore.getState().set({ activeSelection: anchor });
        }
        return;
      }
      if (!layer.current.contains(selection.anchorNode)) return;
      try { const start = performance.now(); const anchor = captureSelection(selection, surface.current, layer.current, documentId, pageIndex); useReaderStore.getState().set({ activeSelection: anchor }); if (anchor) performance.measure("paperflow:selection-capture", { start }); }
      catch (reason) { notify(readableError(reason)); }
    };
    document.addEventListener("selectionchange", handle);
    return () => document.removeEventListener("selectionchange", handle);
  }, [textReady, documentId, pageIndex, notify]);

  /** Geometry hit-test against the manifest: no per-span DOM labelling, no layout reads per span. */
  const openUnit = useCallback((event: React.MouseEvent) => {
    if (!surface.current || window.getSelection()?.toString().trim()) return;
    const manifest = useTranslationStore.getState().manifest;
    if (!manifest) return;
    const bounds = surface.current.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width, y = (event.clientY - bounds.top) / bounds.height;
    const block = manifest.blocks.find(item => item.pageIndex === pageIndex && item.translatable && item.lines.some(line => x >= line.x - .006 && x <= line.x + line.width + .006 && y >= line.y - .004 && y <= line.y + line.height + .004));
    if (block?.unitId) onUnit(block.unitId);
  }, [pageIndex, onUnit]);

  const translationMarks = useMemo(() => { const visible = new Set(visibleMarks.split(",")); return pageAnnotations.filter(a => a.anchor.surface === "translation" && visible.has(a.anchor.paragraphId ?? "")).map(annotation => ({ annotation, recovery: { status: "resolved" as const, method: "geometry" as const, confidence: 1, rects: annotation.anchor.normalizedRects } })); }, [pageAnnotations, visibleMarks]);
  // Hide the paper only briefly while its Korean layer is being set; never longer than 1.2 s.
  useEffect(() => { if (overlay !== "pending") return; setPatience(true); const timer = setTimeout(() => setPatience(false), 1200); return () => clearTimeout(timer); }, [overlay]);
  const overlayReady = overlay === "ready";
  const hideSource = expectsTranslation && overlay === "pending" && patience;

  return <div className="pf-page-wrap"><div ref={surface} className="pf-pdf-page" data-pdf-page={pageIndex} data-ready={ready && textReady} data-translated={overlayReady || undefined} style={{ width: page.width * scale, height: page.height * scale, "--scale-factor": scale, "--total-scale-factor": scale } as React.CSSProperties}>
    {!ready && !error && <div className="pf-page-loading" role="status">원문 페이지를 불러오는 중…</div>}
    <canvas ref={canvas} aria-label={`원본 PDF ${pageIndex + 1}페이지`} style={{ width: "100%", height: "100%", visibility: hideSource ? "hidden" : "visible" }}/>
    <div ref={layer} className="textLayer" aria-label={`선택 가능한 원문 ${pageIndex + 1}페이지`} onClick={openUnit}/>
    {textReady && <HighlightLayer annotations={resolved} selected={selected}/>}
    {ready && <TranslationOverlay documentId={documentId} pageIndex={pageIndex} scale={scale} canvas={canvas.current} canvasVersion={canvasVersion} referenceColor={linkColors.reference} citationColor={linkColors.citation} onState={setOverlay} onOriginal={onOriginal} onRetry={onRetry}/>}
    {textReady && translationMarks.length > 0 && <div className="pf-translated-marks"><HighlightLayer annotations={translationMarks} selected={selected}/></div>}
    <GuideMarks pageIndex={pageIndex}/>
    <InkLayer documentId={documentId} pageIndex={pageIndex} annotations={annotations}/>
  </div>{error && <p className="pf-error" role="alert">{error}</p>}{textReady && !layer.current?.textContent?.trim() && <p className="pf-page-notice">이미지 기반 페이지입니다. 텍스트 선택에는 OCR이 필요합니다.</p>}</div>;
});
