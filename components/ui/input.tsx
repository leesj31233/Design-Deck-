import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn("dd-focus h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3.5 text-sm text-[var(--foreground)] shadow-sm placeholder:text-[var(--muted)]/75 disabled:cursor-not-allowed disabled:opacity-50", className)}
    {...props}
  />
));
Input.displayName = "Input";
