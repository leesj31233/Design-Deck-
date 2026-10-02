export interface TranslationPassage { id: string; text: string }
export interface TranslationResult { id: string; text: string }

/** The model may reorder results, but cannot silently omit, duplicate, or invent blocks. */
export function validateTranslationResults(passages: TranslationPassage[], value: unknown): TranslationResult[] {
  if (!Array.isArray(value) || value.length !== passages.length) throw new Error("번역 블록 수가 원문과 일치하지 않는다.");
  const expected = new Set(passages.map(passage => passage.id));
  if (expected.size !== passages.length) throw new Error("요청에 중복된 블록 ID가 있다.");
  const found = new Map<string, string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.text !== "string" || !item.text.trim() || !/[가-힣]/.test(item.text)) throw new Error("번역 결과 형식이 올바르지 않다.");
    if (!expected.has(item.id)) throw new Error(`알 수 없는 번역 블록 ID: ${item.id}`);
    if (found.has(item.id)) throw new Error(`중복된 번역 블록 ID: ${item.id}`);
    found.set(item.id, item.text.trim());
  }
  return passages.map(passage => {
    const text = found.get(passage.id);
    if (!text) throw new Error(`누락된 번역 블록 ID: ${passage.id}`);
    return { id: passage.id, text };
  });
}
