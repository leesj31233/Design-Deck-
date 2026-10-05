"use client";
import * as React from "react";

export type ThemePreference = "system" | "light" | "dark";
const STORAGE_KEY = "paperflow-theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (p: ThemePreference) => void;
  cycle: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/** Inline, pre-hydration script so the pinned theme applies before first paint. */
export const themeInitScript = `try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}`;

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>("system");
  const [systemDark, setSystemDark] = React.useState(false);

  React.useEffect(() => {
    setPreferenceState(readPreference());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(media.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setPreference = React.useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      if (p === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // Storage may be unavailable (private mode); the in-memory choice still applies.
    }
    if (p === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = p;
  }, []);

  const resolved = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  const cycle = React.useCallback(() => setPreference(resolved === "dark" ? "light" : "dark"), [resolved, setPreference]);

  const value = React.useMemo(() => ({ preference, resolved, setPreference, cycle }), [preference, resolved, setPreference, cycle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
