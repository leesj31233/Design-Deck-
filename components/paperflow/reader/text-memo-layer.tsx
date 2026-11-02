"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bold, GripVertical, Minus, Plus, Trash2 } from "lucide-react";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { createAnnotation, removeAnnotation, updateAnnotation } from "@/lib/paperflow/state/history";
import type { Annotation, TextBox } from "@/lib/paperflow/anchors/types";
import { usePaperflow } from "../shell/paperflow-context";

export const MEMO_COLORS = ["#1f2421", "#d9480f", "#e03131", "#1971c2", "#1f7a5a", "#9c36b5"];
const FONTS: { value: TextBox["font"]; label: string }[] = [{ value: "sans", label: "기본" }, { value: "serif", label: "명조" }, { value: "hand", label: "손글씨" }];
// The next memo starts with the style of the last one.
let lastStyle: Pick<TextBox, "color" | "size" | "bold" | "font"> = { color: "#d9480f", size: .017, bold: false, font: "sans" };

type Draft = { id: string; existing?: Annotation; box: TextBox };

/**
 * Edge-style text memos: with the text tool, click anywhere on the page to type; color, bold, size
 * and font are set on the floating bar. Positions and sizes are fractions of the page, so memos
 * follow zoom. Every create / edit / delete is undoable.
 */
