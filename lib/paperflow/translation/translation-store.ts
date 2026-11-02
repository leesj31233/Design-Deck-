import { create } from "zustand";
import type { TranslationManifest } from "./manifest";

/**
 * Live translation state for the open paper. Pages subscribe to their own
 * version number, so a finished batch repaints only the pages it touched
 * instead of re-rendering (and re-typesetting) the whole reader.
 */
interface TranslationState {
  documentId: string | null;
  manifest: TranslationManifest | null;
  texts: ReadonlyMap<string, string>;
  /** Units the reader chose to see in the original language. */
  hidden: ReadonlySet<string>;
  pending: ReadonlySet<string>;
  failed: ReadonlyMap<string, string>;
  showTranslations: boolean;
  pageVersions: Readonly<Record<number, number>>;
  open(documentId: string): void;
  setManifest(manifest: TranslationManifest): void;
  setTexts(documentId: string, texts: Map<string, string>): void;
  addTexts(documentId: string, entries: { id: string; text: string }[]): void;
  setPending(documentId: string, unitIds: string[], pending: boolean): void;
  setFailed(documentId: string, unitId: string, error: string | null): void;
  hide(unitId: string): void;
  show(unitId: string): void;
  setShowTranslations(show: boolean): void;
}

function bump(state: TranslationState, unitIds: Iterable<string>, all = false) {
  const versions = { ...state.pageVersions };
  const manifest = state.manifest;
  if (all || !manifest) {
    for (let page = 0; page < (manifest?.pageCount ?? 0); page++) versions[page] = (versions[page] ?? 0) + 1;
    return versions;
  }
  const ids = new Set(unitIds), pages = new Set<number>();
  for (const unit of manifest.units) if (ids.has(unit.id)) unit.pages.forEach(page => pages.add(page));
  for (const page of pages) versions[page] = (versions[page] ?? 0) + 1;
  return versions;
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  documentId: null, manifest: null, texts: new Map(), hidden: new Set(), pending: new Set(), failed: new Map(), showTranslations: true, pageVersions: {},
  open: documentId => { if (get().documentId !== documentId) set({ documentId, manifest: null, texts: new Map(), hidden: new Set(), pending: new Set(), failed: new Map(), showTranslations: true, pageVersions: {} }); },
  setManifest: manifest => { if (manifest.documentId === get().documentId) set(state => ({ manifest, pageVersions: bump({ ...state, manifest }, [], true) })); },
  setTexts: (documentId, texts) => { if (documentId === get().documentId) set(state => ({ texts, pageVersions: bump(state, [], true) })); },
  addTexts: (documentId, entries) => {
    if (documentId !== get().documentId || !entries.length) return;
    set(state => {
      const texts = new Map(state.texts), pending = new Set(state.pending), failed = new Map(state.failed), hidden = new Set(state.hidden);
      for (const entry of entries) { texts.set(entry.id, entry.text); pending.delete(entry.id); failed.delete(entry.id); hidden.delete(entry.id); }
      return { texts, pending, failed, hidden, pageVersions: bump(state, entries.map(entry => entry.id)) };
    });
  },
  setPending: (documentId, unitIds, pending) => {
    if (documentId !== get().documentId) return;
    set(state => { const next = new Set(state.pending); for (const id of unitIds) { if (pending) next.add(id); else next.delete(id); } return { pending: next, pageVersions: bump(state, unitIds) }; });
  },
  setFailed: (documentId, unitId, error) => {
    if (documentId !== get().documentId) return;
    set(state => { const failed = new Map(state.failed); if (error) failed.set(unitId, error); else failed.delete(unitId); return { failed, pageVersions: bump(state, [unitId]) }; });
  },
  hide: unitId => set(state => ({ hidden: new Set(state.hidden).add(unitId), pageVersions: bump(state, [unitId]) })),
  show: unitId => set(state => { const hidden = new Set(state.hidden); hidden.delete(unitId); return { hidden, showTranslations: true, pageVersions: bump(state, [unitId]) }; }),
  setShowTranslations: showTranslations => set(state => ({ showTranslations, hidden: showTranslations ? new Set() : state.hidden, pageVersions: bump(state, [], true) }))
}));

/** Translations that should be painted right now (respects the global toggle and per-paragraph originals). */
export function visibleTranslations(state: Pick<TranslationState, "texts" | "hidden" | "showTranslations">): ReadonlyMap<string, string> {
  if (!state.showTranslations) return new Map();
  if (!state.hidden.size) return state.texts;
  return new Map([...state.texts].filter(([id]) => !state.hidden.has(id)));
}
