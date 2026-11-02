"use client";
import { useMemo, useState } from "react";
import { DIRECT, WEB_LABEL, WEB_ORDER, isDirect, type WebLink } from "@/lib/paperflow/intel/web";
import type { IntelEntity } from "@/lib/paperflow/intel/registry";
import { TOPIC_LABEL } from "@/lib/paperflow/intel/types";
import "./entity-web.css";

const COLOR: Record<string, string> = { investor: "#7b5cd6", operator: "#2f6fdb", partner: "#1f7a5a", buyer: "#c24f8a", supplier: "#d98a1c", vendor: "#b4691b", certifier: "#3a8f96", competitor: "#d0533f", technology: "#5b6bd6", mentions: "#8a9097" };
/** Short words for the lines of the map. */
const EDGE: Record<string, string> = { investor: "모회사·투자", operator: "운영", partner: "협력", supplier: "공급", buyer: "구매", vendor: "장비 공급", certifier: "인증", competitor: "경쟁", technology: "같은 기술", mentions: "언급" };
const short = (text: string, max = 18) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
const labelOf = (link: WebLink) => link.entity?.name ?? (link.item ? (link.item.titleKo ?? link.item.title).split(/ [—–] /)[0] : link.key);
const DIRECTION: Record<WebLink["direction"], string> = { out: "이 기업의 자료가 밝힘", in: "상대 자료가 밝힘", both: "양쪽 자료가 밝힘" };

