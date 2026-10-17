"use client";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus } from "lucide-react";
import { PRICE_STATUS_LABEL, PRODUCT_LABEL, PRODUCT_ORDER, priceMove, type PriceBoard as Board, type PriceProduct, type PriceSeries } from "@/lib/paperflow/intel/prices";
import "./price-board.css";

const COUNTRY: Record<string, string> = { ID: "인도네시아", MY: "말레이시아", VN: "베트남", TH: "태국", JP: "일본", KR: "한국", CN: "중국", US: "미국", DE: "독일", AT: "오스트리아", SE: "스웨덴", GB: "영국", NL: "네덜란드", DK: "덴마크", CA: "캐나다", EU: "유럽", XX: "국제", XW: "글로벌", IT: "이탈리아", IN: "인도", AU: "호주", MN: "몽골", CI: "코트디부아르", TZ: "탄자니아", KH: "캄보디아", NG: "나이지리아", BR: "브라질", BJ: "베냉", GH: "가나" };
const PERIOD: Record<string, string> = { month: "월평균", quarter: "분기평균", year: "연평균" };
const number = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: Math.abs(value) < 10 ? 2 : Math.abs(value) < 1000 ? 2 : 0 });
const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${number(Math.abs(value))}`;

/** A small line of the series' points (scaled to its own range), coloured by the last move. */
function Spark({ series, direction }: { series: PriceSeries; direction: string }) {
  const values = series.points.map(point => point.value);
  if (values.length < 2) return <svg className="pf-price-spark" viewBox="0 0 120 34" aria-hidden><line x1="0" x2="120" y1="17" y2="17" data-flat/></svg>;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const path = values.map((value, index) => `${index ? "L" : "M"}${(index / (values.length - 1) * 116 + 2).toFixed(1)},${(30 - (value - min) / span * 26).toFixed(1)}`).join(" ");
  const [x, y] = path.split(" ").pop()!.slice(1).split(",");
  return <svg className="pf-price-spark" viewBox="0 0 120 34" aria-hidden data-direction={direction}><path d={path}/><circle cx={x} cy={y} r="2.6"/></svg>;
}

function Ticker({ series, latestDay, open, onOpen, onItem }: { series: PriceSeries; latestDay: string; open: boolean; onOpen: () => void; onItem: (id: string) => void }) {
  const move = priceMove(series), { last, previous } = move;
  const Arrow = move.direction === "up" ? ArrowUpRight : move.direction === "down" ? ArrowDownRight : Minus;
  return <article className="pf-price" data-direction={move.direction} data-hero={series.product === "efb-pellet" || undefined} data-open={open || undefined}>
    <button type="button" className="pf-price-main" aria-expanded={open} onClick={onOpen}>
      <span className="pf-price-meta">{series.country && <code>{series.country}</code>}<span>{[COUNTRY[series.country ?? ""] ?? series.country, series.market].filter(Boolean).join(" · ")}</span>{last.date >= latestDay && <em>최신</em>}</span>
      <b className="pf-price-name">{series.name}</b>
      {series.grade && <small className="pf-price-grade">{series.grade}</small>}
      <span className="pf-price-row">
        <span className="pf-price-value"><strong>{number(last.value)}</strong><small>{series.unit}{last.period ? ` · ${PERIOD[last.period]}` : ""}{last.range ? ` · ${number(last.range[0])}–${number(last.range[1])}` : ""}</small></span>
        <Spark series={series} direction={move.direction}/>
      </span>
      <span className="pf-price-move"><Arrow size={14}/>{move.change === undefined ? "첫 기록" : `${signed(move.change)} (${signed(move.percent ?? 0)}%)`}{previous && <small>{previous.date} 대비</small>}</span>
    </button>
    <footer className="pf-price-foot">
      <span>업데이트 {last.date} · <i data-status={last.status}>{PRICE_STATUS_LABEL[last.status]}</i></span>
      <span className="pf-price-src">근거 {last.source.url ? <a href={last.source.url} target="_blank" rel="noreferrer noopener">{last.source.org ? `${last.source.org} — ` : ""}{last.source.title}<ExternalLink size={11}/></a> : <>{last.source.org ? `${last.source.org} — ` : ""}{last.source.title}</>}{last.itemId && <button type="button" onClick={() => onItem(last.itemId!)}>자료 보기</button>}</span>
    </footer>
    {open && <table className="pf-price-history">
      <thead><tr><th>날짜</th><th>가격 ({series.unit})</th><th>변동</th><th>근거</th></tr></thead>
      <tbody>{[...series.points].reverse().map((point, index, list) => { const before = list[index + 1], change = before ? point.value - before.value : undefined; return <tr key={`${point.date}-${index}`}>
        <td>{point.date}</td><td className="pf-price-num">{number(point.value)}{point.range && <small> ({number(point.range[0])}–{number(point.range[1])})</small>}{point.period && <small> {PERIOD[point.period]}</small>}</td>
        <td className="pf-price-num" data-direction={change === undefined ? undefined : change > 0 ? "up" : change < 0 ? "down" : "flat"}>{change === undefined ? "—" : signed(change)}</td>
        <td>{point.source.url ? <a href={point.source.url} target="_blank" rel="noreferrer noopener">{point.source.org ?? point.source.title}</a> : point.source.org ?? point.source.title}<small> · {PRICE_STATUS_LABEL[point.status]}{point.note ? ` · ${point.note}` : ""}</small></td>
      </tr>; })}</tbody>
    </table>}
  </article>;
}

/**
 * 가격 보드: what EFB pellets and their benchmarks (PKS, wood pellets, other biomass pellets, black pellets,
 * biochar and its carbon credits) cost in each market, the last move (green up, red down) and where each number
 * comes from. EFB pellets lead; a series opens into its full history.
 */
export function PriceBoard({ board, title = "가격 보드", onItem }: { board: Board; title?: string; onItem: (id: string) => void }) {
  const [product, setProduct] = useState<PriceProduct | "all">("all"), [open, setOpen] = useState<string | null>(null), [more, setMore] = useState<Set<PriceProduct>>(new Set());
  const latestDay = useMemo(() => board.series.reduce((day, series) => { const date = series.points[series.points.length - 1].date; return date > day ? date : day; }, ""), [board]);
  const groups = useMemo(() => PRODUCT_ORDER.map(key => [key, board.series.filter(series => series.product === key).sort((a, b) => b.points[b.points.length - 1].date.localeCompare(a.points[a.points.length - 1].date))] as const).filter(([, list]) => list.length), [board]);
  const moves = useMemo(() => board.series.map(priceMove), [board]);
  const up = moves.filter(move => move.direction === "up").length, down = moves.filter(move => move.direction === "down").length;
  const shown = groups.filter(([key]) => product === "all" || key === product);
  return <section className="pf-prices" aria-label="가격 보드">
    <header className="pf-prices-head">
      <div><h3>{title}</h3><p>최근 업데이트 {latestDay} · {board.series.length}개 시리즈 · <span data-direction="up">▲ {up}</span> <span data-direction="down">▼ {down}</span> · 변동은 같은 시리즈의 직전 기록 대비</p></div>
      <div className="pf-prices-filter" role="group" aria-label="품목">
        <button type="button" aria-pressed={product === "all"} onClick={() => setProduct("all")}>전체</button>
        {groups.map(([key, list]) => <button key={key} type="button" aria-pressed={product === key} onClick={() => setProduct(product === key ? "all" : key)}>{PRODUCT_LABEL[key]}<i>{list.length}</i></button>)}
      </div>
    </header>
    {shown.map(([key, list]) => <div key={key} className="pf-prices-group" data-product={key}>
      <h4>{PRODUCT_LABEL[key]}{key === "efb-pellet" && <small>NAYSOR 주력 제품</small>}</h4>
      {/* The whole board at a glance: EFB pellets in full, five of every other product until asked for more. */}
      <div className="pf-prices-grid">{list.slice(0, product !== "all" || key === "efb-pellet" || more.has(key) ? undefined : 5).map(series => <Ticker key={series.id} series={series} latestDay={latestDay} open={open === series.id} onOpen={() => setOpen(open === series.id ? null : series.id)} onItem={onItem}/>)}</div>
      {product === "all" && key !== "efb-pellet" && list.length > 5 && <button type="button" className="pf-prices-more" onClick={() => setMore(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })}>{more.has(key) ? "접기" : `${PRODUCT_LABEL[key]} ${list.length - 5}개 더 보기`}</button>}
    </div>)}
  </section>;
}
