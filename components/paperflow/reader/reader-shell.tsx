"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createGuide, estimateGuideCredits, loadGuide } from "@/lib/paperflow/guide/client";
import { NOTE_GUTTER } from "../guide/guide-page";
import { GuideBrief } from "../guide/guide-brief";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { BatchProgress } from "./batch-progress";
import { Maximize2, Minimize2, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { clearHistory, createAnnotation, onHistoryChange, recordStep, redo, removeAnnotation, undo, updateAnnotation } from "@/lib/paperflow/state/history";
import { SearchField } from "@/components/ui/search-field";
import { documentRepository } from "@/lib/paperflow/persistence/document-repository";
import { annotationRepository } from "@/lib/paperflow/persistence/annotation-repository";
import { pdfAdapter, type PdfDocumentHandle, type PdfPageHandle } from "@/lib/paperflow/pdf/pdf-adapter";
import { exportAnnotatedPdf } from "@/lib/paperflow/pdf/export-annotated";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { readableError } from "@/lib/paperflow/errors";
import type { Annotation, AnnotationColor } from "@/lib/paperflow/anchors/types";
import { usePaperflow } from "../shell/paperflow-context";
import { ReaderToolbar } from "./reader-toolbar";
import { PageRail } from "./page-rail";
import { ContinuousPage } from "./continuous-page";
import { ResearchInspector } from "./research-inspector";
import { ReaderSelectionTools } from "./reader-selection-tools";
import { HighlightColorChip } from "./highlight-color-chip";
import { LiquidCursor } from "./liquid-cursor";
import type { ResolvedAnnotation } from "./highlight-layer";
import type { PdfParagraph } from "@/lib/paperflow/layout/types";
import { startTranslationJob, cancelTranslationJob, translationJobStatus, prepareReader, translateUnitsNow, type TranslationJobStatus } from "@/lib/paperflow/translation/document-job";
import { useTranslationStore } from "@/lib/paperflow/translation/translation-store";
const emptyAnnotations: Annotation[] = [];

export function ReaderShell({ documentId }: { documentId: string }) {
  const { notify, registerReader, openImport } = usePaperflow(), client = useQueryClient();
  const doc = useQuery({ queryKey: ["documents", documentId], queryFn: () => documentRepository.getDocument(documentId) });
  const marks = useQuery({ queryKey: ["annotations", documentId], queryFn: () => annotationRepository.listByDocument(documentId) });
  const annotations = marks.data ?? emptyAnnotations;
  const [pdf, setPdf] = useState<PdfDocumentHandle | null>(null), [page, setPage] = useState<PdfPageHandle | null>(null), [error, setError] = useState("");
  const [selected, setSelected] = useState<string>(), [resolvedByPage, setResolvedByPage] = useState<Record<number, ResolvedAnnotation[]>>({}), [saving, setSaving] = useState(false), [tab, setTab] = useState("context"), [shell, setShell] = useState("");
  const [searchOpen, setSearchOpen] = useState(false), [search, setSearch] = useState("");
  const [exportRunning, setExportRunning] = useState(false);
  const [textNoteOpen, setTextNoteOpen] = useState(false), [textNoteDraft, setTextNoteDraft] = useState("");
  // Focus mode: only the paper and the marking tools, full screen when the browser allows it.
  const [focus, setFocus] = useState(false), wentFullscreen = useRef(false), beforeFocus = useRef<{ fitMode: "width" | "page" | "custom"; zoom: number } | null>(null);
  const enterFocus = useCallback(() => {
    setFocus(true);
    // On a phone the A4 page fills the screen width; the previous zoom comes back on exit.
    if (window.innerWidth <= 650) { const { fitMode, zoom } = useReaderStore.getState(); beforeFocus.current = { fitMode, zoom }; useReaderStore.getState().set({ fitMode: "width", activeSelection: null }); }
    // iPhone Safari has no element full screen: the focus layout alone takes the screen there.
    void document.documentElement.requestFullscreen?.().then(() => { wentFullscreen.current = true; }).catch(() => { /* Focus mode still works inside the window. */ });
  }, []);
  const exitFocus = useCallback(() => {
    setFocus(false);
    if (beforeFocus.current) { useReaderStore.getState().set(beforeFocus.current); beforeFocus.current = null; }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    wentFullscreen.current = false;
  }, []);
  // iPad Safari lifts a selection for system drag-and-drop when the finger moves on it, dimming the
  // whole page. The reader has its own selection tools, so native dragging of page content is off.
  useEffect(() => {
    const onDragStart = (event: DragEvent) => {
      const target = event.target instanceof Element ? event.target : (event.target as Node | null)?.parentElement;
      if (target?.closest(".pf-reader-body")) event.preventDefault();
    };
    document.addEventListener("dragstart", onDragStart, true);
    return () => document.removeEventListener("dragstart", onDragStart, true);
  }, []);
  useEffect(() => {
    if (!focus) return;
    // Leaving browser full screen (Esc, F11) leaves focus mode too; Esc alone works without it.
    const onChange = () => { if (!document.fullscreenElement && wentFullscreen.current) exitFocus(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !(event.target instanceof HTMLTextAreaElement)) exitFocus(); };
    document.addEventListener("fullscreenchange", onChange); window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("fullscreenchange", onChange); window.removeEventListener("keydown", onKey); };
  }, [focus, exitFocus]);
  const [activeUnit, setActiveUnit] = useState<string | null>(null);
  useEffect(() => { clearHistory(); onHistoryChange(() => void client.invalidateQueries({ queryKey: ["annotations"] })); }, [documentId, client]);
  const runHistory = useCallback(async (direction: "undo" | "redo") => {
    try { const label = direction === "undo" ? await undo() : await redo(); notify(label ? `${direction === "undo" ? "실행 취소" : "다시 실행"} · ${label}` : direction === "undo" ? "되돌릴 작업 없음" : "다시 실행할 작업 없음"); }
    catch (reason) { notify(readableError(reason)); }
  }, [notify]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return; // native undo while typing
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) { event.preventDefault(); void runHistory("undo"); }
      else if (key === "y" || (key === "z" && event.shiftKey)) { event.preventDefault(); void runHistory("redo"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runHistory]);
  const [bulk, setBulk] = useState<TranslationJobStatus | null>(null);
  const viewport = useRef<HTMLDivElement>(null), searchInput = useRef<HTMLInputElement>(null), writing = useRef(false);
  const [size, setSize] = useState({ width: 700, height: 800 });
  const tool = useReaderStore(s => s.tool), highlightColor = useReaderStore(s => s.highlightColor);
  const currentPage = useReaderStore(s => s.currentPage), zoom = useReaderStore(s => s.zoom), fit = useReaderStore(s => s.fitMode), inspector = useReaderStore(s => s.inspectorOpen), rail = useReaderStore(s => s.pageRailOpen);
  const manifest = useTranslationStore(s => s.manifest?.documentId === documentId ? s.manifest : null);
  const showTranslations = useTranslationStore(s => s.showTranslations);
  const translatedCount = useTranslationStore(s => s.texts.size);
  const resolved = useMemo(() => Object.values(resolvedByPage).flat(), [resolvedByPage]);
  const collectResolved = useCallback((pageIndex: number, items: ResolvedAnnotation[]) => setResolvedByPage(previous => previous[pageIndex] === items || !items.length && !previous[pageIndex]?.length ? previous : { ...previous, [pageIndex]: items }), []);

  useEffect(() => {
    const controller = new AbortController(); let handle: PdfDocumentHandle | undefined;
    setPdf(null); setPage(null); setError(""); setSelected(undefined); setActiveUnit(null);
    useTranslationStore.getState().open(documentId);
    void (async () => {
      const [record, blob] = await Promise.all([documentRepository.getDocument(documentId), documentRepository.getDocumentBlob(documentId)]);
      if (!record) throw new Error("이 브라우저에 저장된 PDF가 없습니다. 라이브러리에서 파일을 가져와 주세요.");
      // Listed by the account but kept on another device: the same file imported here links automatically.
      if (!blob) throw new Error(record.sourceStatus === "remote" ? "이 논문의 PDF는 다른 기기에 저장되어 있습니다. 같은 PDF 파일을 이 기기에서 가져오면 메모·번역과 자동으로 연결됩니다." : "이 브라우저에 저장된 PDF가 없습니다. 라이브러리에서 파일을 가져와 주세요.");
      if (controller.signal.aborted) return;
      const params = new URLSearchParams(window.location.search), requestedPage = Number(params.get("page"));
      const initialPage = requestedPage >= 1 && requestedPage <= record.pageCount ? requestedPage : record.currentPage;
      useReaderStore.getState().reset(documentId, initialPage);
      useReaderStore.getState().set({ inspectorOpen: window.innerWidth > 1200 });
      setSelected(params.get("annotation") ?? undefined);
      handle = await pdfAdapter.open(await blob.arrayBuffer(), controller.signal);
      if (controller.signal.aborted) { await handle.destroy(); return; }
      setPdf(handle);
      // Manifest + stored translations load in the background; the original pages render immediately.
      void prepareReader(documentId, controller.signal).then(() => {
        const keywords = useTranslationStore.getState().manifest?.keywords ?? [];
        if (keywords.length && !record.keywords?.length) void documentRepository.updateDocument(documentId, { keywords }).then(() => client.invalidateQueries({ queryKey: ["documents"] }));
      }).catch(reason => { if (!controller.signal.aborted) notify(`번역 준비 실패: ${readableError(reason)}`); });
      await documentRepository.updateDocument(documentId, { opens: [...(record.opens ?? []), new Date().toISOString()].slice(-500), lastOpenedAt: new Date().toISOString(), currentPage: initialPage });
      await client.invalidateQueries({ queryKey: ["documents"] });
      setTimeout(() => viewport.current?.querySelector(`[data-continuous-page="${initialPage}"]`)?.scrollIntoView({ block: "start", behavior: "instant" }), 60);
    })().catch(reason => { if (!controller.signal.aborted) setError(readableError(reason)); });
    return () => { controller.abort(); useReaderStore.getState().set({ activeSelection: null }); if (handle) void handle.destroy(); };
  }, [documentId, client, notify]);

  useEffect(() => {
    const apply = (status: TranslationJobStatus) => { if (status.documentId === documentId) setBulk(status); };
    const prior = translationJobStatus(documentId); if (prior) apply(prior);
    const progress = (event: Event) => apply((event as CustomEvent<TranslationJobStatus>).detail);
    window.addEventListener("paperflow:translation-progress", progress);
    return () => window.removeEventListener("paperflow:translation-progress", progress);
  }, [documentId]);

  useEffect(() => {
    if (!pdf) return;
    let active = true;
    void pdf.getPage(Math.min(currentPage, pdf.pageCount)).then(result => { if (active) setPage(previous => previous ?? result); }).catch(reason => { if (active) setError(readableError(reason)); });
    return () => { active = false; };
  }, [pdf, currentPage]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; setSize(previous => Math.abs(previous.width - width) < 1 && Math.abs(previous.height - height) < 1 ? previous : { width, height }); });
    observer.observe(viewport.current); return () => observer.disconnect();
  }, [pdf, error]);
  // The AI guide: made once per paper (credits), then written on the paper or hidden with one button.
  const guideOverlay = useReaderStore(s => s.guideOverlay);
  const guide = useQuery({ queryKey: ["guide", documentId], queryFn: () => loadGuide(documentId) });
  const makeGuide = useMutation({
    mutationFn: () => { const current = useTranslationStore.getState().manifest; if (!current || current.documentId !== documentId) throw new Error("논문 구조를 분석하는 중입니다. 잠시 후 다시 눌러 주세요."); useReaderStore.getState().set({ guideProgress: { brief: "pending", pagesDone: 0, pagesTotal: 0 } }); return createGuide(documentId, current, progress => useReaderStore.getState().set({ guideProgress: progress })); },
    onSuccess: value => { client.setQueryData(["guide", documentId], value); void client.invalidateQueries({ queryKey: ["documents"] }); useReaderStore.getState().set({ guideOverlay: true, guideProgress: null }); setTab("guide"); document.querySelector("[data-pdf-viewport]")?.scrollTo({ top: 0, behavior: "smooth" }); },
    onError: reason => { useReaderStore.getState().set({ guideProgress: null }); notify(readableError(reason)); }
  });
  const guideCredits = manifest ? estimateGuideCredits(manifest) : null;
  const onGuide = useCallback(() => {
    if (guide.data) { const on = !useReaderStore.getState().guideOverlay; useReaderStore.getState().set({ guideOverlay: on }); if (on) setTab("guide"); return; }
    if (makeGuide.isPending) return;
    if (!window.confirm(`AI 리딩 가이드를 만듭니다.\n논문 정의 · 10초 요약 · 연구 흐름 · 실험조건 · 핵심 결과 · 원인 · 한계 · Figure 가이드와, 페이지마다 핵심과 형광 근거를 정리합니다.\n약 ${guideCredits ?? "–"} 크레딧 (실제 사용량으로 차감, 1–2분 소요)`)) return;
    makeGuide.mutate();
  }, [guide.data, makeGuide, guideCredits]);
  const guideProgress = useReaderStore(s => s.guideProgress);
  useEffect(() => { useReaderStore.getState().set({ guideMaker: { make: () => { if (makeGuide.isPending) return; if (!guide.data && !window.confirm(`AI 리딩 가이드를 만듭니다. 약 ${guideCredits ?? "–"} 크레딧 (실제 사용량으로 차감, 1–2분 소요)`)) return; makeGuide.mutate(); }, estimate: guideCredits } }); return () => useReaderStore.getState().set({ guideMaker: null }); }, [makeGuide, guide.data, guideCredits]);
  const guideButton = { label: makeGuide.isPending ? (guideProgress?.pagesTotal ? `가이드 작성 중 · ${Math.round(((guideProgress.brief === "done" ? 1 : 0) + guideProgress.pagesDone / guideProgress.pagesTotal) * 50)}%` : "가이드 작성 중…") : guide.data ? (guideOverlay ? "가이드 숨기기" : "AI 가이드") : "AI 가이드", title: guide.data ? "논문 위의 AI 리딩 가이드를 켜거나 끕니다" : `AI 가이드 만들기 · 약 ${guideCredits ?? "–"} 크레딧`, active: Boolean(guide.data && guideOverlay), busy: makeGuide.isPending, disabled: !manifest || makeGuide.isPending };
  const lastScale = useRef(1);
  // Breathing room around the page: generous on a desk, almost none on a phone in focus mode.
  const baseGutter = size.width < 600 ? (focus ? 8 : 20) : 48;
  // With the guide on, the page gives way to margins for the handwritten notes when the screen allows it.
  const gutter = guideOverlay && guide.data && size.width - 2 * NOTE_GUTTER - baseGutter >= 460 ? baseGutter + 2 * NOTE_GUTTER : baseGutter;
  const scale = page ? fit === "custom" ? zoom / 100 : fit === "page" ? Math.min((size.width - gutter) / page.width, (size.height - gutter) / page.height) : Math.min(1.65, (size.width - gutter) / page.width) : lastScale.current;
  useEffect(() => { lastScale.current = scale; }, [scale]);

  // Persist the reading position at most once per second; never per scroll event.
  const persistTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const persistPage = useCallback((number: number) => {
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => { void documentRepository.updateDocument(documentId, { currentPage: number, lastOpenedAt: new Date().toISOString() }).catch(() => undefined); }, 900);
  }, [documentId]);
  const navigate = useCallback((number: number) => {
    if (!pdf || number < 1 || number > pdf.pageCount) return;
    viewport.current?.querySelector(`[data-continuous-page="${number}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    useReaderStore.getState().set({ currentPage: number, activeSelection: null });
    window.getSelection()?.removeAllRanges();
    persistPage(number);
  }, [pdf, persistPage]);
  const scrollFrame = useRef(0);
  const onScroll = useCallback(() => {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      const root = viewport.current; if (!root) return;
      const nodes = root.querySelectorAll<HTMLElement>("[data-continuous-page]"), y = root.getBoundingClientRect().top + 100;
      // Binary search: a handful of layout reads instead of one per page.
      let low = 0, high = nodes.length - 1, found = nodes.length - 1;
      while (low <= high) { const middle = (low + high) >> 1; if (nodes[middle].getBoundingClientRect().bottom > y) { found = middle; high = middle - 1; } else low = middle + 1; }
      const number = Number(nodes[found]?.dataset.continuousPage);
      if (number && number !== useReaderStore.getState().currentPage) { useReaderStore.getState().set({ currentPage: number }); persistPage(number); }
    });
  }, [persistPage]);

  const dismiss = useCallback(() => { useReaderStore.getState().set({ activeSelection: null }); window.getSelection()?.removeAllRanges(); }, []);
  const save = useCallback(async (color: AnnotationColor = "yellow", note?: string) => {
    if (writing.current) return;
    const anchor = useReaderStore.getState().activeSelection, existing = annotations.find(a => a.id === selected);
    if (!anchor && !(existing && note !== undefined)) { notify("먼저 원문 텍스트를 선택해 주세요."); return; }
    writing.current = true; setSaving(true);
    try {
      const now = new Date().toISOString(), start = performance.now();
      const annotation: Annotation = !anchor && existing ? { ...existing, note, updatedAt: now } : { id: crypto.randomUUID(), type: "highlight", documentId, pageIndex: anchor!.pageIndex, color, anchor: anchor!, note, createdAt: now, updatedAt: now, resolutionStatus: "resolved" };
      if (!anchor && existing) await updateAnnotation(existing, annotation, "메모 수정"); else await createAnnotation(annotation, note !== undefined ? "메모" : "형광펜");
      performance.measure("paperflow:annotation-persist", { start });
      await client.invalidateQueries({ queryKey: ["annotations"] }); setSelected(annotation.id); dismiss(); notify(note !== undefined ? "메모 저장됨" : "형광펜 저장됨");
    } catch (reason) { notify(`저장하지 못했습니다. ${readableError(reason)}`); }
    finally { writing.current = false; setSaving(false); }
  }, [annotations, selected, documentId, client, dismiss, notify]);
  useEffect(() => { if (tool !== "highlight") return; const finish = () => { setTimeout(() => { if (useReaderStore.getState().activeSelection) void save(useReaderStore.getState().highlightColor); }, 30); }; document.addEventListener("pointerup", finish); return () => document.removeEventListener("pointerup", finish); }, [tool, save]);
  const showNote = useCallback(() => { if (!useReaderStore.getState().activeSelection) setSelected(undefined); setTextNoteDraft(""); setTextNoteOpen(true); }, []);
  const saveNote = useCallback(async (text: string) => {
    if (useReaderStore.getState().activeSelection || annotations.some(a => a.id === selected)) { await save("yellow", text); return; }
    if (!text.trim()) return;
    const now = new Date().toISOString(), pageIndex = currentPage - 1;
    try {
      await createAnnotation({ id: crypto.randomUUID(), type: "note", documentId, pageIndex, color: "yellow", note: text.trim(), anchor: { version: 1, documentId, pageIndex, textQuote: `페이지 ${currentPage} 메모`, rects: [], normalizedRects: [], createdAt: now }, createdAt: now, updatedAt: now, resolutionStatus: "resolved" }, "페이지 메모");
      await client.invalidateQueries({ queryKey: ["annotations"] }); notify("페이지 메모를 저장했습니다.");
    } catch (reason) { notify(`메모 저장 실패: ${readableError(reason)}`); }
  }, [annotations, selected, save, currentPage, documentId, client, notify]);

  /** Click on a source paragraph: show its stored translation, or translate just that paragraph now. */
  const openUnit = useCallback((unitId: string) => {
    setActiveUnit(unitId); dismiss();
    const store = useTranslationStore.getState();
    const step = { label: "문단 번역", undo: () => useTranslationStore.getState().hide(unitId), redo: () => useTranslationStore.getState().show(unitId) };
    if (store.texts.has(unitId)) { if (store.hidden.has(unitId)) recordStep(step); store.show(unitId); return; }
    void translateUnitsNow(documentId, [unitId]).then(() => { if (useTranslationStore.getState().texts.has(unitId)) recordStep(step); }).catch(reason => notify(`문단 번역 실패: ${readableError(reason)}`));
  }, [documentId, dismiss, notify]);
  const showOriginal = useCallback((unitId: string) => { dismiss(); setActiveUnit(unitId); useTranslationStore.getState().hide(unitId); recordStep({ label: "원문 보기", undo: () => useTranslationStore.getState().show(unitId), redo: () => useTranslationStore.getState().hide(unitId) }); }, [dismiss]);
  /** A table's cells or a heading, translated on request. */
  const translateUnits = useCallback((unitIds: string[]) => { if (!unitIds.length) return; void translateUnitsNow(documentId, unitIds).catch(reason => notify(`번역 실패: ${readableError(reason)}`)); }, [documentId, notify]);
  const retryUnit = useCallback((unitId: string) => { useTranslationStore.getState().setFailed(documentId, unitId, null); void translateUnitsNow(documentId, [unitId]).catch(reason => notify(`문단 번역 실패: ${readableError(reason)}`)); }, [documentId, notify]);

  const translateSelection = useCallback(() => {
    const anchor = useReaderStore.getState().activeSelection, manifestNow = useTranslationStore.getState().manifest;
    if (!manifestNow) { notify("번역할 문단 구조를 준비하는 중입니다."); return; }
    if (anchor?.paragraphId) { openUnit(anchor.paragraphId); return; }
    const box = anchor?.normalizedRects[0], cx = box ? box.x + box.width / 2 : -1, cy = box ? box.y + box.height / 2 : -1;
    const block = anchor ? manifestNow.blocks.find(item => item.pageIndex === anchor.pageIndex && item.translatable && item.lines.some(line => cx >= line.x - .01 && cx <= line.x + line.width + .01 && cy >= line.y - .01 && cy <= line.y + line.height + .01)) : undefined;
    const unitId = block?.unitId ?? activeUnit ?? manifestNow.blocks.find(item => item.pageIndex === currentPage - 1 && item.translatable)?.unitId;
    if (unitId) openUnit(unitId); else notify("이 페이지에는 번역할 본문이 없습니다.");
  }, [activeUnit, currentPage, openUnit, notify]);
  const batchTranslate = useCallback(() => {
    useTranslationStore.getState().setShowTranslations(true); dismiss();
    void startTranslationJob(documentId, { fromPage: useReaderStore.getState().currentPage }).catch(error => notify(readableError(error)));
  }, [documentId, notify, dismiss]);
  const showShell = useCallback((name: string) => {
    if (name === "Copy citation") { notify("서지정보를 확인하지 않은 로컬 PDF입니다. 정확한 인용을 위해 저자·DOI 정보가 필요합니다."); return; }
    setShell(name); setTab("context"); useReaderStore.getState().set({ inspectorOpen: true }); if (name !== "개념 설명") notify(`${name} · 준비 중`);
  }, [notify]);
  const focusSearch = useCallback(() => { setSearchOpen(true); setTimeout(() => searchInput.current?.focus(), 0); }, []);
  const commands = useMemo(() => ({
    previous: currentPage > 1 ? () => navigate(currentPage - 1) : undefined,
    next: pdf && currentPage < pdf.pageCount ? () => navigate(currentPage + 1) : undefined,
    highlight: () => { void save(); }, note: showNote, translate: translateSelection, explain: () => showShell("개념 설명"), search: focusSearch,
    fitWidth: () => useReaderStore.getState().set({ fitMode: "width", activeSelection: null }), fitPage: () => useReaderStore.getState().set({ fitMode: "page", activeSelection: null }),
    toggleInspector: () => useReaderStore.getState().set({ inspectorOpen: !useReaderStore.getState().inspectorOpen })
  }), [currentPage, pdf, navigate, save, showNote, showShell, focusSearch, translateSelection]);
  useEffect(() => { registerReader(commands); return () => registerReader(null); }, [commands, registerReader]);
  const download = async () => { try { const blob = await documentRepository.getDocumentBlob(documentId); if (!blob) throw new Error("원본 PDF가 없습니다."); const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = doc.data?.filename ?? "paper.pdf"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (reason) { notify(readableError(reason)); } };
  const exportPdf = async () => { if (exportRunning) return; setExportRunning(true); try { const result = await exportAnnotatedPdf(documentId, (done, total) => notify(`번역·마킹 PDF 생성 중 · ${done}/${total}페이지`)); notify(result.unfit ? `PDF를 저장했습니다. ${result.unfit}개 문단은 최소 글자 크기로도 원래 영역을 넘쳐 아래 여백까지 이어집니다.` : "번역·마킹과 메모를 PDF로 저장했습니다."); } catch (reason) { notify(`PDF 저장 실패: ${readableError(reason)}`); } finally { setExportRunning(false); } };
  const inspect = (annotation: Annotation) => { dismiss(); setSelected(annotation.id); setTab("context"); navigate(annotation.pageIndex + 1); useReaderStore.getState().set({ inspectorOpen: true }); setTimeout(() => document.querySelector(`[data-annotation-id="${annotation.id}"]`)?.scrollIntoView({ block: "center" }), 200); };
  const remove = async (id: string) => { try { const target = annotations.find(item => item.id === id); if (target) await removeAnnotation(target, "마킹 삭제"); await client.invalidateQueries({ queryKey: ["annotations"] }); if (selected === id) setSelected(undefined); } catch (reason) { notify(readableError(reason)); } };

  const activeParagraph = useMemo<PdfParagraph | null>(() => {
    const unit = manifest?.units.find(item => item.id === activeUnit), block = unit && manifest?.blocks.find(item => item.id === unit.blockIds[0]);
    return unit && block ? { ...block, id: unit.id, text: unit.text } : null;
  }, [manifest, activeUnit]);
  const unitState = useTranslationStore(s => !activeUnit ? "" : s.pending.has(activeUnit) ? "pending" : s.failed.has(activeUnit) ? `failed:${s.failed.get(activeUnit)}` : s.texts.has(activeUnit) ? "done" : "");
  const translation = unitState === "pending" ? { pending: true } : unitState.startsWith("failed:") ? { pending: false, error: unitState.slice(7) } : unitState === "done" ? { pending: false, text: useTranslationStore.getState().texts.get(activeUnit!), provider: "OpenAI" as const } : null;
  const pageSizes = manifest?.pages;
  const fallbackSize = useMemo(() => ({ width: page?.width ?? 612, height: page?.height ?? 792 }), [page]);
  const pageScale = Math.max(.1, scale);
  const noteRoom = guideOverlay ? Math.max(0, (size.width - (page?.width ?? 612) * pageScale) / 2 - 12) : 0;
  // Nothing sits beside the brief (page guides start at page 1): it spreads into the margins, up to a reading width.
  const firstWidth = (pageSizes?.[0] ?? fallbackSize).width * pageScale, briefWidth = Math.max(firstWidth, Math.min(firstWidth + 2 * Math.max(0, noteRoom - 24), 920));

  if (error || doc.error || marks.error) return <main className="pf-empty pf-reader-error"><h1>PDF를 열지 못했습니다</h1><p role="alert">{error || readableError(doc.error ?? marks.error)}</p><Button asChild><Link href="/library">라이브러리로</Link></Button><Button onClick={openImport}>PDF 다시 가져오기</Button></main>;
  const elapsed = bulk ? Math.round(((bulk.running ? 0 : bulk.translationMs) || 0) / 1000) : 0;
  return <div className="pf-reader-shell" data-focus={focus || undefined}>
    <ReaderToolbar title={doc.data?.filename ?? "PDF 불러오는 중…"} pages={pdf?.pageCount ?? 1} page={currentPage} effectiveZoom={Math.round(scale * 100)} onPage={navigate} onSearch={focusSearch} onDownload={() => void download()} onExport={() => void exportPdf()} exportRunning={exportRunning} onBatchTranslate={batchTranslate} batchRunning={bulk?.running ?? false} canTranslate={Boolean(pdf)} translated={showTranslations} hasTranslations={translatedCount > 0} onToggleTranslation={() => { dismiss(); useTranslationStore.getState().setShowTranslations(!showTranslations); }} guide={guideButton} onGuide={onGuide}/>
    <div className="pf-annotation-tools" data-selection-ui onPointerDown={event => event.preventDefault()}>
      {([['select','선택'],['highlight','형광펜'],['pen','메모 펜'],['eraser','지우개']] as const).map(([value,label]) => <Button key={value} size="sm" variant="ghost" aria-pressed={tool === value} onClick={() => { useReaderStore.getState().set({ tool: value }); if (value === 'highlight' && useReaderStore.getState().activeSelection) void save(useReaderStore.getState().highlightColor); }}>{value === 'highlight' && <i className="pf-tool-dot" data-color={highlightColor} aria-hidden="true"/>}{label}</Button>)}
      <Button size="sm" variant="ghost" aria-pressed={tool === "text"} onClick={() => useReaderStore.getState().set({ tool: tool === "text" ? "select" : "text" })}>텍스트 메모</Button><Button size="sm" variant="ghost" onClick={() => showShell("개념 설명")}>선택 개념 공부</Button>
      <span className="pf-history-controls"><IconButton label="되돌리기 (Ctrl+Z)" size="sm" variant="ghost" onClick={() => void runHistory("undo")}><Undo2 size={15}/></IconButton><IconButton label="다시 실행 (Ctrl+Y)" size="sm" variant="ghost" onClick={() => void runHistory("redo")}><Redo2 size={15}/></IconButton></span>
      <span className="pf-focus-controls">
        {focus && <>
          <IconButton label="축소" size="sm" variant="ghost" disabled={Math.round(scale * 100) <= 25} onClick={() => useReaderStore.getState().set({ zoom: Math.max(25, Math.round(scale * 100) - 10), fitMode: "custom", activeSelection: null })}><Minus size={15}/></IconButton>
          <span className="pf-focus-zoom">{Math.round(scale * 100)}%</span>
          <IconButton label="확대" size="sm" variant="ghost" disabled={Math.round(scale * 100) >= 250} onClick={() => useReaderStore.getState().set({ zoom: Math.min(250, Math.round(scale * 100) + 10), fitMode: "custom", activeSelection: null })}><Plus size={15}/></IconButton>
          <span className="pf-focus-page">{currentPage} / {pdf?.pageCount ?? 1}</span>
        </>}
        <IconButton label={focus ? "확장 종료 (Esc)" : "확장: PDF와 마킹 도구만 전체화면으로"} size="sm" variant="ghost" aria-pressed={focus} onClick={focus ? exitFocus : enterFocus}>{focus ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</IconButton>
      </span>
    </div>
    {bulk && <BatchProgress bulk={bulk} onCancel={() => cancelTranslationJob(documentId)} onResume={batchTranslate}/>}
    {searchOpen && <div className="pf-search-strip"><SearchField ref={searchInput} aria-label="현재 페이지 검색" value={search} onChange={e => setSearch(e.target.value)} placeholder="검색 UI · Phase 2"/><span>전체 논문 검색은 후속 단계에서 제공됩니다.</span><Button size="sm" onClick={() => setSearchOpen(false)}>닫기</Button></div>}
    <div className="pf-reader-body" data-rail={rail} data-inspector-open={inspector}>
      {rail && pdf && <PageRail pdf={pdf} current={currentPage} onPage={navigate}/>}
      <div className="pf-pdf-viewport dd-scrollbar" role="region" aria-label="PDF 원문 읽기 영역" tabIndex={0} data-pdf-viewport ref={viewport} onScroll={onScroll}>{translatedCount === 0 && !guideOverlay && <div className="pf-reader-hint">문단을 누르면 한국어로 바뀝니다</div>}{pdf && guideOverlay && <GuideBrief documentId={documentId} width={briefWidth} scale={pageScale}/>}{pdf ? Array.from({ length: pdf.pageCount }, (_, index) => <ContinuousPage key={documentId + index} pdf={pdf} index={index} scale={pageScale} size={pageSizes?.[index] ?? fallbackSize} documentId={documentId} annotations={annotations} selected={selected} onResolved={collectResolved} onUnit={openUnit} onOriginal={showOriginal} onRetry={retryUnit} onUnits={translateUnits} noteRoom={noteRoom}/>) : <div className="pf-empty" role="status">PDF 원문을 불러오는 중…</div>}</div>
      {inspector && <ResearchInspector annotations={annotations} resolved={resolved} selected={selected} onSelect={inspect} onSaveNote={saveNote} onRemove={id => void remove(id)} saving={saving} tab={tab} setTab={setTab} shell={shell} paragraph={activeParagraph} translation={translation} bulk={bulk} keywords={manifest?.keywords ?? doc.data?.keywords ?? []} onTranslate={translateSelection} onBatchTranslate={batchTranslate} onCancelBatch={() => cancelTranslationJob(documentId)}/>}
    </div>
    <footer className="pf-reader-status"><span>원본 PDF 보존 · 로컬 저장</span><span>{annotations.filter(a => a.type === "highlight").length} 마킹 · {annotations.filter(a => a.type === "ink" || a.type === "note" || Boolean(a.note)).length} 메모</span><span>Ctrl Z 되돌리기 · H 마킹 · N 메모 · Ctrl K 명령</span></footer>
    {textNoteOpen && <div className="pf-note-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setTextNoteOpen(false); }}><section className="pf-note-dialog" role="dialog" aria-modal="true" aria-label="텍스트 메모"><h2>텍스트 메모</h2><p>{useReaderStore.getState().activeSelection ? "선택한 문장에 메모를 연결합니다." : `${currentPage}페이지에 메모를 저장합니다.`}</p><textarea autoFocus aria-label="텍스트 메모 입력" value={textNoteDraft} onChange={event => setTextNoteDraft(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setTextNoteOpen(false); }} placeholder="읽으며 떠오른 생각이나 질문을 기록하세요."/><div><Button variant="ghost" onClick={() => setTextNoteOpen(false)}>취소</Button><Button disabled={!textNoteDraft.trim() || saving} onClick={() => void saveNote(textNoteDraft).then(() => setTextNoteOpen(false))}>메모 저장</Button></div></section></div>}
    <HighlightColorChip/>
    {focus && <LiquidCursor root={viewport}/>}
    <ReaderSelectionTools documentId={documentId} onHighlight={color => void save(color)} onNote={showNote} onTranslate={translateSelection} onShell={showShell} onDismiss={dismiss} saving={saving}/>
  </div>;
}
