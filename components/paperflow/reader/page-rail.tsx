"use client";
import { useEffect, useRef } from "react";
import { FileText } from "lucide-react";
export function PageRail({ count, current, onPage }: { count: number; current: number; onPage: (number: number) => void }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => { root.current?.querySelector("[aria-current=page]")?.scrollIntoView({ block: "nearest" }); }, [current]);
  return <aside className="pf-page-rail dd-scrollbar" ref={root} aria-label="PDF 페이지"><div className="pf-kicker">PAGES</div>{Array.from({ length: count }, (_, i) => <button key={i} className="pf-page-tile" aria-label={`Go to page ${i + 1}`} aria-current={current === i + 1 ? "page" : undefined} onClick={() => onPage(i + 1)}><span className="pf-page-mini"><FileText size={22}/><span>{String(i + 1).padStart(2, "0")}</span></span><span>{i + 1}</span></button>)}</aside>;
}
