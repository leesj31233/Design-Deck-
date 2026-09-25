import { test, expect } from "@playwright/test";
import { makePdf } from "../fixtures/make-pdf";
test("mouse drag selection, zoom alignment, archive and source-byte fidelity", async ({ page }, info) => {
  await page.goto("/library");
  const original = makePdf();
  await page.getByLabel("Import PDF file").setInputFiles({ name: "original.pdf", mimeType: "application/pdf", buffer: original });
  await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
  const span = page.locator(".textLayer span").filter({ hasText: "The realizable turbulence model predicts heat flux." });
  const box = (await span.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 12 }); await page.mouse.up();
  await expect(page.getByRole("button", { name: "Highlight selection", exact: true })).toBeVisible();
  await page.keyboard.press("h"); await expect(page.getByTestId("highlight-rect")).toHaveCount(1);
  const normalized = await page.getByTestId("highlight-rect").evaluate(e => (e as HTMLElement).style.cssText);
  await page.getByLabel("Zoom in", { exact: true }).click(); await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
  await expect(page.getByTestId("highlight-rect")).toHaveCount(1);
  expect(await page.getByTestId("highlight-rect").evaluate(e => (e as HTMLElement).style.cssText)).toBe(normalized);
  const timing = await page.evaluate(() => performance.getEntriesByType("measure").filter(e => e.name.startsWith("paperflow:")).map(e => ({ name: e.name, duration: e.duration })));
  await info.attach("interaction-timings", { body: JSON.stringify(timing, null, 2), contentType: "application/json" });
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("paperflow-v1"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const blobs = await new Promise<Blob[]>((resolve, reject) => { const r = db.transaction("blobs").objectStore("blobs").getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const bytes = Array.from(new Uint8Array(await blobs[0].arrayBuffer())); db.close(); return bytes;
  });
  expect(Buffer.from(saved).equals(original)).toBe(true);
  await page.getByLabel("Open Library", { exact: true }).click(); await page.getByLabel("논문 보관", { exact: true }).click();
  await expect(page.locator(".pf-paper-row")).toHaveCount(0);
  await page.getByRole("button", { name: "아카이브", exact: true }).click(); await expect(page.locator(".pf-paper-row")).toHaveCount(1);
  await page.getByLabel("아카이브에서 복원").click(); await expect(page.locator(".pf-paper-row")).toHaveCount(0);
  await page.getByRole("button", { name: "라이브러리", exact: true }).click(); await expect(page.locator(".pf-paper-row")).toHaveCount(1);
});

test("same-page quote recovery works when stored geometry is damaged", async ({ page }, info) => {
  await page.goto("/library"); await page.getByLabel("Import PDF file").setInputFiles({ name: "recovery.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await expect(page.locator("[data-pdf-page][data-ready=true]")).toBeVisible();
  await page.locator(".textLayer").evaluate(layer => { const spans = Array.from(layer.querySelectorAll("span")).filter(s => s.textContent?.trim()); const range = document.createRange(); range.setStart(spans[1].firstChild!, 0); range.setEnd(spans[2].firstChild!, spans[2].textContent!.length); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event("selectionchange")); });
  await page.getByRole("button", { name: "Highlight selection", exact: true }).click(); await expect(page.getByTestId("highlight-rect")).toHaveCount(2);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("paperflow-v1"); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction("annotations", "readwrite"), store = tx.objectStore("annotations"), request = store.getAll(); request.onsuccess = () => { for (const item of request.result) { item.anchor.normalizedRects = []; store.put(item); } }; tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
  });
  await page.reload(); await expect(page.getByTestId("highlight-rect")).toHaveCount(2);
  if (info.project.name === "ipad") await page.getByLabel("Toggle inspector", { exact: true }).click();
  await expect(page.locator(".pf-annotation")).not.toContainText("위치 확인 필요");
});
