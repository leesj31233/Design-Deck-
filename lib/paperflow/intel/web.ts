import { entityItems, type IntelEntity, type indexRegistry } from "./registry";
import type { IntelItem } from "./types";

/**
 * An organisation's web: every other organisation (or, when it has none, the project or document itself) that
 * its items point to, or whose items point at it — investor, operator, partner, supplier, buyer, vendor,
 * certifier — with the items that carry each link, so every line on the map can be traced to a source.
 */
export const WEB_LABEL: Record<string, string> = { investor: "투자·모회사", operator: "운영", partner: "협력", supplier: "공급", buyer: "구매", vendor: "장비 공급", certifier: "인증", competitor: "경쟁", technology: "기술 기반", mentions: "언급" };
export const WEB_ORDER = ["investor", "operator", "partner", "buyer", "supplier", "vendor", "certifier", "competitor", "technology", "mentions"];
export interface WebLink { key: string; entity?: IntelEntity; item?: IntelItem; types: string[]; via: string[]; direction: "out" | "in" | "both" }

type Index = ReturnType<typeof indexRegistry>;
export function entityWeb(entity: IntelEntity, index: Index, byId: Map<string, IntelItem>, items: IntelItem[]): WebLink[] {
  const family = new Set([entity.code, ...(index.children.get(entity.code) ?? []).map(child => child.code)]);
  const own = new Set([entity.canonicalItemId, ...entityItems(entity, index, byId).map(item => item.id)].filter((id): id is string => Boolean(id)));
  const links = new Map<string, WebLink>();
  const add = (target: IntelItem, type: string, via: string, direction: "out" | "in") => {
    const other = index.byItem.get(target.id);
    if (other && family.has(other.code)) return;
    const key = other ? `entity:${other.code}` : `item:${target.id}`;
    const link = links.get(key) ?? { key, entity: other, item: other ? undefined : target, types: [], via: [], direction };
    if (!link.types.includes(type)) link.types.push(type);
    if (!link.via.includes(via)) link.via.push(via);
    if (link.direction !== direction) link.direction = "both";
    links.set(key, link);
  };
  for (const id of own) for (const relation of byId.get(id)?.relations ?? []) { const target = byId.get(relation.to); if (target && !own.has(target.id)) add(target, relation.type, id, "out"); }
  for (const item of items) if (!own.has(item.id)) for (const relation of item.relations ?? []) if (own.has(relation.to)) add(item, relation.type, item.id, "in");
  const rank = (link: WebLink) => Math.min(...link.types.map(type => { const at = WEB_ORDER.indexOf(type); return at < 0 ? WEB_ORDER.length : at; }));
  return [...links.values()].sort((a, b) => Number(Boolean(b.entity)) - Number(Boolean(a.entity)) || rank(a) - rank(b) || b.via.length - a.via.length);
}
