/** Library badge for papers that already have an AI reading guide (the current guide format only). */
export const GUIDE_BADGE_VERSION = "paperflow-guide-v4";
const PAPER_TYPE: Record<string, string> = { experimental: "실험", computational: "계산", theoretical: "이론", review: "리뷰" };

/** "AI 가이드", or "AI 가이드 · 실험" when the guide knows the paper type; null without a current guide. */
export function guideBadge(guide: unknown): string | null {
  if (!guide || typeof guide !== "object" || (guide as { version?: unknown }).version !== GUIDE_BADGE_VERSION) return null;
  const type = PAPER_TYPE[String((guide as { paperType?: unknown }).paperType)];
  return type ? `AI 가이드 · ${type}` : "AI 가이드";
}

/** The "가이드 있는 논문만" toggle, remembered per browser (storage may be blocked). */
const KEY = "pf-library-guide-only";
export function readGuideOnly() { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } }
export function writeGuideOnly(on: boolean) { try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* Not remembered: still applies now. */ } }
