import type { StoredDocument } from "../persistence/types";
import type { ResearchProfile } from "../scholar/profile";
import { researchTerms } from "../translation/research-style";

/** How often a paper was opened: its open log, else 1 if it was ever read. */
export const opensOf = (doc: StoredDocument) => doc.opens?.length || (doc.lastOpenedAt || doc.visitedPages?.length ? 1 : 0);

/**
 * The cards of the library's "나의 연구 패턴" showcase, from the research profile of the whole pool:
 * the most-read author (by engagement) with how often I opened their papers, the top journals with
 * the cover of my most-read paper in each, keyword chips and totals.
 */
export function insightCards(profile: ResearchProfile, docs: StoredDocument[]) {
  const byId = new Map(docs.map(doc => [doc.id, doc]));
  const author = profile.authors[0];
  const reads = author ? author.papers.reduce((sum, id) => sum + (byId.has(id) ? opensOf(byId.get(id)!) : 0), 0) : 0;
  return {
    author: author ? { ...author, reads: Math.max(reads, author.papers.length), openAlex: /^A\d+$/.test(author.id) } : null,
    journals: profile.journals.slice(0, 3),
    keywords: profile.keywords.length ? profile.keywords.slice(0, 14).map(item => ({ name: item.name, papers: item.papers.length })) : titleTerms(docs),
    totals: profile.totals
  };
}

/** Before any keywords are known: the research terms that appear in the titles, most frequent first. */
function titleTerms(docs: StoredDocument[]) {
  const counts = new Map<string, number>();
  for (const doc of docs) for (const term of researchTerms) if (doc.title.toLowerCase().includes(term.toLowerCase())) counts.set(term, (counts.get(term) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([name, papers]) => ({ name, papers }));
}
