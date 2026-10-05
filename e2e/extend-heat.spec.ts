import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// Polish 4, F: "+1 min" on a running heat. A 100-second heat started 60 s ago (0:40 left, inside the last minute). The head presses +1 min: the judge's phone, the Flag
// view and the public live page show about 1:40, the flag is green again, the yellow and its one horn come back at 1:00, and the heat ends at the new 0:00.
// Throwaway organisation. One worker, no retries.
let w: LiveWorld;
const phones: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld({ flags: true });
  await w.db.from("heats").update({ duration_sec: 100 }).in("id", w.heats);
  const { data } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  await w.db.from("events").update({ status: "live", settings: { ...((data?.settings ?? {}) as object), publicLiveScores: "live", livePollSec: 3, flags: { enabled: true, prestartSec: 10, lastMinuteSec: 60 } } as never }).eq("id", w.eventId);
});
test.afterEach(async () => {
  await closePhones(phones);
  await w?.cleanup();
});

async function open(browser: Browser, viewport: { width: number; height: number }, go: (page: Page) => Promise<void>, spyHorn = false): Promise<Page> {
  const context = await browser.newContext({ viewport });
  phones.push(context);
  await installSupabaseProxy(context);
  if (spyHorn) {
    // every horn is a Web Audio oscillator: count them
    await context.addInitScript(() => {
      const w = window as unknown as { __osc: number };
      w.__osc = 0;
      const proto = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)?.prototype;
      if (proto) {
        const original = proto.createOscillator;
        proto.createOscillator = function (this: AudioContext) {
          w.__osc += 1;
          return original.call(this);
        };
      }
    });
  }
  const page = await context.newPage();
  await go(page);
  return page;
}
const secondsOf = async (p: Page, id: string) => {
  const [m, s] = (await p.getByTestId(id).first().innerText()).trim().split(":").map(Number);
  return m * 60 + s;
};
const horns = (p: Page) => p.evaluate(() => (window as unknown as { __osc: number }).__osc);

test("+1 min at 0:40: every screen shows about 1:40, the flag is green again, the yellow and its horn come back at 1:00, the heat ends at the new 0:00", async ({ browser }) => {
  test.setTimeout(300_000);
  const head = await open(browser, { width: 1280, height: 800 }, (p) => w.signInAs(p, "head", `/head/${w.eventId}`));
  const judge = await open(browser, { width: 390, height: 844 }, (p) => w.signInAs(p, "j1", `/judge/${w.eventId}`));
  const marshal = await open(browser, { width: 390, height: 844 }, async (p) => void (await p.goto(`/e/e2e-live-${w.org.run}/flag`)), true);
  const pub = await open(browser, { width: 390, height: 844 }, async (p) => void (await p.goto(`/e/e2e-live-${w.org.run}/live`)));
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 45_000 });

  // the heat has been running for 60 s: 0:40 left, so the flag is in its last minute everywhere
  await w.db.from("heats").update({ status: "running", started_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", w.heats[0]);
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
  await marshal.getByRole("button", { name: /sound/i }).click(); // the Flag view sounds its horns only after this tap
  await expect(marshal.getByTestId("flag-view")).toHaveAttribute("data-flag", "last_minute", { timeout: 30_000 });
  await expect(head.getByTestId("extend-heat")).toBeVisible();
  const hornsBefore = await horns(marshal);

  // press +1 min
  const pressed = Date.now();
  await head.getByTestId("extend-heat").click();
  await expect(marshal.getByTestId("flag-view")).toHaveAttribute("data-flag", "running", { timeout: 15_000 });
  const shownAfter = Date.now() - pressed;
  console.log(`Flag view back to green ${shownAfter} ms after the press (fallback polling in this sandbox)`);
  const row = (await w.db.from("heats").select("duration_sec, extra_sec, status").eq("id", w.heats[0]).single()).data!;
  expect(row).toMatchObject({ duration_sec: 160, extra_sec: 60, status: "running" });
  // about 1:40 on the judge's phone, the Flag view and the public live page (the time has run on since the press)
  await expect.poll(async () => secondsOf(judge, "heat-timer-clock"), { timeout: 15_000 }).toBeGreaterThan(90);
  expect(await secondsOf(judge, "heat-timer-clock")).toBeLessThanOrEqual(100);
  expect(await secondsOf(marshal, "flag-countdown")).toBeGreaterThan(85);
  expect(await secondsOf(marshal, "flag-countdown")).toBeLessThanOrEqual(100);
  // (the public page asks every few seconds: its clock is the old end's 0:xx without the extension, 1:xx with it)
  await expect.poll(async () => (await pub.getByTestId("heat-clock").first().innerText()).trim(), { timeout: 20_000 }).toMatch(/^1:\d\d/);
  // no horn for the flag going back to green
  expect(await horns(marshal)).toBe(hornsBefore);
  await expect(head.getByTestId("heat-timer").first()).toHaveAttribute("data-flag", "running");

  // the yellow and its horn return at 1:00, once
  await expect(marshal.getByTestId("flag-view")).toHaveAttribute("data-flag", "last_minute", { timeout: 60_000 });
  await expect.poll(async () => horns(marshal), { timeout: 5_000 }).toBeGreaterThan(hornsBefore);
  const afterYellow = await horns(marshal);
  await marshal.waitForTimeout(3000);
  expect(await horns(marshal)).toBe(afterYellow);
  expect(await secondsOf(judge, "heat-timer-clock")).toBeLessThanOrEqual(60);

  // the heat ends at the new 0:00 (not at the old one)
  await expect(marshal.getByTestId("flag-view")).toHaveAttribute("data-flag", "stopped", { timeout: 90_000 });
  const startedAt = Date.parse((await w.db.from("heats").select("started_at").eq("id", w.heats[0]).single()).data!.started_at!);
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(158_000);
});

test("+1 min is off when the heat is not running, and the refusal is in words", async ({ browser }) => {
  test.setTimeout(180_000);
  const head = await open(browser, { width: 1280, height: 800 }, (p) => w.signInAs(p, "head", `/head/${w.eventId}`));
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 45_000 });
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
  await expect(head.getByTestId("extend-heat")).toHaveCount(0); // not started
  await w.db.from("heats").update({ status: "running", started_at: new Date(Date.now() - 10_000).toISOString() }).eq("id", w.heats[0]);
  await expect(head.getByTestId("extend-heat")).toBeVisible({ timeout: 30_000 });
  // the heat is paused behind the screen's back: pressing is refused in the house style
  await w.db.from("heats").update({ status: "paused", paused_at: new Date().toISOString() }).eq("id", w.heats[0]);
  await head.getByTestId("extend-heat").click();
  await expect(head.getByText("The heat is not running.")).toBeVisible({ timeout: 15_000 });
  expect((await w.db.from("heats").select("extra_sec").eq("id", w.heats[0]).single()).data?.extra_sec).toBe(0);
});