export function TextMemoLayer({ documentId, pageIndex, annotations, pageWidth }: { documentId: string; pageIndex: number; annotations: Annotation[]; pageWidth: number }) {
  const tool = useReaderStore(s => s.tool), client = useQueryClient(), { notify } = usePaperflow();
  const [draft, setDraft] = useState<Draft | null>(null);
  const root = useRef<HTMLDivElement>(null), editor = useRef<HTMLTextAreaElement>(null), drag = useRef<{ dx: number; dy: number } | null>(null);
  const memos = annotations.filter(item => item.type === "text" && item.pageIndex === pageIndex && item.box && item.id !== draft?.id);
  const refresh = () => client.invalidateQueries({ queryKey: ["annotations"] });

  const commit = async () => {
    const current = draft; if (!current) return;
    setDraft(null);
    const text = current.box.text.replace(/\s+$/, "");
    lastStyle = { color: current.box.color, size: current.box.size, bold: current.box.bold, font: current.box.font };
    try {
      if (!text.trim()) { if (current.existing) await removeAnnotation(current.existing, "텍스트 메모 삭제"); }
      else if (!current.existing) {
        const now = new Date().toISOString(), box = { ...current.box, text }, rect = { x: box.x, y: box.y, width: box.width, height: .02 };
        await createAnnotation({ id: current.id, type: "text", documentId, pageIndex, color: "yellow", box, note: text, anchor: { version: 1, documentId, pageIndex, textQuote: text.slice(0, 80), rects: [rect], normalizedRects: [rect], createdAt: now }, createdAt: now, updatedAt: now, resolutionStatus: "resolved" }, "텍스트 메모");
      } else if (JSON.stringify(current.existing.box) !== JSON.stringify({ ...current.box, text })) {
        await updateAnnotation(current.existing, { ...current.existing, box: { ...current.box, text }, note: text, updatedAt: new Date().toISOString() }, "텍스트 메모 수정");
      }
      await refresh();
    } catch { notify("텍스트 메모를 저장하지 못했습니다."); }
  };
  const discard = async () => { const current = draft; setDraft(null); if (current?.existing) await remove(current.existing); };
  const remove = async (memo: Annotation) => { try { await removeAnnotation(memo, "텍스트 메모 삭제"); await refresh(); } catch { notify("텍스트 메모를 지우지 못했습니다."); } };

  // A click outside the memo (and its bar) finishes editing.
  useEffect(() => {
    if (!draft) return;
    const outside = (event: PointerEvent) => { if (!(event.target as Element | null)?.closest(`[data-memo="${draft.id}"]`)) void commit(); };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  useLayoutEffect(() => { const node = editor.current; if (!node) return; node.style.height = "0px"; node.style.height = `${node.scrollHeight}px`; }, [draft?.box.text, draft?.box.size, draft?.box.font, pageWidth]);
  useEffect(() => { if (draft) editor.current?.focus({ preventScroll: true }); }, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const at = (event: { clientX: number; clientY: number }) => { const bounds = root.current!.getBoundingClientRect(); return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height }; };
  const place = (event: React.PointerEvent) => {
    if (tool !== "text" || event.target !== event.currentTarget) return;
    event.preventDefault();
    const point = at(event);
    setDraft({ id: crypto.randomUUID(), box: { x: Math.min(point.x, .82), y: Math.min(point.y, .97), width: .3, text: "", ...lastStyle } });
  };
  const patch = (change: Partial<TextBox>) => setDraft(current => current ? { ...current, box: { ...current.box, ...change } } : current);
  const style = (box: TextBox): React.CSSProperties => ({ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, color: box.color, fontSize: box.size * pageWidth, fontWeight: box.bold ? 700 : 400 });

  return <div ref={root} className="pf-memo-layer" data-active={tool === "text" || undefined} onPointerDown={place}>
    {memos.map(memo => <div key={memo.id} className="pf-memo" data-font={memo.box!.font} style={style(memo.box!)}
      onPointerDown={event => { event.stopPropagation(); if (tool === "eraser") { void remove(memo); return; } if (tool === "select" || tool === "text") { event.preventDefault(); setDraft({ id: memo.id, existing: memo, box: { ...memo.box! } }); } }}>{memo.box!.text}</div>)}
    {draft && <div className="pf-memo pf-memo-editing" data-memo={draft.id} data-font={draft.box.font} style={style(draft.box)}>
      <div className="pf-memo-bar" role="toolbar" aria-label="텍스트 메모 서식">
        <button type="button" className="pf-memo-grip" aria-label="메모 옮기기"
          onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const point = at(event); drag.current = { dx: point.x - draft.box.x, dy: point.y - draft.box.y }; }}
          onPointerMove={event => { if (!drag.current) return; const point = at(event); patch({ x: Math.max(0, Math.min(.95, point.x - drag.current.dx)), y: Math.max(0, Math.min(.98, point.y - drag.current.dy)) }); }}
          onPointerUp={() => { drag.current = null; editor.current?.focus({ preventScroll: true }); }}><GripVertical size={13}/></button>
        {MEMO_COLORS.map(color => <button key={color} type="button" className="pf-memo-swatch" aria-label={`색 ${color}`} aria-pressed={draft.box.color === color} style={{ background: color }} onClick={() => patch({ color })}/>)}
        <span className="pf-memo-sep"/>
        <button type="button" aria-label="굵게" aria-pressed={draft.box.bold} onClick={() => patch({ bold: !draft.box.bold })}><Bold size={13}/></button>
        <button type="button" aria-label="글자 작게" onClick={() => patch({ size: Math.max(.01, +(draft.box.size - .002).toFixed(3)) })}><Minus size={13}/></button>
        <button type="button" aria-label="글자 크게" onClick={() => patch({ size: Math.min(.05, +(draft.box.size + .002).toFixed(3)) })}><Plus size={13}/></button>
        <select aria-label="글꼴" value={draft.box.font} onChange={event => patch({ font: event.target.value as TextBox["font"] })}>{FONTS.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}</select>
        <span className="pf-memo-sep"/>
        <button type="button" aria-label="메모 삭제" onClick={() => void discard()}><Trash2 size={13}/></button>
      </div>
      <textarea ref={editor} aria-label="텍스트 메모" value={draft.box.text} placeholder="메모 입력" rows={1}
        onChange={event => patch({ text: event.target.value })}
        onKeyDown={event => { if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) { event.preventDefault(); void commit(); } }}/>
      <span className="pf-memo-resize" aria-hidden="true"
        onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const point = at(event); patch({ width: Math.max(.08, Math.min(.95 - draft.box.x, point.x - draft.box.x)) }); }}/>
    </div>}
  </div>;
}
