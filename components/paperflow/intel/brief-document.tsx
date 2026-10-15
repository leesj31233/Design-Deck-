"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Brush, Droplet, Eraser, Flashlight, Highlighter, Maximize2, Minimize2, MousePointer2, PenLine, Redo2, Trash2, Type, Undo2, X, Zap } from "lucide-react";
import type { Annotation, AnnotationColor } from "@/lib/paperflow/anchors/types";
import { annotationRepository } from "@/lib/paperflow/persistence/annotation-repository";
import { createAnnotation, removeAnnotation, updateAnnotation, undo, redo } from "@/lib/paperflow/state/history";
import { locate, offsetAtPoint, offsetOf, quoteOf, rangeOf, textIndex } from "@/lib/paperflow/intel/brief-anchors";
import type { IntelBrief } from "@/lib/paperflow/intel/types";
import { LiquidCursor } from "../reader/liquid-cursor";
import { PresentPointer, readPointerMode, writePointerMode, type PointerMode } from "../reader/present-pointer";
import { Markdown, type EntityRenderer, type TermMarker } from "./markdown";
import "./brief-document.css";

type Tool = "select" | "highlight" | "pen" | "text" | "eraser";
const COLORS: AnnotationColor[] = ["yellow", "green", "blue", "pink", "purple"];
const SWATCH: Record<AnnotationColor, string> = { yellow: "#d3a000", green: "#219960", blue: "#257acb", pink: "#ce4b7a", purple: "#8c58cc" };
const POINTERS: { value: PointerMode; label: string; icon: typeof Zap }[] = [
  { value: "default", label: "기본", icon: MousePointer2 }, { value: "liquid", label: "물방울", icon: Droplet }, { value: "laser", label: "레이저", icon: Zap },
  { value: "chalk", label: "분필", icon: Brush }, { value: "spotlight", label: "스포트라이트", icon: Flashlight }
];
const supportsHighlights = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof (globalThis as { Highlight?: unknown }).Highlight === "function";

/**
 * A briefing as a document to work on, like a paper in the reader: highlighter (drag, or draw with an
 * Apple Pencil), a memo on any mark, a pen for ink, text memos placed anywhere, an eraser, undo, the
 * presentation pointers (liquid drop, laser, chalk, spotlight) and a full-screen focus view. Marks are
 * stored as annotations of the briefing (synced with the account like any paper's) and found again by
 * their text, so they survive a re-render or an updated briefing.
 */
