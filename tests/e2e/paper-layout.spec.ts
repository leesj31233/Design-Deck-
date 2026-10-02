import { test, expect } from "@playwright/test";
import { mockResearch } from "./mock-research";

// Runs against a local journal PDF (ACS Omega 2021, 6, 31132 was used in QA); the file never enters the repo.
test("real paper: front matter stays in English, body is typeset in its columns without overflow or extra panels", async ({ page }) => {
  test.setTimeout(240_000);
  const sample = process.env.PAPERFLOW_LAYOUT_SAMPLE;
  test.skip(!sample, "Set PAPERFLOW_LAYOUT_SAMPLE to a local research PDF for layout QA.");
  const sources: string[] = [];
  let requests = 0;
  // Korean at the length real translations of this paper measured (about 0.46x the source characters).
  await mockResearch(page, source => "보일러의 열전달과 연소 특성을 slagging 관점에서 분석하였다. ".repeat(Math.max(1, Math.round(source.length / 70))).trim(), passages => { requests++; sources.push(...passages.map(item => item.text)); });
  await page.goto("/library");
  await page.getByLabel("Import PDF file").setInputFiles(sample!);
  await expect(page.locator("[data-pdf-page='0'][data-ready=true]")).toBeVisible();
  await page.getByRole("button", { name: "논문 전체 일괄 번역" }).click();
  await expect(page.locator(".pf-inline-bulk")).toContainText("논문 전체 번역 완료", { timeout: 180_000 });

  // Scope: title, authors, journal furniture and references are never sent; abstract, headings and captions are.
  expect(sources.some(source => /^1\. INTRODUCTION$/i.test(source))).toBe(true);
  expect(sources.some(source => /^ABSTRACT:/.test(source))).toBe(true);
  expect(sources.some(source => /^Figure 4\./.test(source))).toBe(true);
  expect(sources.some(source => /^Methane Gas Cofiring Effects/.test(source))).toBe(false);
  expect(sources.some(source => /Kang-Min Kim, Gyu-Bo Kim/.test(source))).toBe(false);
  expect(sources.some(source => /http:\/\/pubs\.acs\.org|ACS Omega 2021/.test(source))).toBe(false);
  expect(sources.some(source => /^(?:■\s*)?REFERENCES/i.test(source))).toBe(false);
  expect(requests).toBeLessThan(sources.length / 3);

  const pageNumber = page.getByLabel("Page number", { exact: true });
  for (const number of [1, 4, 13]) {
    await pageNumber.fill(String(number)); await pageNumber.press("Enter");
    const surface = page.locator(`[data-pdf-page='${number - 1}']`);
    await expect(surface).toHaveAttribute("data-translated", "true", { timeout: 30_000 });
    const metrics = await surface.evaluate(node => {
      const bounds = node.getBoundingClientRect(), lines = [...node.querySelectorAll<HTMLElement>(".pf-tx-unit[data-kind=body] .pf-tx-line")];
      const counts = new Map<string, number>(); for (const line of lines) counts.set(line.style.fontSize, (counts.get(line.style.fontSize) ?? 0) + 1);
      return { sizes: counts.size, dominant: Math.max(0, ...counts.values()) / Math.max(1, lines.length), outside: lines.filter(line => { const box = line.getBoundingClientRect(); return box.right > bounds.right + 1 || box.bottom > bounds.bottom + 1; }).length };
    });
    // One body size per page; only a paragraph that cannot fit even at 80% may take its own smaller size.
    expect(metrics.sizes).toBeLessThanOrEqual(2);
    expect(metrics.dominant).toBeGreaterThanOrEqual(.8);
    expect(metrics.outside).toBe(0);
    if (process.env.PAPERFLOW_VISUAL_QA) await surface.screenshot({ path: `test-results/translation-v3-page${number}.png` });
  }
  await expect(page.getByText("이어지는 번역")).toHaveCount(0);
  if (process.env.PAPERFLOW_LAYOUT_BENCHMARK === "1") console.log(JSON.stringify({ requests, units: sources.length }));
});
