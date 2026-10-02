import type { TranslationManifest } from "./manifest";

const GENERIC = new Set(["about", "after", "among", "analysis", "approach", "based", "between", "case", "comparison", "during", "effect", "effects", "evaluation", "experimental", "from", "further", "improved", "influence", "insight", "insights", "into", "investigation", "issues", "method", "methods", "model", "modeling", "modelling", "novel", "numerical", "performance", "perspective", "progress", "related", "review", "role", "simulation", "studies", "study", "system", "systems", "their", "through", "toward", "towards", "under", "using", "various", "with", "within"]);

/**
 * Paper-specific terms the translator must keep in English: the author keywords plus the
 * technical words of the title. Keeps the same term from being "cofiring" on one page and
 * "동소각" on the next.
 */
export function paperGlossary(manifest: TranslationManifest): string[] {
  const title = manifest.blocks.find(block => block.role === "TITLE")?.text ?? "";
  const titleTerms = title.split(/[\s:;,()/]+/).map(word => word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9-]+$/g, "")).filter(word => /[A-Za-z]/.test(word) && (word.length >= 5 || /-/.test(word) || (word.match(/[A-Z]/g) ?? []).length >= 2) && !GENERIC.has(word.toLowerCase()));
  const terms = [...manifest.keywords, ...titleTerms].map(term => /^[A-Z][a-z]/.test(term) && !/[A-Z].*[A-Z]/.test(term.slice(1)) ? term.toLowerCase() : term);
  return [...new Set(terms)].filter(term => term.length <= 40).slice(0, 30);
}
