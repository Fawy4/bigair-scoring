import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// Fix (fix-heat-length): the heat clock runs the RUN ORDER's length, not the draw's copy. A heat is drawn at 10:00 and set to 6 minutes in the run order; when it starts,
// the console, a judge's phone, the Flag view and the public live page all count down from 6:00 (at ×10: 0:36) and the heat ends there.
// Throwaway organisation (removed by the ledger); Arrow, EKL and Demo are never touched. One worker, no retries.
let w: LiveWorld;
const phones: BrowserContext[] = [];
test.afterEach(async () => {
  await closePhones(phones);
  await w?.cleanup();
});

async function open(browser: Browser, viewport: { width: number; height: number }, go: (page: Page) => Promise<void>): Promise<Page> {
  const context = await browser.newContext({ viewport });
  phones.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await go(page);
  return page;
}
const heatRow = async () => (await w.db.from("heats").select("status, started_at, ended_at, duration_sec").eq("id", w.heats[0]).single()).data!;
const clock = async (p: Page, id: string) => {
  const [m, s] = (await p.getByTestId(id).first().innerText()).trim().match(/\d+:\d\d/)![0].split(":").map(Number);
  return m * 60 + s;
};
async function setup(flags: { prestartSec: number }) {
  w = await createLiveWorld({ flags: true });
  const { data } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  await w.db.from("events").update({ settings: { ...((data?.settings ?? {}) as object), flags: { enabled: true, prestartSec: flags.prestartSec, lastMinuteSec: 60 } } as never }).eq("id", w.eventId);
  // the draw gave the heats 10:00; the organiser sets the first heat to 6 minutes in the run order (the second keeps the draw's)
  const items = [{ id: "i1", kind: "heat", heatId: w.heats[0], durationMin: 6 }, { id: "i2", kind: "heat", heatId: w.heats[1] }];
  const r = await w.db.from("schedule_plans").update({ items: items as never }).eq("id", w.planId);
  expect(r.error).toBeNull();
}

test("×1: set to 6 minutes in the run order, the heat starts and every screen counts down from 6:00; it ends at 6:00; the other heat keeps the draw's 10:00", async ({ browser }) => {
  test.setTimeout(240_000);
  await setup({ prestartSec: 10 });
  expect((await w.db.from("heats").select("duration_sec").eq("id", w.heats[0]).single()).data?.duration_sec).toBe(360);
  expect((await w.db.from("heats").select("duration_sec").eq("id", w.heats[1]).single()).data?.duration_sec).toBe(600);

  const head = await open(browser, { width: 1280, height: 800 }, (p) => w.signInAs(p, "head", `/head/${w.eventId}`));
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 45_000 });
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
  await head.getByTestId("start").click();
  await expect.poll(async () => (await heatRow()).status, { timeout: 45_000, intervals: [500] }).toBe("running");
  const started = await heatRow();
  expect(started.duration_sec).toBe(360);

  const judge = await open(browser, { width: 390, height: 844 }, (p) => w.signInAs(p, "j1", `/judge/${w.eventId}`));
  const flag = await open(browser, { width: 390, height: 844 }, async (p) => void (await p.goto(`/e/e2e-live-${w.org.run}/flag`)));
  const live = await open(browser, { width: 390, height: 844 }, async (p) => void (await p.goto(`/e/e2e-live-${w.org.run}/live`)));

  await expect(flag.getByTestId("flag-countdown")).toHaveText(/^[0-6]:\d\d$/, { timeout: 45_000 });
  await expect(live.getByTestId("heat-clock")).toContainText(/left/, { timeout: 45_000 });
  await expect(judge.getByTestId("heat-timer-clock").first()).toBeVisible({ timeout: 45_000 });
  for (const [name, read] of [
    ["console", () => clock(head, "heat-timer-clock")],
    ["judge phone", () => clock(judge, "heat-timer-clock")],
    ["Flag view", () => clock(flag, "flag-countdown")],
    ["public live page", () => clock(live, "heat-clock")],
  ] as const) {
    const left = await read();
    expect(left, `${name} counts down from 6:00 (it showed ${left}s)`).toBeLessThanOrEqual(360);
    expect(left, `${name} counts down from 6:00 (it showed ${left}s)`).toBeGreaterThan(300);
  }

  // it ends at 6:00: bring the start back so five seconds are left and watch the clock end it
  await w.db.from("heats").update({ started_at: new Date(Date.now() - 355_000).toISOString() }).eq("id", w.heats[0]);
  await expect.poll(async () => (await heatRow()).ended_at, { timeout: 60_000, intervals: [500] }).not.toBeNull();
  const done = await heatRow();
  expect((Date.parse(done.ended_at!) - Date.parse(done.started_at!)) / 1000).toBeGreaterThanOrEqual(359);
  expect((Date.parse(done.ended_at!) - Date.parse(done.started_at!)) / 1000).toBeLessThanOrEqual(361);
});

test("×10 simulation: the 6 minutes of the run order run as 0:36 on the console and the judge's phone, and the heat ends after 36 real seconds", async ({ browser }) => {
  test.setTimeout(240_000);
  await setup({ prestartSec: 10 });
  await w.db.from("events").update({ is_simulation: true }).eq("id", w.eventId);
  await w.db.from("sim_control").upsert({ event_id: w.eventId, speed: 10 });

  const head = await open(browser, { width: 1280, height: 800 }, (p) => w.signInAs(p, "head", `/head/${w.eventId}`));
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 45_000 });
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
  await head.getByTestId("start").click();
  await expect.poll(async () => (await heatRow()).status, { timeout: 45_000, intervals: [250] }).toBe("running");
  const started = await heatRow();
  expect(started.duration_sec).toBe(36);
  expect((await w.db.from("sim_clock").select("original_sec, speed").eq("heat_id", w.heats[0]).single()).data).toEqual({ original_sec: 360, speed: 10 });

  const judge = await open(browser, { width: 390, height: 844 }, (p) => w.signInAs(p, "j1", `/judge/${w.eventId}`));
  const t0 = Date.now();
  await expect(judge.getByTestId("heat-timer-clock").first()).toBeVisible({ timeout: 45_000 });
  for (const [name, read] of [["console", () => clock(head, "heat-timer-clock")], ["judge phone", () => clock(judge, "heat-timer-clock")]] as const) {
    const left = await read();
    expect(left, `${name} counts down from 0:36 (it showed ${left}s)`).toBeLessThanOrEqual(36);
    expect(left, `${name} counts down from 0:36 (it showed ${left}s)`).toBeGreaterThan(0);
  }
  await expect.poll(async () => (await heatRow()).ended_at, { timeout: 60_000, intervals: [500] }).not.toBeNull();
  const done = await heatRow();
  const real = (Date.parse(done.ended_at!) - Date.parse(done.started_at!)) / 1000;
  expect(real, "real seconds the heat ran").toBeGreaterThanOrEqual(35);
  expect(real, "real seconds the heat ran").toBeLessThanOrEqual(37);
  void t0;
});