export function BriefDocument({ brief, entity, terms, cast }: { brief: IntelBrief; entity: EntityRenderer; terms: Omit<TermMarker, "seen">;
  /** Who and what the briefing is about, shown as a strip of logos and covers above it. */
  cast?: React.ReactNode }) {
  const documentId = `brief:${brief.id}`;
  const [marks, setMarks] = useState<Annotation[]>([]), [tool, setTool] = useState<Tool>("select"), [color, setColor] = useState<AnnotationColor>("yellow");
  const [pointer, setPointer] = useState<PointerMode>("default"), [focus, setFocus] = useState(false);
  const [open, setOpen] = useState<{ id: string; x: number; y: number } | null>(null), [drawing, setDrawing] = useState<{ x: number; y: number }[] | null>(null);
  const [width, setWidth] = useState(800), [unplaced, setUnplaced] = useState(0);
  const sheet = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => setMarks(await annotationRepository.listByDocument(documentId)), [documentId]);
  useEffect(() => { void reload(); setOpen(null); }, [reload]);
  useEffect(() => { setPointer(readPointerMode()); }, []);
  useEffect(() => { const element = sheet.current; if (!element) return; const observer = new ResizeObserver(() => setWidth(element.clientWidth || 800)); observer.observe(element); return () => observer.disconnect(); }, [focus]);
  useEffect(() => { if (!focus) return; const key = (event: KeyboardEvent) => { if (event.key === "Escape") setFocus(false); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [focus]);

  // Highlights are painted by the browser (CSS Custom Highlights): the briefing's own markup is never touched.
  useLayoutEffect(() => {
    const root = body.current;
    if (!root || !supportsHighlights()) return;
    const index = textIndex(root), registry = (CSS as unknown as { highlights: Map<string, unknown> }).highlights;
    const groups = new Map<string, Range[]>();
    let missing = 0;
    for (const mark of marks.filter(item => item.type === "highlight")) {
      const at = locate(index.text, mark.anchor.textQuote, mark.anchor.prefix, mark.anchor.suffix), range = at && rangeOf(index, at[0], at[1]);
      if (!range) { missing++; continue; }
      const key = `pf-brief-${mark.color}${mark.note ? "-noted" : ""}`;
      groups.set(key, [...(groups.get(key) ?? []), range]);
    }
    const Highlight = (globalThis as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight;
    const keys = COLORS.flatMap(item => [`pf-brief-${item}`, `pf-brief-${item}-noted`]);
    for (const key of keys) { const ranges = groups.get(key); if (ranges) registry.set(key, new Highlight(...ranges)); else registry.delete(key); }
    setUnplaced(missing);
    return () => { for (const key of keys) registry.delete(key); };
  }, [marks, brief.body, width, focus]);

  const save = useCallback(async (annotation: Annotation, label: string) => { await createAnnotation(annotation, label); await reload(); }, [reload]);
  const base = useCallback((type: Annotation["type"], extra: Partial<Annotation>): Annotation => {
    const now = new Date().toISOString();
    return { id: crypto.randomUUID(), type, documentId, pageIndex: 0, color, anchor: { version: 1, documentId, pageIndex: 0, textQuote: "", rects: [], normalizedRects: [], createdAt: now }, createdAt: now, updatedAt: now, resolutionStatus: "resolved", ...extra };
  }, [documentId, color]);

  /** The text between two offsets becomes a highlight in the current colour. */
  const markRange = useCallback(async (start: number, end: number) => {
    const root = body.current;
    if (!root || end - start < 1) return;
    const index = textIndex(root), quote = quoteOf(index, Math.min(start, end), Math.max(start, end));
    if (!quote.textQuote.trim()) return;
    await save(base("highlight", { anchor: { version: 1, documentId, pageIndex: 0, ...quote, rects: [], normalizedRects: [], createdAt: new Date().toISOString() } }), "형광펜");
    window.getSelection()?.removeAllRanges();
  }, [base, documentId, save]);
  const markSelection = useCallback(async () => {
    const root = body.current, selection = window.getSelection();
    if (!root || !selection?.rangeCount || selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return false;
    const index = textIndex(root), start = offsetOf(index, range.startContainer, range.startOffset), end = offsetOf(index, range.endContainer, range.endOffset);
    if (start === null || end === null) return false;
    await markRange(start, end);
    return true;
  }, [markRange]);

  const highlightAt = useCallback((x: number, y: number) => {
    const root = body.current;
    if (!root) return null;
    const index = textIndex(root), at = offsetAtPoint(index, x, y);
    if (at === null) return null;
    return marks.find(mark => { if (mark.type !== "highlight") return false; const span = locate(index.text, mark.anchor.textQuote, mark.anchor.prefix, mark.anchor.suffix); return Boolean(span && at >= span[0] && at < span[1]); }) ?? null;
  }, [marks]);

  // Pointer work on the sheet: pencil strokes, ink, text memos, the eraser, opening a mark.
  const stroke = useRef<{ id: number; points: { x: number; y: number }[]; pen: boolean } | null>(null);
  const local = (event: { clientX: number; clientY: number }) => { const box = sheet.current!.getBoundingClientRect(); return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.width }; };
  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as Element).closest("button, a, textarea, input, select, [data-brief-ui]")) return;
    if (tool === "pen" || (tool === "highlight" && event.pointerType === "pen")) {
      event.preventDefault(); (event.target as Element).setPointerCapture?.(event.pointerId);
      stroke.current = { id: event.pointerId, points: [local(event)], pen: tool === "highlight" };
      if (tool === "pen") setDrawing([local(event)]);
    } else if (tool === "text") {
      event.preventDefault();
      const at = local(event);
      void save(base("text", { box: { x: Math.min(.8, at.x), y: at.y, width: .32, text: "", color: "#1f2937", size: .018, bold: false, font: "sans" } }), "텍스트 메모");
      setTool("select");
    } else if (tool === "eraser") {
      const hit = highlightAt(event.clientX, event.clientY);
      if (hit) void removeAnnotation(hit, "형광펜 지우기").then(reload);
    }
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const current = stroke.current;
    if (!current || current.id !== event.pointerId) return;
    current.points.push(local(event));
    if (tool === "pen") setDrawing([...current.points]);
  };
  const onPointerUp = async (event: React.PointerEvent) => {
    const current = stroke.current;
    if (current && current.id === event.pointerId) {
      stroke.current = null;
      if (current.pen) {
        // An Apple Pencil drawn across text in the highlighter: from where it started to where it lifted.
        const root = body.current, box = sheet.current!.getBoundingClientRect();
        if (root) { const index = textIndex(root), first = current.points[0], last = current.points[current.points.length - 1]; const start = offsetAtPoint(index, box.left + first.x * box.width, box.top + first.y * box.width), end = offsetAtPoint(index, box.left + last.x * box.width, box.top + last.y * box.width); if (start !== null && end !== null) await markRange(start, end); }
      } else if (current.points.length > 1) { setDrawing(null); await save(base("ink", { points: current.points }), "메모 펜"); }
      else setDrawing(null);
      return;
    }
    if (tool === "highlight") { await markSelection(); return; }
    if (tool === "select" && !window.getSelection()?.toString()) {
      const hit = highlightAt(event.clientX, event.clientY), box = sheet.current!.getBoundingClientRect();
      setOpen(hit ? { id: hit.id, x: event.clientX - box.left, y: event.clientY - box.top } : null);
    }
  };
  // iPadOS scrolls on a pencil touch unless the touch is cancelled (only while drawing tools are on).
  useEffect(() => {
    const element = sheet.current;
    if (!element || (tool !== "pen" && tool !== "highlight")) return;
    const touch = (event: TouchEvent) => { if (tool === "pen" || Array.from(event.changedTouches).some(point => (point as Touch & { touchType?: string }).touchType === "stylus")) { if (!(event.target as Element).closest("[data-brief-ui], textarea, button")) event.preventDefault(); } };
    element.addEventListener("touchstart", touch, { passive: false }); element.addEventListener("touchmove", touch, { passive: false });
    return () => { element.removeEventListener("touchstart", touch); element.removeEventListener("touchmove", touch); };
  }, [tool, focus]);

  const ink = marks.filter(mark => mark.type === "ink" && mark.points?.length), boxes = marks.filter(mark => mark.type === "text" && mark.box);
  const openMark = open ? marks.find(mark => mark.id === open.id) : null;
  const path = (points: { x: number; y: number }[]) => points.map((point, at) => `${at ? "L" : "M"}${(point.x * width).toFixed(1)} ${(point.y * width).toFixed(1)}`).join(" ");
  const history = async (step: "undo" | "redo") => { await (step === "undo" ? undo() : redo()); await reload(); };
  const choosePointer = (mode: PointerMode) => { setPointer(mode); writePointerMode(mode); };
  const counts = useMemo(() => ({ highlight: marks.filter(mark => mark.type === "highlight").length, notes: marks.filter(mark => mark.note || mark.type === "text").length }), [marks]);

  const toolbar = <div className="pf-brief-tools" data-brief-ui role="toolbar" aria-label="브리핑 도구">
    {([["select", "선택", MousePointer2], ["highlight", "형광펜", Highlighter], ["pen", "메모 펜", PenLine], ["text", "텍스트 메모", Type], ["eraser", "지우개", Eraser]] as const).map(([value, label, Icon]) =>
      <button key={value} type="button" aria-pressed={tool === value} title={label} onClick={() => setTool(value)}><Icon size={15}/><span>{label}</span></button>)}
    <span className="pf-brief-colors" role="radiogroup" aria-label="색">{COLORS.map(item => <button key={item} type="button" role="radio" aria-checked={color === item} aria-label={item} style={{ "--swatch": SWATCH[item] } as React.CSSProperties} onClick={() => setColor(item)}/>)}</span>
    <span className="pf-brief-sep"/>
    <button type="button" title="되돌리기" aria-label="되돌리기" onClick={() => void history("undo")}><Undo2 size={15}/></button>
    <button type="button" title="다시 하기" aria-label="다시 하기" onClick={() => void history("redo")}><Redo2 size={15}/></button>
    <span className="pf-brief-sep"/>
    <span className="pf-brief-pointers" role="radiogroup" aria-label="포인터">{POINTERS.map(({ value, label, icon: Icon }) => <button key={value} type="button" role="radio" aria-checked={pointer === value} title={label} aria-label={label} onClick={() => choosePointer(value)}><Icon size={15}/></button>)}</span>
    <span className="pf-brief-count">{counts.highlight ? `마킹 ${counts.highlight}` : ""}{counts.notes ? ` · 메모 ${counts.notes}` : ""}{unplaced ? ` · 위치 못 찾음 ${unplaced}` : ""}</span>
    <button type="button" className="pf-brief-focus" title={focus ? "확장 닫기 (Esc)" : "확장해서 읽기"} aria-label={focus ? "확장 닫기" : "확장해서 읽기"} onClick={() => setFocus(!focus)}>{focus ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</button>
  </div>;

  const document_ = <div className={`pf-brief-doc${focus ? " pf-brief-focus-on" : ""}`} data-tool={tool}>
    {toolbar}
    <div ref={sheet} className="pf-brief-sheet" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={event => void onPointerUp(event)}>
      {brief.date && brief.period && brief.period !== "core" && <p className="pf-intel-brief-date" data-brief-skip>{brief.date}</p>}
      {cast && <div data-brief-skip>{cast}</div>}
      <div ref={body} className="pf-brief-body"><Markdown source={brief.body} entity={entity} terms={terms}/></div>
      <svg className="pf-brief-ink" width={width} height="100%" aria-hidden="true" data-brief-skip>
        {ink.map(mark => <path key={mark.id} d={path(mark.points!)} stroke={SWATCH[mark.color]} data-erasable={tool === "eraser" || undefined} onPointerDown={event => { if (tool !== "eraser") return; event.stopPropagation(); void removeAnnotation(mark, "메모 펜 지우기").then(reload); }}/>)}
        {drawing && <path d={path(drawing)} stroke={SWATCH[color]}/>}
      </svg>
      {boxes.map(mark => <div key={mark.id} className="pf-brief-text" data-brief-ui data-brief-skip style={{ left: `${mark.box!.x * 100}%`, top: mark.box!.y * width, width: `${mark.box!.width * 100}%` }}>
        <textarea defaultValue={mark.box!.text} placeholder="메모" autoFocus={!mark.box!.text} aria-label="텍스트 메모"
          onBlur={event => { const text = event.target.value; if (text !== mark.box!.text) void updateAnnotation(mark, { ...mark, box: { ...mark.box!, text }, updatedAt: new Date().toISOString() }, "텍스트 메모").then(reload); }}/>
        <button type="button" aria-label="메모 지우기" onClick={() => void removeAnnotation(mark, "텍스트 메모 지우기").then(reload)}><X size={13}/></button>
      </div>)}
      {openMark && open && <div className="pf-brief-markpop" data-brief-ui data-brief-skip style={{ left: Math.min(open.x, width - 290), top: open.y + 14 }}>
        <q>{openMark.anchor.textQuote.slice(0, 120)}</q>
        <span className="pf-brief-colors">{COLORS.map(item => <button key={item} type="button" aria-label={item} aria-pressed={openMark.color === item} style={{ "--swatch": SWATCH[item] } as React.CSSProperties} onClick={() => void updateAnnotation(openMark, { ...openMark, color: item, updatedAt: new Date().toISOString() }, "색 바꾸기").then(reload)}/>)}</span>
        <textarea key={openMark.id} defaultValue={openMark.note ?? ""} placeholder="이 부분에 대한 메모" aria-label="마킹 메모"
          onBlur={event => { const note = event.target.value.trim(); if (note !== (openMark.note ?? "")) void updateAnnotation(openMark, { ...openMark, note: note || undefined, updatedAt: new Date().toISOString() }, "메모").then(reload); }}/>
        <div><button type="button" onClick={() => void removeAnnotation(openMark, "형광펜 지우기").then(() => { setOpen(null); return reload(); })}><Trash2 size={13}/>지우기</button><button type="button" onClick={() => setOpen(null)}>닫기</button></div>
      </div>}
      {marks.some(mark => mark.note && mark.type === "highlight") && <aside className="pf-brief-notes" data-brief-skip aria-label="마킹 메모">
        <h4>마킹 메모</h4>
        {marks.filter(mark => mark.note && mark.type === "highlight").map(mark => <button key={mark.id} type="button" style={{ "--swatch": SWATCH[mark.color] } as React.CSSProperties} onClick={() => setOpen({ id: mark.id, x: 20, y: 0 })}><q>{mark.anchor.textQuote.slice(0, 60)}</q><span>{mark.note}</span></button>)}
      </aside>}
    </div>
    {pointer === "liquid" && <LiquidCursor root={sheet} pageSelector=".pf-brief-sheet"/>}
    {(pointer === "laser" || pointer === "chalk" || pointer === "spotlight") && <PresentPointer root={sheet} mode={pointer}/>}
  </div>;

  // Focus: the briefing fills the screen (rendered into <body>, above the page and its animated wrappers).
  return focus && typeof document !== "undefined" ? createPortal(<div className="pf-intel pf-brief-focus-layer" role="dialog" aria-label={brief.title}>{document_}</div>, document.body) : document_;
}
