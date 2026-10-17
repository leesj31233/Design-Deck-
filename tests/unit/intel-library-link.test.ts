import { describe, expect, it } from "vitest";
import { libraryName, linkedDoc, pdfUrlOf, suggestDoc } from "@/lib/paperflow/intel/library-link";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";
import type { IntelItem } from "@/lib/paperflow/intel/types";

const doc = (id: string, filename: string, extra: Partial<StoredDocument> = {}) => ({ id, filename, title: filename.replace(/\.pdf$/, ""), createdAt: "2026-10-01" } as StoredDocument & typeof extra);
const item = (extra: Partial<IntelItem>) => ({ id: "x", kind: "source", title: "", url: "https://example.org", topics: [], ...extra } as IntelItem);

describe("intel library link", () => {
  it("finds the PDF behind an item", () => {
    expect(pdfUrlOf({ url: "https://a.org/r.pdf" })).toBe("https://a.org/r.pdf");
    expect(pdfUrlOf({ url: "https://a.org/r.PDF?x=1" })).toBe("https://a.org/r.PDF?x=1");
    expect(pdfUrlOf({ url: "https://a.org/page", pdfUrl: "https://a.org/b.pdf" })).toBe("https://a.org/b.pdf");
    expect(pdfUrlOf({ url: "https://a.org/pdfs/page" })).toBeUndefined();
  });
  it("reuses a copy already imported under the same name and skips deleted ones", () => {
    const report = item({ title: "IEA Task 32: EFB leaching" });
    expect(linkedDoc(report, [doc("1", libraryName(report.title))])?.id).toBe("1");
    expect(linkedDoc(report, [{ ...doc("1", libraryName(report.title)), deletedAt: "2026-10-02" }])).toBeUndefined();
    expect(linkedDoc(item({ title: "t", user: { docId: "2" } }), [doc("2", "other.pdf")])?.id).toBe("2");
  });
  it("suggests the reader's own copy of a paid report, not a generic match", () => {
    const argus = item({ title: "Argus Biomass Markets, Issue 26-26 — Asian palm kernel shells / EFB market commentary", org: "Argus Media" });
    expect(suggestDoc(argus, [doc("p", "palm-biomass-review.pdf"), doc("a", "argus-biomass-markets.pdf")])?.id).toBe("a");
    expect(suggestDoc(argus, [doc("p", "biomass market report 2025.pdf")])).toBeUndefined();
  });
});

import { refsOf } from "@/components/paperflow/intel/markdown";
describe("citation refs", () => {
  it("expands lists and short ranges", () => {
    expect(refsOf("2, 3")).toEqual(["2", "3"]);
    expect(refsOf("4–6")).toEqual(["4", "5", "6"]);
    expect(refsOf("1-40")).toEqual(["1-40"]);
  });
});

describe("library suggestions", () => {
  it("does not offer a PDF filed for another item or match on generic words", () => {
    const abc = item({ title: "4-5TPH EFB Pellet Plant in Malaysia", org: "ABC Machinery" });
    const wilhelmina = doc("w", "Wilhelmina TG2 steam-exploded EFB black pellet plant (Gebeng, Kuantan).pdf");
    expect(suggestDoc(abc, [wilhelmina])).toBeUndefined();
    const argus = item({ title: "Argus Biomass Markets methodology", org: "Argus Media" });
    expect(suggestDoc(argus, [doc("a", "argus-biomass-markets.pdf")], new Set(["a"]))).toBeUndefined();
  });
});

import { cleanItem } from "@/lib/paperflow/intel/repository";
describe("map places", () => {
  it("keeps only well-formed places", () => {
    const raw = { id: "x", kind: "company", title: "T", url: "https://a.org", topics: ["vendors"], geo: [
      { lat: 3.1, lng: 101.7, label: "본사", kind: "hq", precision: "city" },
      { lat: "bad", lng: 1, label: "x", kind: "hq", precision: "city" },
      { lat: 1, lng: 1, label: "y", kind: "nowhere", precision: "city" },
      { lat: 95, lng: 1, label: "z", kind: "plant", precision: "exact" }
    ] };
    const item = cleanItem(raw as never);
    expect(item?.geo).toEqual([{ lat: 3.1, lng: 101.7, label: "본사", kind: "hq", precision: "city", address: undefined, ref: undefined }]);
    expect(cleanItem({ ...raw, geo: "none" } as never)?.geo).toBeUndefined();
  });
});
