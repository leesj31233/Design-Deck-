import { describe, expect, it } from "vitest";
import { cleanRegistry, entityItems, indexRegistry } from "@/lib/paperflow/intel/registry";
import { readPack } from "@/lib/paperflow/intel/repository";
import type { IntelItem } from "@/lib/paperflow/intel/types";

const registry = {
  generatedAt: "2026-10-16T00:00:00Z",
  entities: [
    { code: "JP-01", name: "TESS Holdings", category: "company", aliases: ["TESS"], canonicalItemId: "co-tess", itemIds: ["prj-tess"], mentionIds: [] },
    { code: "ID-02", name: "PT PTEC", category: "company", parentCode: "JP-01", aliases: [], canonicalItemId: "co-ptec", itemIds: ["mkt-ptec-ggl"], mentionIds: [] },
    { code: "jp-9", name: "bad code", category: "company" },
    { code: "MY-01", name: "Bad category", category: "planet" },
    { code: "MY-02", name: "Orphan", category: "vendor", tier: 2, parentCode: "ZZ-99", itemIds: ["x"], aliases: [] }
  ]
};

describe("entity registry", () => {
  it("keeps well-formed entities and drops broken codes, categories and dangling parents", () => {
    const clean = cleanRegistry(registry)!;
    expect(clean.entities.map(entity => entity.code)).toEqual(["JP-01", "ID-02", "MY-02"]);
    expect(clean.entities.find(entity => entity.code === "MY-02")?.parentCode).toBeUndefined();
    expect(clean.entities.find(entity => entity.code === "MY-02")?.tier).toBe(2);
  });
  it("gathers a company's own items and its subsidiaries'", () => {
    const index = indexRegistry(cleanRegistry(registry));
    const byId = new Map(["co-tess", "prj-tess", "co-ptec", "mkt-ptec-ggl"].map(id => [id, { id } as IntelItem]));
    expect(index.byItem.get("mkt-ptec-ggl")?.code).toBe("ID-02");
    expect(index.children.get("JP-01")?.map(entity => entity.code)).toEqual(["ID-02"]);
    expect(entityItems(index.byCode.get("JP-01")!, index, byId).map(item => item.id).sort()).toEqual(["co-ptec", "mkt-ptec-ggl", "prj-tess"]);
  });
  it("travels in a pack as a hidden briefing", () => {
    const pack = readPack(JSON.stringify({ items: [], registry }));
    const brief = pack.briefs?.find(entry => entry.id === "__registry__");
    expect(brief).toBeTruthy();
    expect(JSON.parse(brief!.body).entities).toHaveLength(3);
  });
});
