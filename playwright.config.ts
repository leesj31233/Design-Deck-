import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e", timeout: 90_000, expect: { timeout: 15_000 }, fullyParallel: false, workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: { command: "node node_modules/next/dist/bin/next start -p 3100", url: "http://localhost:3100/library", reuseExistingServer: !process.env.CI, timeout: 60_000 },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 960 } } },
    { name: "ipad", testIgnore: "**/local-corpus.spec.ts", use: { viewport: { width: 1194, height: 834 }, hasTouch: true, deviceScaleFactor: 2 } }
  ]
});
