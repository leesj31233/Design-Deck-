/**
 * The notes view as Markdown: notebook notes first (pinned, then newest), then every paper's marks
 * and memos in page order. Citations become readable text — "label (p.N)" — and no raw /reader link
 * is ever written. Pure and deterministic; empty sections are left out.
 */
export interface NotesExportInput {
  notes: { id: string; title: string; body: string; pinned: boolean; createdAt: string; updatedAt: string }[];
  papers: { id: string; title: string; authors?: string[]; year?: number; marks: { page: number; quote: string; note?: string; color?: string; createdAt: string }[] }[];
  exportedAt: string;
}

/** Any [[label|href]] token: a reader link adds its page (unless the label has it), anything else keeps just the label. */
const CITATION = /\[\[([^\]|]+)\|([^\]|\s]+)\]\]/g;
export function plainCitations(body: string) {
  return body.replace(CITATION, (_, label: string, href: string) => {
    const page = href.startsWith("/reader/") ? href.match(/[?&]page=(\d+)/)?.[1] : undefined;
    // Labels made by 노트에 인용 already name the page: never say it twice.
    return page && !new RegExp(`\\bp\\.${page}\\b`).test(label) ? `${label.trim()} (p.${page})` : label.trim();
  });
}
const oneLine = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

export function notesMarkdown(input: NotesExportInput): string {
  const out: string[] = ["# PAPERFLOW 노트", "", input.exportedAt.slice(0, 10), ""];

  const notes = input.notes
    .filter(note => note.title.trim() || note.body.trim())
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  if (notes.length) {
    out.push("## 노트", "");
    for (const note of notes) {
      out.push(`### ${oneLine(note.title) || "제목 없는 노트"}`, "");
      // Line breaks are the writer's: keep every line, only trailing spaces and edge blank lines go.
      const body = plainCitations(note.body).split("\n").map(line => line.trimEnd()).join("\n").replace(/^\n+|\n+$/g, "");
      if (body) out.push(body, "");
    }
  }

  const papers = input.papers.filter(paper => paper.marks.some(mark => oneLine(mark.quote) || oneLine(mark.note)));
  if (papers.length) {
    out.push("## 논문별 마킹 · 메모", "");
    for (const paper of papers) {
      out.push(`### ${oneLine(paper.title).replace(/\.pdf$/i, "") || "제목 없는 논문"}`, "");
      const authors = (paper.authors ?? []).map(oneLine).filter(Boolean);
      const byline = [authors.length > 3 ? `${authors.slice(0, 3).join(", ")} 외` : authors.join(", "), paper.year ? String(paper.year) : ""].filter(Boolean).join(" · ");
      if (byline) out.push(byline, "");
      const marks = [...paper.marks].sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt));
      for (const mark of marks) {
        const quote = oneLine(mark.quote), note = oneLine(mark.note);
        if (!quote && !note) continue;
        if (quote) out.push(`> "${quote}" — p.${mark.page}`, "");
        if (note) out.push(`- 메모: ${note}${quote ? "" : ` (p.${mark.page})`}`, "");
      }
    }
  }
  while (out[out.length - 1] === "") out.pop();
  return `${out.join("\n")}\n`;
}
