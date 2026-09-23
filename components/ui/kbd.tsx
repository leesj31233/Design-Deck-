import * as React from "react";
import { cn } from "@/lib/utils";
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) { return <kbd className={cn("inline-flex min-w-5 items-center justify-center rounded-md border border-[var(--line)] bg-black/[.035] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--muted)] shadow-[inset_0_-1px_0_rgba(0,0,0,.06)] dark:bg-white/[.055]", className)} {...props}/>; }
