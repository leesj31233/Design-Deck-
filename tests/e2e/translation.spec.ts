import { test, expect } from "@playwright/test";
import { makePdf } from "../fixtures/make-pdf";

test("paragraph click translates, caches after reload, and real page previews render", async ({ page }) => {
  let requests = 0;
  await page.route("https://api.mymemory.translated.net/get?**", async route => {
    requests++;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ responseStatus: 200, responseData: { translatedText: "공학 문단을 번역했습니다. ZZZTERM0ZZZ" } }) });
  });
  await page.goto("/library");
  await page.getByLabel("Import PDF file").setInputFiles({ name: "Engineering reading.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
  await expect.poll(() => page.locator(".pf-page-tile canvas").first().evaluate(canvas => (canvas as HTMLCanvasElement).width)).toBeGreaterThan(0);
  await page.locator(".textLayer span").filter({ hasText: "realizable turbulence" }).click();
  await expect(page.locator(".pf-translated-text")).toContainText("공학 문단을 번역했습니다.");
  expect(await page.locator(".pf-translated-text").innerText()).not.toContain("ZZZTERM0ZZZ");
  const beforeReload = requests;
  await page.reload(); await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
  await page.locator(".textLayer span").filter({ hasText: "realizable turbulence" }).click();
  await expect(page.locator(".pf-translated-text")).toContainText("공학 문단을 번역했습니다.");
  expect(requests).toBe(beforeReload);
  await page.getByRole("button", { name: "현재 페이지 일괄 번역" }).click();
  await expect(page.locator(".pf-batch-section progress")).toBeVisible();
  await expect(page.locator(".pf-batch-section")).toContainText(/\d+\/\d+/);
});

test("optional live English-to-Korean translation smoke check", async ({ page }) => {
  test.skip(process.env.PAPERFLOW_TRANSLATION_LIVE !== "1", "Requires the public translation service; CI uses deterministic mocks.");
  await page.goto("/library");
  await page.getByLabel("Import PDF file").setInputFiles({ name: "Engineering reading.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
  const start = Date.now();
  await page.locator(".textLayer span").filter({ hasText: "realizable turbulence" }).click();
  await expect(page.locator(".pf-translated-text")).toContainText(/[가-힣]/, { timeout: 15_000 });
  console.log(`Live paragraph translation: ${Date.now() - start} ms`);
});
