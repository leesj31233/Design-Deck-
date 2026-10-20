import { READABLE_GUIDE_VERSIONS } from "../guide/guide";

/** Library badge for papers that already have an AI reading guide the reader can show. */
const PAPER_TYPE: Record<string, string> = { experimental: "실험", computational: "계산", theoretical: "이론", review: "리뷰" };

/** "AI 가이드", or "AI 가이드 · 실험" when the guide knows the paper type; null without a current guide. */
export function guideBadge(guide: unknown): string | null {
  if (!guide || typeof guide !== "object" || !READABLE_GUIDE_VERSIONS.includes(String((guide as { version?: unknown }).version))) return null;
  const type = PAPER_TYPE[String((guide as { paperType?: unknown }).paperType)];
  return type ? `AI 가이드 · ${type}` : "AI 가이드";
}

/** The "가이드 있는 논문만" toggle, remembered per browser (storage may be blocked). */
const KEY = "pf-library-guide-only";
export function readGuideOnly() { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } }
export function writeGuideOnly(on: boolean) { try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* Not remembered: still applies now. */ } }
