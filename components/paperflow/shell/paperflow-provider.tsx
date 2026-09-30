"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { CommandMenu, type CommandItemDef } from "@/components/ui/command-menu";
import { PaperflowContext, type ReaderCommands } from "./paperflow-context";
import { useShortcuts } from "@/lib/paperflow/state/use-shortcuts";
import { readableError } from "@/lib/paperflow/errors";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
export function PaperflowProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } }));
  return <QueryClientProvider client={client}><MotionConfig reducedMotion="user"><AppControls client={client}>{children}</AppControls></MotionConfig></QueryClientProvider>;
}

function AppControls({ children, client }: { children: React.ReactNode; client: QueryClient }) {
  const router = useRouter(), pathname = usePathname();
  const input = useRef<HTMLInputElement>(null), returnFocus = useRef<HTMLElement | null>(null), busy = useRef(false);
  const [open, setOpen] = useState(false), [dark, setDark] = useState(false), [importing, setImporting] = useState(false), [message, setMessage] = useState("");
  const [commands, setCommands] = useState<ReaderCommands | null>(null);
  const notify = useCallback((text: string) => setMessage(text), []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => { let saved: string | null = null; try { saved = localStorage.getItem("paperflow-theme"); } catch { /* OS preference still works. */ } const isDark = saved ? saved === "dark" : media.matches; setDark(isDark); document.documentElement.dataset.pfTheme = isDark ? "dark" : "light"; };
    sync(); media.addEventListener("change", sync); return () => { media.removeEventListener("change", sync); delete document.documentElement.dataset.pfTheme; };
  }, []);
  const toggleTheme = useCallback(() => setDark(current => { const next = !current; document.documentElement.dataset.pfTheme = next ? "dark" : "light"; try { localStorage.setItem("paperflow-theme", next ? "dark" : "light"); } catch { notify("테마 설정을 저장하지 못했습니다."); } return next; }), [notify]);
  const openCommand = useCallback(() => { returnFocus.current = document.activeElement as HTMLElement; setOpen(true); }, []);
  const changeOpen = (value: boolean) => { setOpen(value); if (!value) setTimeout(() => returnFocus.current?.focus(), 0); };
  const openImport = useCallback(() => input.current?.click(), []);
  const importFiles = useCallback(async (files: File[]) => {
    if (busy.current || !files.length) return;
    busy.current = true; setImporting(true); setMessage("PDF를 확인하고 기기에 저장하는 중…");
    let firstId: string | undefined; const errors: string[] = [];
    try {
      const { importDocument } = await import("@/lib/paperflow/pdf/import-document");
      for (const file of files) { try { const doc = await importDocument(file); firstId ??= doc.id; } catch (error) { errors.push(`${file.name}: ${readableError(error)}`); } }
      await client.invalidateQueries({ queryKey: ["documents"] });
      setMessage(errors.length ? errors.join(" · ") : `${files.length}개 PDF 저장 완료. 원본은 그대로 보존됩니다.`);
      if (firstId) router.push(`/reader/${firstId}`);
    } catch (error) { setMessage(readableError(error)); }
    finally { busy.current = false; setImporting(false); if (input.current) input.current.value = ""; }
  }, [client, router]);
  const registerReader = useCallback((value: ReaderCommands | null) => setCommands(value), []);
  const focusSearch = useCallback(() => { if (commands?.search) commands.search(); else document.querySelector<HTMLInputElement>("[data-paper-search]")?.focus(); }, [commands]);
  useShortcuts({ ...commands, command: () => open ? changeOpen(false) : openCommand(), search: focusSearch, dismiss: () => { useReaderStore.getState().set({ activeSelection: null }); window.getSelection()?.removeAllRanges(); setMessage(""); } }, open);
  const readerId = useReaderStore(s => s.documentId);
  const items: CommandItemDef[] = [
    { id: "library", label: "Open Library · 라이브러리", onSelect: () => router.push("/library") },
    { id: "import", label: "Import PDF · 논문 가져오기", onSelect: openImport, disabled: importing },
    { id: "reader", label: "Go to Reader · 이어 읽기", onSelect: () => router.push(`/reader/${readerId}`), disabled: !readerId },
    { id: "inspector", label: "Toggle Inspector · 연구 패널", onSelect: commands?.toggleInspector, disabled: !commands },
    { id: "theme", label: "Toggle Theme · 테마 변경", onSelect: toggleTheme },
    { id: "search", label: "Focus Paper Search · 논문 검색", onSelect: () => setTimeout(focusSearch, 20) },
    { id: "prev", label: "Previous Page · 이전 페이지", onSelect: commands?.previous, disabled: !commands?.previous },
    { id: "next", label: "Next Page · 다음 페이지", onSelect: commands?.next, disabled: !commands?.next },
    { id: "width", label: "Fit Width · 너비 맞춤", onSelect: commands?.fitWidth, disabled: !commands },
    { id: "page", label: "Fit Page · 페이지 맞춤", onSelect: commands?.fitPage, disabled: !commands }
  ];
  const context = useMemo(() => ({ openImport, importFiles, importing, openCommand, toggleTheme, dark, notify, registerReader }), [openImport, importFiles, importing, openCommand, toggleTheme, dark, notify, registerReader]);
  return <PaperflowContext.Provider value={context}><div className="paperflow" lang="ko" data-reader={pathname.startsWith("/reader/")}>
    <input ref={input} className="sr-only" type="file" accept=".pdf,application/pdf" multiple aria-label="Import PDF file" onChange={e => void importFiles(Array.from(e.target.files ?? []))} />
    {children}
    <CommandMenu open={open} onOpenChange={changeOpen} items={items} placeholder="명령 검색…" />
    {message && <div className="pf-notification dd-glass" role="status"><span>{message}</span><button aria-label="알림 닫기" onClick={() => setMessage("")}>×</button></div>}
  </div></PaperflowContext.Provider>;
}