/** Why two organisations are linked: each reason as "kind · date", the sentence, and the item it comes from. */
function Reasons({ center, link, onItem, limit = 3 }: { center: IntelEntity; link: WebLink; onItem: (id: string) => void; limit?: number }) {
  return <div className="pf-web-reasons">
    <p className="pf-web-reasons-head"><b>{labelOf(link)}</b>{link.entity && <code>{link.entity.code}</code>}<span>{center.name}의 {link.types.map(type => WEB_LABEL[type] ?? type).join(" · ")} 관계 · {DIRECTION[link.direction]}{link.segment ? ` · 경쟁 분야: ${TOPIC_LABEL.get(link.segment) ?? link.segment}` : ""}</span></p>
    <ul>{link.notes.slice(0, limit).map((note, index) => <li key={`${note.via}-${index}`}>
      <small><i style={{ background: COLOR[note.type] ?? COLOR.mentions }}/>{WEB_LABEL[note.type] ?? note.type}{note.date ? ` · ${note.date}` : ""}</small>
      {note.quoted ? <q data-quoted>{note.text}</q> : <q className="pf-web-unquoted">근거 문장 미확인 — 자료 제목: {note.text}</q>}
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
export function EntityWeb({ center, links: all, onEntity, onItem }: { center: IntelEntity; links: WebLink[]; onEntity: (entity: IntelEntity) => void; onItem: (id: string) => void }) {
  const [focus, setFocus] = useState<string | null>(null), [pinned, setPinned] = useState<string | null>(null), [context, setContext] = useState(false);
  // Facts only by default (owner, operator, partner, supplier, buyer, equipment vendor, certifier); shared
  // technology, competition and mentions are context, shown on request.
  const direct = useMemo(() => all.filter(isDirect).map(link => ({ ...link, types: link.types.filter(type => DIRECT.has(type)), notes: link.notes.filter(note => DIRECT.has(note.type)) })), [all]);
  const indirect = all.filter(link => !isDirect(link) && link.notes.some(note => note.quoted)).length;
  // Context links need at least one quoted sentence; a title alone is not evidence.
  const links = context ? all.filter(link => isDirect(link) || link.notes.some(note => note.quoted)) : direct;
  const shown = links.slice(0, 22);
  const nodes = useMemo(() => shown.map((link, index) => {
    const angle = (index / Math.max(shown.length, 1)) * Math.PI * 2 - Math.PI / 2, ring = shown.length > 12 && index % 2 ? 0.74 : 1;
    return { link, x: 360 + Math.cos(angle) * 300 * ring, y: 200 + Math.sin(angle) * 158 * ring };
  }), [shown]);
  const groups = WEB_ORDER.map(type => [type, links.filter(link => link.types[0] === type)] as const).filter(([, list]) => list.length);
  const other = links.filter(link => !WEB_ORDER.includes(link.types[0]));
  const open = (link: WebLink) => link.entity ? onEntity(link.entity) : link.item && onItem(link.item.id);
  const active = nodes.find(node => node.link.key === (focus ?? pinned));
  if (!all.length) return null;
  return <div className="pf-web">
    <div className="pf-web-stage" onMouseLeave={() => setFocus(null)}>
      <svg viewBox="0 0 720 400" role="img" aria-label={`${center.name} 연결망`}>
        {nodes.map(({ link, x, y }) => <line key={`l-${link.key}`} x1={360} y1={200} x2={x} y2={y} stroke={COLOR[link.types[0]] ?? COLOR.mentions} strokeWidth={active?.link.key === link.key ? 2.6 : 1.4} strokeDasharray={!isDirect(link) ? "5 4" : link.entity ? undefined : "4 3"} opacity={active && active.link.key !== link.key ? .25 : .7}/>)}
        {/* The kind of each link, written on the line itself (모회사, 운영, 구매, 인증…). */}
        {nodes.map(({ link, x, y }) => <text key={`t-${link.key}`} className="pf-web-edge" x={360 + (x - 360) * .58} y={200 + (y - 200) * .58 - 3} textAnchor="middle" fill={COLOR[link.types[0]] ?? COLOR.mentions} opacity={active && active.link.key !== link.key ? .3 : 1}>{link.types.slice(0, 2).map(type => type === "competitor" && link.segment ? `경쟁 · ${TOPIC_LABEL.get(link.segment) ?? link.segment}` : EDGE[type] ?? WEB_LABEL[type] ?? type).join("·")}</text>)}
        <g className="pf-web-center"><circle cx={360} cy={200} r={56}/><text x={360} y={196} textAnchor="middle">{short(center.name, 12)}</text><text x={360} y={213} textAnchor="middle" className="pf-web-code">{center.code}</text></g>
        {nodes.map(({ link, x, y }) => <g key={link.key} className="pf-web-node" tabIndex={0} role="button" aria-label={`${labelOf(link)} — ${link.types.map(type => WEB_LABEL[type] ?? type).join(", ")}: ${link.notes[0]?.text ?? ""}`}
          onMouseEnter={() => setFocus(link.key)} onFocus={() => setFocus(link.key)} onBlur={() => setFocus(null)}
          onClick={() => setPinned(pinned === link.key ? null : link.key)} onDoubleClick={() => open(link)} onKeyDown={event => { if (event.key === "Enter") open(link); }}>
          <circle cx={x} cy={y} r={link.entity ? 9 : 6} fill={COLOR[link.types[0]] ?? COLOR.mentions}/>
          <text x={x} y={y + (y < 200 ? -14 : 22)} textAnchor="middle">{short(labelOf(link))}</text>
        </g>)}
      </svg>
      {/* The reasons sit beside the map, never over it, so the rest of the web stays readable. */}
      <aside className="pf-web-detail" aria-live="polite">
        {active ? <>
          <Reasons center={center} link={active.link} onItem={onItem} limit={4}/>
          <div className="pf-web-tip-actions"><button type="button" onClick={() => open(active.link)}>{active.link.entity ? "기업 페이지 열기" : "자료 열기"}</button>{pinned === active.link.key && <button type="button" onClick={() => setPinned(null)}>고정 해제</button>}</div>
        </> : <div className="pf-web-detail-empty">
          <b>{center.name}의 직접 관계 {direct.length}곳</b>
          <p>점에 마우스를 올리면 여기에 그 관계의 근거(문장·날짜·출처)가 나옵니다. 누르면 고정되고, 두 번 누르면 그 페이지가 열립니다.</p>
          {!direct.length && <p>아직 출처로 확인된 직접 관계가 없습니다. 간접 언급만 있습니다.</p>}
        </div>}
      </aside>
    </div>
    <div className="pf-web-legend">{groups.map(([type, list]) => <span key={type}><i style={{ background: COLOR[type] }}/>{WEB_LABEL[type]} {list.length}</span>)}<span>점에 마우스를 올리면 연결 근거, 누르면 고정, 두 번 누르면 페이지</span>{indirect > 0 && <button type="button" className="pf-web-context" aria-pressed={context} onClick={() => setContext(!context)}>{context ? "직접 관계만 보기" : `간접 언급 ${indirect}건도 보기`}</button>}{links.length > shown.length && <span>그림에는 {shown.length}곳, 목록에 전체 {links.length}곳</span>}</div>
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
