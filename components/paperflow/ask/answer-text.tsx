"use client";
import { Fragment } from "react";

/**
 * An answer as the reader sees it: short paragraphs and "- " lists, **bold**, [Q1] chips that go to the
 * evidence on the page, [S1] chips to outside sources, and "(일반 지식)" tags on background knowledge.
 * Plain text only; nothing from the model is ever rendered as HTML.
 */
export function AnswerText({ text, onQuote, onSource }: { text: string; onQuote?: (index: number) => void; onSource?: (index: number) => void }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*|\[Q\d\]|\[S\d\]|\(일반 지식\))/).map((part, index) => {
    if (!part) return null;
    const quote = /^\[Q(\d)\]$/.exec(part), source = /^\[S(\d)\]$/.exec(part);
    if (quote) return <button key={index} type="button" className="pf-ask-cite" onClick={() => onQuote?.(Number(quote[1]) - 1)}>Q{quote[1]}</button>;
    if (source) return <button key={index} type="button" className="pf-ask-cite" data-source="" onClick={() => onSource?.(Number(source[1]) - 1)}>S{source[1]}</button>;
    if (part === "(일반 지식)") return <span key={index} className="pf-ask-general" title="논문이 아닌 일반 지식에서 온 설명">일반 지식</span>;
    if (part.startsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return <Fragment key={index}>{part}</Fragment>;
  });
  // Lines into paragraphs and lists.
  const blocks: { list: boolean; lines: string[] }[] = [];
  // While streaming, a bold mark whose closing ** has not arrived yet is not shown raw.
  const open = (text.split("**").length - 1) % 2 === 1, last = text.lastIndexOf("**");
  const shown = open ? text.slice(0, last) + text.slice(last + 2) : text;
  for (const raw of shown.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const item = /^[-•·]\s+/.test(line);
    const last = blocks.at(-1);
    if (last && last.list === item && item) last.lines.push(line.replace(/^[-•·]\s+/, ""));
    else blocks.push({ list: item, lines: [item ? line.replace(/^[-•·]\s+/, "") : line] });
  }
  return <div className="pf-ask-text">{blocks.map((block, index) => block.list
    ? <ul key={index}>{block.lines.map((line, at) => <li key={at}>{inline(line)}</li>)}</ul>
    : <p key={index}>{inline(block.lines[0])}</p>)}</div>;
}
