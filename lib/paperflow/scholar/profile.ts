import type { StoredDocument } from "../persistence/types";
import type { Annotation } from "../anchors/types";

/**
 * A reader's research profile from their own library. Each paper weighs by how much it was
 * actually studied (pages read, opens, highlights, notes), so a skimmed PDF counts less than a
 * paper read closely. Everything here is computed locally from the user's data.
 */
export interface Weighted { id: string; name: string; weight: number; papers: string[] }
export interface ProfileTopic extends Weighted { level: "domain" | "field" | "subfield" | "topic"; parent?: string; domain: string }
/** An author's part in one of my papers: first author, corresponding author, last (senior) author or co-author. */
export type AuthorRole = "first" | "corresponding" | "last" | "co";
export interface ProfileAuthor extends Weighted { orcid?: string; institution?: string; country?: string; firstAuthor: number; corresponding: number; roles: { paper: string; roles: AuthorRole[] }[] }
export interface ProfileJournal extends Weighted { publisher?: string; coverDocumentId: string }
export interface ResearchProfile {
  totals: { papers: number; analyzed: number; pagesRead: number; highlights: number; notes: number };
  topics: ProfileTopic[]; authors: ProfileAuthor[]; journals: ProfileJournal[]; institutions: (Weighted & { country?: string })[];
  publishers: Weighted[]; keywords: Weighted[]; years: { year: number; count: number }[];
  engagement: Map<string, number>;
}

export function paperEngagement(doc: StoredDocument, marks: Annotation[]) {
  const highlights = marks.filter(mark => mark.type === "highlight").length, notes = marks.filter(mark => mark.note?.trim() || mark.type === "note").length;
  return 1 + .4 * (doc.visitedPages?.length ?? 0) + .3 * Math.min(30, doc.opens?.length ?? 0) + highlights + 1.5 * notes;
}

function add<T extends Weighted>(map: Map<string, T>, id: string, make: () => T, weight: number, paper: string) {
  const item = map.get(id) ?? make();
  item.weight += weight;
  if (!item.papers.includes(paper)) item.papers.push(paper);
  map.set(id, item);
  return item;
}
const sorted = <T extends Weighted>(map: Map<string, T>) => [...map.values()].sort((a, b) => b.weight - a.weight || b.papers.length - a.papers.length);

export function researchProfile(docs: StoredDocument[], annotations: Annotation[]): ResearchProfile {
  const byDoc = new Map<string, Annotation[]>();
  for (const mark of annotations) byDoc.set(mark.documentId, [...(byDoc.get(mark.documentId) ?? []), mark]);
  const topics = new Map<string, ProfileTopic>(), authors = new Map<string, ProfileAuthor>(), journals = new Map<string, ProfileJournal>();
  const institutions = new Map<string, Weighted & { country?: string }>(), publishers = new Map<string, Weighted>(), keywords = new Map<string, Weighted>();
  const years = new Map<number, number>(), engagement = new Map<string, number>();
  let pagesRead = 0, highlights = 0, notes = 0, analyzed = 0;
  for (const doc of docs) {
    const marks = byDoc.get(doc.id) ?? [], weight = paperEngagement(doc, marks);
    engagement.set(doc.id, weight);
    pagesRead += doc.visitedPages?.length ?? 0;
    highlights += marks.filter(mark => mark.type === "highlight").length;
    notes += marks.filter(mark => mark.note?.trim() || mark.type === "note").length;
    const work = doc.scholar;
    const year = work?.year ?? doc.year;
    if (year) years.set(year, (years.get(year) ?? 0) + 1);
    for (const word of new Set([...(work?.keywords ?? []), ...(doc.keywords ?? [])].map(item => item.trim()).filter(Boolean))) add(keywords, word.toLowerCase(), () => ({ id: word.toLowerCase(), name: word, weight: 0, papers: [] }), weight, doc.id);
    if (!work) continue;
    analyzed++;
    // Topic hierarchy: each topic's share of the paper is its OpenAlex score, normalised per paper.
    const total = work.topics.reduce((sum, topic) => sum + topic.score, 0) || 1;
    for (const topic of work.topics) {
      const share = weight * topic.score / total;
      add(topics, topic.domain.id, () => ({ id: topic.domain.id, name: topic.domain.name, level: "domain" as const, domain: topic.domain.id, weight: 0, papers: [] }), share, doc.id);
      add(topics, topic.field.id, () => ({ id: topic.field.id, name: topic.field.name, level: "field" as const, parent: topic.domain.id, domain: topic.domain.id, weight: 0, papers: [] }), share, doc.id);
      add(topics, topic.subfield.id, () => ({ id: topic.subfield.id, name: topic.subfield.name, level: "subfield" as const, parent: topic.field.id, domain: topic.domain.id, weight: 0, papers: [] }), share, doc.id);
      add(topics, topic.id, () => ({ id: topic.id, name: topic.name, level: "topic" as const, parent: topic.subfield.id, domain: topic.domain.id, weight: 0, papers: [] }), share, doc.id);
    }
    for (const author of work.authors) {
      const item = add(authors, author.id || author.name, () => ({ id: author.id || author.name, name: author.name, orcid: author.orcid, institution: author.institutions[0]?.name, country: author.institutions[0]?.country, firstAuthor: 0, corresponding: 0, roles: [], weight: 0, papers: [] }), weight, doc.id);
      if (author.position === "first") item.firstAuthor++;
      if (author.corresponding) item.corresponding++;
      const roles: AuthorRole[] = [...(author.position === "first" ? ["first" as const] : []), ...(author.corresponding ? ["corresponding" as const] : []), ...(author.position === "last" && work.authors.length > 1 ? ["last" as const] : [])];
      if (!item.roles.some(entry => entry.paper === doc.id)) item.roles.push({ paper: doc.id, roles: roles.length ? roles : ["co"] });
      for (const institution of author.institutions) add(institutions, institution.id || institution.name, () => ({ id: institution.id || institution.name, name: institution.name, country: institution.country, weight: 0, papers: [] }), weight / Math.max(1, work.authors.length), doc.id);
    }
    if (work.source) {
      const journal = add(journals, work.source.id, () => ({ id: work.source!.id, name: work.source!.name, publisher: work.source!.publisher, coverDocumentId: doc.id, weight: 0, papers: [] }), weight, doc.id);
      // The cover is the most-studied paper of that journal in this library.
      if (weight >= (engagement.get(journal.coverDocumentId) ?? 0)) journal.coverDocumentId = doc.id;
      if (work.source.publisher) add(publishers, work.source.publisher, () => ({ id: work.source!.publisher!, name: work.source!.publisher!, weight: 0, papers: [] }), weight, doc.id);
    }
  }
  return {
    totals: { papers: docs.length, analyzed, pagesRead, highlights, notes },
    topics: sorted(topics), authors: sorted(authors), journals: sorted(journals), institutions: sorted(institutions), publishers: sorted(publishers),
    keywords: sorted(keywords).filter(item => item.papers.length > 1 || item.weight > 3).slice(0, 60),
    years: [...years].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year), engagement
  };
}

