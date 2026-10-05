"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  BookOpen,
  Command,
  FileUp,
  GitMerge,
  HelpCircle,
  Library,
  Link2,
  MoonStar,
  Network,
  NotebookPen,
  Sun,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { SearchField } from "@/components/ui/search-field";
import { Sidebar, type SidebarItem } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { EVIDENCE_SIGNALS, MOCK_ARCHIVE, MOCK_PAPERS, RESEARCH_POOLS, type EvidenceSignalType } from "@/lib/paperflow/mock-data";
import { useDocuments, useHighlights } from "@/lib/paperflow/queries";
import type { DocumentRecord } from "@/lib/paperflow/types";
import { useShell } from "../shell/providers";
import { useTheme } from "../shell/theme";
import { modKey } from "../shell/keyboard";

const NAV: SidebarItem[] = [
  { id: "library", label: "Library", icon: Library },
  { id: "reading", label: "Reading", icon: BookOpen },
  { id: "map", label: "Research Map", icon: Network, badge: "Soon" },
  { id: "notebook", label: "Notebook", icon: NotebookPen, badge: "Soon" },
];

export function LibraryScreen() {
  const router = useRouter();
  const { importPdf, importing, openCommand } = useShell();
  const { resolved, cycle } = useTheme();
  const documents = useDocuments();
  const [query, setQuery] = React.useState("");
  const [mod, setMod] = React.useState("⌘");
  const [compact, setCompact] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setMod(modKey());
    const media = window.matchMedia("(max-width: 1279px)");
    setCompact(media.matches);
  }, []);

  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);
  const docs = (documents.data ?? []).filter((d) => matches(`${d.title} ${d.fileName}`));
  const papers = MOCK_PAPERS.filter((p) => matches(`${p.title} ${p.topics.join(" ")}`));
  const archive = React.useMemo(() => MOCK_ARCHIVE.filter((a) => !q || `${a.title} ${a.topic}`.toLowerCase().includes(q)), [q]);

  const onNav = (id: string) => {
    if (id === "reading") {
      const latest = documents.data?.[0];
      if (latest) router.push(`/paperflow/reader/${latest.id}`);
      return;
    }
    if (id === "map" || id === "notebook") toast.message(id === "map" ? "Research Map arrives in Phase 3" : "Notebook arrives in Phase 3", { description: "Every node and note will resolve to paper evidence." });
  };

  return (
    <div className="flex min-h-dvh gap-3 p-3">
      {compact === null ? (
        <div className="w-[68px] shrink-0" />
      ) : (
        <Sidebar
          key={String(compact)}
          items={NAV}
          activeId="library"
          onSelect={onNav}
          defaultCollapsed={compact}
          className="sticky top-3 h-[calc(100dvh-24px)] shrink-0"
          header={
            <div className="flex items-center gap-2.5">
              <div className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[var(--foreground)] text-[11px] font-bold tracking-[-.04em] text-[var(--background)]">PF</div>
              {compact ? null : (
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold tracking-[-.02em]">PAPERFLOW</div>
                  <div className="truncate text-[10px] text-[var(--muted)]">Engineering research reader</div>
                </div>
              )}
            </div>
          }
          footer={<p className="text-[10px] leading-4 text-[var(--muted)]">PDFs stay on this device in Phase 1. Originals are never modified.</p>}
        />
      )}

      <main className="min-w-0 flex-1 pb-10">
        <header className="flex flex-wrap items-center gap-3 px-1 pt-1.5">
          <div className="mr-auto min-w-0">
            <h1 className="text-[22px] font-semibold tracking-[-.035em]">Research Library</h1>
            <p className="text-xs text-[var(--muted)]">Paper first. AI second. Evidence always visible.</p>
          </div>
          <SearchField aria-label="Filter library" placeholder="Filter papers, topics…" value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery("")} className="h-9 w-[260px] coarse:h-11" />
          <Button variant="secondary" size="sm" onClick={openCommand} className="h-9 gap-1.5 text-[var(--muted)] coarse:h-11" aria-label="Open command palette">
            <Command className="size-3.5" />
            <span className="flex gap-0.5">
              <Kbd>{mod}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </Button>
          <IconButton label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"} size="sm" variant="secondary" onClick={cycle} className="size-9 coarse:size-11">
            {resolved === "dark" ? <Sun className="size-4" /> : <MoonStar className="size-4" />}
          </IconButton>
          <Button variant="primary" size="sm" onClick={importPdf} disabled={importing} className="h-9 coarse:h-11">
            <FileUp className="size-4" /> {importing ? "Importing…" : "Import PDF"}
          </Button>
        </header>

        <Section title="Continue reading" meta={docs.length ? `${docs.length} on this device` : undefined}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {documents.isPending
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[168px] rounded-[18px]" />)
              : docs.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}
            {papers.slice(0, Math.max(0, 4 - (docs.length % 4))).map((p) => (
              <article key={p.id} className="dd-glass flex min-h-[168px] flex-col rounded-[18px] p-4 shadow-none">
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
                  <span className="truncate">{p.venue} · {p.year}</span>
                  <Badge className="ml-auto shrink-0 px-2 py-0.5 text-[10px]">Sample</Badge>
                </div>
                <h3 className="mt-2 line-clamp-2 text-[13.5px] font-semibold leading-5 tracking-[-.015em]">{p.title}</h3>
                <div className="mt-auto pt-3">
                  <Progress value={p.progress} className="mb-2" />
                  <div className="flex items-center gap-2 whitespace-nowrap text-[11px] text-[var(--muted)]">
                    <span>{p.progress}% read</span>
                    <span aria-hidden>·</span>
                    <span>{p.notes} notes</span>
                    <span aria-hidden>·</span>
                    <span className={cn(p.questions > 0 && "text-violet-600 dark:text-violet-300")}>{p.questions} open</span>
                  </div>
                  <div className="mt-1 text-[10.5px] text-[var(--muted)]">{p.source === "no-pdf" ? "No PDF attached" : "Metadata only"} · DOI not recorded</div>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section title="Research pools" meta="Sample data">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {RESEARCH_POOLS.map((pool) => (
              <article key={pool.id} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                <h3 className="text-[13.5px] font-semibold tracking-[-.015em]">{pool.name}</h3>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">{pool.focus}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {pool.concepts.map((c) => (
                    <span key={c} className="rounded-md bg-black/[.045] px-1.5 py-0.5 text-[10.5px] font-medium dark:bg-white/[.07]">{c}</span>
                  ))}
                </div>
                <div className="mt-3 flex gap-4 border-t border-[var(--line)] pt-2.5 text-[11px] text-[var(--muted)]">
                  <span><b className="font-semibold text-[var(--foreground)]">{pool.papers}</b> papers</span>
                  <span><b className="font-semibold text-[var(--foreground)]">{pool.openQuestions}</b> open questions</span>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <div className="grid gap-x-3 xl:grid-cols-[1.25fr_1fr]">
          <Section title="Evidence signals" meta="Sample data">
            <EvidenceSignals />
          </Section>
          <Section title="All papers" meta={`${archive.length} sample entries · virtualized`}>
            <ArchiveList items={archive} />
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-baseline gap-2 px-1">
        <h2 className="text-[13px] font-semibold tracking-[-.01em]">{title}</h2>
        {meta ? <span className="text-[11px] text-[var(--muted)]">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function DocumentCard({ doc }: { doc: DocumentRecord }) {
  const highlights = useHighlights(doc.id);
  const count = highlights.data?.length ?? 0;
  const progress = doc.pageCount && doc.lastPage ? Math.round((doc.lastPage / doc.pageCount) * 100) : 0;
  return (
    <Link href={`/paperflow/reader/${doc.id}`} className="dd-glass dd-focus group flex min-h-[168px] flex-col rounded-[18px] p-4 shadow-none transition-[border-color,box-shadow] duration-150 hover:border-[var(--accent)]/40">
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
        <span className="truncate">{doc.source === "bundled-sample" ? "Synthetic sample manuscript" : "Imported PDF"}</span>
        <Badge tone={doc.source === "bundled-sample" ? "neutral" : "blue"} className="ml-auto shrink-0 px-2 py-0.5 text-[10px]">
          {doc.source === "bundled-sample" ? "Sample PDF" : "Local PDF"}
        </Badge>
      </div>
      <h3 className="mt-2 line-clamp-2 text-[13.5px] font-semibold leading-5 tracking-[-.015em] group-hover:text-[var(--accent)]">{doc.title}</h3>
      <div className="mt-auto pt-3">
        <Progress value={progress} className="mb-2" />
        <div className="flex items-center gap-2 whitespace-nowrap text-[11px] text-[var(--muted)]">
          <span>{doc.lastPage ? `p. ${doc.lastPage}${doc.pageCount ? ` / ${doc.pageCount}` : ""}` : "Not opened"}</span>
          <span aria-hidden>·</span>
          <span>{count} highlights</span>
        </div>
        <div className="mt-1 text-[10.5px] text-[var(--muted)]">{doc.source === "bundled-sample" ? "Bundled with PAPERFLOW" : "Stored on this device"} · DOI not recorded</div>
      </div>
    </Link>
  );
}

const SIGNAL_META: Record<EvidenceSignalType, { label: string; icon: LucideIcon; className: string }> = {
  contradiction: { label: "Contradiction", icon: AlertTriangle, className: "text-red-600 dark:text-red-300" },
  "new-link": { label: "New evidence link", icon: Link2, className: "text-blue-600 dark:text-blue-300" },
  unresolved: { label: "Unresolved question", icon: HelpCircle, className: "text-violet-600 dark:text-violet-300" },
  "method-overlap": { label: "Method overlap", icon: GitMerge, className: "text-emerald-600 dark:text-emerald-300" },
  "weak-link": { label: "Weak connection", icon: Unlink, className: "text-[var(--muted)]" },
};

function EvidenceSignals() {
  const pools = new Map(RESEARCH_POOLS.map((p) => [p.id, p.name]));
  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--surface-strong)]">
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase tracking-[.1em] text-[var(--muted)]">
          <tr className="border-b border-[var(--line)]">
            <th scope="col" className="px-4 py-2.5 font-semibold">Signal</th>
            <th scope="col" className="px-2 py-2.5 font-semibold">Evidence</th>
            <th scope="col" className="hidden px-2 py-2.5 font-semibold lg:table-cell">Pool</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">Papers</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {EVIDENCE_SIGNALS.map((s) => {
            const meta = SIGNAL_META[s.type];
            const Icon = meta.icon;
            return (
              <tr key={s.id}>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <span className={cn("inline-flex items-center gap-1.5 font-medium", meta.className)}>
                    <Icon className="size-3.5" aria-hidden /> {meta.label}
                  </span>
                </td>
                <td className="px-2 py-3 align-top">
                  <div className="font-medium">{s.summary}</div>
                  <div className="mt-0.5 text-[11px] leading-4 text-[var(--muted)]">{s.detail}</div>
                </td>
                <td className="hidden whitespace-nowrap px-2 py-3 align-top text-[var(--muted)] lg:table-cell">{pools.get(s.poolId)}</td>
                <td className="px-4 py-3 text-right align-top tabular-nums">{s.papers}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ArchiveList({ items }: { items: typeof MOCK_ARCHIVE }) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => parentRef.current, estimateSize: () => 48, overscan: 8 });
  return (
    <div ref={parentRef} role="list" aria-label="All papers" tabIndex={0} className="dd-scrollbar dd-focus h-[318px] overflow-y-auto rounded-[18px] border border-[var(--line)] bg-[var(--surface-strong)]">
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index];
          return (
            <div
              key={item.id}
              role="listitem"
              aria-setsize={items.length}
              aria-posinset={row.index + 1}
              className="absolute inset-x-0 flex items-center gap-3 border-b border-[var(--line)] px-4 text-xs"
              style={{ top: row.start, height: row.size }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{item.title}</div>
                <div className="text-[10.5px] text-[var(--muted)]">{item.topic} · {item.year}</div>
              </div>
              <span className="w-14 text-right text-[11px] tabular-nums text-[var(--muted)]">{item.notes} notes</span>
              <div className="w-16"><Progress value={item.progress} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
