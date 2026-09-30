import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // the dev server compiles pages on first visit, and two workers share it: give assertions room
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // Optional: use a pre-installed Chromium instead of the one Playwright downloads.
    launchOptions: {
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
});
