"use client";
import { InkLayer } from "./ink-layer";
import { useEffect, useRef, useState } from "react";
import type { PdfPageHandle } from "@/lib/paperflow/pdf/pdf-adapter";
import { captureSelection, textIndex } from "@/lib/paperflow/pdf/selection-geometry";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { recoverAnchor } from "@/lib/paperflow/anchors/recover-anchor";
import type { Annotation } from "@/lib/paperflow/anchors/types";
import { readableError } from "@/lib/paperflow/errors";
import { HighlightLayer, type ResolvedAnnotation } from "./highlight-layer";
import { usePaperflow } from "../shell/paperflow-context";
import type { PdfParagraph } from "@/lib/paperflow/translation/paragraphs";
import { buildPageBlocks, manifestRepository } from "@/lib/paperflow/translation/manifest";
import { InlineTranslationLayer, type InlineTranslations, type TranslationContinuation } from "./inline-translation-layer";
import { translationSourceKey } from "@/lib/paperflow/persistence/translation-repository";
function paragraphInk(canvas: HTMLCanvasElement | null, paragraph: PdfParagraph): string | undefined {
  const context = canvas?.getContext("2d", { willReadFrequently: true });
  if (!canvas || !context || paragraph.kind !== "title") return;
  const line = paragraph.lines[0], votes = new Map<string, number>();
  try {
    const x = Math.max(0, Math.floor(line.x * canvas.width)), y = Math.max(0, Math.floor(line.y * canvas.height));
    const width = Math.min(canvas.width - x, Math.max(1, Math.ceil(line.width * canvas.width))), height = Math.min(canvas.height - y, Math.max(1, Math.ceil(line.height * canvas.height)));
    const data = context.getImageData(x, y, width, height).data;
    for (let row = 0; row < height; row += 3) for (let col = 0; col < width; col += 3) {
      const offset = (row * width + col) * 4, r = data[offset], g = data[offset + 1], b = data[offset + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) < 40 || Math.min(r, g, b) > 180 || !(b > r * 1.25 && b > g * 1.05)) continue;
      const key = [r, g, b].map(value => Math.floor(value / 24) * 24).join(","); votes.set(key, (votes.get(key) ?? 0) + 1);
    }
    const color = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
    return color ? `rgb(${color})` : undefined;
  } catch { return; }
}
export function PdfPage({ page, scale, documentId, pageIndex, annotations, selected, onResolved, onParagraphs, onParagraph, translations, sourceTranslations, originalParagraphs, onOriginal }: { page: PdfPageHandle; scale: number; documentId: string; pageIndex: number; annotations: Annotation[]; selected?: string; onResolved: (results: ResolvedAnnotation[]) => void; onParagraphs: (paragraphs: PdfParagraph[]) => void; onParagraph: (paragraph: PdfParagraph) => void; translations: InlineTranslations; sourceTranslations: InlineTranslations; originalParagraphs: string[]; onOriginal: (id: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), layer = useRef<HTMLDivElement>(null), surface = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false), [textReady, setTextReady] = useState(false), [error, setError] = useState("");
  const [resolved, setResolved] = useState<ResolvedAnnotation[]>([]);
  const [paragraphs, setParagraphs] = useState<PdfParagraph[]>([]);
  const [obstacles, setObstacles] = useState<PdfParagraph[]>([]), [continuations, setContinuations] = useState<TranslationContinuation[]>([]);
  const { notify } = usePaperflow();
  const visibleTranslations: InlineTranslations = {};
  for (const paragraph of paragraphs) {
    if (originalParagraphs.includes(paragraph.id)) continue;
    const value = translations[paragraph.id] ?? sourceTranslations[paragraph.id] ?? sourceTranslations[translationSourceKey(paragraph.pageIndex, paragraph.text)];
    if (value) visibleTranslations[paragraph.id] = value;
  }
  const restoring = Object.keys(sourceTranslations).some(key => key.startsWith(`${pageIndex}:`)) && (!textReady || !paragraphs.length);
  useEffect(() => {
    const controller = new AbortController(), canvasNode = canvas.current!, layerNode = layer.current!;
    setReady(false); setTextReady(false); setError(""); setContinuations([]);
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
    let active = true;
    void (async () => {
      const stored = await manifestRepository.get(documentId);
      const blocks = stored?.blocks.filter(block => block.pageIndex === pageIndex) ?? await buildPageBlocks(documentId, pageIndex, await page.getTextItems(), page.width, page.height);
      if (!active || !surface.current || !layer.current) return;
      const paragraphs = blocks.filter(block => block.translatable).map(block => ({ ...block, color: paragraphInk(canvas.current, block) }));
      setObstacles(blocks.filter(block => !block.translatable));
      const bounds = surface.current.getBoundingClientRect();
      for (const span of layer.current.querySelectorAll<HTMLElement>("span")) {
        const rect = span.getBoundingClientRect(), x = (rect.left + rect.width / 2 - bounds.left) / bounds.width, y = (rect.top + rect.height / 2 - bounds.top) / bounds.height;
        const paragraph = paragraphs.find(block => block.lines.some(line => x >= line.x - .008 && x <= line.x + line.width + .008 && y >= line.y - .008 && y <= line.y + line.height + .008));
        if (paragraph) { span.dataset.pfParagraph = paragraph.id; span.dataset.pfKind = paragraph.kind; }
      }
      setParagraphs(paragraphs); onParagraphs(paragraphs);
    })().catch(reason => { if (active) setError(`문단 분석 실패: ${readableError(reason)}`); });
    const index = textIndex(layer.current, surface.current);
    const results = annotations.filter(a => a.type === "highlight" && a.pageIndex === pageIndex && a.anchor.surface !== "translation").map(annotation => ({ annotation, recovery: recoverAnchor(annotation.anchor, { ...index, documentId, pageIndex }) }));
    setResolved(results); onResolved(results);
    return () => { active = false; };
  }, [annotations, textReady, scale, documentId, pageIndex, page, onResolved, onParagraphs]);
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
      const element = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
      const translated = element?.closest<HTMLElement>("[data-paragraph-id]");
      if (translated && surface.current.contains(translated)) {
        const anchor = captureSelection(selection, surface.current, translated, documentId, pageIndex);
        if (anchor) { anchor.surface = "translation"; anchor.paragraphId = translated.dataset.paragraphId; anchor.sourceQuote = paragraphs.find(item => item.id === anchor.paragraphId)?.text; useReaderStore.getState().set({ activeSelection: anchor }); }
        return;
      }
      if (!layer.current.contains(selection.anchorNode)) return;
      try { const start = performance.now(); performance.mark("paperflow:selection-start"); const anchor = captureSelection(selection, surface.current, layer.current, documentId, pageIndex); useReaderStore.getState().set({ activeSelection: anchor }); if (anchor) performance.measure("paperflow:selection-capture", { start }); }
      catch (reason) { notify(readableError(reason)); }
    };
    document.addEventListener("selectionchange", handle);
    return () => document.removeEventListener("selectionchange", handle);
  }, [textReady, documentId, pageIndex, notify, paragraphs]);
  const openParagraph = (target: EventTarget | null) => {
    if (!layer.current || !target || !(target instanceof Element) || window.getSelection()?.toString().trim()) return;
    const id = target.closest<HTMLElement>("[data-pf-paragraph]")?.dataset.pfParagraph;
    if (!id) return;
    const paragraph = paragraphs.find(item => item.id === id);
    if (paragraph && paragraph.kind !== "skip") onParagraph(paragraph);
  };
  return <div className="pf-page-wrap"><div ref={surface} className="pf-pdf-page" data-pdf-page={pageIndex} data-ready={ready && textReady} style={{ width: page.width * scale, height: page.height * scale, "--scale-factor": scale, "--total-scale-factor": scale } as React.CSSProperties}>
    {!ready && !error && <div className="pf-page-loading" role="status">원문 페이지를 불러오는 중…</div>}
    <canvas ref={canvas} aria-label={`원본 PDF ${pageIndex + 1}페이지`} style={{ width: "100%", height: "100%", visibility: restoring ? "hidden" : "visible" }}/>
    <div ref={layer} className="textLayer" aria-label={`선택 가능한 원문 ${pageIndex + 1}페이지`} onClick={event => openParagraph(event.target)}/>
    {textReady && <HighlightLayer annotations={resolved} selected={selected}/>}
    {textReady && canvas.current && <InlineTranslationLayer paragraphs={paragraphs} translations={visibleTranslations} obstacles={obstacles} canvas={canvas.current} width={page.width * scale} height={page.height * scale} onOriginal={onOriginal} onRetry={onParagraph} onContinuations={setContinuations}/>}
    {textReady && <div className="pf-translated-marks"><HighlightLayer annotations={annotations.filter(a => a.pageIndex === pageIndex && a.anchor.surface === "translation" && translations[a.anchor.paragraphId ?? ""]?.text).map(annotation => ({ annotation, recovery: { status: "resolved" as const, method: "geometry" as const, confidence: 1, rects: annotation.anchor.normalizedRects } }))} selected={selected}/></div>}
    <InkLayer documentId={documentId} pageIndex={pageIndex} annotations={annotations}/>
  </div>{continuations.length > 0 && <section className="pf-translation-continuations" aria-label="지면에서 이어지는 번역"><strong>이어지는 번역 · {pageIndex + 1}페이지</strong>{continuations.map(item => <p key={item.id} data-continuation-id={item.id}>{item.text}</p>)}</section>}{error && <p className="pf-error" role="alert">{error}</p>}{textReady && !layer.current?.textContent?.trim() && <p className="pf-page-notice">이미지 기반 페이지입니다. 텍스트 선택에는 OCR이 필요합니다.</p>}</div>;
}
