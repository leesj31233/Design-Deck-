"use client";
import * as React from "react";
import { QUESTIONS } from "../content";
import {
  applyDiagnostic as applyDiag, createInitialState, migrateState, recordAttempt, type RecordInput, type RecordResult,
} from "../core/store";
import type { DiagnosticResultRecord, LearnerState, Profile, Question, Settings } from "../core/types";
import type { AIStatus, Platform, StorageStatus } from "../platform/types";

/* ───────────── Clock (with a labeled test-only offset for verifying review scheduling) ───────────── */

const OFFSET_KEY = "engflow:v1:time-offset";
let timeOffset = 0;
try {
  timeOffset = Number(globalThis.localStorage?.getItem(OFFSET_KEY) ?? 0) || 0;
} catch {
  timeOffset = 0;
}
export const clock = {
  now: () => Date.now() + timeOffset,
  offset: () => timeOffset,
  setOffset(ms: number) {
    timeOffset = ms;
    try {
      if (ms) localStorage.setItem(OFFSET_KEY, String(ms));
      else localStorage.removeItem(OFFSET_KEY);
    } catch {
      /* ignore */
    }
  },
};

/* ───────────── Context ───────────── */

export interface AppContextValue {
  ready: boolean;
  state: LearnerState;
  platform: Platform;
  storage: StorageStatus;
  ai: AIStatus;
  questions: Question[];
  qIndex: Record<string, Question>;
  now: () => number;
  record: (input: Omit<RecordInput, "now">) => RecordResult;
  applyDiagnostic: (r: DiagnosticResultRecord) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  addGenerated: (q: Question) => void;
  replaceState: (s: LearnerState) => void;
  reset: () => Promise<void>;
  refreshStatus: () => void;
}

const AppContext = React.createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = React.useContext(AppContext);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}

export function AppProvider({ platform, children }: { platform: Platform; children: React.ReactNode }) {
  const [state, setState] = React.useState<LearnerState>(() => createInitialState(clock.now()));
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const loaded = React.useRef(false);

  // Load once; then upgrade status as capabilities resolve (artifact runtime answers asynchronously).
  React.useEffect(() => {
    let alive = true;
    platform.storage
      .load()
      .then((s) => {
        if (!alive) return;
        if (s) setState(migrateState(s, clock.now()));
        loaded.current = true;
        setReady(true);
      })
      .catch(() => {
        loaded.current = true;
        setReady(true);
      });
    const unsub = platform.storage.subscribe?.((remote) => {
      if (remote.updatedAt > stateRef.current.updatedAt) setState(migrateState(remote, clock.now()));
    });
    const ticks = [400, 1500, 4000, 11000].map((ms) => setTimeout(force, ms));
    return () => {
      alive = false;
      unsub?.();
      ticks.forEach(clearTimeout);
    };
  }, [platform]);

  // Persist (debounced) after the first load.
  React.useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => void platform.storage.save(state), 350);
    return () => clearTimeout(t);
  }, [state, platform]);

  // Flush on page hide (iOS Safari may discard the tab without unload).
  React.useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && loaded.current) void platform.storage.save(stateRef.current);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [platform]);

  const questions = React.useMemo(() => [...QUESTIONS, ...state.generated], [state.generated]);
  const qIndex = React.useMemo(() => Object.fromEntries(questions.map((q) => [q.id, q])), [questions]);

  const value: AppContextValue = {
    ready,
    state,
    platform,
    storage: platform.storage.status(),
    ai: platform.ai.status(),
    questions,
    qIndex,
    now: clock.now,
    record: (input) => {
      const result = recordAttempt(stateRef.current, { ...input, now: clock.now() }, qIndex);
      stateRef.current = result.state;
      setState(result.state);
      return result;
    },
    applyDiagnostic: (r) => setState((s) => applyDiag(s, r)),
    updateSettings: (patch) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch }, updatedAt: clock.now() })),
    updateProfile: (patch) => setState((s) => ({ ...s, profile: { ...s.profile, ...patch }, updatedAt: clock.now() })),
    addGenerated: (q) => setState((s) => ({ ...s, generated: [...s.generated.filter((g) => g.id !== q.id), q].slice(-40), updatedAt: clock.now() })),
    replaceState: (s) => setState({ ...migrateState(s, clock.now()), updatedAt: clock.now() }),
    reset: async () => {
      await platform.storage.clear();
      const fresh = createInitialState(clock.now());
      stateRef.current = fresh;
      setState(fresh);
    },
    refreshStatus: force,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Theme and motion preferences applied to <html>. */
export function usePreferences(settings: Settings) {
  // The claude.ai viewer may set data-theme itself; "system" hands control back to it.
  const host = React.useRef<{ captured: boolean; value: string | null; ours: boolean }>({ captured: false, value: null, ours: false });
  React.useEffect(() => {
    const root = document.documentElement;
    if (!host.current.captured) host.current = { captured: true, value: root.getAttribute("data-theme"), ours: false };
    if (settings.theme === "system") {
      if (host.current.ours) {
        if (host.current.value) root.setAttribute("data-theme", host.current.value);
        else root.removeAttribute("data-theme");
        host.current.ours = false;
      }
    } else {
      root.setAttribute("data-theme", settings.theme);
      host.current.ours = true;
    }
    root.classList.toggle("ef-reduce-motion", settings.reducedMotion === "reduce");
  }, [settings.theme, settings.reducedMotion]);
}
