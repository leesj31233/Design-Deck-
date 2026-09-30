import { test, expect } from "@playwright/test";

test("real paper keeps Methods distinct and excludes page furniture from batch translation", async ({ page }) => {
  const sample = process.env.PAPERFLOW_LAYOUT_SAMPLE;
  test.skip(!sample, "Set PAPERFLOW_LAYOUT_SAMPLE to a local research PDF for layout QA.");
  const sources: string[] = [];
  await page.route("**/api/research", async route => {
    const body = route.request().postDataJSON();
    if (body.task === "translate_batch") sources.push(...body.sources);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ translations: body.sources.map(() => "공학 연구 문단이다."), provider: "OpenAI" }) });
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
  await page.getByRole("button", { name: "현재 페이지 일괄 번역" }).click();
  await expect(page.locator(".pf-inline-bulk")).toContainText("페이지 번역");
  expect(sources.some(source => /METHODS/i.test(source))).toBe(true);
  expect(sources.some(source => /http:\/\/pubs\.acs\.org|ACS Omega/i.test(source))).toBe(false);
  expect(sources.some(source => /Figure 4\./i.test(source))).toBe(true);
  const translated = page.locator("[data-pdf-page='3'] .pf-translated-text").first();
  await expect(translated).toBeVisible();
  await pageNumber.fill("7"); await pageNumber.press("Enter");
  await expect(page.locator("[data-pdf-page='6'][data-ready=true]")).toBeVisible();
  expect(await page.locator("[data-pdf-page='3'] .pf-translated-text").count()).toBeGreaterThan(0);
  await pageNumber.fill("4"); await pageNumber.press("Enter");
  await expect(translated).toBeVisible();
});
