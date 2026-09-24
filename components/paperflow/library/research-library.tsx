"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, Command, FileText, FolderOpen, Moon, Plus, Sun, Upload, Archive, ArrowLeft, Check, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SearchField } from "@/components/ui/search-field";
import { Badge } from "@/components/ui/badge";
import { PaperflowSidebar } from "../shell/paperflow-sidebar";
import { usePaperflow } from "../shell/paperflow-context";
import { documentRepository } from "@/lib/paperflow/persistence/document-repository";
import { annotationRepository } from "@/lib/paperflow/persistence/annotation-repository";
import { researchPools, evidenceSignals } from "@/lib/paperflow/fixtures/mock-research";
import { readableError } from "@/lib/paperflow/errors";

export function ResearchLibrary() {
  const { openImport, importFiles, importing, openCommand, toggleTheme, dark, notify } = usePaperflow();
  const [view, setView] = useState("library"), [search, setSearch] = useState(""), [dragging, setDragging] = useState(false), [limit, setLimit] = useState(30);
  const client = useQueryClient();
  const docs = useQuery({ queryKey: ["documents"], queryFn: () => documentRepository.listDocuments() });
  const annotations = useQuery({ queryKey: ["annotations"], queryFn: () => annotationRepository.listAll() });
  const archive = useMutation({ mutationFn: ({ id, archived }: { id: string; archived: boolean }) => documentRepository.updateDocument(id, { archived }), onSuccess: () => client.invalidateQueries({ queryKey: ["documents"] }), onError: error => notify(readableError(error)) });
  const filtered = useMemo(() => (docs.data ?? []).filter(d => d.archived === (view === "archive") && `${d.title} ${d.filename}`.toLowerCase().includes(search.toLowerCase())), [docs.data, view, search]);
  const recent = (docs.data ?? []).find(d => !d.archived && d.lastOpenedAt);
  const heading = view === "archive" ? "아카이브" : view === "notes" ? "노트 모아보기" : view === "map" ? "연구맵" : "Research Library";
  return <div className="pf-library-shell" onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); void importFiles(Array.from(event.dataTransfer.files)); }}>
    <PaperflowSidebar view={view} onView={setView}/>
    <main className="pf-library-main">
      <header className="pf-library-top"><span className="pf-breadcrumb">Workspace <span>/</span> {heading}</span><div className="pf-toolbar-group"><IconButton label="Toggle theme" variant="ghost" onClick={toggleTheme}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</IconButton><Button variant="ghost" onClick={openCommand}><Command size={15}/><span className="pf-command-label">명령</span><kbd>Ctrl K</kbd></Button></div></header>
      <div className="pf-library-content">
        <div className="pf-heading"><div><div className="pf-kicker">PAPER FIRST. EVIDENCE ALWAYS.</div><h1>{heading}</h1><p>논문을 읽고, 중요한 근거를 나의 연구로 연결하세요.</p></div><Button variant="primary" onClick={openImport} disabled={importing}><Plus size={17}/>{importing ? "가져오는 중…" : "PDF 가져오기"}</Button></div>
        {(docs.error || annotations.error) && <p role="alert" className="pf-error">{readableError(docs.error ?? annotations.error)}</p>}
        {view === "library" && <>
          <section className="pf-continue"><div className="pf-section-title"><h2>Continue reading</h2><span>몰입을 이어가세요</span></div>
            <GlassPanel className="pf-continue-card"><div className="pf-paper-symbol"><FileText size={35}/><span>PDF</span></div><div className="pf-continue-copy"><span className="pf-kicker">{recent ? "LAST OPENED" : "YOUR NEXT DISCOVERY"}</span><h3>{recent?.title ?? "한 편의 논문에서 시작하는 연구"}</h3><p>{recent ? `${recent.currentPage} / ${recent.pageCount} 페이지 · 원문과 하이라이트가 저장되어 있습니다.` : "원문은 그대로. 마킹과 메모는 정확한 문장 위에."}</p>{recent && <progress value={recent.currentPage} max={recent.pageCount} aria-label="Reading progress"/>}</div>{recent ? <Button asChild variant="primary"><Link href={`/reader/${recent.id}`}>이어 읽기 <ArrowUpRight size={16}/></Link></Button> : <Button onClick={openImport}><Upload size={16}/> 첫 PDF 열기</Button>}</GlassPanel>
          </section>
          <section><div className="pf-section-title"><h2>Research pools</h2><span>주제 예시 · Demo</span></div><div className="pf-pools">{researchPools.map(pool => <GlassPanel key={pool.id} className="pf-pool"><FolderOpen size={19}/><span className="pf-kicker">{pool.label}</span><h3>{pool.name}</h3><p>{pool.detail}</p><span className="pf-demo-label">연구 주제 예시</span></GlassPanel>)}</div></section>
        </>}
        {(view === "library" || view === "archive") && <section><div className="pf-section-title"><h2>{view === "archive" ? "보관한 논문" : "Your papers"} <span className="pf-count">{filtered.length}</span></h2><SearchField data-paper-search aria-label="논문 검색" placeholder="논문 제목 검색…" value={search} onChange={e => { setSearch(e.target.value); setLimit(30); }} onClear={() => setSearch("")}/></div>
          <div className="pf-paper-list"><div className="pf-list-heading"><span>논문 / PAPER</span><span>읽기 진행</span><span>기록</span><span>보관</span></div>
          {docs.isPending ? <div className="pf-empty" role="status">저장한 논문을 불러오는 중…</div> : filtered.length === 0 ? <div className="pf-empty"><BookOpen size={28}/><h3>{search ? "검색 결과가 없습니다" : view === "archive" ? "보관한 논문이 없습니다" : "연구할 논문을 가져오세요"}</h3><p>PDF를 이곳에 놓거나 가져오기 버튼을 누르세요.<br/>원본과 기록은 이 브라우저에 저장됩니다.</p><Button onClick={openImport}><Plus size={15}/> PDF 선택</Button></div> : filtered.slice(0, limit).map(doc => { const marks = (annotations.data ?? []).filter(a => a.documentId === doc.id); return <div className="pf-paper-row" key={doc.id}><Link className="pf-paper-link" href={`/reader/${doc.id}`}><span className="pf-file-icon"><FileText size={22}/></span><span><strong>{doc.title}</strong><small>LOCAL PDF · {doc.pageCount} pages · {(doc.byteLength / 1024 / 1024).toFixed(1)} MB</small></span></Link><div className="pf-progress"><span>{doc.lastOpenedAt ? `${doc.currentPage} / ${doc.pageCount}` : "읽기 전"}</span><progress aria-label={`${doc.title} 읽기 진행`} value={doc.lastOpenedAt ? doc.currentPage : 0} max={doc.pageCount}/></div><div className="pf-record-count">{marks.length} 마킹<small>{marks.filter(a => a.note).length} 메모</small></div><IconButton label={doc.archived ? "아카이브에서 복원" : "논문 보관"} variant="ghost" disabled={archive.isPending} onClick={() => archive.mutate({ id: doc.id, archived: !doc.archived })}>{doc.archived ? <ArrowLeft size={17}/> : <Archive size={17}/>}</IconButton></div>; })}</div>
          {filtered.length > limit && <Button onClick={() => setLimit(n => n + 30)}>30개 더 보기</Button>}
        </section>}
        {view === "notes" && <section className="pf-notebook">{(annotations.data ?? []).filter(a => a.note).map(a => <GlassPanel className="pf-note-card" key={a.id}><Badge>사용자 메모</Badge><blockquote>{a.anchor.textQuote}</blockquote><p>{a.note}</p><Link href={`/reader/${a.documentId}?page=${a.pageIndex + 1}&annotation=${a.id}`}>원문 {a.pageIndex + 1}페이지로 <ArrowUpRight size={14}/></Link></GlassPanel>)}{!annotations.data?.some(a => a.note) && <div className="pf-empty"><h3>원문에서 시작하는 메모</h3><p>Reader에서 문장을 선택하고 메모를 남겨보세요.</p></div>}</section>}
        {view === "map" && <GlassPanel className="pf-empty"><Network size={32}/><h3>근거로 연결되는 연구맵</h3><p>논문 → 원문 마킹 → 사용자 메모까지 지금 저장할 수 있습니다.<br/>개념 연결과 연구맵은 후속 단계에서 제공됩니다.</p><Badge>Phase 3 · 준비 중</Badge></GlassPanel>}
        {view === "library" && <section className="pf-signals"><div className="pf-section-title"><h2>Evidence signals</h2><Badge>Demo · 실제 분석 아님</Badge></div>{evidenceSignals.map(signal => <div className="pf-signal" key={signal.topic}><Check size={15}/><strong>{signal.topic}</strong><p>{signal.description}</p><span>{signal.kind}</span></div>)}</section>}
        <footer className="pf-library-footer"><span>원문은 그대로, 생각은 더 깊게.</span><span>PAPERFLOW / PHASE 01</span></footer>
      </div>
    </main>
    {dragging && <div className="pf-drop-overlay"><Upload size={38}/><h2>PDF를 놓아 라이브러리에 추가</h2><p>원본 파일은 변경되지 않습니다.</p></div>}
  </div>;
}
