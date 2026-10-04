import { defineConfig } from "@playwright/test";

// E2E_PRODUCTION=1 runs the tests against the production build (`npm run build` then `next start` on port 3200), the way Vercel serves it.
const production = process.env.E2E_PRODUCTION === "1";
const baseURL = process.env.E2E_BASE_URL ?? (production ? "http://localhost:3200" : "http://localhost:3000");

// The servers this config starts run with the shared 3-second cache of the public answers switched off (PUBLIC_CACHE_MS=0): a test that changes the database and
// opens a public page straight away must see the change. e2e/public-cache.spec.ts and public-valve.spec.ts check the cache and the valve against servers started normally.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // a first visit to a page compiles it in dev mode, which can take longer than the 5 s default
  expect: { timeout: 15_000 },
  // a test that signs in, saves twice and reloads needs more than the 30 s default when the database is far away (e.g. a cloud sandbox)
  timeout: 90_000,
  use: {
    baseURL,
    // Optional: use a pre-installed Chromium instead of the one Playwright downloads.
    launchOptions: {
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : production
      ? { command: "npm run build && PUBLIC_CACHE_MS=0 npx next start -p 3200", url: baseURL, reuseExistingServer: true, timeout: 600_000 }
      : { command: "PUBLIC_CACHE_MS=0 npm run dev", url: baseURL, reuseExistingServer: true },
});
