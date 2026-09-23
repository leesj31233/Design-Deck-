import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[.01em]", {
  variants: {
    tone: {
      neutral: "border-[var(--line)] bg-black/[.035] text-[var(--muted)] dark:bg-white/[.065]",
      blue: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300",
      green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
      red: "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300",
      violet: "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-300"
    }
  }, defaultVariants: { tone: "neutral" }
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
