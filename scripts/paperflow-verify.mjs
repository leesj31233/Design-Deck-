// PAPERFLOW Phase 1 verification: import → render → select → highlight → reload → restore,
// keyboard / command palette, reduced motion, and desktop + iPad screenshots (light/dark).
// Requires a running app and Playwright (not a project dependency):
//   npm run build && npm start -- -p 3100 &
//   NODE_PATH=$(npm root -g) BASE=http://localhost:3100 node scripts/paperflow-verify.mjs
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = path.resolve(process.env.OUT ?? "docs/paperflow/screenshots");
mkdirSync(OUT, { recursive: true });

const results = [];
const withinBudget = (text = "") => {
  const [value, budget] = (text.match(/[\d.]+/g) ?? []).map(Number);
  return value !== undefined && budget !== undefined && value <= budget;
};
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();

async function selectPhrase(page, phrase, pageIndex = 0) {
  const box = await page.evaluate(({ phrase, pageIndex }) => {
    for (const s of document.querySelectorAll(`[data-page-index="${pageIndex}"] .pf-text-layer span`)) {
      const t = s.firstChild;
      if (!t || t.nodeType !== 3) continue;
      const i = t.textContent.indexOf(phrase);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(t, i);
      r.setEnd(t, i + phrase.length);
      const b = r.getBoundingClientRect();
      return { x1: b.left + 1, x2: b.right - 1, y: b.top + b.height / 2 };
    }
    return null;
  }, { phrase, pageIndex });
  if (!box) throw new Error(`phrase not found: ${phrase}`);
  await page.mouse.move(box.x1, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x2, box.y, { steps: 6 });
  await page.mouse.up();
}

async function readerReady(page) {
  await page.waitForSelector('[data-page-index="0"] .pf-text-layer span', { timeout: 30000 });
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 });
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------- Desktop flow (light)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: "light" });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Import a freshly generated PDF through the real file input.
  const gen = await ctx.newPage();
  await gen.setContent(`<html><body style="font:14px Liberation Serif;padding:40px"><h1>Import fixture: coal co-firing heat flux</h1>
    <p>The boiler efficiency decreased slightly as the co-firing ratio increased because of higher flue gas losses.</p>
    <p>Heat flux measurements were taken at three furnace elevations.</p></body></html>`);
  const fixture = path.join(os.tmpdir(), `paperflow-import-${Date.now()}.pdf`);
  writeFileSync(fixture, await gen.pdf({ format: "A4" }));
  await gen.close();

  await page.goto(`${BASE}/paperflow`);
  await page.waitForSelector("text=Research Library");
  await page.waitForSelector('a[href="/paperflow/reader/sample-cofiring"]');
  await page.screenshot({ path: `${OUT}/desktop-library-light.png` });

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import PDF" }).click();
  await (await chooser).setFiles(fixture);
  await page.waitForURL(/\/paperflow\/reader\/[0-9a-f]{20}$/, { timeout: 20000 });
  await readerReady(page);
  check("import → reader route", true, page.url().split("/").pop());
  await selectPhrase(page, "boiler efficiency decreased slightly");
  await page.waitForSelector("#pf-selection-bar", { state: "visible" });
  await page.keyboard.press("h");
  await page.waitForSelector(".pf-highlight");
  const importedUrl = page.url();
  await page.reload();
  await readerReady(page);
  await page.waitForSelector(".pf-highlight", { timeout: 10000 });
  const importedStatus = await page.locator('[aria-label="Research inspector"] li').first().textContent();
  check("imported PDF highlight restored after reload", importedStatus.includes("Anchored"), importedUrl);

  // Sample paper flow.
  await page.goto(`${BASE}/paperflow/reader/sample-cofiring`);
  await readerReady(page);
  const t0 = Date.now();
  await selectPhrase(page, "realizable k-ε turbulence model");
  await page.waitForSelector("#pf-selection-bar", { state: "visible" });
  check("selection action bar appears", true, `${Date.now() - t0} ms incl. automation`);
  const barBox = await page.locator("#pf-selection-bar").boundingBox();
  const selTop = await page.evaluate(() => window.getSelection().getRangeAt(0).getBoundingClientRect().top);
  check("action bar anchored above selection", barBox.y + barBox.height <= selTop + 1, `bar bottom ${Math.round(barBox.y + barBox.height)} ≤ selection top ${Math.round(selTop)}`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/desktop-reader-selection-light.png` });
  await page.keyboard.press("h");
  await page.waitForSelector(".pf-highlight");

  // Flip: selection near the top edge places the bar below.
  await page.keyboard.press("Escape");
  await page.locator("#pf-reader-viewport").evaluate((el) => {
    const span = [...el.querySelectorAll('[data-page-index="0"] .pf-text-layer span')].find((s) => s.textContent.includes("residue of palm oil production"));
    el.scrollTop += span.getBoundingClientRect().top - el.getBoundingClientRect().top - 16;
  });
  await page.waitForTimeout(200);
  await selectPhrase(page, "residue of palm oil production");
  await page.waitForSelector("#pf-selection-bar", { state: "visible" });
  const flipBox = await page.locator("#pf-selection-bar").boundingBox();
  const flipSel = await page.evaluate(() => window.getSelection().getRangeAt(0).getBoundingClientRect());
  check("action bar flips below near top edge", flipBox.y >= flipSel.bottom - 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check("Escape dismisses action bar", (await page.locator("#pf-selection-bar").count()) === 0);

  await selectPhrase(page, "discrete phase model (DPM)");
  await page.waitForSelector("#pf-selection-bar", { state: "visible" });
  await page.keyboard.press("2");
  await page.waitForTimeout(150);
  await selectPhrase(page, "NOx formation was evaluated as a post-process");
  await page.waitForSelector("#pf-selection-bar", { state: "visible" });
  await page.click('#pf-selection-bar [data-action="copy-citation"]');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check("copy citation uses real title + page", clip.includes("p. 1") && clip.includes("NOx formation"));
  await page.click('#pf-selection-bar [data-action="translate"]');
  await page.waitForSelector("text=Interface shell · Phase 2");
  check("action shells route to inspector without AI output", (await page.locator("text=No output generated").count()) === 1);
  await page.getByRole("tab", { name: /Info/ }).click();
  const perf = await page.$$eval("[data-budget]", (els) => Object.fromEntries(els.map((e) => [e.dataset.budget, e.textContent])));
  check("perf: selection bar within budget", withinBudget(perf["selection-bar"]), perf["selection-bar"]);
  check("perf: highlight persist within budget", withinBudget(perf["highlight-persist"]), perf["highlight-persist"]);

  // Page navigation + page-turn budget.
  await page.locator("#pf-reader-viewport").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("j");
  await page.waitForTimeout(400);
  await page.keyboard.press("j");
  await page.waitForTimeout(400);
  const pageInput = await page.inputValue("#pf-page-input");
  check("J navigates pages", pageInput === "3", `page ${pageInput}`);
  const perf2 = await page.$$eval("[data-budget]", (els) => Object.fromEntries(els.map((e) => [e.dataset.budget, e.textContent])));
  check("perf: page turn within budget", withinBudget(perf2["page-turn"]), perf2["page-turn"]);
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await page.waitForTimeout(300);

  // Reload → restored.
  await page.reload();
  await readerReady(page);
  await page.waitForSelector(".pf-highlight");
  await page.getByRole("tab", { name: /Evidence/ }).click();
  const statuses = await page.$$eval('[aria-label="Research inspector"] li', (lis) => lis.map((li) => li.textContent));
  check("sample highlights restored after reload", statuses.length === 2 && statuses.every((s) => s.includes("Anchored")), `${statuses.length} highlights`);
  await page.locator("#pf-reader-viewport").evaluate((el) => (el.scrollTop = 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/desktop-reader-light.png` });

  // Keyboard: command palette + focus visibility.
  await page.keyboard.press("Control+k");
  await page.waitForSelector('[cmdk-input]');
  await page.keyboard.type("fit page");
  await page.screenshot({ path: `${OUT}/desktop-command-palette.png` });
  await page.keyboard.press("Enter");
  check("⌘K palette opens and runs a command", (await page.locator("[cmdk-input]").count()) === 0);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const focusRing = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { tag: el.tagName, label: el.getAttribute("aria-label"), ring: cs.boxShadow !== "none" || cs.outlineStyle !== "none" };
  });
  check("keyboard focus is visible", focusRing.ring, `${focusRing.tag} ${focusRing.label ?? ""}`);
  await page.keyboard.press("?");
  await page.waitForSelector("text=Keyboard shortcuts");
  check("? opens shortcuts sheet", true);
  await page.keyboard.press("Escape");

  check("no page errors (desktop light)", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------------------------------------------------------------- Desktop dark
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/paperflow`);
  await page.waitForSelector('a[href="/paperflow/reader/sample-cofiring"]');
  await page.screenshot({ path: `${OUT}/desktop-library-dark.png` });
  await page.goto(`${BASE}/paperflow/reader/sample-cofiring`);
  await readerReady(page);
  await selectPhrase(page, "residue of palm oil production");
  await page.waitForSelector("#pf-selection-bar", { state: "visible" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/desktop-reader-dark.png` });
  const pageBg = await page.locator(".pf-page").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  check("PDF surface stays white in dark mode", pageBg === "rgb(255, 255, 255)", pageBg);
  // Explicit theme toggle overrides the OS.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  check("theme toggle pins data-theme", (await page.evaluate(() => document.documentElement.dataset.theme)) === "light");
  await ctx.close();
}

