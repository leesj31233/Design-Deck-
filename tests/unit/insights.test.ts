import { describe, expect, it } from "vitest";
import { insightCards, opensOf } from "@/lib/paperflow/library/insights";
import { researchProfile } from "@/lib/paperflow/scholar/profile";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";

const topic = { id: "T1", name: "Combustion", score: 1, subfield: { id: "S1", name: "Energy" }, field: { id: "F1", name: "Engineering" }, domain: { id: "D1", name: "Physical Sciences" } };
const work = (authors: string[], source: string) => ({ topics: [topic], keywords: ["cofiring"], authors: authors.map((name, index) => ({ id: `A${index + 1}${name.length}`, name, position: index ? "last" : "first", institutions: [] })), source: { id: source, name: `Journal ${source}` } });
const doc = (id: string, opens: number, authors: string[], source: string, archived = false) => ({ id, title: `Methane cofiring ${id}`, authors, archived, pageCount: 8, visitedPages: [1, 2], opens: Array.from({ length: opens }, () => "2026-10-01"), scholar: work(authors, source) }) as unknown as StoredDocument;

describe("나의 연구 패턴 cards", () => {
  it("names the most-read author with how often their papers were opened, across library and archive", () => {
    const docs = [doc("a", 5, ["Kim", "Lee"], "S1"), doc("b", 3, ["Kim"], "S1", true), doc("c", 0, ["Park"], "S2")];
    const cards = insightCards(researchProfile(docs, []), docs);
    expect(cards.author).toMatchObject({ name: "Kim", reads: 8, openAlex: true });
    expect(cards.author!.papers).toEqual(["a", "b"]);
    expect(cards.journals.map(journal => journal.id)).toEqual(["S1", "S2"]);
    expect(cards.journals[0].coverDocumentId).toBe("a");
    expect(cards.totals.papers).toBe(3);
  });
  it("counts a read paper without an open log once, and falls back to title terms for keywords", () => {
    expect(opensOf({ lastOpenedAt: "2026-10-01" } as StoredDocument)).toBe(1);
    expect(opensOf({} as StoredDocument)).toBe(0);
    const plain = [{ id: "x", title: "Coal boiler combustion", authors: [], pageCount: 1 }] as unknown as StoredDocument[];
    const cards = insightCards(researchProfile(plain, []), plain);
    expect(cards.author).toBeNull();
    expect(cards.keywords.map(item => item.name)).toEqual(expect.arrayContaining(["coal", "boiler", "combustion"]));
  });
});
