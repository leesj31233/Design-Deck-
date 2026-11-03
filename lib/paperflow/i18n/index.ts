import { EN } from "./en";

/**
 * Interface language. The app is written in Korean: every Korean string shown on screen is its own key, and
 * `en.ts` holds its English. A string without an English entry stays Korean (better a Korean word than a blank).
 */
export type Lang = "ko" | "en";
export type Vars = Record<string, string | number | null | undefined>;
export const LANGS: Lang[] = ["ko", "en"];
export const isLang = (value: unknown): value is Lang => value === "ko" || value === "en";

const HANGUL = /[가-힣]/;
const warned = new Set<string>();

/** `{name}` placeholders filled from `vars`; a placeholder without a value is left as written. */
export function interpolate(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => name in vars && vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : whole);
}

/** The text in `lang`: `ko` is the Korean source (and the key). Missing English falls back to the Korean. */
export function t(lang: Lang, ko: string, vars?: Vars): string;
export function t(lang: Lang, ko: string | undefined, vars?: Vars): string | undefined;
export function t(lang: Lang, ko: string | undefined, vars?: Vars): string | undefined {
  if (ko === undefined || ko === null) return ko;
  let text = ko;
  if (lang === "en") {
    const found = EN[ko];
    if (found !== undefined) text = found;
    else if (process.env.NODE_ENV === "development" && HANGUL.test(ko) && !warned.has(ko)) { warned.add(ko); console.warn(`[i18n] no English for: ${ko}`); }
  }
  return interpolate(text, vars);
}
export type Translate = { (ko: string, vars?: Vars): string; (ko: string | undefined, vars?: Vars): string | undefined };
/** A `t` bound to one language. */
export const translator = (lang: Lang): Translate => ((ko: string | undefined, vars?: Vars) => t(lang, ko, vars)) as Translate;
