import { defineConfig } from "@playwright/test";

/** E2E against the built single-file app (the same bundle published as the artifact). */
const executablePath = process.env.PW_CHROMIUM || (process.env.CI ? undefined : "/opt/pw-browsers/chromium-1194/chrome-linux/chrome");

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: { launchOptions: executablePath ? { executablePath } : {}, trace: "retain-on-failure" },
  projects: [
    { name: "iphone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "ipad", use: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
