"use client";
import * as React from "react";
import { ArrowUp, Bot, FileText, Loader2, Paperclip, Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass-panel";

export interface AIChatMessage {
  id: string;
  role: "user" | "assistant";
  content: React.ReactNode;
  timestamp?: string;
  sources?: { id: string; label: string }[];
}

export function AIChat({ messages, onSend, onAttach, loading=false, placeholder="Ask about this paper…", title="Research Assistant", className }: { messages: AIChatMessage[]; onSend?: (text: string) => void | Promise<void>; onAttach?: () => void; loading?: boolean; placeholder?: string; title?: string; className?: string }) {
  const [draft, setDraft] = React.useState("");
  const viewportRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length, loading]);
  const submit = () => { const text = draft.trim(); if (!text || loading) return; onSend?.(text); setDraft(""); };
  return <GlassPanel className={cn("flex min-h-[520px] flex-col overflow-hidden", className)}>
    <header className="flex h-14 items-center justify-between border-b border-[var(--line)] px-4"><div className="flex items-center gap-2.5"><div className="grid size-8 place-items-center rounded-xl bg-[var(--foreground)] text-[var(--background)]"><Sparkles className="size-4"/></div><div><div className="text-sm font-semibold tracking-[-.02em]">{title}</div><div className="text-[10px] text-[var(--muted)]">Context-aware · paper grounded</div></div></div><div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300"><span className="size-1.5 rounded-full bg-current"/>Ready</div></header>
    <div ref={viewportRef} className="dd-scrollbar flex-1 space-y-5 overflow-y-auto px-4 py-5">{messages.length === 0 ? <div className="flex h-full min-h-60 flex-col items-center justify-center text-center"><div className="grid size-12 place-items-center rounded-2xl bg-black/[.045] text-[var(--muted)] dark:bg-white/[.065]"><Bot className="size-5"/></div><div className="mt-4 text-sm font-semibold">Understand the paper, not just the words.</div><p className="mt-1 max-w-xs text-xs leading-5 text-[var(--muted)]">Ask for equations, assumptions, domain background, or a concise explanation of the selected passage.</p></div> : messages.map(message => <div key={message.id} className={cn("flex gap-3", message.role === "user" && "flex-row-reverse")}><div className={cn("grid size-7 shrink-0 place-items-center rounded-lg", message.role === "assistant" ? "bg-[var(--foreground)] text-[var(--background)]" : "bg-black/[.055] text-[var(--muted)] dark:bg-white/[.08]")}>{message.role === "assistant" ? <Sparkles className="size-3.5"/> : <User className="size-3.5"/>}</div><div className={cn("max-w-[82%]", message.role === "user" && "text-right")}><div className={cn("inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm leading-6", message.role === "assistant" ? "bg-black/[.045] dark:bg-white/[.06]" : "bg-[var(--foreground)] text-[var(--background)]")}>{message.content}</div>{message.sources?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{message.sources.map(source => <span key={source.id} className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-[10px] text-[var(--muted)]"><FileText className="size-3"/>{source.label}</span>)}</div> : null}{message.timestamp ? <div className="mt-1 text-[10px] text-[var(--muted)]/70">{message.timestamp}</div> : null}</div></div>)}{loading ? <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Loader2 className="size-3.5 animate-spin"/>Thinking with document context…</div> : null}</div>
    <div className="border-t border-[var(--line)] p-3"><div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-strong)] p-2 shadow-sm focus-within:border-[var(--accent)]/50 focus-within:ring-4 focus-within:ring-[var(--accent)]/10"><textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{ if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); submit(); }}} placeholder={placeholder} rows={2} className="w-full resize-none bg-transparent px-1.5 py-1 text-sm leading-5 outline-none placeholder:text-[var(--muted)]/70"/><div className="mt-1 flex items-center justify-between"><Button type="button" size="sm" variant="ghost" onClick={onAttach} aria-label="Attach context"><Paperclip className="size-3.5"/>Attach</Button><Button type="button" size="sm" variant="accent" onClick={submit} disabled={!draft.trim() || loading}><ArrowUp className="size-3.5"/>Send</Button></div></div><div className="mt-1.5 px-1 text-[9px] text-[var(--muted)]/70">Enter to send · Shift+Enter for a new line</div></div>
  </GlassPanel>;
}
