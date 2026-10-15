import { Fragment, type ReactNode } from "react";

/** Inline Markdown: **bold**, `code` and [links](https://…) (web links only), as React nodes (never HTML). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [], pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*([^*\s][^*]*)\*/g;
  let last = 0, match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    if (match[1]) out.push(<strong key={match.index}>{match[1]}</strong>);
    else if (match[2]) out.push(<code key={match.index}>{match[2]}</code>);
    else if (match[5]) out.push(<em key={match.index}>{match[5]}</em>);
    else out.push(<a key={match.index} href={match[4]} target="_blank" rel="noreferrer noopener">{match[3]}</a>);
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * A briefing written in Markdown (headings, paragraphs, lists, tables, quotes), rendered as React
 * elements. Briefings come in packs, so nothing is ever injected as HTML.
 */
export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n"), blocks: ReactNode[] = [];
  for (let at = 0; at < lines.length;) {
    const line = lines[at];
    if (!line.trim()) { at++; continue; }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) { const level = Math.min(4, Math.max(2, heading[1].length)); const Tag = `h${level}` as "h2"; blocks.push(<Tag key={at}>{inline(heading[2])}</Tag>); at++; continue; }
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (at < lines.length && /^\s*\|/.test(lines[at])) { const cells = lines[at].trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim()); if (!cells.every(cell => /^:?-{2,}:?$/.test(cell))) rows.push(cells); at++; }
      const [head, ...body] = rows;
      blocks.push(<div key={at} className="pf-md-table"><table><thead><tr>{head.map((cell, index) => <th key={index}>{inline(cell)}</th>)}</tr></thead><tbody>{body.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      // One level of nesting: an indented item belongs to the item above it.
      const ordered = /^\s*\d+\./.test(line), items: { text: string; children: string[] }[] = [];
      while (at < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[at])) {
        const text = lines[at].replace(/^\s*([-*]|\d+\.)\s+/, "");
        if (/^\s{2,}/.test(lines[at]) && items.length) items[items.length - 1].children.push(text); else items.push({ text, children: [] });
        at++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={at}>{items.map((item, index) => <li key={index}>{inline(item.text)}{item.children.length > 0 && <ul>{item.children.map((child, inner) => <li key={inner}>{inline(child)}</li>)}</ul>}</li>)}</List>);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (at < lines.length && /^>\s?/.test(lines[at])) { quote.push(lines[at].replace(/^>\s?/, "")); at++; }
      blocks.push(<blockquote key={at}>{inline(quote.join(" "))}</blockquote>);
      continue;
    }
    const paragraph: string[] = [];
    while (at < lines.length && lines[at].trim() && !/^(#{1,4}\s|\s*\||\s*([-*]|\d+\.)\s|>)/.test(lines[at])) { paragraph.push(lines[at]); at++; }
    blocks.push(<p key={at}>{paragraph.map((part, index) => <Fragment key={index}>{index > 0 && <br/>}{inline(part)}</Fragment>)}</p>);
  }
  return <div className="pf-md">{blocks}</div>;
}
