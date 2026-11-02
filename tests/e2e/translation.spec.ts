import { test, expect } from "@playwright/test";
import { makePdf } from "../fixtures/make-pdf";
import { mockResearch } from "./mock-research";

test("paragraph click translates, caches after reload, and real page previews render", async ({ page }) => {
  let requests = 0;
  await mockResearch(page, "공학 문단을 번역했다. realizable turbulence", () => { requests++; });
  await page.goto("/library");
  await page.getByLabel("Import PDF file").setInputFiles({ name: "Engineering reading.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await expect(page.locator("[data-pdf-page][data-ready=true]").first()).toBeVisible();
  await expect.poll(() => page.locator(".pf-page-tile canvas").first().evaluate(canvas => (canvas as HTMLCanvasElement).width)).toBeGreaterThan(0);
  await page.locator(".textLayer span").filter({ hasText: "realizable turbulence" }).click();
  await expect(page.locator(".pf-pdf-page .pf-tx-line").first()).toContainText("공학 문단을 번역했다.");
  const beforeReload = requests;
  await page.reload(); await expect(page.locator("[data-pdf-page][data-ready=true]").first()).toBeVisible();
  await expect(page.locator(".pf-pdf-page .pf-tx-line").first()).toContainText("공학 문단을 번역했다.");
  await expect(page.getByText("이어지는 번역")).toHaveCount(0);
  expect(requests).toBe(beforeReload);
  await page.getByRole("button", { name: "원문 보기", exact: true }).click();
  await expect(page.locator(".pf-tx-line")).toHaveCount(0);
  await page.getByRole("button", { name: "한국어 보기", exact: true }).click();
  await expect(page.locator(".pf-pdf-page .pf-tx-line").first()).toBeVisible();
  await page.getByLabel("Zoom in", { exact: true }).click();
  await expect(page.locator("[data-pdf-page][data-ready=true]").first()).toBeVisible();
  await expect(page.locator(".pf-pdf-page .pf-tx-line").first()).toBeVisible();
  expect(requests).toBe(beforeReload);
  await page.getByRole("button", { name: "논문 전체 일괄 번역" }).click();
  await expect(page.locator(".pf-batch .pf-batch-track")).toBeVisible();
  await expect(page.locator(".pf-batch")).toContainText(/\d+ \/ \d+|\d+문단/);
});

test("optional live English-to-Korean translation smoke check", async ({ page }) => {
  test.skip(process.env.PAPERFLOW_TRANSLATION_LIVE !== "1", "Requires the public translation service; CI uses deterministic mocks.");
  await page.goto("/library");
  await page.getByLabel("Import PDF file").setInputFiles({ name: "Engineering reading.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await expect(page.locator("[data-pdf-page][data-ready=true]").first()).toBeVisible();
  const start = Date.now();
  await page.locator(".textLayer span").filter({ hasText: "realizable turbulence" }).click();
  await expect(page.locator(".pf-tx-line").first()).toContainText(/[가-힣]/, { timeout: 15_000 });
  console.log(`Live paragraph translation: ${Date.now() - start} ms`);
});

test("whole-paper translation batches paragraphs with short ids and reports completion", async ({ page }) => {
  let batches = 0;
  const ids: string[] = [];
  await mockResearch(page, "공학 연구 문단을 번역하였다.", passages => { batches++; ids.push(...passages.map(item => item.id)); });
  await page.goto("/library");
  await page.getByLabel("Import PDF file").setInputFiles({ name: "Batch.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await expect(page.locator("[data-pdf-page][data-ready=true]").first()).toBeVisible();
  await page.getByRole("button", { name: "논문 전체 일괄 번역" }).click();
  await expect(page.locator(".pf-batch")).toContainText("번역 완료!");
  await expect(page.locator(".pf-batch")).not.toContainText("실패");
  await expect(page.locator(".pf-pdf-page .pf-tx-line").first()).toBeVisible();
  expect(batches).toBeGreaterThan(0);
  // Short wire ids, never the 32-character hashes models used to mangle.
  expect(ids.every(id => /^p\d+$/.test(id))).toBe(true);
});

