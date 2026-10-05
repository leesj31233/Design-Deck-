"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, GitCompareArrows, Highlighter, Languages, NotebookPen, Search, Sigma, Sparkles } from "lucide-react";
import { ActionBar } from "@/components/ui/action-bar";
import { cn } from "@/lib/utils";
import { record } from "@/lib/paperflow/perf";
import { useReaderStore, type PendingSelection } from "@/lib/paperflow/state/reader-store";
import { HIGHLIGHT_COLORS, type HighlightColorId, type SelectionAction } from "@/lib/paperflow/types";

const ACTIONS: { id: SelectionAction; label: string; icon: React.ElementType; showLabel?: boolean }[] = [
  { id: "translate", label: "Translate", icon: Languages, showLabel: true },
  { id: "explain", label: "Explain", icon: Sparkles, showLabel: true },
  { id: "note", label: "Note", icon: NotebookPen },
  { id: "search-papers", label: "Search papers", icon: Search },
  { id: "formula", label: "Formula", icon: Sigma },
  { id: "compare", label: "Compare", icon: GitCompareArrows },
  { id: "copy-citation", label: "Copy citation", icon: Copy },
];

const GAP = 10;

export function SelectionActionBar({
  onHighlight,
  onAction,
  copied,
}: {
  onHighlight: (selection: PendingSelection, color: HighlightColorId) => void;
  onAction: (selection: PendingSelection, action: SelectionAction) => void;
  copied: boolean;
}) {
  const selection = useReaderStore((s) => s.selection);
  return <AnimatePresence>{selection ? <Bar key={selection.createdAt} selection={selection} onHighlight={onHighlight} onAction={onAction} copied={copied} /> : null}</AnimatePresence>;
}

function Bar({
  selection,
  onHighlight,
  onAction,
  copied,
}: {
  selection: PendingSelection;
  onHighlight: (selection: PendingSelection, color: HighlightColorId) => void;
  onAction: (selection: PendingSelection, action: SelectionAction) => void;
  copied: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = React.useState<{ top: number; left: number; flipped: boolean } | null>(null);
  const [color, setColor] = React.useState<HighlightColorId>("yellow");

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const bounds = document.getElementById("pf-reader-viewport")?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const { width, height } = el.getBoundingClientRect();
    const r = selection.clientRect;
    // Prefer above the selection; flip below when it would collide with the chrome.
    let top = r.top - height - GAP;
    let flipped = false;
    if (top < bounds.top + 8) {
      top = r.bottom + GAP;
      flipped = true;
    }
    top = Math.min(top, bounds.bottom - height - 8);
    const center = (r.left + r.right) / 2;
    const left = Math.max(bounds.left + 8, Math.min(center - width / 2, bounds.right - width - 8));
    setPlacement({ top, left, flipped });
    const raf = requestAnimationFrame(() => record("selection-bar", performance.now() - selection.createdAt));
    return () => cancelAnimationFrame(raf);
  }, [selection]);

  // Roving focus between toolbar buttons (WAI-ARIA toolbar pattern).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % buttons.length;
    if (e.key === "ArrowLeft") next = (index - 1 + buttons.length) % buttons.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = buttons.length - 1;
    buttons[next]?.focus();
    e.preventDefault();
  };

  const button = "dd-focus inline-flex h-9 items-center gap-1.5 rounded-[11px] px-2.5 text-[12px] font-medium text-[var(--foreground)] transition-colors duration-150 hover:bg-black/[.055] dark:hover:bg-white/[.075] coarse:h-11 coarse:min-w-11";

  return (
    <motion.div
      ref={ref}
      id="pf-selection-bar"
      className="fixed z-40"
      style={{ top: placement?.top ?? -9999, left: placement?.left ?? -9999, visibility: placement ? "visible" : "hidden" }}
      initial={{ opacity: 0, y: placement?.flipped ? -4 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
      onMouseDown={(e) => e.preventDefault() /* keep the text selection while clicking */}
      onKeyDown={onKeyDown}
    >
      {/* Opaque surface, no blur: the bar floats over paper text and the PDF is never blurred. */}
      <ActionBar label="Selection actions" className="gap-0.5 bg-[var(--background)] p-1 backdrop-blur-none">
        <button type="button" data-action="highlight" className={cn(button, "pr-2")} onClick={() => onHighlight(selection, color)} aria-keyshortcuts="H" title="Highlight (H)">
          <Highlighter className="size-4" />
          <span>Highlight</span>
        </button>
        <div role="radiogroup" aria-label="Highlight color" className="flex items-center gap-0.5 pr-1">
          {HIGHLIGHT_COLORS.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={color === c.id}
              aria-label={`${c.name} (${i + 1})`}
              title={`${c.name} · ${i + 1}`}
              tabIndex={-1}
              onClick={() => {
                setColor(c.id);
                onHighlight(selection, c.id);
              }}
              className="dd-focus grid size-7 place-items-center rounded-full coarse:size-11"
            >
              <span className={cn("block size-3.5 rounded-full ring-offset-1 ring-offset-[var(--surface-strong)]", color === c.id && "ring-2 ring-[var(--foreground)]/70")} style={{ background: c.swatch }} />
            </button>
          ))}
        </div>
        <span className="mx-0.5 h-5 w-px bg-[var(--line)]" aria-hidden />
        {ACTIONS.map((a) => {
          const isCopy = a.id === "copy-citation";
          const Icon = isCopy && copied ? Check : a.icon;
          return (
            <button key={a.id} type="button" data-action={a.id} className={cn(button, !a.showLabel && "w-9 justify-center px-0")} aria-label={a.label} title={a.label} onClick={() => onAction(selection, a.id)}>
              <motion.span key={isCopy && copied ? "done" : "idle"} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.14 }} className="grid place-items-center">
                <Icon className={cn("size-4", isCopy && copied && "text-[var(--success)]")} />
              </motion.span>
              {a.showLabel ? <span>{a.label}</span> : null}
            </button>
          );
        })}
      </ActionBar>
    </motion.div>
  );
}

export const ACTION_LABELS: Record<SelectionAction, string> = Object.fromEntries(ACTIONS.map((a) => [a.id, a.label])) as Record<SelectionAction, string>;
export const ACTION_ICONS: Record<SelectionAction, React.ElementType> = Object.fromEntries(ACTIONS.map((a) => [a.id, a.icon])) as Record<SelectionAction, React.ElementType>;
