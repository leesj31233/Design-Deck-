import { describe, expect, it } from "vitest";
import { normalizeWork, titleSimilarity } from "@/lib/paperflow/scholar/openalex";
import { paperEngagement, researchGraph, researchProfile } from "@/lib/paperflow/scholar/profile";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";
import type { Annotation } from "@/lib/paperflow/anchors/types";

const topic = (id: string, name: string, score: number) => ({ id: `https://openalex.org/${id}`, display_name: name, score, subfield: { id: "https://openalex.org/subfields/2210", display_name: "Mechanical Engineering" }, field: { id: "https://openalex.org/fields/22", display_name: "Engineering" }, domain: { id: "https://openalex.org/domains/3", display_name: "Physical Sciences" } });
const work = (id: string, authors: string[], source: string, topics = [topic("T1", "Combustion", .9)]) => normalizeWork({
  id: `https://openalex.org/${id}`, title: `Paper ${id}`, doi: `https://doi.org/10.1/${id}`, publication_year: 2021, cited_by_count: 5, open_access: { is_oa: true, oa_url: "https://x" },
  authorships: authors.map((name, index) => ({ author_position: index === 0 ? "first" : "middle", author: { id: `https://openalex.org/A${name}`, display_name: name }, institutions: [{ id: "https://openalex.org/I1", display_name: "Pusan National University", country_code: "KR" }] })),
  primary_location: { source: { id: `https://openalex.org/${source}`, display_name: source === "S1" ? "ACS Omega" : "Energies", host_organization_name: "ACS" } },
  topics, keywords: [{ display_name: "co-firing" }], related_works: ["https://openalex.org/W9"], referenced_works: []
});
const doc = (id: string, scholar: ReturnType<typeof normalizeWork> | undefined, visited: number[]): StoredDocument => ({ id, filename: `${id}.pdf`, title: id, mimeType: "application/pdf", byteLength: 1, createdAt: "", updatedAt: "", pageCount: 10, blobKey: id, currentPage: 1, authors: [], researchPoolIds: [], archived: false, sourceStatus: "local", visitedPages: visited, scholar });
const mark = (documentId: string, note = ""): Annotation => ({ id: `${documentId}${note}`, type: "highlight", documentId, pageIndex: 0, color: "yellow", anchor: { rects: [], normalizedRects: [], createdAt: "" }, note, createdAt: "", updatedAt: "", resolutionStatus: "resolved" });

describe("OpenAlex records", () => {
  it("normalises authors, journal, topic hierarchy and DOI", () => {
    const record = work("W1", ["Kim", "Jeon"], "S1");
    expect(record).toMatchObject({ openalexId: "W1", doi: "10.1/W1", isOa: true, source: { id: "S1", name: "ACS Omega" } });
    expect(record.authors[0]).toMatchObject({ id: "AKim", position: "first", institutions: [{ name: "Pusan National University", country: "KR" }] });
    expect(record.topics[0]).toMatchObject({ id: "T1", subfield: { id: "subfields/2210" }, field: { id: "fields/22" }, domain: { id: "domains/3" } });
  });
  it("matches a PDF title only when it is nearly identical", () => {
    expect(titleSimilarity("Methane Gas Cofiring Effects on Combustion and NOx Emission", "Methane gas cofiring effects on combustion and NO x emission")).toBeGreaterThan(.86);
    expect(titleSimilarity("Methane Gas Cofiring Effects on Combustion", "Biomass torrefaction kinetics in a fixed bed")).toBeLessThan(.3);
  });
});

describe("research profile", () => {
  it("weighs papers by how much they were studied", () => {
    expect(paperEngagement(doc("a", undefined, [1, 2, 3, 4, 5]), [mark("a"), mark("a", "질문")])).toBeGreaterThan(paperEngagement(doc("b", undefined, [1]), []));
  });
  it("aggregates the topic hierarchy, authors and journals from the library", () => {
    const docs = [doc("a", work("W1", ["Kim", "Jeon"], "S1"), [1, 2, 3]), doc("b", work("W2", ["Jeon"], "S1"), [1]), doc("c", work("W3", ["Lee"], "S2", [topic("T2", "Biomass", .8)]), []), doc("d", undefined, [])];
    const profile = researchProfile(docs, [mark("a")]);
    expect(profile.totals).toMatchObject({ papers: 4, analyzed: 3 });
    expect(profile.topics.find(item => item.level === "domain")).toMatchObject({ name: "Physical Sciences", papers: ["a", "b", "c"] });
    expect(profile.authors[0]).toMatchObject({ name: "Jeon", papers: ["a", "b"] });
    expect(profile.journals[0]).toMatchObject({ name: "ACS Omega", papers: ["a", "b"], coverDocumentId: "a" });
    const graph = researchGraph(profile, docs, { authors: true, journals: true });
    expect(graph.nodes.some(node => node.kind === "domain")).toBe(true);
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "T1", target: "paper:a" }));
    // Bigger spheres for what was studied more.
    const size = (id: string) => graph.nodes.find(node => node.id === id)!.size;
    expect(size("paper:a")).toBeGreaterThan(size("paper:c"));
  });
});
