"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronUp, Command, Maximize2, Minus, MoonStar, PanelLeft, PanelRight, Plus, Sun } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SearchField } from "@/components/ui/search-field";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import type { DocumentRecord, ReaderMode } from "@/lib/paperflow/types";
import { useShell } from "../shell/providers";
import { useTheme } from "../shell/theme";

export type SearchState = { query: string; total: number; index: number; searching: boolean };

export function ReaderTopbar({
  document,
  search,
  onSearchChange,
  onSearchStep,
  searchRef,
}: {
  document: DocumentRecord;
  search: SearchState;
  onSearchChange: (q: string) => void;
  onSearchStep: (direction: 1 | -1) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { openCommand } = useShell();
  const { resolved, cycle } = useTheme();
  const page = useReaderStore((s) => s.page);
  const pageCount = useReaderStore((s) => s.pageCount);
  const zoom = useReaderStore((s) => s.zoom);
  const fit = useReaderStore((s) => s.fit);
  const mode = useReaderStore((s) => s.mode);
  const railOpen = useReaderStore((s) => s.railOpen);
  const inspectorOpen = useReaderStore((s) => s.inspectorOpen);
  const { goToPage, zoomStep, setZoom, toggleRail, toggleInspector } = useReaderStore.getState();

  const [pageDraft, setPageDraft] = React.useState(String(page));
  React.useEffect(() => setPageDraft(String(page)), [page]);

  const onMode = (value: string) => {
    if (value === "original") return;
    toast.message(value === "hybrid" ? "Hybrid translation arrives in Phase 2" : "Korean mode arrives in Phase 2", {
      description: "Translations will appear as anchored overlays; the original paper is never replaced.",
    });
  };

  const ctl = "coarse:size-11";
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-2.5 backdrop-blur-[24px] backdrop-saturate-150">
      <IconButton asChild label="Back to Research Library" size="sm" variant="ghost" className={ctl}>
        <Link href="/paperflow">
          <ChevronLeft className="size-4" />
        </Link>
      </IconButton>
      <IconButton label={railOpen ? "Hide page rail ([)" : "Show page rail ([)"} aria-pressed={railOpen} size="sm" variant="ghost" onClick={() => toggleRail()} className={ctl}>
        <PanelLeft className="size-4" />
      </IconButton>

      <div className="min-w-0 flex-1 pl-1 lg:max-w-[340px] xl:max-w-[420px]">
        <h1 className="truncate text-[13px] font-semibold tracking-[-.015em]" title={document.title}>
          {document.title}
        </h1>
        <div className="truncate text-[11px] text-[var(--muted)]">
          {document.fileName}
          {document.source === "bundled-sample" ? " · synthetic sample" : ""}
        </div>
      </div>

      <div className="flex items-center gap-1" role="group" aria-label="Page navigation">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(pageDraft);
            if (Number.isFinite(n)) goToPage(n);
          }}
          className="flex items-center gap-1 text-xs"
        >
          <label htmlFor="pf-page-input" className="sr-only">
            Current page
          </label>
          <input
            id="pf-page-input"
            inputMode="numeric"
            value={pageDraft}
            onChange={(e) => setPageDraft(e.target.value.replace(/\D/g, ""))}
            onBlur={() => setPageDraft(String(page))}
            className="dd-focus h-8 w-10 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] text-center text-xs font-semibold tabular-nums coarse:h-11 coarse:w-12"
          />
          <span className="whitespace-nowrap text-[var(--muted)] tabular-nums">/ {pageCount || "–"}</span>
        </form>
      </div>

      <span className="mx-1 h-5 w-px bg-[var(--line)]" aria-hidden />

      <div className="flex items-center" role="group" aria-label="Zoom">
        <IconButton label="Zoom out" size="sm" variant="ghost" onClick={() => zoomStep(-1)} className={ctl}>
          <Minus className="size-4" />
        </IconButton>
        <span className="w-11 text-center text-[11px] font-medium tabular-nums" aria-live="polite">
          {Math.round(zoom)}%
        </span>
        <IconButton label="Zoom in" size="sm" variant="ghost" onClick={() => zoomStep(1)} className={ctl}>
          <Plus className="size-4" />
        </IconButton>
        <IconButton
          label={fit === "width" ? "Fit page" : "Fit width"}
          size="sm"
          variant="ghost"
          aria-pressed={fit !== null}
          onClick={() => setZoom(zoom, fit === "width" ? "page" : "width")}
          className={cn(ctl, fit && "text-[var(--accent)]")}
        >
          <Maximize2 className="size-4" />
        </IconButton>
      </div>

      <span className="mx-1 hidden h-5 w-px bg-[var(--line)] lg:block" aria-hidden />

      <div className="hidden lg:block" aria-label="Document mode">
        <SegmentedControl
          className="coarse:[&_button]:h-11"
          value={mode}
          onValueChange={onMode}
          items={[
            { value: "original" satisfies ReaderMode, label: "Original" },
            { value: "hybrid" satisfies ReaderMode, label: "Hybrid" },
            { value: "korean" satisfies ReaderMode, label: "Korean" },
          ]}
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <div className="relative hidden md:block">
          <SearchField
            ref={searchRef}
            aria-label="Search in this paper"
            placeholder="Search in paper"
            value={search.query}
            onChange={(e) => onSearchChange(e.target.value)}
            onClear={() => onSearchChange("")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearchStep(e.shiftKey ? -1 : 1);
              }
              if (e.key === "Escape") (e.target as HTMLInputElement).blur();
            }}
            className="h-8 w-[200px] rounded-lg xl:w-[230px] coarse:h-11"
          />
          {search.query ? (
            <div className="absolute right-9 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
              <span className="text-[10px] tabular-nums text-[var(--muted)]" aria-live="polite">
                {search.searching ? "…" : search.total ? `${search.index + 1}/${search.total}` : "0"}
              </span>
            </div>
          ) : null}
        </div>
        {search.query && search.total > 1 ? (
          <>
            <IconButton label="Previous match" size="sm" variant="ghost" onClick={() => onSearchStep(-1)} className={ctl}>
              <ChevronUp className="size-4" />
            </IconButton>
            <IconButton label="Next match" size="sm" variant="ghost" onClick={() => onSearchStep(1)} className={ctl}>
              <ChevronDown className="size-4" />
            </IconButton>
          </>
        ) : null}
        <IconButton label="Command palette (⌘K)" size="sm" variant="ghost" onClick={openCommand} className={ctl}>
          <Command className="size-4" />
        </IconButton>
        <IconButton label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"} size="sm" variant="ghost" onClick={cycle} className={ctl}>
          {resolved === "dark" ? <Sun className="size-4" /> : <MoonStar className="size-4" />}
        </IconButton>
        <IconButton label={inspectorOpen ? "Hide inspector (])" : "Show inspector (])"} aria-pressed={inspectorOpen} size="sm" variant="ghost" onClick={() => toggleInspector()} className={ctl}>
          <PanelRight className="size-4" />
        </IconButton>
      </div>
    </header>
  );
}
