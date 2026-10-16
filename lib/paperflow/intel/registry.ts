import { isClass, itemClasses, type IntelClass, type IntelItem } from "./types";

/**
 * The entity registry: every organisation once, with NAYSOR's own code (home country + number, "JP-01"),
 * a category, its parent, and the items that are about it. Items stay as they are; the registry says
 * which organisation each belongs to, so one company page gathers its subsidiaries, projects, news and
 * documents however many times the organisation was collected.
 */
export type EntityCategory = "company" | "vendor" | "certification" | "market" | "agency" | "association" | "research";
export interface IntelEntity {
  code: string; name: string; legalName?: string; category: EntityCategory; tier?: 1 | 2 | 3;
  parentCode?: string; country?: string; website?: string; aliases: string[];
  canonicalItemId?: string; itemIds: string[]; mentionIds: string[]; focus?: string; note?: string;
  /** What an equipment supplier supplies (several kinds per supplier). */
  equipmentTypes?: EquipmentType[];
  /** Class 1 (EFB/POME pellets, biochar) and/or Class 2 (low-rank coal upgrading); read from its items when unset. */
  classes?: IntelClass[];
}
export interface IntelRegistry { version: 1; generatedAt: string; entities: IntelEntity[] }

export const CATEGORY_LABEL: Record<EntityCategory, string> = { company: "기업", vendor: "장비 벤더", certification: "인증", market: "마켓", agency: "기관", association: "협회", research: "연구" };
/** Equipment kinds along the EFB line, in process order, then utilities and services. */
export const EQUIPMENT_TYPES = [["shredder", "파쇄기"], ["washer", "세척기"], ["screw-press", "스크류 프레스"], ["dewatering", "탈수기"], ["dryer", "건조기"], ["pelletizing", "펠릿화"], ["thermal", "반탄화·탄화"], ["water", "필터·수처리"], ["boiler", "보일러·에너지"], ["piping", "배관·이송"], ["epc", "플랜트 EPC·토목"], ["service", "부품·대리점"]] as const;
export type EquipmentType = typeof EQUIPMENT_TYPES[number][0];
export const EQUIPMENT_LABEL = Object.fromEntries(EQUIPMENT_TYPES) as Record<EquipmentType, string>;
const EQUIPMENT_KEYS = new Set<string>(EQUIPMENT_TYPES.map(([key]) => key));
export const CATEGORY_ORDER: EntityCategory[] = ["company", "vendor", "certification", "market", "agency", "association", "research"];
export const FOCUS_LABEL: Record<string, string> = { biochar: "바이오차", "white-pellet": "화이트 펠릿", "black-pellet": "블랙 펠릿", cofiring: "혼소", cdr: "탄소제거", pome: "POME", equipment: "설비", market: "시장", policy: "정책" };
const CATEGORIES = new Set<string>(CATEGORY_ORDER);
export const REGISTRY_BRIEF = "__registry__";

const str = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
const ids = (value: unknown) => Array.isArray(value) ? [...new Set(value.flatMap(entry => typeof entry === "string" && /^[\w.:-]{1,120}$/.test(entry) ? [entry] : []))].slice(0, 400) : [];

/** Checks a registry field by field: codes like "JP-01" / "XX-03", known categories, ids as plain strings. */
export function cleanRegistry(value: unknown): IntelRegistry | null {
  const raw = value as { entities?: unknown; generatedAt?: unknown } | null;
  if (!raw || !Array.isArray(raw.entities)) return null;
  const seen = new Set<string>();
  const entities = raw.entities.slice(0, 3000).flatMap(entry => {
    const e = entry as Record<string, unknown>, code = str(e?.code, 12), name = str(e?.name, 120), category = str(e?.category, 20);
    if (!code || !/^[A-Z]{2}-\d{2,4}$/.test(code) || seen.has(code) || !name || !category || !CATEGORIES.has(category)) return [];
    seen.add(code);
    const tier = Number(e.tier);
    return [{ code, name, legalName: str(e.legalName, 200), category: category as EntityCategory, tier: tier === 1 || tier === 2 || tier === 3 ? tier as 1 | 2 | 3 : undefined,
      parentCode: str(e.parentCode, 12), country: str(e.country, 60), website: typeof e.website === "string" && /^https?:\/\//.test(e.website) ? e.website.slice(0, 300) : undefined,
      aliases: Array.isArray(e.aliases) ? e.aliases.flatMap(alias => str(alias, 120) ? [str(alias, 120)!] : []).slice(0, 20) : [],
      canonicalItemId: typeof e.canonicalItemId === "string" && /^[\w.:-]{1,120}$/.test(e.canonicalItemId) ? e.canonicalItemId : undefined,
      itemIds: ids(e.itemIds), mentionIds: ids(e.mentionIds), focus: str(e.focus, 30), note: str(e.note, 400),
      equipmentTypes: Array.isArray(e.equipmentTypes) ? [...new Set(e.equipmentTypes.filter((type): type is EquipmentType => typeof type === "string" && EQUIPMENT_KEYS.has(type)))] : undefined,
      classes: Array.isArray(e.classes) && e.classes.some(isClass) ? [...new Set(e.classes.filter(isClass))] : undefined }];
  });
  for (const entity of entities) if (entity.parentCode && !seen.has(entity.parentCode)) entity.parentCode = undefined;
  return entities.length ? { version: 1, generatedAt: str(raw.generatedAt, 40) ?? new Date().toISOString(), entities } : null;
}

/** Lookups over a registry: entity by code, an item's entity, children of an entity. */
export function indexRegistry(registry: IntelRegistry | null) {
  const byCode = new Map<string, IntelEntity>(), byItem = new Map<string, IntelEntity>(), children = new Map<string, IntelEntity[]>();
  for (const entity of registry?.entities ?? []) {
    byCode.set(entity.code, entity);
    if (entity.canonicalItemId) byItem.set(entity.canonicalItemId, entity);
    for (const id of entity.itemIds) if (!byItem.has(id)) byItem.set(id, entity);
  }
  for (const entity of registry?.entities ?? []) if (entity.parentCode) children.set(entity.parentCode, [...(children.get(entity.parentCode) ?? []), entity]);
  return { byCode, byItem, children };
}

/** An organisation's classes: as written, else every class its own items carry (Class 1 when it has none). */
export function entityClasses(entity: IntelEntity, byId: Map<string, IntelItem>): IntelClass[] {
  if (entity.classes?.length) return entity.classes;
  const found = new Set<IntelClass>();
  for (const id of [entity.canonicalItemId, ...entity.itemIds]) { const item = id ? byId.get(id) : undefined; if (item) for (const klass of itemClasses(item)) found.add(klass); }
  return found.size ? [...found].sort() as IntelClass[] : ["c1"];
}

/** Everything that belongs to an entity and its subsidiaries: their pages, projects, news and documents. */
export function entityItems(entity: IntelEntity, index: ReturnType<typeof indexRegistry>, byId: Map<string, IntelItem>) {
  const family = [entity, ...(index.children.get(entity.code) ?? [])];
  const own = family.flatMap(member => [member.canonicalItemId, ...member.itemIds]).filter((id): id is string => Boolean(id) && id !== entity.canonicalItemId);
  return [...new Set(own)].map(id => byId.get(id)).filter((item): item is IntelItem => Boolean(item));
}
