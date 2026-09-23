import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("dd-focus min-h-24 w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3.5 py-3 text-sm leading-6 placeholder:text-[var(--muted)]/75", className)} {...props} />
));
Textarea.displayName = "Textarea";
