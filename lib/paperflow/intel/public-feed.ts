import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerId } from "./ingest-auth";
import { PRICES_BRIEF } from "./prices";
import { PLACES_BRIEF } from "./places";
import { REGISTRY_BRIEF } from "./registry";
import type { IntelBrief, IntelItem } from "./types";

/**
 * NAYSOR News: the owner's intelligence, readable by anyone without an account. Only the collected facts go
 * out. NAYSOR's own judgement stays in: the pilot-plant and next-action briefings, open questions ("gap"
 * items), each item's applicability to NAYSOR, and any heading, line or sentence that speaks about NAYSOR,
 * its plans, its negotiations or what it should do. The owner's own state never goes out either (stars,
 * folders, memos, hidden flags, added figures, links into the private library).
 * Pictures leave the list and are served one by one, so the list stays small and each picture is cached.
 */
let owner: { id: string; at: number } | null = null;
export async function feedOwner(admin: SupabaseClient) {
  if (owner && Date.now() - owner.at < 10 * 60_000) return owner.id;
  const id = await ownerId(admin);
  if (!id || id === "error") return null;
  owner = { id, at: Date.now() };
  return id;
}

/** Words that mark NAYSOR speaking about itself (its plans, assumptions, what to do), not a fact about the market. */
export const SELF = /NAYSOR|나이소르|네이소르|우리\s?(회사|사업|팀|가|는|의)|당사/i;
/** Headings of judgement: implications, actions, the pilot plan, negotiation positions, gaps to chase. */
const JUDGEMENT = /NAYSOR|나이소르|시사점|해야 할 일|다음 (단계|행동)|Next Actions?|Implications?|Pilot|파일럿|협상|권고|제안|Research Gaps|공백과 다음|매출 가정|우선 접촉/i;
const PRIVATE_BRIEFS = /^brief-(06-pilot|08-gaps)/;

