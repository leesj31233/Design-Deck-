"use client";
import { useMemo, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { CLASS_SHORT, PATENT_GROUPS, PATENT_STATUS_LABEL, itemClasses, type IntelItem, type PatentStatus } from "@/lib/paperflow/intel/types";
import type { IntelEntity } from "@/lib/paperflow/intel/registry";
import "./patent-board.css";

const OFFICE_KO: Record<string, string> = { KR: "한국", US: "미국", EP: "유럽", WO: "PCT", JP: "일본", CN: "중국", ID: "인도네시아", MY: "말레이시아", TH: "태국", VN: "베트남", IN: "인도", BR: "브라질", AU: "호주", DE: "독일", GB: "영국", FR: "프랑스", CA: "캐나다", FI: "핀란드", AT: "오스트리아", NL: "네덜란드", SG: "싱가포르", PH: "필리핀" };
const GROUP_LABEL = new Map(PATENT_GROUPS);
export const patentLink = (number: string) => `https://patents.google.com/patent/${number.replace(/[\s,-]/g, "")}`;

/**
 * 특허(IP): the patents collected around the three classes, by technology group, filterable by office (country),
 * status and technology group. A company page opens it filtered to that company's patents.
 */
export function PatentBoard({ items, entity, onClearEntity, onOpen, matches }: { items: IntelItem[]; entity?: IntelEntity | null; onClearEntity: () => void; onOpen: (id: string) => void;
  /** Whether a patent belongs to the chosen entity (applicant, registry code or relation). */
  matches: (item: IntelItem, entity: IntelEntity) => boolean }) {
  const [office, setOffice] = useState<string | null>(null), [status, setStatus] = useState<PatentStatus | null>(null), [group, setGroup] = useState<string | null>(null);
  const scoped = useMemo(() => items.filter(item => !entity || matches(item, entity)), [items, entity, matches]);
  const shown = scoped.filter(item => (!office || item.patent!.office === office) && (!status || item.patent!.status === status) && (!group || (item.patent!.group ?? "other") === group));
  const count = (key: (item: IntelItem) => string) => { const counts = new Map<string, number>(); for (const item of scoped) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1); return [...counts].sort((a, b) => b[1] - a[1]); };
  const groups = PATENT_GROUPS.map(([key, label]) => [key, label, shown.filter(item => (item.patent!.group ?? "other") === key)] as const).filter(([, , list]) => list.length);
  const date = (item: IntelItem) => item.patent!.grantDate ?? item.patent!.publicationDate ?? item.patent!.filingDate ?? item.date ?? "";
  return <section className="pf-patents" aria-label="특허(IP)">
    {entity && <p className="pf-patents-scope">{entity.name}의 특허 {scoped.length}건 <button type="button" onClick={onClearEntity}><X size={13}/>전체 특허 보기</button></p>}
    <div className="pf-patents-filters">
      <div role="group" aria-label="국가(특허청)"><button type="button" aria-pressed={!office} onClick={() => setOffice(null)}>모든 국가</button>{count(item => item.patent!.office).map(([key, n]) => <button key={key} type="button" aria-pressed={office === key} onClick={() => setOffice(office === key ? null : key)}><b>{key}</b>{OFFICE_KO[key] ?? ""}<i>{n}</i></button>)}</div>
      <div role="group" aria-label="상태"><button type="button" aria-pressed={!status} onClick={() => setStatus(null)}>모든 상태</button>{count(item => item.patent!.status).map(([key, n]) => <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(status === key ? null : key as PatentStatus)}>{PATENT_STATUS_LABEL[key as PatentStatus]}<i>{n}</i></button>)}</div>
      <div role="group" aria-label="기술 분류"><button type="button" aria-pressed={!group} onClick={() => setGroup(null)}>모든 분류</button>{count(item => item.patent!.group ?? "other").map(([key, n]) => <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(group === key ? null : key)}>{GROUP_LABEL.get(key) ?? key}<i>{n}</i></button>)}</div>
    </div>
    {groups.map(([key, label, list]) => <section key={key} className="pf-patents-group">
      <h3>{label} <small>{list.length}건</small></h3>
      <table><thead><tr><th>번호</th><th>발명의 명칭</th><th>출원인</th><th>상태</th><th>날짜</th><th>분류</th><th/></tr></thead>
        <tbody>{[...list].sort((a, b) => date(b).localeCompare(date(a))).map(item => { const patent = item.patent!; return <tr key={item.id} onClick={() => onOpen(item.id)} tabIndex={0} onKeyDown={event => { if (event.key === "Enter") onOpen(item.id); }}>
          <td><code>{patent.number}</code><small>{OFFICE_KO[patent.office] ?? patent.office}</small></td>
          <td><b>{item.titleKo ?? item.title}</b>{item.titleKo && item.titleKo !== item.title && <small>{item.title}</small>}<span className="pf-patents-classes">{itemClasses(item).map(klass => <i key={klass} data-class={klass}>{CLASS_SHORT[klass]}</i>)}</span></td>
          <td>{patent.applicants.slice(0, 2).join(", ")}{patent.applicants.length > 2 ? ` 외 ${patent.applicants.length - 2}` : ""}</td>
          <td><span className="pf-patents-status" data-status={patent.status}>{PATENT_STATUS_LABEL[patent.status]}</span></td>
          <td><time>{date(item)}</time></td>
          <td>{patent.cpc?.slice(0, 2).join(" · ")}</td>
          <td><a href={item.url || patentLink(patent.number)} target="_blank" rel="noreferrer noopener" onClick={event => event.stopPropagation()} title="원문(특허 공보) 열기"><ExternalLink size={14}/></a></td>
        </tr>; })}</tbody></table>
    </section>)}
    {!shown.length && <p className="pf-patents-none">{scoped.length ? "조건에 맞는 특허가 없습니다." : entity ? "이 기업의 특허는 아직 수집되지 않았습니다." : "수집된 특허가 아직 없습니다."}</p>}
  </section>;
}