// ---------------------------------------------------------------- Reduced motion
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/paperflow/reader/sample-cofiring`);
  await readerReady(page);
  await selectPhrase(page, "realizable k-ε turbulence model");
  await page.waitForSelector("#pf-selection-bar", { state: "visible" });
  await page.waitForTimeout(16);
  const transform = await page.locator("#pf-selection-bar").evaluate((el) => getComputedStyle(el).transform);
  check("reduced motion: action bar has no positional animation", transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)", transform);
  const pulse = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  check("reduced motion media query active", pulse);
  await ctx.close();
}

// ---------------------------------------------------------------- iPad landscape
{
  const ipad = devices["iPad Pro 11 landscape"] ?? { viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
  const ctx = await browser.newContext({ ...ipad, colorScheme: "light" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/paperflow`);
  await page.waitForSelector('a[href="/paperflow/reader/sample-cofiring"]');
  const overflowLib = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("iPad library: no horizontal overflow", overflowLib <= 0, `${overflowLib}px`);
  await page.screenshot({ path: `${OUT}/ipad-library-light.png` });
  await page.goto(`${BASE}/paperflow/reader/sample-cofiring`);
  await readerReady(page);
  const overflowReader = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("iPad reader: no horizontal overflow", overflowReader <= 0, `${overflowReader}px`);
  await page.screenshot({ path: `${OUT}/ipad-reader-light.png` });
  await page.getByRole("button", { name: /Show inspector/ }).tap();
  await page.waitForTimeout(700);
  const small = await page.$$eval("header button, header a, header input", (els) =>
    els.filter((e) => e.offsetParent).map((e) => (e.closest("label") ?? e).getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length,
  );
  check("iPad: top bar touch targets ≥ 44pt", small === 0, `${small} below 44pt`);
  await page.screenshot({ path: `${OUT}/ipad-reader-inspector-light.png` });
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
