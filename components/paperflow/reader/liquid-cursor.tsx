"use client";
import { useEffect, useRef } from "react";

const RADIUS = 30;
/** How much the drop magnifies: a little over the margins, a little more over text. */
const ZOOM_PLAIN = 1.1, ZOOM_TEXT = 1.22;

/** Displacement map of a convex lens: samples pull toward the centre mid-radius, none at the rim (no seam). */
function lensMap(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!, image = context.createImageData(size, size), half = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - half) / half, dy = (y - half) / half, d = Math.hypot(dx, dy), index = (y * size + x) * 4;
    const pull = d < 1 ? Math.sin(Math.PI * d) * .9 : 0;
    image.data[index] = 128 - 127 * dx * pull; image.data[index + 1] = 128 - 127 * dy * pull;
    image.data[index + 2] = 128; image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

/**
 * A copy of a page for the lens: its Korean lines, highlights, ink and marks, without the page canvas
 * (the lens draws that itself, fresh every frame) or the invisible source text layer. Ids and page
 * numbers are dropped so nothing that looks pages up by them ever finds the copy.
 */
function copyPage(page: HTMLElement) {
  const copy = page.cloneNode(true) as HTMLElement;
  const sources = page.querySelectorAll("canvas"), copies = copy.querySelectorAll("canvas");
  copies.forEach((canvas, at) => {
    const source = sources[at];
    if (source.parentElement === page) { canvas.remove(); return; }
    try { canvas.getContext("2d")?.drawImage(source, 0, 0); } catch { /* an empty layer */ }
  });
  copy.querySelectorAll(".textLayer, .pf-page-loading, .pf-sel-end, .pf-manual").forEach(node => node.remove());
  copy.querySelectorAll("[id], [data-pdf-page], [data-paragraph-id]").forEach(node => { node.removeAttribute("id"); node.removeAttribute("data-pdf-page"); node.removeAttribute("data-paragraph-id"); });
  copy.removeAttribute("data-pdf-page");
  copy.setAttribute("aria-hidden", "true"); copy.setAttribute("inert", "");
  copy.style.position = "absolute"; copy.style.left = "0"; copy.style.top = "0"; copy.style.margin = "0"; copy.style.transformOrigin = "0 0";
  return copy;
}

const onText = (element: Element | null) => !!element && (!!element.closest(".pf-tx-line") || element.matches(".textLayer span, .textLayer br") && !!element.textContent?.trim());

/**
 * Focus-mode pointer: a drop of liquid glass that follows the pointer on a spring, stretches with its
 * speed and shows the line under it magnified, a little more while it passes over text, so the eye can
 * follow the drop while reading. The lens is a live copy of the page (the PDF drawn from the page
 * canvas each frame plus a copy of its Korean layer), so it looks the same in Safari, Chrome, Edge and
 * Firefox, on a Mac, on Windows, on an iPad and on a phone; where SVG filters apply to HTML the copy is
 * also bent at the rim like a real drop. With a finger the drop appears above the fingertip (like the
 * iOS loupe) while the finger is down; an Apple Pencil hovering above the screen moves it too.
 */
