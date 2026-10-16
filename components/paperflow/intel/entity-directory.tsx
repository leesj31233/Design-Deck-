"use client";
import { useMemo, useState } from "react";
import { Building2, ChevronRight } from "lucide-react";
import type { IntelItem } from "@/lib/paperflow/intel/types";
import { CATEGORY_LABEL, CATEGORY_ORDER, EQUIPMENT_LABEL, EQUIPMENT_TYPES, FOCUS_LABEL, entityItems, type EquipmentType, type EntityCategory, type IntelEntity, type indexRegistry } from "@/lib/paperflow/intel/registry";
import { CoverImage } from "./card-cover";
import "./entity-directory.css";

type Index = ReturnType<typeof indexRegistry>;
const TIER_LABEL = { 1: "1차 벤더", 2: "2차 벤더", 3: "서비스" } as const;
const COUNTRY_KO: Record<string, string> = { ID: "인도네시아", MY: "말레이시아", JP: "일본", KR: "한국", SG: "싱가포르", CN: "중국", DE: "독일", AT: "오스트리아", FI: "핀란드", NL: "네덜란드", NO: "노르웨이", SE: "스웨덴", US: "미국", GB: "영국", CH: "스위스", DK: "덴마크", ES: "스페인", FR: "프랑스", IT: "이탈리아", VN: "베트남", TH: "태국", AU: "호주", CA: "캐나다", BR: "브라질", IN: "인도", HK: "홍콩", RU: "러시아", PH: "필리핀", BE: "벨기에", TW: "대만", NZ: "뉴질랜드", PL: "폴란드", EE: "에스토니아", IE: "아일랜드", AE: "아랍에미리트", XX: "국제" };
/** NAYSOR's markets first: Indonesia, Malaysia, Japan, Korea, Singapore, then the rest. */
const COUNTRY_ORDER = ["ID", "MY", "JP", "KR", "SG", "TH", "VN", "CN"];
const rank = (code: string) => { const at = COUNTRY_ORDER.indexOf(code.slice(0, 2)); return (at < 0 ? 50 : at) * 10000 + Number(code.slice(3)); };
export const countryOf = (code: string) => COUNTRY_KO[code.slice(0, 2)] ?? code.slice(0, 2);

/**
 * 기업 분석 as a directory of organisations: each once, under NAYSOR's code, grouped by category
 * (기업 · 벤더 · 인증 · 마켓 · 기관), filterable by country. A parent shows its subsidiaries; a tile shows
 * the organisation's photo, logo, code and how much is collected about it.
 */
export function EntityDirectory({ index, byId, query, onOpen }: { index: Index; byId: Map<string, IntelItem>; query: string; onOpen: (entity: IntelEntity) => void }) {
  const all = useMemo(() => [...index.byCode.values()], [index]);
  const [category, setCategory] = useState<EntityCategory | "all">("company"), [country, setCountry] = useState<string | null>(null), [equipment, setEquipment] = useState<EquipmentType | null>(null);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (entity: IntelEntity) => words.every(word => [entity.code, entity.name, entity.legalName, entity.country, ...entity.aliases].join(" ").toLowerCase().includes(word));
  // 장비 벤더 lists equipment suppliers by kind; a company with its own equipment line shows there too.
  const inVendors = (entity: IntelEntity) => entity.category === "vendor" || Boolean(entity.equipmentTypes?.length);
  const inCategory = all.filter(entity => category === "all" || (category === "vendor" ? inVendors(entity) : entity.category === category)).filter(entity => category !== "vendor" || !equipment || entity.equipmentTypes?.includes(equipment));
  const countries = [...new Set(inCategory.map(entity => entity.code.slice(0, 2)))].sort((a, b) => rank(`${a}-00`) - rank(`${b}-00`) || inCategory.filter(e => e.code.startsWith(b)).length - inCategory.filter(e => e.code.startsWith(a)).length);
  // Parents first; a subsidiary shows under its parent unless the parent is filtered out.
  const shown = inCategory.filter(entity => (!country || entity.code.startsWith(country)) && matches(entity));
  const shownCodes = new Set(shown.map(entity => entity.code));
  const roots = shown.filter(entity => !entity.parentCode || !shownCodes.has(entity.parentCode)).sort((a, b) => rank(a.code) - rank(b.code));
  return <section className="pf-dir" aria-label="기업 분석">
    <div className="pf-dir-tabs" role="tablist" aria-label="분류">
      {(["all", ...CATEGORY_ORDER] as const).filter(key => key === "all" || all.some(entity => entity.category === key)).map(key => <button key={key} type="button" role="tab" aria-selected={category === key} onClick={() => { setCategory(key); setCountry(null); setEquipment(null); }}>
        {key === "all" ? "전체" : CATEGORY_LABEL[key]}<i>{key === "all" ? all.length : all.filter(entity => key === "vendor" ? inVendors(entity) : entity.category === key).length}</i></button>)}
    </div>
    {category === "vendor" && <div className="pf-dir-equipment" role="group" aria-label="장비 종류">
      <button type="button" aria-pressed={!equipment} onClick={() => setEquipment(null)}>모든 장비</button>
      {EQUIPMENT_TYPES.map(([key, label]) => { const count = all.filter(entity => inVendors(entity) && entity.equipmentTypes?.includes(key)).length; return count ? <button key={key} type="button" aria-pressed={equipment === key} onClick={() => { setEquipment(equipment === key ? null : key); setCountry(null); }}>{label}<i>{count}</i></button> : null; })}
    </div>}
    <div className="pf-dir-countries" role="group" aria-label="국가">
      <button type="button" aria-pressed={!country} onClick={() => setCountry(null)}>모든 국가</button>
      {countries.map(code => <button key={code} type="button" aria-pressed={country === code} onClick={() => setCountry(country === code ? null : code)}><b>{code}</b>{countryOf(code)}<i>{inCategory.filter(entity => entity.code.startsWith(code)).length}</i></button>)}
    </div>
    <ul className="pf-dir-grid">
      {roots.map(entity => <li key={entity.code}><EntityTile entity={entity} index={index} byId={byId} onOpen={onOpen} subs={(index.children.get(entity.code) ?? []).filter(child => shownCodes.has(child.code) || !country)}/></li>)}
      {!roots.length && <li className="pf-dir-none">조건에 맞는 기업이 없습니다.</li>}
    </ul>
  </section>;
}

