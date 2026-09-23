"use client";
import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Copy, Heart, Loader2, Pause, Play, Plus, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function AnimatedIconButton({ label, active=false, onClick, className }: { label:string; active?:boolean; onClick?:()=>void; className?:string }) {
  const reduced = useReducedMotion();
  return <motion.button whileHover={reduced?undefined:{y:-2,scale:1.04}} whileTap={reduced?undefined:{scale:.94}} onClick={onClick} aria-label={label} aria-pressed={active} className={cn("grid size-11 place-items-center rounded-[14px] border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--muted)] shadow-sm outline-none transition focus-visible:ring-4 focus-visible:ring-[var(--accent)]/12",active&&"bg-[var(--foreground)] text-[var(--background)]",className)}><AnimatePresence mode="wait" initial={false}>{active?<motion.span key="on" initial={reduced?false:{scale:.5,rotate:-25,opacity:0}} animate={{scale:1,rotate:0,opacity:1}} exit={reduced?undefined:{scale:.5,rotate:25,opacity:0}}><Heart className="size-[18px] fill-current"/></motion.span>:<motion.span key="off" initial={reduced?false:{scale:.5,opacity:0}} animate={{scale:1,opacity:1}} exit={reduced?undefined:{scale:.5,opacity:0}}><Heart className="size-[18px]"/></motion.span>}</AnimatePresence></motion.button>;
}

export function MorphActionButton({ done, onClick }: { done:boolean; onClick?:()=>void }) {
  const reduced=useReducedMotion();
  return <motion.button layout onClick={onClick} className={cn("inline-flex h-11 items-center gap-2 overflow-hidden rounded-[14px] px-4 text-sm font-semibold shadow-sm outline-none transition focus-visible:ring-4 focus-visible:ring-[var(--accent)]/12",done?"bg-emerald-500 text-white":"bg-[var(--foreground)] text-[var(--background)]")}><AnimatePresence mode="wait" initial={false}>{done?<motion.span key="done" initial={reduced?false:{x:-12,opacity:0}} animate={{x:0,opacity:1}} exit={reduced?undefined:{x:12,opacity:0}} className="inline-flex items-center gap-2"><Check className="size-4"/>Saved</motion.span>:<motion.span key="save" initial={reduced?false:{x:-12,opacity:0}} animate={{x:0,opacity:1}} exit={reduced?undefined:{x:12,opacity:0}} className="inline-flex items-center gap-2"><Sparkles className="size-4"/>Save insight</motion.span>}</AnimatePresence></motion.button>;
}

export function PlayPauseButton({ playing,onToggle }: {playing:boolean;onToggle?:()=>void}) {
  const reduced=useReducedMotion();
  return <motion.button whileTap={reduced?undefined:{scale:.92}} onClick={onToggle} aria-label={playing?"Pause":"Play"} className="grid size-14 place-items-center rounded-full bg-[var(--foreground)] text-[var(--background)] shadow-[var(--shadow-float)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent)]/15"><AnimatePresence mode="wait" initial={false}>{playing?<motion.span key="pause" initial={reduced?false:{scale:.45,rotate:-60,opacity:0}} animate={{scale:1,rotate:0,opacity:1}} exit={reduced?undefined:{scale:.45,rotate:60,opacity:0}}><Pause className="size-5 fill-current"/></motion.span>:<motion.span key="play" initial={reduced?false:{scale:.45,rotate:-60,opacity:0}} animate={{scale:1,rotate:0,opacity:1}} exit={reduced?undefined:{scale:.45,rotate:60,opacity:0}}><Play className="size-5 fill-current"/></motion.span>}</AnimatePresence></motion.button>;
}

export function AsyncButton({ state,onClick }: {state:"idle"|"loading"|"done"|"error";onClick?:()=>void}) {
  const reduced=useReducedMotion();
  const content={idle:{icon:Plus,text:"Run model"},loading:{icon:Loader2,text:"Running"},done:{icon:Check,text:"Complete"},error:{icon:X,text:"Retry"}}[state];
  const Icon=content.icon;
  return <motion.button layout onClick={onClick} disabled={state==="loading"} className={cn("inline-flex h-11 min-w-32 items-center justify-center gap-2 rounded-[14px] border px-4 text-sm font-semibold shadow-sm outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent)]/12",state==="done"?"border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300":state==="error"?"border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300":"border-[var(--line)] bg-[var(--surface-strong)]")}><AnimatePresence mode="wait" initial={false}><motion.span key={state} initial={reduced?false:{y:8,opacity:0}} animate={{y:0,opacity:1}} exit={reduced?undefined:{y:-8,opacity:0}} className="inline-flex items-center gap-2"><Icon className={cn("size-4",state==="loading"&&"animate-spin")}/>{content.text}</motion.span></AnimatePresence></motion.button>;
}

export function CopyButton({ value }: {value:string}) { const [copied,setCopied]=React.useState(false); return <motion.button whileTap={{scale:.94}} onClick={async()=>{await navigator.clipboard?.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1400)}} className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 text-xs font-medium shadow-sm"><AnimatePresence mode="wait" initial={false}>{copied?<motion.span key="c" initial={{opacity:0,scale:.7}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.7}} className="inline-flex items-center gap-1.5"><Check className="size-3.5"/>Copied</motion.span>:<motion.span key="n" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="inline-flex items-center gap-1.5"><Copy className="size-3.5"/>Copy</motion.span>}</AnimatePresence></motion.button>; }
