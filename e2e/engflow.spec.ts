import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const APP = "file://" + path.resolve(__dirname, "../dist/artifact/preview.html");

async function open(page: Page, hash = "") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(APP + hash);
  await expect(page.locator("nav[aria-label='주요 메뉴']").first()).toBeVisible();
  return errors;
}

async function nav(page: Page, label: string) {
  const sidebar = page.locator("aside nav");
  if (await sidebar.isVisible()) await sidebar.getByRole("button", { name: label }).click();
  else if (label === "레벨 테스트") await page.getByRole("button", { name: /레벨 테스트 ·/ }).click();
  else if (label === "설정") await page.getByRole("button", { name: "설정" }).click();
  else await page.locator("nav[aria-label='주요 메뉴']").last().getByRole("button", { name: label }).click();
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("level test gives a qualified CEFR estimate", async ({ page }) => {
  await open(page);
  await nav(page, "레벨 테스트");
  await page.getByRole("button", { name: /기본 테스트/ }).click();
  const progress = page.getByTestId("test-progress");
  for (let i = 0; i < 40; i++) {
    await expect(page.getByText(/작문 기반 회의 영어 추정|^Part \d/).first()).toBeVisible();
    if (await page.getByText(/작문 기반 회의 영어 추정/).isVisible()) break;
    const before = await progress.innerText();
    const radios = page.getByRole("radio");
    if ((await radios.count()) > 0) {
      await radios.first().click();
    } else if (await page.locator("#ef-test-answer").isVisible()) {
      await page.locator("#ef-test-answer").fill("We are still checking the data, so we need more time before we decide.");
    } else {
      const pool = page.locator("[data-chunk='pool']");
      while ((await pool.count()) > 0) await pool.first().click();
    }
    await page.getByRole("button", { name: /^(다음|결과 보기)/ }).click();
    // Wait for the next item (or the report) before answering again.
    await expect(async () => {
      const done = await page.getByText(/작문 기반 회의 영어 추정/).isVisible();
      expect(done || (await progress.innerText()) !== before).toBe(true);
    }).toPass();
    await page.waitForTimeout(260); // let the outgoing item finish its exit transition
  }
  await expect(page.getByText(/작문 기반 회의 영어 추정/)).toBeVisible();
  await expect(page.getByText(/신뢰도/).first()).toBeVisible();
  await expect(page.getByText("평가하지 않음")).toBeVisible();
  await expect(page.getByText(/TOEIC Speaking 참고/)).toBeVisible();
  await expect(page.getByText(/점수 아님/)).toBeVisible();
  await noHorizontalOverflow(page);
});

test("full-sentence lesson: feedback, grammar guide, mistake saved", async ({ page }) => {
  const errors = await open(page);
  await nav(page, "학습");
  await page.getByRole("radio", { name: /^문장 구성/ }).click();
  await page.getByRole("button", { name: /^시작/ }).click();
  await expect(page.locator("textarea#ef-answer")).toBeVisible();
  await page.locator("#ef-answer").fill("If we will decide it now, we must change it later because data different.");
  await page.getByRole("button", { name: /제출/ }).click();
  await expect(page.getByRole("img", { name: /종합/ })).toBeVisible();
  await expect(page.getByText("최소 수정 · 내 표현 유지")).toBeVisible();
  await expect(page.getByText(/추천 문장/)).toBeVisible();
  await expect(page.getByText(/회의 전달력/)).toBeVisible();
  await page.getByRole("button", { name: "왜 틀렸나요?" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("tab", { name: "다른 예문" }).click();
  await page.getByRole("button", { name: "닫기" }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: "세션 종료" }).click();
  await nav(page, "내 실수");
  await expect(page.getByText("If we will decide it now, we must change it later because data different.").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("phrase quiz is keyboard-first (Enter submits, Enter advances)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard flow is a desktop interaction");
  await open(page);
  await nav(page, "학습");
  await page.getByRole("radio", { name: /^구문 퀴즈/ }).click();
  await page.getByRole("button", { name: /^시작/ }).click();
  const input = page.locator("input#ef-answer");
  await expect(input).toBeFocused();
  await page.keyboard.press("Alt+KeyH");
  await expect(page.getByText("문법 패턴")).toBeVisible();
  await input.fill("We are still waiting for the data.");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("img", { name: /종합/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/^2 \/ /)).toBeVisible();
  await expect(page.locator("input#ef-answer")).toBeVisible();
});

test("returning later serves a review with a different sentence", async ({ page }) => {
  await open(page);
  await nav(page, "복습");
  await expect(page.getByText(/가져온 기록/).first()).toBeVisible();
  await nav(page, "설정");
  await page.getByRole("button", { name: "+3일" }).click();
  await expect(page.getByText(/테스트용 시간 이동 중/)).toBeVisible();
  await nav(page, "복습");
  await page.getByRole("button", { name: /^시작/ }).click();
  await expect(page.getByText(/복습 ·/).first()).toBeVisible();
  // The original mistakes ("I think so late", …) are never shown as the review question itself.
  const prompt = await page.locator("main").first().innerText();
  expect(prompt).not.toContain("I think so late");
  await page.locator("#ef-answer").fill("It's too early to decide.");
  await page.getByRole("button", { name: /제출/ }).click();
  await expect(page.getByText(/복습 목록에 추가|복습 불필요/)).toBeVisible();
  await page.getByRole("button", { name: "세션 종료" }).click();
  await nav(page, "설정");
  await page.getByRole("button", { name: /실제 시간으로/ }).click();
});

test("progress and every screen fit the viewport", async ({ page }) => {
  const errors = await open(page);
  for (const label of ["오늘", "학습", "복습", "내 실수", "레벨 테스트", "진도", "설정"]) {
    await nav(page, label);
    await page.waitForTimeout(150);
    await noHorizontalOverflow(page);
  }
  await nav(page, "진도");
  await expect(page.getByRole("heading", { name: "문법별 숙련도", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /최근 12주/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("navigation adapts: bottom tabs on phones, sidebar on desktop", async ({ page }, info) => {
  await open(page);
  const sidebar = page.locator("aside nav[aria-label='주요 메뉴']");
  if (info.project.name === "desktop") await expect(sidebar).toBeVisible();
  else {
    await expect(sidebar).toHaveCount(0);
    await expect(page.locator("nav[aria-label='주요 메뉴']").last()).toBeVisible();
  }
});
