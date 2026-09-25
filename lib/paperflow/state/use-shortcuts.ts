"use client";
import { useEffect, useRef } from "react";
export type ShortcutActions = { command: () => void; search: () => void; dismiss: () => void; previous?: () => void; next?: () => void; highlight?: () => void; note?: () => void; translate?: () => void; explain?: () => void };
export function useShortcuts(actions: ShortcutActions, commandOpen: boolean) {
  const latest = useRef(actions); latest.current = actions;
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase(), a = latest.current;
      if ((event.metaKey || event.ctrlKey) && key === "k") { event.preventDefault(); a.command(); return; }
      if (commandOpen) return;
      if (key === "escape") { a.dismiss(); return; }
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable=true],[role=dialog]")) return;
      if ((event.metaKey || event.ctrlKey) && key === "f") { event.preventDefault(); a.search(); return; }
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const action = ({ arrowleft: a.previous, arrowright: a.next, h: a.highlight, n: a.note, t: a.translate, e: a.explain } as Record<string, (() => void) | undefined>)[key];
      if (action) { event.preventDefault(); action(); }
    };
    window.addEventListener("keydown", handle); return () => window.removeEventListener("keydown", handle);
  }, [commandOpen]);
}
