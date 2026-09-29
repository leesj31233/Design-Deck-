import { expect, it } from "vitest";
import { paragraphRegions, layoutTranslation } from "../../lib/paperflow/translation/inline-layout";
import { paperFontStack, paperFontRuns } from "../../lib/paperflow/translation/paper-font";

it("keeps embedded Latin faces and matches Korean serif/sans fallbacks", () => {
  expect(paperFontStack('g_d0_f5, serif')).toBe('g_d0_f5, "Noto Serif KR", "Batang", "AppleMyungjo", serif');
  expect(paperFontStack('g_d0_f2, sans-serif')).toContain('g_d0_f2, "Noto Sans KR"');
  const runs = paperFontRuns("CO2 배출량과 heat flux를 비교하였다.");
  expect(runs.map(run => run.text).join("")).toBe("CO2 배출량과 heat flux를 비교하였다.");
  expect(runs.filter(run => run.latin).every(run => !run.text.includes(" "))).toBe(true);
});

it("preserves the figure cutout in an abstract with narrow then full-width text", () => {
  const regions = paragraphRegions([
    { x: 30, y: 100, width: 190, height: 12 },
    { x: 30, y: 117, width: 195, height: 12 },
    { x: 30, y: 134, width: 185, height: 12 },
    { x: 30, y: 151, width: 400, height: 12 },
    { x: 30, y: 168, width: 360, height: 12 },
  ]);
  expect(regions).toEqual([{ x: 30, y: 100, width: 195, height: 46 }, { x: 30, y: 151, width: 400, height: 29 }]);
  const translation = "이 연구에서는 methane co-firing 조건을 분석하고 NOx 배출량을 비교하였다.";
  const result = layoutTranslation(translation, regions, 12, (text, size) => text.length * size * .8);
  expect(result.overflow).toBeNull();
  expect(result.lines.map(line => line.text).join(" ")).toBe(translation);
});

it("retains a long translation in a bounded overflow region rather than deleting words", () => {
  const text = "긴 문단을 생략하지 않고 모두 표시한다. ".repeat(25).trim();
  const result = layoutTranslation(text, [{ x: 0, y: 0, width: 150, height: 30 }], 12, (value, size) => value.length * size);
  expect(result.overflow?.text).toBe(text);
  expect(result.fontSize).toBeGreaterThanOrEqual(12 * .82);
});
