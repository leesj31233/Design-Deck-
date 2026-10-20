const decode = (value: string) => value.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/\s+/g, " ").trim();

function meta(html: string, keys: string[]) {
  for (const key of keys) {
    // Attribute order varies: <meta property="og:title" content="…"> or <meta content="…" property="og:title">.
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      const name = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1];
      if (name?.toLowerCase() !== key.toLowerCase()) continue;
      const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
      if (content?.trim()) return decode(content);
    }
  }
  return undefined;
}

/** Title, publisher, date, summary and lead image of a web page, from its head (Open Graph, Twitter, standard meta). */
export function linkMeta(html: string, base: URL) {
  const host = base.hostname.replace(/^www\./, "");
  const title = (meta(html, ["og:title", "twitter:title"]) ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "")) || host;
  let image = meta(html, ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src", "image"]);
  try { image = image ? new URL(image, base).toString() : undefined; if (image && !/^https?:/.test(image)) image = undefined; } catch { image = undefined; }
  return {
    kind: "page" as const, url: base.toString(), host, title: title.slice(0, 300),
    site: meta(html, ["og:site_name", "application-name"])?.slice(0, 120),
    description: meta(html, ["og:description", "twitter:description", "description"])?.slice(0, 500),
    published: meta(html, ["article:published_time", "og:article:published_time", "datePublished", "pubdate", "date", "DC.date.issued"])?.slice(0, 40),
    image
  };
}
