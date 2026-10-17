/**
 * The price board: pellet, PKS, biochar and carbon-credit prices by product, market and country, each point
 * with its date and the source it was read from. Travels as a hidden briefing ("__prices__") like the registry.
 * A move is read only between two points of the same series (same basis, same unit), never across series.
 */
export type PriceProduct = "efb-pellet" | "wood-pellet" | "pks" | "white-pellet" | "black-pellet" | "biochar" | "biochar-cdr" | "coal" | "cashew";
export type PriceStatus = "verified" | "reported" | "estimate";
/** A point; a source that gave a range keeps it (value is then its middle), an average names its period. */
export interface PricePoint { date: string; value: number; range?: [number, number]; period?: "month" | "quarter" | "year"; source: { title: string; org?: string; url?: string }; itemId?: string; status: PriceStatus; note?: string }
export interface PriceSeries { id: string; product: PriceProduct; name: string; grade?: string; country?: string; market?: string; unit: string; points: PricePoint[] }
export interface PriceBoard { generatedAt: string; series: PriceSeries[] }

export const PRICES_BRIEF = "__prices__";
/** EFB pellet first: it is what NAYSOR sells; the rest are its benchmarks and neighbours. */
export const PRODUCT_ORDER: PriceProduct[] = ["efb-pellet", "pks", "wood-pellet", "white-pellet", "black-pellet", "biochar", "biochar-cdr", "coal", "cashew"];
export const PRODUCT_LABEL: Record<PriceProduct, string> = { "efb-pellet": "EFB 펠릿", pks: "PKS", "wood-pellet": "목재 펠릿", "white-pellet": "기타 바이오매스 펠릿", "black-pellet": "블랙 펠릿", biochar: "바이오차", "biochar-cdr": "바이오차 탄소제거 크레딧", coal: "석탄 (저품위탄·기준가)", cashew: "캐슈넛·껍질·CNSL" };
/** Coal prices belong to Class 2, cashew (nuts, shells, shell oil) to Class 3, every pellet and biochar price to Class 1. */
export const productClass = (product: PriceProduct): "c1" | "c2" | "c3" => product === "coal" ? "c2" : product === "cashew" ? "c3" : "c1";
export const PRICE_STATUS_LABEL: Record<PriceStatus, string> = { verified: "공식·평가가", reported: "보도", estimate: "추정" };
const PRODUCTS = new Set<string>(PRODUCT_ORDER), STATUSES = new Set(["verified", "reported", "estimate"]);

const str = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
const url = (value: unknown) => { const text = str(value, 1000); try { return text && /^https?:$/.test(new URL(text).protocol) ? text : undefined; } catch { return undefined; } };

/** Checks a board field by field: known products, dated numeric points with a named source. */
export function cleanPrices(value: unknown): PriceBoard | null {
  const raw = value as { series?: unknown; generatedAt?: unknown } | null;
  if (!raw || !Array.isArray(raw.series)) return null;
  const seen = new Set<string>();
  const series = raw.series.slice(0, 300).flatMap(entry => {
    const s = entry as Record<string, unknown>, id = str(s?.id, 80), name = str(s?.name, 120), product = str(s?.product, 20), unit = str(s?.unit, 20);
    if (!id || !/^[\w.-]+$/.test(id) || seen.has(id) || !name || !product || !PRODUCTS.has(product) || !unit) return [];
    const points = (Array.isArray(s.points) ? s.points : []).slice(0, 400).flatMap((item): PricePoint[] => {
      const p = item as Record<string, unknown>, date = str(p?.date, 10), number = typeof p?.value === "number" ? p.value : Number(p?.value);
      const source = p?.source as Record<string, unknown> | undefined, title = str(source?.title, 300);
      if (!date || !/^\d{4}-\d{2}(-\d{2})?$/.test(date) || !Number.isFinite(number) || !title) return [];
      const range = Array.isArray(p.range) && p.range.length === 2 && p.range.every(entry => typeof entry === "number" && Number.isFinite(entry)) ? [p.range[0], p.range[1]] as [number, number] : undefined;
      const period = p.period === "month" || p.period === "quarter" || p.period === "year" ? p.period as PricePoint["period"] : undefined;
      return [{ date, value: number, range, period, source: { title, org: str(source?.org, 160), url: url(source?.url) }, itemId: str(p.itemId, 120), status: (STATUSES.has(String(p.status)) ? p.status : "reported") as PriceStatus, note: str(p.note, 300) }];
    }).sort((a, b) => a.date.localeCompare(b.date));
    if (!points.length) return [];
    seen.add(id);
    return [{ id, product: product as PriceProduct, name, grade: str(s.grade, 160), country: str(s.country, 4)?.toUpperCase(), market: str(s.market, 160), unit, points }];
  });
  return series.length ? { generatedAt: str(raw.generatedAt, 40) ?? new Date().toISOString(), series } : null;
}

/** The latest point, the one before it and the move between them (absolute and percent). */
export function priceMove(series: PriceSeries) {
  const last = series.points[series.points.length - 1], previous = series.points.length > 1 ? series.points[series.points.length - 2] : undefined;
  const change = previous ? last.value - previous.value : undefined, percent = previous && previous.value ? (change! / previous.value) * 100 : undefined;
  const direction: "up" | "down" | "flat" | "new" = change === undefined ? "new" : Math.abs(percent ?? 0) < 0.05 ? "flat" : change > 0 ? "up" : "down";
  return { last, previous, change, percent, direction };
}
