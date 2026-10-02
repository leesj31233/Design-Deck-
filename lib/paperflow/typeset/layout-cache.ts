import type { TranslationManifest } from "../translation/manifest";
import { canvasMeasure, ensurePaperFonts, fontGeneration } from "./measure";
import { typesetPage, type PageLayout, type Rect } from "./page-typesetter";

const cache = new Map<string, PageLayout>();
const LIMIT = 120;

function pageTexts(manifest: TranslationManifest, pageIndex: number, visible: ReadonlyMap<string, string>) {
  const texts = new Map<string, string>();
  for (const unit of manifest.units) if (unit.pages.includes(pageIndex)) { const text = visible.get(unit.id); if (text) texts.set(unit.id, text); }
  return texts;
}

function keyOf(manifest: TranslationManifest, pageIndex: number, texts: Map<string, string>) {
  let hash = 0;
  for (const [id, text] of texts) { const value = id + text; for (let index = 0; index < value.length; index += 7) hash = (hash * 31 + value.charCodeAt(index)) | 0; hash = (hash * 31 + value.length) | 0; }
  return `${manifest.documentId}:${manifest.createdAt}:${pageIndex}:${fontGeneration()}:${texts.size}:${hash}`;
}

/** Synchronous hit for pages already typeset with the current fonts; null when work is needed. */
export function cachedPageLayout(manifest: TranslationManifest, pageIndex: number, visible: ReadonlyMap<string, string>): PageLayout | null | undefined {
  const texts = pageTexts(manifest, pageIndex, visible);
  if (!texts.size) return null;
  return cache.get(keyOf(manifest, pageIndex, texts));
}

export async function pageLayout(manifest: TranslationManifest, pageIndex: number, visible: ReadonlyMap<string, string>, inkAt?: (rect: Rect) => boolean): Promise<PageLayout | null> {
  const texts = pageTexts(manifest, pageIndex, visible);
  if (!texts.size) return null;
  await ensurePaperFonts([...texts.values()].join(""));
  const key = keyOf(manifest, pageIndex, texts), hit = cache.get(key);
  if (hit) return hit;
  const started = performance.now();
  const layout = typesetPage({ manifest, pageIndex, measure: canvasMeasure(), translations: texts, inkAt });
  performance.measure("paperflow:typeset-page", { start: started });
  cache.set(key, layout);
  if (cache.size > LIMIT) cache.delete(cache.keys().next().value!);
  return layout;
}
