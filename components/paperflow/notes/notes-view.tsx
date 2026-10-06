"use client";
import "./notes.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { AtSign, FileText, PenLine, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { SearchField } from "@/components/ui/search-field";
import { DocumentCover } from "../library/document-cover";
import type { Annotation, AnnotationColor } from "@/lib/paperflow/anchors/types";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";
import { activeMention, groupByPaper, insertMention, mentionCandidates, noteTitle, parseNoteBody, plainNote, sortNotes, type MentionCandidate, type QuickNote } from "@/lib/paperflow/notes/notebook";
import { noteRepository } from "@/lib/paperflow/notes/note-repository";

const SWATCH: Record<AnnotationColor, string> = { yellow: "#f2c200", green: "#40c057", blue: "#4dabf7", pink: "#f06595", purple: "#9775fa" };
const KIND_LABEL = { paper: "논문", keyword: "키워드", mark: "마킹" } as const;
const markHref = (mark: Annotation) => `/reader/${mark.documentId}?page=${mark.pageIndex + 1}&annotation=${encodeURIComponent(mark.id)}`;
const markText = (mark: Annotation) => mark.type === "ink" ? "손글씨 메모" : (mark.anchor?.textQuote || mark.box?.text || "").trim();
const when = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });

/** A note body with its citations as pills that open the cited passage. */
function NoteText({ body }: { body: string }) {
  return <>{parseNoteBody(body).map((segment, index) => segment.kind === "text" ? <span key={index}>{segment.text}</span> : <Link key={index} className="pf-cite-pill" href={segment.href}>{segment.label}</Link>)}</>;
}

/** Left half: every mark and memo, grouped by the paper it belongs to. */
function MarksByPaper({ docs, annotations }: { docs: StoredDocument[]; annotations: Annotation[] }) {
  const [search, setSearch] = useState(""), [closed, setClosed] = useState<Set<string>>(new Set());
  const needle = search.trim().toLowerCase();
  const groups = useMemo(() => groupByPaper(docs, annotations).map(group => ({ ...group, shown: needle && !group.doc.title.toLowerCase().includes(needle) ? group.marks.filter(mark => `${markText(mark)} ${mark.note ?? ""}`.toLowerCase().includes(needle)) : group.marks })).filter(group => group.shown.length), [docs, annotations, needle]);
  return <section className="pf-notes-marks" aria-label="논문별 마킹과 메모">
    <header className="pf-notes-head"><h2>논문별 마킹 · 메모<span className="pf-count">{annotations.length}</span></h2><SearchField aria-label="마킹 검색" placeholder="문장·메모·제목으로 찾기" value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch("")}/></header>
    {!groups.length && <div className="pf-notes-empty"><FileText size={26}/><h3>{needle ? "찾는 마킹이 없습니다" : "원문에서 시작하는 메모"}</h3><p>{needle ? "다른 단어로 찾아보세요." : "Reader에서 마킹·펜·텍스트 메모를 남기면 논문별로 이곳에 모입니다."}</p></div>}
    <div className="pf-paper-groups">{groups.map(({ doc, shown, highlights, memos }) => { const open = !closed.has(doc.id); return <article key={doc.id} className="pf-paper-group" data-open={open || undefined}>
      <button type="button" className="pf-paper-group-head" aria-expanded={open} onClick={() => setClosed(current => { const next = new Set(current); if (next.has(doc.id)) next.delete(doc.id); else next.add(doc.id); return next; })}>
        <span className="pf-paper-group-cover"><DocumentCover documentId={doc.id} title={doc.title}/></span>
        <span className="pf-paper-group-meta"><b>{doc.title.replace(/\.pdf$/i, "")}</b><small>{[doc.authors?.[0], doc.journal, doc.year].filter(Boolean).join(" · ") || `${doc.pageCount}p`}</small><span className="pf-paper-group-counts"><em>마킹 {highlights}</em><em>메모 {memos}</em></span></span>
      </button>
      {open && <ol className="pf-mark-list">{shown.map(mark => <li key={mark.id}>
        <Link href={markHref(mark)} className="pf-mark-row">
          <i className="pf-mark-dot" style={{ background: SWATCH[mark.color] ?? SWATCH.yellow }} aria-hidden="true"/>
          <span className="pf-mark-body"><q data-type={mark.type}>{markText(mark)}</q>{mark.note?.trim() && <span className="pf-mark-note">{mark.note}</span>}</span>
          <span className="pf-mark-page">p.{mark.pageIndex + 1}</span>
        </Link>
      </li>)}</ol>}
    </article>; })}</div>
  </section>;
}

