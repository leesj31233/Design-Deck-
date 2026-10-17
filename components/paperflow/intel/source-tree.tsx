"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronRight, FileText, Globe, Link2 } from "lucide-react";
import { KIND_LABEL, STATUS_LABEL, type IntelItem } from "@/lib/paperflow/intel/types";

export interface LinkPreview { kind: "page" | "pdf"; url: string; host: string; title?: string; site?: string; description?: string; published?: string; image?: string; size?: number; status?: number }

const KEY = "pf-link-previews", memory = new Map<string, Promise<LinkPreview | null>>();
function stored(): Record<string, LinkPreview & { at: number }> { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } }
function keep(url: string, preview: LinkPreview) {
  try {
    const all = stored(); all[url] = { ...preview, at: Date.now() };
    // At most 300 previews on this device; the oldest go first.
    const entries = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 300);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* previews are a convenience */ }
}
/** The page's own title, image and summary, fetched once by the server and remembered on this device for a week. */
export function previewOf(url: string): Promise<LinkPreview | null> {
  const cached = stored()[url];
  if (cached && Date.now() - cached.at < 7 * 864e5) return Promise.resolve(cached);
  let task = memory.get(url);
  if (!task) {
    task = fetch(`/api/intel/preview?url=${encodeURIComponent(url)}`).then(async response => { if (!response.ok) return null; const preview = await response.json() as LinkPreview; keep(url, preview); return preview; }).catch(() => null);
    memory.set(url, task);
  }
  return task;
}

/** A source as a card: its lead image, publisher, date, title and summary; opens the real page. */
export function LinkCard({ url, label, where, compact }: { url: string; label?: string; where?: string; compact?: boolean }) {
  const [preview, setPreview] = useState<LinkPreview | null | undefined>(undefined), [broken, setBroken] = useState(false);
  useEffect(() => { let alive = true; setPreview(undefined); void previewOf(url).then(result => { if (alive) setPreview(result); }); return () => { alive = false; }; }, [url]);
  let host = url; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* shown as given */ }
  const pdf = preview?.kind === "pdf" || /\.pdf($|\?)/i.test(url);
  return <a className="pf-linkcard" data-compact={compact || undefined} data-loading={preview === undefined || undefined} href={url} target="_blank" rel="noreferrer noopener">
    <span className="pf-linkcard-thumb">{preview?.image && !broken ? <img src={preview.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)}/> : pdf ? <FileText size={22}/> : <Globe size={20}/>}</span>
    <span className="pf-linkcard-body">
      <small>{[preview?.site ?? host, preview?.published?.slice(0, 10), pdf ? "PDF" : null, where].filter(Boolean).join(" · ")}</small>
      <strong>{preview?.title || label || host}</strong>
      {!compact && preview?.description && <em>{preview.description}</em>}
      <i><ArrowUpRight size={12}/>원문 페이지 열기</i>
    </span>
  </a>;
}

/**
 * 근거 자료 — the chain of references behind an item: its own source (with the pages, tables or sections
 * the figures come from), then the items it rests on, each with its source, down to the original
 * pages. A branch opens one level at a time (three at most) and never loops back on itself.
 */
export function SourceTree({ item, byId, mentions, onOpen }: { item: IntelItem; byId: Map<string, IntelItem>; mentions: IntelItem[]; onOpen: (id: string) => void }) {
  const children = (node: IntelItem) => (node.relations ?? []).map(relation => ({ relation, target: byId.get(relation.to) })).filter(entry => entry.target);
  if (!item.dossier?.sources?.length && !children(item).length && !mentions.length) return null;
  return <section className="pf-sourcetree"><h4><Link2 size={13}/>이 항목과 이어진 자료</h4>
    {item.dossier?.sources?.length ? <div className="pf-sourcetree-group"><span>케이스 파일 출처</span>{item.dossier.sources.filter(source => source.url).map(source => <LinkCard key={source.ref} url={source.url!} label={`[${source.ref}] ${source.title}`} where={source.where} compact/>)}</div> : null}
    {children(item).length > 0 && <div className="pf-sourcetree-group"><span>이 항목이 기대는 자료</span><ul>{children(item).map(({ relation, target }) => <Branch key={target!.id} item={target!} type={relation.type} byId={byId} onOpen={onOpen} depth={1} seen={new Set([item.id])} children={children}/>)}</ul></div>}
    {mentions.length > 0 && <div className="pf-sourcetree-group"><span>이 항목을 근거로 쓰는 자료</span><ul>{mentions.slice(0, 12).map(mention => <Branch key={mention.id} item={mention} type="cites" byId={byId} onOpen={onOpen} depth={1} seen={new Set([item.id])} children={children}/>)}</ul></div>}
  </section>;
}

function Branch({ item, type, byId, onOpen, depth, seen, children }: { item: IntelItem; type: string; byId: Map<string, IntelItem>; onOpen: (id: string) => void; depth: number; seen: Set<string>; children: (node: IntelItem) => { relation: { to: string; type: string }; target?: IntelItem }[] }) {
  const [open, setOpen] = useState(false);
  const next = children(item).filter(({ target }) => !seen.has(target!.id) && target!.id !== item.id);
  return <li className="pf-branch" data-open={open || undefined}>
    <div className="pf-branch-head">
      <button type="button" className="pf-branch-toggle" aria-expanded={open} aria-label={open ? "접기" : "펼치기"} onClick={() => setOpen(!open)}><ChevronRight size={14}/></button>
      <button type="button" className="pf-branch-title" onClick={() => setOpen(!open)}><span>{type} · {KIND_LABEL[item.kind]}{item.status ? ` · ${STATUS_LABEL[item.status]}` : ""}{item.date ? ` · ${item.date}` : ""}</span>{item.titleKo || item.title}</button>
      <button type="button" className="pf-branch-go" onClick={() => onOpen(item.id)} title="이 항목을 오른쪽에 열기">열기</button>
    </div>
    {open && <div className="pf-branch-body">
      {item.url ? <LinkCard url={item.url} label={item.title} where={(item.data ?? []).map(datum => datum.where).filter(Boolean).slice(0, 3).join(", ") || undefined}/> : <p className="pf-branch-none">원문 링크 없음 (확인 필요 항목)</p>}
      {depth < 3 && next.length > 0 && <ul>{next.map(({ relation, target }) => <Branch key={target!.id} item={target!} type={relation.type} byId={byId} onOpen={onOpen} depth={depth + 1} seen={new Set([...seen, item.id])} children={children}/>)}</ul>}
    </div>}
  </li>;
}
