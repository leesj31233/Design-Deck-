"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Building2, FileText, Gauge, HelpCircle, Landmark, Newspaper, Wrench } from "lucide-react";
import { SOURCE_LABEL, UPDATE_LABEL, itemDate, type IntelItem } from "@/lib/paperflow/intel/types";
import { intelRepository } from "@/lib/paperflow/intel/repository";
import { previewOf } from "./source-tree";

const ICON = { paper: BookOpen, gov: Landmark, "test-report": Gauge, "annual-report": Building2, patent: FileText, "vendor-catalog": Wrench, "market-analyst": Gauge, press: Newspaper } as Record<string, typeof BookOpen>;

/**
 * The picture on a card: a paper's or report's first page, an article's lead image or front page, a
 * case file's key figure — stored with the item, or (for a web page without one) the page's own lead
 * image, fetched only when the card comes into view. Over it: what the document is and its date.
 */
export function CardCover({ item, library }: { item: IntelItem; /** The first page of the reader's library copy, when linked. */ library?: string }) {
  const stored = item.images?.[0]?.src ?? item.cover ?? library ?? (item.hasCover ? undefined : item.dossier?.figures?.[0]?.src ?? item.user?.figures?.[0]?.src);
  const [image, setImage] = useState<string | undefined>(stored), [broken, setBroken] = useState(false), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setImage(stored); setBroken(false);
    if (stored || item.kind === "gap" || (!item.hasCover && !item.url)) return;
    const element = box.current;
    if (!element) return;
    let alive = true;
    // Covers are read from the device store, web lead images fetched, only once the card is near the screen.
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      if (item.hasCover) void intelRepository.cover(item.id).then(url => { if (!alive) return; if (url) setImage(url); else setImage(item.dossier?.figures?.[0]?.src ?? item.user?.figures?.[0]?.src); });
      else void previewOf(item.url).then(preview => { if (alive && preview?.image) setImage(preview.image); });
    }, { rootMargin: "300px" });
    observer.observe(element);
    return () => { alive = false; observer.disconnect(); };
  }, [stored, item.url, item.kind, item.hasCover, item.id, item.dossier, item.user]);
  const Icon = item.kind === "gap" ? HelpCircle : ICON[item.sourceType ?? ""] ?? FileText;
  const label = item.update ? UPDATE_LABEL[item.update.type] : item.kind === "gap" ? "확인 필요" : SOURCE_LABEL[item.sourceType ?? ""] ?? "자료";
  // The newest real date behind the item (its own, its news, its sources), top right like a dateline.
  const date = itemDate(item);
  return <div ref={box} className="pf-card-cover" data-source={item.sourceType} data-kind={item.kind} data-empty={!image || broken || undefined} data-pdf={item.cover && !item.dossier ? undefined : undefined}>
    {image && !broken ? <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)}/> : <span className="pf-card-cover-mark"><Icon size={26}/><small>{item.org?.split(/[\/(—]/)[0].trim().slice(0, 28)}</small></span>}
    <span className="pf-card-cover-label">{label}</span>
    {date && <time className="pf-card-cover-date">{date}</time>}
  </div>;
}

/** The item's cover (or a case-file figure) as a plain image, loaded from the device store when needed. */
export function CoverImage({ item, alt, loading = "lazy" }: { item: IntelItem; alt: string; loading?: "lazy" | "eager" }) {
  const fallback = item.images?.[0]?.src ?? item.cover ?? item.dossier?.figures?.[0]?.src ?? item.user?.figures?.[0]?.src;
  const [src, setSrc] = useState<string | undefined>(item.images?.[0]?.src ?? item.cover ?? (item.hasCover ? undefined : fallback));
  useEffect(() => { let alive = true; if (!item.images?.length && !item.cover && item.hasCover) void intelRepository.cover(item.id).then(url => { if (alive) setSrc(url ?? fallback); }); return () => { alive = false; }; }, [item.id, item.cover, item.hasCover, fallback]);
  return src ? <img src={src} alt={alt} loading={loading} decoding="async"/> : null;
}
