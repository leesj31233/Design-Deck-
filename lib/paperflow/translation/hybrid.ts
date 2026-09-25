const engineeringTerms = ["biomass co-firing", "coal co-firing", "co-firing", "torrefied biomass", "torrefaction", "heat flux", "heat transfer", "boiler efficiency", "combustion efficiency", "fluidized bed", "pulverized coal", "fly ash", "bottom ash", "carbon capture", "greenhouse gas", "NOx", "SOx", "CO2", "CO₂", "GHG", "EFB", "POME", "DPM", "CFD", "ANSYS", "realizable k-ε", "k-ε", "LNG"];
const encoder = new TextEncoder();
const memory = new Map<string, { text: string; provider: "device" | "MyMemory" }>();

export function protectTerms(source: string, customTerms: string[] = []) {
  const terms = [...new Set([...customTerms, ...engineeringTerms])].filter(Boolean).sort((a, b) => b.length - a.length);
  const captured: string[] = [];
  const capture = (match: string) => { const id = captured.length; captured.push(match); return `ZZZTERM${id}ZZZ`; };
  const termsPattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const acronymAndUnitPattern = /(?<![\p{L}\p{N}])(?:(?!ZZZTERM\d+ZZZ\b)[A-Z]{2,}[0-9]*|\d+(?:\.\d+)?\s?(?:°C|K|MPa|kPa|MW|kW|mg|kg|wt%|%))(?![\p{L}\p{N}])/gu;
  const protectedText = source.replace(termsPattern, capture).replace(acronymAndUnitPattern, capture);
  return { protectedText, terms: captured, restore: (translated: string) => translated.replace(/ZZZTERM\s*(\d+)\s*ZZZ/gi, (token, number: string) => captured[Number(number)] ?? token) };
}
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function chunks(text: string, maxBytes = 450): string[] {
  const pieces = text.match(/[^.!?]+[.!?]*\s*|\S+/g) ?? [text];
  const result: string[] = []; let current = "";
  for (const piece of pieces) {
    if (encoder.encode(current + piece).length > maxBytes && current) { result.push(current.trim()); current = ""; }
    if (encoder.encode(piece).length <= maxBytes) current += piece;
    else { for (const word of piece.split(/(\s+)/)) { if (encoder.encode(current + word).length > maxBytes && current) { result.push(current.trim()); current = ""; } current += word; } }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

type BrowserTranslator = { translate: (text: string) => Promise<string> };
type TranslatorConstructor = { availability: (options: { sourceLanguage: string; targetLanguage: string }) => Promise<string>; create: (options: { sourceLanguage: string; targetLanguage: string }) => Promise<BrowserTranslator> };
let localTranslator: Promise<BrowserTranslator | null> | undefined;
async function readyLocalTranslator() {
  localTranslator ??= (async () => {
    const api = (globalThis as typeof globalThis & { Translator?: TranslatorConstructor }).Translator;
    if (!api) return null;
    const availability = await Promise.race([api.availability({ sourceLanguage: "en", targetLanguage: "ko" }), new Promise<string>(resolve => setTimeout(() => resolve("timeout"), 400))]);
    if (availability !== "available") return null;
    return Promise.race([api.create({ sourceLanguage: "en", targetLanguage: "ko" }), new Promise<null>(resolve => setTimeout(() => resolve(null), 400))]);
  })().catch(() => null);
  return localTranslator;
}

export async function translateHybrid(source: string, signal?: AbortSignal): Promise<{ text: string; provider: "device" | "MyMemory"; cached: boolean }> {
  const clean = source.replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("번역할 문단을 찾지 못했습니다.");
  const cached = memory.get(clean);
  if (cached) return { ...cached, cached: true };
  const { protectedText, restore } = protectTerms(clean);
  const parts = chunks(protectedText);
  const native = await readyLocalTranslator();
  let provider: "device" | "MyMemory" = native ? "device" : "MyMemory";
  const translated = await Promise.all(parts.map(async part => {
    if (native) try { return await native.translate(part); } catch { provider = "MyMemory"; }
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", part); url.searchParams.set("langpair", "en|ko");
    const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(9000)]) : AbortSignal.timeout(9000) });
    if (!response.ok) throw new Error(`번역 서비스 응답 오류 (${response.status})`);
    const body = await response.json() as { responseStatus?: number; responseData?: { translatedText?: string } };
    if (body.responseStatus !== 200 || !body.responseData?.translatedText) throw new Error("번역 결과를 받지 못했습니다.");
    return body.responseData.translatedText;
  }));
  const text = restore(translated.join(" "));
  if (text.includes("ZZZTERM") || (/[A-Za-z]{12}/.test(clean) && !/[가-힣]/.test(text))) throw new Error("번역 품질을 확인할 수 없습니다. 다시 시도해 주세요.");
  if (memory.size >= 300) memory.delete(memory.keys().next().value!);
  memory.set(clean, { text, provider });
  return { text, provider, cached: false };
}
