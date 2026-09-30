"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { documentRepository } from "@/lib/paperflow/persistence/document-repository";
import { annotationRepository } from "@/lib/paperflow/persistence/annotation-repository";
import { pdfAdapter, type PdfDocumentHandle, type PdfPageHandle } from "@/lib/paperflow/pdf/pdf-adapter";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { readableError } from "@/lib/paperflow/errors";
import type { Annotation, AnnotationColor } from "@/lib/paperflow/anchors/types";
import { usePaperflow } from "../shell/paperflow-context";
import { ReaderToolbar } from "./reader-toolbar";
import { PageRail } from "./page-rail";
import { ContinuousPage } from "./continuous-page";
import { ResearchInspector } from "./research-inspector";
import { ReaderSelectionTools } from "./reader-selection-tools";
import type { ResolvedAnnotation } from "./highlight-layer";
import { translateHybrid } from "@/lib/paperflow/translation/hybrid";
import { researchBatchTranslate } from "@/lib/paperflow/translation/research-api";
import type { PdfParagraph } from "@/lib/paperflow/translation/paragraphs";
import { translationRepository } from "@/lib/paperflow/persistence/translation-repository";
import type { InlineTranslations } from "./inline-translation-layer";
const emptyAnnotations: Annotation[] = [];

