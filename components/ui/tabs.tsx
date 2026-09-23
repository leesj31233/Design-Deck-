"use client";
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(({ className, ...props }, ref) => <TabsPrimitive.Content ref={ref} className={cn("mt-3 outline-none", className)} {...props} />);
TabsContent.displayName = "TabsContent";
export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(({ className, ...props }, ref) => <TabsPrimitive.List ref={ref} className={cn("inline-flex h-9 items-center gap-1 rounded-xl border border-[var(--line)] bg-black/[.035] p-1 dark:bg-white/[.055]", className)} {...props} />);
TabsList.displayName = "TabsList";
export const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(({ className, ...props }, ref) => <TabsPrimitive.Trigger ref={ref} className={cn("dd-focus h-7 rounded-lg px-3 text-xs font-medium text-[var(--muted)] transition data-[state=active]:bg-[var(--surface-strong)] data-[state=active]:text-[var(--foreground)] data-[state=active]:shadow-sm", className)} {...props} />);
TabsTrigger.displayName = "TabsTrigger";
