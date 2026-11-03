import type { IntelBrief, IntelEnglish, IntelItem } from "@/lib/paperflow/intel/types";
import type { Lang } from "./index";

/**
 * English for the collected material itself (titles, summaries, articles, case files, briefings). Every Korean
 * text of an item is looked up by a short hash of the text (`en.t[textKey(korean)]`), so the English follows the
 * text wherever it sits, survives the public site's filtering (a dropped sentence or row moves the others), and
 * a text that changes simply has no English until it is translated again. Nothing is matched by position.
 */
export const HANGUL = /[가-힣]/;

/** cyrb53: a fast 53-bit string hash, the same in the browser and on the server. */
export function textKey(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761); h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Fields that are never shown as text, or never translated: identifiers, links, pictures, codes, the reader's own
 * state, and `naysor` (NAYSOR's internal judgement, which the public site does not carry and is never translated).
 */
const SKIP = new Set(["en", "naysor", "user", "id", "url", "pdfUrl", "src", "cover", "logo", "libraryDoc", "topics", "classes", "kind", "status", "stage", "lang", "pack", "addedAt", "updatedAt", "checkedAt", "hasCover", "coverOff", "logoDark", "reliability", "to", "type", "ref", "precision", "entities", "entityCodes", "canonicalItemId", "itemIds", "mentionIds", "code", "parentCode", "website"]);

/** Every Korean text in a value (object keys included), by its key. */
export function koreanTexts(value: unknown, out = new Map<string, string>()): Map<string, string> {
  if (typeof value === "string") { if (HANGUL.test(value)) out.set(textKey(value), value); return out; }
  if (Array.isArray(value)) { for (const entry of value) koreanTexts(entry, out); return out; }
  if (value && typeof value === "object") {
    for (const [field, entry] of Object.entries(value)) {
      if (SKIP.has(field)) continue;
      if (HANGUL.test(field)) out.set(textKey(field), field);
      koreanTexts(entry, out);
    }
  }
  return out;
}

/** The same value with every Korean text that has English replaced by it; the rest as it was. */
export function localize<T>(value: T, table: Record<string, string>): T {
  const swap = (text: string) => HANGUL.test(text) ? table[textKey(text)] ?? text : text;
  const walk = (entry: unknown): unknown => {
    if (typeof entry === "string") return swap(entry);
    if (Array.isArray(entry)) return entry.map(walk);
    if (entry && typeof entry === "object") {
      const out: Record<string, unknown> = {};
      for (const [field, inner] of Object.entries(entry)) out[SKIP.has(field) ? field : swap(field)] = SKIP.has(field) ? inner : walk(inner);
      return out;
    }
    return entry;
  };
  return walk(value) as T;
}

/** The texts of an item that are translated (everything shown except the reader's state and NAYSOR's judgement). */
export function itemTexts(item: IntelItem) { return koreanTexts(item); }
/** A briefing's texts: its title and body; a hidden JSON briefing (glossary, prices, registry, places) by its fields. */
export function briefTexts(brief: IntelBrief) {
  const out = new Map<string, string>();
  koreanTexts(brief.title, out);
  if (brief.id.startsWith("__")) { try { koreanTexts(JSON.parse(brief.body), out); } catch { /* not JSON: nothing to translate */ } }
  else koreanTexts(brief.body, out);
  return out;
}
/** One hash of the whole set of source texts: unchanged means the stored English is still complete. */
export const sourceHash = (texts: Map<string, string>) => textKey([...texts.keys()].sort().join("|"));

const MAX_ENGLISH = 60_000;
/**
 * A pack's `en` as stored English. Either the mirror form (the item's own fields, in English, at the same places:
 * arrays by position) matched against the cleaned Korean value, or the stored form `{ t: { key: english } }`, where
 * a key may also be the Korean text itself. Texts without a Korean original and `naysor` are ignored.
 */
export function englishFromPack(value: unknown, korean: unknown): IntelEnglish | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const t: Record<string, string> = {};
  const put = (key: string, english: unknown) => { if (typeof english === "string" && english.trim() && Object.keys(t).length < 4000) t[key] = english.trim().slice(0, MAX_ENGLISH); };
  const stored = (value as { t?: unknown }).t;
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const [key, english] of Object.entries(stored)) { if (HANGUL.test(key)) put(textKey(key.trim()), english); else if (/^[0-9a-z]{1,14}$/.test(key)) put(key, english); }
  } else {
    const walk = (source: unknown, mirror: unknown) => {
      if (typeof source === "string") { if (HANGUL.test(source)) put(textKey(source), mirror); return; }
      if (Array.isArray(source)) { if (Array.isArray(mirror)) source.forEach((entry, index) => walk(entry, mirror[index])); return; }
      if (source && typeof source === "object" && mirror && typeof mirror === "object" && !Array.isArray(mirror)) {
        for (const [field, entry] of Object.entries(source)) if (!SKIP.has(field)) walk(entry, (mirror as Record<string, unknown>)[field]);
      }
    };
    walk(korean, value);
  }
  if (!Object.keys(t).length) return undefined;
  const at = typeof (value as { at?: unknown }).at === "string" ? String((value as { at: string }).at).slice(0, 40) : undefined;
  return { t, h: sourceHash(koreanTexts(korean)), ...(at ? { at } : {}) };
}

/** Keeps only the English of texts the value still has (the public copy carries nothing else). */
export function pruneEnglish(en: IntelEnglish | undefined, texts: Map<string, string>): IntelEnglish | undefined {
  if (!en?.t) return undefined;
  const t: Record<string, string> = {};
  for (const key of texts.keys()) if (typeof en.t[key] === "string") t[key] = en.t[key];
  return Object.keys(t).length ? { ...en, t } : undefined;
}

const itemCache = new WeakMap<IntelItem, IntelItem>(), briefCache = new WeakMap<IntelBrief, IntelBrief>();

/**
 * An item as the reader sees it in `lang`. In English: every text with an English version shows it, the others
 * stay Korean. A title first written in English (or with no English for its Korean title) shows its original.
 */
export function localItem(item: IntelItem, lang: Lang): IntelItem {
  if (lang !== "en") return item;
  const cached = itemCache.get(item);
  if (cached) return cached;
  const table = item.en?.t ?? {};
  const { en, naysor, user, ...rest } = item;
  const out = localize(rest, table) as IntelItem;
  const titleTranslated = Boolean(item.titleKo && table[textKey(item.titleKo)]);
  if (!HANGUL.test(item.title) && (item.lang === "en" || !titleTranslated)) out.titleKo = undefined;
  const result: IntelItem = { ...out, ...(naysor ? { naysor } : {}), ...(user ? { user } : {}), ...(en ? { en } : {}) };
  itemCache.set(item, result);
  return result;
}

/** A briefing in `lang`; a hidden JSON briefing is translated field by field and written back as JSON. */
export function localBrief(brief: IntelBrief, lang: Lang): IntelBrief {
  if (lang !== "en" || !brief.en?.t) return brief;
  const cached = briefCache.get(brief);
  if (cached) return cached;
  const table = brief.en.t;
  let body = brief.body;
  if (brief.id.startsWith("__")) { try { body = JSON.stringify(localize(JSON.parse(brief.body), table)); } catch { /* left as it is */ } }
  else body = localize(brief.body, table);
  const result = { ...brief, title: localize(brief.title, table), body };
  briefCache.set(brief, result);
  return result;
}
