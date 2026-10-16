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
const SELF = /NAYSOR|나이소르|네이소르|우리\s?(회사|사업|팀|가|는|의)|당사/i;
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
    try { const registry = JSON.parse(brief.body); for (const entity of registry.entities ?? []) delete entity.note; return { ...brief, body: JSON.stringify(registry) }; } catch { return null; }
  }
  if (brief.id === "__glossary__" || brief.id === PRICES_BRIEF || brief.id === PLACES_BRIEF) return brief;
  if (PRIVATE_BRIEFS.test(brief.id) || JUDGEMENT.test(brief.title)) return null;
  const body = publicMarkdown(brief.body);
  return body ? { ...brief, body } : null;
}

type Row = { id: string; data: unknown; updated_at: string };
async function rows(admin: SupabaseClient, userId: string, prefix: string, columns = "id, data, updated_at") {
  const out: Row[] = [];
  for (let from = 0; from < 5000; from += 100) {
    const { data, error } = await admin.from("annotations").select(columns).eq("user_id", userId).eq("document_id", "__intel__").eq("deleted", false).like("id", `${prefix}%`).order("id").range(from, from + 99);
    if (error) throw new Error(error.message);
    out.push(...(data as unknown as Row[]));
    if (!data || data.length < 100) break;
  }
  return out;
}

const version = (at: string) => Date.parse(at).toString(36);
export function mediaUrl(base: string, id: string, at: string, figure?: number) {
  return `${base}/api/public/intel/media?item=${encodeURIComponent(id)}${figure === undefined ? "&cover=1" : `&fig=${figure}`}&v=${version(at)}`;
}

/** An item as the public sees it (null: an open question, which stays internal). */
export function publicItem(raw: IntelItem, base: string, at: string, hasCover: boolean): IntelItem | null {
  if (raw.kind === "gap") return null;
  const { user: _user, libraryDoc: _doc, cover: _cover, naysor: _naysor, ...item } = raw;
  void _user; void _doc; void _cover; void _naysor;
  const dossier = item.dossier ? {
    ...item.dossier,
    headline: item.dossier.headline ? factsOnly(item.dossier.headline) : item.dossier.headline,
    sections: item.dossier.sections?.flatMap(section => JUDGEMENT.test(section.title) ? [] : [{ ...section, body: publicMarkdown(section.body) }]).filter(section => section.body),
    figures: item.dossier.figures?.map((figure, index) => ({ ...figure, src: figure.src.startsWith("data:") ? mediaUrl(base, item.id, at, index) : figure.src })),
    sources: item.dossier.sources?.map(source => { const { libraryDoc: _lib, ...rest } = source; void _lib; return rest; })
  } : undefined;
  return { ...item, summaryKo: item.summaryKo ? factsOnly(item.summaryKo) : item.summaryKo, dossier, hasCover: hasCover || undefined, updatedAt: at };
}

export async function publicFeed(admin: SupabaseClient, base: string) {
  const userId = await feedOwner(admin);
  if (!userId) return null;
  const [items, briefs, media] = await Promise.all([rows(admin, userId, "intel:"), rows(admin, userId, "intelbrief:"), rows(admin, userId, "intelmedia:", "id, updated_at")]);
  const covers = new Map(media.map(row => [row.id.slice(11), row.updated_at]));
  const shown = items.flatMap(row => { const item = publicItem(row.data as IntelItem, base, row.updated_at, covers.has(row.id.slice(6))); return item ? [item] : []; });
  const ids = new Set(shown.map(item => item.id));
  return {
    generatedAt: new Date().toISOString(),
    items: shown,
    briefs: briefs.flatMap(row => { const brief = publicBrief(row.data as IntelBrief); return brief ? [brief] : []; }),
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
