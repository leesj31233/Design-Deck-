import { test, expect } from "@playwright/test";

test("real paper keeps Methods distinct and excludes page furniture from batch translation", async ({ page }) => {
  if (process.env.PAPERFLOW_VISUAL_QA) test.setTimeout(360_000);
  const sample = process.env.PAPERFLOW_LAYOUT_SAMPLE;
  test.skip(!sample, "Set PAPERFLOW_LAYOUT_SAMPLE to a local research PDF for layout QA.");
  const sources: string[] = [];
  let requests = 0;
  await page.route("**/api/research", async route => {
    const body = route.request().postDataJSON();
    if (body.task === "translate_blocks") { requests++; sources.push(...body.passages.map((item: { text: string }) => item.text)); }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ translations: body.passages.map((item: { id: string; text: string }) => ({ id: item.id, text: process.env.PAPERFLOW_VISUAL_QA ? "보일러의 열전달과 연소 특성을 분석하였다. ".repeat(Math.max(1, Math.round(item.text.length / 40))).trim() : "공학 연구 문단이다." })), provider: "OpenAI" }) });
  });
  await page.goto("/library");
  await page.getByLabel("Import PDF file").setInputFiles(sample!);
  await expect(page.locator("[data-pdf-page='0'][data-ready=true]")).toBeVisible();
  const pageNumber = page.getByLabel("Page number", { exact: true });
  await pageNumber.fill("4");
  await pageNumber.press("Enter");
  await expect(page.locator("[data-pdf-page='3'][data-ready=true]")).toBeVisible();
  const methods = page.locator("[data-pdf-page='3'] .textLayer span").filter({ hasText: /METHODS/i }).first();
  await expect(methods).toHaveAttribute("data-pf-kind", "title");
  await page.getByRole("button", { name: "논문 전체 일괄 번역" }).click();
  await expect(page.locator(".pf-inline-bulk")).toContainText("논문 전체 번역");
  await expect(page.locator(".pf-inline-bulk")).toContainText("15/15페이지", { timeout: 120_000 });
  expect(sources.some(source => /METHODS/i.test(source))).toBe(true);
  expect(sources.some(source => /Methane Gas Cofiring Effects/i.test(source))).toBe(true);
  expect(sources.some(source => /Kang-Min Kim, Gyu-Bo Kim/i.test(source))).toBe(false);
  expect(sources.some(source => /^AUTHOR INFORMATION/i.test(source))).toBe(false);
  expect(sources.some(source => /http:\/\/pubs\.acs\.org|ACS Omega/i.test(source))).toBe(false);
  expect(sources.some(source => /Figure 4\./i.test(source))).toBe(true);
  expect(requests).toBeLessThan(sources.length / 3);
  if (process.env.PAPERFLOW_LAYOUT_BENCHMARK === "1") console.log(JSON.stringify({ requests, translatedBlocks: sources.length, pages: 15 }));
  const translated = page.locator("[data-pdf-page='3'] .pf-translated-text").first();
  await expect(translated).toBeVisible();
  if (process.env.PAPERFLOW_VISUAL_QA) await page.screenshot({ path: "test-results/translation-v2-page4.png" });
  await pageNumber.fill("7"); await pageNumber.press("Enter");
  await expect(page.locator("[data-pdf-page='6'][data-ready=true]")).toBeVisible();
  expect(await page.locator("[data-pdf-page='3'] .pf-translated-text").count()).toBeGreaterThan(0);
  await pageNumber.fill("4"); await pageNumber.press("Enter");
  await expect(translated).toBeVisible();
  await pageNumber.fill("13"); await pageNumber.press("Enter");
  await expect(page.locator("[data-pdf-page='12'][data-ready=true]")).toBeVisible();
  await expect(page.locator("[data-pdf-page='12'] .pf-translated-text").first()).toBeVisible();
  await expect(page.locator(".pf-inline-overflow")).toHaveCount(0);
  if (process.env.PAPERFLOW_VISUAL_QA) {
    await page.locator("[data-pdf-page='12']").scrollIntoViewIfNeeded();
    await page.locator("[data-pdf-page='12']").screenshot({ path: "test-results/translation-v2-page13.png", timeout: 30000 });
  }
});

