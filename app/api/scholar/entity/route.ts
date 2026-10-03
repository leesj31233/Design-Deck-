import { normalizeAuthor, normalizeSource } from "@/lib/paperflow/scholar/openalex";
import { foreignOrigin, openAlex } from "@/lib/paperflow/scholar/server";

/** Journal (2-year mean citedness, h-index, publisher) or author (h-index, institution, topics) statistics. */
export async function GET(request: Request) {
  if (foreignOrigin(request)) return Response.json({ error: "이 사이트에서만 사용할 수 있다." }, { status: 403 });
  const url = new URL(request.url), kind = url.searchParams.get("kind"), ids = (url.searchParams.get("ids") ?? "").split(",").filter(id => /^[SA]\d{4,12}$/.test(id)).slice(0, 50);
  if ((kind !== "source" && kind !== "author") || !ids.length) return Response.json({ error: "kind와 ids가 필요하다." }, { status: 400 });
  const prefix = kind === "source" ? "S" : "A";
  const valid = ids.filter(id => id.startsWith(prefix));
  const select = kind === "source" ? "id,display_name,host_organization_name,homepage_url,works_count,summary_stats,country_code" : "id,display_name,orcid,works_count,cited_by_count,summary_stats,last_known_institutions,topics";
  const found = await openAlex<{ results?: unknown[] }>(kind === "source" ? "sources" : "authors", { filter: `openalex:${valid.join("|")}`, per_page: "50", select });
  const items = (found?.results ?? []).map(item => kind === "source" ? normalizeSource(item) : normalizeAuthor(item));
  return Response.json({ items });
}
