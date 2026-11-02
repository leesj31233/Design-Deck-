import { describe, expect, it } from "vitest";
import { intelFolderFor, intelMayRefile, sameFolder } from "@/lib/paperflow/intel/archiving";
import { folderChain } from "@/lib/paperflow/library/archive-folders";
import type { IntelItem } from "@/lib/paperflow/intel/types";

const item = (patch: Partial<IntelItem>) => ({ id: "x", kind: "source", topics: [], title: "x", url: "https://example.org", ...patch }) as IntelItem;

describe("intelligence PDFs are filed by class and kind", () => {
  it("files under 인텔리전스 PDF › Class › kind", () => {
    const folder = intelFolderFor(item({ sourceType: "paper", topics: ["coal-drying"] }));
    expect(folder.id).toBe("f-intel-c2-technology");
    expect(folder.parent?.id).toBe("f-intel-c2");
    expect(folder.parent?.parent?.id).toBe("f-intel-pdf");
  });
  it("puts standards first, then disclosures, government, technology, market, company and press", () => {
    expect(intelFolderFor(item({ sourceType: "gov", title: "SNI 8021:2014 Pelet kayu" })).id).toBe("f-intel-c1-standard");
    expect(intelFolderFor(item({ sourceType: "annual-report" })).id).toBe("f-intel-c1-disclosure");
    expect(intelFolderFor(item({ sourceType: "gov" })).id).toBe("f-intel-c1-government");
    expect(intelFolderFor(item({ kind: "market", sourceType: "press", classes: ["c3"] })).id).toBe("f-intel-c3-market");
    expect(intelFolderFor(item({ sourceType: "vendor-catalog" })).id).toBe("f-intel-c1-company");
    expect(intelFolderFor(item({ sourceType: "press" })).id).toBe("f-intel-c1-press");
  });
  it("leaves papers the reader filed elsewhere, and knows when a paper is already in place", () => {
    expect(intelMayRefile({ id: "f-mine", name: "석탄고품위화", icon: "folder", color: "#000", createdAt: "" })).toBe(false);
    expect(intelMayRefile({ id: "f-intel-pdf", name: "인텔리전스 PDF", icon: "globe", color: "#000", createdAt: "" })).toBe(true);
    const target = intelFolderFor(item({ sourceType: "paper" }));
    expect(sameFolder(target, intelFolderFor(item({ sourceType: "paper" })))).toBe(true);
    expect(sameFolder(target.parent, target)).toBe(false);
  });
  it("walks a folder up to the top", () => {
    const leaf = intelFolderFor(item({ sourceType: "press" })), folders = [leaf, leaf.parent!, leaf.parent!.parent!].map(({ parent: _parent, ...plain }) => plain);
    expect(folderChain(leaf.id, folders).map(folder => folder.id)).toEqual(["f-intel-c1-press", "f-intel-c1", "f-intel-pdf"]);
  });
});