export interface MapNode { id: string; label: string; kind: "domain" | "field" | "subfield" | "topic" | "paper" | "author" | "journal"; size: number; color: string; domain?: string; weight: number }
export interface MapEdge { source: string; target: string; weight: number }

const DOMAIN_COLORS: Record<string, string> = { "domains/3": "#3b82f6", "domains/1": "#16a34a", "domains/4": "#e11d48", "domains/2": "#d97706" };
export const domainColor = (domain?: string) => (domain && DOMAIN_COLORS[domain]) || "#7c6cf2";

/** Graph for the research map: the topic hierarchy, the papers under their topics, and optionally the top authors and journals. */
export function researchGraph(profile: ResearchProfile, docs: StoredDocument[], layers: { authors?: boolean; journals?: boolean } = {}) {
  const nodes: MapNode[] = [], edges: MapEdge[] = [], max = Math.max(1, ...profile.topics.map(topic => topic.weight));
  const scale = (weight: number, min: number, top: number) => min + (top - min) * Math.sqrt(weight / max);
  const sizes = { domain: [16, 34], field: [10, 26], subfield: [7, 19], topic: [4, 14] } as const;
  for (const topic of profile.topics) {
    nodes.push({ id: topic.id, label: topic.name, kind: topic.level, size: scale(topic.weight, sizes[topic.level][0], sizes[topic.level][1]), color: domainColor(topic.domain), domain: topic.domain, weight: topic.weight });
    if (topic.parent) edges.push({ source: topic.parent, target: topic.id, weight: 2 });
  }
  const topicIds = new Set(profile.topics.map(topic => topic.id));
  const maxPaper = Math.max(1, ...profile.engagement.values());
  for (const doc of docs) {
    const weight = profile.engagement.get(doc.id) ?? 1;
    nodes.push({ id: `paper:${doc.id}`, label: doc.title, kind: "paper", size: 2.5 + 6 * Math.sqrt(weight / maxPaper), color: "#94a3b8", domain: doc.scholar?.topics[0]?.domain.id, weight });
    for (const topic of doc.scholar?.topics ?? []) if (topicIds.has(topic.id)) edges.push({ source: topic.id, target: `paper:${doc.id}`, weight: topic.score });
  }
  if (layers.authors) for (const author of profile.authors.filter(item => item.papers.length > 1 || item.weight > 6).slice(0, 30)) {
    nodes.push({ id: `author:${author.id}`, label: author.name, kind: "author", size: 4 + 8 * Math.sqrt(author.weight / maxPaper / Math.max(1, author.papers.length)) + author.papers.length, color: "#0ea5a4", weight: author.weight });
    for (const paper of author.papers) edges.push({ source: `author:${author.id}`, target: `paper:${paper}`, weight: .6 });
  }
  if (layers.journals) for (const journal of profile.journals.slice(0, 15)) {
    nodes.push({ id: `journal:${journal.id}`, label: journal.name, kind: "journal", size: 6 + 2.5 * journal.papers.length, color: "#a855f7", weight: journal.weight });
    for (const paper of journal.papers) edges.push({ source: `journal:${journal.id}`, target: `paper:${paper}`, weight: .5 });
  }
  return { nodes, edges };
}
