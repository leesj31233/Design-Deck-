"use client";
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface Segment { value: string; label: React.ReactNode; }
export function SegmentedControl({ value, onValueChange, items, className }: { value: string; onValueChange: (value: string) => void; items: Segment[]; className?: string }) {
  const id = React.useId(), reduced = useReducedMotion();
  return <div className={cn("inline-flex rounded-xl border border-[var(--line)] bg-black/[.035] p-1 dark:bg-white/[.055]", className)}>{items.map(item => { const active = item.value === value; return <button type="button" aria-pressed={active} key={item.value} onClick={() => onValueChange(item.value)} className={cn("dd-focus relative h-8 rounded-lg px-3 text-xs font-medium", active ? "text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]")}><span className="relative z-10">{item.label}</span>{active ? <motion.span layoutId={`segment-${id}`} transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }} className="absolute inset-0 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] shadow-sm"/> : null}</button>; })}</div>;
}
