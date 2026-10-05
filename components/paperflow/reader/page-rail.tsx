"use client";
import * as React from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { DocumentRail, type DocumentPage } from "@/components/product/document-rail";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ListTree } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OutlineEntry } from "@/lib/paperflow/pdf/pdfjs";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import type { PageSize } from "./pdf-page";

export function PageRail({ pdf, sizes, outline, annotationCounts }: { pdf: PDFDocumentProxy; sizes: PageSize[]; outline: OutlineEntry[]; annotationCounts: Map<number, number> }) {
  const page = useReaderStore((s) => s.page);
  const goToPage = useReaderStore((s) => s.goToPage);

  const pages = React.useMemo<DocumentPage[]>(
    () =>
      sizes.map((size, i) => ({
        id: String(i),
        page: i + 1,
        annotations: annotationCounts.get(i),
        thumbnail: <Thumbnail pdf={pdf} pageIndex={i} size={size} />,
      })),
    [sizes, pdf, annotationCounts],
  );

  // Keep the active thumbnail in view.
  const listRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [page]);

  return (
    <Tabs defaultValue="pages" className="flex h-full min-h-0 flex-col">
      <div className="px-3 pt-3">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="outline">Outline</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="pages" className="mt-0 min-h-0 flex-1" ref={listRef}>
        <DocumentRail
          pages={pages}
          activePage={page}
          onPageSelect={goToPage}
          className="h-full min-h-0 w-full rounded-none border-0 bg-transparent px-5 py-3 shadow-none backdrop-blur-none"
        />
      </TabsContent>
      <TabsContent value="outline" className="dd-scrollbar mt-0 min-h-0 flex-1 overflow-y-auto p-3">
        {outline.length === 0 ? (
          <EmptyState icon={<ListTree className="size-4" />} title="No outline" description="This PDF has no embedded bookmarks." className="min-h-40 px-3 py-6" />
        ) : (
          <ul className="space-y-0.5">
            {outline.map((entry, i) => (
              <li key={i}>
                <button
                  type="button"
                  disabled={entry.pageIndex === null}
                  onClick={() => entry.pageIndex !== null && goToPage(entry.pageIndex + 1)}
                  className={cn("dd-focus flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-black/[.05] disabled:opacity-50 dark:hover:bg-white/[.07]")}
                  style={{ paddingLeft: 8 + entry.depth * 12 }}
                >
                  <span className="line-clamp-2">{entry.title}</span>
                  {entry.pageIndex !== null ? <span className="shrink-0 tabular-nums text-[10px] text-[var(--muted)]">{entry.pageIndex + 1}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}

function Thumbnail({ pdf, pageIndex, size }: { pdf: PDFDocumentProxy; pageIndex: number; size: PageSize }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let cancelled = false;
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const page = await pdf.getPage(pageIndex + 1);
      if (cancelled) return;
      const width = host.clientWidth || 96;
      const scale = (width / size.width) * Math.min(2, window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.className = "h-full w-full";
      try {
        await page.render({ canvas, viewport }).promise;
        if (!cancelled) host.replaceChildren(canvas);
      } catch {
        // Cancelled or failed; the placeholder stays.
      }
    });
    io.observe(host);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [pdf, pageIndex, size.width]);
  return <div ref={ref} className="h-full w-full bg-white" style={{ aspectRatio: `${size.width} / ${size.height}` }} />;
}
