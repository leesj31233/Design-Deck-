import type { SupabaseClient } from "@supabase/supabase-js";
import { SELF, buildFeed, feedOwner, publicMedia, rows, version } from "./public-feed";

/**
 * NAYSOR News, ready before anyone asks: the public feed written as static files in a public storage bucket
 * (served from the CDN), so a visitor downloads a few files instead of waiting for the server to assemble 1,600
 * items. Covers go there too, one file each, named by version so they are cached for good.
 *   covers/<id>.<v>.webp      a public item's cover
 *   covers/index.json         { id: v } of the covers already uploaded
 *   v/<version>/part-<n>.json the feed in parts (immutable)
 *   manifest.json             which version is current (cached for a minute)
 */
export const NEWS_BUCKET = "naysor-news";
const PART = 250;
const publicUrl = (path: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${NEWS_BUCKET}/${path}`;

async function ensureBucket(admin: SupabaseClient) {
  const { data } = await admin.storage.getBucket(NEWS_BUCKET);
  if (!data) { const { error } = await admin.storage.createBucket(NEWS_BUCKET, { public: true }); if (error && !/exists/i.test(error.message)) throw new Error(error.message); }
}
async function readJson<T>(admin: SupabaseClient, path: string, fallback: T): Promise<T> {
  const { data } = await admin.storage.from(NEWS_BUCKET).download(path);
  if (!data) return fallback;
  try { return JSON.parse(await data.text()) as T; } catch { return fallback; }
}
const put = (admin: SupabaseClient, path: string, body: Blob | string, type: string, cache: number) =>
  admin.storage.from(NEWS_BUCKET).upload(path, typeof body === "string" ? new Blob([body], { type }) : body, { contentType: type, cacheControl: String(cache), upsert: true });

/** Upload the covers of public items that the bucket lacks (or holds an older version of), for up to ~40 seconds. */
export async function syncCovers(admin: SupabaseClient, budgetMs = 40_000) {
  const started = Date.now(), userId = await feedOwner(admin);
  if (!userId) throw new Error("owner not found");
  await ensureBucket(admin);
  const index = await readJson<Record<string, string>>(admin, "covers/index.json", {});
  // Which items are public: not an open question, not NAYSOR speaking about itself (the same rule as the feed).
  const heads = await rows(admin, userId, "intel:", "id, updated_at, kind:data->>kind, title:data->>title, titleKo:data->>titleKo, org:data->>org") as unknown as { id: string; kind: string; title?: string; titleKo?: string; org?: string }[];
  const shown = new Set(heads.filter(head => head.kind !== "gap" && !SELF.test(`${head.title ?? ""} ${head.titleKo ?? ""} ${head.org ?? ""}`)).map(head => head.id.slice(6)));
  const media = await rows(admin, userId, "intelmedia:", "id, updated_at");
  const todo = media.map(row => ({ id: row.id.slice(11), v: version(row.updated_at) })).filter(entry => shown.has(entry.id) && index[entry.id] !== entry.v);
  let done = 0;
  for (let at = 0; at < todo.length && Date.now() - started < budgetMs; at += 8) {
    await Promise.all(todo.slice(at, at + 8).map(async entry => {
      const picture = await publicMedia(admin, entry.id, null);
      if (!picture) return;
      const { error } = await put(admin, `covers/${entry.id}.${entry.v}.webp`, new Blob([new Uint8Array(picture.bytes)], { type: picture.type }), picture.type, 31_536_000);
      if (!error) { index[entry.id] = entry.v; done++; }
    }));
  }
  await put(admin, "covers/index.json", JSON.stringify(index), "application/json", 0);
  return { uploaded: done, remaining: todo.length - done };
}

/** Build the feed once and write it as the current version; covers already in the bucket are linked there. */
export async function writeSnapshot(admin: SupabaseClient, origin: string) {
  await ensureBucket(admin);
  const feed = await buildFeed(admin, origin);
  if (!feed) throw new Error("no feed");
  const index = await readJson<Record<string, string>>(admin, "covers/index.json", {});
  const covers: Record<string, string> = {};
  for (const [id, url] of Object.entries(feed.covers)) { const v = /[?&]v=([\w]+)/.exec(url)?.[1]; covers[id] = v && index[id] === v ? publicUrl(`covers/${id}.${v}.webp`) : url; }
  const stamp = Date.now().toString(36), parts: string[] = [];
  for (let at = 0, n = 0; at < Math.max(feed.items.length, 1); at += PART, n++) {
    const items = feed.items.slice(at, at + PART), ids = new Set(items.map(item => item.id)), path = `v/${stamp}/part-${n}.json`;
    const body = { generatedAt: feed.generatedAt, part: n, items, briefs: n === 0 ? feed.briefs : [], covers: Object.fromEntries(Object.entries(covers).filter(([id]) => ids.has(id))) };
    const { error } = await put(admin, path, JSON.stringify(body), "application/json", 31_536_000);
    if (error) throw new Error(error.message);
    parts.push(publicUrl(path));
  }
  const manifest = { version: stamp, generatedAt: feed.generatedAt, total: feed.items.length, parts };
  const { error } = await put(admin, "manifest.json", JSON.stringify(manifest), "application/json", 60);
  if (error) throw new Error(error.message);
  // Older versions go, keeping the previous one for visitors who are midway through loading it.
  const { data: versions } = await admin.storage.from(NEWS_BUCKET).list("v", { limit: 100 });
  const old = (versions ?? []).map(entry => entry.name).filter(name => name !== stamp).sort().slice(0, -1);
  for (const name of old) { const { data: files } = await admin.storage.from(NEWS_BUCKET).list(`v/${name}`, { limit: 100 }); if (files?.length) await admin.storage.from(NEWS_BUCKET).remove(files.map(file => `v/${name}/${file.name}`)); }
  return manifest;
}
