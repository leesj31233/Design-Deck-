import { describe, expect, it } from "vitest";
import { itemClasses, type IntelItem } from "@/lib/paperflow/intel/types";
import { readPack } from "@/lib/paperflow/intel/repository";
import { cleanRegistry, entityClasses } from "@/lib/paperflow/intel/registry";

describe("business classes", () => {
  it("reads a class from the topics when the item names none", () => {
    expect(itemClasses({ topics: ["pelletizing"] })).toEqual(["c1"]);
    expect(itemClasses({ topics: ["coal-drying"] })).toEqual(["c2"]);
    expect(itemClasses({ topics: ["cnsl", "carbonization"] })).toEqual(["c1", "c3"]);
    expect(itemClasses({ topics: ["feedstock-supply"] })).toEqual(["c1"]);
    expect(itemClasses({ topics: ["pelletizing"], classes: ["c3"] })).toEqual(["c3"]);
  });
  it("keeps known classes from a pack, items and briefings alike", () => {
    const pack = readPack(JSON.stringify({ items: [{ id: "x", title: "x", url: "https://example.org", topics: [], classes: ["c2", "c9", "c2"] }], briefs: [{ id: "b", title: "b", body: "b", classes: ["c3"] }] }));
    expect(pack.items[0].classes).toEqual(["c2"]);
    expect(pack.briefs![0].classes).toEqual(["c3"]);
  });
  it("gives an organisation the classes of its items", () => {
    const registry = cleanRegistry({ entities: [{ code: "ID-01", name: "Miner", category: "company", itemIds: ["a", "b"] }, { code: "ID-02", name: "Fixed", category: "company", classes: ["c3"] }] })!;
    const byId = new Map<string, IntelItem>([["a", { id: "a", topics: ["coal-market"] } as IntelItem], ["b", { id: "b", topics: ["pelletizing"] } as IntelItem]]);
    expect(entityClasses(registry.entities[0], byId)).toEqual(["c1", "c2"]);
    expect(entityClasses(registry.entities[1], byId)).toEqual(["c3"]);
  });
});
