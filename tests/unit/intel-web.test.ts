import { describe, expect, it } from "vitest";
import { cleanRegistry, indexRegistry } from "@/lib/paperflow/intel/registry";
import { entityWeb } from "@/lib/paperflow/intel/web";
import type { IntelItem } from "@/lib/paperflow/intel/types";

const items = [
  { id: "co-tess", relations: [{ to: "co-ihi", type: "partner" }, { to: "prj-plant", type: "operator" }] },
  { id: "co-ptec", relations: [{ to: "co-tess", type: "investor" }] },
  { id: "co-ihi", relations: [] },
  { id: "co-buyer", relations: [{ to: "co-tess", type: "buyer" }, { to: "co-tess", type: "partner" }] },
  { id: "prj-plant", relations: [] }
].map(item => ({ kind: "company", topics: [], title: item.id, url: "https://x", ...item }) as IntelItem);
const registry = cleanRegistry({ entities: [
  { code: "JP-01", name: "TESS", category: "company", canonicalItemId: "co-tess" },
  { code: "ID-01", name: "PTEC", category: "company", parentCode: "JP-01", canonicalItemId: "co-ptec" },
  { code: "JP-03", name: "IHI", category: "company", canonicalItemId: "co-ihi" },
  { code: "JP-09", name: "Buyer", category: "company", canonicalItemId: "co-buyer" }
] });

describe("an organisation's web", () => {
  it("collects links both ways, by organisation, without its own subsidiaries", () => {
    const index = indexRegistry(registry), byId = new Map(items.map(item => [item.id, item]));
    const web = entityWeb(index.byCode.get("JP-01")!, index, byId, items);
    expect(web.map(link => link.key)).toEqual(["entity:JP-03", "entity:JP-09", "item:prj-plant"]);
    expect(web.find(link => link.key === "entity:JP-09")).toMatchObject({ types: ["buyer", "partner"], direction: "in", via: ["co-buyer"] });
    expect(web.find(link => link.key === "item:prj-plant")?.item?.id).toBe("prj-plant");
  });
});
