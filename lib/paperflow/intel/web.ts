import { entityItems, type IntelEntity, type indexRegistry } from "./registry";
import { itemDate, type IntelItem } from "./types";

/**
 * An organisation's web: every other organisation (or, when it has none, the project or document itself) that
 * its items point to, or whose items point at it — investor, operator, partner, supplier, buyer, vendor,
 * certifier — with the items that carry each link and the sentence that states it, so every line on the map can
 * be read and traced to a source.
 */
export const WEB_LABEL: Record<string, string> = { investor: "투자·모회사", operator: "운영", partner: "협력", supplier: "공급", buyer: "구매", vendor: "장비 공급", certifier: "인증", competitor: "경쟁", technology: "기술 기반", mentions: "언급" };
export const WEB_ORDER = ["investor", "operator", "partner", "buyer", "supplier", "vendor", "certifier", "competitor", "technology", "mentions"];
/** One reason for a link: its kind, the item that carries it (with its date) and the sentence that says so. */
export interface WebNote { type: string; via: string; viaTitle: string; date?: string; text: string; quoted: boolean }
export interface WebLink { key: string; entity?: IntelEntity; item?: IntelItem; types: string[]; via: string[]; direction: "out" | "in" | "both"; notes: WebNote[]; /** For a competitor: the field both compete in (a topic id). */ segment?: string }
/** Relations that are facts between two parties; the others (shared technology, competition, a mention) are context. */
export const DIRECT = new Set(["investor", "operator", "partner", "supplier", "buyer", "vendor", "certifier"]);
export const isDirect = (link: WebLink) => link.types.some(type => DIRECT.has(type));
/** A sentence as plain text: no bold marks, links reduced to their labels. */
export const plainText = (text: string) => text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

const SENTENCE = /(?<=[.!?。]|다\.|다)\s+/;
const textOf = (item: IntelItem) => [item.summaryKo, item.dossier?.headline, ...(item.dossier?.sections ?? []).map(section => section.body), ...(item.dossier?.facts ?? []).map(fact => `${fact.label}: ${fact.value}`)].filter(Boolean).join(" ");
/** The first sentence of an item that names one of these names (an organisation's name, aliases or its page title). */
function sentenceNaming(item: IntelItem, names: string[]) {
  const wanted = names.map(name => name.replace(/\(.*?\)/g, "").trim().toLowerCase()).filter(name => name.length >= 3);
  if (!wanted.length) return undefined;
  for (const sentence of textOf(item).replace(/\s+/g, " ").split(SENTENCE)) {
    const plain = plainText(sentence);
    if (wanted.some(name => plain.toLowerCase().includes(name))) return plain.trim().slice(0, 260);
  }
  return undefined;
}
const titleOf = (item: IntelItem) => (item.titleKo ?? item.title).split(/ [—–] /)[0];

