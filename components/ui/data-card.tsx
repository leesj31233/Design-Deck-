import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassPanel } from "./glass-panel";

export function DataCard({ label, value, detail, trend, icon, className }: { label: string; value: React.ReactNode; detail?: React.ReactNode; trend?: { value: string; direction: "up" | "down" }; icon?: React.ReactNode; className?: string }) {
  const TrendIcon = trend?.direction === "up" ? ArrowUpRight : ArrowDownRight;
  return <GlassPanel className={cn("p-4", className)}>
    <div className="flex items-start justify-between gap-3"><span className="text-xs font-medium text-[var(--muted)]">{label}</span>{icon ? <span className="text-[var(--muted)]">{icon}</span> : null}</div>
    <div className="mt-3 flex items-end justify-between gap-3"><div><div className="text-2xl font-semibold tracking-[-.035em]">{value}</div>{detail ? <div className="mt-1 text-xs text-[var(--muted)]">{detail}</div> : null}</div>{trend ? <div className={cn("flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold", trend.direction === "up" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-red-500/10 text-red-600 dark:text-red-300")}><TrendIcon className="size-3" />{trend.value}</div> : null}</div>
  </GlassPanel>;
}
