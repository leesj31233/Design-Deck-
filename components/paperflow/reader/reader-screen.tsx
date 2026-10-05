"use client";
import * as React from "react";
import Link from "next/link";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownToLine, ArrowUpToLine, FileWarning, Highlighter, Maximize2, PanelLeft, PanelRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import type { CommandItemDef } from "@/components/ui/command-menu";
import { cn } from "@/lib/utils";
import { createTextAnchor, resolveAnchor, type AnchorResolution } from "@/lib/paperflow/anchors/anchor";
import { touchDocument } from "@/lib/paperflow/documents";
import { openPdf, readOutline, type OutlineEntry } from "@/lib/paperflow/pdf/pdfjs";
import type { PageRuntime } from "@/lib/paperflow/pdf/dom-text";
import { buildPageText } from "@/lib/paperflow/pdf/text-model";
import { useDeleteHighlight, useDocumentBytes, useDocumentRecord, useHighlights, useSaveHighlight } from "@/lib/paperflow/queries";
import { useReaderStore, type PendingSelection } from "@/lib/paperflow/state/reader-store";
import { HIGHLIGHT_COLORS, type Highlight, type HighlightColorId, type SelectionAction } from "@/lib/paperflow/types";
import { isEditableTarget, modKey } from "../shell/keyboard";
import { useRegisterCommands } from "../shell/providers";
import { PageRail } from "./page-rail";
import { PdfViewport } from "./pdf-viewport";
import type { PageSize } from "./pdf-page";
import { ReaderTopbar, type SearchState } from "./reader-topbar";
import { ResearchInspector } from "./research-inspector";
import { SelectionActionBar } from "./selection-action-bar";

type LoadedPdf = { pdf: PDFDocumentProxy; sizes: PageSize[]; outline: OutlineEntry[] };

