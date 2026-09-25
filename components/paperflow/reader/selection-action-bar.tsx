"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Copy, Highlighter, Languages, NotebookPen, X, BookOpen, Ellipsis } from "lucide-react";
import { ActionBar } from "@/components/ui/action-bar";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { annotationColors, type AnnotationColor, type TextAnchor } from "@/lib/paperflow/anchors/types";
import { unionRects } from "@/lib/paperflow/anchors/geometry";
export function SelectionActionBar({ anchor, onHighlight, onNote, onCopy, onTranslate, onShell, onDismiss, saving }: { anchor: TextAnchor; onHighlight: (color: AnnotationColor) => void; onNote: () => void; onCopy: () => void; onTranslate: () => void; onShell: (name: string) => void; onDismiss: () => void; saving: boolean }) {
  const root = useRef<HTMLDivElement>(null), reduced = useReducedMotion();
  const [position, setPosition] = useState({ left: 0, top: 0, visible: false }), [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const update = () => {
      const page = document.querySelector<HTMLElement>(`[data-pdf-page="${anchor.pageIndex}"]`), viewport = document.querySelector<HTMLElement>("[data-pdf-viewport]");
      if (!page || !viewport || !root.current) return;
      const p = page.getBoundingClientRect(), v = viewport.getBoundingClientRect(), box = unionRects(anchor.normalizedRects);
      const x = p.x + box.x * p.width, y = p.y + box.y * p.height, bottom = y + box.height * p.height;
      const width = root.current.offsetWidth, height = root.current.offsetHeight;
      const left = Math.max(v.left + 8, Math.min(x + box.width * p.width / 2 - width / 2, v.right - width - 8));
      const top = y - height - 10 >= v.top ? y - height - 10 : bottom + 10;
      setPosition({ left, top: Math.max(v.top + 8, Math.min(top, v.bottom - height - 8)), visible: bottom > v.top && y < v.bottom });
    };
    update(); window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    const observer = new ResizeObserver(update); if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [anchor]);
  useLayoutEffect(() => {
    if (performance.getEntriesByName("paperflow:selection-start").length) performance.measure("paperflow:actionbar-commit", "paperflow:selection-start");
  }, [anchor]);
  return <motion.div ref={root} data-selection-ui className="pf-selection-bar" style={{ left: position.left, top: position.top, visibility: position.visible ? "visible" : "hidden" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : .12 }} onPointerDown={event => { if (event.pointerType === "mouse") event.preventDefault(); }}>
    <ActionBar label="선택한 원문 작업" className="pf-selection-actions"><Button size="sm" variant="ghost" aria-label="Highlight selection" disabled={saving} onClick={() => onHighlight("yellow")}><Highlighter size={15}/> 마킹</Button>
      <Button size="sm" variant="ghost" onClick={onNote}><NotebookPen size={15}/> 메모</Button><Button size="sm" variant="ghost" onClick={onTranslate}><Languages size={15}/> 문단 번역</Button><IconButton size="sm" label="개념 설명" variant="ghost" onClick={() => onShell("개념 설명")}><BookOpen size={15}/></IconButton><IconButton size="sm" label="Copy selected text" variant="ghost" onClick={onCopy}><Copy size={15}/></IconButton><IconButton size="sm" label="추가 작업" aria-expanded={more} variant="ghost" onClick={() => setMore(v => !v)}><Ellipsis size={15}/></IconButton><IconButton size="sm" label="Dismiss selection" variant="ghost" onClick={onDismiss}><X size={15}/></IconButton>
      <div className="pf-color-row" aria-label="마킹 색상">{annotationColors.map(color => <button disabled={saving} key={color} data-color={color} className="pf-color-choice" aria-label={`${color[0].toUpperCase() + color.slice(1)} highlight`} onClick={() => onHighlight(color)}><span/></button>)}</div>
      {more && <div className="pf-more-actions">{["Search papers", "Formula", "Compare", "Copy citation"].map(name => <Button key={name} size="sm" variant="ghost" onClick={() => onShell(name)}>{name}</Button>)}</div>}
    </ActionBar>
  </motion.div>;
}
