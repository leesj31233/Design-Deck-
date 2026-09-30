"use client";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import type { PdfDocumentHandle, PdfPageHandle } from "@/lib/paperflow/pdf/pdf-adapter";
import { PdfPage } from "./pdf-page";
export function ContinuousPage({ pdf, index, scale, ...props }: Omit<ComponentProps<typeof PdfPage>, "page" | "pageIndex"> & { pdf: PdfDocumentHandle; index: number }) {
  const node = useRef<HTMLDivElement>(null), [near, setNear] = useState(false), [page, setPage] = useState<PdfPageHandle>(), [error, setError] = useState("");
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root: node.current?.closest("[data-pdf-viewport]"), rootMargin: "1000px 0px" });
    observer.observe(node.current!); return () => observer.disconnect();
  }, []);
  useEffect(() => { let alive = true; if (near) void pdf.getPage(index + 1).then(result => { if (alive) setPage(result); }).catch(() => { if (alive) setError("페이지를 불러오지 못했다."); }); return () => { alive = false; }; }, [near, pdf, index]);
  return <div ref={node} data-continuous-page={index + 1} className="pf-continuous-page" style={{ minHeight: (page?.height ?? 792) * scale, minWidth: (page?.width ?? 612) * scale }}>
    {near && page ? <PdfPage {...props} page={page} pageIndex={index} scale={scale}/> : <div className="pf-page-placeholder" role="status">{error || `${index + 1} 페이지`}</div>}
  </div>;
}
