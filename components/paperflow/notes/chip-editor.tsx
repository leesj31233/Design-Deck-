"use client";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { activeMention, parseNoteBody } from "@/lib/paperflow/notes/notebook";

export interface ChipEditorHandle { focus: () => void; insert: (token: string) => void }

const TOKEN = /^\[\[([^\]|]+)\|(\/reader\/[^\]\s|]+)\]\]$/;

function chip(label: string, href: string) {
  const node = document.createElement("span");
  node.className = "pf-cite pf-cite-chip"; node.contentEditable = "false";
  node.dataset.label = label; node.dataset.href = href; node.textContent = label;
  return node;
}

/** The editor's content as a note body: text, line breaks and citation tokens. */
function serialize(root: HTMLElement) {
  let out = "";
  const walk = (node: Node, block: boolean) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) out += (child as Text).data.replace(/ /g, " ");
      else if (child instanceof HTMLElement && child.dataset.href) out += `[[${child.dataset.label}|${child.dataset.href}]]`;
      else if (child instanceof HTMLBRElement) out += "\n";
      else if (child instanceof HTMLElement) {
        // Enter in a contenteditable makes a <div> per line.
        const isBlock = /^(DIV|P)$/.test(child.tagName);
        if (isBlock && out && !out.endsWith("\n")) out += "\n";
        walk(child, isBlock);
      }
    }
    void block;
  };
  walk(root, false);
  return out.replace(/\n$/, "");
}

/**
 * The note body as you write it: text, with each citation shown as a chip (not as its raw token).
 * Typing "@" reports the query so the parent can offer papers, keywords and marked passages; choosing
 * one replaces "@query" with the chip.
 */
export const ChipEditor = forwardRef<ChipEditorHandle, { body: string; placeholder: string; label: string; onChange: (body: string) => void; onMention: (mention: { start: number; query: string } | null) => void; onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void; onBlur?: () => void }>(
  function ChipEditor({ body, placeholder, label, onChange, onMention, onKeyDown, onBlur }, handle) {
    const root = useRef<HTMLDivElement>(null);
    const pending = useRef<{ node: Text; start: number; end: number } | null>(null);
    // The content is built once per note (the parent keys this editor by note): typing never re-renders it.
    useLayoutEffect(() => {
      const element = root.current!;
      element.replaceChildren();
      for (const segment of parseNoteBody(body)) {
        if (segment.kind === "cite") element.append(chip(segment.label, segment.href));
        else segment.text.split("\n").forEach((line, index) => { if (index) element.append(document.createElement("br")); if (line) element.append(document.createTextNode(line)); });
      }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const track = () => {
      const selection = window.getSelection(), node = selection?.anchorNode;
      if (!selection?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !root.current?.contains(node)) { pending.current = null; onMention(null); return; }
      const text = (node as Text).data, caret = selection.anchorOffset, found = activeMention(text, caret);
      pending.current = found ? { node: node as Text, start: found.start, end: caret } : null;
      onMention(found);
    };
    const changed = () => { onChange(serialize(root.current!)); track(); };

    useImperativeHandle(handle, () => ({
      focus: () => { root.current?.focus(); const range = document.createRange(); range.selectNodeContents(root.current!); range.collapse(false); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range); },
      insert: token => {
        const match = TOKEN.exec(token), target = pending.current;
        if (!match || !root.current) return;
        const node = chip(match[1], match[2]), space = document.createTextNode(" ");
        if (target && target.node.isConnected) {
          const after = target.node.splitText(target.start);
          after.data = after.data.slice(target.end - target.start);
          after.before(node, space);
        } else root.current.append(node, space);
        const range = document.createRange(); range.setStart(space, 1); range.collapse(true);
        window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
        root.current.focus();
        pending.current = null; onMention(null);
        onChange(serialize(root.current));
      }
    }));

    return <div ref={root} className="pf-chip-editor" role="textbox" aria-multiline="true" aria-label={label} data-placeholder={placeholder} contentEditable suppressContentEditableWarning
      onInput={changed} onKeyUp={event => { if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) track(); }} onBlur={onBlur}
      onClick={event => { const cited = (event.target as HTMLElement).closest<HTMLElement>(".pf-cite-chip"); if (cited?.dataset.href) { window.location.assign(cited.dataset.href); return; } track(); }}
      onKeyDown={onKeyDown}
      onPaste={event => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); }}/>;
  });
