"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { modKey } from "./keyboard";

const groups: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "Global",
    items: [
      { keys: ["mod", "K"], label: "Command palette" },
      { keys: ["mod", "O"], label: "Import PDF" },
      { keys: ["?"], label: "Show shortcuts" },
    ],
  },
  {
    title: "Reader",
    items: [
      { keys: ["J"], label: "Next page" },
      { keys: ["K"], label: "Previous page" },
      { keys: ["mod", "+"], label: "Zoom in" },
      { keys: ["mod", "−"], label: "Zoom out" },
      { keys: ["mod", "0"], label: "Fit width" },
      { keys: ["["], label: "Toggle page rail" },
      { keys: ["]"], label: "Toggle inspector" },
      { keys: ["mod", "F"], label: "Search in paper" },
    ],
  },
  {
    title: "Selection",
    items: [
      { keys: ["H"], label: "Highlight selection" },
      { keys: ["1–5"], label: "Highlight with color" },
      { keys: ["←", "→"], label: "Move between actions" },
      { keys: ["Esc"], label: "Dismiss action bar" },
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [mod, setMod] = React.useState("⌘");
  React.useEffect(() => setMod(modKey()), []);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:w-[560px]">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Desktop shortcuts. Single-key shortcuts are ignored while typing.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.title} className={g.title === "Reader" ? "sm:row-span-2" : undefined}>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[.13em] text-[var(--muted)]">{g.title}</h3>
              <dl className="space-y-1">
                {g.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 py-1 text-[13px]">
                    <dt>{item.label}</dt>
                    <dd className="flex gap-1">
                      {item.keys.map((k) => (
                        <Kbd key={k}>{k === "mod" ? mod : k}</Kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
