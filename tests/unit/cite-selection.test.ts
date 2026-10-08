import { describe, expect, it } from "vitest";
import { appendCitation, selectionCitation } from "@/lib/paperflow/notes/cite-selection";
import { parseNoteBody, type QuickNote } from "@/lib/paperflow/notes/notebook";

describe("노트에 인용 from the reader", () => {
  it("labels the passage with the short title, the page and its first 40 characters", () => {
    const token = selectionCitation("doc1", "Biochar effects on lettuce germination in Vertisol soils.pdf", 2, "Biochar at 2% raised the\ngermination index of lettuce by 175% relative to the control.");
    expect(token).toBe("[[(Biochar effects on lettuce…, p.3) 'Biochar at 2% raised the germination ind…'|/reader/doc1?page=3]]");
    expect(parseNoteBody(token)).toEqual([{ kind: "cite", label: "(Biochar effects on lettuce…, p.3) 'Biochar at 2% raised the germination ind…'", href: "/reader/doc1?page=3" }]);
    // Brackets and bars in the quote cannot break the token.
    expect(parseNoteBody(selectionCitation("d", "Short", 0, "see [12] | note"))[0]).toEqual({ kind: "cite", label: "(Short, p.1) 'see 12 note'", href: "/reader/d?page=1" });
  });
  it("appends to the most recently edited note, or starts a new one", () => {
    const note = (id: string, updatedAt: string, body: string): QuickNote => ({ id, title: "", body, pinned: id === "old", createdAt: updatedAt, updatedAt });
    const notes = [note("old", "2026-10-01", "pinned"), note("recent", "2026-10-05", "생각  \n")];
    const added = appendCitation(notes, "[[x|/reader/a]]", "2026-10-06", () => "new");
    expect(added).toEqual({ created: false, note: { ...notes[1], body: "생각\n[[x|/reader/a]]", updatedAt: "2026-10-06" } });
    expect(appendCitation([note("e", "2026-10-01", "")], "[[x|/reader/a]]", "2026-10-06", () => "new").note.body).toBe("[[x|/reader/a]]");
    expect(appendCitation([], "[[x|/reader/a]]", "2026-10-06", () => "new")).toEqual({ created: true, note: { id: "new", title: "", body: "[[x|/reader/a]]", pinned: false, createdAt: "2026-10-06", updatedAt: "2026-10-06" } });
  });
});
