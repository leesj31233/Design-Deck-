"use client";
import { useEffect, useRef, useState } from "react";
import { lowMemoryDevice } from "@/lib/paperflow/device";
import { FileText } from "lucide-react";
import { documentRepository } from "@/lib/paperflow/persistence/document-repository";
import { pdfAdapter } from "@/lib/paperflow/pdf/pdf-adapter";

/** A device with little memory renders one cover at a time, smaller. */
const lowMemory = lowMemoryDevice;

/** Covers made before they were stored with the paper (a separate cache on this device), read once to move them over. */
async function legacyCover(id: string): Promise<Blob | null> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("paperflow-covers", 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("covers")) request.result.createObjectStore("covers"); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return await new Promise(resolve => { const get = db.transaction("covers").objectStore("covers").get(id); get.onsuccess = () => resolve(get.result?.blob ?? null); get.onerror = () => resolve(null); });
  } catch { return null; }
}
const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });

const covers = new Map<string, Promise<string>>();
let active = 0;
const waiting: (() => void)[] = [];
/** Wait for the browser to be idle, so covers never compete with scrolling or a page change. */
const idle = () => new Promise<void>(resolve => "requestIdleCallback" in window ? window.requestIdleCallback(() => resolve(), { timeout: 1200 }) : setTimeout(resolve, 60));
/**
 * A paper's cover, like a notebook cover in GoodNotes: drawn from page 1 once, then stored with the
 * paper itself (~10 KB) and synced with the account, so every device shows it at once without opening
 * the PDF. The id is the PDF's content hash, so a changed PDF is a new paper with a new cover.
 */
async function coverFor(id: string) {
  let task = covers.get(id);
  if (!task) {
    task = (async () => {
      const record = await documentRepository.getDocument(id);
      if (record?.cover) return record.cover;
      const legacy = await legacyCover(id);
      if (legacy) { const image = await dataUrl(legacy); if (record) void documentRepository.updateDocument(id, { cover: image }); return image; }
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
          await page.render(canvas, 240 / page.width, new AbortController().signal);
          const image = canvas.toDataURL("image/webp", .72);
          canvas.width = 0; canvas.height = 0;
          if (!image.startsWith("data:image/")) throw new Error("Cover not rendered");
          if (record) void documentRepository.updateDocument(id, { cover: image });
          return image;
        } finally { await pdf.destroy(); }
      } finally { active--; waiting.shift()?.(); }
    })();
    covers.set(id, task);
    task.catch(() => covers.delete(id));
  }
  return task;
}

export function DocumentCover({ documentId, title, cover }: { documentId: string; title: string; /** The stored cover, when the caller has the record: shown on the first paint. */ cover?: string }) {
  const root = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string | undefined>(cover), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  // A cover that failed before the account session was ready tries again after the next sync.
  useEffect(() => {
    if (!failed) return;
    const retry = () => { setFailed(false); setAttempt(value => value + 1); };
    window.addEventListener("paperflow:library-synced", retry);
    return () => window.removeEventListener("paperflow:library-synced", retry);
  }, [failed]);
  useEffect(() => {
    if (cover) { setSrc(cover); return; }
    let alive = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void coverFor(documentId).then(image => { if (alive) setSrc(image); }).catch(() => { if (alive) setFailed(true); });
    }, { rootMargin: "250px" });
    if (root.current) observer.observe(root.current);
    return () => { alive = false; observer.disconnect(); };
  }, [documentId, attempt, cover]);
  return <span ref={root} className="pf-book-cover" data-cover-ready={Boolean(src)}>
    {src ? <img src={src} alt={`${title} 첫 페이지`} draggable={false} decoding="async" loading="lazy"/> : <span className="pf-cover-placeholder"><FileText size={28}/><span>{failed ? "PDF" : "표지 불러오는 중"}</span></span>}
    <span className="pf-book-spine" aria-hidden="true"/><span className="pf-book-light" aria-hidden="true"/>
  </span>;
}
