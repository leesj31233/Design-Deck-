"use client";
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** The selected value and a per-instance id, so the active tab's indicator can glide between triggers. */
const TabsState = React.createContext<{ value?: string; id: string }>({ id: "" });

export const Tabs = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Root>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>>(({ value, defaultValue, onValueChange, ...props }, ref) => {
  const [own, setOwn] = React.useState(defaultValue), id = React.useId();
  const current = value ?? own;
  return <TabsState.Provider value={{ value: current, id }}>
    <TabsPrimitive.Root ref={ref} value={value} defaultValue={defaultValue} onValueChange={next => { setOwn(next); onValueChange?.(next); }} {...props}/>
  </TabsState.Provider>;
});
Tabs.displayName = "Tabs";
export const TabsContent = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(({ className, ...props }, ref) => <TabsPrimitive.Content ref={ref} className={cn("mt-3 outline-none data-[state=active]:animate-[dd-rise_.28s_var(--ease-out)]", className)} {...props} />);
TabsContent.displayName = "TabsContent";
export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(({ className, ...props }, ref) => <TabsPrimitive.List ref={ref} className={cn("inline-flex h-9 items-center gap-1 rounded-xl border border-[var(--line)] bg-black/[.035] p-1 dark:bg-white/[.055]", className)} {...props} />);
TabsList.displayName = "TabsList";
export const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(({ className, children, value, ...props }, ref) => {
  const state = React.useContext(TabsState), reduced = useReducedMotion(), active = state.value === value;
  return <TabsPrimitive.Trigger ref={ref} value={value} className={cn("dd-focus relative isolate h-7 rounded-lg px-3 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] data-[state=active]:text-[var(--foreground)]", className)} {...props}>
    {active ? <motion.span layoutId={`tab-pill-${state.id}`} aria-hidden="true" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }} className="absolute inset-0 -z-10 rounded-lg bg-[var(--surface-strong)] shadow-sm"/> : null}
    {children}
  </TabsPrimitive.Trigger>;
});
TabsTrigger.displayName = "TabsTrigger";
