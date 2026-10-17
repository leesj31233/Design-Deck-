"use client";
import { useMemo, type ReactNode } from "react";
import type { IntelItem } from "@/lib/paperflow/intel/types";
import { CoverImage } from "./card-cover";
import { Markdown, type EntityRenderer, type TermMarker } from "./markdown";
import "./item-article.css";

/** A numbered reference of the article: `1. [title](url) — org, date` under its 참고문헌 heading. */
interface ArticleRef { n: string; label: string; url?: string; rest: string }
const REFS_HEADING = /^##\s+(참고문헌|참고 문헌|References|출처)\s*$/m;
export function articleRefs(source: string): ArticleRef[] {
  const at = source.search(REFS_HEADING);
  if (at < 0) return [];
  return source.slice(at).split("\n").slice(1).flatMap(line => {
    const match = /^\s*\[?(\d+)[.\]]\s+(.*)$/.exec(line);
    if (!match) return [];
    const link = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(match[2]);
    return [{ n: match[1], label: link ? link[1] : match[2].replace(/\s+[—–-]\s+.*$/, ""), url: link?.[2], rest: match[2].replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/, "$1") }];
  });
}

/**
 * An item written up as a document: its pictures large with a line on what each shows, headings
 * (핵심 → sections → 결론 및 논의), glossary terms that explain themselves on hover, links to the other
 * items it names, and [n] references that point to the numbered list at its end.
 */
export function ItemArticle({ item, entity, terms, figure }: { item: IntelItem; entity: EntityRenderer; terms: Omit<TermMarker, "seen">;
  /** A figure of another item, rendered by the host. */
  figure?: (id: string, index: number, caption: string, key: number) => ReactNode }) {
  const source = item.article ?? "";
  const refs = useMemo(() => new Map(articleRefs(source).map(ref => [ref.n, ref])), [source]);
  // The item's own pictures: #0 is its cover, #n its n-th case-file figure.
  const own = (id: string, index: number, caption: string, key: number) => {
    if (id !== item.id) return figure ? figure(id, index, caption, key) : null;
    const pictures = [...(item.dossier?.figures ?? []), ...(item.user?.figures ?? [])];
    const picked = index > 0 ? pictures[index - 1] : undefined;
    if (!picked && !(item.cover || item.hasCover || pictures.length)) return null;
    return <figure key={key} className="pf-article-figure" data-hero={key === 0 || undefined}>
      {picked ? <img src={picked.src} alt={caption || picked.caption} loading="lazy"/> : <CoverImage item={item} alt={caption}/>}
      {(caption || picked?.caption) && <figcaption>{caption || picked?.caption}</figcaption>}
    </figure>;
  };
  const cite = (list: string[], key: number) => <sup key={key} className="pf-article-cite">{list.map((n, index) => { const ref = refs.get(n); return <a key={n} href={ref?.url ?? `#art-ref-${item.id}-${n}`} target={ref?.url ? "_blank" : undefined} rel="noreferrer noopener" title={ref ? ref.rest : undefined} onClick={ref?.url ? undefined : event => { event.preventDefault(); document.getElementById(`art-ref-${item.id}-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>{index > 0 ? "," : "["}{n}{index === list.length - 1 ? "]" : ""}</a>; })}</sup>;
  if (!source) return null;
  return <div className="pf-article" data-item={item.id}><Markdown source={source} entity={entity} terms={terms} figure={own} cite={cite}/></div>;
}
