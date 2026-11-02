import { create } from "zustand";
import type { AskOptions } from "./ask";

/** The 질문 window: open or not, wide or not, the passage it asks about, and a question waiting to be sent. */
interface DockState {
  open: boolean; wide: boolean;
  focus: { text: string; page: number } | null;
  /** A question to send as soon as the window opens (from the selection bar, a follow-up chip). */
  pending: string | null;
  options: AskOptions;
  set: (patch: Partial<Omit<DockState, "set" | "ask">>) => void;
  /** Open the window about a passage, optionally sending a question right away. */
  ask: (focus: { text: string; page: number } | null, question?: string) => void;
}

const remembered = (): Pick<DockState, "open" | "wide" | "options"> => {
  try {
    const saved = JSON.parse(localStorage.getItem("pf-ask-dock") ?? "{}");
    return { open: saved.open === true, wide: saved.wide === true, options: { speed: saved.options?.speed === "deep" ? "deep" : "fast", web: saved.options?.web === true, literature: saved.options?.literature === true } };
  } catch { return { open: false, wide: false, options: { speed: "fast", web: false, literature: false } }; }
};

export const useAskDock = create<DockState>((set, get) => ({
  open: false, wide: false, focus: null, pending: null, options: { speed: "fast", web: false, literature: false },
  set: patch => {
    set(patch);
    const { open, wide, options } = get();
    try { localStorage.setItem("pf-ask-dock", JSON.stringify({ open, wide, options })); } catch { /* remembered for this visit only */ }
  },
  ask: (focus, question) => get().set({ open: true, focus, pending: question ?? null })
}));

/** Load the remembered window state once the browser is ready (not during server rendering). */
export function restoreAskDock() { useAskDock.setState(remembered()); }
