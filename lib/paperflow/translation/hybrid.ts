import { researchTerms, declarativeKorean } from "./research-style";
import { researchRequest } from "./research-api";
const engineeringTerms = ["biomass co-firing", "coal co-firing", "co-firing", "torrefied biomass", "torrefaction", "heat flux", "heat transfer", "boiler efficiency", "combustion efficiency", "fluidized bed", "pulverized coal", "fly ash", "bottom ash", "carbon capture", "greenhouse gas", "NOx", "SOx", "CO2", "CO₂", "GHG", "EFB", "POME", "DPM", "CFD", "ANSYS", "realizable k-ε", "k-ε", "LNG"];
const encoder = new TextEncoder();
const memory = new Map<string, { text: string; provider: "device" | "MyMemory" | "OpenAI" }>();

export function protectTerms(source: string, customTerms: string[] = []) {
  const terms = [...new Set([...customTerms, ...researchTerms, ...engineeringTerms])].filter(Boolean).sort((a, b) => b.length - a.length);
  const captured: string[] = [];
  const capture = (match: string) => { const id = captured.length; captured.push(match); return `ZZZTERM${id}ZZZ`; };
  const termsPattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const acronymAndUnitPattern = /(?<![\p{L}\p{N}])(?:(?!ZZZTERM\d+ZZZ\b)[A-Z]{2,}[0-9]*|\d+(?:\.\d+)?\s?(?:°C|K|MPa|kPa|MW|kW|mg|kg|wt%|%))(?![\p{L}\p{N}])/gu;
  const sectionNames = new Set(["ABSTRACT", "INTRODUCTION", "CONCLUSIONS", "CONCLUSION", "METHODS", "RESULTS", "DISCUSSION", "REFERENCES"]);
  const protectedText = source.replace(/\b(?:Figure|Fig\.|Table|Equation|Eq\.)\s*\d+[a-z]?/g, capture).replace(/\b(?:[A-Z][a-z]+[ -]){1,4}[A-Z][a-z]+\b/g, capture).replace(termsPattern, capture).replace(acronymAndUnitPattern, match => sectionNames.has(match) ? match : capture(match));
  return { protectedText, terms: captured, restore: (translated: string) => translated.replace(/Z{2,}\s*TERM\s*(\d+)\s*Z{2,}/gi, (token, number: string) => captured[Number(number)] ?? token) };
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

export async function translateHybrid(source: string, signal?: AbortSignal): Promise<{ text: string; provider: "device" | "MyMemory" | "OpenAI"; cached: boolean }> {
  const clean = source.replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("번역할 문단을 찾지 못했습니다.");
  const cached = memory.get(clean);
  if (cached) return { ...cached, cached: true };
  const ai = await researchRequest("translate", clean, "", signal);
  if (ai) { const result = { text: declarativeKorean(ai.text), provider: ai.provider }; memory.set(clean, result); return { ...result, cached: false }; }
  if (typeof location !== "undefined" && !["localhost", "127.0.0.1"].includes(location.hostname)) {
    throw new Error("OpenAI 서버 연결이 필요하다. 연구 공간 접근 코드를 설정하거나 서버 배포 상태를 확인해 달라.");
  }
  // Public translators routinely mutate sentinel tokens into prose. Send the
  // actual passage and reject damaged output instead of painting it over a PDF.
  const parts = chunks(clean);
  const native = await readyLocalTranslator();
  let provider: "device" | "MyMemory" | "OpenAI" = native ? "device" : "MyMemory";
  const translated = await Promise.all(parts.map(async part => {
    if (native) try { return await native.translate(part); } catch { provider = "MyMemory"; }
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", part); url.searchParams.set("langpair", "en|ko");
    const response = await limitedFetch(url, signal);
    if (!response.ok) throw new Error(`번역 서비스 응답 오류 (${response.status})`);
    const body = await response.json() as { responseStatus?: number; responseData?: { translatedText?: string } };
    if (body.responseStatus !== 200 || !body.responseData?.translatedText) throw new Error("번역 결과를 받지 못했습니다.");
    return body.responseData.translatedText;
  }));
  const text = declarativeKorean(translated.join(" "));
  if (/Z{2,}|\bTERM\d+\b|(?:[A-Z]{4,}){2,}/i.test(text) || (/[A-Za-z]{12}/.test(clean) && !/[가-힣]/.test(text))) throw new Error("번역 품질을 확인할 수 없습니다. 다시 시도해 주세요.");
  if (memory.size >= 300) memory.delete(memory.keys().next().value!);
  memory.set(clean, { text, provider });
  return { text, provider, cached: false };
}

let gate = Promise.resolve();
let blockedUntil = 0;
async function limitedFetch(url: URL, signal?: AbortSignal): Promise<Response> {
  let release!: () => void;
  const previous = gate; gate = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    signal?.throwIfAborted();
    if (Date.now() < blockedUntil) throw new Error("번역 서비스의 요청 한도에 도달했다. " + Math.ceil((blockedUntil - Date.now()) / 1000) + "초 후 재시도하거나 OpenAI를 연결해야 한다. 저장된 번역은 유지된다.");
    const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
    if (response.status === 429) {
      const retry = response.headers.get("retry-after");
      const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.max(30, (Date.parse(retry) - Date.now()) / 1000) : 60;
      blockedUntil = Date.now() + Math.min(86400, Number.isFinite(seconds) ? seconds : 60) * 1000;
      throw new Error("번역 서비스의 요청 한도에 도달했다. 페이지 오류가 아니다. 잠시 후 재시도하거나 OpenAI를 연결해야 한다.");
    }
    return response;
  } finally { release(); }
}