export function LiquidCursor({ root }: { root: React.RefObject<HTMLElement | null> }) {
  const drop = useRef<HTMLDivElement>(null), paper = useRef<HTMLCanvasElement>(null), stage = useRef<HTMLDivElement>(null), image = useRef<SVGFEImageElement>(null);
  useEffect(() => {
    const host = root.current, element = drop.current, lensPaper = paper.current, holder = stage.current;
    if (!host || !element || !lensPaper || !holder) return;
    image.current?.setAttribute("href", lensMap(RADIUS * 4));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ratio = Math.min(2, window.devicePixelRatio || 1), size = RADIUS * 2;
    lensPaper.width = lensPaper.height = Math.round(size * ratio);
    const context = lensPaper.getContext("2d");
    // Safari draws SVG filters on HTML unreliably: there the drop magnifies without bending at the rim.
    const webkitOnly = /AppleWebKit/.test(navigator.userAgent) && !/Chrome\/|Chromium|Firefox/.test(navigator.userAgent);
    element.dataset.bend = webkitOnly ? "false" : "true";

    let x = -200, y = -200, tx = -200, ty = -200, vx = 0, vy = 0, lift = 0, targetLift = 0;
    let zoom = ZOOM_PLAIN, targetZoom = ZOOM_PLAIN, grow = 1, targetGrow = 1, visible = false, frame = 0, hideTimer = 0;
    let page: HTMLElement | null = null, copy: HTMLElement | null = null, dirty = false, builtAt = 0, drawn = "";
    const watcher = new MutationObserver(records => { if (records.some(record => !(record.target as Element).closest?.(".textLayer"))) dirty = true; });

    const usePage = (next: HTMLElement | null) => {
      if (next === page) return;
      page = next; watcher.disconnect(); copy = null; holder.replaceChildren();
      if (page) { watcher.observe(page, { subtree: true, childList: true, attributes: true, characterData: true }); dirty = true; }
    };
    const show = () => { if (!visible) { visible = true; x = tx; y = ty; element.dataset.visible = "true"; } if (!frame) frame = requestAnimationFrame(tick); };
    const hide = () => { visible = false; element.dataset.visible = "false"; };
    const aim = (clientX: number, clientY: number, raise: number) => {
      window.clearTimeout(hideTimer);
      tx = clientX; ty = clientY; targetLift = raise;
      const under = document.elementFromPoint(clientX, clientY);
      if (!under || !host.contains(under)) { hide(); return; }
      usePage(under.closest<HTMLElement>(".pf-pdf-page"));
      const text = onText(under);
      targetZoom = text ? ZOOM_TEXT : ZOOM_PLAIN; targetGrow = text ? 1.06 : 1;
      element.dataset.text = text ? "true" : "false";
      show();
    };

    const tick = () => {
      frame = 0;
      if (!visible) return;
      const follow = still ? 1 : .42;
      const ax = (tx - x) * follow, ay = (ty - y) * follow;
      vx = still ? 0 : vx * .45 + ax; vy = still ? 0 : vy * .45 + ay;
      x = still ? tx : x + vx; y = still ? ty : y + vy;
      zoom += (targetZoom - zoom) * .18; grow += (targetGrow - grow) * .2; lift += (targetLift - lift) * .3;
      const speed = Math.min(1, Math.hypot(vx, vy) / 40), angle = Math.atan2(vy, vx);
      // At rest the drop is a plain circle (an axis-aligned transform keeps the magnified text crisp).
      element.style.transform = speed < .02 ? `translate(${x - RADIUS}px, ${y - RADIUS - lift}px) scale(${grow})`
        : `translate(${x - RADIUS}px, ${y - RADIUS - lift}px) rotate(${angle}rad) scale(${grow * (1 + speed * .2)}, ${grow * (1 - speed * .12)}) rotate(${-angle}rad)`;

      if (page?.isConnected) {
        const now = performance.now();
        // Rebuilt when the page changes (a translation lands, a highlight is added), at most a few times a second.
        if (dirty && now - builtAt > 250) { dirty = false; builtAt = now; drawn = ""; copy = copyPage(page); holder.replaceChildren(copy); }
        const box = page.getBoundingClientRect(), fit = box.width / (page.offsetWidth || box.width);
        const px = x - box.left, py = y - box.top;
        if (copy) copy.style.transform = `translate(${RADIUS - px * zoom}px, ${RADIUS - py * zoom}px) scale(${fit * zoom})`;
        const source = page.querySelector<HTMLCanvasElement>(":scope > canvas");
        // Drawn again only when something under the drop moved (the drop, the page, the zoom or a fresh render).
        const key = `${px.toFixed(1)} ${py.toFixed(1)} ${zoom.toFixed(3)} ${source?.width} ${source?.style.visibility}`;
        if (context && key !== drawn) {
          drawn = key;
          context.clearRect(0, 0, lensPaper.width, lensPaper.height);
          if (source && source.width && source.style.visibility !== "hidden") {
            const scale = source.width / box.width, span = size / zoom;
            try { context.drawImage(source, (px - span / 2) * scale, (py - span / 2) * scale, span * scale, span * scale, 0, 0, lensPaper.width, lensPaper.height); } catch { /* not drawn yet */ }
          }
        }
        element.dataset.page = "true";
      } else element.dataset.page = "false";
      // Keeps running while the drop is still settling or something is moving under it (scrolling).
      frame = requestAnimationFrame(tick);
    };

    const isPage = (event: Event) => event.target instanceof Element && !event.target.closest("button, a, input, textarea, [contenteditable], [data-selection-ui]");
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      // An Apple Pencil hovering over the glass, or a mouse: the drop sits right on the point.
      aim(event.clientX, event.clientY, event.pointerType === "pen" && event.buttons ? 64 : 0);
    };
    const leave = (event: PointerEvent) => { if (event.pointerType !== "touch") hide(); };
    const press = (event: PointerEvent) => { if (event.pointerType !== "touch") element.dataset.pressed = "true"; };
    const release = () => { element.dataset.pressed = "false"; };
    // Fingers: touch events keep coming while the page scrolls (pointer events stop), so the lens rides along.
    const touch = (event: TouchEvent) => {
      const point = event.touches[0];
      if (!point || event.touches.length > 1 || (point as Touch & { touchType?: string }).touchType === "stylus" || !isPage(event)) { hide(); return; }
      aim(point.clientX, point.clientY, 76);
    };
    const untouch = () => { window.clearTimeout(hideTimer); hideTimer = window.setTimeout(hide, 450); };

    host.addEventListener("pointermove", move); host.addEventListener("pointerleave", leave);
    host.addEventListener("pointerdown", press); window.addEventListener("pointerup", release);
    host.addEventListener("touchstart", touch, { passive: true }); host.addEventListener("touchmove", touch, { passive: true });
    host.addEventListener("touchend", untouch); host.addEventListener("touchcancel", untouch);
    host.dataset.liquidCursor = "true";
    return () => {
      cancelAnimationFrame(frame); window.clearTimeout(hideTimer); watcher.disconnect(); delete host.dataset.liquidCursor;
      host.removeEventListener("pointermove", move); host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointerdown", press); window.removeEventListener("pointerup", release);
      host.removeEventListener("touchstart", touch); host.removeEventListener("touchmove", touch);
      host.removeEventListener("touchend", untouch); host.removeEventListener("touchcancel", untouch);
    };
  }, [root]);
  return <>
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <filter id="pf-liquid-lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage ref={image} x="0" y="0" width={RADIUS * 2} height={RADIUS * 2} result="map" preserveAspectRatio="none"/>
        <feDisplacementMap in="SourceGraphic" in2="map" scale="9" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
    </svg>
    <div ref={drop} className="pf-liquid-drop" data-visible="false" aria-hidden="true">
      <div className="pf-lens"><canvas ref={paper} className="pf-lens-paper"/><div ref={stage} className="pf-lens-stage"/></div>
      <span className="pf-lens-glass"/>
    </div>
  </>;
}
