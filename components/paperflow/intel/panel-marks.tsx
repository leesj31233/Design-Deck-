"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Eraser, Highlighter, MousePointer2, Trash2 } from "lucide-react";
import type { Annotation, AnnotationColor } from "@/lib/paperflow/anchors/types";
import { annotationRepository } from "@/lib/paperflow/persistence/annotation-repository";
import { createAnnotation, removeAnnotation, updateAnnotation } from "@/lib/paperflow/state/history";
import { locate, offsetAtPoint, offsetOf, quoteOf, rangeOf, textIndex } from "@/lib/paperflow/intel/brief-anchors";

const COLORS: AnnotationColor[] = ["yellow", "green", "blue", "pink", "purple"];
const SWATCH: Record<AnnotationColor, string> = { yellow: "#d3a000", green: "#219960", blue: "#257acb", pink: "#ce4b7a", purple: "#8c58cc" };
const supported = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof (globalThis as { Highlight?: unknown }).Highlight === "function";

/**
 * Highlighter and memos on the side panel's text (a company profile, a case file, a source summary):
 * select text with the highlighter on, click a mark to write a memo, change its colour or erase it.
 * Marks belong to the item (`intel:<id>`), are found again by their text, and sync with the account.
 */
export function PanelMarks({ itemId, children }: { itemId: string; children: ReactNode }) {
  const documentId = `intel:${itemId}`, root = useRef<HTMLDivElement>(null);
  const [marks, setMarks] = useState<Annotation[]>([]), [tool, setTool] = useState<"select" | "highlight" | "eraser">("select"), [color, setColor] = useState<AnnotationColor>("yellow");
  const [open, setOpen] = useState<{ id: string; top: number } | null>(null);
  const reload = useCallback(async () => setMarks(await annotationRepository.listByDocument(documentId)), [documentId]);
  useEffect(() => { void reload(); setOpen(null); }, [reload]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element || !supported()) return;
    const index = textIndex(element), registry = (CSS as unknown as { highlights: Map<string, unknown> }).highlights, groups = new Map<string, Range[]>();
    for (const mark of marks) {
      const at = locate(index.text, mark.anchor.textQuote, mark.anchor.prefix, mark.anchor.suffix), range = at && rangeOf(index, at[0], at[1]);
      if (range) { const key = `pf-panel-${mark.color}${mark.note ? "-noted" : ""}`; groups.set(key, [...(groups.get(key) ?? []), range]); }
    }
    const Highlight = (globalThis as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight;
    const keys = COLORS.flatMap(item => [`pf-panel-${item}`, `pf-panel-${item}-noted`]);
    for (const key of keys) { const ranges = groups.get(key); if (ranges) registry.set(key, new Highlight(...ranges)); else registry.delete(key); }
    return () => { for (const key of keys) registry.delete(key); };
  });

  const markAt = (x: number, y: number) => {
    const element = root.current;
    if (!element) return null;
    const index = textIndex(element), at = offsetAtPoint(index, x, y);
    if (at === null) return null;
    return marks.find(mark => { const span = locate(index.text, mark.anchor.textQuote, mark.anchor.prefix, mark.anchor.suffix); return Boolean(span && at >= span[0] && at < span[1]); }) ?? null;
  };
  const onPointerUp = async (event: React.PointerEvent) => {
    const element = root.current;
    if (!element || (event.target as Element).closest("button, a, input, textarea, select, [data-marks-ui]")) return;
    if (tool === "highlight") {
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      if (!element.contains(range.commonAncestorContainer)) return;
      const index = textIndex(element), start = offsetOf(index, range.startContainer, range.startOffset), end = offsetOf(index, range.endContainer, range.endOffset);
      if (start === null || end === null || start === end) return;
      const quote = quoteOf(index, Math.min(start, end), Math.max(start, end)), now = new Date().toISOString();
      if (!quote.textQuote.trim()) return;
      await createAnnotation({ id: crypto.randomUUID(), type: "highlight", documentId, pageIndex: 0, color, anchor: { version: 1, documentId, pageIndex: 0, ...quote, rects: [], normalizedRects: [], createdAt: now }, createdAt: now, updatedAt: now, resolutionStatus: "resolved" }, "형광펜");
      selection.removeAllRanges(); await reload();
      return;
    }
    const hit = markAt(event.clientX, event.clientY);
    if (tool === "eraser") { if (hit) { await removeAnnotation(hit, "형광펜 지우기"); await reload(); } return; }
    if (!window.getSelection()?.toString()) setOpen(hit ? { id: hit.id, top: event.clientY - element.getBoundingClientRect().top + 14 } : null);
  };
  const current = open ? marks.find(mark => mark.id === open.id) : null;

  return <div className="pf-panel-marks" data-tool={tool}>
    <div className="pf-panel-tools" data-marks-ui role="toolbar" aria-label="오른쪽 패널 마킹">
      <button type="button" aria-pressed={tool === "select"} title="선택" onClick={() => setTool("select")}><MousePointer2 size={14}/></button>
      <button type="button" aria-pressed={tool === "highlight"} title="형광펜 (드래그해서 표시)" onClick={() => setTool("highlight")}><Highlighter size={14}/><span>형광펜</span></button>
      <span className="pf-brief-colors">{COLORS.map(item => <button key={item} type="button" role="radio" aria-checked={color === item} aria-label={item} style={{ "--swatch": SWATCH[item] } as React.CSSProperties} onClick={() => { setColor(item); setTool("highlight"); }}/>)}</span>
      <button type="button" aria-pressed={tool === "eraser"} title="지우개" onClick={() => setTool("eraser")}><Eraser size={14}/></button>
      {marks.length > 0 && <small>마킹 {marks.length}{marks.some(mark => mark.note) ? ` · 메모 ${marks.filter(mark => mark.note).length}` : ""}</small>}
    </div>
    <div ref={root} className="pf-panel-marks-body" onPointerUp={event => void onPointerUp(event)}>{children}</div>
    {current && open && <div className="pf-brief-markpop pf-panel-markpop" data-marks-ui style={{ top: open.top + 44 }}>
      <q>{current.anchor.textQuote.slice(0, 120)}</q>
      <span className="pf-brief-colors">{COLORS.map(item => <button key={item} type="button" aria-label={item} aria-pressed={current.color === item} style={{ "--swatch": SWATCH[item] } as React.CSSProperties} onClick={() => void updateAnnotation(current, { ...current, color: item, updatedAt: new Date().toISOString() }, "색 바꾸기").then(reload)}/>)}</span>
      <textarea key={current.id} defaultValue={current.note ?? ""} placeholder="이 부분에 대한 메모" aria-label="마킹 메모" onBlur={event => { const note = event.target.value.trim(); if (note !== (current.note ?? "")) void updateAnnotation(current, { ...current, note: note || undefined, updatedAt: new Date().toISOString() }, "메모").then(reload); }}/>
      <div><button type="button" onClick={() => void removeAnnotation(current, "형광펜 지우기").then(() => { setOpen(null); return reload(); })}><Trash2 size={13}/>지우기</button><button type="button" onClick={() => setOpen(null)}>닫기</button></div>
    </div>}
  </div>;
}
