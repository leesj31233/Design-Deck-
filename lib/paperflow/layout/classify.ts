import type { PdfParagraph } from "./types";
import { CAPTION_START, isEquationLine, proseScore } from "./page-blocks";
import { median } from "./text-lines";

export type BlockRole = "TITLE" | "ABSTRACT" | "KEYWORDS" | "HEADING" | "BODY" | "CAPTION" | "TABLE" | "FIGURE_TEXT" | "AUTHOR" | "AFFILIATION" | "CONTACT" | "REFERENCE" | "EQUATION" | "HEADER" | "FOOTER" | "OTHER";
export type Section = "none" | "authors" | "references";
export interface Classified { role: BlockRole; reason: string | null }

const squash = (text: string) => text.replace(/[\s■●•]+/g, "").toLowerCase();
const FRONT_LABELS = /^(?:articleinfo|abstract|graphicalabstract|highlights|keywords?|articlehistory|metrics&more|access|articlerecommendations|readonline|supportinginformation|citethis|cite|journalhomepage.*|contentslistsavailable.*|openaccess|researchpaper|reviewarticle|originalarticle|fulllengtharticle|article|review)$/;
const STOP_SECTION = /^(?:[^A-Za-z]*)(?:references|bibliography|literature cited|author information|author contributions|declaration of competing interest|conflicts? of interest|credit authorship contribution statement|data availability|acknowledg(?:e)?ments?|funding|abbreviations)\b/i;
/** The heading of a reference list, in the languages papers arrive in (Indonesian, Korean, Japanese/Chinese, German, French, Spanish …). */
const REFERENCE_SECTION = /^(?:[^A-Za-z\uac00-\ud7a3\u3040-\u30ff\u4e00-\u9fff]*)(?:references|bibliography|literature cited|works cited|daftar pustaka|daftar rujukan|pustaka acuan|referensi|bibliografi|literatur(?:verzeichnis)?|quellenverzeichnis|références(?: bibliographiques)?|bibliographie|referencias(?: bibliográficas)?|bibliografía|riferimenti bibliografici|참고\s*문헌|인용\s*문헌|参考文献|引用文献)(?=$|[\s:.\d\[(])/i;

const YEAR = /\b(?:19|20)\d{2}[a-z]?\b/;
/**
 * A bibliography entry or a piece of one (hanging-indent lists split entries mid-way): numbered,
 * author initials ("Ng, K.H.; Yuan, L.S."), database links, or journal / DOI / volume-page marks with a year.
 */
export function looksLikeReference(text: string) {
  if (/^\s*(?:\[\d{1,4}\]|\(\d{1,4}\)|\d{1,4}[.)]\s+[A-Z])/.test(text)) return true;
  if (/\[(?:CrossRef|PubMed|Google Scholar|Green Version|PubMed Central)\]/i.test(text)) return true;
  if ((text.match(/\b[A-Z]\.(?:\s?-?[A-Z]\.)*[,;]/g) ?? []).length >= 2) return true;
  if (YEAR.test(text) && /\bdoi\b|doi\.org|\bet al\.|\bpp?\.\s*\d|\bvol\.|\bno\.\s*\d|\bproc\.|\bjournal\b|\bin:\s|\bisbn\b|\bissn\b|retrieved from|accessed|\d+\s*[(:]\s*\d+\)?\s*[,:]\s*\d+\s*[–-]\s*\d+|\b(?:19|20)\d{2}[a-z]?,\s*\d+(?:\s*\(\d+\))?,\s*\d+|\b[A-Z][a-z]{1,9}\.\s+[A-Z][a-z]{1,9}\./i.test(text)) return true;
  return YEAR.test(text) && text.length < 420 && /^[A-Z][A-Za-z'’-]+,?\s+(?:[A-Z]\.|[A-Z][a-z]+,)/.test(text);
}
/** A reference list ends where a new chapter or section begins, or where real prose resumes (books, theses, reports, patents). */
function endsReferenceList(block: PdfParagraph, value: string, bodySize: number) {
  if (looksLikeReference(value)) return false;
  // Running heads and footers ("Article" set larger than the small reference type) never end the list.
  if ((block.y < .07 || block.y > .93) && !/^(?:chapter|part)\s+[\dIVX]+/i.test(value)) return false;
  if (value.length < 90 && (/^(?:chapter|part|section|appendix)\s+[\dIVX]+/i.test(value) || /^\d{1,2}(?:\.\d{1,2})*\.?\s+[A-Z][A-Za-z]/.test(value) && !YEAR.test(value) && !/\)\.?\s*$/.test(value) || (block.fontSize ?? bodySize) >= bodySize * 1.2 && !YEAR.test(value))) return true;
  // Prose reads in lowercase function words with few numbers; entries are names, abbreviations and volume/page numbers.
  const score = proseScore(value), years = (value.match(/\b(?:19|20)\d{2}\b/g) ?? []).length;
  const numbers = (value.match(/\d+/g) ?? []).length, plain = (value.match(/\b(?:the|of|and|is|are|was|were|to|in|that|which|with|for|by|this|as)\b/g) ?? []).length;
  return score.words >= 30 && score.sentences >= 2 && years <= 1 && numbers <= score.words * .12 && (plain >= score.words * .15 || /[가-힣぀-ヿ一-鿿]{6}/.test(value));
}

export interface PageContext { pageIndex: number; bodySize: number; titleIndex: number; abstractIndex: number }

/** Page-1 anchors: the paper title is the biggest long block near the top; front matter sits between it and the abstract. */
export function pageContext(blocks: PdfParagraph[], pageIndex: number): PageContext {
  const bodySize = median(blocks.filter(block => block.text.length > 120).map(block => block.fontSize ?? 9)) || median(blocks.map(block => block.fontSize ?? 9)) || 9;
  if (pageIndex !== 0) return { pageIndex, bodySize, titleIndex: -1, abstractIndex: -1 };
  let titleIndex = -1, best = 0;
  blocks.forEach((block, index) => {
    const size = block.fontSize ?? 0;
    if (block.y > .5 || size < bodySize * 1.25 || block.text.length < 12 || /^https?:|^www\.|journal homepage|contents lists/i.test(block.text)) return;
    const score = size * Math.min(block.text.length, 160);
    if (score > best) { best = score; titleIndex = index; }
  });
  const abstractIndex = blocks.findIndex((block, index) => index > titleIndex && (/^(?:■\s*)?abstract\b/i.test(block.text) || squash(block.text).startsWith("abstract") || isFrontProse(block)));
  return { pageIndex, bodySize, titleIndex, abstractIndex };
}

function readsAsProse(text: string) {
  const score = proseScore(text), numbers = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).length;
  return score.words >= 15 && score.sentences >= 1 && numbers <= score.words * .15 && score.capitalRatio < .4;
}

