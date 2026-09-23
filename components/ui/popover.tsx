"use client";
import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;
export const PopoverContent = React.forwardRef<React.ElementRef<typeof PopoverPrimitive.Content>, React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>>(({ className, align="center", sideOffset=8, ...props }, ref) => <PopoverPrimitive.Portal><PopoverPrimitive.Content ref={ref} align={align} sideOffset={sideOffset} className={cn("z-50 w-72 rounded-[16px] border border-[var(--line)] bg-[var(--surface-strong)] p-3 shadow-[var(--shadow-float)] backdrop-blur-2xl outline-none animate-in fade-in zoom-in-95", className)} {...props}/></PopoverPrimitive.Portal>);
PopoverContent.displayName = "PopoverContent";
