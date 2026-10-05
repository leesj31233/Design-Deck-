/**
 * Lightweight performance budget instrumentation. Measurements are kept in memory
 * and mirrored to the Performance timeline (visible in DevTools) — never sent anywhere.
 */
export const BUDGETS = {
  "selection-bar": 80,
  "highlight-persist": 50,
  "page-turn": 120,
} as const;

export type BudgetName = keyof typeof BUDGETS;
export type Measurement = { name: BudgetName; duration: number; at: number; withinBudget: boolean };

const listeners = new Set<(m: Measurement) => void>();
const latest = new Map<BudgetName, Measurement>();

export function record(name: BudgetName, duration: number) {
  const m: Measurement = { name, duration, at: Date.now(), withinBudget: duration <= BUDGETS[name] };
  latest.set(name, m);
  try {
    performance.measure(`paperflow:${name}`, { start: performance.now() - duration, duration });
  } catch {
    // Older engines without measure options — the in-memory value is enough.
  }
  listeners.forEach((l) => l(m));
  return m;
}

export function getLatest(name: BudgetName) {
  return latest.get(name);
}

export function subscribe(listener: (m: Measurement) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
