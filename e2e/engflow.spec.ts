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
  await page.getByRole("button", { name: "문장 말하기", exact: true }).click();
  await page.getByRole("button", { name: /^시작/ }).click();
  await expect(page.locator("textarea#ef-answer")).toBeVisible();
  await page.locator("#ef-answer").fill("If we will decide it now, we must change it later because data different.");
  await page.getByRole("button", { name: /제출/ }).click();
  await expect(page.getByRole("img", { name: /종합/ })).toBeVisible();
  await expect(page.getByText("최소 수정 · 내 표현 유지")).toBeVisible();
  await expect(page.getByText("원어민이 회의에서 자주 쓰는 표현")).toBeVisible();
  await expect(page.getByText(/회의 전달력/)).toBeVisible();
  await page.getByRole("button", { name: "왜 틀렸나요?" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("tab", { name: "다른 예문" }).click();
  await page.getByRole("button", { name: "닫기" }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: "세션 종료" }).click();
  await nav(page, "표현 노트");
  await expect(page.getByText("If we will decide it now, we must change it later because data different.").first()).toBeVisible();
  expect(errors).toEqual([]);
});

/** A stand-in for the artifact runtime: no storage, and a "sample" capability that grades after `delay` ms and counts calls. */
async function fakeClaude(page: Page, delay: number) {
  await page.addInitScript((ms) => {
    const grade = {
      meaning: 95,
      comprehensibility: 90,
      errors: [{ span: "are", fix: "has", category: "tense", severity: "major", explanationKo: "바뀐 결과가 지금 영향을 주므로 현재완료 has changed를 씁니다.", skill: "present-perfect" }],
      corrected: "We have to run it again because the composition has changed.",
      recommended: "We need to rerun it because the composition has changed.",
    };
    const w = window as unknown as { claude: unknown; __claudeCalls: number };
    w.__claudeCalls = 0;
    const sample = Object.assign(async () => ({ text: "" }), {
      json: (_p: string, opts?: { signal?: AbortSignal }) =>
        new Promise((resolve, reject) => {
          w.__claudeCalls++;
          const t = setTimeout(() => resolve(grade), ms);
          opts?.signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        }),
    });
    w.claude = { use: async (name: string) => (name === "sample" ? sample : null) };
  }, delay);
}

const WRONG = "We have to run it again because the composition are changed.";

async function startSentenceLesson(page: Page) {
  await nav(page, "학습");
  await page.getByRole("button", { name: "문장 말하기", exact: true }).click();
  await page.getByRole("button", { name: /^시작/ }).click();
  await expect(page.locator("textarea#ef-answer")).toBeVisible();
}

