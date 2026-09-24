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
import { PdfPage } from "./pdf-page";
import { ResearchInspector } from "./research-inspector";
import { ReaderSelectionTools } from "./reader-selection-tools";
import type { ResolvedAnnotation } from "./highlight-layer";
const emptyAnnotations: Annotation[] = [];

export function ReaderShell({ documentId }: { documentId: string }) {
  const { notify, registerReader, openImport } = usePaperflow(), client = useQueryClient();
  const doc = useQuery({ queryKey: ["documents", documentId], queryFn: () => documentRepository.getDocument(documentId) });
  const marks = useQuery({ queryKey: ["annotations", documentId], queryFn: () => annotationRepository.listByDocument(documentId) });
  const annotations = marks.data ?? emptyAnnotations;
  const [pdf, setPdf] = useState<PdfDocumentHandle | null>(null), [page, setPage] = useState<PdfPageHandle | null>(null), [error, setError] = useState("");
  const [selected, setSelected] = useState<string>(), [resolved, setResolved] = useState<ResolvedAnnotation[]>([]), [saving, setSaving] = useState(false), [tab, setTab] = useState("context"), [shell, setShell] = useState("");
  const [searchOpen, setSearchOpen] = useState(false), [search, setSearch] = useState("");
  const viewport = useRef<HTMLDivElement>(null), searchInput = useRef<HTMLInputElement>(null), writing = useRef(false);
  const [size, setSize] = useState({ width: 700, height: 800 });
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
      await documentRepository.updateDocument(documentId, { lastOpenedAt: new Date().toISOString(), currentPage: initialPage });
      await client.invalidateQueries({ queryKey: ["documents"] });
    })().catch(reason => { if (!controller.signal.aborted) setError(readableError(reason)); });
    return () => { controller.abort(); useReaderStore.getState().set({ activeSelection: null }); if (handle) void handle.destroy(); };
  }, [documentId, client]);
  useEffect(() => {
    if (!pdf) return;
    let active = true; setPage(null); setResolved([]); useReaderStore.getState().set({ activeSelection: null });
    void pdf.getPage(currentPage).then(result => {
      if (!active) return; setPage(result);
      if (currentPage < pdf.pageCount) void pdf.getPage(currentPage + 1).catch(() => { /* Foreground navigation reports actual failures. */ });
    }).catch(reason => { if (active) setError(readableError(reason)); });
    viewport.current?.scrollTo({ top: 0, left: 0 });
    return () => { active = false; };
  }, [pdf, currentPage]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; setSize({ width, height }); });
    observer.observe(viewport.current); return () => observer.disconnect();
  }, [pdf, error]);
  const scale = page ? fit === "custom" ? zoom / 100 : fit === "page" ? Math.min((size.width - 48) / page.width, (size.height - 48) / page.height) : Math.min(1.65, (size.width - 48) / page.width) : 1;
  const navigate = useCallback((number: number) => {
    if (!pdf || number < 1 || number > pdf.pageCount) return;
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
  const showNote = useCallback(() => { useReaderStore.getState().set({ inspectorOpen: true }); setTab("notes"); }, []);
  const showShell = useCallback((name: string) => {
    if (name === "Copy citation") { notify("서지정보를 확인하지 않은 로컬 PDF입니다. 정확한 인용을 위해 저자·DOI 정보가 필요합니다."); return; }
    setShell(name); setTab("context"); useReaderStore.getState().set({ inspectorOpen: true }); notify(`${name} · Available in Phase 2`);
  }, [notify]);
  const focusSearch = useCallback(() => { setSearchOpen(true); setTimeout(() => searchInput.current?.focus(), 0); }, []);
  const commands = useMemo(() => ({
    previous: currentPage > 1 ? () => navigate(currentPage - 1) : undefined,
    next: pdf && currentPage < pdf.pageCount ? () => navigate(currentPage + 1) : undefined,
    highlight: () => { void save(); }, note: showNote, translate: () => showShell("Hybrid 번역"), explain: () => showShell("개념 설명"), search: focusSearch,
    fitWidth: () => useReaderStore.getState().set({ fitMode: "width", activeSelection: null }), fitPage: () => useReaderStore.getState().set({ fitMode: "page", activeSelection: null }),
    toggleInspector: () => useReaderStore.getState().set({ inspectorOpen: !useReaderStore.getState().inspectorOpen })
  }), [currentPage, pdf, navigate, save, showNote, showShell, focusSearch]);
  useEffect(() => { registerReader(commands); return () => registerReader(null); }, [commands, registerReader]);
  const download = async () => { try { const blob = await documentRepository.getDocumentBlob(documentId); if (!blob) throw new Error("원본 PDF가 없습니다."); const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = doc.data?.filename ?? "paper.pdf"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (reason) { notify(readableError(reason)); } };
  const inspect = (annotation: Annotation) => { dismiss(); setSelected(annotation.id); setTab("context"); navigate(annotation.pageIndex + 1); useReaderStore.getState().set({ inspectorOpen: true }); setTimeout(() => document.querySelector(`[data-annotation-id="${annotation.id}"]`)?.scrollIntoView({ block: "center" }), 200); };
  const remove = async (id: string) => { try { await annotationRepository.remove(id); await client.invalidateQueries({ queryKey: ["annotations"] }); if (selected === id) setSelected(undefined); } catch (reason) { notify(readableError(reason)); } };
  if (error || doc.error || marks.error) return <main className="pf-empty pf-reader-error"><h1>PDF를 열지 못했습니다</h1><p role="alert">{error || readableError(doc.error ?? marks.error)}</p><Button asChild><Link href="/library">라이브러리로</Link></Button><Button onClick={openImport}>PDF 다시 가져오기</Button></main>;
  return <div className="pf-reader-shell">
    <ReaderToolbar title={doc.data?.filename ?? "PDF 불러오는 중…"} pages={pdf?.pageCount ?? 1} page={currentPage} effectiveZoom={Math.round(scale * 100)} onPage={navigate} onSearch={focusSearch} onDownload={() => void download()}/>
    {searchOpen && <div className="pf-search-strip"><SearchField ref={searchInput} aria-label="현재 페이지 검색" value={search} onChange={e => setSearch(e.target.value)} placeholder="검색 UI · Phase 2"/><span>전체 논문 검색은 후속 단계에서 제공됩니다.</span><Button size="sm" onClick={() => setSearchOpen(false)}>닫기</Button></div>}
    <div className="pf-reader-body" data-rail={rail} data-inspector-open={inspector}>
      {rail && pdf && <PageRail count={pdf.pageCount} current={currentPage} onPage={navigate}/>}
      <div className="pf-pdf-viewport dd-scrollbar" role="region" aria-label="PDF 원문 읽기 영역" tabIndex={0} data-pdf-viewport ref={viewport}>{page ? <PdfPage key={`${documentId}-${currentPage}-${scale}`} page={page} scale={Math.max(.1, scale)} documentId={documentId} pageIndex={currentPage - 1} annotations={annotations} selected={selected} onResolved={setResolved}/> : <div className="pf-empty" role="status">PDF 원문을 불러오는 중…</div>}</div>
      {inspector && <ResearchInspector annotations={annotations} resolved={resolved} selected={selected} onSelect={inspect} onSaveNote={text => save("yellow", text)} onRemove={id => void remove(id)} saving={saving} tab={tab} setTab={setTab} shell={shell}/>}
    </div>
    <footer className="pf-reader-status"><span>원본 PDF 보존 · 로컬 저장</span><span>{annotations.length} 마킹 · {annotations.filter(a => a.note).length} 메모</span><span>H 마킹 · N 메모 · Ctrl K 명령</span></footer>
    <ReaderSelectionTools documentId={documentId} onHighlight={color => void save(color)} onNote={showNote} onShell={showShell} onDismiss={dismiss} saving={saving}/>
  </div>;
}
