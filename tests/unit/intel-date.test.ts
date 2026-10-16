import { describe, expect, it } from "vitest";
import { itemDate } from "@/lib/paperflow/intel/types";

describe("an item's date", () => {
  it("takes the newest real date from its own date, its news and its sources", () => {
    expect(itemDate({ date: "2021 (datasheet); 2026-08 (customer story)" }, "2026-10-16")).toBe("2026-08");
    expect(itemDate({ date: "n.d.", dossier: { sources: [{ ref: "1", title: "a", date: "2025-03-02" }, { ref: "2", title: "b", date: "2024" }] } } as never, "2026-10-16")).toBe("2025-03-02");
    expect(itemDate({ date: "2026-01", update: { type: "news", date: "2026-10-15", entities: [] } }, "2026-10-16")).toBe("2026-10-15");
  });
  it("ignores planned dates and has none for an undated item", () => {
    expect(itemDate({ date: "2027-03 (planned)" }, "2026-10-16")).toBeUndefined();
    expect(itemDate({ date: "unknown" }, "2026-10-16")).toBeUndefined();
  });
});
