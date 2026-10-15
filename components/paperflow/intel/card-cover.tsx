"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Building2, FileText, Gauge, HelpCircle, Landmark, Newspaper, Wrench } from "lucide-react";
import { SOURCE_LABEL, UPDATE_LABEL, type IntelItem } from "@/lib/paperflow/intel/types";
import { previewOf } from "./source-tree";

const ICON = { paper: BookOpen, gov: Landmark, "test-report": Gauge, "annual-report": Building2, patent: FileText, "vendor-catalog": Wrench, "market-analyst": Gauge, press: Newspaper } as Record<string, typeof BookOpen>;

/**
 * The picture on a card: a paper's or report's first page, an article's lead image or front page, a
 * case file's key figure — stored with the item, or (for a web page without one) the page's own lead
 * image, fetched only when the card comes into view. Over it: what the document is and its date.
 */
export function CardCover({ item }: { item: IntelItem }) {
  const stored = item.cover ?? item.dossier?.figures?.[0]?.src ?? item.user?.figures?.[0]?.src;
  const [image, setImage] = useState<string | undefined>(stored), [broken, setBroken] = useState(false), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setImage(stored); setBroken(false);
    if (stored || !item.url || item.kind === "gap") return;
    const element = box.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void previewOf(item.url).then(preview => { if (preview?.image) setImage(preview.image); });
    }, { rootMargin: "200px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [stored, item.url, item.kind]);
  const Icon = item.kind === "gap" ? HelpCircle : ICON[item.sourceType ?? ""] ?? FileText;
  const label = item.update ? UPDATE_LABEL[item.update.type] : item.kind === "gap" ? "확인 필요" : SOURCE_LABEL[item.sourceType ?? ""] ?? "자료";
  const date = item.update?.date ?? item.date;
  return <div ref={box} className="pf-card-cover" data-source={item.sourceType} data-kind={item.kind} data-empty={!image || broken || undefined} data-pdf={item.cover && !item.dossier ? undefined : undefined}>
    {image && !broken ? <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)}/> : <span className="pf-card-cover-mark"><Icon size={26}/><small>{item.org?.split(/[\/(—]/)[0].trim().slice(0, 28)}</small></span>}
    <span className="pf-card-cover-label">{label}</span>
    {date && <time className="pf-card-cover-date">{date}</time>}
  </div>;
}