function isFrontProse(block: PdfParagraph) {
  const score = proseScore(block.text);
  return score.words >= 25 && score.sentences >= 1 && score.capitalRatio < .45;
}

export function classifyBlock(block: PdfParagraph, index: number, context: PageContext, section: Section): Classified {
  const value = block.text.trim(), squashed = squash(value), size = block.fontSize ?? context.bodySize;
  if (block.hint === "furniture") return { role: "OTHER", reason: "glyph-noise" };
  if (section === "references" && !endsReferenceList(block, value, context.bodySize)) return { role: "REFERENCE", reason: "reference-section" };
  if (section === "authors") return { role: "AUTHOR", reason: "author-section" };
  // "References" alone, or run together with the first entry ("Daftar Pustaka Acharya, B., …").
  const referenceHead = value.match(REFERENCE_SECTION);
  if (referenceHead && (value.length < 40 || looksLikeReference(value.slice(referenceHead[0].length).trim()))) return { role: "REFERENCE", reason: "reference-section" };
  // Only a heading starts the back matter; a footnote that mentions authors must not.
  if (STOP_SECTION.test(value) && value.length < 45 && !/@|\.\s+\S/.test(value)) return { role: "OTHER", reason: "back-matter" };
  if (block.hint === "equation" || isEquationLine(value, block.width / Math.max(.05, (block.column?.right ?? 1) - (block.column?.left ?? 0))) && block.lines.length <= 2) return { role: "EQUATION", reason: "equation" };
  if (/^https?:\/\/|^(?:www\.|doi:|©|copyright)/i.test(value) || /©|all rights reserved|creativecommons|this article is licensed/i.test(value) && value.length < 260) return { role: "OTHER", reason: "copyright-or-link" };
  if (block.y < .065 && value.length < 160) return { role: "HEADER", reason: "page-header" };
  // Running heads sit a little lower in some templates (IOP, MDPI): recognise them by what they say.
  if (block.y < .1 && block.lines.length <= 2 && value.length < 200 && /\bdoi\b|doi\.org|\bvol\.|\bseries\b|proceedings|publishing|journal|conference|symposium|workshop|congress|issn|\b\d+\s+of\s+\d+\b|\(\d{4}\)\s*\d|\d{4},\s*\d+,\s*\d+/i.test(value)) return { role: "HEADER", reason: "page-header" };
  if (block.y > .93 && (value.length < 100 && proseScore(value).words < 9 || /doi|©|\d{4},\s*\d+,\s*\d+|^\d+$/i.test(value))) return { role: "FOOTER", reason: "page-footer" };
  if (/^(?:[*†‡⇑⁎§]|[a-z]\s)?\s*(?:corresponding author|e-?mail|tel\.?|fax|orcid)/i.test(value) || /\b[\w.-]+@[\w-]+\.[\w.]+/.test(value) && value.length < 300) return { role: "CONTACT", reason: "contact" };
  if (FRONT_LABELS.test(squashed)) return { role: "OTHER", reason: "front-label" };
  // An article-info block often runs "Article history … Keywords: …" together; keep it findable as keywords.
  if (/^keywords?\s*[:：]?/i.test(value) || block.hint === "keywords" || block.lineTexts?.some(line => /^keywords?\b/i.test(line.trim()))) return { role: "KEYWORDS", reason: "keywords" };
  if (/^(?:article history|received\b|accepted\b|available online|published\b|revised\b)/i.test(value) || /\breceived\b.*\baccepted\b/i.test(value) && value.length < 220) return { role: "OTHER", reason: "article-history" };
  if (/^(?:table of )?contents$/i.test(value) || /\.{4,}\s*\d+\s*$/.test(value) || (value.match(/\.{4,}/g) ?? []).length >= 2) return { role: "OTHER", reason: "contents" };
  if (context.pageIndex === 0 && context.titleIndex >= 0) {
    if (index === context.titleIndex) return { role: "TITLE", reason: "paper-title" };
    if (index < context.titleIndex) return { role: "HEADER", reason: "journal-masthead" };
    const beforeAbstract = context.abstractIndex < 0 || index < context.abstractIndex;
    if (beforeAbstract && !isFrontProse(block)) return { role: /universit|institut|department|school|laborator|college|academy|centre|center/i.test(value) ? "AFFILIATION" : "AUTHOR", reason: "front-matter" };
  }
  if (block.kind === "caption" || CAPTION_START.test(value)) return { role: "CAPTION", reason: null };
  // Loosely justified prose has word gaps as wide as table columns: sentences with few numbers stay body text.
  if (block.hint === "table" && !readsAsProse(value)) return { role: "TABLE", reason: "table-data" };
  // A "heading" that runs for many lines is prose that happens to start with a number.
  if (block.kind === "title" && block.lines.length <= 3) return size > context.bodySize * 1.6 && context.pageIndex === 0 ? { role: "TITLE", reason: "paper-title" } : { role: "HEADING", reason: null };
  const score = proseScore(value);
  const columnWidth = (block.column?.right ?? 1) - (block.column?.left ?? 0);
  const narrow = block.width < columnWidth * .45;
  const offEdge = block.x - (block.column?.left ?? 0) > .03 && block.lines.length <= 3;
  if (score.words < 3 && !/[.!?;:]\s*$/.test(value)) return { role: "FIGURE_TEXT", reason: "short-fragment" };
  if (size < context.bodySize * .8 && score.sentences === 0 && block.lines.length <= 3) return { role: "FIGURE_TEXT", reason: "small-label" };
  if ((narrow || offEdge) && score.sentences === 0 && score.words < 14) return { role: "FIGURE_TEXT", reason: "figure-label" };
  // Chemical reactions: an arrow between species with little prose around it.
  // Fonts without a Unicode map turn the arrow into "?"; species joined by " + " give a reaction away too.
  const reaction = /[→⇌⟶⇄↔]|\s\?\s/.test(value) || (value.match(/\s\+\s/g) ?? []).length >= 2 && /\b[A-Z][a-z]?\d|\b(?:CO|NO|SO|OH)\b/.test(value);
  if (reaction && score.sentences === 0 && (value.match(/\b[a-z]{3,}\b/g) ?? []).length < 6) return { role: "EQUATION", reason: "reaction" };
  // Abbreviation keys under tables ("FA: Fly ash; FYM: farmyard manure; …") stay as printed.
  if ((value.match(/\b[A-Z][A-Za-z0-9]{0,6}\s*[:=]\s*[^;:]{2,60};/g) ?? []).length >= 3) return { role: "TABLE", reason: "abbreviation-key" };
  // Display formula systems ("While Cl ratio (K2O + Na2O)/(SiO2 + Al2O3) ≥ 2.4") are artwork, not prose.
  if (block.lines.length <= 2 && score.sentences === 0 && !/[.!?]\s*$/.test(value) && block.width < columnWidth * .85 && /[()≥≤=]/.test(value) && (value.match(/\d/g) ?? []).length >= 3 && score.words < 12) return { role: "EQUATION", reason: "formula" };
  // A stack of 1–3 word lines with no sentence is a table column (row labels), not prose.
  if (block.lines.length >= 3 && score.sentences === 0 && score.words / block.lines.length <= 3.5 && !/[.!?]\s*$/.test(value)) return { role: "TABLE", reason: "table-column" };
  const numeric = (value.match(/(?:^|\s)[-+−]?\d+(?:[.,]\d+)?%?(?=\s|$)/g) ?? []).length;
  if (numeric >= 4 && numeric > score.words * .6) return { role: "TABLE", reason: "numeric-cells" };
  if (context.pageIndex === 0 && index === context.abstractIndex) return { role: "ABSTRACT", reason: null };
  return { role: "BODY", reason: null };
}

/** Pull "Keywords:" entries from a page-1 article-info block. */
export function extractKeywords(block: PdfParagraph): string[] {
  const lines = (block.lineTexts ?? [block.text]).map(line => line.trim()).filter(Boolean);
  const start = lines.findIndex(line => /^keywords?\b/i.test(line));
  if (start < 0) return [];
  const first = lines[start].replace(/^keywords?\s*[:：]?\s*/i, "");
  const raw = [first, ...lines.slice(start + 1)].join(lines.length - start > 2 ? "\n" : "; ");
  return [...new Set(raw.split(/[\n;,·•]+/).map(item => item.trim()).filter(item => item.length > 1 && item.length < 80))].slice(0, 20);
}

export function nextSection(role: BlockRole, reason: string | null, text: string, section: Section): Section {
  if (reason === "reference-section" && REFERENCE_SECTION.test(text)) return "references";
  // Anything classified on its own merits inside a reference list means the list is over.
  if (section === "references" && reason !== "reference-section") return "none";
  if (reason === "back-matter" && /author information|corresponding author/i.test(text)) return "authors";
  if (section === "authors" && role === "HEADING") return "none";
  return section;
}
