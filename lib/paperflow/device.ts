/**
 * How much this device can comfortably hold. Browsers report memory in GB (Chromium: 0.25–8; others
 * report nothing and are treated as roomy). A device with ≤ 4 GB, or with few cores, gets smaller page
 * canvases, fewer pages kept around the view, and one cover rendered at a time.
 */
export function lowMemoryDevice() {
  if (typeof navigator === "undefined") return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return (memory !== undefined && memory <= 4) || (navigator.hardwareConcurrency ?? 8) <= 4;
}

/** Most pixels one page canvas may have: past this the page is drawn a little softer instead of using more memory. */
export const maxCanvasPixels = () => lowMemoryDevice() ? 5_000_000 : 11_000_000;
/** Device pixel ratio a page is drawn at. */
export const canvasRatio = () => Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, lowMemoryDevice() ? 1.5 : 2);
/** How far beyond the view pages are prepared (load) and kept (release), in px. */
export const pageWindow = () => lowMemoryDevice() ? { load: 700, keep: 2000 } : { load: 1500, keep: 4500 };
