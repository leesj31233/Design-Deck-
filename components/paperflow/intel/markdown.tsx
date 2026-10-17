import { Fragment, type ReactNode } from "react";
import { Globe } from "lucide-react";

/** Renders an entity link (`[label](intel:item-id)`): the Intelligence tab turns it into a preview and the side panel. */
export type EntityRenderer = (id: string, label: string, key: number) => ReactNode;

/** Inline Markdown: **bold**, *italic*, `code`, [links](https://…) (web links only) and entity links, as React nodes (never HTML). */
/** Glossary terms in plain text: the first time a term appears in a document it gets its explanation. */
export interface TermMarker { pattern: RegExp | null; render: (key: string, label: string, nodeKey: string) => ReactNode; seen: Set<string> }

function plain(text: string, terms?: TermMarker, at = 0): ReactNode[] {
  if (!terms?.pattern) return [text];
  const out: ReactNode[] = [], pattern = new RegExp(terms.pattern.source, terms.pattern.flags);
  let last = 0, match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (terms.seen.has(match[1])) continue;
    terms.seen.add(match[1]);
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(terms.render(match[1], match[1], `t${at}-${match.index}`));
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A citation: `[1]`, `[2, 3]` (a case file's numbered sources) or `[^label](https://…)` (a web source in a briefing). */
export type CiteRenderer = (refs: string[], key: number) => ReactNode;
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

/** A web source as a small chip: its site's name, the page on hover, opens in a new tab. */
export function WebCite({ url, label }: { url: string; label?: string }) {
  return <a className="pf-cite" href={url} target="_blank" rel="noreferrer noopener" title={url}><Globe size={11} aria-hidden="true"/>{label || host(url)}</a>;
}

function inline(text: string, entity?: EntityRenderer, terms?: TermMarker, cite?: CiteRenderer): ReactNode[] {
  const out: ReactNode[] = [], pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\[([^\]]+)\]\(intel:([\w.:-]+)\)|\*([^*\s][^*]*)\*|\[(\d+(?:\s*[,–-]\s*\d+)*)\](?!\()/g;
  let last = 0, match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match[8] && !cite) continue;
    if (match.index > last) out.push(...plain(text.slice(last, match.index), terms, last));
    if (match[1]) out.push(<strong key={match.index}>{inline(match[1], entity, terms, cite)}</strong>);
    else if (match[2]) out.push(<code key={match.index}>{match[2]}</code>);
    else if (match[3]?.startsWith("^")) out.push(<WebCite key={match.index} url={match[4]} label={match[3].slice(1).trim()}/>);
    else if (match[3]) out.push(<a key={match.index} href={match[4]} target="_blank" rel="noreferrer noopener">{match[3]}</a>);
    else if (match[5]) out.push(entity ? entity(match[6], match[5], match.index) : match[5]);
    else if (match[8]) out.push(cite!(refsOf(match[8]), match.index));
    else out.push(<em key={match.index}>{match[7]}</em>);
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(...plain(text.slice(last), terms, last));
  return out;
}

/** "2, 3" → ["2","3"]; "4–6" → ["4","5","6"]. */
export function refsOf(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/\s*,\s*/)) {
    const range = /^(\d+)\s*[–-]\s*(\d+)$/.exec(part);
    if (range && Number(range[2]) >= Number(range[1]) && Number(range[2]) - Number(range[1]) < 12) for (let n = Number(range[1]); n <= Number(range[2]); n++) out.push(String(n));
    else if (part) out.push(part);
  }
  return out;
}

/**
 * A briefing written in Markdown (headings, paragraphs, lists with one level of nesting, tables,
 * quotes), rendered as React elements. Briefings come in packs, so nothing is ever injected as HTML.
 */
export function Markdown({ source, entity, terms, figure, cite }: { source: string; entity?: EntityRenderer; terms?: Omit<TermMarker, "seen">; cite?: CiteRenderer;
  /** A figure line, `![caption](intel:item-id#n)`: the item's n-th case-file figure (or its cover), rendered by the host. */
  figure?: (id: string, index: number, caption: string, key: number) => ReactNode }) {
  const marker = terms ? { ...terms, seen: new Set<string>() } : undefined;
  const line = (text: string) => inline(text, entity, marker, cite);
  const lines = source.replace(/\r\n/g, "\n").split("\n"), blocks: ReactNode[] = [];
  for (let at = 0; at < lines.length;) {
    const current = lines[at];
    if (!current.trim()) { at++; continue; }
    const picture = /^!\[([^\]]*)\]\(intel:([\w.:-]+)(?:#(\d+))?\)\s*$/.exec(current.trim());
    if (picture && figure) { blocks.push(figure(picture[2], Number(picture[3] ?? 1), picture[1], at)); at++; continue; }
    const heading = /^(#{1,4})\s+(.*)$/.exec(current);
    if (heading) { const level = Math.min(4, Math.max(2, heading[1].length)); const Tag = `h${level}` as "h2"; blocks.push(<Tag key={at}>{line(heading[2])}</Tag>); at++; continue; }
    if (/^\s*\|/.test(current)) {
      const rows: string[][] = [];
      while (at < lines.length && /^\s*\|/.test(lines[at])) { const cells = lines[at].trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim()); if (!cells.every(cell => /^:?-{2,}:?$/.test(cell))) rows.push(cells); at++; }
      const [head, ...body] = rows;
      blocks.push(<div key={at} className="pf-md-table"><table><thead><tr>{head.map((cell, index) => <th key={index}>{line(cell)}</th>)}</tr></thead><tbody>{body.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{line(cell)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(current)) {
      // One level of nesting: an indented item belongs to the item above it.
      const ordered = /^\s*\d+\./.test(current), items: { text: string; children: string[] }[] = [];
      while (at < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[at])) {
        const text = lines[at].replace(/^\s*([-*]|\d+\.)\s+/, "");
        if (/^\s{2,}/.test(lines[at]) && items.length) items[items.length - 1].children.push(text); else items.push({ text, children: [] });
        at++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={at}>{items.map((item, index) => <li key={index}>{line(item.text)}{item.children.length > 0 && <ul>{item.children.map((child, inner) => <li key={inner}>{line(child)}</li>)}</ul>}</li>)}</List>);
      continue;
    }
    if (/^>\s?/.test(current)) {
      const quote: string[] = [];
      while (at < lines.length && /^>\s?/.test(lines[at])) { quote.push(lines[at].replace(/^>\s?/, "")); at++; }
      blocks.push(<blockquote key={at}>{line(quote.join(" "))}</blockquote>);
      continue;
    }
    const paragraph: string[] = [];
    while (at < lines.length && lines[at].trim() && !/^(#{1,4}\s|\s*\||\s*([-*]|\d+\.)\s|>)/.test(lines[at])) { paragraph.push(lines[at]); at++; }
    blocks.push(<p key={at}>{paragraph.map((part, index) => <Fragment key={index}>{index > 0 && <br/>}{line(part)}</Fragment>)}</p>);
  }
  return <div className="pf-md">{blocks}</div>;
}
