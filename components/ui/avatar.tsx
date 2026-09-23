"use client";
import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

export function Avatar({ src, alt, fallback, className }: { src?: string; alt: string; fallback: string; className?: string }) {
  return <AvatarPrimitive.Root className={cn("inline-flex size-9 shrink-0 overflow-hidden rounded-full border border-[var(--line)] bg-black/5 dark:bg-white/10", className)}>
    {src ? <AvatarPrimitive.Image src={src} alt={alt} className="size-full object-cover" /> : null}
    <AvatarPrimitive.Fallback delayMs={200} className="flex size-full items-center justify-center text-xs font-semibold text-[var(--muted)]">{fallback}</AvatarPrimitive.Fallback>
  </AvatarPrimitive.Root>;
}
