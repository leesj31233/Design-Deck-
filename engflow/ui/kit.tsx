"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Button } from "@/components/ui/button";
import type { Cefr, MasteryStatus } from "../core/types";
import { STATUS_LABEL_KO } from "../core/mastery";

export { cn };
// EngFlow is built on Design Deck: these are the deck's own primitives and effects, re-exported for the product.
export { Button, buttonVariants } from "@/components/ui/button";
export { IconButton } from "@/components/ui/icon-button";
export { Badge } from "@/components/ui/badge";
export { GlassPanel } from "@/components/ui/glass-panel";
export { Progress } from "@/components/ui/progress";
export { SegmentedControl } from "@/components/ui/segmented-control";
export { EmptyState } from "@/components/ui/empty-state";
export { Skeleton } from "@/components/ui/skeleton";
export { Tooltip } from "@/components/ui/tooltip";
export { Kbd } from "@/components/ui/kbd";
export { NumberTicker, ShimmerText, Reveal, RevealGroup, RevealItem, Pressable, Spotlight, BorderBeam, LiveDot } from "@/components/motion/effects";

/* ───────────── Hooks ───────────── */

export function useMediaQuery(q: string): boolean {
  const [m, setM] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

export function useReduced(): boolean {
  const sys = useReducedMotion();
  const [forced, setForced] = React.useState(false);
  React.useEffect(() => {
    const check = () => setForced(document.documentElement.classList.contains("ef-reduce-motion"));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return !!sys || forced;
}

/** Animated number for score reveals (skips animation with reduced motion). */
export function useCountUp(target: number, ms = 700, delay = 0): number {
  const reduced = useReduced();
  const [v, setV] = React.useState(reduced ? target : 0);
  React.useEffect(() => {
    if (reduced) {
      setV(target);
      return;
    }
    let raf = 0;
    const start = performance.now() + delay;
    const from = 0;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / ms));
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay, reduced]);
  return v;
}

/* ───────────── Formatting ───────────── */

export function scoreTone(score: number): "ok" | "warn" | "bad" {
  return score >= 85 ? "ok" : score >= 65 ? "warn" : "bad";
}

export const TONE_TEXT = { ok: "text-[var(--ef-ok)]", warn: "text-[var(--ef-warn)]", bad: "text-[var(--ef-bad)]" } as const;
export const TONE_FILL = { ok: "var(--ef-ok-fill)", warn: "var(--ef-warn-fill)", bad: "var(--ef-bad-fill)" } as const;

export function relTimeKo(ts: number, now: number): string {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  const h = Math.round(abs / 3600000);
  const d = Math.round(abs / 86400000);
  const unit = abs < 3600000 ? `${Math.max(1, m)}분` : abs < 86400000 ? `${h}시간` : `${d}일`;
  if (abs < 60000) return "지금";
  return diff > 0 ? `${unit} 뒤` : `${unit} 전`;
}

export function dateKo(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/* ───────────── Score ring ───────────── */

export function ScoreRing({ score, size = 88, stroke = 8, label, delay = 0 }: { score: number; size?: number; stroke?: number; label?: string; delay?: number }) {
  const v = useCountUp(score, 800, delay);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "점수"} ${score}점`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ef-track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE_FILL[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="ef-num text-[26px] font-semibold leading-none tracking-[-.04em]" style={{ fontSize: size * 0.3 }}>{v}</div>
          {label ? <div className="mt-1 text-[10px] font-medium text-[var(--muted)]">{label}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** Neutral progress ring (accent), for goals rather than quality scores. */
export function ProgressRing({ value, size = 76, stroke = 7, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const v = useCountUp(Math.round(Math.min(100, Math.max(0, value))), 700);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "진행"} ${Math.round(value)}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ef-track)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="ef-num font-semibold leading-none tracking-[-.03em]" style={{ fontSize: size * 0.26 }}>{v}%</div>
          {label ? <div className="mt-1 text-[10px] font-medium text-[var(--muted)]">{label}</div> : null}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Meter ───────────── */

export function Meter({ label, value, weight, note, delay = 0, compact }: { label: string; value: number; weight?: string; note?: string; delay?: number; compact?: boolean }) {
  const v = useCountUp(value, 700, delay);
  const tone = scoreTone(value);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">
          {label}
          {weight ? <span className="ml-1.5 text-[11px] font-normal text-[var(--muted)]">{weight}</span> : null}
        </span>
        <span className={cn("ef-num text-[13px] font-semibold", TONE_TEXT[tone])}>{v}</span>
      </div>
      <div className={cn("mt-1.5 overflow-hidden rounded-full bg-[var(--ef-track)]", compact ? "h-1" : "h-1.5")}>
        <div className="h-full rounded-full" style={{ width: `${v}%`, background: TONE_FILL[tone] }} />
      </div>
      {note && !compact ? <p className="ef-ko mt-1.5 text-[12px] leading-5 text-[var(--muted)]">{note}</p> : null}
    </div>
  );
}

/* ───────────── Chips ───────────── */

const STATUS_STYLE: Record<MasteryStatus, string> = {
  new: "border-[var(--line)] text-[var(--muted)] bg-transparent",
  learning: "border-transparent bg-[var(--ef-bad-soft)] text-[var(--ef-bad)]",
  improving: "border-transparent bg-[var(--ef-warn-soft)] text-[var(--ef-warn)]",
  mastered: "border-transparent bg-[var(--ef-ok-soft)] text-[var(--ef-ok)]",
};

export function StatusChip({ status, className }: { status: MasteryStatus; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[status], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABEL_KO[status]}
    </span>
  );
}

/** Learning → Improving → Mastered progression track. */
export function MasteryTrack({ status, mastery }: { status: MasteryStatus; mastery: number }) {
  const steps: MasteryStatus[] = ["learning", "improving", "mastered"];
  const idx = status === "new" ? -1 : steps.indexOf(status);
  return (
    <div className="flex items-center gap-1" aria-label={`숙련도 ${Math.round(mastery * 100)}% · ${STATUS_LABEL_KO[status]}`}>
      {steps.map((s, i) => (
        <div key={s} className="flex-1">
          <div className={cn("h-1 rounded-full transition-colors duration-500", i <= idx ? (s === "mastered" ? "bg-[var(--ef-ok-fill)]" : s === "improving" ? "bg-[var(--ef-warn-fill)]" : "bg-[var(--ef-bad-fill)]") : "bg-[var(--ef-track)]")} />
          <div className={cn("mt-1 text-[10px]", i === idx ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted)]")}>{STATUS_LABEL_KO[s]}</div>
        </div>
      ))}
    </div>
  );
}

export function LevelBadge({ level, className }: { level: Cefr | string; className?: string }) {
  return <span className={cn("ef-mono inline-flex items-center rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-1.5 py-0.5 text-[11px] font-semibold", className)}>{level}</span>;
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]", className)}>{children}</div>;
}

/** A Design Deck glass panel tuned for long reading: a quieter shadow than the deck default. */
export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <GlassPanel className={cn("ef-card", className)} {...props}>
      {children}
    </GlassPanel>
  );
}

/* ───────────── Sheet: bottom sheet on phones, side panel on large screens ───────────── */

export function Sheet({ open, onOpenChange, title, description, children, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; wide?: boolean }) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const reduced = useReduced();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
              <motion.div
                className={cn(
                  "ef-root fixed z-50 flex flex-col overflow-hidden border border-[var(--line)] bg-[var(--surface-strong)] shadow-[var(--shadow-float)] outline-none backdrop-blur-2xl",
                  desktop
                    ? cn("right-3 top-3 bottom-3 rounded-[22px]", wide ? "w-[min(640px,calc(100vw-24px))]" : "w-[min(520px,calc(100vw-24px))]")
                    : "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[22px] pb-[env(safe-area-inset-bottom,0px)]",
                )}
                initial={reduced ? { opacity: 0 } : desktop ? { x: 40, opacity: 0 } : { y: "100%" }}
                animate={reduced ? { opacity: 1 } : desktop ? { x: 0, opacity: 1 } : { y: 0 }}
                exit={reduced ? { opacity: 0 } : desktop ? { x: 40, opacity: 0 } : { y: "100%" }}
                transition={{ type: "tween", ease: [0.2, 0.8, 0.2, 1], duration: reduced ? 0.12 : 0.26 }}
              >
                {!desktop ? <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--ef-track)]" aria-hidden /> : null}
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--line)] px-5 pb-3 pt-3 lg:pt-5">
                  <div className="min-w-0">
                    <DialogPrimitive.Title className="text-[17px] font-semibold tracking-[-.02em]">{title}</DialogPrimitive.Title>
                    {description ? <DialogPrimitive.Description className="ef-ko mt-0.5 text-[13px] text-[var(--muted)]">{description}</DialogPrimitive.Description> : null}
                  </div>
                  <DialogPrimitive.Close className="dd-focus -mr-1 grid size-9 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/10" aria-label="닫기">
                    <X className="size-4" />
                  </DialogPrimitive.Close>
                </div>
                <div className="dd-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

/** In-page confirmation (the artifact viewer blocks window.confirm). */
export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, danger, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="ef-root fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border border-[var(--line)] bg-[var(--surface-strong)] p-5 shadow-[var(--shadow-float)] outline-none">
          <DialogPrimitive.Title className="text-[17px] font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="ef-ko mt-2 text-[14px] text-[var(--ef-ink-2)]">{body}</DialogPrimitive.Description>
          <div className="mt-5 flex justify-end gap-2">
            <DialogPrimitive.Close asChild>
              <Button variant="secondary" size="lg">취소</Button>
            </DialogPrimitive.Close>
            <Button
              variant={danger ? "danger" : "primary"}
              size="lg"
              className="font-semibold"
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
