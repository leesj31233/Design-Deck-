import { researchTerms } from "../translation/research-style";
import type { StoredDocument } from "../persistence/types";
export function detectMetadata(text: string, info: Record<string, unknown>) {
  const doi = text.match(/10\.\d{4,9}\/[a-z0-9._;()/:+-]+/i)?.[0].replace(/[.,;]+$/, "");
  const title = typeof info.Title === "string" && info.Title.trim().length > 8 && !/untitled|microsoft|\.docx?$/i.test(info.Title) ? info.Title.trim() : undefined;
  const authors = typeof info.Author === "string" ? info.Author.split(/;|\band\b/).map(item => item.trim()).filter(Boolean) : [];
  const keywords = researchTerms.filter(term => text.toLowerCase().includes(term.toLowerCase())).slice(0, 16);
  return { ...(title ? { title } : {}), authors, doi, keywords, metadataSource: "PDF" };
}
export async function lookupDoi(doi: string): Promise<Partial<StoredDocument>> {
  if (!/^10\.\d{4,9}\//.test(doi)) throw new Error("확인할 DOI를 입력해야 합니다.");
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("Crossref에서 이 DOI의 서지정보를 찾지 못했습니다.");
  const { message: item } = await response.json();
  if (String(item.DOI).toLowerCase() !== doi.toLowerCase()) throw new Error("DOI가 일치하지 않습니다.");
  const plain = (value: string) => value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  return { title: plain(item.title?.[0] || doi), authors: (item.author ?? []).map((a: { given?: string; family?: string }) => [a.given, a.family].filter(Boolean).join(" ")), journal: item["container-title"]?.[0] && plain(item["container-title"][0]), year: item.published?.["date-parts"]?.[0]?.[0], doi: item.DOI, citationCount: item["is-referenced-by-count"], metadataSource: `https://api.crossref.org/works/${encodeURIComponent(doi)}`, metadataCheckedAt: new Date().toISOString() };
}
