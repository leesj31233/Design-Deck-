"use client";
import * as React from "react";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { cn } from "@/lib/utils";

export interface CommandItemDef { id: string; label: string; shortcut?: string; icon?: React.ReactNode; keywords?: string[]; onSelect?: () => void; group?: string; }
export function CommandMenu({ open, onOpenChange, items, placeholder = "Search commands…" }: { open: boolean; onOpenChange: (open: boolean) => void; items: CommandItemDef[]; placeholder?: string }) {
  const groups = [...new Set(items.map(i => i.group || "Commands"))];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="overflow-hidden p-0 sm:w-[600px]"><DialogTitle className="sr-only">Command menu</DialogTitle><Command className="bg-transparent" loop>
    <div className="flex h-12 items-center gap-2 border-b border-[var(--line)] px-4"><Search className="size-4 text-[var(--muted)]"/><Command.Input autoFocus placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]" /></div>
    <Command.List className="dd-scrollbar max-h-[360px] overflow-y-auto p-2"><Command.Empty className="px-3 py-10 text-center text-sm text-[var(--muted)]">No results found.</Command.Empty>{groups.map(group => <Command.Group key={group} heading={group} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[.12em] [&_[cmdk-group-heading]]:text-[var(--muted)]">{items.filter(i => (i.group || "Commands") === group).map(item => <Command.Item key={item.id} value={`${item.label} ${(item.keywords||[]).join(" ")}`} onSelect={() => { item.onSelect?.(); onOpenChange(false); }} className={cn("flex cursor-default select-none items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none data-[selected=true]:bg-black/[.055] dark:data-[selected=true]:bg-white/[.075]")}>{item.icon ? <span className="text-[var(--muted)]">{item.icon}</span> : null}<span className="flex-1">{item.label}</span>{item.shortcut ? <kbd className="rounded-md border border-[var(--line)] bg-black/[.03] px-1.5 py-0.5 text-[10px] text-[var(--muted)] dark:bg-white/[.05]">{item.shortcut}</kbd> : null}</Command.Item>)}</Command.Group>)}</Command.List>
  </Command></DialogContent></Dialog>;
}
