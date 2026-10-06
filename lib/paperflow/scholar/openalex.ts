/**
 * OpenAlex (https://openalex.org, CC0 data, no key): authors and institutions, journal, the
 * domain → field → subfield → topic hierarchy, keywords, citations and related works of a paper.
 * Pure normalisation; the network calls go through /api/scholar so the polite-pool contact and
 * caching live on the server.
 */
export interface ScholarRef { id: string; name: string }
export interface ScholarTopic extends ScholarRef { score: number; subfield: ScholarRef; field: ScholarRef; domain: ScholarRef }
export interface ScholarAuthor extends ScholarRef { orcid?: string; position: "first" | "middle" | "last"; /** Marked as corresponding author on the paper. */ corresponding?: boolean; institutions: (ScholarRef & { country?: string; ror?: string })[] }
export interface ScholarSource extends ScholarRef { publisher?: string; issn?: string; type?: string }
export interface ScholarWork {
  openalexId: string; title: string; year?: number; doi?: string; type?: string; citedBy: number;
  isOa: boolean; oaUrl?: string; authors: ScholarAuthor[]; source?: ScholarSource;
  topics: ScholarTopic[]; keywords: string[]; relatedIds: string[]; referencedIds: string[]; fetchedAt: string;
}
export interface ScholarSourceStats { id: string; name: string; publisher?: string; homepage?: string; meanCitedness2y?: number; hIndex?: number; worksCount?: number; country?: string }
export interface ScholarAuthorStats { id: string; name: string; orcid?: string; hIndex?: number; worksCount?: number; citedBy?: number; institution?: ScholarRef & { country?: string }; topics: string[] }

const short = (id: unknown) => typeof id === "string" ? id.replace("https://openalex.org/", "") : "";
const ref = (value: { id?: string; display_name?: string } | null | undefined): ScholarRef => ({ id: short(value?.id), name: value?.display_name ?? "" });

/* eslint-disable @typescript-eslint/no-explicit-any -- OpenAlex JSON */
export function normalizeWork(work: any): ScholarWork {
  const source = work.primary_location?.source;
  return {
    openalexId: short(work.id), title: work.title ?? work.display_name ?? "", year: work.publication_year ?? undefined,
    doi: typeof work.doi === "string" ? work.doi.replace(/^https?:\/\/doi\.org\//i, "") : undefined, type: work.type ?? undefined,
    citedBy: Number(work.cited_by_count ?? 0), isOa: Boolean(work.open_access?.is_oa), oaUrl: work.open_access?.oa_url ?? undefined,
    authors: (work.authorships ?? []).filter((item: any) => item.author?.display_name).map((item: any) => ({
      ...ref(item.author), orcid: item.author.orcid ?? undefined, position: item.author_position === "first" ? "first" : item.author_position === "last" ? "last" : "middle", corresponding: item.is_corresponding === true || undefined,
      institutions: (item.institutions ?? []).map((institution: any) => ({ ...ref(institution), country: institution.country_code ?? undefined, ror: institution.ror ?? undefined }))
    })),
    source: source ? { ...ref(source), publisher: source.host_organization_name ?? undefined, issn: source.issn_l ?? undefined, type: source.type ?? undefined } : undefined,
    topics: (work.topics ?? []).map((topic: any) => ({ ...ref(topic), score: Number(topic.score ?? 0), subfield: ref(topic.subfield), field: ref(topic.field), domain: ref(topic.domain) })),
    keywords: (work.keywords ?? []).map((keyword: any) => keyword.display_name).filter(Boolean),
    relatedIds: (work.related_works ?? []).map(short), referencedIds: (work.referenced_works ?? []).map(short),
    fetchedAt: new Date().toISOString()
  };
}
export function normalizeSource(source: any): ScholarSourceStats {
  return { id: short(source.id), name: source.display_name ?? "", publisher: source.host_organization_name ?? undefined, homepage: source.homepage_url ?? undefined, meanCitedness2y: source.summary_stats?.["2yr_mean_citedness"], hIndex: source.summary_stats?.h_index, worksCount: source.works_count, country: source.country_code ?? undefined };
}
export function normalizeAuthor(author: any): ScholarAuthorStats {
  const institution = author.last_known_institutions?.[0];
  return { id: short(author.id), name: author.display_name ?? "", orcid: author.orcid ?? undefined, hIndex: author.summary_stats?.h_index, worksCount: author.works_count, citedBy: author.cited_by_count, institution: institution ? { ...ref(institution), country: institution.country_code ?? undefined } : undefined, topics: (author.topics ?? []).slice(0, 5).map((topic: any) => topic.display_name) };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Title similarity for matching a PDF without DOI to an OpenAlex record (token overlap, 0..1). */
export function titleSimilarity(a: string, b: string) {
  const tokens = (text: string) => new Set(text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(word => word.length > 2));
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const word of x) if (y.has(word)) shared++;
  return (2 * shared) / (x.size + y.size);
}

export const WORK_FIELDS = "id,title,display_name,doi,publication_year,type,cited_by_count,open_access,authorships,primary_location,topics,keywords,related_works,referenced_works";
