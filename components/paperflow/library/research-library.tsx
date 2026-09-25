"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, Command, Moon, Plus, Sun, Upload, Archive, ArrowLeft, Network, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SearchField } from "@/components/ui/search-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Badge } from "@/components/ui/badge";
import { PaperflowSidebar } from "../shell/paperflow-sidebar";
import { usePaperflow } from "../shell/paperflow-context";
import { documentRepository } from "@/lib/paperflow/persistence/document-repository";
import { annotationRepository } from "@/lib/paperflow/persistence/annotation-repository";
import { readableError } from "@/lib/paperflow/errors";
import { DocumentCover } from "./document-cover";

export function ResearchLibrary() {
  const { openImport, importFiles, importing, openCommand, toggleTheme, dark, notify } = usePaperflow();
  const [view, setView] = useState("library"), [search, setSearch] = useState(""), [dragging, setDragging] = useState(false), [limit, setLimit] = useState(30), [layout, setLayout] = useState("shelf");
  const reduced = useReducedMotion(), client = useQueryClient();
  const docs = useQuery({ queryKey: ["documents"], queryFn: () => documentRepository.listDocuments() });
  const annotations = useQuery({ queryKey: ["annotations"], queryFn: () => annotationRepository.listAll() });
  const archive = useMutation({ mutationFn: ({ id, archived }: { id: string; archived: boolean }) => documentRepository.updateDocument(id, { archived }), onSuccess: () => client.invalidateQueries({ queryKey: ["documents"] }), onError: error => notify(readableError(error)) });
  const filtered = useMemo(() => (docs.data ?? []).filter(d => d.archived === (view === "archive") && `${d.title} ${d.filename}`.toLowerCase().includes(search.toLowerCase())), [docs.data, view, search]);
  const recent = (docs.data ?? []).find(d => !d.archived && d.lastOpenedAt);
  const heading = view === "archive" ? "아카이브" : view === "notes" ? "나의 연구 노트" : view === "map" ? "연구맵" : "나의 연구 서재";
  return <div className="pf-library-shell" onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); void importFiles(Array.from(event.dataTransfer.files)); }}>
    <PaperflowSidebar view={view} onView={setView}/>
    <main className="pf-library-main">
      <header className="pf-library-top"><span className="pf-breadcrumb">Workspace <span>/</span> {heading}</span><div className="pf-toolbar-group"><IconButton label="Toggle theme" variant="ghost" onClick={toggleTheme}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</IconButton><Button variant="ghost" onClick={openCommand}><Command size={15}/><span className="pf-command-label">명령</span><kbd>Ctrl K</kbd></Button></div></header>
      <div className="pf-library-content">
        <div className="pf-heading"><div><div className="pf-kicker">YOUR RESEARCH, COLLECTED.</div><h1>{heading}</h1><p>한 편씩 모으고, 한 문장씩 깊이 읽는 나만의 공간.</p></div><Button variant="primary" className="pf-import-button" onClick={openImport} disabled={importing}><Plus size={17}/>{importing ? "가져오는 중…" : "PDF 가져오기"}</Button></div>
        {(docs.error || annotations.error) && <p role="alert" className="pf-error">{readableError(docs.error ?? annotations.error)}</p>}
        {view === "library" && recent && <section className="pf-continue">
          <GlassPanel className="pf-continue-card"><Link className="pf-continue-cover" href={`/reader/${recent.id}`} aria-label="최근 논문 이어 읽기"><DocumentCover documentId={recent.id} title={recent.title}/></Link><div className="pf-continue-copy"><span className="pf-kicker">CONTINUE READING</span><h3>{recent.title}</h3><p>{recent.currentPage} / {recent.pageCount} 페이지 · 마지막으로 읽던 곳에서</p><progress value={recent.currentPage} max={recent.pageCount} aria-label="Reading progress"/></div><Button asChild variant="primary"><Link href={`/reader/${recent.id}`}>이어 읽기 <ArrowUpRight size={16}/></Link></Button></GlassPanel>
        </section>}
        {(view === "library" || view === "archive") && <section className="pf-collection-section"><div className="pf-collection-toolbar"><div className="pf-section-title"><h2>{view === "archive" ? "보관한 논문" : "My collection"}<span className="pf-count">{filtered.length}</span></h2></div><div className="pf-collection-controls"><SearchField data-paper-search aria-label="논문 검색" placeholder="제목으로 찾기" value={search} onChange={event => { setSearch(event.target.value); setLimit(30); }} onClear={() => setSearch("")}/><SegmentedControl value={layout} onValueChange={setLayout} items={[{ value: "shelf", label: "서가" }, { value: "list", label: "목록" }]}/></div></div>
          <div className="pf-paper-list" data-layout={layout}>
          {docs.isPending ? <div className="pf-empty" role="status">저장한 논문을 불러오는 중…</div> : filtered.length === 0 ? <div className="pf-empty pf-collection-empty"><span className="pf-empty-book"><BookOpen size={35}/></span><h3>{search ? "검색 결과가 없습니다" : view === "archive" ? "보관한 논문이 없습니다" : "첫 논문을 서재에 놓아보세요"}</h3><p>PDF를 이곳에 놓으면 첫 페이지가 표지가 됩니다.<br/>읽은 문장과 메모가 논문 곁에 쌓입니다.</p><Button onClick={openImport}><Plus size={15}/> PDF 선택</Button></div> : filtered.slice(0, limit).map((doc, index) => { const marks = (annotations.data ?? []).filter(a => a.documentId === doc.id); return <motion.article className="pf-paper-row pf-book-card" key={doc.id} initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .24, delay: Math.min(index, 7) * .025 }}>
            <Link className="pf-paper-link" href={`/reader/${doc.id}`}><DocumentCover documentId={doc.id} title={doc.title}/><span className="pf-book-title"><strong>{doc.title.replace(/\.pdf$/i, "")}</strong><small>{doc.pageCount} pages · {(doc.byteLength / 1024 / 1024).toFixed(1)} MB</small></span></Link>
            <div className="pf-book-details"><div className="pf-progress"><span>{doc.lastOpenedAt ? `${Math.round(doc.currentPage / doc.pageCount * 100)}% 읽음` : "새로운 논문"}</span><progress aria-label={`${doc.title} 읽기 진행`} value={doc.lastOpenedAt ? doc.currentPage : 0} max={doc.pageCount}/></div><div className="pf-record-count"><Bookmark size={12}/>{marks.length}<span className="sr-only"> 마킹</span></div><IconButton label={doc.archived ? "아카이브에서 복원" : "논문 보관"} variant="ghost" size="sm" disabled={archive.isPending} onClick={() => archive.mutate({ id: doc.id, archived: !doc.archived })}>{doc.archived ? <ArrowLeft size={15}/> : <Archive size={15}/>}</IconButton></div>
          </motion.article>; })}</div>
          {filtered.length > limit && <Button onClick={() => setLimit(number => number + 30)}>30개 더 보기</Button>}
        </section>}
        {view === "notes" && <section className="pf-notebook">{(annotations.data ?? []).filter(a => a.note).map(a => <GlassPanel className="pf-note-card" key={a.id}><Badge>사용자 메모</Badge><blockquote>{a.anchor.textQuote}</blockquote><p>{a.note}</p><Link href={`/reader/${a.documentId}?page=${a.pageIndex + 1}&annotation=${a.id}`}>원문 {a.pageIndex + 1}페이지로 <ArrowUpRight size={14}/></Link></GlassPanel>)}{!annotations.data?.some(a => a.note) && <div className="pf-empty"><h3>원문에서 시작하는 메모</h3><p>Reader에서 문장을 선택하고 메모를 남겨보세요.</p></div>}</section>}
        {view === "map" && <GlassPanel className="pf-empty pf-map-empty"><Network size={32}/><h3>나의 논문에서 시작될 연구맵</h3><p>저장한 원문 마킹과 메모를 개념으로 연결하는 기능을 준비하고 있습니다.</p><Button variant="ghost" onClick={() => setView("library")}>서재로 돌아가기 <ArrowUpRight size={15}/></Button></GlassPanel>}
        <footer className="pf-library-footer"><span>원문은 그대로, 생각은 더 깊게.</span><span>PRIVATE LIBRARY · LOCAL STORAGE</span></footer>
      </div>
    </main>
    {dragging && <div className="pf-drop-overlay"><Upload size={38}/><h2>PDF를 놓아 서재에 추가</h2><p>원본 파일은 변경되지 않습니다.</p></div>}
  </div>;
}
