"use client";
import { useMemo, useState } from "react";
import { WEB_LABEL, WEB_ORDER, type WebLink } from "@/lib/paperflow/intel/web";
import type { IntelEntity } from "@/lib/paperflow/intel/registry";
import "./entity-web.css";

const COLOR: Record<string, string> = { investor: "#7b5cd6", operator: "#2f6fdb", partner: "#1f7a5a", buyer: "#c24f8a", supplier: "#d98a1c", vendor: "#b4691b", certifier: "#3a8f96", competitor: "#d0533f", technology: "#5b6bd6", mentions: "#8a9097" };
const short = (text: string, max = 18) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
const labelOf = (link: WebLink) => link.entity?.name ?? (link.item ? (link.item.titleKo ?? link.item.title).split(/ [—–] /)[0] : link.key);
const DIRECTION: Record<WebLink["direction"], string> = { out: "이 기업의 자료가 밝힘", in: "상대 자료가 밝힘", both: "양쪽 자료가 밝힘" };

/** Why two organisations are linked: each reason as "kind · date", the sentence, and the item it comes from. */
function Reasons({ center, link, onItem, limit = 3 }: { center: IntelEntity; link: WebLink; onItem: (id: string) => void; limit?: number }) {
  return <div className="pf-web-reasons">
    <p className="pf-web-reasons-head"><b>{labelOf(link)}</b>{link.entity && <code>{link.entity.code}</code>}<span>{center.name}의 {link.types.map(type => WEB_LABEL[type] ?? type).join(" · ")} 관계 · {DIRECTION[link.direction]}</span></p>
    <ul>{link.notes.slice(0, limit).map((note, index) => <li key={`${note.via}-${index}`}>
      <small><i style={{ background: COLOR[note.type] ?? COLOR.mentions }}/>{WEB_LABEL[note.type] ?? note.type}{note.date ? ` · ${note.date}` : ""}</small>
      <q data-quoted={note.quoted || undefined}>{note.text}</q>
      <button type="button" onClick={() => onItem(note.via)}>근거: {short(note.viaTitle, 46)}</button>
    </li>)}</ul>
    {link.notes.length > limit && <small className="pf-web-more">근거 {link.notes.length - limit}건 더</small>}
  </div>;
}

/**
 * 연결망: the organisation in the middle, everything it is linked to around it (coloured by the kind of link),
 * and the same links as a list grouped by kind. Pointing at a node or a row shows why it is linked — the
 * sentence that says so, its date and the item it comes from; clicking opens its page.
 */
export function EntityWeb({ center, links, onEntity, onItem }: { center: IntelEntity; links: WebLink[]; onEntity: (entity: IntelEntity) => void; onItem: (id: string) => void }) {
  const [focus, setFocus] = useState<string | null>(null), [pinned, setPinned] = useState<string | null>(null);
  const shown = links.slice(0, 22);
  const nodes = useMemo(() => shown.map((link, index) => {
    const angle = (index / Math.max(shown.length, 1)) * Math.PI * 2 - Math.PI / 2, ring = shown.length > 12 && index % 2 ? 0.74 : 1;
    return { link, x: 360 + Math.cos(angle) * 300 * ring, y: 200 + Math.sin(angle) * 158 * ring };
  }), [shown]);
  const groups = WEB_ORDER.map(type => [type, links.filter(link => link.types[0] === type)] as const).filter(([, list]) => list.length);
  const other = links.filter(link => !WEB_ORDER.includes(link.types[0]));
  const open = (link: WebLink) => link.entity ? onEntity(link.entity) : link.item && onItem(link.item.id);
  const active = nodes.find(node => node.link.key === (focus ?? pinned));
  if (!links.length) return null;
  return <div className="pf-web">
    <div className="pf-web-stage" onMouseLeave={() => setFocus(null)}>
      <svg viewBox="0 0 720 400" role="img" aria-label={`${center.name} 연결망`}>
        {nodes.map(({ link, x, y }) => <line key={`l-${link.key}`} x1={360} y1={200} x2={x} y2={y} stroke={COLOR[link.types[0]] ?? COLOR.mentions} strokeWidth={active?.link.key === link.key ? 2.6 : 1.4} strokeDasharray={link.entity ? undefined : "4 3"} opacity={active && active.link.key !== link.key ? .25 : .7}/>)}
        <g className="pf-web-center"><circle cx={360} cy={200} r={56}/><text x={360} y={196} textAnchor="middle">{short(center.name, 12)}</text><text x={360} y={213} textAnchor="middle" className="pf-web-code">{center.code}</text></g>
        {nodes.map(({ link, x, y }) => <g key={link.key} className="pf-web-node" tabIndex={0} role="button" aria-label={`${labelOf(link)} — ${link.types.map(type => WEB_LABEL[type] ?? type).join(", ")}: ${link.notes[0]?.text ?? ""}`}
          onMouseEnter={() => setFocus(link.key)} onFocus={() => setFocus(link.key)} onBlur={() => setFocus(null)}
          onClick={() => setPinned(pinned === link.key ? null : link.key)} onDoubleClick={() => open(link)} onKeyDown={event => { if (event.key === "Enter") open(link); }}>
          <circle cx={x} cy={y} r={link.entity ? 9 : 6} fill={COLOR[link.types[0]] ?? COLOR.mentions}/>
          <text x={x} y={y + (y < 200 ? -14 : 22)} textAnchor="middle">{short(labelOf(link))}</text>
        </g>)}
      </svg>
      {active && <div className="pf-web-tip" data-side={active.x > 360 ? "left" : "right"} style={{ left: `${active.x / 7.2}%`, top: `${active.y / 4}%` }}>
        <Reasons center={center} link={active.link} onItem={onItem}/>
        <div className="pf-web-tip-actions"><button type="button" onClick={() => open(active.link)}>{active.link.entity ? "기업 페이지 열기" : "자료 열기"}</button>{pinned === active.link.key && <button type="button" onClick={() => setPinned(null)}>닫기</button>}</div>
      </div>}
    </div>
    <div className="pf-web-legend">{groups.map(([type, list]) => <span key={type}><i style={{ background: COLOR[type] }}/>{WEB_LABEL[type]} {list.length}</span>)}<span>점에 마우스를 올리면 연결 근거, 누르면 고정, 두 번 누르면 페이지</span>{links.length > shown.length && <span>그림에는 {shown.length}곳, 목록에 전체 {links.length}곳</span>}</div>
    <div className="pf-web-groups">{[...groups, ...(other.length ? [["other", other] as const] : [])].map(([type, list]) => <section key={type}>
      <h4 style={{ color: COLOR[type] }}>{WEB_LABEL[type] ?? "기타"}</h4>
      <ul>{list.map(link => <li key={link.key} className="pf-web-row">
        <button type="button" className="pf-web-row-main" onClick={() => open(link)}>{link.entity && <code>{link.entity.code}</code>}<b>{labelOf(link)}</b>{link.types.length > 1 && <small>{link.types.slice(1).map(kind => WEB_LABEL[kind] ?? kind).join(" · ")}</small>}</button>
        {link.notes[0] && <p className="pf-web-row-why">{link.notes[0].date && <time>{link.notes[0].date}</time>}{link.notes[0].text}</p>}
        <div className="pf-web-row-tip"><Reasons center={center} link={link} onItem={onItem} limit={4}/></div>
      </li>)}</ul>
    </section>)}</div>
  </div>;
}
