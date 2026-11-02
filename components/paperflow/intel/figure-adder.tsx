"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { intelRepository } from "@/lib/paperflow/intel/repository";
import type { IntelItem } from "@/lib/paperflow/intel/types";

/** An image file or a pasted screenshot as a WebP data URL, at most 1400 px wide (a case figure stays light). */
async function compress(file: Blob) {
  const bitmap = await createImageBitmap(file), scale = Math.min(1, 1400 / bitmap.width), canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [.82, .7, .58]) { const url = canvas.toDataURL("image/webp", quality); if (url.length < 780_000) return url; }
  throw new Error("이미지가 너무 큽니다. 잘라서 다시 넣어 주세요.");
}

/**
 * The reader's own figures for a case: add a file, or paste a screenshot (Ctrl+V) while the panel is
 * open — a slide from a meeting, a photo from a site visit, a chart from a paywalled report you read.
 * Kept with the item (synced with the account), never sent anywhere else.
 */
export function FigureAdder({ item, notify }: { item: IntelItem; notify: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false);
  const figures = item.user?.figures ?? [];
  const add = async (files: Blob[]) => {
    const images = files.filter(file => file.type.startsWith("image/"));
    if (!images.length || busy) return;
    setBusy(true);
    try {
      const added = [];
      for (const file of images.slice(0, 6)) added.push({ src: await compress(file), caption: (file as File).name?.replace(/\.[^.]+$/, "") || "붙여넣은 그림", addedAt: new Date().toISOString() });
      await intelRepository.setUser(item.id, { figures: [...figures, ...added].slice(-12) });
      notify(`그림 ${added.length}장을 추가했습니다.`);
    } catch (error) { notify(error instanceof Error ? error.message : "그림을 넣지 못했습니다."); }
    finally { setBusy(false); }
  };
  // Paste anywhere while this record is open (not inside a text field).
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if ((event.target as Element | null)?.closest?.("textarea, input, [contenteditable]")) return;
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.some(file => file.type.startsWith("image/"))) { event.preventDefault(); void add(files); }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  });
  const caption = (index: number, text: string) => void intelRepository.setUser(item.id, { figures: figures.map((figure, at) => at === index ? { ...figure, caption: text.slice(0, 300) } : figure) });
  const remove = (index: number) => void intelRepository.setUser(item.id, { figures: figures.filter((_, at) => at !== index) });

  return <section className="pf-figure-adder" onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={event => { const files = [...event.dataTransfer.files]; if (files.length) { event.preventDefault(); void add(files); } }}>
    <h4>내가 추가한 그림 {figures.length ? `· ${figures.length}` : ""}</h4>
    {figures.length > 0 && <div className="pf-figure-list">{figures.map((figure, index) => <figure key={figure.addedAt + index}>
      <button type="button" className="pf-figure-img" onClick={event => event.currentTarget.toggleAttribute("data-big")} aria-label="크게 보기"><img src={figure.src} alt={figure.caption}/></button>
      <figcaption><input defaultValue={figure.caption} aria-label="그림 설명" onBlur={event => { if (event.target.value !== figure.caption) caption(index, event.target.value); }}/><button type="button" aria-label="그림 지우기" onClick={() => remove(index)}><Trash2 size={13}/></button></figcaption>
    </figure>)}</div>}
    <input ref={input} type="file" accept="image/*" multiple hidden onChange={event => { void add([...(event.target.files ?? [])]); event.target.value = ""; }}/>
    <button type="button" className="pf-figure-add" disabled={busy} onClick={() => input.current?.click()}><ImagePlus size={15}/>{busy ? "넣는 중…" : "그림 추가"}<small>파일 선택 · 끌어다 놓기 · Ctrl+V 붙여넣기</small></button>
  </section>;
}
