/**
 * Where a guide quote sits in a page's text layer (PDF.js text, whitespace collapsed). Matching
 * ignores case, spaces, hyphens (line-break hyphenation) and ligatures, so the quote the model
 * copied from the paragraph text still finds the printed glyphs. When an inline citation or a
 * footnote marker breaks the exact match, the quote's head and tail are matched on their own.
 */
const SKIP = /[\s­\-‐-―]/u;
function compact(text: string) {
  let chars = "";
  const map: number[] = [];
  for (let index = 0; index < text.length; index++) {
    for (const char of text[index].normalize("NFKC").toLowerCase()) {
      if (SKIP.test(char)) continue;
      chars += char; map.push(index);
    }
  }
  return { chars, map };
}

export function locateQuote(text: string, quote: string): { start: number; length: number } | null {
  const page = compact(text), needle = compact(quote).chars;
  if (needle.length < 8) return null;
  const span = (from: number, to: number) => ({ start: page.map[from], length: page.map[to] - page.map[from] + 1 });
  const exact = page.chars.indexOf(needle);
  if (exact >= 0) return span(exact, exact + needle.length - 1);
  // Otherwise align the quote chunk by chunk: each chunk must follow the previous one closely, and
  // most chunks must be found (a marker inside a chunk only loses that chunk).
  const size = 12, chunks: { text: string; at: number }[] = [];
  for (let at = 0; at < needle.length; at += size) chunks.push({ text: needle.slice(at, at + size), at });
  if (chunks.length < 3) return null;
  for (const first of [0, 1]) {
    for (let from = page.chars.indexOf(chunks[first].text); from >= 0; from = page.chars.indexOf(chunks[first].text, from + 1)) {
      let cursor = from + chunks[first].text.length, end = cursor - 1, found = 1;
      for (const chunk of chunks.slice(first + 1)) {
        const at = page.chars.indexOf(chunk.text, cursor);
        if (at < 0 || at - cursor > 24) continue;
        found++; cursor = at + chunk.text.length; end = cursor - 1;
      }
      if (found < chunks.length * .7) continue;
      // Started on the second chunk: take back as much of the first as is printed just before it.
      let start = from;
      for (let length = first ? size - 1 : 0; length >= 5; length--) {
        const at = page.chars.lastIndexOf(chunks[0].text.slice(0, length), from - 1);
        if (at >= 0 && from - (at + length) <= 24) { start = at; break; }
      }
      if (end - start + 1 <= needle.length * 1.3 + 12) return span(start, end);
    }
  }
  return null;
}
