import type { ResearchProfile } from "../scholar/profile";
import type { StoredDocument } from "../persistence/types";

export type WikiKind = "field" | "subfield" | "topic" | "paper" | "author" | "journal" | "unsorted";
export interface WikiNode { id: string; label: string; kind: WikiKind; r: number; color: string; field: string; weight: number; papers: string[]; year?: number }
export interface WikiEdge { source: string; target: string; kind: "tree" | "paper" | "related" | "author" | "journal"; weight: number }
export interface WikiOptions { depth: "field" | "subfield" | "topic"; papers: boolean; authors: boolean; journals: boolean; hidden: Set<string> }
export interface FieldSummary { id: string; name: string; color: string; weight: number; papers: number; share: number }

/** Field colours that read on a night sky and on ivory paper alike. */
const PALETTE = ["#4f8cff", "#2bb673", "#f2994a", "#b06cf0", "#e5566f", "#21b5c7", "#d9b23b", "#6c7cf5", "#7fbf3f", "#ef6fb2", "#3fa7a0", "#c98552"];
const UNSORTED = "unsorted";

/**
 * The research map as a wiki graph: fields I read are the hubs (sized by how much I actually read
 * in them), their subfields and topics hang off them, every paper is a small dot on its topics, and
 * fields that share papers are tied by a "related" link. Authors and journals are optional layers.
 */
