import { test, expect, type Page } from "@playwright/test";
import { makePdf } from "../fixtures/make-pdf";
import path from "node:path";
const screenshots = process.env.PAPERFLOW_SCREENSHOTS || "test-results/screenshots";
async function importFixture(page: Page) {
  await page.goto("/library");
  await page.getByLabel("Import PDF file").setInputFiles({ name: "Engineering reading.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
}
async function selectLines(page: Page, from = 1, to = 2) {
  await page.locator(".textLayer").evaluate((layer, { from, to }) => {
    const spans = Array.from(layer.querySelectorAll("span")).filter(s => s.textContent?.trim());
    const start = spans[from].firstChild!, end = spans[to].firstChild!;
    const range = document.createRange(); range.setStart(start, 0); range.setEnd(end, end.textContent!.length);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  }, { from, to });
  await expect(page.getByRole("toolbar", { name: "선택한 원문 작업" })).toBeVisible();
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }

test("import → select multiline → highlight → note → reload → inspect original", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/library"); await noOverflow(page);
  await page.screenshot({ path: path.join(screenshots, `${info.project.name}-library.png`), fullPage: true });
  await importFixture(page); await noOverflow(page);
  await selectLines(page);
  const bar = await page.locator(".pf-selection-bar").boundingBox(); expect(bar!.x).toBeGreaterThanOrEqual(0); expect(bar!.x + bar!.width).toBeLessThanOrEqual(info.project.use.viewport!.width);
  await page.getByRole("button", { name: "Highlight selection", exact: true }).click();
  await expect(page.getByTestId("highlight-rect")).toHaveCount(2);
  const geometry = await page.getByTestId("highlight-rect").evaluateAll(elements => elements.map(e => (e as HTMLElement).style.cssText));
  if (info.project.name === "ipad") await page.getByLabel("Toggle inspector", { exact: true }).click();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page.getByLabel("원문 메모").fill("모델 가정과 heat flux의 관계를 검토할 것.");
  await page.getByRole("button", { name: "메모 저장", exact: true }).click();
  await expect(page.locator(".pf-saved-note")).toContainText("heat flux");
  await page.reload(); await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
  await expect(page.getByTestId("highlight-rect")).toHaveCount(2);
  expect(await page.getByTestId("highlight-rect").evaluateAll(elements => elements.map(e => (e as HTMLElement).style.cssText))).toEqual(geometry);
  if (info.project.name === "ipad") await page.getByLabel("Toggle inspector", { exact: true }).click();
  await expect(page.locator(".pf-saved-note")).toContainText("heat flux");
  await page.getByLabel("Next page", { exact: true }).click(); await expect(page.locator("[data-pdf-page='1'][data-ready=true]")).toBeVisible();
  await expect(page.getByTestId("highlight-rect")).toHaveCount(0);
  await page.getByLabel("Inspect yellow highlight on page 1").click(); await expect(page.locator("[data-pdf-page='0'][data-ready=true]")).toBeVisible();
  await expect(page.getByTestId("highlight-rect")).toHaveCount(2);
  await page.screenshot({ path: path.join(screenshots, `${info.project.name}-reader.png`), fullPage: true });
  await page.getByLabel("Toggle inspector", { exact: true }).click(); await expect(page.locator(".pf-inspector")).toHaveCount(0);
  await page.getByLabel("Toggle inspector", { exact: true }).click();
  await page.keyboard.press("Control+k"); await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByPlaceholder("명령 검색…").fill("Fit Page"); await page.keyboard.press("Enter"); await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByLabel("Toggle theme", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-pf-theme", "dark");
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  expect(await page.locator(".pf-pdf-page").evaluate(e => getComputedStyle(e).backgroundColor)).toBe("rgb(255, 255, 255)");
  await page.screenshot({ path: path.join(screenshots, `${info.project.name}-dark.png`), fullPage: true });
  await noOverflow(page); await page.reload(); await expect(page.locator("html")).toHaveAttribute("data-pf-theme", "dark");
  await page.getByLabel("Open Library", { exact: true }).click(); await expect(page.locator(".pf-paper-row")).toHaveCount(1);
  await page.getByLabel("Import PDF file").setInputFiles({ name: "renamed.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
  await page.getByLabel("Open Library", { exact: true }).click(); await expect(page.locator(".pf-paper-row")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("invalid import, keyboard commands and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/library");
  await page.getByLabel("Import PDF file").setInputFiles({ name: "invalid.pdf", mimeType: "application/pdf", buffer: Buffer.from("bad") });
  await expect(page.getByRole("status")).toContainText("올바른 PDF");
  await page.keyboard.press("Control+k"); await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("option", { name: /Next Page/ })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByLabel("논문 검색", { exact: true }).fill("hnet"); await expect(page.getByLabel("논문 검색", { exact: true })).toHaveValue("hnet");
  expect(await page.getByRole("button", { name: "PDF 가져오기", exact: true }).evaluate(e => getComputedStyle(e).transitionDuration)).toBe("0s");
});

test("real local research PDF preserves source and annotations", async ({ page }, info) => {
  test.skip(!process.env.PAPERFLOW_REAL_PDF, "Set PAPERFLOW_REAL_PDF to test a local research file without committing it.");
  await page.goto("/library"); await page.getByLabel("Import PDF file").setInputFiles(process.env.PAPERFLOW_REAL_PDF!);
  await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
  await selectLines(page, 2, 3); await page.getByRole("button", { name: "Highlight selection", exact: true }).click();
  await expect(page.getByTestId("highlight-rect").first()).toBeVisible();
  await page.reload(); await expect(page.getByTestId("highlight-rect").first()).toBeVisible();
  await page.screenshot({ path: path.join(screenshots, `${info.project.name}-real-paper.png`), fullPage: true });
  const timing = await page.evaluate(() => performance.getEntriesByType("measure").filter(e => e.name.startsWith("paperflow:")).map(e => ({ name: e.name, duration: e.duration })));
  await info.attach("timings", { body: JSON.stringify(timing, null, 2), contentType: "application/json" });
});
