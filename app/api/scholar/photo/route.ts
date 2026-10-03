import { foreignOrigin } from "@/lib/paperflow/scholar/server";

const cache = new Map<string, string | null>();

/**
 * An author's portrait, only when Wikidata links their ORCID to a Wikimedia Commons image
 * (freely licensed). Most researchers have none; the UI then shows their initials.
 */
export async function GET(request: Request) {
  if (foreignOrigin(request)) return Response.json({ error: "이 사이트에서만 사용할 수 있다." }, { status: 403 });
  const orcid = new URL(request.url).searchParams.get("orcid")?.replace(/^https?:\/\/orcid\.org\//i, "") ?? "";
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid)) return Response.json({ url: null });
  if (cache.has(orcid)) return Response.json({ url: cache.get(orcid) });
  const query = `SELECT ?image WHERE { ?person wdt:P496 "${orcid}" ; wdt:P18 ?image } LIMIT 1`;
  try {
    const response = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: { "User-Agent": "PAPERFLOW research reader", Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(8000) });
    const data = response.ok ? await response.json() : null;
    const image: string | undefined = data?.results?.bindings?.[0]?.image?.value;
    const url = image && /^https?:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//.test(image) ? `${image.replace(/^http:/, "https:")}?width=160` : null;
    if (cache.size > 5000) cache.clear();
    cache.set(orcid, url);
    return Response.json({ url, credit: url ? "Wikimedia Commons" : undefined });
  } catch { return Response.json({ url: null }); }
}
