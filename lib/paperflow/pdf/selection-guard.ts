/**
 * Smooth text selection on a PDF page. Between the glyphs of a text layer there is only empty space,
 * and a browser drag over empty space snaps the selection end to the start or end of the whole layer
 * (or of the next page), so a drag "selects everything". As pdf.js' own viewer does, a transparent
 * catcher covers the layer while the pointer is down and is kept right after the text the selection
 * currently ends in: empty space then resolves to that point and the selection grows glyph by glyph.
 * A drag that starts on the Korean text stays on the Korean text, and one on the source stays there.
 */
const ROOTS = ".textLayer, .pf-tx-layer";
const ends = new WeakMap<HTMLElement, HTMLElement>();
let installed = false, active: HTMLElement | null = null, previous: Range | null = null, down = false;

function endFor(root: HTMLElement) {
  let end = ends.get(root);
  if (!end) { end = document.createElement("div"); end.className = "pf-sel-end"; end.setAttribute("aria-hidden", "true"); ends.set(root, end); }
  return end;
}

function release() {
  if (!active) return;
  const end = ends.get(active);
  // Park the catcher at the end of its layer (pdf.js does the same) so the finished selection keeps its ends.
  if (end?.isConnected) { if (active.classList.contains("textLayer")) active.append(end); else end.remove(); }
  active.classList.remove("pf-selecting");
  delete document.documentElement.dataset.pfSelecting;
  active.closest<HTMLElement>(".pf-pdf-page")?.removeAttribute("data-selecting");
  active = null; previous = null;
}

export function installSelectionGuard() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("pointerdown", event => {
    release();
    if (event.button !== 0 || event.pointerType === "touch") return;
    const root = event.target instanceof Element ? event.target.closest<HTMLElement>(ROOTS) : null;
    if (!root) return;
    down = true; active = root;
    const end = endFor(root);
    end.style.width = `${root.offsetWidth}px`; end.style.height = `${root.offsetHeight}px`;
    root.classList.add("pf-selecting");
    // While the drag lasts, nothing floats over the text (the selection bar would catch the pointer).
    document.documentElement.dataset.pfSelecting = "true";
    root.closest<HTMLElement>(".pf-pdf-page")?.setAttribute("data-selecting", root.classList.contains("textLayer") ? "source" : "translation");
    if (!end.isConnected) root.append(end);
  }, true);
  document.addEventListener("pointerup", () => { down = false; release(); }, true);
  document.addEventListener("pointercancel", () => { down = false; release(); }, true);
  window.addEventListener("blur", () => { down = false; release(); });
  document.addEventListener("selectionchange", () => {
    if (!active || !down) return;
    const selection = document.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0), end = ends.get(active)!;
    // The press itself (a caret, nothing selected yet) moves nothing: the browser is still starting its drag.
    if (range.collapsed) { previous = range.cloneRange(); return; }
    // Which end moves: the one that differs from the last range (dragging up moves the start).
    const movesStart = !!previous && (range.compareBoundaryPoints(Range.END_TO_END, previous) === 0 || range.compareBoundaryPoints(Range.START_TO_END, previous) === 0);
    let anchor: Node | null = movesStart ? range.startContainer : range.endContainer;
    if (anchor?.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
    if (!movesStart && range.endOffset === 0 && anchor && active.classList.contains("textLayer")) {
      // The selection ends at the very start of a node: the text it really ends in is the one before.
      for (let guard = 0; anchor && guard < 50; guard++) {
        while (anchor && !anchor.previousSibling && anchor !== active) anchor = anchor.parentNode;
        if (!anchor || anchor === active) break;
        anchor = anchor.previousSibling;
        if (anchor && anchor.childNodes.length) break;
      }
    }
    previous = range.cloneRange();
    // In the Korean layer the text sits in runs inside a line: the catcher goes beside the line, never
    // inside it (inside, it would be positioned against the line and cover the text it should follow).
    if (anchor instanceof HTMLElement && !active.classList.contains("textLayer")) anchor = anchor.closest<HTMLElement>(".pf-tx-line") ?? anchor;
    if (!(anchor instanceof HTMLElement) || anchor === end || anchor === active || !active.contains(anchor) || !anchor.parentElement) return;
    anchor.parentElement.insertBefore(end, movesStart ? anchor : anchor.nextSibling);
  });
}

/** Screen boxes of the text a range really covers: element boxes (a whole span, the catcher) are left out. */
export function textRectsOf(range: Range): DOMRect[] {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) return Array.from(range.getClientRects());
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), rects: DOMRect[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.data.trim() || !range.intersectsNode(node)) continue;
    const part = document.createRange();
    part.selectNodeContents(node);
    if (node === range.startContainer) part.setStart(node, range.startOffset);
    if (node === range.endContainer) part.setEnd(node, range.endOffset);
    if (!part.collapsed) rects.push(...Array.from(part.getClientRects()));
  }
  return rects;
}
