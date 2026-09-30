import { test, expect } from "@playwright/test";
import { makePdf } from "../fixtures/make-pdf";
test("1024 and 1366 landscape retain a usable paper viewport", async ({ page }) => {
  for (const viewport of [{ width: 1024, height: 768 }, { width: 1366, height: 1024 }]) {
    await page.setViewportSize(viewport); await page.goto("/library");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel("Import PDF file").setInputFiles({ name: "responsive.pdf", mimeType: "application/pdf", buffer: makePdf() });
    await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await page.locator("[data-pdf-viewport]").boundingBox(); expect(box!.width).toBeGreaterThan(600);
    if (viewport.width === 1024) {
      const buttons = await page.locator(".pf-reader-tools button").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
      expect(buttons.every(height => height >= 44)).toBe(true);
    }
  }
});
