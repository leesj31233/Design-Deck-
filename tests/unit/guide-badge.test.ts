import { afterEach, describe, expect, it, vi } from "vitest";
import { guideBadge, readGuideOnly, writeGuideOnly } from "@/lib/paperflow/library/guide-badge";

describe("library AI guide badge", () => {
  it("labels only current guides, with the paper type in Korean", () => {
    expect(guideBadge({ version: "paperflow-guide-v4" })).toBe("AI 가이드");
    expect(guideBadge({ version: "paperflow-guide-v4", paperType: "experimental" })).toBe("AI 가이드 · 실험");
    expect(guideBadge({ version: "paperflow-guide-v4", paperType: "computational" })).toBe("AI 가이드 · 계산");
    expect(guideBadge({ version: "paperflow-guide-v4", paperType: "theoretical" })).toBe("AI 가이드 · 이론");
    expect(guideBadge({ version: "paperflow-guide-v4", paperType: "review" })).toBe("AI 가이드 · 리뷰");
    expect(guideBadge({ version: "paperflow-guide-v4", paperType: "other" })).toBe("AI 가이드");
    expect(guideBadge({ version: "paperflow-guide-v3" })).toBeNull();
    expect(guideBadge(undefined)).toBeNull();
  });
});

describe("가이드 있는 논문만 toggle", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("is remembered in localStorage and survives blocked storage", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) });
    expect(readGuideOnly()).toBe(false);
    writeGuideOnly(true); expect(readGuideOnly()).toBe(true);
    writeGuideOnly(false); expect(readGuideOnly()).toBe(false);
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } });
    expect(readGuideOnly()).toBe(false);
    expect(() => writeGuideOnly(true)).not.toThrow();
  });
});
