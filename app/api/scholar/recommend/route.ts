import { normalizeWork } from "@/lib/paperflow/scholar/openalex";
import { foreignOrigin, openAlex } from "@/lib/paperflow/scholar/server";

/**
 * Paper recommendations from the reader's own research profile, all from OpenAlex:
 * trending and authoritative recent work in their topics, the classics their library keeps
 * citing, reviews of their fields, and new work by the authors they read most.
 */
const FIELDS = "id,title,display_name,doi,publication_year,type,cited_by_count,open_access,authorships,primary_location,topics,keywords,related_works,referenced_works,abstract_inverted_index";
const isWork = (id: unknown): id is string => typeof id === "string" && /^W\d{4,12}$/.test(id);
const isTopic = (id: unknown): id is string => typeof id === "string" && /^T\d{3,8}$/.test(id);
const isAuthor = (id: unknown): id is string => typeof id === "string" && /^A\d{4,12}$/.test(id);

/** OpenAlex ships abstracts as an inverted index; rebuild the first sentences for the card. */
function abstractOf(index: Record<string, number[]> | null | undefined) {
  if (!index) return undefined;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const position of positions) words[position] = word;
  const text = words.filter(Boolean).join(" ");
  return text.length > 420 ? `${text.slice(0, 420).replace(/\s\S*$/, "")}…` : text;
}

const ago = (months: number) => { const date = new Date(); date.setMonth(date.getMonth() - months); return date.toISOString().slice(0, 10); };

export async function POST(request: Request) {
  if (foreignOrigin(request)) return Response.json({ error: "이 사이트에서만 사용할 수 있다." }, { status: 403 });
  let body: { topics?: unknown; authors?: unknown; owned?: unknown; cited?: unknown; fields?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청이다." }, { status: 400 }); }
  const topics = (Array.isArray(body.topics) ? body.topics : []).filter(isTopic).slice(0, 6);
  const authors = (Array.isArray(body.authors) ? body.authors : []).filter(isAuthor).slice(0, 10);
  // The reader's fields (e.g. fields/22 Engineering): an author's new work counts only inside them,
  // because OpenAlex sometimes merges namesakes from unrelated fields into one author.
  const fields = (Array.isArray(body.fields) ? body.fields : []).filter((id): id is string => typeof id === "string" && /^fields\/\d{1,4}$/.test(id)).slice(0, 4).map(id => id.slice(7));
  const owned = new Set((Array.isArray(body.owned) ? body.owned : []).filter(isWork));
  // Works the library cites, with how many of the reader's papers cite each one.
  const cited = (Array.isArray(body.cited) ? body.cited : []).filter((item): item is { id: string; count: number } => isWork(item?.id) && Number.isFinite(item?.count)).filter(item => !owned.has(item.id)).sort((a, b) => b.count - a.count).slice(0, 25);
  if (!topics.length && !authors.length && !cited.length) return Response.json({ sections: [] });
  const topicFilter = `topics.id:${topics.join("|")}`;
  const list = (params: Record<string, string>) => openAlex<{ results?: unknown[] }>("works", { per_page: "12", select: FIELDS, ...params });
  const [trending, authoritative, reviews, byAuthors, classics] = await Promise.all([
    topics.length ? list({ filter: `${topicFilter},from_publication_date:${ago(12)}`, sort: "cited_by_count:desc" }) : null,
    topics.length ? list({ filter: `${topicFilter},from_publication_date:${ago(36)},to_publication_date:${ago(12)}`, sort: "cited_by_count:desc" }) : null,
    topics.length ? list({ filter: `${topicFilter},type:review,from_publication_date:${ago(60)}`, sort: "cited_by_count:desc" }) : null,
    authors.length ? list({ filter: `authorships.author.id:${authors.join("|")},from_publication_date:${ago(24)}${fields.length ? `,primary_topic.field.id:${fields.join("|")}` : ""}`, sort: "publication_date:desc" }) : null,
    cited.length ? list({ filter: `openalex:${cited.map(item => item.id).join("|")}`, per_page: "25" }) : null
  ]);
  const seen = new Set(owned);
  /* eslint-disable @typescript-eslint/no-explicit-any -- OpenAlex JSON */
  const cards = (data: { results?: unknown[] } | null, why: (work: any) => string, limit = 8) => (data?.results ?? []).flatMap((raw: any) => {
    const work = normalizeWork(raw), id = work.openalexId;
    if (!work.title || seen.has(id)) return [];
    seen.add(id);
    return [{ ...work, abstract: abstractOf(raw.abstract_inverted_index), why: why(raw) }];
  }).slice(0, limit);
  const topicName = (raw: any) => (raw.topics ?? []).find((topic: any) => topics.includes(String(topic.id).replace("https://openalex.org/", "")))?.display_name ?? raw.topics?.[0]?.display_name ?? "";
  const citedCount = new Map(cited.map(item => [item.id, item.count]));
  const classicCards = cards(classics, raw => `내 서재 ${citedCount.get(String(raw.id).replace("https://openalex.org/", "")) ?? 0}편이 인용`, 10).sort((a, b) => (citedCount.get(b.openalexId) ?? 0) - (citedCount.get(a.openalexId) ?? 0));
  const authorName = (raw: any) => (raw.authorships ?? []).find((item: any) => authors.includes(String(item.author?.id).replace("https://openalex.org/", "")))?.author?.display_name ?? "";
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const sections = [
    { id: "trending", title: "최근 1년 주목", note: "관심 주제에서 지난 12개월 동안 가장 많이 인용된 논문", items: cards(trending, raw => `관심 주제 · ${topicName(raw)}`) },
    { id: "authoritative", title: "최근 3년 권위", note: "관심 주제에서 1~3년 전 발표되어 이미 많이 인용된 논문", items: cards(authoritative, raw => `관심 주제 · ${topicName(raw)}`) },
    { id: "classics", title: "기초가 되는 고전", note: "내 서재의 논문들이 반복해서 인용하는, 아직 없는 문헌", items: classicCards },
    { id: "reviews", title: "리뷰 · 동향", note: "관심 분야의 최근 5년 리뷰 논문 (연구 동향과 시장·기술 개관)", items: cards(reviews, raw => `리뷰 · ${topicName(raw)}`) },
    { id: "authors", title: "자주 읽는 저자의 신작", note: "내가 많이 읽은 저자의 최근 2년 논문", items: cards(byAuthors, raw => `저자 · ${authorName(raw)}`) }
  ].filter(section => section.items.length);
  return Response.json({ sections });
}
