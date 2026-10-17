import { normalizeQuote } from "./create-anchor";
import { validRect } from "./geometry";
import type { AnchorRecoveryResult, Rect, TextAnchor } from "./types";
export type RecoveryPage = { documentId: string; pageIndex: number; text: string; rectsFor: (start: number, length: number) => Rect[] };
function matches(text: string, quote: string) {
  const positions: number[] = []; let cursor = 0;
  while (quote && cursor < text.length) { const index = text.indexOf(quote, cursor); if (index < 0) break; positions.push(index); cursor = index + 1; }
  return positions;
}
export function recoverByQuote(text: string, quote: string): number | null {
  const positions = matches(normalizeQuote(text), normalizeQuote(quote)); return positions.length === 1 ? positions[0] : null;
}
export function recoverByContext(text: string, quote: string, prefix = "", suffix = ""): number | null {
  const p = normalizeQuote(prefix), s = normalizeQuote(suffix), q = normalizeQuote(quote), t = normalizeQuote(text);
  if (!p && !s) return null;
  const positions = matches(t, q).filter(i => (!p || t.slice(0, i).trimEnd().endsWith(p)) && (!s || t.slice(i + q.length).trimStart().startsWith(s)));
  return positions.length === 1 ? positions[0] : null;
}
function similarity(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const row = [i]; for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = row; }
  return 1 - previous[b.length] / Math.max(a.length, b.length, 1);
}
export const FUZZY_THRESHOLD = 0.94;
export function recoverAnchor(anchor: TextAnchor, page: RecoveryPage): AnchorRecoveryResult {
  const unresolved = (reason: string): AnchorRecoveryResult => ({ status: "unresolved", reason });
  if (anchor.documentId !== page.documentId || anchor.pageIndex !== page.pageIndex || anchor.version !== 1) return unresolved("원문 문서 또는 페이지가 일치하지 않습니다.");
  if (!normalizeQuote(anchor.textQuote)) return unresolved("저장된 인용문이 비어 있습니다.");
  if (anchor.normalizedRects?.length && anchor.normalizedRects.every(r => validRect(r))) return { status: "resolved", method: "geometry", confidence: 1, rects: anchor.normalizedRects };
  const text = normalizeQuote(page.text), quote = normalizeQuote(anchor.textQuote);
  const result = (start: number, length: number, method: "quote" | "context" | "fuzzy", confidence: number): AnchorRecoveryResult => {
    const rects = page.rectsFor(start, length);
    return rects.length && rects.every(r => validRect(r)) ? { status: "resolved", method, confidence, rects } : unresolved("원문의 선택 좌표를 복원하지 못했습니다.");
  };
  const exact = recoverByQuote(text, quote); if (exact !== null) return result(exact, quote.length, "quote", 1);
  const contextual = recoverByContext(text, quote, anchor.prefix, anchor.suffix); if (contextual !== null) return result(contextual, quote.length, "context", 1);
  if (matches(text, quote).length > 1) return unresolved("동일한 문장이 여러 곳에 있습니다. 원문 위치를 확인해 주세요.");
  // Conservative, bounded fuzzy fallback: same page, uniquely matching nearby
  // context, long quote, and a high edit similarity. Ambiguity stays unresolved.
  const prefix = normalizeQuote(anchor.prefix ?? ""), suffix = normalizeQuote(anchor.suffix ?? "");
  if (quote.length < 24 || quote.length > 600 || prefix.length < 8 || suffix.length < 8) return unresolved("충분한 원문 문맥이 없어 위치를 확정할 수 없습니다.");
  const candidates: { start: number; length: number; score: number }[] = [];
  for (const p of matches(text, prefix).slice(0, 30)) {
    let start = p + prefix.length; if (text[start] === " ") start++;
    const end = text.indexOf(suffix, start);
    if (end < 0 || Math.abs(end - start - quote.length) > 32) continue;
    const candidate = text.slice(start, end).trimEnd(), score = similarity(quote, candidate);
    if (score >= FUZZY_THRESHOLD) candidates.push({ start, length: candidate.length, score });
  }
  if (candidates.length === 1) return result(candidates[0].start, candidates[0].length, "fuzzy", candidates[0].score);
  return unresolved("원문 위치가 불확실합니다. 하이라이트를 임의로 이동하지 않았습니다.");
}