test("fast grading: Claude's grade appears within about a second, once, and never changes", async ({ page }) => {
  await fakeClaude(page, 400);
  const errors = await open(page);
  await startSentenceLesson(page);
  await page.locator("#ef-answer").fill(WRONG);
  const t0 = Date.now();
  await page.getByRole("button", { name: /제출/ }).click();
  await expect(page.getByText(/Claude 채점/)).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(1500);
  const ring = page.getByRole("img", { name: /종합/ });
  const first = await ring.getAttribute("aria-label");
  await page.waitForTimeout(1200);
  expect(await ring.getAttribute("aria-label")).toBe(first);
  await expect(page.getByText(/Claude 채점 · 0\.\d초/)).toBeVisible();
  await expect(page.getByText("원어민이 회의에서 자주 쓰는 표현")).toBeVisible();
  await expect(page.getByText("We need to rerun it because the composition has changed.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a slow Claude never blocks: after 1 second the rule-based grade stands, and stays", async ({ page }) => {
  await fakeClaude(page, 60_000);
  await open(page);
  await startSentenceLesson(page);
  await page.locator("#ef-answer").fill(WRONG);
  const t0 = Date.now();
  await page.getByRole("button", { name: /제출/ }).click();
  await expect(page.getByText(/규칙 기반 · \d\.\d초/)).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(2000);
  await expect(page.getByText(/1초 안에 Claude 응답이 없어 규칙 기반으로 채점했습니다/)).toBeVisible();
  const ring = page.getByRole("img", { name: /종합/ });
  const first = await ring.getAttribute("aria-label");
  await page.waitForTimeout(1000);
  expect(await ring.getAttribute("aria-label")).toBe(first);
  await expect(page.getByText(/Claude 채점/)).toHaveCount(0);
});

test("grading starts while typing: submitting after a pause shows Claude's grade at once", async ({ page }) => {
  await fakeClaude(page, 1200);
  await open(page);
  await startSentenceLesson(page);
  await page.locator("#ef-answer").fill(WRONG);
  await page.waitForTimeout(1900); // the pause: background grading starts and finishes
  const t0 = Date.now();
  await page.getByRole("button", { name: /제출/ }).click();
  await expect(page.getByText(/Claude 채점 · 0\.[0-4]초/)).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(800);
  expect(await page.evaluate(() => (window as unknown as { __claudeCalls: number }).__claudeCalls)).toBe(1);
});

test("with a longer wait chosen in Settings, the learner can still skip to the rule-based grade", async ({ page }) => {
  await fakeClaude(page, 60_000);
  await open(page);
  await nav(page, "설정");
  await page.getByRole("radiogroup", { name: "채점 대기 시간" }).getByRole("radio", { name: "3초" }).click();
  await startSentenceLesson(page);
  await page.locator("#ef-answer").fill(WRONG);
  await page.getByRole("button", { name: /제출/ }).click();
  await page.getByRole("button", { name: /기다리지 않고 바로 보기/ }).click();
  await expect(page.getByText(/기다리지 않고 규칙 기반으로 채점했습니다/)).toBeVisible();
});

test("scene + difficulty: a meal conversation at difficulty 3 shows the chat and my turn", async ({ page }) => {
  const errors = await open(page);
  await nav(page, "학습");
  await page.getByRole("radio", { name: /^식사·회식/ }).click();
  await page.getByRole("radio", { name: "난이도 3" }).click();
  await expect(page.getByText(/^3 · /)).toBeVisible();
  await page.getByRole("button", { name: /^시작/ }).click();
  await expect(page.getByRole("list", { name: "대화" })).toBeVisible();
  await expect(page.getByText("나 · 이렇게 말하고 싶어요")).toBeVisible();
  await expect(page.getByText("식사·회식").first()).toBeVisible();
  const chip = await page.getByLabel(/^난이도 \d+\/10$/).first().getAttribute("aria-label");
  expect(Math.abs(Number(chip!.match(/\d+/)![0]) - 3)).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: "세션 종료" }).click();
  // The scene remembers its difficulty.
  await expect(page.getByRole("radio", { name: /^식사·회식/ })).toContainText("난이도 3");
  expect(errors).toEqual([]);
});

test("expression notebook: study an expression step by step, then speak it", async ({ page }) => {
  const errors = await open(page);
  await nav(page, "표현 노트");
  await expect(page.getByText("내가 자주 틀리는 표현")).toBeVisible();
  await page.getByRole("button", { name: /It's too early to decide\. 학습하기/ }).click();
  await expect(page.getByText("내가 틀린 문장")).toBeVisible();
  await expect(page.getByText(/I think so late/).first()).toBeVisible();
  await page.getByRole("button", { name: /다음: 규칙·비교/ }).click();
  await expect(page.getByText("비슷한 표현 비교")).toBeVisible();
  await page.getByRole("button", { name: /다음: 확인 퀴즈/ }).click();
  await expect(page.getByText("어느 쪽이 자연스러울까요?")).toBeVisible();
  await page.getByRole("radio").first().click();
  await expect(page.getByText(/맞았습니다|다시 보세요/)).toBeVisible();
  await page.getByRole("button", { name: /1\. 내 실수/ }).click();
  await page.getByRole("button", { name: /4\. 말해 보기/ }).click();
  await page.getByRole("button", { name: /대화 연습 시작/ }).first().click();
  await expect(page.locator("#ef-answer")).toBeVisible();
  expect(errors).toEqual([]);
});

test("phrase quiz is keyboard-first (Enter submits, Enter advances)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard flow is a desktop interaction");
  await open(page);
  await nav(page, "학습");
  await page.getByRole("button", { name: "짧은 표현", exact: true }).click();
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
  for (const label of ["오늘", "학습", "복습", "표현 노트", "레벨 테스트", "진도", "설정"]) {
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
