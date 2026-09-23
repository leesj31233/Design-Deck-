"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight, Download, Highlighter, Maximize2, Minus, Plus, RotateCw, Search, SidebarOpen } from "lucide-react";
import { ActionBar } from "@/components/ui/action-bar";
import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export function PDFToolbar({ page, pages, zoom, onPageChange, onZoomChange, onRotate, onSearch, onToggleSidebar, onAnnotate, onFit, onDownload, className }: { page: number; pages: number; zoom: number; onPageChange?: (page:number)=>void; onZoomChange?: (zoom:number)=>void; onRotate?:()=>void; onSearch?:()=>void; onToggleSidebar?:()=>void; onAnnotate?:()=>void; onFit?:()=>void; onDownload?:()=>void; className?: string }) {
  return <ActionBar label="PDF controls" className={cn("gap-0.5", className)}>
    <IconButton label="Toggle document sidebar" size="sm" variant="ghost" onClick={onToggleSidebar}><SidebarOpen className="size-4"/></IconButton>
    <span className="mx-1 h-5 w-px bg-[var(--line)]"/>
    <IconButton label="Previous page" size="sm" variant="ghost" disabled={page<=1} onClick={()=>onPageChange?.(Math.max(1,page-1))}><ChevronLeft className="size-4"/></IconButton>
    <div className="flex h-8 min-w-20 items-center justify-center gap-1 rounded-lg px-1.5 text-xs"><span className="font-semibold">{page}</span><span className="text-[var(--muted)]">/ {pages}</span></div>
    <IconButton label="Next page" size="sm" variant="ghost" disabled={page>=pages} onClick={()=>onPageChange?.(Math.min(pages,page+1))}><ChevronRight className="size-4"/></IconButton>
    <span className="mx-1 h-5 w-px bg-[var(--line)]"/>
    <IconButton label="Zoom out" size="sm" variant="ghost" onClick={()=>onZoomChange?.(Math.max(25,zoom-10))}><Minus className="size-4"/></IconButton><span className="min-w-12 text-center text-[11px] font-medium tabular-nums">{zoom}%</span><IconButton label="Zoom in" size="sm" variant="ghost" onClick={()=>onZoomChange?.(Math.min(400,zoom+10))}><Plus className="size-4"/></IconButton>
    <IconButton label="Fit page" size="sm" variant="ghost" onClick={onFit}><Maximize2 className="size-4"/></IconButton><IconButton label="Rotate clockwise" size="sm" variant="ghost" onClick={onRotate}><RotateCw className="size-4"/></IconButton>
    <span className="mx-1 h-5 w-px bg-[var(--line)]"/>
    <IconButton label="Search document" size="sm" variant="ghost" onClick={onSearch}><Search className="size-4"/></IconButton><IconButton label="Annotate" size="sm" variant="ghost" onClick={onAnnotate}><Highlighter className="size-4"/></IconButton><IconButton label="Download PDF" size="sm" variant="ghost" onClick={onDownload}><Download className="size-4"/></IconButton>
    <span className="ml-1 hidden items-center gap-1 px-1 text-[9px] text-[var(--muted)] xl:flex"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
  </ActionBar>;
}
