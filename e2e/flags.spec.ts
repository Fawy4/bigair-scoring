import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// Flags: the start sequence and the flag states, on a throwaway organisation (removed by the ledger; Arrow, EKL and Demo are never touched).
// A short heat (30 s) with a 10 s pre-start and a 10 s last minute, so the whole sequence plays in under a minute of real time.
let w: LiveWorld;
const phones: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld({ flags: true });
  await w.db.from("heats").update({ duration_sec: 30 }).in("id", w.heats);
  await setFlags({ enabled: true, prestartSec: 10, lastMinuteSec: 10 });
});
test.afterEach(async () => {
  await closePhones(phones);
  await w?.cleanup();
});

async function setFlags(flags: object) {
  const { data } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  await w.db.from("events").update({ settings: { ...((data?.settings ?? {}) as object), flags } as never }).eq("id", w.eventId);
}
async function open(browser: Browser, viewport: { width: number; height: number }, go: (page: Page) => Promise<void>): Promise<Page> {
  const context = await browser.newContext({ viewport });
  phones.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await go(page);
  return page;
}
const laptop = (browser: Browser) => open(browser, { width: 1280, height: 800 }, (p) => w.signInAs(p, "head", `/head/${w.eventId}`));
const marshal = (browser: Browser) => open(browser, { width: 390, height: 844 }, async (p) => void (await p.goto(`/e/e2e-live-${w.org.run}/flag`)));
const flagOf = (p: Page) => p.getByTestId("flag-view");
const strip = (p: Page) => p.getByTestId("heat-timer").first();
const heatRow = async () => (await w.db.from("heats").select("status, started_at, armed_at, prestart_sec").eq("id", w.heats[0]).single()).data!;
const seconds = async (p: Page, id = "heat-timer-clock") => {
  const [m, s] = (await p.getByTestId(id).first().innerText()).trim().split(":").map(Number);
  return m * 60 + s;
};

test("the console arms, the marshal's screen follows: yellow, green, yellow, red; pause shows red Paused; Resume brings the colour back", async ({ browser }) => {
  test.setTimeout(240_000);
  const head = await laptop(browser);
  const flag = await marshal(browser);
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 45_000 });
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
  // before anything: red, nothing running; the console says Start sequence with the pre-start choice
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "stopped", { timeout: 30_000 });
  await expect(head.getByTestId("start")).toHaveText("Start sequence");
  await expect(head.getByTestId("prestart-choice")).toBeVisible();
  await expect(head.getByTestId("prestart-10")).toHaveAttribute("aria-checked", "true");

  await head.getByTestId("start").click();
  // yellow, with the pre-start countdown, on the marshal's screen and on the console strip
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "before_start", { timeout: 20_000 });
  await expect(flag.getByTestId("flag-label")).toHaveText("Before start");
  await expect(flag.getByTestId("flag-countdown")).toHaveText(/^0:(0\d|10)$/);
  await expect(strip(head)).toHaveAttribute("data-flag", "before_start");
  const armed = await heatRow();
  expect(armed.status).toBe("scheduled");
  expect(armed.prestart_sec).toBe(10);
  // the yellow shows Start now and Abort
  await expect(head.getByTestId("start-now")).toBeVisible();
  await expect(head.getByTestId("abort-start")).toBeVisible();

  // at 0:00 of the pre-start the heat starts by itself: green, and the heat clock runs from its full length
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "running", { timeout: 25_000 });
  await expect(flag.getByTestId("flag-label")).toHaveText("Running");
  await expect(strip(head)).toHaveAttribute("data-flag", /running|last_minute/);
  await expect.poll(async () => (await heatRow()).status, { timeout: 15_000 }).toBe("running");
  const started = await heatRow();
  expect(Date.parse(started.started_at!)).toBe(Date.parse(armed.armed_at!) + 10_000); // the start time is exactly the armed moment plus the pre-start
  expect(await seconds(flag, "flag-countdown")).toBeGreaterThan(10);
  expect(await seconds(flag, "flag-countdown")).toBeLessThanOrEqual(30);

  // the last minute (10 s here): yellow again
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "last_minute", { timeout: 30_000 });
  await expect(flag.getByTestId("flag-label")).toHaveText("Last minute");

  // pause in the last minute: red, Paused, the time left stands still
  await head.getByTestId("pause").click();
  await expect(flagOf(flag)).toHaveAttribute("data-why", "paused", { timeout: 15_000 });
  await expect(flag.getByTestId("flag-label")).toHaveText("Paused");
  await expect(strip(head)).toHaveAttribute("data-why", "paused");
  // resume: the colour comes back according to the time left
  await head.getByTestId("resume").click();
  await expect(flagOf(flag)).toHaveAttribute("data-flag", /last_minute|running/, { timeout: 15_000 });

  // at 0:00: red, Finished, before anyone presses End heat
  await expect(flagOf(flag)).toHaveAttribute("data-why", "finished", { timeout: 30_000 });
  await expect(flag.getByTestId("flag-label")).toHaveText("Finished");
  await expect(strip(head)).toHaveAttribute("data-why", "finished");
});