type Index = ReturnType<typeof indexRegistry>;
export function entityWeb(entity: IntelEntity, index: Index, byId: Map<string, IntelItem>, items: IntelItem[]): WebLink[] {
  const family = new Set([entity.code, ...(index.children.get(entity.code) ?? []).map(child => child.code)]);
  const own = new Set([entity.canonicalItemId, ...entityItems(entity, index, byId).map(item => item.id)].filter((id): id is string => Boolean(id)));
  const ownNames = [entity.name, ...entity.aliases];
  const links = new Map<string, WebLink>();
  // A group shows once: a subsidiary or sister company is drawn as its group (TESS Holdings, not also Tess
  // Engineering), unless the centre itself is that group's top.
  const rootOf = (start: IntelEntity) => { let at = start; for (let hops = 0; at.parentCode && index.byCode.get(at.parentCode) && hops < 6; hops++) at = index.byCode.get(at.parentCode)!; return at; };
  const centreRoot = rootOf(entity);
  const add = (target: IntelItem, type: string, via: string, direction: "out" | "in", evidence?: string) => {
    let other = index.byItem.get(target.id);
    if (other && family.has(other.code)) return;
    if (other && centreRoot.code !== entity.code || other && rootOf(other).code !== centreRoot.code) other = rootOf(other!);
    if (other && family.has(other.code)) return;
    // A publisher, analyst or price reporter (Argus, Platts, a statistics office…) only reports on the company:
    // whatever the stored type, that is a mention, not a technology or trade relation.
    if (other?.category === "market") type = "mentions";
    // Without an organisation, only a project or plant is a counterpart; a news item or report is evidence, not a party.
    if (!other && !["project", "company", "vendor", "equipment"].includes(target.kind)) return;
    const key = other ? `entity:${other.code}` : `item:${target.id}`;
    const link = links.get(key) ?? { key, entity: other, item: other ? undefined : target, types: [], via: [], direction, notes: [] };
    if (!link.types.includes(type)) link.types.push(type);
    if (!link.via.includes(via)) link.via.push(via);
    if (link.direction !== direction) link.direction = "both";
    // The sentence: the one stored with the relation, else the carrying item's sentence that names the other side,
    // else the carrying item's title.
    const carrier = byId.get(via);
    if (carrier && link.notes.length < 4 && !link.notes.some(note => note.via === via && note.type === type)) {
      const names = direction === "out" ? [...(other ? [other.name, ...other.aliases] : []), titleOf(target)] : ownNames;
      const found = evidence ? plainText(evidence) : sentenceNaming(carrier, names);
      link.notes.push({ type, via, viaTitle: titleOf(carrier), date: itemDate(carrier), text: found ?? titleOf(carrier), quoted: Boolean(found) });
    }
    links.set(key, link);
  };
  for (const id of own) for (const relation of byId.get(id)?.relations ?? []) { const target = byId.get(relation.to); if (target && !own.has(target.id)) add(target, relation.type, id, "out", relation.evidence); }
  for (const item of items) if (!own.has(item.id)) for (const relation of item.relations ?? []) if (own.has(relation.to)) add(item, relation.type, item.id, "in", relation.evidence);
  // A competitor only within a named field: the most specific topic both sides' items share (e.g. 반탄화, 바이오차
  // 생산). Without a shared field it is not called a competitor, only a mention.
  const topicsOf = (codes: IntelEntity, extra: IntelItem[] = []) => { const counts = new Map<string, number>(); for (const item of [...entityItems(codes, index, byId), ...extra]) for (const topic of item.topics) counts.set(topic, (counts.get(topic) ?? 0) + 1); return counts; };
  const ownTopics = topicsOf(entity, entity.canonicalItemId && byId.get(entity.canonicalItemId) ? [byId.get(entity.canonicalItemId)!] : []);
  const BROAD = new Set(["vendors", "producers", "market-demand", "market-price", "palm-byproducts", "policy", "feedstock-supply", "efb-pome-impact"]);
  for (const link of links.values()) {
    if (!link.types.includes("competitor")) continue;
    const theirs = link.entity ? topicsOf(link.entity, link.entity.canonicalItemId && byId.get(link.entity.canonicalItemId) ? [byId.get(link.entity.canonicalItemId)!] : []) : topicsOf(entity, link.item ? [link.item] : []);
    const shared = [...ownTopics.keys()].filter(topic => theirs.has(topic) && !BROAD.has(topic)).sort((a, b) => (theirs.get(b)! + ownTopics.get(b)!) - (theirs.get(a)! + ownTopics.get(a)!));
    if (shared.length) link.segment = shared[0];
    else { link.types = link.types.map(type => type === "competitor" ? "mentions" : type); for (const note of link.notes) if (note.type === "competitor") note.type = "mentions"; }
  }
  const rank = (link: WebLink) => Math.min(...link.types.map(type => { const at = WEB_ORDER.indexOf(type); return at < 0 ? WEB_ORDER.length : at; }));
  return [...links.values()].sort((a, b) => Number(Boolean(b.entity)) - Number(Boolean(a.entity)) || rank(a) - rank(b) || b.via.length - a.via.length);
}
