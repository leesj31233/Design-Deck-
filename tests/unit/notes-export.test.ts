import { describe, expect, it } from "vitest";
import { notesMarkdown, plainCitations, type NotesExportInput } from "@/lib/paperflow/notes/notes-export";

const note = (id: string, updatedAt: string, body: string, extra: Partial<NotesExportInput["notes"][number]> = {}) => ({ id, title: id.toUpperCase(), body, pinned: false, createdAt: updatedAt, updatedAt, ...extra });
const base = (): NotesExportInput => ({ notes: [], papers: [], exportedAt: "2026-10-06T10:00:00.000Z" });

describe("notes as Markdown", () => {
  it("turns citations into readable text, with the page when there is one, and never leaves a /reader link", () => {
    expect(plainCitations("보기 [[(Biochar, p.3) 'GI'|/reader/abc?page=3&annotation=x]] 끝")).toBe("보기 (Biochar, p.3) 'GI' 끝");
    expect(plainCitations("[[(Biochar) 'GI'|/reader/abc?page=12]]")).toBe("(Biochar) 'GI' (p.12)");
    expect(plainCitations("[[(Biochar, p.1) 'GI'|/reader/abc?page=12]]")).toBe("(Biochar, p.1) 'GI' (p.12)");
    expect(plainCitations("[[(Biochar)|/reader/abc]] 참고")).toBe("(Biochar) 참고");
    expect(plainCitations("[[바깥|https://example.org]]")).toBe("바깥");
    const md = notesMarkdown({ ...base(), notes: [note("a", "2026-10-01", "[[(Coal)|/reader/x?page=2]] 와 [[(Gas)|/reader/y]]")] });
    expect(md).toContain("(Coal) (p.2) 와 (Gas)");
    expect(md).not.toContain("/reader");
  });

  it("puts pinned notes first, then the newest", () => {
    const md = notesMarkdown({ ...base(), notes: [note("old", "2026-09-01", "x"), note("pin", "2026-08-01", "x", { pinned: true }), note("new", "2026-10-05", "x"), note("untitled", "2026-10-02", "x", { title: "  " })] });
    const order = ["### PIN", "### NEW", "### 제목 없는 노트", "### OLD"].map(heading => md.indexOf(heading));
    expect(order.every(index => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("skips empty sections and empty notes", () => {
    expect(notesMarkdown(base())).toBe("# PAPERFLOW 노트\n\n2026-10-06\n");
    const md = notesMarkdown({ ...base(), notes: [note("e", "2026-10-01", "  \n ", { title: "" })], papers: [{ id: "p", title: "Paper", marks: [] }] });
    expect(md).not.toContain("## 노트");
    expect(md).not.toContain("## 논문별");
  });

  it("keeps multi-line note bodies as written", () => {
    const md = notesMarkdown({ ...base(), notes: [note("m", "2026-10-01", "\n첫 줄   \n\n- 항목 하나\n- 항목 둘\n\n")] });
    expect(md).toContain("### M\n\n첫 줄\n\n- 항목 하나\n- 항목 둘\n");
  });

  it("lists each paper's marks in page order with quotes and memos", () => {
    const md = notesMarkdown({ ...base(), papers: [{ id: "p", title: "Biochar and lettuce.pdf", authors: ["Kim", "Lee", "Park", "Choi"], year: 2024, marks: [
      { page: 5, quote: "Second\n  passage", createdAt: "2026-10-02" },
      { page: 2, quote: "First passage", note: "핵심 수치", createdAt: "2026-10-03" },
      { page: 7, quote: "", note: "손글씨 메모", createdAt: "2026-10-04" }
    ] }] });
    expect(md).toContain("## 논문별 마킹 · 메모\n\n### Biochar and lettuce\n\nKim, Lee, Park 외 · 2024\n\n> \"First passage\" — p.2\n\n- 메모: 핵심 수치\n\n> \"Second passage\" — p.5\n\n- 메모: 손글씨 메모 (p.7)\n");
    expect(notesMarkdown({ ...base(), papers: [{ id: "p", title: "T", marks: [{ page: 1, quote: "q", createdAt: "x" }] }] })).toBe(notesMarkdown({ ...base(), papers: [{ id: "p", title: "T", marks: [{ page: 1, quote: "q", createdAt: "x" }] }] }));
  });
});
