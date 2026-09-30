import { describe, expect, it } from "vitest";
import { paragraphKind } from "@/lib/paperflow/translation/paragraphs";

describe("PDF translation scope", () => {
  it("keeps section titles and figure captions separate from body prose", () => {
    expect(paragraphKind("3. METHODS", 220, 16, 800)).toBe("title");
    expect(paragraphKind("3.1. Boiler Mesh.", 240, 14, 800)).toBe("title");
    expect(paragraphKind("Figure 4. Airflow rate supplied by each air port with furnace height.", 520, 22, 800)).toBe("caption");
    expect(paragraphKind("The boiler mesh was mainly composed of hexahedral cells to increase computational efficiency.", 260, 60, 800)).toBe("body");
  });

  it("excludes navigation, bibliographic and page furniture", () => {
    expect(paragraphKind("Contents", 130, 15, 800)).toBe("skip");
    expect(paragraphKind("Introduction .................... 3", 180, 14, 800)).toBe("skip");
    expect(paragraphKind("http://pubs.acs.org/journal/acodf", 150, 14, 800)).toBe("skip");
    expect(paragraphKind("[1] A. Researcher, Journal of Combustion 12 (2020)", 300, 16, 800)).toBe("skip");
  });
});
