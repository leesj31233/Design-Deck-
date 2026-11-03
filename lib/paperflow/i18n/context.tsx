"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isLang, translator, type Lang, type Translate } from "./index";

type LangValue = { lang: Lang; setLang: (lang: Lang) => void; t: Translate };
const KO: LangValue = { lang: "ko", setLang: () => undefined, t: translator("ko") };
/** Without a provider (PAPERFLOW) everything stays Korean and there is nothing to switch. */
const LangContext = createContext<LangValue>(KO);

export const useLang = () => useContext(LangContext);

/**
 * Holds the reader's language. With `storageKey` the choice is remembered on this device; the page's `<html lang>`
 * follows it (and `onLang` lets the caller mark its own root). Starts in Korean on the server and on first paint,
 * then takes the saved choice, so the server and the browser render the same thing.
 */
export function LangProvider({ storageKey, initial = "ko", children }: { storageKey?: string; initial?: Lang; children: ReactNode }) {
  const [lang, setState] = useState<Lang>(initial);
  useEffect(() => {
    if (!storageKey) return;
    try { const saved = localStorage.getItem(storageKey); if (isLang(saved)) setState(saved); } catch { /* the default stays */ }
  }, [storageKey]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((next: Lang) => {
    setState(next);
    if (storageKey) try { localStorage.setItem(storageKey, next); } catch { /* this visit only */ }
  }, [storageKey]);
  const value = useMemo<LangValue>(() => ({ lang, setLang, t: translator(lang) }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
