"use client";
import { useEffect, useRef } from "react";

export type PointerMode = "default" | "liquid" | "laser" | "chalk" | "spotlight";
export const POINTER_MODES: { value: PointerMode; label: string; hint: string }[] = [
  { value: "default", label: "기본", hint: "보통 포인터" },
  { value: "liquid", label: "물방울", hint: "글자를 확대해 보여주는 물방울 렌즈" },
  { value: "laser", label: "레이저", hint: "끌면 빨간 선이 그려지고 곧 사라짐" },
  { value: "chalk", label: "분필", hint: "끌면 분필 자국이 남았다가 3초 뒤 사라짐" },
  { value: "spotlight", label: "스포트라이트", hint: "포인터 주변만 밝게" }
];
const KEY = "pf-focus-pointer";
export function readPointerMode(): PointerMode { try { const value = localStorage.getItem(KEY); return POINTER_MODES.some(mode => mode.value === value) ? value as PointerMode : "default"; } catch { return "default"; } }
export function writePointerMode(mode: PointerMode) { try { localStorage.setItem(KEY, mode); } catch { /* this visit only */ } }

type Point = { x: number; y: number; t: number };
const LASER_LIFE = 650, CHALK_HOLD = 2200, CHALK_FADE = 900;

/**
 * Presentation pointers for focus mode. The pointer itself (the laser dot, the chalk tip, the
 * spotlight) is an element moved with a transform in the pointer event, so it keeps up with the mouse
 * exactly and costs the page nothing (no repaint); the system cursor is hidden so there is only one
 * pointer on screen. Only the trails are drawn on a canvas, and only while one is visible: a laser
 * line that fades right behind the pointer, chalk that stays a moment then fades. While laser or chalk
 * is on, a drag draws instead of selecting text.
 */
export function PresentPointer({ root, mode }: { root: React.RefObject<HTMLElement | null>; mode: Exclude<PointerMode, "default" | "liquid"> }) {
  const canvas = useRef<HTMLCanvasElement>(null), tip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = root.current, element = canvas.current, marker = tip.current;
    if (!host || !element || !marker) return;
    const context = element.getContext("2d")!;
    const strokes: { points: Point[]; done: number | null }[] = [];
    let drawing: { points: Point[]; done: number | null } | null = null, frame = 0, painted = false;
    const resize = () => { const dpr = Math.min(1.5, window.devicePixelRatio || 1); element.width = Math.round(window.innerWidth * dpr); element.height = Math.round(window.innerHeight * dpr); context.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    const drawsOnDrag = mode === "laser" || mode === "chalk";
    if (drawsOnDrag) host.dataset.presentDraw = "true";
    host.dataset.presentPointer = mode;

    const place = (x: number, y: number) => { marker.style.transform = `translate3d(${x}px, ${y}px, 0)`; marker.dataset.visible = "true"; };
    const move = (event: PointerEvent) => {
      place(event.clientX, event.clientY);
      if (!drawing) return;
      // Every sample the mouse produced since the last event, so a fast stroke is a smooth line.
      const samples = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
      const now = performance.now();
      for (const sample of samples.length ? samples : [event]) drawing.points.push({ x: sample.clientX, y: sample.clientY, t: now });
      wake();
    };
    const down = (event: PointerEvent) => {
      place(event.clientX, event.clientY);
      if (!drawsOnDrag || event.button !== 0) return;
      // Toolbar and dialogs keep working; only the paper is drawn on.
      if ((event.target as Element).closest("button, a, input, textarea, [role='dialog'], .pf-annotation-tools")) return;
      // A drag draws: the paper's own pen, selection and click-to-translate do not see it.
      event.preventDefault(); event.stopPropagation();
      drawing = { points: [{ x: event.clientX, y: event.clientY, t: performance.now() }], done: null };
      strokes.push(drawing); marker.dataset.pressed = "true"; wake();
    };
    let swallowClick = false;
    const up = () => { marker.dataset.pressed = "false"; if (drawing) { drawing.done = performance.now(); drawing = null; swallowClick = true; wake(); } };
    const click = (event: MouseEvent) => { if (swallowClick) { swallowClick = false; event.preventDefault(); event.stopPropagation(); } };
    const leave = () => { marker.dataset.visible = "false"; };

    const chalkLine = (points: Point[], alpha: number) => {
      // Three slightly offset passes with a dashed rough edge read as chalk on the page.
      for (const [offset, width, opacity] of [[0, 4.2, .55], [.9, 2.2, .45], [-.8, 1.4, .5]] as const) {
        context.beginPath();
        points.forEach((point, index) => { const jitter = Math.sin(point.x * .9 + point.y * 1.3) * .8; if (index) context.lineTo(point.x + offset + jitter, point.y - offset); else context.moveTo(point.x + offset, point.y - offset); });
        context.strokeStyle = `rgba(232,163,40,${alpha * opacity})`; context.lineWidth = width; context.lineCap = "round"; context.lineJoin = "round";
        context.setLineDash([7, 2.5, 3, 1.5]); context.stroke(); context.setLineDash([]);
      }
    };
    const laserLine = (points: Point[], now: number) => {
      // A soft wide pass and a bright core instead of a canvas shadow (a blur per segment is what lagged).
      for (const [width, alpha] of [[9, .16], [3.2, .9]] as const) {
        context.lineWidth = width; context.lineCap = "round"; context.lineJoin = "round";
        for (let at = 1; at < points.length; at++) {
          const a = points[at - 1], b = points[at], life = Math.max(0, 1 - (now - b.t) / LASER_LIFE);
          context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);
          context.strokeStyle = `rgba(255,59,48,${alpha * life})`; context.stroke();
        }
      }
    };
    const tick = () => {
      frame = 0;
      const now = performance.now();
      if (painted) context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      painted = false;
      for (let index = strokes.length - 1; index >= 0; index--) {
        const stroke = strokes[index];
        if (mode === "laser") {
          stroke.points = stroke.points.filter(point => now - point.t < LASER_LIFE);
          if (!stroke.points.length) { if (stroke.done !== null) strokes.splice(index, 1); continue; }
          laserLine(stroke.points, now); painted = true;
        } else if (mode === "chalk") {
          const age = stroke.done === null ? 0 : now - stroke.done;
          if (age > CHALK_HOLD + CHALK_FADE) { strokes.splice(index, 1); continue; }
          chalkLine(stroke.points, age < CHALK_HOLD ? 1 : 1 - (age - CHALK_HOLD) / CHALK_FADE); painted = true;
        }
      }
      // Idle (nothing left to fade) means no frames at all.
      if (strokes.length) frame = requestAnimationFrame(tick);
    };
    function wake() { if (!frame) frame = requestAnimationFrame(tick); }
    host.addEventListener("pointermove", move); host.addEventListener("pointerdown", down, true); host.addEventListener("click", click, true); host.addEventListener("pointerleave", leave);
    window.addEventListener("pointerup", up); window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame); delete host.dataset.presentDraw; delete host.dataset.presentPointer;
      host.removeEventListener("pointermove", move); host.removeEventListener("pointerdown", down, true); host.removeEventListener("click", click, true); host.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointerup", up); window.removeEventListener("resize", resize);
    };
  }, [root, mode]);
  return <>
    {mode !== "spotlight" && <canvas ref={canvas} className="pf-present-canvas" aria-hidden="true"/>}
    {mode === "spotlight" && <canvas ref={canvas} hidden aria-hidden="true"/>}
    <div ref={tip} className="pf-present-tip" data-mode={mode} data-visible="false" aria-hidden="true"/>
  </>;
}
