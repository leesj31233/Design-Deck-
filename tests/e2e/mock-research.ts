import type { Page } from "@playwright/test";

/** Deterministic stand-in for /api/research: every passage comes back in Korean under its own id. */
export async function mockResearch(page: Page, text: string | ((source: string) => string), onBlocks?: (passages: { id: string; text: string; role?: string }[]) => void) {
  await page.route("**/api/research", async route => {
    const body = route.request().postDataJSON();
    if (body.task === "translate_blocks") {
      onBlocks?.(body.passages);
      const translations = body.passages.map((item: { id: string; text: string }) => ({ id: item.id, text: typeof text === "function" ? text(item.text) : text }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ translations, missing: [], provider: "OpenAI", usage: { input: 10, output: 10 } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "원문 근거: model과 heat flux가 함께 언급된다.", provider: "OpenAI" }) });
  });
}
