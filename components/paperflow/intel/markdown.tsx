import { Fragment, type ReactNode } from "react";

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

function inline(text: string, entity?: EntityRenderer, terms?: TermMarker): ReactNode[] {
  const out: ReactNode[] = [], pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\[([^\]]+)\]\(intel:([\w.:-]+)\)|\*([^*\s][^*]*)\*/g;
  let last = 0, match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(...plain(text.slice(last, match.index), terms, last));
    if (match[1]) out.push(<strong key={match.index}>{inline(match[1], entity, terms)}</strong>);
    else if (match[2]) out.push(<code key={match.index}>{match[2]}</code>);
    else if (match[3]) out.push(<a key={match.index} href={match[4]} target="_blank" rel="noreferrer noopener">{match[3]}</a>);
    else if (match[5]) out.push(entity ? entity(match[6], match[5], match.index) : match[5]);
    else out.push(<em key={match.index}>{match[7]}</em>);
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(...plain(text.slice(last), terms, last));
  return out;
}

/**
 * A briefing written in Markdown (headings, paragraphs, lists with one level of nesting, tables,
 * quotes), rendered as React elements. Briefings come in packs, so nothing is ever injected as HTML.
 */
export function Markdown({ source, entity, terms }: { source: string; entity?: EntityRenderer; terms?: Omit<TermMarker, "seen"> }) {
  const marker = terms ? { ...terms, seen: new Set<string>() } : undefined;
  const line = (text: string) => inline(text, entity, marker);
  const lines = source.replace(/\r\n/g, "\n").split("\n"), blocks: ReactNode[] = [];
  for (let at = 0; at < lines.length;) {
    const current = lines[at];
    if (!current.trim()) { at++; continue; }
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
