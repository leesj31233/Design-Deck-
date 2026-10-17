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
export interface WebLink { key: string; entity?: IntelEntity; item?: IntelItem; types: string[]; via: string[]; direction: "out" | "in" | "both"; notes: WebNote[] }

const SENTENCE = /(?<=[.!?。]|다\.|다)\s+/;
const textOf = (item: IntelItem) => [item.summaryKo, item.dossier?.headline, ...(item.dossier?.sections ?? []).map(section => section.body), ...(item.dossier?.facts ?? []).map(fact => `${fact.label}: ${fact.value}`)].filter(Boolean).join(" ");
/** The first sentence of an item that names one of these names (an organisation's name, aliases or its page title). */
function sentenceNaming(item: IntelItem, names: string[]) {
  const wanted = names.map(name => name.replace(/\(.*?\)/g, "").trim().toLowerCase()).filter(name => name.length >= 3);
  if (!wanted.length) return undefined;
  for (const sentence of textOf(item).replace(/\s+/g, " ").split(SENTENCE)) {
    const plain = sentence.replace(/\[[^\]]*\]\([^)]*\)/g, match => match.slice(1, match.indexOf("]"))).replace(/\*\*/g, "");
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
  const add = (target: IntelItem, type: string, via: string, direction: "out" | "in", evidence?: string) => {
    const other = index.byItem.get(target.id);
    if (other && family.has(other.code)) return;
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
      const found = evidence ?? sentenceNaming(carrier, names);
      link.notes.push({ type, via, viaTitle: titleOf(carrier), date: itemDate(carrier), text: found ?? titleOf(carrier), quoted: Boolean(found) });
    }
    links.set(key, link);
  };
  for (const id of own) for (const relation of byId.get(id)?.relations ?? []) { const target = byId.get(relation.to); if (target && !own.has(target.id)) add(target, relation.type, id, "out", relation.evidence); }
  for (const item of items) if (!own.has(item.id)) for (const relation of item.relations ?? []) if (own.has(relation.to)) add(item, relation.type, item.id, "in", relation.evidence);
  const rank = (link: WebLink) => Math.min(...link.types.map(type => { const at = WEB_ORDER.indexOf(type); return at < 0 ? WEB_ORDER.length : at; }));
  return [...links.values()].sort((a, b) => Number(Boolean(b.entity)) - Number(Boolean(a.entity)) || rank(a) - rank(b) || b.via.length - a.via.length);
}
