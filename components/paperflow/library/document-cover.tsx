"use client";
import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { documentRepository } from "@/lib/paperflow/persistence/document-repository";
import { pdfAdapter } from "@/lib/paperflow/pdf/pdf-adapter";

const covers = new Map<string, Promise<string>>();
let active = 0;
const waiting: (() => void)[] = [];
async function coverFor(id: string) {
  let task = covers.get(id);
  if (!task) {
    task = (async () => {
      if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve));
      active++;
      try {
        // On a new device the PDF comes from the account's cloud copy and stays cached here.
        const blob = await documentRepository.getDocumentBlob(id);
        if (!blob) throw new Error("Source PDF missing");
        const pdf = await pdfAdapter.open(await blob.arrayBuffer());
        try {
          const page = await pdf.getPage(1), canvas = document.createElement("canvas");
          await page.render(canvas, 300 / page.width, new AbortController().signal);
          const image = canvas.toDataURL("image/webp", .88);
          canvas.width = 0; canvas.height = 0;
          return image;
        } finally { await pdf.destroy(); }
      } finally { active--; waiting.shift()?.(); }
    })();
    covers.set(id, task);
    task.catch(() => covers.delete(id));
  }
  return task;
}

export function DocumentCover({ documentId, title }: { documentId: string; title: string }) {
  const root = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string>(), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  // A cover that failed before the account session was ready tries again after the next sync.
  useEffect(() => {
    if (!failed) return;
    const retry = () => { setFailed(false); setAttempt(value => value + 1); };
    window.addEventListener("paperflow:library-synced", retry);
    return () => window.removeEventListener("paperflow:library-synced", retry);
  }, [failed]);
  useEffect(() => {
    let alive = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void coverFor(documentId).then(image => { if (alive) setSrc(image); }).catch(() => { if (alive) setFailed(true); });
    }, { rootMargin: "250px" });
    if (root.current) observer.observe(root.current);
    return () => { alive = false; observer.disconnect(); };
  }, [documentId, attempt]);
  return <span ref={root} className="pf-book-cover" data-cover-ready={Boolean(src)}>
    {src ? <img src={src} alt={`${title} 첫 페이지`} draggable={false}/> : <span className="pf-cover-placeholder"><FileText size={28}/><span>{failed ? "PDF" : "표지 불러오는 중"}</span></span>}
    <span className="pf-book-spine" aria-hidden="true"/><span className="pf-book-light" aria-hidden="true"/>
  </span>;
}
