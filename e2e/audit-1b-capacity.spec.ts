import { readFileSync } from "node:fs";
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./base";
import { createPublicWorld, type PublicWorld } from "./public-world";

/**
 * Audit 1b, part 9 — what one browser costs per minute (docs/AUDIT.md, A1b-11). Run with `AUDIT_CAPACITY=1` against the production build
 * (`npm run build && npx next start -p 3200`, `E2E_BASE_URL=http://localhost:3200`, and `NEXT_SERVER_PID=<pid of next-server>` to read its CPU time). For each
 * public tab, the big screen and the Flag view (and one of each official) it counts, over one minute with the event's poll at its default 7 s:
 *   - requests to the app (on Vercel: function invocations for the dynamic pages) and the bytes they returned (browser ← Vercel, compressed);
 *   - requests the browser makes straight to Supabase (officials only; the public pages never do) and their bytes;
 *   - CPU time the app server spent (the Vercel "Active CPU" of those invocations), when NEXT_SERVER_PID is given.
 * The numbers go to the console as "CAPACITY …" lines; the audit's projection uses them. Nothing is asserted beyond "the page polled".
 */
test.skip(process.env.AUDIT_CAPACITY !== "1", "a measurement, not a check: run with AUDIT_CAPACITY=1");
let w: PublicWorld;
test.beforeAll(async () => {
  test.setTimeout(300_000);
  w = await createPublicWorld({ settings: { livePollSec: 7, flags: { enabled: true } } });
});
test.afterAll(async () => {
  await w?.cleanup();
});

const cpuMs = (): number | null => {
  const pid = process.env.NEXT_SERVER_PID;
  if (!pid) return null;
  const f = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ");
  return ((Number(f[11]) + Number(f[12])) * 1000) / 100; // utime + stime, in ms (100 ticks per second)
};

async function minuteOf(page: Page, context: BrowserContext, path: string, ms = 60_000) {
  const counts = { app: 0, appBytes: 0, supabase: 0, supabaseBytes: 0, ws: 0 };
  page.on("requestfinished", async (req) => {
    const s = await req.sizes().catch(() => null);
    const n = s ? s.responseBodySize + s.responseHeadersSize : 0;
    if (/supabase\.co/.test(req.url())) {
      counts.supabase++;
      counts.supabaseBytes += n;
    } else if (!/\/_next\/static\//.test(req.url())) {
      counts.app++;
      counts.appBytes += n;
    }
  });
  page.on("websocket", () => counts.ws++);
  await page.goto(path, { waitUntil: "load" });
  await page.waitForTimeout(3000); // the first load is not part of the steady minute
  const before = { ...counts };
  const cpu0 = cpuMs();
  await page.waitForTimeout(ms);
  const cpu1 = cpuMs();
  return {
    appRequests: counts.app - before.app,
    appKB: Math.round((counts.appBytes - before.appBytes) / 1024),
    supabaseRequests: counts.supabase - before.supabase,
    supabaseKB: Math.round((counts.supabaseBytes - before.supabaseBytes) / 1024),
    websockets: counts.ws,
    serverCpuMs: cpu0 !== null && cpu1 !== null ? Math.round(cpu1 - cpu0) : null,
  };
}

for (const [name, path] of [
  ["public home (with the run order)", ""],
  ["public live heat", "/live"],
  ["public results", "/results"],
  ["public ladder", "/ladder"],
  ["public rider page", "/riders/RIDER"],
  ["big screen", "SCREEN"],
  ["Flag view", "/flag"],
] as const) {
  test(`CAPACITY one browser for one minute: ${name}`, async ({ page, context }) => {
    test.setTimeout(180_000);
    const p = path === "SCREEN" ? `/screen/${w.slug}` : `/e/${w.slug}${path.replace("RIDER", w.entries[0])}`;
    const m = await minuteOf(page, context, p);
    console.log(`CAPACITY ${name}: ${JSON.stringify(m)}`);
    expect(m.appRequests).toBeGreaterThan(0);
  });
}

for (const [key, path] of [["j1", "/seat"], ["spotter", "/seat"], ["head", "HEAD"]] as const) {
  test(`CAPACITY one official for one minute with a heat running: ${key}`, async ({ page, context }) => {
    test.setTimeout(180_000);
    await w.signInAs(page, key, path === "HEAD" ? `/head/${w.eventId}` : path);
    await page.waitForTimeout(5000);
    const m = await minuteOf(page, context, page.url());
    // in this sandbox websockets to Supabase are blocked, so the screens fall back to asking every 5 s: these are the "channel down" numbers
    console.log(`CAPACITY official ${key}: ${JSON.stringify(m)}`);
  });
}
