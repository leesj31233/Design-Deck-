"use client";
import { cachedNow, cancelPending, translateOnDevice } from "./device-translate";

/**
 * The page's remaining Korean, shown in English on this device. Works on text nodes only, so Markdown structure,
 * links (intel: entity links, sources), citation chips, numbers set apart and every element stay as React drew
 * them; a node's text is replaced in place and put back when the reader returns to Korean. Lazy: a block is
 * translated when it comes near the screen (a hidden tooltip, when it is shown). Text React changes later is
 * translated again. Texts that already have English (the interface, the routine's `en`) have no Korean left.
 */
const HANGUL = /[가-힣]/;
const SKIP = "textarea, input, select, option, script, style, code, pre, kbd, [contenteditable], [translate='no'], [data-no-device-translation]";

export function startDomEnglish(root: HTMLElement = document.body) {
  const changed = new Map<Text, { korean: string; english: string }>();
  const observed = new WeakSet<Element>();
  let alive = true;

  const applyTo = (node: Text, english: string) => {
    const korean = node.nodeValue ?? "";
    const lead = korean.match(/^\s*/)![0], trail = korean.match(/\s*$/)![0], value = `${lead}${english}${trail}`;
    changed.set(node, { korean, english: value });
    node.nodeValue = value;
  };
  const translateNode = (node: Text) => {
    const text = node.nodeValue ?? "", core = text.trim();
    if (!core || !HANGUL.test(core) || changed.get(node)?.english === text) return;
    const ready = cachedNow(core);
    if (ready) { applyTo(node, ready); return; }
    void translateOnDevice(core).then(english => { if (alive && english && node.isConnected && node.nodeValue === text) applyTo(node, english); });
  };
  const translateElement = (element: Element) => { for (const child of element.childNodes) if (child.nodeType === Node.TEXT_NODE) translateNode(child as Text); };

  const near = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { near.unobserve(entry.target); observed.delete(entry.target); translateElement(entry.target); }
  }, { rootMargin: "800px 0px" });
  const watch = (element: Element | null) => { if (!element || observed.has(element) || element.closest(SKIP)) return; observed.add(element); near.observe(element); };
  const scan = (start: Node) => {
    if (start.nodeType === Node.TEXT_NODE) { if (HANGUL.test(start.nodeValue ?? "")) watch(start.parentElement); return; }
    if (!(start instanceof Element) || start.closest(SKIP)) return;
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, { acceptNode: node => HANGUL.test(node.nodeValue ?? "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) watch(node.parentElement);
  };
  const mutations = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "characterData") {
        const node = record.target as Text;
        if (changed.get(node)?.english === node.nodeValue) continue;
        changed.delete(node);
        if (HANGUL.test(node.nodeValue ?? "")) watch(node.parentElement);
      } else for (const added of record.addedNodes) scan(added);
    }
  });
  scan(root);
  mutations.observe(root, { subtree: true, childList: true, characterData: true });

  /** Stop, and put the Korean back where this changed it (and React has not changed it since). */
  return () => {
    alive = false; mutations.disconnect(); near.disconnect(); cancelPending();
    for (const [node, { korean, english }] of changed) if (node.isConnected && node.nodeValue === english) node.nodeValue = korean;
    changed.clear();
  };
}
