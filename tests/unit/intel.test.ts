import { describe, expect, it } from "vitest";
import { cleanItem, readPack } from "../../lib/paperflow/intel/repository";
import { registerCsv } from "../../lib/paperflow/intel/export";
import { isCjkSource, needsHangul, partitionTranslationResults } from "../../lib/paperflow/translation/block-contract";

describe("intelligence packs", () => {
  it("keeps valid items, drops malformed ones and unsafe links", () => {
    const pack = readPack(JSON.stringify({ id: "p1", items: [
      { id: "co-ihi", kind: "company", title: "IHI Solid Biomass Malaysia", url: "https://www.ihi.co.jp/", reliability: 4, status: "verified", topics: ["producers"], data: [{ label: "회분", value: 2.28, unit: "%" }] },
      { id: "bad link", kind: "source", title: "x", url: "https://example.com" },
      { id: "js", kind: "source", title: "x", url: "javascript:alert(1)" },
      { id: "gap-1", kind: "gap", title: "Open question", url: "" },
      { id: "odd", kind: "nonsense", title: "Odd kind", url: "https://example.com", reliability: 12, status: "maybe" }
    ], briefs: [{ id: "b1", title: "요약", body: "## 제목" }, { id: "b 2", title: "x", body: "y" }] }));
    expect(pack.items.map(item => item.id)).toEqual(["co-ihi", "gap-1", "odd"]);
    expect(pack.items[0].data?.[0].value).toBe("2.28");
    expect(pack.items[2]).toMatchObject({ kind: "source", reliability: undefined, status: undefined });
    expect(pack.briefs?.map(brief => brief.id)).toEqual(["b1"]);
  });
  it("accepts a bare array as a pack", () => {
    expect(readPack(JSON.stringify([{ id: "a", title: "A", url: "https://a.org" }])).items).toHaveLength(1);
    expect(() => readPack("{")).toThrow();
  });
  it("never lets a pdf link be anything but a web address", () => {
    expect(cleanItem({ id: "a", title: "A", url: "https://a.org", pdfUrl: "file:///etc/passwd" })?.pdfUrl).toBeUndefined();
  });
  it("writes the source register as CSV with quoted fields", () => {
    const csv = registerCsv([cleanItem({ id: "a", title: "A, \"quoted\"", url: "https://a.org", data: [{ label: "K", value: "0.4", unit: "%DM" }] })!]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("\"A, \"\"quoted\"\"\"");
    expect(csv).toContain("K: 0.4 %DM");
  });
});

describe("translation from Indonesian, Malay, Chinese and Japanese", () => {
  it("treats Indonesian prose handed back untranslated as a failure", () => {
    const source = "Tandan kosong kelapa sawit yang dicuci dengan air panas menunjukkan penurunan kadar kalium dan klorin yang signifikan untuk bahan bakar.";
    expect(needsHangul(source)).toBe(true);
    expect(partitionTranslationResults([{ id: "a", text: source }], [{ id: "a", text: source }]).missing).toEqual(["a"]);
  });
  it("accepts a Korean translation of Chinese that runs much longer than the source", () => {
    const source = "空果串经过水洗处理后，钾和氯的含量显著降低，灰分减少，适合作为生物质燃料用于燃煤电厂的混烧。";
    expect(isCjkSource(source)).toBe(true);
    const korean = "빈 과방(EFB)을 물로 세척하는 처리를 거친 뒤에는 칼륨과 염소의 함량이 뚜렷하게 낮아지고 회분도 줄어들어, 석탄화력발전소의 혼소용 바이오매스 연료로 사용하기에 적합하다.";
    expect(partitionTranslationResults([{ id: "a", text: source }], [{ id: "a", text: korean }]).results).toHaveLength(1);
  });
});
