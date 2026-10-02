export type PassageRole = "body" | "heading" | "caption";
export interface TranslationPassage { id: string; text: string; role?: PassageRole }
export interface TranslationResult { id: string; text: string }
export interface TranslationBatchResult { results: TranslationResult[]; missing: string[] }

const PROSE_WORDS = /[A-Za-z]{3,}/g;
/** Prose must come back in Korean; a label or symbol-only passage may legitimately stay as it is. */
export function needsHangul(source: string) { return (source.match(PROSE_WORDS) ?? []).length >= 5; }

/**
 * Keep every valid item and report the rest. A model that drops one passage
 * must not throw away the other nine.
 */
export function partitionTranslationResults(passages: TranslationPassage[], value: unknown): TranslationBatchResult {
  const expected = new Map(passages.map(passage => [passage.id, passage]));
  if (expected.size !== passages.length) throw new Error("요청에 중복된 블록 ID가 있다.");
  const found = new Map<string, string>();
  for (const item of Array.isArray(value) ? value : []) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.text !== "string") continue;
    const passage = expected.get(item.id), text = item.text.trim();
    if (!passage || found.has(item.id) || !text) continue;
    // A heading made only of technical terms legitimately stays English ("2.2. Silicate melt-induced slagging").
    if (passage.role !== "heading" && needsHangul(passage.text) && !/[가-힣]/.test(text)) continue;
    // A truncated answer for a long paragraph is a failure, not a translation.
    if (passage.text.length > 240 && text.length < passage.text.length * .22) continue;
    found.set(item.id, text);
  }
  return { results: passages.filter(passage => found.has(passage.id)).map(passage => ({ id: passage.id, text: found.get(passage.id)! })), missing: passages.filter(passage => !found.has(passage.id)).map(passage => passage.id) };
}

/** Strict form kept for callers that need all-or-nothing. */
export function validateTranslationResults(passages: TranslationPassage[], value: unknown): TranslationResult[] {
  if (!Array.isArray(value) || value.length !== passages.length) throw new Error("번역 블록 수가 원문과 일치하지 않는다.");
  const ids = value.map(item => item?.id);
  if (new Set(ids).size !== ids.length) throw new Error(`중복된 번역 블록 ID: ${ids.find((id, index) => ids.indexOf(id) !== index)}`);
  const unknown = ids.find(id => !passages.some(passage => passage.id === id));
  if (unknown !== undefined) throw new Error(`알 수 없는 번역 블록 ID: ${unknown}`);
  const { results, missing } = partitionTranslationResults(passages, value);
  if (missing.length) throw new Error(`누락된 번역 블록 ID: ${missing[0]}`);
  return results;
}
