"use client";
import { useEffect, useMemo, useState } from "react";
import { Languages } from "lucide-react";
import { useTranslationStore } from "@/lib/paperflow/translation/translation-store";

type Box = { x: number; y: number; width: number; height: number };
type Target = { kind: "table"; key: string; box: Box; units: string[] } | { kind: "heading"; key: string; box: Box; units: string[] };

const inside = (x: number, y: number, box: Box, pad = 0) => x >= box.x - pad && x <= box.x + box.width + pad && y >= box.y - pad && y <= box.y + box.height + pad;

/**
 * Headings and tables are translated on request. Pointing at a table (or its "Table n" caption) lifts a
 * rounded frame around it with a 번역 chip; pointing at a heading shows the chip at its end. The chip
 * translates exactly that table's cells or that heading; translated, it switches original ↔ Korean.
 */
export function ManualTargets({ pageIndex, surface, onTranslate }: { pageIndex: number; surface: React.RefObject<HTMLDivElement | null>; onTranslate: (unitIds: string[]) => void }) {
  const manifest = useTranslationStore(state => state.manifest), texts = useTranslationStore(state => state.texts), hidden = useTranslationStore(state => state.hidden), pending = useTranslationStore(state => state.pending);
  const targets = useMemo<Target[]>(() => {
    if (!manifest) return [];
    const blocks = manifest.blocks.filter(block => block.pageIndex === pageIndex);
    const unitOf = new Map(manifest.units.map(unit => [unit.id, unit]));
    const tables: Target[] = (manifest.pages[pageIndex]?.tables ?? []).map((table, index) => {
      const cells = blocks.filter(block => block.role === "TABLE" && block.translatable && block.unitId && block.x + block.width / 2 > table.x && block.x + block.width / 2 < table.x + table.width && block.y + block.height / 2 > table.y && block.y + block.height / 2 < table.y + table.height);
      const caption = blocks.find(block => block.role === "CAPTION" && /^(?:table|tabel|tabla|tab(?:elle)?\.?|표|表)\s*[\dA-Z]/i.test(block.text.trim()) && Math.min(Math.abs(block.y + block.height - table.y), Math.abs(block.y - table.y - table.height)) < .06);
      const box = caption ? { x: Math.min(table.x, caption.x), y: Math.min(table.y, caption.y), width: Math.max(table.x + table.width, caption.x + caption.width) - Math.min(table.x, caption.x), height: Math.max(table.y + table.height, caption.y + caption.height) - Math.min(table.y, caption.y) } : table;
      return { kind: "table" as const, key: `t${index}`, box, units: [...new Set(cells.map(cell => cell.unitId!))] };
    }).filter(target => target.units.length);
    const headings: Target[] = blocks.filter(block => block.role === "HEADING" && block.unitId && unitOf.get(block.unitId)?.manual)
      .map(block => ({ kind: "heading" as const, key: block.id, box: { x: block.x, y: block.y, width: block.width, height: block.height }, units: [block.unitId!] }));
    return [...tables, ...headings];
  }, [manifest, pageIndex]);
  const [active, setActive] = useState<Target | null>(null);
  useEffect(() => {
    const element = surface.current;
    if (!element || !targets.length) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      // Moving onto the chip keeps its target.
      if (event.target instanceof Element && event.target.closest(".pf-manual-chip")) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = element.getBoundingClientRect(), x = (event.clientX - bounds.left) / bounds.width, y = (event.clientY - bounds.top) / bounds.height;
        const hit = targets.find(target => target.kind === "heading" && inside(x, y, target.box, .006)) ?? targets.find(target => target.kind === "table" && inside(x, y, target.box, .01));
        setActive(current => current?.key === hit?.key ? current : hit ?? null);
      });
    };
    const leave = (event: PointerEvent) => { if (!(event.relatedTarget instanceof Element && event.relatedTarget.closest(".pf-manual-chip"))) setActive(null); };
    element.addEventListener("pointermove", move); element.addEventListener("pointerleave", leave);
    return () => { cancelAnimationFrame(frame); element.removeEventListener("pointermove", move); element.removeEventListener("pointerleave", leave); };
  }, [surface, targets]);
  if (!active) return null;
  const translated = active.units.every(id => texts.has(id)), shown = translated && active.units.some(id => !hidden.has(id)), busy = active.units.some(id => pending.has(id));
  const act = () => {
    const store = useTranslationStore.getState();
    if (!translated) { active.units.filter(id => store.texts.has(id)).forEach(id => store.show(id)); onTranslate(active.units.filter(id => !store.texts.has(id))); return; }
    active.units.forEach(id => shown ? store.hide(id) : store.show(id));
  };
  const { box } = active, label = busy ? "번역 중" : !translated ? (active.kind === "table" ? "표 번역" : "번역") : shown ? "원문" : "번역 보기";
  return <div className="pf-manual" data-kind={active.kind} style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}>
    <button type="button" className="pf-manual-chip dd-glass" data-busy={busy || undefined} disabled={busy} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); act(); }}>
      {busy ? <i className="pf-loader" aria-hidden="true"/> : <Languages size={13} aria-hidden="true"/>}{label}
    </button>
  </div>;
}
