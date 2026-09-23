"use client";
import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

export interface DockItem { id: string; label: string; icon: React.ReactNode; onClick?: () => void; active?: boolean; }
export function Dock({ items, className }: { items: DockItem[]; className?: string }) {
  return <div className={cn("dd-glass inline-flex items-end gap-1 rounded-[18px] p-1.5 shadow-[var(--shadow-float)]", className)}>{items.map(item => <Tooltip key={item.id} content={item.label}><motion.button whileHover={{ y: -4, scale: 1.08 }} whileTap={{ scale: .94 }} onClick={item.onClick} aria-label={item.label} className={cn("relative grid size-11 place-items-center rounded-[13px] text-[var(--muted)] outline-none transition hover:bg-black/[.06] hover:text-[var(--foreground)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/12 dark:hover:bg-white/[.08]", item.active && "bg-[var(--foreground)] text-[var(--background)] hover:bg-[var(--foreground)] hover:text-[var(--background)]")}>{item.icon}{item.active ? <span className="absolute -bottom-1 h-1 w-1 rounded-full bg-current"/> : null}</motion.button></Tooltip>)}</div>;
}