/** A paragraph without the sentences in which NAYSOR speaks about itself. */
export function factsOnly(text: string) {
  return text.split(/(?<=[.!?。]|다\.)\s+/).filter(sentence => !SELF.test(sentence)).join(" ").trim();
}
/** A Markdown document without judgement sections, and without lines in which NAYSOR speaks about itself. */
export function publicMarkdown(body: string) {
  const out: string[] = [];
  let skipping = 0;
  for (const line of body.split("\n")) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (skipping && level <= skipping) skipping = 0;
      if (!skipping && JUDGEMENT.test(heading[2])) { skipping = level; continue; }
    }
    if (skipping || SELF.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
export function publicBrief(brief: IntelBrief): IntelBrief | null {
  if (brief.id === REGISTRY_BRIEF) {
    // NAYSOR itself is not one of the organisations the site describes.
    try { const registry = JSON.parse(brief.body); registry.entities = (registry.entities ?? []).filter((entity: { name?: string }) => !SELF.test(entity.name ?? "")); for (const entity of registry.entities) delete entity.note; return { ...brief, body: JSON.stringify(registry) }; } catch { return null; }
  }
  // A price worked out by NAYSOR is shown as worked out, without the name.
  if (brief.id === PRICES_BRIEF) return { ...brief, body: brief.body.replace(/\s*NAYSOR\s*(계산|추정|산정)/g, " $1").replace(/NAYSOR|나이소르|네이소르/g, "") };
  if (brief.id === "__glossary__" || brief.id === PLACES_BRIEF) return brief;
  // The research routine's own instructions (__guides__) and any other hidden briefing stay private.
  if (brief.id.startsWith("__")) return null;
  if (PRIVATE_BRIEFS.test(brief.id) || JUDGEMENT.test(brief.title)) return null;
  const body = publicMarkdown(brief.body);
  return body ? { ...brief, body } : null;
}

type Row = { id: string; data: unknown; updated_at: string };
const base = (admin: SupabaseClient, userId: string, columns: string) => admin.from("annotations").select(columns).eq("user_id", userId).eq("document_id", "__intel__").eq("deleted", false);
/**
 * Every row under a prefix. The ids come first (small), then the rows in small groups a few at a time: items
 * carry whole documents now, and a hundred of them in one statement runs past the database's time limit.
 */
export async function rows(admin: SupabaseClient, userId: string, prefix: string, columns = "id, data, updated_at") {
  const ids: string[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await base(admin, userId, "id").like("id", `${prefix}%`).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    ids.push(...(data as unknown as { id: string }[]).map(row => row.id));
    if (!data || data.length < 1000) break;
  }
  if (!ids.length) return [];
  const groups: string[][] = [];
  for (let at = 0; at < ids.length; at += 40) groups.push(ids.slice(at, at + 40));
  const out: Row[] = [];
  for (let at = 0; at < groups.length; at += 6) {
    const parts = await Promise.all(groups.slice(at, at + 6).map(async group => {
      const { data, error } = await base(admin, userId, columns).in("id", group);
      if (error) throw new Error(error.message);
      return data as unknown as Row[];
    }));
    for (const part of parts) out.push(...part);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export const version = (at: string) => Date.parse(at).toString(36);
export function mediaUrl(base: string, id: string, at: string, figure?: number) {
  return `${base}/api/public/intel/media?item=${encodeURIComponent(id)}${figure === undefined ? "&cover=1" : `&fig=${figure}`}&v=${version(at)}`;
}

/**
 * Every field, however deep: a short text that speaks about NAYSOR goes, and so does the row it sits in (a data
 * point, a fact, a timeline entry, an equipment line); a long text keeps its other sentences; Markdown keeps its
 * other sections and lines.
 */
function scrub(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (!SELF.test(value)) return value;
    if (key === "body" || key === "article") return publicMarkdown(value) || undefined;
    return value.length > 160 ? factsOnly(value) || undefined : undefined;
  }
  if (Array.isArray(value)) return value.flatMap(entry => {
    if (entry && typeof entry === "object" && !Array.isArray(entry) && Object.values(entry).some(field => typeof field === "string" && field.length <= 160 && SELF.test(field))) return [];
    const clean = scrub(entry, key);
    return clean === undefined ? [] : [clean];
  });
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [field, entry] of Object.entries(value)) {
      if (field.startsWith("data:")) continue;
      if (SELF.test(field)) continue;
      const clean = scrub(entry, field);
      if (clean !== undefined) out[field] = clean;
    }
    return out;
  }
  return value;
}

/** An item as the public sees it (null: an open question, or NAYSOR's own analysis, which stay internal). */
export function publicItem(raw: IntelItem, base: string, at: string, hasCover: boolean): IntelItem | null {
  if (raw.kind === "gap" || SELF.test(`${raw.title} ${raw.titleKo ?? ""} ${raw.org ?? ""}`)) return null;
  const { user: _user, libraryDoc: _doc, cover: _cover, naysor: _naysor, ...rest } = raw;
  // Pictures become URLs first, by their place in the stored list (the media route reads that same place).
  if (rest.dossier?.figures) rest.dossier = { ...rest.dossier, figures: rest.dossier.figures.map((figure, index) => ({ ...figure, src: figure.src.startsWith("data:") ? mediaUrl(base, rest.id, at, index) : figure.src })) };
  const item = scrub(rest) as typeof rest;
  void _user; void _doc; void _cover; void _naysor;
  const dossier = item.dossier ? {
    ...item.dossier,
    headline: item.dossier.headline ? factsOnly(item.dossier.headline) : item.dossier.headline,
    sections: item.dossier.sections?.flatMap(section => JUDGEMENT.test(section.title) ? [] : [{ ...section, body: publicMarkdown(section.body) }]).filter(section => section.body),
    sources: item.dossier.sources?.map(source => { const { libraryDoc: _lib, ...rest } = source; void _lib; return rest; })
  } : undefined;
  return { ...item, summaryKo: item.summaryKo ? factsOnly(item.summaryKo) : item.summaryKo, dossier, hasCover: hasCover || undefined, updatedAt: at };
}

