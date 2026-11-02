"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface SidebarItem { id: string; label: string; icon: LucideIcon; badge?: string | number; }
export function Sidebar({ items, activeId, onSelect, header, footer, defaultCollapsed = false, className }: { items: SidebarItem[]; activeId?: string; onSelect?: (id: string) => void; header?: React.ReactNode; footer?: React.ReactNode; defaultCollapsed?: boolean; className?: string }) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const pill = React.useId(), reduced = useReducedMotion();
  return <aside className={cn("dd-glass flex h-full min-h-[420px] flex-col rounded-[18px] p-2 transition-[width] duration-300 ease-[var(--ease-out)]", collapsed ? "w-[68px]" : "w-[244px]", className)}>
    <div className={cn("min-h-12 px-2 py-2", collapsed && "flex justify-center")}>{header}</div>
    <nav className="mt-1 flex flex-1 flex-col gap-1">{items.map(item => { const Icon = item.icon; const active = item.id === activeId; return <button key={item.id} onClick={() => onSelect?.(item.id)} title={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined} className={cn("dd-focus relative isolate flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium", active ? "text-[var(--background)]" : "text-[var(--muted)] hover:bg-black/[.05] hover:text-[var(--foreground)] dark:hover:bg-white/[.07]", collapsed && "justify-center px-0")}>{active ? <motion.span layoutId={`sidebar-pill-${pill}`} aria-hidden="true" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 36 }} className="absolute inset-0 -z-10 rounded-xl bg-[var(--foreground)] shadow-sm"/> : null}<Icon className="size-[18px] shrink-0"/>{collapsed ? null : <><span className="min-w-0 flex-1 truncate text-left">{item.label}</span>{item.badge !== undefined ? <span className="rounded-md bg-black/[.06] px-1.5 py-0.5 text-[10px] dark:bg-white/[.08]">{item.badge}</span> : null}</>}</button>; })}</nav>
    {collapsed ? null : <div className="border-t border-[var(--line)] p-2">{footer}</div>}
    <button onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="dd-focus mt-1 flex h-9 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-black/[.05] dark:hover:bg-white/[.07]">{collapsed ? <ChevronRight className="size-4"/> : <ChevronLeft className="size-4"/>}</button>
  </aside>;
}