/** Right half: a notebook of quick notes that cite my papers with "@". */
function Notebook({ docs, annotations }: { docs: StoredDocument[]; annotations: Annotation[] }) {
  const client = useQueryClient(), reduced = useReducedMotion();
  const notes = useQuery({ queryKey: ["notebook"], queryFn: () => noteRepository.list() });
  const [activeId, setActiveId] = useState<string | null>(null), [search, setSearch] = useState("");
  const [draft, setDraft] = useState<QuickNote | null>(null), [mention, setMention] = useState<{ start: number; query: string } | null>(null), [pick, setPick] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null), saving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const list = useMemo(() => sortNotes(notes.data ?? [], search), [notes.data, search]);
  const candidates = useMemo<MentionCandidate[]>(() => mention ? mentionCandidates(mention.query, docs, annotations) : [], [mention, docs, annotations]);

  // Open the most recent note at first; keep the draft in step with the note being edited.
  useEffect(() => { if (!activeId && list.length) setActiveId(list[0].id); }, [activeId, list]);
  useEffect(() => { const note = (notes.data ?? []).find(item => item.id === activeId) ?? null; setDraft(current => current?.id === note?.id ? current : note); setMention(null); }, [activeId, notes.data]);

  const store = (note: QuickNote) => { client.setQueryData<QuickNote[]>(["notebook"], current => [...(current ?? []).filter(item => item.id !== note.id), note]); return noteRepository.put(note); };
  const edit = (patch: Partial<QuickNote>) => {
    if (!draft) return;
    const next = { ...draft, ...patch, updatedAt: new Date().toISOString() };
    setDraft(next);
    if (saving.current) clearTimeout(saving.current);
    saving.current = setTimeout(() => void store(next), 350);
  };
  useEffect(() => () => { if (saving.current) clearTimeout(saving.current); }, []);
  const create = async () => { const now = new Date().toISOString(), note: QuickNote = { id: crypto.randomUUID(), title: "", body: "", pinned: false, createdAt: now, updatedAt: now }; await store(note); setActiveId(note.id); setDraft(note); setTimeout(() => area.current?.focus(), 30); };
  const remove = async (note: QuickNote) => { if (!window.confirm(`"${noteTitle(note)}" 노트를 삭제합니다.`)) return; await noteRepository.remove(note.id); client.setQueryData<QuickNote[]>(["notebook"], current => (current ?? []).filter(item => item.id !== note.id)); if (activeId === note.id) setActiveId(null); };
  const choose = (candidate: MentionCandidate) => {
    if (!draft || !mention) return;
    const { text, caret } = insertMention(draft.body, mention, candidate.token);
    edit({ body: text }); setMention(null);
    requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(caret, caret); });
  };
  const track = (text: string, caret: number) => { const next = activeMention(text, caret); setMention(next); setPick(0); };

  return <section className="pf-notes-book" aria-label="노트">
    <header className="pf-notes-head"><h2>노트<span className="pf-count">{notes.data?.length ?? 0}</span></h2><div className="pf-notes-head-tools"><SearchField aria-label="노트 검색" placeholder="노트 찾기" value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch("")}/><Button size="sm" variant="primary" onClick={() => void create()}><Plus size={14}/>새 노트</Button></div></header>
    <div className="pf-notes-split">
      <ul className="pf-notes-list" role="listbox" aria-label="노트 목록">
        {list.map(note => <li key={note.id}><button type="button" role="option" aria-selected={note.id === activeId} onClick={() => setActiveId(note.id)}>
          <span className="pf-notes-list-title">{note.pinned && <Pin size={11}/>}{noteTitle(note)}</span>
          <small>{when(note.updatedAt)} · {plainNote(note.body).replace(/\s+/g, " ").slice(0, 46) || "빈 노트"}</small>
        </button></li>)}
        {!list.length && <li className="pf-notes-list-empty">{search ? "찾는 노트가 없습니다." : "아직 노트가 없습니다."}</li>}
      </ul>
      {draft ? <motion.div key={draft.id} className="pf-note-editor" initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <div className="pf-note-editor-top">
          <input className="pf-note-title" aria-label="노트 제목" placeholder="제목" value={draft.title} onChange={event => edit({ title: event.target.value })}/>
          <IconButton label={draft.pinned ? "고정 해제" : "위에 고정"} size="sm" variant="ghost" aria-pressed={draft.pinned} onClick={() => edit({ pinned: !draft.pinned })}>{draft.pinned ? <PinOff size={15}/> : <Pin size={15}/>}</IconButton>
          <IconButton label="노트 삭제" size="sm" variant="ghost" onClick={() => void remove(draft)}><Trash2 size={15}/></IconButton>
        </div>
        <div className="pf-note-write">
          <textarea ref={area} aria-label="노트 내용" placeholder={"생각을 적어 보세요.\n@ 를 입력하면 내 논문, 키워드, 마킹한 문장을 인용할 수 있습니다."} value={draft.body}
            onChange={event => { edit({ body: event.target.value }); track(event.target.value, event.target.selectionStart); }}
            onClick={event => track(event.currentTarget.value, event.currentTarget.selectionStart)}
            onBlur={() => setTimeout(() => setMention(null), 150)}
            onKeyDown={event => {
              if (!mention || !candidates.length) return;
              if (event.key === "ArrowDown") { event.preventDefault(); setPick(index => (index + 1) % candidates.length); }
              else if (event.key === "ArrowUp") { event.preventDefault(); setPick(index => (index - 1 + candidates.length) % candidates.length); }
              else if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); choose(candidates[pick]); }
              else if (event.key === "Escape") { event.preventDefault(); setMention(null); }
            }}/>
          {mention && <div className="pf-mention-menu" role="listbox" aria-label="인용할 항목">
            <p className="pf-mention-hint"><AtSign size={12}/>{mention.query ? `"${mention.query}"` : "논문 · 키워드 · 마킹 문장"}</p>
            {candidates.length ? candidates.map((candidate, index) => <button key={candidate.key} type="button" role="option" aria-selected={index === pick} onMouseDown={event => { event.preventDefault(); choose(candidate); }} onMouseEnter={() => setPick(index)}>
              <span className="pf-mention-kind" data-kind={candidate.kind}>{candidate.color && <i style={{ background: SWATCH[candidate.color] }}/>}{KIND_LABEL[candidate.kind]}</span>
              <span className="pf-mention-copy"><b>{candidate.label}</b><small>{candidate.detail}</small></span>
            </button>) : <p className="pf-mention-none">맞는 논문이나 마킹이 없습니다.</p>}
          </div>}
        </div>
        {draft.body.includes("[[") && <div className="pf-note-preview" aria-label="인용 미리보기"><span className="pf-notes-label">미리보기</span><p><NoteText body={draft.body}/></p></div>}
        <small className="pf-note-saved">{when(draft.updatedAt)} 저장 · 이 기기에 보관</small>
      </motion.div> : <div className="pf-notes-empty pf-note-editor"><PenLine size={26}/><h3>생각을 적는 노트</h3><p>@ 로 내 논문과 마킹한 문장을 인용하면, 누를 때 원문으로 이동합니다.</p><Button size="sm" variant="primary" onClick={() => void create()}><Plus size={14}/>새 노트</Button></div>}
    </div>
  </section>;
}

/** 노트: marks grouped by paper on the left, the notebook on the right. */
export function NotesView({ docs, annotations }: { docs: StoredDocument[]; annotations: Annotation[] }) {
  return <div className="pf-notes"><MarksByPaper docs={docs} annotations={annotations}/><Notebook docs={docs} annotations={annotations}/></div>;
}
