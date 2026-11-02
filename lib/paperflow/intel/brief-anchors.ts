/**
 * Highlights on a briefing (HTML, not a PDF page): a marked passage is stored as its text plus a little
 * of what comes before and after, and found again by text when the briefing is shown — so a mark
 * survives a re-render, a narrower window, or a briefing updated around it.
 */
const CONTEXT = 32;

export interface TextSpot { node: Text; offset: number }

/** Every text node of the document, with where each starts in the document's whole text. */
export function textIndex(root: Element) {
  const nodes: { node: Text; start: number }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: node => (node.parentElement?.closest("[data-brief-skip]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  let text = "";
  while (walker.nextNode()) { const node = walker.currentNode as Text; nodes.push({ node, start: text.length }); text += node.data; }
  return { nodes, text };
}

export function offsetOf(index: ReturnType<typeof textIndex>, node: Node, offset: number): number | null {
  if (node.nodeType !== Node.TEXT_NODE) {
    // An element boundary: the text that starts at (or after) its child at `offset`.
    const child = node.childNodes[offset] ?? null;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let first: Text | null = null;
    if (child) { walker.currentNode = child; first = child.nodeType === Node.TEXT_NODE ? child as Text : walker.nextNode() as Text | null; }
    const entry = first ? index.nodes.find(item => item.node === first) : null;
    if (entry) return entry.start;
    const last = index.nodes.filter(item => node.contains(item.node)).pop();
    return last ? last.start + last.node.data.length : null;
  }
  const entry = index.nodes.find(item => item.node === node);
  return entry ? entry.start + offset : null;
}

export function spotAt(index: ReturnType<typeof textIndex>, at: number): TextSpot | null {
  for (const entry of index.nodes) if (at <= entry.start + entry.node.data.length) return { node: entry.node, offset: Math.max(0, at - entry.start) };
  const last = index.nodes.at(-1);
  return last ? { node: last.node, offset: last.node.data.length } : null;
}

/** What to store for a selection: the passage and its surroundings. */
export function quoteOf(index: ReturnType<typeof textIndex>, start: number, end: number) {
  return { textQuote: index.text.slice(start, end), prefix: index.text.slice(Math.max(0, start - CONTEXT), start), suffix: index.text.slice(end, end + CONTEXT) };
}

/** Where a stored passage is now: the occurrence whose surroundings match best. */
export function locate(text: string, quote: string, prefix = "", suffix = ""): [number, number] | null {
  if (!quote) return null;
  let best: [number, number] | null = null, bestScore = -1;
  for (let at = text.indexOf(quote); at >= 0; at = text.indexOf(quote, at + 1)) {
    let score = 0;
    for (let k = 1; k <= prefix.length && text[at - k] === prefix[prefix.length - k]; k++) score++;
    for (let k = 0; k < suffix.length && text[at + quote.length + k] === suffix[k]; k++) score++;
    if (score > bestScore) { bestScore = score; best = [at, at + quote.length]; }
  }
  return best;
}

export function rangeOf(index: ReturnType<typeof textIndex>, start: number, end: number) {
  const from = spotAt(index, start), to = spotAt(index, end);
  if (!from || !to) return null;
  const range = document.createRange();
  range.setStart(from.node, from.offset); range.setEnd(to.node, to.offset);
  return range;
}

/** The text position under a point (a click, a pencil tip), in the document's whole text. */
export function offsetAtPoint(index: ReturnType<typeof textIndex>, x: number, y: number): number | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  if (doc.caretPositionFromPoint) { const spot = doc.caretPositionFromPoint(x, y); return spot ? offsetOf(index, spot.offsetNode, spot.offset) : null; }
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? offsetOf(index, range.startContainer, range.startOffset) : null;
}
