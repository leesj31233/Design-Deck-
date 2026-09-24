import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { makePdf } from "../fixtures/make-pdf";
test("Library, Reader and command dialog pass automated WCAG AA checks", async ({ page }) => {
  await page.goto("/library");
  const audit = () => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect((await audit()).violations).toEqual([]);
  await page.getByLabel("Import PDF file").setInputFiles({ name: "accessible.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
  expect((await audit()).violations).toEqual([]);
  await page.getByLabel("Open command menu", { exact: true }).focus();
  await page.keyboard.press("Enter"); await expect(page.getByRole("dialog")).toBeVisible();
  expect((await audit()).violations).toEqual([]);
  await page.keyboard.press("Escape"); await expect(page.getByLabel("Open command menu", { exact: true })).toBeFocused();
  await page.getByLabel("Toggle theme", { exact: true }).click();
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  expect((await audit()).violations).toEqual([]);
});
