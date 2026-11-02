import { describe, expect, it } from "vitest";
import { activeMention, groupByPaper, insertMention, mentionCandidates, noteTitle, parseNoteBody, plainNote, shortTitle, sortNotes, type QuickNote } from "@/lib/paperflow/notes/notebook";
import type { Annotation } from "@/lib/paperflow/anchors/types";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";

const doc = (id: string, title: string, extra: Partial<StoredDocument> = {}) => ({ id, title, filename: `${id}.pdf`, authors: ["Kim"], pageCount: 10, keywords: [], ...extra }) as unknown as StoredDocument;
const mark = (id: string, documentId: string, pageIndex: number, quote: string, extra: Partial<Annotation> = {}) => ({ id, documentId, pageIndex, type: "highlight", color: "yellow", anchor: { textQuote: quote, normalizedRects: [{ x: 0, y: .5, width: .1, height: .01 }] }, createdAt: "2026-10-01", updatedAt: "2026-10-01", ...extra }) as unknown as Annotation;
const docs = [doc("a", "Biochar effects on lettuce germination in Vertisol and Alfisol soils.pdf", { keywords: ["biochar", "germination index"] }), doc("b", "Methane cofiring in coal boilers")];
const marks = [mark("m1", "a", 2, "Biochar at 2% raised the germination index by 175%"), mark("m2", "b", 0, "NOx fell by 69.8%", { note: "핵심 수치", updatedAt: "2026-10-03" }), mark("m3", "a", 0, "Soils were sampled in 2024", { updatedAt: "2026-10-02" }), mark("x", "gone", 0, "no paper")];

describe("notebook @mentions", () => {
  it("finds the @query at the caret only after whitespace or at the start", () => {
    expect(activeMention("see @bio", 8)).toEqual({ start: 4, query: "bio" });
    expect(activeMention("@", 1)).toEqual({ start: 0, query: "" });
    expect(activeMention("mail me@lab.org", 15)).toBeNull();
    expect(activeMention("@bio\nnext", 9)).toBeNull();
    expect(activeMention("no mention here", 15)).toBeNull();
  });
  it("offers papers, keywords and marked passages with citation tokens", () => {
    const found = mentionCandidates("germination", docs, marks);
    expect(found.map(item => item.kind)).toEqual(["paper", "keyword", "mark"]);
    expect(found[1].token).toBe("[[(Biochar effects on lettuce…) 'germination index'|/reader/a]]");
    expect(found[2].token).toBe("[[(Biochar effects on lettuce…, p.3) 'Biochar at 2% raised the germination ind…'|/reader/a?page=3&annotation=m1]]");
    expect(mentionCandidates("", docs, marks).filter(item => item.kind === "paper")).toHaveLength(2);
    expect(mentionCandidates("no paper", docs, marks)).toEqual([]);
  });
  it("inserts the citation in place of the @query and renders it as a pill", () => {
    const text = "결과 비교 @germ 참고";
    const { text: next, caret } = insertMention(text, activeMention(text, 11)!, "[[(Biochar, p.3) 'GI'|/reader/a?page=3]]");
    expect(next).toBe("결과 비교 [[(Biochar, p.3) 'GI'|/reader/a?page=3]] 참고");
    expect(next.slice(0, caret).endsWith("]] ")).toBe(true);
    expect(parseNoteBody(next)).toEqual([{ kind: "text", text: "결과 비교 " }, { kind: "cite", label: "(Biochar, p.3) 'GI'", href: "/reader/a?page=3" }, { kind: "text", text: " 참고" }]);
    expect(plainNote(next)).toBe("결과 비교 (Biochar, p.3) 'GI' 참고");
  });
  it("never turns a non-reader link into a pill", () => {
    expect(parseNoteBody("[[click|javascript:alert(1)]]")).toEqual([{ kind: "text", text: "[[click|javascript:alert(1)]]" }]);
    expect(parseNoteBody("[[x|https://evil.example]]")[0].kind).toBe("text");
  });
  it("shortens titles at a word boundary", () => {
    expect(shortTitle("Short title.pdf")).toBe("Short title");
    expect(shortTitle("Methane cofiring in coal boilers and its NOx", 20)).toBe("Methane cofiring in…");
  });
});

describe("notebook lists", () => {
  it("puts pinned notes first, then the latest, and searches title and text", () => {
    const note = (id: string, pinned: boolean, updatedAt: string, body = "", title = ""): QuickNote => ({ id, title, body, pinned, createdAt: updatedAt, updatedAt });
    const notes = [note("1", false, "2026-10-01"), note("2", true, "2026-09-01"), note("3", false, "2026-10-05", "NOx [[(Coal) 'NOx'|/reader/b]]")];
    expect(sortNotes(notes).map(item => item.id)).toEqual(["2", "3", "1"]);
    expect(sortNotes(notes, "coal").map(item => item.id)).toEqual(["3"]);
    expect(noteTitle(notes[2])).toBe("NOx (Coal) 'NOx'");
    expect(noteTitle(notes[0])).toBe("새 노트");
  });
  it("groups marks by paper, latest paper first, marks in page order, and drops marks of missing papers", () => {
    const groups = groupByPaper(docs, marks);
    expect(groups.map(group => group.doc.id)).toEqual(["b", "a"]);
    expect(groups[1].marks.map(item => item.id)).toEqual(["m3", "m1"]);
    expect(groups[0]).toMatchObject({ highlights: 1, memos: 1 });
  });
});
