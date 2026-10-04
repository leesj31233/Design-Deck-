import { test, expect } from "@playwright/test";
import { makePdf } from "../fixtures/make-pdf";

test("delete to the trash, restore, and delete for good", async ({ page }) => {
  page.on("dialog", dialog => void dialog.accept());
  await page.goto("/library");
  await page.getByLabel("Import PDF file").setInputFiles({ name: "Trash candidate.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await expect(page.locator("[data-pdf-page][data-ready=true]").first()).toBeVisible();
  await page.getByLabel("Open Library", { exact: true }).click();
  const cards = page.locator(".pf-paper-list .pf-book-card");
  await expect(cards).toHaveCount(1);

  await page.getByRole("button", { name: "휴지통으로 이동" }).click();
  await expect(cards).toHaveCount(0);
  await page.locator(".pf-sidebar nav button", { hasText: "휴지통" }).click();
  const item = page.locator(".pf-trash-list li");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("30일 뒤 영구 삭제");

  await item.getByRole("button", { name: "복원" }).click();
  await expect(item).toHaveCount(0);
  await page.locator(".pf-sidebar nav button", { hasText: "서재" }).click();
  await expect(cards).toHaveCount(1);

  await page.getByRole("button", { name: "휴지통으로 이동" }).click();
  await page.locator(".pf-sidebar nav button", { hasText: "휴지통" }).click();
  await item.getByRole("button", { name: "영구 삭제" }).click();
  await expect(page.getByText("휴지통이 비어 있습니다")).toBeVisible();
  // Gone for good: not back after a reload.
  await page.reload();
  await expect(page.locator(".pf-paper-list .pf-book-card")).toHaveCount(0);
});
