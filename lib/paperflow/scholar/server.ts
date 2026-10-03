/**
 * Server-side OpenAlex access: one place for the polite-pool contact (OPENALEX_MAILTO, optional),
 * a short in-memory cache, and a timeout. Responses are public CC0 metadata.
 */
const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 24 * 3600_000;

export async function openAlex<T = unknown>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`https://api.openalex.org/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (process.env.OPENALEX_MAILTO) url.searchParams.set("mailto", process.env.OPENALEX_MAILTO);
  const key = url.toString(), hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "PAPERFLOW research reader" }, signal: AbortSignal.timeout(12_000) });
    if (response.status === 404) { cache.set(key, { at: Date.now(), value: null }); return null; }
    if (!response.ok) return null;
    const value = await response.json() as T;
    if (cache.size > 3000) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch { return null; }
}

/** Same-site requests only; the routes are a convenience proxy, not a public API. */
export function foreignOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin !== new URL(request.url).origin);
}
