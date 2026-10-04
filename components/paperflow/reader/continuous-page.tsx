"use client";
import { memo, useEffect, useRef, useState } from "react";
import type { PdfDocumentHandle, PdfPageHandle } from "@/lib/paperflow/pdf/pdf-adapter";
import { PdfPage, type PdfPageProps } from "./pdf-page";

/**
 * Mounts a page when it comes within ~1.5 screens and releases its canvas,
 * text layer and overlay once it is far away, so a 60-page paper keeps a
 * bounded number of live pages however far the reader scrolls.
 */
export const ContinuousPage = memo(function ContinuousPage({ pdf, index, scale, size, ...props }: Omit<PdfPageProps, "page" | "pageIndex"> & { pdf: PdfDocumentHandle; index: number; size: { width: number; height: number } }) {
  const node = useRef<HTMLDivElement>(null), [near, setNear] = useState(false), [page, setPage] = useState<PdfPageHandle>(), [error, setError] = useState("");
  useEffect(() => {
    const root = node.current?.closest("[data-pdf-viewport]") ?? null;
    const enter = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setNear(true); }, { root, rootMargin: "1500px 0px" });
    const leave = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) setNear(false); }, { root, rootMargin: "4500px 0px" });
    enter.observe(node.current!); leave.observe(node.current!);
    return () => { enter.disconnect(); leave.disconnect(); };
  }, []);
  useEffect(() => {
    if (!near) { setPage(undefined); return; }
    let alive = true;
    void pdf.getPage(index + 1).then(result => { if (alive) setPage(result); }).catch(() => { if (alive) setError("페이지를 불러오지 못했습니다."); });
    return () => { alive = false; };
  }, [near, pdf, index]);
  return <div ref={node} data-continuous-page={index + 1} className="pf-continuous-page" style={{ width: size.width * scale, height: size.height * scale }}>
    {page ? <PdfPage {...props} page={page} pageIndex={index} scale={scale}/> : <div className="pf-page-placeholder" role="status">{error || `${index + 1} 페이지`}</div>}
  </div>;
});
