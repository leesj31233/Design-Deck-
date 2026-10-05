/** Bump when the prompt or the unit model changes; older translations stay on disk but are not shown. */
export const TRANSLATION_PROMPT_VERSION = "paperflow-ko-v5";

/** Shared-cache key of one source paragraph: the same text under the same prompt is translated once. */
export async function sourceHash(text: string, version = TRANSLATION_PROMPT_VERSION) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${version}\n${text.replace(/\s+/g, " ").trim()}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Table cells are written in a terse table style (since cell-3): they do not share entries with prose. */
export const CELL_PROMPT_VERSION = `${TRANSLATION_PROMPT_VERSION}-cell3`;
export const passageHash = (text: string, cell: boolean) => sourceHash(text, cell ? CELL_PROMPT_VERSION : TRANSLATION_PROMPT_VERSION);
