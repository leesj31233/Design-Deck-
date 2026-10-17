import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { makePdf } from "../fixtures/make-pdf";
import { mockResearch } from "./mock-research";

test("library pretranslation, page memo, and annotated PDF export", async ({ page }) => {
  await mockResearch(page, "공학 연구의 결과를 확인하였다.");
  await page.goto("/library");
  await page.getByLabel("Import PDF file").setInputFiles({ name: "Workflow.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await expect(page.locator("[data-pdf-page='0'][data-ready=true]")).toBeVisible();
  await page.getByLabel("Open Library").click();
  await page.getByRole("button", { name: "전체 번역", exact: true }).click();
  await expect(page.getByRole("button", { name: /번역 완료|번역 \d+%/})).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: /Workflow/ }).first().click();
  await expect(page.locator("[data-pdf-page='0'] .pf-tx-line").first()).toBeVisible();
  await page.getByRole("button", { name: "텍스트 메모", exact: true }).click();
  { const surface = page.locator("[data-pdf-page='0']"), at = (await surface.boundingBox())!;
    await page.mouse.move(at.x + at.width * .5, at.y + at.height * .08); await page.mouse.down(); await page.mouse.up();
    await page.getByLabel("텍스트 메모", { exact: true }).fill("열전달 조건을 재검토할 것");
    await page.mouse.move(at.x + at.width * .1, at.y + at.height * .5); await page.mouse.down(); await page.mouse.up(); }
  await page.getByRole("button", { name: "선택", exact: true }).click();
  await expect(page.locator(".pf-memo", { hasText: "열전달 조건을 재검토할 것" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "번역·마킹 PDF 저장" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Workflow-paperflow.pdf");
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  await page.getByLabel("Open Library").click();
  await page.getByRole("button", { name: "노트", exact: true }).click();
  await expect(page.getByText("열전달 조건을 재검토할 것").first()).toBeVisible();
});
