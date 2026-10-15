import type { StoredDocument } from "../persistence/types";
import type { IntelItem } from "./types";

/** The PDF behind an item: its pdfUrl, or its own URL when that is a PDF. */
export function pdfUrlOf(item: Pick<IntelItem, "pdfUrl" | "url">): string | undefined {
  if (item.pdfUrl) return item.pdfUrl;
  return item.url && /\.pdf($|[?#])/i.test(item.url) ? item.url : undefined;
}

/** The file name a PDF gets when it is brought into the library from the Intelligence tab. */
export const libraryName = (title: string) => `${title.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 90).trim()}.pdf`;

const live = (docs: StoredDocument[]) => docs.filter(doc => !doc.deletedAt);

/** The library copy of an item: the one the reader linked, the one the research routine put there, or one already imported under the same name. */
export function linkedDoc(item: IntelItem, docs: StoredDocument[]): StoredDocument | undefined {
  const active = live(docs);
  return (item.user?.docId ? active.find(doc => doc.id === item.user!.docId) : undefined)
    ?? (item.libraryDoc ? active.find(doc => doc.id === item.libraryDoc) : undefined)
    ?? active.find(doc => doc.filename === libraryName(item.title || item.id));
}

const COMMON = new Set(["the", "and", "for", "with", "from", "report", "annual", "market", "markets", "issue", "palm", "biomass", "pdf", "final", "draft", "efb", "2024", "2025", "2026"]);
const words = (text: string) => new Set(text.toLowerCase().normalize("NFKD").split(/[^\p{L}\p{N}]+/u).filter(word => word.length >= 3 && !/^\d{1,2}$/.test(word)));

/**
 * A library PDF that looks like the item's document (a paid report the reader uploaded, say): at
 * least two shared words, one of them distinctive (a name, not "market" or "report").
 */
export function suggestDoc(item: IntelItem, docs: StoredDocument[]): StoredDocument | undefined {
  const mine = words(`${item.title} ${item.org ?? ""}`);
  let best: { doc: StoredDocument; score: number } | undefined;
  for (const doc of live(docs)) {
    const shared = [...words(`${doc.filename.replace(/\.pdf$/i, "")} ${doc.title}`)].filter(word => mine.has(word));
    const distinctive = shared.filter(word => !COMMON.has(word)).length;
    const score = shared.length + distinctive;
    if (shared.length >= 2 && distinctive >= 1 && (!best || score > best.score)) best = { doc, score };
  }
  return best?.doc;
}
