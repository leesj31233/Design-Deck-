/**
 * Claude's response time on this device (last 20 grading requests). Kept in
 * localStorage: it describes this phone or computer and its network, so it is
 * not synced. Every access is guarded; without storage the figure is simply absent.
 */
const KEY = "engflow.claudeLatency";

export function recordClaudeLatency(ms: number): void {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as number[];
    localStorage.setItem(KEY, JSON.stringify([...list, Math.round(ms)].slice(-20)));
  } catch {
    /* storage unavailable */
  }
}

export function claudeLatencyStats(): { n: number; avgMs: number; medianMs: number } | null {
  try {
    const list = (JSON.parse(localStorage.getItem(KEY) ?? "[]") as number[]).filter((x) => typeof x === "number" && x > 0);
    if (!list.length) return null;
    const sorted = [...list].sort((a, b) => a - b);
    return { n: list.length, avgMs: list.reduce((a, b) => a + b, 0) / list.length, medianMs: sorted[Math.floor(sorted.length / 2)] };
  } catch {
    return null;
  }
}