type RegistryEntity = { code: string; parentCode?: string; canonicalItemId?: string; itemIds?: string[]; mentionIds?: string[] };
function withPublicItems(brief: IntelBrief, ids: Set<string>): IntelBrief {
  try {
    const registry = JSON.parse(brief.body) as { entities?: RegistryEntity[] };
    const entities = registry.entities ?? [];
    for (const entity of entities) {
      if (entity.canonicalItemId && !ids.has(entity.canonicalItemId)) delete entity.canonicalItemId;
      entity.itemIds = (entity.itemIds ?? []).filter(id => ids.has(id)); entity.mentionIds = (entity.mentionIds ?? []).filter(id => ids.has(id));
    }
    const grounded = new Set(entities.filter(entity => entity.canonicalItemId || entity.itemIds!.length || entity.mentionIds!.length).map(entity => entity.code));
    for (const entity of entities) if (grounded.has(entity.code) && entity.parentCode) grounded.add(entity.parentCode);
    registry.entities = entities.filter(entity => grounded.has(entity.code));
    return { ...brief, body: JSON.stringify(registry) };
  } catch { return brief; }
}

/** The parts of one visit arrive together: they share one build of the feed for two minutes. */
let built: { base: string; at: number; feed: ReturnType<typeof buildFeed> } | null = null;
export function publicFeed(admin: SupabaseClient, base: string) {
  if (built && built.base === base && Date.now() - built.at < 120_000) return built.feed;
  const feed = buildFeed(admin, base);
  built = { base, at: Date.now(), feed };
  feed.catch(() => { if (built?.feed === feed) built = null; });
  return feed;
}
export async function buildFeed(admin: SupabaseClient, base: string) {
  const userId = await feedOwner(admin);
  if (!userId) return null;
  const [items, briefs, media] = await Promise.all([rows(admin, userId, "intel:"), rows(admin, userId, "intelbrief:"), rows(admin, userId, "intelmedia:", "id, updated_at")]);
  const covers = new Map(media.map(row => [row.id.slice(11), row.updated_at]));
  const shown = items.flatMap(row => { const item = publicItem(row.data as IntelItem, base, row.updated_at, covers.has(row.id.slice(6))); return item ? [item] : []; });
  const ids = new Set(shown.map(item => item.id));
  return {
    generatedAt: new Date().toISOString(),
    items: shown,
    // An organisation stays in the public directory only with at least one public item (its own page, a
    // subsidiary's, or an item about it); otherwise it would show as an empty name.
    briefs: briefs.flatMap(row => { const brief = publicBrief(row.data as IntelBrief); return brief ? [brief.id === REGISTRY_BRIEF ? withPublicItems(brief, ids) : brief] : []; }),
    covers: Object.fromEntries([...covers].filter(([id]) => ids.has(id)).map(([id, at]) => [id, mediaUrl(base, id, at)]))
  };
}

/** One picture: a public item's cover or its n-th case-file figure, as bytes. */
export async function publicMedia(admin: SupabaseClient, item: string, figure: number | null) {
  const userId = await feedOwner(admin);
  if (!userId || !/^[\w.:-]{1,120}$/.test(item)) return null;
  const { data: row } = await admin.from("annotations").select("data").eq("user_id", userId).eq("document_id", "__intel__").eq("deleted", false).eq("id", `intel:${item}`).maybeSingle();
  if (!row || (row.data as IntelItem | null)?.kind === "gap") return null;
  let src: string | undefined;
  if (figure === null) {
    const { data } = await admin.from("annotations").select("data").eq("user_id", userId).eq("document_id", "__intel__").eq("deleted", false).eq("id", `intelmedia:${item}`).maybeSingle();
    src = (data?.data as { cover?: string } | undefined)?.cover;
  } else src = (row.data as IntelItem).dossier?.figures?.[figure]?.src;
  const match = src ? /^data:(image\/(?:webp|png|jpeg));base64,(.+)$/.exec(src) : null;
  return match ? { type: match[1], bytes: Buffer.from(match[2], "base64") } : null;
}
