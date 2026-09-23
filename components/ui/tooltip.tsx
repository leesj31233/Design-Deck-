"use client";
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export function Tooltip({ children, content, side = "top", className }: { children: React.ReactNode; content: React.ReactNode; side?: "top"|"right"|"bottom"|"left"; className?: string }) {
  return <TooltipPrimitive.Provider delayDuration={350}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={7} className={cn("z-50 rounded-lg border border-white/10 bg-neutral-950/95 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95", className)}>
          {content}<TooltipPrimitive.Arrow className="fill-neutral-950/95" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>;
}
