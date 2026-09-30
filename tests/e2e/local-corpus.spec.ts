import { test, expect } from "@playwright/test";
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const roots = (process.env.PAPERFLOW_CORPUS_DIRS ?? "").split("|").filter(Boolean);
const files = roots.flatMap(root => readdirSync(root, { recursive: true }).map(name => path.join(root, String(name))).filter(name => /\.pdf$/i.test(name)));
const results: { filename: string; pages: number; selectableSpans: number; markedAndRestored: boolean; renderMs: number[]; status: string }[] = [];
for (const filename of files) test(`local corpus: ${path.basename(filename)}`, async ({ page }) => {
  await page.goto("/library"); await page.getByLabel("Import PDF file").setInputFiles(filename);
  await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
  const pages = Number(await page.getByLabel("Page number", { exact: true }).getAttribute("max"));
  if (pages > 1) { await page.getByLabel("Next page", { exact: true }).click(); await expect(page.locator("[data-pdf-page='1'][data-ready=true]")).toBeVisible(); }
  const count = await page.locator(".textLayer span").count();
  let markedAndRestored = false;
  if (count) {
    await page.locator(".textLayer").evaluate(layer => { const spans = Array.from(layer.querySelectorAll("span")).filter(span => (span.textContent?.trim().length ?? 0) > 8); if (!spans.length) return; const span = spans[0]; span.scrollIntoView({ block: "center" }); const range = document.createRange(); range.selectNodeContents(span); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event("selectionchange")); });
    await expect(page.getByRole("button", { name: "Highlight selection", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Highlight selection", exact: true }).click(); await expect(page.getByTestId("highlight-rect").first()).toBeVisible();
    await page.reload(); await expect(page.getByTestId("highlight-rect").first()).toBeVisible();
    markedAndRestored = true;
  }
  const renderMs = await page.evaluate(() => performance.getEntriesByName("paperflow:page-render").map(entry => entry.duration));
  results.push({ filename: path.basename(filename), pages, selectableSpans: count, markedAndRestored, renderMs, status: "PASS" });
  if (process.env.PAPERFLOW_SCREENSHOTS && /ao1c04574|S0378382021000837/.test(filename)) await page.screenshot({ path: path.join(process.env.PAPERFLOW_SCREENSHOTS, `${path.basename(filename, ".pdf")}-reader.png`) });
});
test.afterAll(() => { if (process.env.PAPERFLOW_CORPUS_REPORT && results.length) writeFileSync(process.env.PAPERFLOW_CORPUS_REPORT, JSON.stringify(results, null, 2)); });
