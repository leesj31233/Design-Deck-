import { describe, expect, it } from "vitest";
import { factsOnly, publicBrief, publicItem, publicMarkdown } from "@/lib/paperflow/intel/public-feed";
import type { IntelItem } from "@/lib/paperflow/intel/types";

describe("NAYSOR News keeps facts and leaves NAYSOR's judgement out", () => {
  it("keeps pictures stored in the public bucket", () => {
    const src = "https://abc.supabase.co/storage/v1/object/public/naysor-news/images/a/0123abcd.webp";
    const item = publicItem({ id: "a", kind: "source", topics: [], title: "a", url: "https://example.org", images: [{ src, caption: "공장 전경", credit: "NAYSOR" }] } as IntelItem, "https://x", "2026-10-16T00:00:00Z", false);
    expect(item?.images).toEqual([]);
    const kept = publicItem({ id: "a", kind: "source", topics: [], title: "a", url: "https://example.org", images: [{ src, caption: "공장 전경", credit: "Antara" }] } as IntelItem, "https://x", "2026-10-16T00:00:00Z", false);
    expect(kept?.images?.[0]?.src).toBe(src);
  });
  it("drops judgement sections and lines in which NAYSOR speaks about itself", () => {
    const body = "## 시장\nEFB 펠릿은 137.5 $/t이다.\nNAYSOR는 이 가격을 매출 가정으로 쓴다.\n### 세부\n회분 5%.\n## NAYSOR에 주는 의미\n협상 하한은 120 $/t.\n## 출처\n[Argus](https://example.org)";
    const out = publicMarkdown(body);
    expect(out).toContain("137.5");
    expect(out).toContain("회분 5%");
    expect(out).toContain("## 출처");
    expect(out).not.toMatch(/NAYSOR|협상|매출 가정/);
  });
  it("keeps the other sentences of a summary", () => {
    expect(factsOnly("가격은 99.42달러다. NAYSOR의 매출 가정에 쓸 수 있다. 샘플 이후 값은 유료다.")).toBe("가격은 99.42달러다. 샘플 이후 값은 유료다.");
  });
  it("withholds the pilot and next-action briefings and the registry's notes", () => {
    expect(publicBrief({ id: "brief-06-pilot", title: "⑥ Pilot Plant Implications", body: "x" })).toBeNull();
    expect(publicBrief({ id: "brief-08-gaps", title: "⑧ Research Gaps & Next Actions", body: "x" })).toBeNull();
    const registry = publicBrief({ id: "__registry__", title: "r", body: JSON.stringify({ entities: [{ code: "JP-01", note: "내부 메모" }] }) });
    expect(registry!.body).not.toContain("내부 메모");
  });
  it("withholds open questions, applicability, the owner's state and library links; pictures become URLs", () => {
    expect(publicItem({ id: "g", kind: "gap", topics: [], title: "g", url: "" } as IntelItem, "https://x", "2026-10-16T00:00:00Z", false)).toBeNull();
    const item = publicItem({ id: "a", kind: "source", topics: [], title: "a", url: "https://example.org", libraryDoc: "abc", naysor: { level: "high" }, user: { star: true },
      dossier: { figures: [{ src: "data:image/webp;base64,AAAA", caption: "c" }], sources: [{ ref: "1", title: "t", libraryDoc: "def" }], sections: [{ title: "NAYSOR 시사점", body: "x" }, { title: "개요", body: "사실." }] } } as unknown as IntelItem, "https://x", "2026-10-16T00:00:00Z", true)!;
    expect(item).not.toHaveProperty("user"); expect(item).not.toHaveProperty("libraryDoc"); expect(item).not.toHaveProperty("naysor");
    expect(item.dossier!.figures![0].src).toMatch(/^https:\/\/x\/api\/public\/intel\/media\?item=a&fig=0&v=/);
    expect(item.dossier!.sources![0]).not.toHaveProperty("libraryDoc");
    expect(item.dossier!.sections!.map(section => section.title)).toEqual(["개요"]);
    expect(item.hasCover).toBe(true);
  });
});