export function ReaderShell({ documentId }: { documentId: string }) {
  const { notify, registerReader, openImport } = usePaperflow(), client = useQueryClient();
  const doc = useQuery({ queryKey: ["documents", documentId], queryFn: () => documentRepository.getDocument(documentId) });
  const marks = useQuery({ queryKey: ["annotations", documentId], queryFn: () => annotationRepository.listByDocument(documentId) });
  const annotations = marks.data ?? emptyAnnotations;
  const [pdf, setPdf] = useState<PdfDocumentHandle | null>(null), [page, setPage] = useState<PdfPageHandle | null>(null), [error, setError] = useState("");
  const [selected, setSelected] = useState<string>(), [resolved, setResolved] = useState<ResolvedAnnotation[]>([]), [saving, setSaving] = useState(false), [tab, setTab] = useState("context"), [shell, setShell] = useState("");
  const [searchOpen, setSearchOpen] = useState(false), [search, setSearch] = useState("");
  const [paragraphs, setParagraphs] = useState<PdfParagraph[]>([]);
  const collectParagraphs = useCallback((items: PdfParagraph[]) => { if (items.length) setParagraphs(previous => [...previous.filter(item => item.pageIndex !== items[0].pageIndex), ...items]); }, []);
  const collectResolved = useCallback((items: ResolvedAnnotation[]) => { if (items.length) setResolved(previous => [...previous.filter(item => item.annotation.pageIndex !== items[0].annotation.pageIndex), ...items]); }, []);
  const [activeParagraph, setActiveParagraph] = useState<PdfParagraph | null>(null);
  const [inlineTranslations, setInlineTranslations] = useState<InlineTranslations>({});
  const [showTranslations, setShowTranslations] = useState(true), [originalParagraphs, setOriginalParagraphs] = useState<string[]>([]);
  const [translation, setTranslation] = useState<{ text?: string; provider?: "device" | "MyMemory" | "OpenAI"; pending: boolean; error?: string } | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number; failed: number; running: boolean } | null>(null);
  const viewport = useRef<HTMLDivElement>(null), searchInput = useRef<HTMLInputElement>(null), writing = useRef(false), translationController = useRef<AbortController | null>(null), bulkController = useRef<AbortController | null>(null);
  const [size, setSize] = useState({ width: 700, height: 800 });
  const tool = useReaderStore(s => s.tool);
  const currentPage = useReaderStore(s => s.currentPage), zoom = useReaderStore(s => s.zoom), fit = useReaderStore(s => s.fitMode), inspector = useReaderStore(s => s.inspectorOpen), rail = useReaderStore(s => s.pageRailOpen);
  useEffect(() => {
    const controller = new AbortController(); let handle: PdfDocumentHandle | undefined;
    setPdf(null); setPage(null); setError(""); setSelected(undefined);
    void (async () => {
      const [record, blob] = await Promise.all([documentRepository.getDocument(documentId), documentRepository.getDocumentBlob(documentId)]);
      if (!record || !blob) throw new Error("이 브라우저에 저장된 PDF가 없습니다. 라이브러리에서 파일을 가져와 주세요.");
      if (controller.signal.aborted) return;
      const params = new URLSearchParams(window.location.search), requestedPage = Number(params.get("page"));
      const initialPage = requestedPage >= 1 && requestedPage <= record.pageCount ? requestedPage : record.currentPage;
      useReaderStore.getState().reset(documentId, initialPage);
      useReaderStore.getState().set({ inspectorOpen: window.innerWidth > 1200 });
      setSelected(params.get("annotation") ?? undefined);
      handle = await pdfAdapter.open(await blob.arrayBuffer(), controller.signal);
      if (controller.signal.aborted) { await handle.destroy(); return; }
      setPdf(handle);
      await documentRepository.updateDocument(documentId, { opens: [...(record.opens ?? []), new Date().toISOString()].slice(-500), lastOpenedAt: new Date().toISOString(), currentPage: initialPage });
      await client.invalidateQueries({ queryKey: ["documents"] });
    })().catch(reason => { if (!controller.signal.aborted) setError(readableError(reason)); });
    return () => { controller.abort(); translationController.current?.abort(); bulkController.current?.abort(); bulkController.current = null; useReaderStore.getState().set({ activeSelection: null }); if (handle) void handle.destroy(); };
  }, [documentId, client]);
  useEffect(() => {
    if (!pdf) return;
    let active = true; setPage(null); useReaderStore.getState().set({ activeSelection: null });
    void pdf.getPage(currentPage).then(result => {
      if (!active) return; setPage(result);
      if (currentPage < pdf.pageCount) void pdf.getPage(currentPage + 1).catch(() => { /* Foreground navigation reports actual failures. */ });
    }).catch(reason => { if (active) setError(readableError(reason)); });

    return () => { active = false; };
  }, [pdf, currentPage]);
  useEffect(() => {
    let alive = true;
    void Promise.all(paragraphs.map(async paragraph => ({ paragraph, stored: await translationRepository.get(documentId, paragraph.pageIndex, paragraph.text) }))).then(items => {
      if (!alive) return;
      setInlineTranslations(current => { const next = { ...current }; for (const { paragraph, stored } of items) if (stored && !current[paragraph.id]?.pending) next[paragraph.id] = { text: stored.text, provider: stored.provider, pending: false }; return next; });
    }).catch(reason => notify(readableError(reason)));
    return () => { alive = false; };
  }, [paragraphs, documentId, notify]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; setSize({ width, height }); });
    observer.observe(viewport.current); return () => observer.disconnect();
  }, [pdf, error]);
  const lastScale = useRef(1);
  const scale = page ? fit === "custom" ? zoom / 100 : fit === "page" ? Math.min((size.width - 48) / page.width, (size.height - 48) / page.height) : Math.min(1.65, (size.width - 48) / page.width) : lastScale.current;
  useEffect(() => { lastScale.current = scale; }, [scale]);
  const navigate = useCallback((number: number) => {
    if (!pdf || number < 1 || number > pdf.pageCount) return;
    viewport.current?.querySelector(`[data-continuous-page="${number}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    useReaderStore.getState().set({ currentPage: number, activeSelection: null });
    window.getSelection()?.removeAllRanges();
    void documentRepository.updateDocument(documentId, { currentPage: number, lastOpenedAt: new Date().toISOString() }).then(() => client.invalidateQueries({ queryKey: ["documents"] })).catch(reason => notify(readableError(reason)));
  }, [pdf, documentId, client, notify]);
  const dismiss = useCallback(() => { useReaderStore.getState().set({ activeSelection: null }); window.getSelection()?.removeAllRanges(); }, []);
  const save = useCallback(async (color: AnnotationColor = "yellow", note?: string) => {
    if (writing.current) return;
    const anchor = useReaderStore.getState().activeSelection, existing = annotations.find(a => a.id === selected);
    if (!anchor && !(existing && note !== undefined)) { notify("먼저 원문 텍스트를 선택해 주세요."); return; }
    writing.current = true; setSaving(true);
    try {
      const now = new Date().toISOString(), start = performance.now();
      const annotation: Annotation = !anchor && existing ? { ...existing, note, updatedAt: now } : { id: crypto.randomUUID(), type: "highlight", documentId, pageIndex: anchor!.pageIndex, color, anchor: anchor!, note, createdAt: now, updatedAt: now, resolutionStatus: "resolved" };
      if (!anchor && existing) await annotationRepository.update(annotation); else await annotationRepository.create(annotation);
      performance.measure("paperflow:annotation-persist", { start });
      await client.invalidateQueries({ queryKey: ["annotations"] }); setSelected(annotation.id); dismiss(); notify(note !== undefined ? "메모와 원문 위치를 저장했습니다." : "하이라이트를 저장했습니다.");
    } catch (reason) { notify(`저장하지 못했습니다. ${readableError(reason)}`); }
    finally { writing.current = false; setSaving(false); }
  }, [annotations, selected, documentId, client, dismiss, notify]);
  useEffect(() => { if (tool !== "highlight") return; const finish = () => { setTimeout(() => { if (useReaderStore.getState().activeSelection) void save(); }, 30); }; document.addEventListener("pointerup", finish); return () => document.removeEventListener("pointerup", finish); }, [tool, save]);
  const showNote = useCallback(() => { useReaderStore.getState().set({ inspectorOpen: true }); setTab("notes"); }, []);
  const saveNote = useCallback(async (text: string) => {
    if (useReaderStore.getState().activeSelection || annotations.some(a => a.id === selected)) { await save("yellow", text); return; }
    if (!text.trim()) return;
    const now = new Date().toISOString(), pageIndex = currentPage - 1;
    try {
      await annotationRepository.create({ id: crypto.randomUUID(), type: "note", documentId, pageIndex, color: "yellow", note: text.trim(), anchor: { version: 1, documentId, pageIndex, textQuote: `페이지 ${currentPage} 메모`, rects: [], normalizedRects: [], createdAt: now }, createdAt: now, updatedAt: now, resolutionStatus: "resolved" });
      await client.invalidateQueries({ queryKey: ["annotations"] }); notify("페이지 메모를 저장했다.");
    } catch (reason) { notify(`메모 저장 실패: ${readableError(reason)}`); }
  }, [annotations, selected, save, currentPage, documentId, client, notify]);
  const translateParagraph = useCallback(async (paragraph: PdfParagraph) => {
    translationController.current?.abort(); const controller = new AbortController(); translationController.current = controller;
    setActiveParagraph(paragraph); setTranslation({ pending: true }); setShowTranslations(true); setOriginalParagraphs(items => items.filter(id => id !== paragraph.id)); dismiss();
    setInlineTranslations(current => ({ ...Object.fromEntries(Object.entries(current).filter(([, value]) => !value.pending)), [paragraph.id]: { pending: true } }));
    try {
      const saved = await translationRepository.get(documentId, paragraph.pageIndex, paragraph.text);
      if (controller.signal.aborted) return;
      if (saved) { const result = { text: saved.text, provider: saved.provider, pending: false }; setTranslation(result); setInlineTranslations(current => ({ ...current, [paragraph.id]: result })); return; }
      const result = await translateHybrid(paragraph.text, controller.signal);
      if (controller.signal.aborted) return;
      await translationRepository.put(documentId, paragraph.pageIndex, paragraph.text, result.text, result.provider);
      setTranslation({ text: result.text, provider: result.provider, pending: false });
      setInlineTranslations(current => ({ ...current, [paragraph.id]: { text: result.text, provider: result.provider, pending: false } }));
    } catch (reason) { if (!controller.signal.aborted) { const failure = { pending: false, error: readableError(reason) }; setTranslation(failure); setInlineTranslations(current => ({ ...current, [paragraph.id]: failure })); } }
  }, [documentId, dismiss]);
  const translateSelection = useCallback(() => {
    const anchor = useReaderStore.getState().activeSelection;
    const box = anchor?.normalizedRects[0], cx = box ? box.x + box.width / 2 : -1, cy = box ? box.y + box.height / 2 : -1;
    const paragraph = paragraphs.find(item => item.pageIndex === currentPage - 1 && cx >= item.x - .02 && cx <= item.x + item.width + .02 && cy >= item.y - .02 && cy <= item.y + item.height + .02)
      ?? paragraphs.find(item => anchor && item.text.includes(anchor.textQuote.slice(0, 30))) ?? activeParagraph ?? paragraphs[0];
    if (paragraph) void translateParagraph(paragraph); else notify("번역할 문단을 불러오는 중입니다.");
  }, [paragraphs, currentPage, activeParagraph, translateParagraph, notify]);
  const batchTranslate = useCallback(async () => {
    if (bulk?.running) return;
    const controller = new AbortController(); bulkController.current = controller;
    const targets = paragraphs.filter(item => item.pageIndex === currentPage - 1 && item.text.length >= 12); let index = 0, done = 0, failed = 0;
    if (!targets.length) { notify("현재 페이지의 텍스트를 불러오는 중이다. 잠시 후 다시 눌러 달라."); return; }
    setBulk({ done: 0, total: targets.length, failed: 0, running: true }); setShowTranslations(true); setOriginalParagraphs([]); dismiss();
    while (index < targets.length && !controller.signal.aborted) {
      const group: PdfParagraph[] = []; let length = 0;
      while (index < targets.length && group.length < 4 && length + targets[index].text.length < 6500) { const item = targets[index++]; group.push(item); length += item.text.length; }
      if (!group.length) group.push(targets[index++]);
      try {
        const stored = await Promise.all(group.map(item => translationRepository.get(documentId, item.pageIndex, item.text)));
        const missing = group.filter((_, offset) => !stored[offset]);
        const batch = missing.length ? await researchBatchTranslate(missing.map(item => item.text), controller.signal) : [];
        if (batch === null) throw new Error("페이지 일괄 번역은 OpenAI 서버 연결이 필요하다. 연구 공간 접근 코드를 설정하고 다시 시도해 달라.");
        if (controller.signal.aborted) break;
        const results = await Promise.all(group.map(async (item, offset) => {
          const saved = stored[offset];
          if (saved) return saved;
          const translated = { text: batch[missing.indexOf(item)], provider: "OpenAI" as const };
          await translationRepository.put(documentId, item.pageIndex, item.text, translated.text, translated.provider);
          return translated;
        }));
        if (controller.signal.aborted) break;
        setInlineTranslations(current => { const next = { ...current }; group.forEach((item, offset) => { next[item.id] = { text: results[offset].text, provider: results[offset].provider, pending: false }; }); return next; });
      } catch (reason) {
        if (controller.signal.aborted) break;
        failed += group.length; const message = readableError(reason);
        setInlineTranslations(current => { const next = { ...current }; group.forEach(item => { next[item.id] = { pending: false, error: message }; }); return next; });
        if (/요청 한도|429|OpenAI 서버 연결/.test(message)) { notify(message); done += group.length; break; }
        notify(`문단 번역 실패: ${message}`);
      }
      done += group.length; if (bulkController.current === controller) setBulk({ done, total: targets.length, failed, running: true });
    }
    if (bulkController.current === controller) setBulk({ done, total: targets.length, failed, running: false });
  }, [bulk?.running, paragraphs, currentPage, documentId, notify, dismiss]);
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
  const inspect = (annotation: Annotation) => { dismiss(); setSelected(annotation.id); setTab("context"); navigate(annotation.pageIndex + 1); useReaderStore.getState().set({ inspectorOpen: true }); setTimeout(() => document.querySelector(`[data-annotation-id="${annotation.id}"]`)?.scrollIntoView({ block: "center" }), 200); };
  const remove = async (id: string) => { try { await annotationRepository.remove(id); await client.invalidateQueries({ queryKey: ["annotations"] }); if (selected === id) setSelected(undefined); } catch (reason) { notify(readableError(reason)); } };
  if (error || doc.error || marks.error) return <main className="pf-empty pf-reader-error"><h1>PDF를 열지 못했습니다</h1><p role="alert">{error || readableError(doc.error ?? marks.error)}</p><Button asChild><Link href="/library">라이브러리로</Link></Button><Button onClick={openImport}>PDF 다시 가져오기</Button></main>;
  return <div className="pf-reader-shell">
    <ReaderToolbar title={doc.data?.filename ?? "PDF 불러오는 중…"} pages={pdf?.pageCount ?? 1} page={currentPage} effectiveZoom={Math.round(scale * 100)} onPage={navigate} onSearch={focusSearch} onDownload={() => void download()} onBatchTranslate={() => void batchTranslate()} batchRunning={bulk?.running ?? false} canTranslate={paragraphs.some(item => item.pageIndex === currentPage - 1)} translated={showTranslations && originalParagraphs.length === 0} hasTranslations={Object.values(inlineTranslations).some(item => item.text)} onToggleTranslation={() => { dismiss(); setShowTranslations(!showTranslations || originalParagraphs.length > 0); setOriginalParagraphs([]); }}/>
    <div className="pf-annotation-tools" data-selection-ui onPointerDown={event => event.preventDefault()}>
      {([['select','선택'],['highlight','형광펜'],['pen','메모 펜'],['eraser','지우개']] as const).map(([value,label]) => <Button key={value} size="sm" variant="ghost" aria-pressed={tool === value} onClick={() => { useReaderStore.getState().set({ tool: value }); if (value === 'highlight' && useReaderStore.getState().activeSelection) void save(); }}>{label}</Button>)}
      <Button size="sm" variant="ghost" onClick={showNote}>텍스트 메모</Button><Button size="sm" variant="ghost" onClick={() => showShell("개념 설명")}>선택 개념 공부</Button>
    </div>
    {bulk && <div className="pf-inline-bulk" role="status"><span>{bulk.running ? "페이지를 한국어로 바꾸는 중" : "페이지 번역"} · {bulk.done}/{bulk.total}{bulk.failed ? ` · ${bulk.failed}개 실패` : ""}</span><progress value={bulk.done} max={Math.max(1, bulk.total)} aria-label="페이지 번역 진행"/>{bulk.running && <Button size="sm" variant="ghost" onClick={() => bulkController.current?.abort()}>중지</Button>}</div>}
    {searchOpen && <div className="pf-search-strip"><SearchField ref={searchInput} aria-label="현재 페이지 검색" value={search} onChange={e => setSearch(e.target.value)} placeholder="검색 UI · Phase 2"/><span>전체 논문 검색은 후속 단계에서 제공됩니다.</span><Button size="sm" onClick={() => setSearchOpen(false)}>닫기</Button></div>}
    <div className="pf-reader-body" data-rail={rail} data-inspector-open={inspector}>
      {rail && pdf && <PageRail pdf={pdf} current={currentPage} onPage={navigate}/>}
      <div className="pf-pdf-viewport dd-scrollbar" role="region" aria-label="PDF 원문 읽기 영역" tabIndex={0} data-pdf-viewport ref={viewport} onScroll={() => {
      const root = viewport.current; if (!root) return;
      const y = root.getBoundingClientRect().top + 100;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-continuous-page]"));
      const active = nodes.find(node => node.getBoundingClientRect().bottom > y);
      const number = Number(active?.dataset.continuousPage);
      if (number && number !== useReaderStore.getState().currentPage) { useReaderStore.getState().set({ currentPage: number }); void documentRepository.updateDocument(documentId, { currentPage: number, lastOpenedAt: new Date().toISOString() }); }
    }}><div className="pf-reader-hint">문단 클릭 → 그 자리에서 한국어로 · 공학 용어는 영어 유지</div>{pdf ? Array.from({ length: pdf.pageCount }, (_, index) => <ContinuousPage key={documentId + index} pdf={pdf} index={index} scale={Math.max(.1, scale)} documentId={documentId} annotations={annotations} selected={selected} onResolved={collectResolved} onParagraphs={collectParagraphs} onParagraph={paragraph => void translateParagraph(paragraph)} translations={showTranslations ? Object.fromEntries(Object.entries(inlineTranslations).filter(([id]) => !originalParagraphs.includes(id))) : {}} onOriginal={id => { dismiss(); setOriginalParagraphs(items => [...items, id]); }}/>) : <div className="pf-empty" role="status">PDF 원문을 불러오는 중…</div>}</div>
      {inspector && <ResearchInspector annotations={annotations} resolved={resolved} selected={selected} onSelect={inspect} onSaveNote={saveNote} onRemove={id => void remove(id)} saving={saving} tab={tab} setTab={setTab} shell={shell} paragraph={activeParagraph} translation={translation} bulk={bulk} onTranslate={translateSelection} onBatchTranslate={() => void batchTranslate()} onCancelBatch={() => bulkController.current?.abort()}/>}
    </div>
    <footer className="pf-reader-status"><span>원본 PDF 보존 · 로컬 저장</span><span>{annotations.filter(a => a.type === "highlight").length} 마킹 · {annotations.filter(a => a.type === "ink" || a.type === "note" || Boolean(a.note)).length} 메모</span><span>H 마킹 · N 메모 · Ctrl K 명령</span></footer>
    <ReaderSelectionTools documentId={documentId} onHighlight={color => void save(color)} onNote={showNote} onTranslate={translateSelection} onShell={showShell} onDismiss={dismiss} saving={saving}/>
  </div>;
}
