"use client";
import { useEffect, useRef } from "react";

export type PointerMode = "default" | "liquid" | "laser" | "chalk" | "spotlight";
export const POINTER_MODES: { value: PointerMode; label: string; hint: string }[] = [
  { value: "default", label: "기본", hint: "보통 포인터" },
  { value: "liquid", label: "물방울", hint: "글자 위를 살짝 확대하는 물방울" },
  { value: "laser", label: "레이저", hint: "끌면 빨간 선이 그려지고 곧 사라짐" },
  { value: "chalk", label: "분필", hint: "끌면 분필 자국이 남았다가 3초 뒤 사라짐" },
  { value: "spotlight", label: "스포트라이트", hint: "포인터 주변만 밝게" }
];
const KEY = "pf-focus-pointer";
export function readPointerMode(): PointerMode { try { const value = localStorage.getItem(KEY); return POINTER_MODES.some(mode => mode.value === value) ? value as PointerMode : "default"; } catch { return "default"; } }
export function writePointerMode(mode: PointerMode) { try { localStorage.setItem(KEY, mode); } catch { /* this visit only */ } }

type Point = { x: number; y: number; t: number };
const LASER_LIFE = 750, CHALK_HOLD = 2200, CHALK_FADE = 900;

/**
 * Presentation pointers for focus mode, drawn on one canvas over the viewport: a laser that leaves a
 * glowing line while you drag and lets it fade at once, chalk that stays a moment then fades, and a
 * spotlight that dims everything but the area around the pointer. While laser or chalk is on, a drag
 * draws instead of selecting text.
 */
export function PresentPointer({ root, mode }: { root: React.RefObject<HTMLElement | null>; mode: Exclude<PointerMode, "default" | "liquid"> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const host = root.current, element = canvas.current;
    if (!host || !element) return;
    const context = element.getContext("2d")!;
    const strokes: { points: Point[]; done: number | null }[] = [];
    let pointer: { x: number; y: number } | null = null, drawing: { points: Point[]; done: number | null } | null = null, frame = 0;
    const resize = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); element.width = window.innerWidth * dpr; element.height = window.innerHeight * dpr; context.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    const drawsOnDrag = mode === "laser" || mode === "chalk";
    if (drawsOnDrag) host.dataset.presentDraw = "true";
    host.dataset.presentPointer = mode;

    const move = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (drawing) drawing.points.push({ x: event.clientX, y: event.clientY, t: performance.now() });
    };
    const down = (event: PointerEvent) => {
      if (!drawsOnDrag || event.button !== 0) return;
      // Toolbar and dialogs keep working; only the paper is drawn on.
      if ((event.target as Element).closest("button, a, input, textarea, [role='dialog'], .pf-annotation-tools")) return;
      // A drag draws: the paper's own pen, selection and click-to-translate do not see it.
      event.preventDefault(); event.stopPropagation();
      drawing = { points: [{ x: event.clientX, y: event.clientY, t: performance.now() }], done: null };
      strokes.push(drawing);
    };
    let swallowClick = false;
    const up = () => { if (drawing) { drawing.done = performance.now(); drawing = null; swallowClick = true; } };
    const click = (event: MouseEvent) => { if (swallowClick) { swallowClick = false; event.preventDefault(); event.stopPropagation(); } };
    const leave = () => { pointer = null; };

    const chalkLine = (points: Point[], alpha: number) => {
      // Three slightly offset passes with a dashed rough edge read as chalk on the page.
      for (const [offset, width, opacity] of [[0, 4.2, .55], [.9, 2.2, .45], [-.8, 1.4, .5]] as const) {
        context.beginPath();
        points.forEach((point, index) => { const jitter = Math.sin(point.x * .9 + point.y * 1.3) * .8; if (index) context.lineTo(point.x + offset + jitter, point.y - offset); else context.moveTo(point.x + offset, point.y - offset); });
        context.strokeStyle = `rgba(232,163,40,${alpha * opacity})`; context.lineWidth = width; context.lineCap = "round"; context.lineJoin = "round";
        context.setLineDash([7, 2.5, 3, 1.5]); context.stroke(); context.setLineDash([]);
      }
    };
    const tick = () => {
      const now = performance.now();
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (mode === "spotlight" && pointer) {
        const glow = context.createRadialGradient(pointer.x, pointer.y, 90, pointer.x, pointer.y, 190);
        glow.addColorStop(0, "rgba(10,14,20,0)"); glow.addColorStop(1, "rgba(10,14,20,.5)");
        context.fillStyle = glow; context.fillRect(0, 0, window.innerWidth, window.innerHeight);
      }
      for (let index = strokes.length - 1; index >= 0; index--) {
        const stroke = strokes[index];
        if (mode === "laser") {
          // Each segment fades with its own age, so the tail disappears behind the pointer.
          stroke.points = stroke.points.filter(point => now - point.t < LASER_LIFE);
          if (!stroke.points.length) { if (stroke.done !== null) strokes.splice(index, 1); continue; }
          for (let at = 1; at < stroke.points.length; at++) {
            const a = stroke.points[at - 1], b = stroke.points[at], life = 1 - (now - b.t) / LASER_LIFE;
            context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);
            context.strokeStyle = `rgba(255,59,48,${.85 * life})`; context.lineWidth = 3.2; context.lineCap = "round";
            context.shadowColor = "rgba(255,59,48,.75)"; context.shadowBlur = 10; context.stroke(); context.shadowBlur = 0;
          }
        } else if (mode === "chalk") {
          const age = stroke.done === null ? 0 : now - stroke.done;
          if (age > CHALK_HOLD + CHALK_FADE) { strokes.splice(index, 1); continue; }
          chalkLine(stroke.points, age < CHALK_HOLD ? 1 : 1 - (age - CHALK_HOLD) / CHALK_FADE);
        }
      }
      if (mode === "laser" && pointer) {
        context.beginPath(); context.arc(pointer.x, pointer.y, 5, 0, Math.PI * 2);
        context.fillStyle = "rgba(255,59,48,.95)"; context.shadowColor = "rgba(255,59,48,.9)"; context.shadowBlur = 14; context.fill(); context.shadowBlur = 0;
      }
      frame = requestAnimationFrame(tick);
    };
    host.addEventListener("pointermove", move); host.addEventListener("pointerdown", down, true); host.addEventListener("click", click, true); host.addEventListener("pointerleave", leave);
    window.addEventListener("pointerup", up); window.addEventListener("resize", resize);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame); delete host.dataset.presentDraw; delete host.dataset.presentPointer;
      host.removeEventListener("pointermove", move); host.removeEventListener("pointerdown", down, true); host.removeEventListener("click", click, true); host.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointerup", up); window.removeEventListener("resize", resize);
    };
  }, [root, mode]);
  return <canvas ref={canvas} className="pf-present-canvas" aria-hidden="true"/>;
}
