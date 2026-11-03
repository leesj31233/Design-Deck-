import { describe, expect, it } from "vitest";
import { interpolate, t } from "@/lib/paperflow/i18n";
import { EN } from "@/lib/paperflow/i18n/en";
import { englishFromPack, localBrief, localItem, textKey } from "@/lib/paperflow/i18n/content";
import { publicBrief, publicItem } from "@/lib/paperflow/intel/public-feed";
import { cleanItem, readPack } from "@/lib/paperflow/intel/repository";
import type { IntelBrief, IntelItem } from "@/lib/paperflow/intel/types";

describe("t(): Korean keys, English values", () => {
  it("returns the Korean in Korean and the English in English", () => {
    expect(t("ko", "브리핑")).toBe("브리핑");
    expect(t("en", "브리핑")).toBe(EN["브리핑"]);
  });
  it("falls back to the Korean when a key has no English", () => {
    expect(t("en", "사전에 없는 문장")).toBe("사전에 없는 문장");
    expect(t("en", undefined)).toBeUndefined();
  });
  it("fills placeholders in both languages and leaves unknown ones", () => {
    expect(t("en", "{name}의 특허 {count}건", { name: "TESS", count: 3 })).toBe("TESS: 3 patents");
    expect(t("ko", "{name}의 특허 {count}건", { name: "TESS", count: 3 })).toBe("TESS의 특허 3건");
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });
  it("keeps every placeholder of a key in its English", () => {
    for (const [korean, english] of Object.entries(EN)) {
      const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort().join(",");
      expect(names(english), korean).toBe(names(korean));
    }
  });
});

const base: IntelItem = { id: "tess", kind: "company", topics: [], title: "TESS Sdn Bhd", titleKo: "테스 — 세척 EFB 펠릿 생산", summaryKo: "말레이시아의 EFB 펠릿 생산 기업 [1].", lang: "en", url: "https://example.org",
  data: [{ label: "생산능력", value: "연 3만 톤" }], naysor: { fit: "우리 가정과 같다" } };

describe("an item in English", () => {
  it("shows the English where it exists and the Korean where it does not", () => {
    const item = { ...base, en: { t: { [textKey(base.summaryKo!)]: "An EFB pellet producer in Malaysia [1]." } } };
    const shown = localItem(item, "en");
    expect(shown.summaryKo).toBe("An EFB pellet producer in Malaysia [1].");
    expect(shown.data?.[0].label).toBe("생산능력");
    // An English original title reads better than a translation of its Korean title.
    expect(shown.titleKo).toBeUndefined();
    expect(shown.naysor).toEqual(base.naysor);
    expect(localItem(item, "ko")).toBe(item);
  });
  it("uses a translated title for an original in another language", () => {
    const item: IntelItem = { ...base, title: "バイオマス燃料", lang: "ja", en: { t: { [textKey(base.titleKo!)]: "TESS — washed EFB pellets" } } };
    expect(localItem(item, "en").titleKo).toBe("TESS — washed EFB pellets");
  });
  it("translates a hidden JSON briefing field by field", () => {
    const brief: IntelBrief = { id: "__glossary__", title: "용어집", body: JSON.stringify([{ term: "EFB", full: "빈 과방", meaning: "섬유질 송이" }]), en: { t: { [textKey("빈 과방")]: "Empty Fruit Bunch" } } };
    expect(JSON.parse(localBrief(brief, "en").body)[0].full).toBe("Empty Fruit Bunch");
  });
});

describe("English written by the research routine", () => {
  it("turns a mirror of the fields into English by text, ignoring naysor", () => {
    const en = englishFromPack({ summaryKo: "An EFB pellet producer [1].", data: [{ label: "Capacity", value: "30,000 t/yr" }], naysor: { fit: "Same as our assumption" } }, base);
    expect(en?.t[textKey(base.summaryKo!)]).toBe("An EFB pellet producer [1].");
    expect(en?.t[textKey("연 3만 톤")]).toBe("30,000 t/yr");
    expect(Object.values(en?.t ?? {})).not.toContain("Same as our assumption");
  });
  it("keeps it through a pack import, for items and briefings", () => {
    const item = cleanItem({ ...base, en: { summaryKo: "An EFB pellet producer [1]." } });
    expect(item?.en?.t[textKey(base.summaryKo!)]).toBe("An EFB pellet producer [1].");
    const pack = readPack(JSON.stringify({ items: [], briefs: [{ id: "brief-x", title: "주간 브리핑", body: "## 요약\n가격 상승", en: { title: "Weekly briefing", body: "## Summary\nPrices up" } }] }));
    expect(localBrief(pack.briefs![0], "en").title).toBe("Weekly briefing");
  });
  it("goes public only for the public texts", () => {
    // A long summary keeps its other sentences in public; a sentence about NAYSOR goes, and so does its English.
    const fact = `${"말레이시아 조호르주에서 세척 EFB 펠릿을 생산하는 기업으로, 일본 발전소에 수출한다. ".repeat(3).trim()}`, hidden = "NAYSOR 파일럿과 같은 조건이다.";
    const item: IntelItem = { ...base, summaryKo: `${fact} ${hidden}`, en: { t: { [textKey(fact)]: "A company that makes washed EFB pellets in Johor, Malaysia.", [textKey(`${fact} ${hidden}`)]: "… Same conditions as the NAYSOR pilot.", [textKey("우리 가정과 같다")]: "Same as our assumption" } } };
    const shown = publicItem(item, "https://x", "2026-11-01T00:00:00Z", false)!;
    expect(shown.naysor).toBeUndefined();
    expect(shown.summaryKo).toBe(fact);
    expect(Object.values(shown.en?.t ?? {})).toEqual(["A company that makes washed EFB pellets in Johor, Malaysia."]);
    expect(localItem(shown, "en").summaryKo).toBe("A company that makes washed EFB pellets in Johor, Malaysia.");
    expect(publicBrief({ id: "brief-06-pilot", title: "x", body: "y", en: { t: { a: "b" } } })).toBeNull();
  });
  it("keeps a briefing's English when its internal section is cut from the public copy", () => {
    const body = "### 전체 요약\nEFB 펠릿 가격이 올랐다.\n\n### NAYSOR 관점 (내부)\nNAYSOR는 계약을 서둘러야 한다.";
    const english = "### Overview\nEFB pellet prices rose.\n\n### NAYSOR view (internal)\nNAYSOR should hurry the contract.";
    const shown = publicBrief(readPack(JSON.stringify({ items: [], briefs: [{ id: "daily-2026-11-04", title: "일일 브리핑", body, period: "daily", en: { title: "Daily briefing", body: english } }] })).briefs![0])!;
    const read = localBrief(shown, "en");
    expect(read.body).toBe("### Overview\nEFB pellet prices rose.");
    expect(JSON.stringify(shown.en)).not.toContain("hurry");
  });
});
