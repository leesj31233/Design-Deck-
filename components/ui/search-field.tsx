import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  onClear?: () => void;
}

export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(({ className, value, onClear, ...props }, ref) => (
  <label className={cn("dd-focus flex h-10 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 shadow-sm focus-within:border-[var(--accent)]/60 focus-within:ring-4 focus-within:ring-[var(--accent)]/10", className)}>
    <Search className="size-4 shrink-0 text-[var(--muted)]" />
    <input ref={ref} type="search" value={value} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]/75" {...props} />
    {value && onClear ? <button type="button" onClick={onClear} aria-label="Clear search" className="rounded-md p-1 text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/10"><X className="size-3.5" /></button> : null}
  </label>
));
SearchField.displayName = "SearchField";
