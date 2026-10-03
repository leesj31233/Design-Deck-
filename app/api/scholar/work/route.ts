import { normalizeWork, titleSimilarity, WORK_FIELDS } from "@/lib/paperflow/scholar/openalex";
import { foreignOrigin, openAlex } from "@/lib/paperflow/scholar/server";

/** One paper's OpenAlex record, by DOI or (for PDFs without DOI) by a confident title match. */
export async function GET(request: Request) {
  if (foreignOrigin(request)) return Response.json({ error: "이 사이트에서만 사용할 수 있다." }, { status: 403 });
  const url = new URL(request.url);
  const doi = url.searchParams.get("doi")?.trim().replace(/^https?:\/\/doi\.org\//i, "");
  const title = url.searchParams.get("title")?.trim();
  if (doi && /^10\.\d{4,9}\/\S+$/.test(doi)) {
    const work = await openAlex("works/doi:" + encodeURIComponent(doi), { select: WORK_FIELDS });
    return Response.json({ work: work ? normalizeWork(work) : null });
  }
  if (title && title.length >= 12 && title.length <= 400) {
    const found = await openAlex<{ results?: unknown[] }>("works", { search: title.slice(0, 300), per_page: "5", select: WORK_FIELDS });
    const best = (found?.results ?? []).map(normalizeWork).map(work => ({ work, score: titleSimilarity(title, work.title) })).sort((a, b) => b.score - a.score)[0];
    // Only a near-identical title counts; a wrong paper would poison the research map.
    return Response.json({ work: best && best.score >= .86 ? best.work : null, score: best?.score ?? 0 });
  }
  return Response.json({ error: "DOI 또는 제목이 필요하다." }, { status: 400 });
}
