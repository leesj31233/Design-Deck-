"use client";
import { useEffect, useRef, useState } from "react";
import { lowMemoryDevice } from "@/lib/paperflow/device";
import { FileText } from "lucide-react";
import { documentRepository } from "@/lib/paperflow/persistence/document-repository";
import { pdfAdapter } from "@/lib/paperflow/pdf/pdf-adapter";

/** A device with little memory renders one cover at a time, smaller. */
const lowMemory = lowMemoryDevice;

/** Rendered covers are kept on this device (a few KB each), so a PDF is opened for its cover only once. */
const COVER_VERSION = 1;
function coverStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("paperflow-covers", 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("covers")) request.result.createObjectStore("covers"); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function savedCover(id: string): Promise<Blob | null> {
  try { const db = await coverStore(); return await new Promise(resolve => { const get = db.transaction("covers").objectStore("covers").get(id); get.onsuccess = () => resolve(get.result?.v === COVER_VERSION ? get.result.blob : null); get.onerror = () => resolve(null); }); }
  catch { return null; }
}
async function saveCover(id: string, blob: Blob) {
  try { const db = await coverStore(); db.transaction("covers", "readwrite").objectStore("covers").put({ v: COVER_VERSION, blob }, id); } catch { /* rendered again next time */ }
}

const covers = new Map<string, Promise<string>>();
let active = 0;
const waiting: (() => void)[] = [];
/** Wait for the browser to be idle, so covers never compete with scrolling or a page change. */
const idle = () => new Promise<void>(resolve => "requestIdleCallback" in window ? window.requestIdleCallback(() => resolve(), { timeout: 1200 }) : setTimeout(resolve, 60));
async function coverFor(id: string) {
  let task = covers.get(id);
  if (!task) {
    task = (async () => {
      const saved = await savedCover(id);
      if (saved) return URL.createObjectURL(saved);
      if (active >= (lowMemory() ? 1 : 2)) await new Promise<void>(resolve => waiting.push(resolve));
      active++;
      try {
        await idle();
        // On a new device the PDF comes from the account's cloud copy and stays cached here.
        const blob = await documentRepository.getDocumentBlob(id);
        if (!blob) throw new Error("Source PDF missing");
        const pdf = await pdfAdapter.open(await blob.arrayBuffer());
        try {
          const page = await pdf.getPage(1), canvas = document.createElement("canvas");
          await page.render(canvas, (lowMemory() ? 220 : 300) / page.width, new AbortController().signal);
          const image = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .82));
          canvas.width = 0; canvas.height = 0;
          if (!image) throw new Error("Cover not rendered");
          void saveCover(id, image);
          return URL.createObjectURL(image);
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
    {src ? <img src={src} alt={`${title} 첫 페이지`} draggable={false} decoding="async" loading="lazy"/> : <span className="pf-cover-placeholder"><FileText size={28}/><span>{failed ? "PDF" : "표지 불러오는 중"}</span></span>}
    <span className="pf-book-spine" aria-hidden="true"/><span className="pf-book-light" aria-hidden="true"/>
  </span>;
}
