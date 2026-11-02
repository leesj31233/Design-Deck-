"use client";
import { useEffect, useMemo, useState } from "react";
import { Languages } from "lucide-react";
import { useTranslationStore } from "@/lib/paperflow/translation/translation-store";
import { manualTargets, type ManualTarget, type TargetBox } from "@/lib/paperflow/translation/manual-targets";

type Box = TargetBox;

const inside = (x: number, y: number, box: Box, pad = 0) => x >= box.x - pad && x <= box.x + box.width + pad && y >= box.y - pad && y <= box.y + box.height + pad;

/**
 * Headings and tables are translated on request. Pointing at a table (or its "Table n" caption) lifts a
 * rounded frame around it with a 번역 chip; pointing at a heading shows the chip at its end. The chip
 * translates exactly that table's cells or that heading; translated, it switches original ↔ Korean.
 */
export function ManualTargets({ pageIndex, surface, onTranslate }: { pageIndex: number; surface: React.RefObject<HTMLDivElement | null>; onTranslate: (unitIds: string[]) => void }) {
  const manifest = useTranslationStore(state => state.manifest), texts = useTranslationStore(state => state.texts), hidden = useTranslationStore(state => state.hidden), pending = useTranslationStore(state => state.pending);
  const targets = useMemo(() => manifest ? manualTargets(manifest, pageIndex) : [], [manifest, pageIndex]);
  const [active, setActive] = useState<ManualTarget | null>(null);
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
  const { box } = active, name = active.kind === "table" ? active.label : "";
  const label = busy ? `${name} 번역 중`.trim() : !translated ? (name ? `${name} 번역` : "번역") : shown ? "원문 보기" : "번역 보기";
  return <div className="pf-manual" data-kind={active.kind} style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}>
    <button type="button" className="pf-manual-chip dd-glass" data-busy={busy || undefined} disabled={busy} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); act(); }}>
      {busy ? <i className="pf-loader" aria-hidden="true"/> : <Languages size={13} aria-hidden="true"/>}{label}
    </button>
  </div>;
}
