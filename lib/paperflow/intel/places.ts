/**
 * The map's base layers: every palm oil mill in Indonesia (Trase mill list, capacity in t FFB/hour) and the
 * coal power plants with their co-firing status (WRI Global Power Plant Database). Travels as a hidden
 * briefing ("__places__") like the registry and the price board.
 */
export interface Mill { id: string; name: string; company?: string; group?: string; province?: string; regency?: string; lat: number; lng: number; capacity?: number }
export interface PowerPlant { id: string; name: string; owner?: string; island?: string; lat: number; lng: number; capacityMw?: number; cofiring?: string }
export interface BasePlaces { generatedAt: string; sources: Record<string, { title: string; url?: string }>; mills: Mill[]; plants: PowerPlant[] }
export const PLACES_BRIEF = "__places__";

const str = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const spot = (lat: unknown, lng: unknown) => { const a = num(lat), b = num(lng); return a !== undefined && b !== undefined && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? [a, b] as const : null; };

export function cleanPlaces(value: unknown): BasePlaces | null {
  const raw = value as { mills?: unknown; plants?: unknown; sources?: unknown; generatedAt?: unknown } | null;
  if (!raw || (!Array.isArray(raw.mills) && !Array.isArray(raw.plants))) return null;
  const mills = (Array.isArray(raw.mills) ? raw.mills : []).slice(0, 5000).flatMap(entry => {
    const m = entry as Record<string, unknown>, at = spot(m?.lat, m?.lng), name = str(m?.name, 120);
    return at && name ? [{ id: str(m.id, 80) ?? `${at[0]},${at[1]}`, name, company: str(m.company, 120), group: str(m.group, 120), province: str(m.province, 80), regency: str(m.regency, 80), lat: at[0], lng: at[1], capacity: num(m.capacity) }] : [];
  });
  const plants = (Array.isArray(raw.plants) ? raw.plants : []).slice(0, 2000).flatMap(entry => {
    const p = entry as Record<string, unknown>, at = spot(p?.lat, p?.lng), name = str(p?.name, 160);
    return at && name ? [{ id: str(p.id, 80) ?? name, name, owner: str(p.owner, 160), island: str(p.island, 60), lat: at[0], lng: at[1], capacityMw: num(p.capacityMw), cofiring: str(p.cofiring, 30) }] : [];
  });
  const sources = raw.sources && typeof raw.sources === "object" ? Object.fromEntries(Object.entries(raw.sources as Record<string, { title?: unknown; url?: unknown }>).flatMap(([key, source]) => str(source?.title, 200) ? [[key, { title: str(source.title, 200)!, url: str(source.url, 300) }]] : [])) : {};
  return mills.length || plants.length ? { generatedAt: str(raw.generatedAt, 40) ?? new Date().toISOString(), sources, mills, plants } : null;
}
