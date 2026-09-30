"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { PdfDocumentHandle } from "@/lib/paperflow/pdf/pdf-adapter";

function PagePreview({ pdf, number, current, onPage }: { pdf: PdfDocumentHandle; number: number; current: boolean; onPage: (number: number) => void }) {
  const tile = useRef<HTMLButtonElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false), [ready, setReady] = useState(false);
  useEffect(() => {
    const node = tile.current; if (!node) return;
    const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting) setVisible(true); }, { root: node.closest(".pf-page-rail"), rootMargin: "300px" });
    observer.observe(node); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !canvas.current) return;
    const controller = new AbortController();
    void pdf.getPage(number).then(page => page.render(canvas.current!, Math.min(104 / page.width, 138 / page.height), controller.signal)).then(() => { if (!controller.signal.aborted) setReady(true); }).catch(() => {});
    return () => { controller.abort(); };
  }, [pdf, number, visible]);
  return <motion.button ref={tile} className="pf-page-tile" aria-label={`Go to page ${number}`} aria-current={current ? "page" : undefined} onClick={() => onPage(number)} whileHover={reduced ? undefined : { y: -3, scale: 1.025 }} whileTap={reduced ? undefined : { scale: .96 }} transition={{ type: "spring", stiffness: 450, damping: 31 }}>
    <span className="pf-page-mini">{!ready && <span className="pf-thumb-placeholder" aria-hidden="true"/>}<canvas ref={canvas} aria-hidden="true"/><span className="pf-thumb-sheen" aria-hidden="true"/></span><span className="pf-page-caption">{number}</span>
  </motion.button>;
}

export function PageRail({ pdf, current, onPage }: { pdf: PdfDocumentHandle; current: number; onPage: (number: number) => void }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => { root.current?.querySelector("[aria-current=page]")?.scrollIntoView({ block: "nearest" }); }, [current]);
  return <aside className="pf-page-rail dd-scrollbar" ref={root} aria-label="PDF 페이지 미리보기"><div className="pf-kicker">PAGES <span>{pdf.pageCount}</span></div>{Array.from({ length: pdf.pageCount }, (_, index) => <PagePreview key={index} pdf={pdf} number={index + 1} current={current === index + 1} onPage={onPage}/>)}</aside>;
}
