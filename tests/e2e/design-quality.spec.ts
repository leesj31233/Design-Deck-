import { test, expect } from "@playwright/test";
import { makePdf } from "../fixtures/make-pdf";
import path from "node:path";

test("compiled design, real cover shelf, zoom control and readable highlight composition", async ({ page }, info) => {
  await page.goto("/library");
  // A missing PostCSS config used to leave visible native inputs and grey buttons.
  expect(await page.getByLabel("Import PDF file").evaluate(element => ({ width: getComputedStyle(element).width, position: getComputedStyle(element).position, clip: getComputedStyle(element).clipPath }))).toEqual({ width: "1px", position: "absolute", clip: "inset(50%)" });
  expect(await page.getByRole("button", { name: "PDF 가져오기", exact: true }).evaluate(element => getComputedStyle(element).display)).toMatch(/^(inline-)?flex$/);
  expect(await page.locator(".pf-sidebar nav").evaluate(element => getComputedStyle(element).flexDirection)).toBe("column");
  await page.getByLabel("Import PDF file").setInputFiles({ name: "Collected research.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
  await page.getByLabel("확대 비율", { exact: true }).focus();
  await page.keyboard.press("End");
  await expect(page.getByLabel("확대 비율", { exact: true })).toHaveValue("250");
  await page.getByRole("button", { name: "맞춤", exact: true }).click();
  await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
  await page.locator(".textLayer").evaluate(layer => {
    const span = Array.from(layer.querySelectorAll("span")).find(item => item.textContent?.includes("turbulence"))!;
    const range = document.createRange(); range.selectNodeContents(span);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Highlight selection", exact: true }).click();
  await expect(page.getByTestId("highlight-rect")).toHaveCount(1);
  expect(await page.locator(".pf-highlight-layer").evaluate(element => getComputedStyle(element).mixBlendMode)).toBe("multiply");
  expect(await page.getByTestId("highlight-rect").evaluate(element => getComputedStyle(element).mixBlendMode)).toBe("normal");
  await page.getByLabel("Open Library", { exact: true }).click();
  await expect(page.locator(".pf-paper-list .pf-book-cover[data-cover-ready=true] img")).toBeVisible();
  expect(await page.locator(".pf-paper-list img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
  await page.getByRole("button", { name: "목록", exact: true }).click();
  await expect(page.locator(".pf-paper-list")).toHaveAttribute("data-layout", "list");
  await page.getByRole("button", { name: "서가", exact: true }).click();
  await expect(page.locator(".pf-paper-list")).toHaveAttribute("data-layout", "shelf");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(process.env.PAPERFLOW_SCREENSHOTS ?? "test-results/screenshots", `${info.project.name}-collection.png`), fullPage: true });
});
