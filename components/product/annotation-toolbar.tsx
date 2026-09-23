"use client";
import * as React from "react";
import { Eraser, Highlighter, MessageSquarePlus, MousePointer2, PenLine, Underline } from "lucide-react";
import { ActionBar } from "@/components/ui/action-bar";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type AnnotationTool = "select" | "highlight" | "underline" | "note" | "draw" | "erase";
const tools: { id: AnnotationTool; label: string; icon: React.ElementType }[] = [
  { id:"select", label:"Select", icon:MousePointer2 }, { id:"highlight", label:"Highlight", icon:Highlighter }, { id:"underline", label:"Underline", icon:Underline }, { id:"note", label:"Add note", icon:MessageSquarePlus }, { id:"draw", label:"Draw", icon:PenLine }, { id:"erase", label:"Erase", icon:Eraser }
];
export function AnnotationToolbar({ tool, onToolChange, color="#ffd60a", onColorChange, className }: { tool: AnnotationTool; onToolChange: (tool:AnnotationTool)=>void; color?: string; onColorChange?: (color:string)=>void; className?: string }) {
  const colors = ["#ffd60a","#30d158","#64d2ff","#bf5af2","#ff6482"];
  return <ActionBar label="Annotation tools" className={className}>{tools.map(item=>{ const Icon=item.icon; const active=tool===item.id; return <Tooltip key={item.id} content={item.label}><button onClick={()=>onToolChange(item.id)} aria-pressed={active} className={cn("grid size-9 place-items-center rounded-[11px] text-[var(--muted)] outline-none transition hover:bg-black/[.055] dark:hover:bg-white/[.075]", active && "bg-[var(--foreground)] text-[var(--background)] hover:bg-[var(--foreground)]")}><Icon className="size-4"/></button></Tooltip>})}<span className="mx-1 h-5 w-px bg-[var(--line)]"/><div className="flex items-center gap-1 px-1">{colors.map(c=><button key={c} aria-label={`Annotation color ${c}`} onClick={()=>onColorChange?.(c)} className={cn("size-5 rounded-full border-2 transition hover:scale-110", color===c ? "border-[var(--foreground)]" : "border-transparent")} style={{backgroundColor:c}}/>)}</div></ActionBar>;
}
