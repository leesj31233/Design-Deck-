import * as React from "react";
import { cn } from "@/lib/utils";
export function ActionBar({ children, className, label = "Actions" }: { children: React.ReactNode; className?: string; label?: string }) { return <div role="toolbar" aria-label={label} className={cn("dd-glass inline-flex items-center gap-1 rounded-[16px] p-1.5 shadow-[var(--shadow-float)]", className)}>{children}</div>; }
