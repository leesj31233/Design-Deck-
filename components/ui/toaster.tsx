"use client";
export { toast } from "sonner";
import { Toaster as Sonner } from "sonner";
export function Toaster() { return <Sonner richColors position="bottom-right" toastOptions={{ style: { borderRadius: "14px", border: "1px solid var(--line)", background: "var(--surface-strong)", color: "var(--foreground)", backdropFilter: "blur(20px)" } }} />; }
