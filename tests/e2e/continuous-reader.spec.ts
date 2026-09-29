import { test, expect } from "@playwright/test";
import { makePdf } from "../fixtures/make-pdf";

test("continuous pages keep translated text and allow annotations on Korean text", async ({ page }) => {
  await page.route("**/api/research", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "이 model은 heat flux를 예측한다.", provider: "OpenAI" }) }));
  await page.goto("/library");
  await page.getByLabel("Import PDF file").setInputFiles({ name: "Engineering reading.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await expect(page.locator("[data-pdf-page='0'][data-ready=true]")).toBeVisible();
  await expect(page.locator("[data-pdf-page='1'][data-ready=true]")).toBeVisible();
  await page.locator("[data-pdf-page='0'] .textLayer span").filter({ hasText: "realizable turbulence" }).click();
  await expect(page.locator("[data-pdf-page='0'] .pf-translated-text")).toContainText("예측한다");
  await page.locator("[data-pdf-page='0'] .pf-inline-line").first().evaluate(line => { const text = line.querySelector("span")?.firstChild; if (!text) return; const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, Math.min(text.textContent?.length ?? 0, 2)); const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event("selectionchange")); });
  await expect(page.getByRole("toolbar", { name: "선택한 원문 작업" })).toBeVisible();
  await page.getByRole("button", { name: "Highlight selection" }).click();
  await expect(page.locator("[data-pdf-page='0'] .pf-translated-marks [data-testid='highlight-rect']")).toHaveCount(1);
  await page.getByLabel("Next page").click();
  await expect(page.getByLabel("Page number")).toHaveValue("2");
  await page.getByLabel("Previous page").click();
  await expect(page.locator("[data-pdf-page='0'] .pf-translated-text")).toContainText("예측한다");
  await page.reload();
  await expect(page.locator("[data-pdf-page='0'] .pf-translated-text")).toContainText("예측한다");
  await expect(page.locator("[data-pdf-page='0'] .pf-translated-marks [data-testid='highlight-rect']")).toHaveCount(1);
});