test("Abort during the yellow: red again, the heat not started, nothing armed; Start now makes it green at once", async ({ browser }) => {
  test.setTimeout(180_000);
  await setFlags({ enabled: true, prestartSec: 120, lastMinuteSec: 10 });
  const head = await laptop(browser);
  const flag = await marshal(browser);
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 45_000 });
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
  await head.getByTestId("start").click();
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "before_start", { timeout: 20_000 });
  await head.getByTestId("abort-start").click();
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "stopped", { timeout: 15_000 });
  const row = await heatRow();
  expect(row.status).toBe("scheduled");
  expect(row.armed_at).toBeNull();
  expect(row.started_at).toBeNull();
  const { data: lines } = await w.db.from("audit_log").select("action, at").eq("row_id", w.heats[0]).eq("action", "heat_start_aborted");
  expect(lines?.length).toBe(1);
  await expect(head.getByTestId("start")).toHaveText("Start sequence");

  // Start sequence with "Start now" chosen: green at once; the pre-start button during a yellow also starts at once
  await head.getByTestId("start").click();
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "before_start", { timeout: 20_000 });
  await head.getByTestId("start-now").click();
  await expect(flagOf(flag)).toHaveAttribute("data-flag", /running|last_minute/, { timeout: 15_000 });
  expect((await heatRow()).status).toBe("running");
});

test("judge and spotter phones at 390 × 844: the flag strip is the clock line and covers nothing they tap", async ({ browser }) => {
  test.setTimeout(240_000);
  const judge = await open(browser, { width: 390, height: 844 }, (p) => w.signInAs(p, "j1", "/seat"));
  const spotter = await open(browser, { width: 390, height: 844 }, (p) => w.signInAs(p, "spotter", "/seat"));
  for (const page of [judge, spotter]) {
    await expect(strip(page)).toBeVisible({ timeout: 45_000 });
    await expect(strip(page)).toHaveAttribute("data-flag", "stopped");
  }
  // the whole sequence from the console's database call: arm, then green
  const head = await laptop(browser);
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 45_000 });
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
  await head.getByTestId("prestart-0").click();
  await head.getByTestId("start").click();
  await expect(strip(judge)).toHaveAttribute("data-flag", /running|last_minute/, { timeout: 30_000 });
  await expect(strip(spotter)).toHaveAttribute("data-flag", /running|last_minute/, { timeout: 30_000 });
  await expect(spotter.getByTestId("trick-builder")).toBeVisible({ timeout: 30_000 });

  for (const page of [judge, spotter]) {
    const header = page.getByTestId("screen-header");
    const box = (await header.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390.5);
    // no sideways scroll, and the strip is the same height as the clock line it replaced (one 56 px tap row)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const stripBox = (await strip(page).boundingBox())!;
    expect(stripBox.height).toBeLessThanOrEqual(60);
    // every button on screen can be tapped: the element at its centre is the button itself, so the strip covers nothing
    const covered = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a[href], input, select"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
        const hit = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + r.height / 2, window.innerHeight - 1));
        if (hit && !el.contains(hit) && !hit.contains(el)) bad.push(`${el.tagName} ${el.getAttribute("data-testid") ?? el.textContent?.slice(0, 20)}`);
      }
      return bad;
    });
    expect(covered).toEqual([]);
  }
  // the strip never sits on top of the first card: the details toggle and the strip share one row
  const toggle = await judge.getByTestId("details-toggle").boundingBox();
  const s = (await strip(judge).boundingBox())!;
  if (toggle) expect(toggle.x).toBeGreaterThanOrEqual(s.x + s.width - 1);
});

test("the Flag view turns grey when it has had no contact with the server for 10 seconds, and recovers", async ({ browser }) => {
  test.setTimeout(120_000);
  const flag = await marshal(browser);
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "stopped", { timeout: 30_000 });
  await flag.context().setOffline(true);
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "stale", { timeout: 25_000 });
  await expect(flag.getByTestId("flag-label")).toHaveText("No connection — check with the head judge");
  await flag.context().setOffline(false);
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "stopped", { timeout: 20_000 });
});

test("Event step: switching Flags off brings back plain Start heat and the plain timer; the marshal's screen says so", async ({ browser, page }) => {
  test.setTimeout(240_000);
  await w.org.signIn(page, `/org/events/${w.eventId}/event`);
  await expect(page.getByTestId("event-panel")).toBeVisible({ timeout: 60_000 });
  if (!(await page.getByTestId("flags-card").isVisible())) await page.getByTestId("advanced-toggle").click();
  await expect(page.getByTestId("flags-card")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("flags-switch")).toBeChecked();
  await page.getByTestId("flags-switch").uncheck();
  await page.getByRole("button", { name: /^save/i }).first().click();
  await expect.poll(async () => ((await w.db.from("events").select("settings").eq("id", w.eventId).single()).data?.settings as { flags?: { enabled?: boolean } }).flags?.enabled, { timeout: 30_000 }).toBe(false);

  const head = await laptop(browser);
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 45_000 });
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
  await expect(head.getByTestId("start")).toHaveText("Start heat");
  await expect(head.getByTestId("prestart-choice")).toHaveCount(0);
  await expect(head.getByTestId("heat-timer")).not.toHaveAttribute("data-flag", /.+/);
  const flag = await marshal(browser);
  await expect(flag.getByTestId("flag-label")).toHaveText("Flags are switched off for this event");
  // Start heat starts the heat at once, as before
  await head.getByTestId("start").click();
  await expect.poll(async () => (await heatRow()).status, { timeout: 20_000 }).toBe("running");
});
