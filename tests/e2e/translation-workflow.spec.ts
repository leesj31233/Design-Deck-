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
  await expect(page.getByRole("button", { name: "번역 재시도" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: /Workflow/ }).first().click();
  await expect(page.locator("[data-pdf-page='0'] .pf-tx-line").first()).toBeVisible();
  await page.getByRole("button", { name: "텍스트 메모" }).click();
  await page.getByLabel("텍스트 메모 입력").fill("열전달 조건을 재검토할 것");
  await page.getByRole("dialog", { name: "텍스트 메모" }).getByRole("button", { name: "메모 저장" }).click();
  await expect(page.getByRole("dialog", { name: "텍스트 메모" })).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "번역·마킹 PDF 저장" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Workflow-paperflow.pdf");
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  await page.getByLabel("Open Library").click();
  await page.getByRole("button", { name: "노트", exact: true }).click();
  await expect(page.getByText("열전달 조건을 재검토할 것")).toBeVisible();
});