function EntityTile({ entity, index, byId, subs, onOpen }: { entity: IntelEntity; index: Index; byId: Map<string, IntelItem>; subs: IntelEntity[]; onOpen: (entity: IntelEntity) => void }) {
  const page = entity.canonicalItemId ? byId.get(entity.canonicalItemId) : undefined;
  const items = entityItems(entity, index, byId);
  const news = items.filter(item => item.update).sort((a, b) => b.update!.date.localeCompare(a.update!.date));
  const projects = items.filter(item => item.kind === "project").length;
  const line = (page?.profile?.industry ?? page?.profile?.role ?? "").slice(0, 70);
  return <article className="pf-dir-tile" data-category={entity.category}>
    <button type="button" className="pf-dir-main" onClick={() => onOpen(entity)} aria-label={`${entity.name} 기업 페이지`}>
      <span className="pf-dir-photo">{page && (page.cover || page.hasCover || page.dossier?.figures?.length) ? <CoverImage item={page} alt=""/> : <span className="pf-dir-photo-none"><Building2 size={22}/></span>}</span>
      <span className="pf-dir-logo" data-dark={page?.logoDark || undefined}>{page?.logo ? <img src={page.logo} alt=""/> : <b>{entity.name.replace(/^(PT|CV)\s+/i, "").slice(0, 2).toUpperCase()}</b>}</span>
      <span className="pf-dir-body">
        <span className="pf-dir-meta"><code>{entity.code}</code>{countryOf(entity.code)} · {CATEGORY_LABEL[entity.category]}{entity.tier ? ` · ${TIER_LABEL[entity.tier]}` : ""}{entity.focus && FOCUS_LABEL[entity.focus] ? ` · ${FOCUS_LABEL[entity.focus]}` : ""}</span>
        <b className="pf-dir-name">{entity.name}</b>
        {line && <span className="pf-dir-line">{line}</span>}
        {entity.equipmentTypes?.length ? <span className="pf-dir-types">{entity.equipmentTypes.map(type => <i key={type}>{EQUIPMENT_LABEL[type]}</i>)}</span> : null}
        <span className="pf-dir-stats">{page?.dossier ? <em>케이스 파일</em> : null}{projects > 0 && <span>프로젝트 {projects}</span>}<span>자료 {items.length + (page ? 1 : 0)}</span>{news[0] && <span>최근 {news[0].update!.date}</span>}</span>
      </span>
    </button>
    {subs.length > 0 && <ul className="pf-dir-subs" aria-label="자회사·관계사">{subs.map(sub => <li key={sub.code}><button type="button" onClick={() => onOpen(sub)}><code>{sub.code}</code>{sub.name}<ChevronRight size={13}/></button></li>)}</ul>}
  </article>;
}
