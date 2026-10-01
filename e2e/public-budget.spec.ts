import { devices, expect, test } from "@playwright/test";
import { createPublicWorld, type PublicWorld } from "./public-world";

// Performance budget for the public pages on a slow phone connection (Phase 6). Lighthouse itself is not used (it is not an approved dependency); this measures the
// same things in the same conditions: Chromium with Lighthouse's "slow 4G" network (1.6 Mbps down, 150 ms round trip) and a 4× slower CPU, on the production build
// (`E2E_PRODUCTION=1`, which `npm run test:e2e:budget` sets). Numbers are what the browser really transferred (compressed), not file sizes.
test.skip(process.env.E2E_PRODUCTION !== "1", "the budget is measured against the production build only");
test.use({ ...devices["Pixel 5"] });

const BUDGET = { transferKB: 180, scriptKB: 140, requests: 16, lcpMs: 2500 };
let w: PublicWorld;
test.beforeAll(async () => {
  test.setTimeout(240_000);
  w = await createPublicWorld();
});
test.afterAll(async () => {
  await w?.cleanup();
});

async function measure(path: string, page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  let bytes = 0;
  let script = 0;
  let requests = 0;
  page.on("requestfinished", async (req) => {
    requests += 1;
    const s = await req.sizes().catch(() => null);
    if (!s) return;
    const n = s.responseBodySize + s.responseHeadersSize;
    bytes += n;
    if (req.resourceType() === "script") script += n;
  });
  await page.addInitScript(() => {
    (window as unknown as { __lcp: number }).__lcp = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) (window as unknown as { __lcp: number }).__lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  const started = Date.now();
  await page.goto(`/e/${w.slug}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const lcp = await page.evaluate(() => (window as unknown as { __lcp: number }).__lcp);
  return { kb: Math.round(bytes / 1024), scriptKb: Math.round(script / 1024), requests, lcp: Math.round(lcp), load: Date.now() - started };
}

for (const [name, path] of [["home", ""], ["results", "/results"], ["live heat", "/live"]] as const) {
  test(`${name} stays inside the budget on a slow phone connection`, async ({ page, context }) => {
    const m = await measure(path, page, context);
    console.log(`BUDGET ${name}: ${JSON.stringify(m)} (limits ${JSON.stringify(BUDGET)})`);
    expect(m.kb, "transferred KB").toBeLessThanOrEqual(BUDGET.transferKB);
    expect(m.scriptKb, "script KB").toBeLessThanOrEqual(BUDGET.scriptKB);
    expect(m.requests, "requests").toBeLessThanOrEqual(BUDGET.requests);
    expect(m.lcp, "largest contentful paint ms").toBeLessThanOrEqual(BUDGET.lcpMs);
  });
}
