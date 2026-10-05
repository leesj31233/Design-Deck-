"use client";
import { useEffect, useRef } from "react";

const RADIUS = 26;

/** Displacement map of a convex lens: the centre samples closer in (magnifies), the rim bends light. */
function lensMap(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!, image = context.createImageData(size, size), half = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - half) / half, dy = (y - half) / half, d = Math.hypot(dx, dy), index = (y * size + x) * 4;
    // Inside the drop: pull samples toward the centre, strongest mid-radius, zero at the rim (no seam).
    const pull = d < 1 ? Math.sin(Math.PI * d) * .9 : 0;
    image.data[index] = 128 - 127 * dx * pull; image.data[index + 1] = 128 - 127 * dy * pull;
    image.data[index + 2] = 128; image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

/**
 * Focus-mode pointer: a drop of liquid glass that follows the pointer on a spring, stretches with its
 * speed, and magnifies the paper under it a little more while it passes over text. Chromium renders
 * the refraction through an SVG backdrop filter; other browsers get frosted glass.
 */
export function LiquidCursor({ root }: { root: React.RefObject<HTMLElement | null> }) {
  const drop = useRef<HTMLDivElement>(null), displacement = useRef<SVGFEDisplacementMapElement>(null), image = useRef<SVGFEImageElement>(null);
  useEffect(() => {
    const host = root.current, element = drop.current;
    // Touch-only screens keep their own pointer; so does anyone who asked for less motion.
    const touchOnly = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches;
    if (!host || !element || touchOnly || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    image.current?.setAttribute("href", lensMap(RADIUS * 4));
    let x = -100, y = -100, tx = -100, ty = -100, vx = 0, vy = 0, strength = 14, targetStrength = 14, grow = 1, targetGrow = 1, visible = false, frame = 0;
    const move = (event: PointerEvent) => {
      tx = event.clientX; ty = event.clientY;
      if (!visible) { x = tx; y = ty; visible = true; element.dataset.visible = "true"; }
      const under = document.elementFromPoint(tx, ty);
      const onText = !!under && (!!under.closest(".pf-tx-line") || under.matches(".textLayer span, .textLayer br") && !!under.textContent?.trim());
      targetStrength = onText ? 30 : 14; targetGrow = onText ? 1.18 : 1;
      element.dataset.text = onText ? "true" : "false";
    };
    const leave = () => { visible = false; element.dataset.visible = "false"; };
    const press = () => { element.dataset.pressed = "true"; };
    const release = () => { element.dataset.pressed = "false"; };
    const tick = () => {
      const ax = (tx - x) * .28, ay = (ty - y) * .28;
      vx = vx * .55 + ax; vy = vy * .55 + ay; x += vx; y += vy;
      strength += (targetStrength - strength) * .18; grow += (targetGrow - grow) * .2;
      const speed = Math.min(1, Math.hypot(vx, vy) / 40), angle = Math.atan2(vy, vx);
      element.style.transform = `translate(${x - RADIUS}px, ${y - RADIUS}px) rotate(${angle}rad) scale(${grow * (1 + speed * .22)}, ${grow * (1 - speed * .14)}) rotate(${-angle}rad)`;
      displacement.current?.setAttribute("scale", strength.toFixed(1));
      frame = requestAnimationFrame(tick);
    };
    host.addEventListener("pointermove", move); host.addEventListener("pointerleave", leave);
    host.addEventListener("pointerdown", press); window.addEventListener("pointerup", release);
    host.dataset.liquidCursor = "true";
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame); delete host.dataset.liquidCursor;
      host.removeEventListener("pointermove", move); host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointerdown", press); window.removeEventListener("pointerup", release);
    };
  }, [root]);
  return <>
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <filter id="pf-liquid-lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage ref={image} x="0" y="0" width={RADIUS * 2} height={RADIUS * 2} result="map" preserveAspectRatio="none"/>
        <feDisplacementMap ref={displacement} in="SourceGraphic" in2="map" scale="14" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
    </svg>
    <div ref={drop} className="pf-liquid-drop" data-visible="false" aria-hidden="true"><i/></div>
  </>;
}
