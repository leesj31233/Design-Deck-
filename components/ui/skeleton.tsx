import * as React from "react";
import { cn } from "@/lib/utils";
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("animate-pulse rounded-lg bg-black/[.07] dark:bg-white/[.08]", className)} {...props}/>; }
