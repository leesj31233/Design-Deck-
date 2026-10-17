import { describe, expect, it } from "vitest";
import { relativeKo } from "@/lib/paperflow/library/relative-time";

describe("last opened, in words", () => {
  const now = Date.parse("2026-10-07T12:00:00Z"), ago = (ms: number) => new Date(now - ms).toISOString();
  it("reads like a person says it", () => {
    expect(relativeKo(ago(20_000), now)).toBe("방금");
    expect(relativeKo(ago(23 * 60_000), now)).toBe("23분 전");
    expect(relativeKo(ago(5 * 3600_000), now)).toBe("5시간 전");
    expect(relativeKo(ago(30 * 3600_000), now)).toBe("어제");
    expect(relativeKo(ago(3 * 86400_000), now)).toBe("3일 전");
    expect(relativeKo(ago(15 * 86400_000), now)).toBe("2주 전");
    expect(relativeKo(ago(40 * 86400_000), now)).toBe("한 달 전");
    expect(relativeKo(ago(200 * 86400_000), now)).toBe("6개월 전");
    expect(relativeKo(ago(800 * 86400_000), now)).toBe("2년 전");
    expect(relativeKo(undefined, now)).toBeNull();
  });
});