function useMediaQuery(query: string, initial = true) {
  const [matches, setMatches] = React.useState(initial);
  React.useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const onChange = () => setMatches(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function ReaderScreen({ documentId }: { documentId: string }) {
  const recordQuery = useDocumentRecord(documentId);
  const record = recordQuery.data ?? undefined;
  const bytesQuery = useDocumentBytes(documentId, record?.sha256);
  const highlightsQuery = useHighlights(documentId);
  const highlights = React.useMemo(() => highlightsQuery.data ?? [], [highlightsQuery.data]);
  const saveHighlight = useSaveHighlight(documentId);
  const deleteHighlight = useDeleteHighlight(documentId);

  const [loaded, setLoaded] = React.useState<LoadedPdf | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const runtimes = React.useRef(new Map<number, PageRuntime>());
  const pageTextCache = React.useRef(new Map<number, string>());
  const [runtimeVersion, bumpRuntimes] = React.useReducer((n: number) => n + 1, 0);
  const [copied, setCopied] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const wide = useMediaQuery("(min-width: 1280px)");
  const railOpen = useReaderStore((s) => s.railOpen);
  const inspectorOpen = useReaderStore((s) => s.inspectorOpen);
  const store = useReaderStore.getState;

  // Reset local reader state per document; tablet widths start with the inspector closed.
  React.useEffect(() => {
    store().reset(documentId);
    store().toggleInspector(window.matchMedia("(min-width: 1280px)").matches);
    store().toggleRail(true);
    runtimes.current.clear();
    pageTextCache.current.clear();
  }, [documentId, store]);

  // Open the PDF from the verified original bytes.
  React.useEffect(() => {
    const bytes = bytesQuery.data?.bytes;
    if (!bytes) return;
    let cancelled = false;
    let close: (() => Promise<void>) | null = null;
    (async () => {
      try {
        const opened = await openPdf(bytes);
        close = opened.close;
        const { pdf } = opened;
        const sizes: PageSize[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const vp = (await pdf.getPage(i)).getViewport({ scale: 1 });
          sizes.push({ width: vp.width, height: vp.height });
        }
        const outline = await readOutline(pdf);
        if (cancelled) return;
        setLoaded({ pdf, sizes, outline });
        store().setPageCount(pdf.numPages);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Failed to open PDF");
      }
    })();
    return () => {
      cancelled = true;
      setLoaded(null);
      void close?.();
    };
  }, [bytesQuery.data, store]);

  // Restore last page once, then remember reading position.
  const restored = React.useRef(false);
  React.useEffect(() => {
    if (!loaded || !record || restored.current) return;
    restored.current = true;
    void touchDocument(record, { pageCount: loaded.sizes.length });
    if (record.lastPage && record.lastPage > 1) requestAnimationFrame(() => store().goToPage(record.lastPage!));
  }, [loaded, record, store]);
  const page = useReaderStore((s) => s.page);
  React.useEffect(() => {
    if (!record || !loaded) return;
    const t = window.setTimeout(() => void touchDocument(record, { lastPage: page, pageCount: loaded.sizes.length }), 800);
    return () => window.clearTimeout(t);
  }, [page, record, loaded]);

  const getPageText = React.useCallback(
    async (pageIndex: number) => {
      const runtime = runtimes.current.get(pageIndex);
      if (runtime) return runtime.model.text;
      const cached = pageTextCache.current.get(pageIndex);
      if (cached !== undefined) return cached;
      if (!loaded) return "";
      const content = await (await loaded.pdf.getPage(pageIndex + 1)).getTextContent();
      const text = buildPageText(content.items.filter((i): i is TextItem => "str" in i)).text;
      pageTextCache.current.set(pageIndex, text);
      return text;
    },
    [loaded],
  );

  // Anchor recovery: with live geometry for rendered pages, text-only for the rest (so the inspector can report every highlight).
  React.useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      const byPage = new Map<number, Highlight[]>();
      for (const h of highlights) byPage.set(h.anchor.pageIndex, [...(byPage.get(h.anchor.pageIndex) ?? []), h]);
      const entries: Record<string, AnchorResolution> = {};
      for (const [pageIndex, list] of byPage) {
        if (pageIndex >= loaded.sizes.length) {
          for (const h of list) entries[h.id] = { status: "unresolved", relocated: false, reason: "Page no longer exists in this document." };
          continue;
        }
        const runtime = runtimes.current.get(pageIndex);
        const text = await getPageText(pageIndex);
        if (cancelled) return;
        for (const h of list) entries[h.id] = resolveAnchor(h.anchor, { text, measure: runtime?.measureNormalized });
      }
      store().setResolutions(entries, highlights.map((h) => h.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [highlights, loaded, runtimeVersion, getPageText, store]);

  const onRuntimeChange = React.useCallback((pageIndex: number, runtime: PageRuntime | null) => {
    if (runtime) runtimes.current.set(pageIndex, runtime);
    else runtimes.current.delete(pageIndex);
    if (runtime) bumpRuntimes();
  }, []);

  // ---- Actions ---------------------------------------------------------------------
  const createHighlight = React.useCallback(
    (selection: PendingSelection, color: HighlightColorId) => {
      const now = Date.now();
      const highlight: Highlight = {
        id: crypto.randomUUID(),
        documentId,
        color,
        createdAt: now,
        updatedAt: now,
        anchor: createTextAnchor({
          documentId,
          pageIndex: selection.pageIndex,
          pageText: selection.pageText,
          start: selection.start,
          end: selection.end,
          rects: selection.rects,
          pageWidth: selection.pageWidth,
          pageHeight: selection.pageHeight,
        }),
      };
      saveHighlight.mutate(highlight, { onError: () => toast.error("Highlight could not be saved locally.") });
      window.getSelection()?.removeAllRanges();
      store().setSelection(null);
      store().setActiveHighlight(highlight.id);
    },
    [documentId, saveHighlight, store],
  );

  const onAction = React.useCallback(
    async (selection: PendingSelection, action: SelectionAction) => {
      if (action === "copy-citation") {
        const title = record?.title ?? "Untitled";
        const text = `“${selection.quote.replace(/\s+/g, " ")}” — ${title}, p. ${selection.pageIndex + 1}.`;
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
          toast.success("Citation copied", { description: "Quote with document title and page. Bibliographic metadata is not yet available." });
        } catch {
          toast.error("Clipboard is not available.");
        }
        return;
      }
      store().requestAssist({ action, quote: selection.quote, pageIndex: selection.pageIndex });
      window.getSelection()?.removeAllRanges();
      store().setSelection(null);
    },
    [record, store],
  );

  const onDelete = React.useCallback(
    (id: string) => {
      deleteHighlight.mutate(id);
      if (store().activeHighlightId === id) store().setActiveHighlight(null);
    },
    [deleteHighlight, store],
  );

  /** User explicitly accepts a re-anchored position: the old anchor is kept in history. */
  const onConfirm = React.useCallback(
    (h: Highlight) => {
      const resolution = store().resolutions[h.id];
      const runtime = runtimes.current.get(h.anchor.pageIndex);
      if (!resolution || resolution.start === undefined || resolution.end === undefined) return;
      if (!runtime) {
        store().goToPage(h.anchor.pageIndex + 1);
        toast.message("Open the page to confirm this position.");
        return;
      }
      const anchor = createTextAnchor({
        documentId,
        pageIndex: h.anchor.pageIndex,
        pageText: runtime.model.text,
        start: resolution.start,
        end: resolution.end,
        rects: runtime.measure(resolution.start, resolution.end),
        pageWidth: runtime.width,
        pageHeight: runtime.height,
      });
      saveHighlight.mutate({ ...h, anchor, previousAnchors: [...(h.previousAnchors ?? []), h.anchor], updatedAt: Date.now() });
      toast.success("Highlight position confirmed");
    },
    [documentId, saveHighlight, store],
  );

  // ---- Local paper search ----------------------------------------------------------
  const [search, setSearch] = React.useState<SearchState>({ query: "", total: 0, index: 0, searching: false });
  const matches = React.useRef<{ pageIndex: number; start: number; end: number }[]>([]);

  const revealMatch = React.useCallback(
    (m: { pageIndex: number; start: number; end: number }) => {
      store().goToPage(m.pageIndex + 1);
      let tries = 0;
      const attempt = () => {
        const runtime = runtimes.current.get(m.pageIndex);
        if (!runtime) {
          if (tries++ < 60) requestAnimationFrame(attempt);
          return;
        }
        const rects = runtime.measure(m.start, m.end);
        const box = runtime.element.getBoundingClientRect();
        const viewport = document.getElementById("pf-reader-viewport");
        if (viewport && rects[0]) {
          const y = box.top + (rects[0].y / runtime.height) * box.height;
          const vb = viewport.getBoundingClientRect();
          if (y < vb.top + 60 || y > vb.bottom - 60) viewport.scrollTop += y - vb.top - vb.height / 3;
        }
        // Show the match as a native selection so all selection actions apply to it.
        const first = runtime.divs.findIndex((_, i) => runtime.model.itemStarts[i] + runtime.model.itemLengths[i] > m.start);
        const last = runtime.divs.findIndex((_, i) => runtime.model.itemStarts[i] + runtime.model.itemLengths[i] >= m.end);
        const a = runtime.divs[first]?.firstChild;
        const b = runtime.divs[last]?.firstChild;
        if (a && b) {
          const range = document.createRange();
          range.setStart(a, Math.max(0, Math.min(runtime.model.itemLengths[first], m.start - runtime.model.itemStarts[first])));
          range.setEnd(b, Math.max(0, Math.min(runtime.model.itemLengths[last], m.end - runtime.model.itemStarts[last])));
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      };
      requestAnimationFrame(attempt);
    },
    [store],
  );

  React.useEffect(() => {
    const q = search.query.trim();
    if (!loaded || q.length < 2) {
      matches.current = [];
      setSearch((s) => ({ ...s, total: 0, index: 0, searching: false }));
      return;
    }
    let cancelled = false;
    setSearch((s) => ({ ...s, searching: true }));
    const t = window.setTimeout(async () => {
      const found: { pageIndex: number; start: number; end: number }[] = [];
      const needle = q.toLowerCase();
      for (let i = 0; i < loaded.sizes.length; i++) {
        const text = (await getPageText(i)).toLowerCase();
        let from = 0;
        for (;;) {
          const idx = text.indexOf(needle, from);
          if (idx === -1) break;
          found.push({ pageIndex: i, start: idx, end: idx + needle.length });
          from = idx + 1;
        }
      }
      if (cancelled) return;
      matches.current = found;
      revealed.current = -1;
      setSearch((s) => ({ ...s, total: found.length, index: 0, searching: false }));
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [search.query, loaded, getPageText]);

  const revealed = React.useRef(-1);
  const onSearchStep = React.useCallback(
    (direction: 1 | -1) => {
      const list = matches.current;
      if (list.length === 0) return;
      const index = revealed.current < 0 ? (direction > 0 ? 0 : list.length - 1) : (revealed.current + direction + list.length) % list.length;
      revealed.current = index;
      revealMatch(list[index]);
      setSearch((s) => ({ ...s, index }));
    },
    [revealMatch],
  );

  // ---- Keyboard shortcuts ----------------------------------------------------------
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = store();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (mod && (e.key === "=" || e.key === "+")) return e.preventDefault(), s.zoomStep(1);
      if (mod && e.key === "-") return e.preventDefault(), s.zoomStep(-1);
      if (mod && e.key === "0") return e.preventDefault(), s.setZoom(s.zoom, "width");
      if (mod || e.altKey || isEditableTarget(e.target)) return;

      if (s.selection) {
        if (e.key === "Escape") {
          window.getSelection()?.removeAllRanges();
          s.setSelection(null);
          return;
        }
        if (e.key.toLowerCase() === "h") return e.preventDefault(), createHighlight(s.selection, "yellow");
        const colorIndex = Number(e.key) - 1;
        if (colorIndex >= 0 && colorIndex < HIGHLIGHT_COLORS.length) return e.preventDefault(), createHighlight(s.selection, HIGHLIGHT_COLORS[colorIndex].id);
        if (e.key.toLowerCase() === "a") {
          e.preventDefault();
          document.querySelector<HTMLButtonElement>("#pf-selection-bar button")?.focus();
          return;
        }
      }
      if (e.target instanceof HTMLElement && e.target.closest('[role="toolbar"], [role="tablist"], [role="dialog"]')) return;
      switch (e.key) {
        case "j":
        case "PageDown":
          if (e.key === "PageDown" && document.activeElement?.id === "pf-reader-viewport") return;
          e.preventDefault();
          s.goToPage(s.page + 1);
          break;
        case "k":
        case "PageUp":
          if (e.key === "PageUp" && document.activeElement?.id === "pf-reader-viewport") return;
          e.preventDefault();
          s.goToPage(s.page - 1);
          break;
        case "[":
          s.toggleRail();
          break;
        case "]":
          s.toggleInspector();
          break;
        case "Escape":
          if (!wide && s.inspectorOpen) s.toggleInspector(false);
          else s.setActiveHighlight(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createHighlight, store, wide]);

  // ---- Command palette entries -----------------------------------------------------
  const pageCount = loaded?.sizes.length ?? 0;
  const commands = React.useMemo<CommandItemDef[]>(() => {
    const s = store;
    const mod = modKey();
    const items: CommandItemDef[] = [
      { id: "r-next", group: "Reader", label: "Next page", shortcut: "J", icon: <ArrowDownToLine className="size-4" />, onSelect: () => s().goToPage(s().page + 1) },
      { id: "r-prev", group: "Reader", label: "Previous page", shortcut: "K", icon: <ArrowUpToLine className="size-4" />, onSelect: () => s().goToPage(s().page - 1) },
      { id: "r-zoom-in", group: "Reader", label: "Zoom in", shortcut: `${mod} +`, icon: <ZoomIn className="size-4" />, onSelect: () => s().zoomStep(1) },
      { id: "r-zoom-out", group: "Reader", label: "Zoom out", shortcut: `${mod} −`, icon: <ZoomOut className="size-4" />, onSelect: () => s().zoomStep(-1) },
      { id: "r-fit-w", group: "Reader", label: "Fit width", shortcut: `${mod} 0`, icon: <Maximize2 className="size-4" />, onSelect: () => s().setZoom(s().zoom, "width") },
      { id: "r-fit-p", group: "Reader", label: "Fit page", icon: <Maximize2 className="size-4" />, onSelect: () => s().setZoom(s().zoom, "page") },
      { id: "r-rail", group: "Reader", label: "Toggle page rail", shortcut: "[", icon: <PanelLeft className="size-4" />, onSelect: () => s().toggleRail() },
      { id: "r-insp", group: "Reader", label: "Toggle research inspector", shortcut: "]", icon: <PanelRight className="size-4" />, onSelect: () => s().toggleInspector() },
      { id: "r-hl", group: "Reader", label: "Show highlights", icon: <Highlighter className="size-4" />, keywords: ["evidence", "annotations"], onSelect: () => s().setInspectorTab("evidence") },
    ];
    for (let i = 1; i <= Math.min(pageCount, 60); i++) {
      items.push({ id: `r-page-${i}`, group: "Go to page", label: `Page ${i}`, keywords: [`p${i}`, String(i)], onSelect: () => s().goToPage(i) });
    }
    return items;
  }, [pageCount, store]);
  useRegisterCommands("reader", commands);

  const annotationCounts = React.useMemo(() => {
    const map = new Map<number, number>();
    for (const h of highlights) map.set(h.anchor.pageIndex, (map.get(h.anchor.pageIndex) ?? 0) + 1);
    return map;
  }, [highlights]);

  // ---- Render ----------------------------------------------------------------------
  if (recordQuery.isSuccess && !record) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <EmptyState icon={<FileWarning className="size-4" />} title="Document not found" description="It may have been imported in another browser. PDFs are stored on this device only in Phase 1." action={<Button asChild variant="primary" size="sm"><Link href="/paperflow">Back to Library</Link></Button>} />
      </div>
    );
  }
  const error = loadError ?? (bytesQuery.error instanceof Error ? bytesQuery.error.message : null);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {record ? (
        <ReaderTopbar
          document={record}
          search={search}
          onSearchChange={(query) => setSearch((s) => ({ ...s, query }))}
          onSearchStep={onSearchStep}
          searchRef={searchRef}
        />
      ) : (
        <div className="h-14 border-b border-[var(--line)] bg-[var(--surface)]" />
      )}
      <div className="relative flex min-h-0 flex-1">
        {railOpen ? (
          <nav aria-label="Pages and outline" className={cn("shrink-0 border-r border-[var(--line)] bg-[var(--surface)] backdrop-blur-[24px]", wide ? "w-[188px]" : "w-[156px]")}>
            {loaded ? <PageRail pdf={loaded.pdf} sizes={loaded.sizes} outline={loaded.outline} annotationCounts={annotationCounts} /> : <RailSkeleton />}
          </nav>
        ) : null}

        <main className="relative min-w-0 flex-1">
          {error ? (
            <div className="grid h-full place-items-center bg-[var(--pf-workspace)] p-6">
              <EmptyState icon={<FileWarning className="size-4" />} title="Could not open this PDF" description={error} />
            </div>
          ) : loaded ? (
            <PdfViewport pdf={loaded.pdf} sizes={loaded.sizes} highlights={highlights} runtimes={runtimes} onRuntimeChange={onRuntimeChange} />
          ) : (
            <div className="grid h-full place-items-start justify-center bg-[var(--pf-workspace)] pt-6" aria-busy="true" aria-label="Loading document">
              <Skeleton className="h-[78vh] w-[min(60vw,720px)] rounded-[2px]" />
            </div>
          )}
          {/* Tablet: the inspector slides over the paper instead of shrinking it. Opaque, not frosted: the PDF is never blurred. */}
          {!wide ? (
            <AnimatePresence>
              {inspectorOpen && record ? (
                <motion.div
                  key="inspector-sheet"
                  initial={{ x: 24, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 24, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                  className="absolute bottom-3 right-3 top-3 z-30 w-[360px] max-w-[calc(100%-24px)] overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--background)] shadow-[var(--shadow-float)]"
                >
                  <ResearchInspector document={record} integrity={bytesQuery.data?.integrity} highlights={highlights} onDelete={onDelete} onConfirm={onConfirm} onClose={() => store().toggleInspector(false)} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          ) : null}
        </main>

        {wide && inspectorOpen && record ? (
          <div className="w-[348px] shrink-0 border-l border-[var(--line)] bg-[var(--surface)] backdrop-blur-[24px]">
            <ResearchInspector document={record} integrity={bytesQuery.data?.integrity} highlights={highlights} onDelete={onDelete} onConfirm={onConfirm} />
          </div>
        ) : null}
      </div>
      <SelectionActionBar onHighlight={createHighlight} onAction={onAction} copied={copied} />
    </div>
  );
}

function RailSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="aspect-[3/4] w-full rounded-[10px]" />
      ))}
    </div>
  );
}