export function wikiGraph(profile: ResearchProfile, docs: StoredDocument[], options: WikiOptions) {
  const fields = profile.topics.filter(topic => topic.level === "field");
  const colorOf = new Map(fields.map((field, index) => [field.id, PALETTE[index % PALETTE.length]]));
  const byId = new Map(profile.topics.map(topic => [topic.id, topic]));
  const fieldOf = (id: string): string => { let topic = byId.get(id); while (topic && topic.level !== "field") topic = topic.parent ? byId.get(topic.parent) : undefined; return topic?.id ?? UNSORTED; };
  const visible = (id: string) => !options.hidden.has(fieldOf(id));
  const levels = options.depth === "field" ? ["field"] : options.depth === "subfield" ? ["field", "subfield"] : ["field", "subfield", "topic"];
  const max = { field: 1, subfield: 1, topic: 1 } as Record<string, number>;
  for (const topic of profile.topics) if (topic.level !== "domain") max[topic.level] = Math.max(max[topic.level] ?? 1, topic.weight);
  const radius = (weight: number, top: number, min: number, high: number) => min + (high - min) * Math.sqrt(weight / Math.max(1, top));
  const sizes: Record<string, [number, number]> = { field: [16, 46], subfield: [8, 24], topic: [5, 15] };
  const nodes: WikiNode[] = [], edges: WikiEdge[] = [];
  const shown = new Set<string>();
  for (const topic of profile.topics) {
    if (!levels.includes(topic.level) || !visible(topic.id)) continue;
    const field = fieldOf(topic.id);
    nodes.push({ id: topic.id, label: topic.name, kind: topic.level as WikiKind, r: radius(topic.weight, max[topic.level], ...sizes[topic.level]), color: colorOf.get(field) ?? "#8a94a6", field, weight: topic.weight, papers: topic.papers });
    shown.add(topic.id);
    if (topic.parent && topic.level !== "field") edges.push({ source: topic.parent, target: topic.id, kind: "tree", weight: 1 });
  }
  // A paper hangs off the deepest shown level of each of its topics.
  const anchorOf = (topicId: string) => { let topic = byId.get(topicId); while (topic && !shown.has(topic.id)) topic = topic.parent ? byId.get(topic.parent) : undefined; return topic?.id; };
  const maxPaper = Math.max(1, ...profile.engagement.values());
  const unsorted = docs.filter(doc => !doc.scholar?.topics.length);
  if (unsorted.length && !options.hidden.has(UNSORTED)) {
    nodes.push({ id: UNSORTED, label: "분석 전 논문", kind: "unsorted", r: radius(unsorted.length, Math.max(1, docs.length), 12, 30), color: "#8a94a6", field: UNSORTED, weight: unsorted.length, papers: unsorted.map(doc => doc.id) });
    shown.add(UNSORTED);
  }
  if (options.papers) for (const doc of docs) {
    const topics = doc.scholar?.topics ?? [];
    const anchors = [...new Set(topics.map(topic => anchorOf(topic.id)).filter((id): id is string => Boolean(id)))];
    if (!topics.length && shown.has(UNSORTED)) anchors.push(UNSORTED);
    if (!anchors.length) continue;
    const weight = profile.engagement.get(doc.id) ?? 1, primary = anchors[0];
    nodes.push({ id: `paper:${doc.id}`, label: doc.title.replace(/\.pdf$/i, ""), kind: "paper", r: 2.6 + 3.6 * Math.sqrt(weight / maxPaper), color: nodes.find(node => node.id === primary)?.color ?? "#8a94a6", field: primary === UNSORTED ? UNSORTED : fieldOf(primary), weight, papers: [doc.id], year: doc.scholar?.year ?? doc.year });
    anchors.forEach((anchor, index) => edges.push({ source: anchor, target: `paper:${doc.id}`, kind: "paper", weight: index === 0 ? 1 : .35 }));
  }
  // Fields read together: a link between two fields for every paper they share.
  const shownFields = fields.filter(field => shown.has(field.id));
  for (let a = 0; a < shownFields.length; a++) for (let b = a + 1; b < shownFields.length; b++) {
    const shared = shownFields[a].papers.filter(id => shownFields[b].papers.includes(id)).length;
    if (shared) edges.push({ source: shownFields[a].id, target: shownFields[b].id, kind: "related", weight: shared });
  }
  const paperIds = new Set(nodes.filter(node => node.kind === "paper").map(node => node.id));
  if (options.authors && paperIds.size) for (const author of profile.authors.filter(item => item.papers.length > 1).slice(0, 24)) {
    const links = author.papers.filter(id => paperIds.has(`paper:${id}`));
    if (!links.length) continue;
    nodes.push({ id: `author:${author.id}`, label: author.name, kind: "author", r: 4 + 2 * links.length, color: "#9aa5b8", field: "", weight: author.weight, papers: author.papers });
    for (const id of links) edges.push({ source: `author:${author.id}`, target: `paper:${id}`, kind: "author", weight: .4 });
  }
  if (options.journals && paperIds.size) for (const journal of profile.journals.slice(0, 14)) {
    const links = journal.papers.filter(id => paperIds.has(`paper:${id}`));
    if (!links.length) continue;
    nodes.push({ id: `journal:${journal.id}`, label: journal.name, kind: "journal", r: 5 + 2 * links.length, color: "#c3a6f5", field: "", weight: journal.weight, papers: journal.papers });
    for (const id of links) edges.push({ source: `journal:${journal.id}`, target: `paper:${id}`, kind: "journal", weight: .4 });
  }
  // Topics sit at the mean year of their papers on the time axis.
  const yearOf = new Map(docs.map(doc => [doc.id, doc.scholar?.year ?? doc.year]));
  for (const node of nodes) if (node.kind !== "paper" && !node.year) { const years = node.papers.map(id => yearOf.get(id)).filter((year): year is number => Boolean(year)); if (years.length) node.year = Math.round(years.reduce((sum, year) => sum + year, 0) / years.length); }
  const ids = new Set(nodes.map(node => node.id));
  return { nodes, edges: edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
}

/** The research pool: every field I read, its colour, its share of my reading. */
export function fieldSummary(profile: ResearchProfile, docs: StoredDocument[]): FieldSummary[] {
  const fields = profile.topics.filter(topic => topic.level === "field"), total = fields.reduce((sum, field) => sum + field.weight, 0) || 1;
  const list = fields.map((field, index) => ({ id: field.id, name: field.name, color: PALETTE[index % PALETTE.length], weight: field.weight, papers: field.papers.length, share: field.weight / total }));
  const unsorted = docs.filter(doc => !doc.scholar?.topics.length).length;
  return unsorted ? [...list, { id: UNSORTED, name: "분석 전 논문", color: "#8a94a6", weight: 0, papers: unsorted, share: 0 }] : list;
}
