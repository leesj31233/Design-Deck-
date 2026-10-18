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
      // A test of how the learner would say it: no English-order chunks on the screen.
      await expect(page.getByRole("list", { name: /말하는 순서 힌트/ })).toHaveCount(0);
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
  // The evidence: one grading sheet per answered item, each opening to the answer and how it was graded.
  const sheets = page.getByTestId("answer-sheets");
  await expect(sheets.getByText(/문항별 채점지/)).toBeVisible();
  await sheets.locator("li button[aria-expanded]").first().click();
  await expect(sheets.getByText("내 답").first()).toBeVisible();
  await noHorizontalOverflow(page);
});

test("full-sentence lesson: feedback, grammar guide, mistake saved", async ({ page }) => {
  const errors = await open(page);
  await nav(page, "학습");
  await page.getByRole("button", { name: "문장 말하기", exact: true }).click();
  await page.getByRole("button", { name: /^시작/ }).click();
  await expect(page.locator("textarea#ef-answer")).toBeVisible();
  // The English speaking order is a hint the learner opens, not shown up front.
  const chunks = page.getByRole("list", { name: /말하는 순서 힌트/ });
  await expect(chunks).toHaveCount(0);
  await page.getByRole("button", { name: /말하는 순서 힌트 보기/ }).click();
  await expect(chunks).toBeVisible();
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
  // Back to the question just answered: it is asked again as practice, and the first answer stays the record.
  await page.getByRole("button", { name: "이전 문제" }).click();
  await expect(page.getByTestId("revisit-badge")).toBeVisible();
  await expect(page.locator("#ef-answer")).toHaveValue("");
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

test("reworded answers wait for Claude instead of a rule-based guess", async ({ page }) => {
  await fakeClaude(page, 2500);
  const errors = await open(page);
  await startSentenceLesson(page);
  await page.locator("#ef-answer").fill(WRONG);
  await page.getByRole("button", { name: /제출/ }).click();
  await expect(page.getByText("표현이 기준 답안과 달라 Claude가 문법을 확인하고 있습니다.")).toBeVisible();
  await expect(page.getByText(/Claude 채점 · \d\.\d초/)).toBeVisible({ timeout: 6000 });
  await expect(page.getByText(/규칙 기반 · /)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("'always 1 second' in Settings: a slow Claude never blocks, and the rule-based grade stays", async ({ page }) => {
  await fakeClaude(page, 60_000);
  await open(page);
  await nav(page, "설정");
  await page.getByRole("radiogroup", { name: "채점 대기 시간" }).getByRole("radio", { name: "항상 1초" }).click();
  await startSentenceLesson(page);
  await page.locator("#ef-answer").fill(WRONG);
  const t0 = Date.now();
  await page.getByRole("button", { name: /제출/ }).click();
  await expect(page.getByText(/규칙 기반 · \d\.\d초/)).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(2000);
  await expect(page.getByText(/1초 안에 Claude 응답이 없어 규칙 기반으로 채점했습니다\. 표현이 기준 답안과 많이 달라 놓친 오류가 있을 수 있습니다/)).toBeVisible();
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

test("while waiting for Claude, the learner can still take the rule-based grade", async ({ page }) => {
  await fakeClaude(page, 60_000);
  await open(page);
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

test("role-play: a perfect answer is celebrated, my own line stays in the chat, and the whole talk replays at the end", async ({ page }) => {
  const errors = await open(page);
  await nav(page, "학습");
  await page.getByRole("button", { name: "롤플레이 주간 화상회의 시작 시작" }).click();
  const lines = ["Yes, I can hear you clearly.", "Sure. Let me share my screen first.", "Actually, the review has been moved to next Monday."];
  for (const [i, line] of lines.entries()) {
    await expect(page.locator("#ef-answer")).toBeVisible();
    if (i > 0) await expect(page.getByRole("list", { name: "대화" }).getByText(lines[i - 1])).toBeVisible();
    await page.locator("#ef-answer").fill(line);
    await page.getByRole("button", { name: /제출/ }).click();
    await expect(page.getByRole("img", { name: /종합/ })).toBeVisible();
    if (i === 0) await expect(page.getByRole("status").filter({ hasText: /완벽|Nailed|Spot on|원어민|100점/ }).first()).toBeVisible();
    await page.getByRole("button", { name: /^다음|^결과 보기/ }).click();
  }
  await expect(page.getByRole("heading", { name: "대화 완주!" })).toBeVisible();
  const replay = page.getByRole("list", { name: "대화 기록" });
  await expect(replay).toBeVisible();
  for (const line of lines) await expect(replay.getByText(line)).toBeVisible();
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("short to long: a small-talk ladder climbs from a one-line reply to a long turn and shows the staircase", async ({ page }) => {
  const errors = await open(page);
  await nav(page, "학습");
  await page.getByRole("radio", { name: /^안부·스몰토크/ }).click();
  await page.getByRole("button", { name: /안부·스몰토크 계단 시작/ }).click();
  const difficulties: number[] = [];
  for (let i = 0; i < 8; i++) {
    const reason = page.getByText(new RegExp(`^계단 ${i + 1}/8 · 난이도 (\\d+)`));
    await expect(reason).toBeVisible();
    difficulties.push(Number((await reason.innerText()).match(/난이도 (\d+)/)![1]));
    // Skipping moves straight on to the next step.
    await page.getByRole("button", { name: /건너뛰기/ }).first().click();
  }
  expect(difficulties[0]).toBeLessThanOrEqual(2);
  for (let k = 1; k < difficulties.length; k++) expect(difficulties[k]).toBeGreaterThanOrEqual(difficulties[k - 1]);
  await expect(page.getByRole("heading", { name: "계단 오르기 끝" })).toBeVisible();
  await expect(page.getByText(/0\/8계단 통과/)).toBeVisible();
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("speed round: short replies against a live timer, with response times in the summary", async ({ page }) => {
  const errors = await open(page);
  await page.getByRole("button", { name: "순발력 훈련 시작" }).click();
  await expect(page.getByLabel(/^응답 시간 \d+\.\d초$/)).toBeVisible();
  await expect(page.getByText(/^순발력 1\/10/)).toBeVisible();
  for (let i = 0; i < 10; i++) {
    await expect(page.locator("#ef-answer")).toBeVisible();
    await page.locator("#ef-answer").fill("Sounds good.");
    await page.getByRole("button", { name: /제출/ }).click();
    await expect(page.getByRole("img", { name: /종합/ })).toBeVisible();
    await page.getByRole("button", { name: /^다음|^결과 보기/ }).click();
    if (await page.getByRole("heading", { name: /순발력/ }).isVisible()) break;
  }
  await expect(page.getByRole("heading", { name: /순발력 (만점!|훈련 끝)/ })).toBeVisible();
  await expect(page.getByText("평균 응답")).toBeVisible();
  await noHorizontalOverflow(page);
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

/** A stand-in for Claude that plays the free-talk partner (and grades anything else as correct). */
async function fakeTalkClaude(page: Page) {
  await page.addInitScript(() => {
    let turns = 0;
    const json = async (prompt: string) => {
      if (prompt.includes("spoken-English practice conversation")) {
        turns++;
        const line = /grade exactly this text\): """([\s\S]*?)"""/.exec(prompt)?.[1] ?? "";
        const bad = /I am agree/i.test(line);
        return {
          feedback: bad
            ? { score: 70, notes: [{ text: "I am agree", fix: "I agree", whyKo: "agree는 동사라서 be동사 없이 씁니다." }], corrected: line.replace(/I am agree/i, "I agree"), natural: "" }
            : { score: 100, notes: [], corrected: "", natural: "" },
          reply: turns >= 2 ? { en: "Sounds like a plan. Have a great week!", ko: "좋아요. 한 주 잘 보내요!" } : { en: "Nice! Where did you go hiking?", ko: "좋네요! 어디로 등산 갔어요?" },
          done: turns >= 2,
        };
      }
      return { meaning: 95, comprehensibility: 95, errors: [], corrected: "" };
    };
    const sample = Object.assign(async () => ({ text: "" }), { json });
    (window as unknown as { claude: unknown }).claude = { use: async (name: string) => (name === "sample" ? sample : null) };
  });
}

test("free talk: Claude plays the partner, every line gets feedback, and the talk ends with what to say next time", async ({ page }) => {
  await fakeTalkClaude(page);
  const errors = await open(page);
  await nav(page, "학습");
  const start = page.getByRole("button", { name: "월요일 아침 주말 이야기 자유 대화 시작" });
  await expect(start).toBeEnabled();
  await start.click();
  const talk = page.getByRole("list", { name: "자유 대화" });
  await expect(talk.getByText("Morning, Minsu! How was your weekend?")).toBeVisible();
  // Stuck? The hint shows the meaning first, then the English sentence.
  await page.getByRole("button", { name: "힌트 보기" }).click();
  await expect(page.getByText(/이런 뜻으로 말해 보세요/)).toBeVisible();
  await page.getByRole("button", { name: "영어 문장 보기" }).click();
  await expect(page.getByText("It was great! I went hiking with my family. How about you?")).toBeVisible();
  const input = page.getByRole("textbox", { name: "내 대답" });
  await input.fill("It was great. I went hiking with my family.");
  await input.press("Enter");
  await expect(talk.getByText("자연스러워요")).toBeVisible();
  await expect(talk.getByText("Nice! Where did you go hiking?")).toBeVisible();
  await input.fill("I am agree, it was really fun.");
  await input.press("Enter");
  await expect(talk.getByText("이렇게 고쳐요")).toBeVisible();
  await expect(page.getByText("대화 완료!")).toBeVisible();
  await expect(page.getByRole("list", { name: "고칠 표현" }).getByText("I agree, it was really fun.")).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: /다른 주제 고르기/ }).click();
  await expect(page.getByRole("button", { name: "월요일 아침 주말 이야기 자유 대화 시작" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("badges: the Progress screen shows every badge family and the first 100 earns one", async ({ page }) => {
  const errors = await open(page);
  await nav(page, "학습");
  await page.getByRole("button", { name: "롤플레이 주간 화상회의 시작 시작" }).click();
  await page.locator("#ef-answer").fill("Yes, I can hear you clearly.");
  await page.getByRole("button", { name: /제출/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /100점|완벽/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /세션 종료|닫기/ }).first().click();
  const confirm = page.getByRole("button", { name: /종료|나가기/ }).last();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await nav(page, "진도");
  const shelf = page.getByRole("list", { name: "배지 목록" });
  await expect(shelf).toBeVisible();
  await expect(shelf.getByRole("listitem")).toHaveCount(13);
  await expect(shelf.getByText("첫 100점")).toBeVisible();
  await expect(shelf.getByLabel("브론즈 달성").first()).toBeVisible();
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

/** A stand-in for the browser's speech recognition: says `window.__speech.text` (or fails with `.error`). */
async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    type Ev = { resultIndex: number; results: ({ transcript: string }[] & { isFinal: boolean })[] };
    const w = window as unknown as { __speech: { text: string; error: string }; SpeechRecognition: unknown; webkitSpeechRecognition: unknown };
    w.__speech = { text: "i'm on my way", error: "" };
    class FakeRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      onresult: ((e: Ev) => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      timers: ReturnType<typeof setTimeout>[] = [];
      start() {
        const { text, error } = w.__speech;
        if (error) {
          this.timers.push(setTimeout(() => (this.onerror?.({ error }), this.onend?.()), 50));
          return;
        }
        const ev = (t: string, isFinal: boolean): Ev => ({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal })] });
        const half = text.split(" ").slice(0, Math.ceil(text.split(" ").length / 2)).join(" ");
        this.timers.push(setTimeout(() => this.onresult?.(ev(half, false)), 200));
        this.timers.push(setTimeout(() => this.onresult?.(ev(text, true)), 600));
        this.timers.push(setTimeout(() => this.onend?.(), 650));
      }
      stop() {
        this.timers.forEach(clearTimeout);
        setTimeout(() => this.onend?.(), 10);
      }
      abort() {
        this.timers.forEach(clearTimeout);
        setTimeout(() => (this.onerror?.({ error: "aborted" }), this.onend?.()), 0);
      }
    }
    // Recent Chromium has the unprefixed name too.
    w.SpeechRecognition = w.webkitSpeechRecognition = FakeRecognition;
  });
}

test("voice answers: speaking fills the answer box and the spoken answer is graded like a typed one", async ({ page }) => {
  await fakeSpeech(page);
  const errors = await open(page);
  await nav(page, "학습");
  await page.getByRole("button", { name: "롤플레이 주간 화상회의 시작 시작" }).click();
  await page.evaluate(() => ((window as unknown as { __speech: { text: string } }).__speech.text = "yes i can hear you clearly"));
  await page.getByRole("button", { name: "말로 답하기" }).click();
  await expect(page.getByText(/듣고 있어요/)).toBeVisible();
  await expect(page.getByRole("button", { name: "듣기 멈추기" })).toBeVisible();
  await expect(page.locator("#ef-answer")).toHaveValue("Yes I can hear you clearly");
  await expect(page.getByText(/듣고 있어요/)).toBeHidden();
  await page.getByRole("button", { name: /제출/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /100점|완벽/ }).first()).toBeVisible();
  // A refused microphone: say why once, then the button goes away.
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.evaluate(() => ((window as unknown as { __speech: { error: string } }).__speech.error = "not-allowed"));
  await page.getByRole("button", { name: "말로 답하기" }).click();
  await expect(page.getByText(/마이크를 쓸 수 없습니다/)).toBeVisible();
  await expect(page.getByRole("button", { name: "말로 답하기" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("voice answers in free talk: with 'send at once' in Settings, a spoken line goes to Claude when I stop speaking", async ({ page }) => {
  await fakeSpeech(page);
  await fakeTalkClaude(page);
  const errors = await open(page);
  await nav(page, "설정");
  await page.getByRole("radiogroup", { name: "말로 답하기" }).getByRole("radio", { name: "바로 제출" }).click();
  await nav(page, "학습");
  await page.getByRole("button", { name: "월요일 아침 주말 이야기 자유 대화 시작" }).click();
  const talk = page.getByRole("list", { name: "자유 대화" });
  await expect(talk.getByText("Morning, Minsu! How was your weekend?")).toBeVisible();
  await page.evaluate(() => ((window as unknown as { __speech: { text: string } }).__speech.text = "it was great i went hiking with my family"));
  await page.getByRole("button", { name: "말로 답하기" }).click();
  await expect(talk.getByText("It was great I went hiking with my family")).toBeVisible();
  await expect(talk.getByText("Nice! Where did you go hiking?")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "내 대답" })).toHaveValue("");
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("a late Claude grade still teaches: an approved wording is accepted at once next time", async ({ page }) => {
  // Claude approves every answer, but only after 1.6 s; Settings say "always 1 second".
  await page.addInitScript(() => {
    const sample = Object.assign(async () => ({ text: "" }), {
      json: (_p: string, opts?: { signal?: AbortSignal }) =>
        new Promise((resolve, reject) => {
          const t = setTimeout(() => resolve({ meaning: 100, comprehensibility: 100, errors: [], corrected: "" }), 1600);
          opts?.signal?.addEventListener("abort", () => (clearTimeout(t), reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
        }),
    });
    (window as unknown as { claude: unknown }).claude = { use: async (name: string) => (name === "sample" ? sample : null) };
  });
  const errors = await open(page);
  await nav(page, "설정");
  await page.getByRole("radiogroup", { name: "채점 대기 시간" }).getByRole("radio", { name: "항상 1초" }).click();
  await startSentenceLesson(page);
  const mine = "We have to run the process simulation one more time since the feed composition has changed.";
  await page.locator("#ef-answer").fill(mine);
  await page.getByRole("button", { name: /제출/ }).click();
  await expect(page.getByText(/규칙 기반 · \d\.\d초/)).toBeVisible();
  const ring = page.getByRole("img", { name: /종합/ });
  const first = await ring.getAttribute("aria-label");
  await page.waitForTimeout(1500); // Claude's late approval arrives
  expect(await ring.getAttribute("aria-label")).toBe(first); // the shown grade never changes
  await page.getByRole("button", { name: /다시 풀기/ }).click();
  await page.locator("#ef-answer").fill(mine);
  await page.getByRole("button", { name: /제출/ }).click();
  await expect(page.getByText("Claude 확인한 내 표현")).toBeVisible();
  expect(errors).toEqual([]);
});

test("meeting essentials: Today starts eight meeting expressions, short ones first", async ({ page }) => {
  const errors = await open(page);
  await page.getByRole("button", { name: "회의 필수 표현 시작" }).click();
  await expect(page.locator("#ef-answer")).toBeVisible();
  await expect(page.getByText(/회의 필수 표현 1\/8/)).toBeVisible();
  await expect(page.getByText(/온라인 미팅 진행|회의 대화|발표/).first()).toBeVisible();
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});
