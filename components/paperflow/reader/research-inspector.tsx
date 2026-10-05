"use client";
import * as React from "react";
import { AlertTriangle, CheckCircle2, FileText, Gauge, Highlighter, Link2Off, MapPinned, NotebookPen, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import type { AnchorResolution } from "@/lib/paperflow/anchors/anchor";
import { BUDGETS, getLatest, subscribe, type BudgetName } from "@/lib/paperflow/perf";
import { useReaderStore, type InspectorTab } from "@/lib/paperflow/state/reader-store";
import { highlightColor, type AnchorStatus, type DocumentRecord, type Highlight } from "@/lib/paperflow/types";
import { ACTION_ICONS, ACTION_LABELS } from "./selection-action-bar";

const STATUS_META: Record<AnchorStatus | "pending", { label: string; tone: "neutral" | "blue" | "green" | "red" | "violet"; description: string }> = {
  exact: { label: "Anchored", tone: "green", description: "Exact geometry match" },
  quote: { label: "Re-anchored · quote", tone: "blue", description: "Matched by exact quote" },
  context: { label: "Re-anchored · context", tone: "blue", description: "Matched by surrounding text" },
  fuzzy: { label: "Needs review", tone: "violet", description: "Approximate match" },
  unresolved: { label: "Unresolved", tone: "red", description: "Not drawn on the page" },
  pending: { label: "Verifying…", tone: "neutral", description: "Page text not loaded yet" },
};

export function ResearchInspector({
  document,
  integrity,
  highlights,
  onDelete,
  onConfirm,
  onClose,
  className,
}: {
  document: DocumentRecord;
  integrity: "verified" | "changed" | undefined;
  highlights: Highlight[];
  onDelete: (id: string) => void;
  onConfirm: (highlight: Highlight) => void;
  onClose?: () => void;
  className?: string;
}) {
  const tab = useReaderStore((s) => s.inspectorTab);
  const setTab = useReaderStore((s) => s.setInspectorTab);
  const needsReview = useReaderStore((s) => highlights.filter((h) => ["fuzzy", "unresolved"].includes(s.resolutions[h.id]?.status ?? "")).length);

  return (
    <aside aria-label="Research inspector" className={cn("flex h-full min-h-0 flex-col", className)}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as InspectorTab)} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2.5">
          <TabsList className="grid flex-1 grid-cols-4">
            <TabsTrigger value="evidence" className="px-1">
              Evidence{needsReview ? <span className="ml-1 inline-block size-1.5 rounded-full bg-violet-500 align-middle" aria-label={`${needsReview} need review`} /> : null}
            </TabsTrigger>
            <TabsTrigger value="notes" className="px-1">Notes</TabsTrigger>
            <TabsTrigger value="assist" className="px-1">Assist</TabsTrigger>
            <TabsTrigger value="info" className="px-1">Info</TabsTrigger>
          </TabsList>
          {onClose ? (
            <IconButton label="Close inspector" size="sm" variant="ghost" onClick={onClose} className="coarse:size-11">
              <X className="size-4" />
            </IconButton>
          ) : null}
        </div>
        <TabsContent value="evidence" className="dd-scrollbar mt-0 min-h-0 flex-1 overflow-y-auto">
          <EvidenceTab highlights={highlights} onDelete={onDelete} onConfirm={onConfirm} />
        </TabsContent>
        <TabsContent value="notes" className="dd-scrollbar mt-0 min-h-0 flex-1 overflow-y-auto p-4">
          <EmptyState
            icon={<NotebookPen className="size-4" />}
            title="Grounded notes — Phase 3"
            description="Structured notes (Result, Method, Limitation, Formula…) will attach to highlights so every note keeps its source page and quote."
            className="min-h-48"
          />
        </TabsContent>
        <TabsContent value="assist" className="dd-scrollbar mt-0 min-h-0 flex-1 overflow-y-auto p-4">
          <AssistTab document={document} />
        </TabsContent>
        <TabsContent value="info" className="dd-scrollbar mt-0 min-h-0 flex-1 overflow-y-auto p-4">
          <InfoTab document={document} integrity={integrity} highlightCount={highlights.length} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function EvidenceTab({ highlights, onDelete, onConfirm }: { highlights: Highlight[]; onDelete: (id: string) => void; onConfirm: (h: Highlight) => void }) {
  const resolutions = useReaderStore((s) => s.resolutions);
  const activeId = useReaderStore((s) => s.activeHighlightId);
  const setActive = useReaderStore((s) => s.setActiveHighlight);
  const goToPage = useReaderStore((s) => s.goToPage);
  const listRef = React.useRef<HTMLOListElement>(null);

  React.useEffect(() => {
    if (activeId) listRef.current?.querySelector(`[data-id="${activeId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  if (highlights.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          icon={<Highlighter className="size-4" />}
          title="No highlights yet"
          description="Select text on the page, then choose Highlight (H). Highlights are stored as durable anchors: quote, context and page geometry."
          className="min-h-48"
        />
      </div>
    );
  }

  return (
    <ol ref={listRef} className="divide-y divide-[var(--line)]">
      {highlights.map((h) => {
        const resolution: AnchorResolution | undefined = resolutions[h.id];
        const status = resolution?.status ?? "pending";
        const meta = STATUS_META[status];
        const color = highlightColor(h.color);
        const active = activeId === h.id;
        return (
          <li key={h.id} data-id={h.id} className={cn("group relative px-4 py-3 transition-colors duration-150", active && "bg-[var(--accent)]/[.06]")}>
            <button
              type="button"
              className="dd-focus absolute inset-0 rounded-none"
              aria-label={`Go to highlight on page ${h.anchor.pageIndex + 1}: ${h.anchor.textQuote.slice(0, 60)}`}
              onClick={() => {
                setActive(h.id);
                goToPage(h.anchor.pageIndex + 1);
              }}
            />
            <div className="pointer-events-none relative flex items-center gap-2 text-[11px] text-[var(--muted)]">
              <span className="size-2.5 rounded-full" style={{ background: color.swatch }} aria-hidden />
              <span className="font-medium text-[var(--foreground)]">{color.name}</span>
              <span>· p. {h.anchor.pageIndex + 1}</span>
              <Badge tone={meta.tone} className="ml-auto px-2 py-0.5 text-[10px]" title={resolution?.reason ?? meta.description}>
                {meta.label}
              </Badge>
            </div>
            <blockquote className={cn("pointer-events-none relative mt-1.5 line-clamp-4 border-l-2 pl-2.5 text-[12.5px] leading-5", status === "unresolved" && "text-[var(--muted)] line-through decoration-[var(--muted)]/40")} style={{ borderColor: color.swatch }}>
              {h.anchor.textQuote}
            </blockquote>
            {resolution && resolution.relocated ? (
              <p className="pointer-events-none relative mt-2 flex gap-1.5 text-[11px] leading-4 text-[var(--muted)]">
                {status === "unresolved" ? <Link2Off className="mt-px size-3 shrink-0" /> : <AlertTriangle className="mt-px size-3 shrink-0" />}
                {resolution.reason}
              </p>
            ) : status === "unresolved" ? (
              <p className="pointer-events-none relative mt-2 flex gap-1.5 text-[11px] leading-4 text-red-600 dark:text-red-300">
                <Link2Off className="mt-px size-3 shrink-0" />
                {resolution?.reason}
              </p>
            ) : null}
            {status === "fuzzy" && resolution?.matchedText ? (
              <div className="relative mt-2 rounded-lg border border-dashed border-violet-500/40 bg-violet-500/[.05] p-2 text-[11px] leading-4">
                <div className="mb-1 font-semibold text-violet-700 dark:text-violet-300">Current page text</div>
                <div className="line-clamp-3">{resolution.matchedText}</div>
                <div className="mt-2 flex gap-1.5">
                  <Button size="sm" variant="secondary" className="h-7 px-2 text-[11px] coarse:h-11" onClick={() => onConfirm(h)}>
                    <CheckCircle2 className="size-3.5" /> Accept position
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] coarse:h-11" onClick={() => onDelete(h.id)}>
                    Discard
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="relative mt-1 flex justify-end opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 coarse:opacity-100">
              <IconButton label="Delete highlight" size="sm" variant="ghost" className="size-7 text-[var(--muted)] coarse:size-11" onClick={() => onDelete(h.id)}>
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function AssistTab({ document }: { document: DocumentRecord }) {
  const assist = useReaderStore((s) => s.assist);
  if (!assist) {
    return (
      <EmptyState
        icon={<Sparkles className="size-4" />}
        title="Point-of-friction assistance"
        description="Select a passage and choose Translate, Explain, Formula, Compare or Search papers. Phase 1 shows the evidence path only — no AI service is connected."
        className="min-h-48"
      />
    );
  }
  const Icon = ACTION_ICONS[assist.action];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-black/[.05] dark:bg-white/[.07]">
          <Icon className="size-4" />
        </span>
        <div>
          <div className="text-sm font-semibold tracking-[-.01em]">{ACTION_LABELS[assist.action]}</div>
          <div className="text-[11px] text-[var(--muted)]">Interface shell · Phase 2</div>
        </div>
      </div>
      <section>
        <div className="mb-1.5 flex items-center gap-1.5">
          <Badge tone="neutral" className="px-2 py-0.5 text-[10px]">
            <FileText className="mr-1 size-3" /> Paper
          </Badge>
          <span className="text-[11px] text-[var(--muted)]">
            {document.title.length > 48 ? `${document.title.slice(0, 48)}…` : document.title} · p. {assist.pageIndex + 1}
          </span>
        </div>
        <blockquote className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-[12.5px] leading-5">{assist.quote}</blockquote>
      </section>
      <div className="rounded-xl border border-dashed border-[var(--line)] p-3 text-[12px] leading-5 text-[var(--muted)]">
        No output generated. In Phase 2 this panel will stream a grounded response where every claim is labelled <em>Paper</em>, <em>External source</em>, <em>Model explanation</em> or <em>User note</em>.
      </div>
    </div>
  );
}

function InfoTab({ document, integrity, highlightCount }: { document: DocumentRecord; integrity: "verified" | "changed" | undefined; highlightCount: number }) {
  const rows: [string, React.ReactNode][] = [
    ["File", <span key="f" className="break-all">{document.fileName}</span>],
    ["Pages", document.pageCount ?? "—"],
    ["Size", `${(document.byteLength / 1024).toFixed(0)} KB`],
    ["Source", document.source === "bundled-sample" ? "Bundled synthetic sample" : "Imported on this device"],
    ["SHA-256", <code key="s" className="font-mono text-[10px]">{document.sha256.slice(0, 16)}…</code>],
    ["Highlights", highlightCount],
  ];
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-semibold leading-5 tracking-[-.01em]">{document.title}</h3>
        <div className={cn("mt-2 flex items-start gap-1.5 text-[11px] leading-4", integrity === "changed" ? "text-red-600 dark:text-red-300" : "text-[var(--muted)]")}>
          {integrity === "changed" ? <AlertTriangle className="mt-px size-3 shrink-0" /> : <ShieldCheck className="mt-px size-3 shrink-0" />}
          {integrity === "changed"
            ? "Bytes differ from the recorded original. Highlights are re-verified through anchor recovery."
            : integrity === "verified"
              ? "Original binary verified · read-only. Annotations are stored as separate overlays."
              : "Verifying original…"}
        </div>
      </section>
      <dl className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-3 py-2">
            <dt className="text-[var(--muted)]">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <PerfBudgets />
      <div className="flex items-start gap-1.5 text-[11px] leading-4 text-[var(--muted)]">
        <MapPinned className="mt-px size-3 shrink-0" /> Research Map and discovery arrive in later phases.
      </div>
    </div>
  );
}

const BUDGET_LABELS: Record<BudgetName, string> = {
  "selection-bar": "Selection → action bar",
  "highlight-persist": "Highlight local save",
  "page-turn": "Page turn → painted",
};

function PerfBudgets() {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const unsubscribe = subscribe(() => force());
    return () => {
      unsubscribe();
    };
  }, []);
  return (
    <section>
      <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[var(--muted)]">
        <Gauge className="size-3" /> Performance budgets (last measured)
      </h4>
      <dl className="space-y-1 text-xs" data-testid="perf-budgets">
        {(Object.keys(BUDGETS) as BudgetName[]).map((name) => {
          const m = getLatest(name);
          return (
            <div key={name} className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">{BUDGET_LABELS[name]}</dt>
              <dd data-budget={name} className={cn("tabular-nums font-medium", m && !m.withinBudget && "text-red-600 dark:text-red-300")}>
                {m ? `${m.duration.toFixed(1)} ms` : "—"} <span className="font-normal text-[var(--muted)]">/ {BUDGETS[name]} ms</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
