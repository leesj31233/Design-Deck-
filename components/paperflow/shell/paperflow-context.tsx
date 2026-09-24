"use client";
import { createContext, useContext } from "react";
import type { ShortcutActions } from "@/lib/paperflow/state/use-shortcuts";
export type ReaderCommands = Partial<Omit<ShortcutActions, "command" | "dismiss">> & { fitWidth?: () => void; fitPage?: () => void; toggleInspector?: () => void };
export type PaperflowContextValue = {
  openImport: () => void; importFiles: (files: File[]) => Promise<void>; importing: boolean;
  openCommand: () => void; toggleTheme: () => void; dark: boolean; notify: (message: string) => void;
  registerReader: (commands: ReaderCommands | null) => void;
};
export const PaperflowContext = createContext<PaperflowContextValue | null>(null);
export function usePaperflow() { const context = useContext(PaperflowContext); if (!context) throw new Error("PaperflowProvider is required"); return context; }
