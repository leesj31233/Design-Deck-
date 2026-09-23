import * as React from "react";
import { cn } from "@/lib/utils";

export function GlassPanel({ className, children, elevated = false, ...props }: React.HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return <div className={cn("dd-glass rounded-[var(--radius)]", elevated && "shadow-[var(--shadow-float)]", className)} {...props}>{children}</div>;
}
