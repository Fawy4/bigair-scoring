import { test, expect, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import { endedHeat, eventSettings, judgesFinish, laptop, phone as openPhone, phoneSize } from "./heat-end-helpers";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// HE1 rule 6: after Publish the console selects the next heat; "Start the next heat" decides whether anything starts by itself. Throwaway organisation, production build, ONE
// worker. The wait for the ten-second notice is real (10 s); the run order time mode uses a heat pinned to a minute about a minute away and a 10-second pre-start.
let w: LiveWorld;
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld({ headScores: false });
});
test.afterEach(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});
const phone = (browser: Browser, key: Parameters<LiveWorld["signInAs"]>[1], path: string, size?: { width: number; height: number }): Promise<Page> => openPhone(w, contexts, browser, key, path, size);
const heatRow = async (id: string) => (await w.db.from("heats").select("status, armed_at, prestart_sec, started_at, auto_start_at, auto_start_mode").eq("id", id).single()).data!;
const audits = async (action: string) => (await w.db.from("audit_log").select("action, reason").eq("event_id", w.eventId).eq("action", action)).data ?? [];

/** Heat 1 is ended and complete (every judge in); the head judge opens it and presses Publish. */
async function publishFirstHeat(head: Page) {
  await endedHeat(w, w.heats[0]);
  await judgesFinish(w, w.heats[0]);
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click({ timeout: 60_000 });
  await expect(head.getByTestId("review-bar")).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
  await head.getByTestId("publish").click();
  await head.getByRole("button", { name: "Yes, publish" }).click();
}

test("by hand (the default): Publish selects the next heat and nothing starts", async ({ browser }) => {
  test.setTimeout(400_000);
  const head = await phone(browser, "head", `/head/${w.eventId}`, laptop);
  await publishFirstHeat(head);
  await expect(head.getByTestId("control-message").first()).toContainText("Next heat: Pro Men · R1 · Heat 2", { timeout: 60_000 });
  await expect(head.getByTestId("head-live-console")).toHaveAttribute("data-heat", w.heats[1], { timeout: 60_000 });
  await expect(head.getByTestId("auto-start")).toHaveCount(0); // an event that starts by hand shows nothing of auto start
  await head.waitForTimeout(13_000);
  expect(await heatRow(w.heats[1])).toMatchObject({ status: "scheduled", armed_at: null, auto_start_at: null });
});

test("after the last heat the console says so", async ({ browser }) => {
  test.setTimeout(400_000);
  const head = await phone(browser, "head", `/head/${w.eventId}`, laptop);
  await w.db.from("heats").update({ status: "published", started_at: new Date(Date.now() - 3_000_000).toISOString(), ended_at: new Date(Date.now() - 2_400_000).toISOString(), published_at: new Date(Date.now() - 2_300_000).toISOString() }).eq("id", w.heats[1]);
  await publishFirstHeat(head);
  await expect(head.getByTestId("control-message").first()).toContainText("That was the last heat of the run order.", { timeout: 60_000 });
});

test("Publish in the next division selects that division's first heat", async ({ browser }) => {
  test.setTimeout(400_000);
  const { addLadder } = await import("./live-world");
  const ladder = await addLadder(w);
  // the run order: heat 1 of Pro Men, then the first heat of the other division
  const first = Object.values(ladder.heats)[0];
  await w.db.from("schedule_plans").update({ items: [{ id: "i1", kind: "heat", heatId: w.heats[0] }, { id: "i2", kind: "heat", heatId: first }, { id: "i3", kind: "heat", heatId: w.heats[1] }] as never }).eq("id", w.planId);
  const head = await phone(browser, "head", `/head/${w.eventId}`, laptop);
  await publishFirstHeat(head);
  await expect(head.getByTestId("head-live-console")).toHaveAttribute("data-heat", first, { timeout: 60_000 });
  await expect(head.getByTestId("control-message").first()).toContainText("Next heat: Ladder", { timeout: 60_000 });
});

test("automatically after Publish: the notice counts down with Stop; not stopped, the heat's start sequence begins and the audit log says so", async ({ browser }) => {
  test.setTimeout(400_000);
  await eventSettings(w, { startNextHeat: "after_publish", flags: { enabled: true, prestartSec: 30 } });
  const head = await phone(browser, "head", `/head/${w.eventId}`, laptop);
  await publishFirstHeat(head);
  const notice = head.getByTestId("auto-start-notice");
  await expect(notice).toBeVisible({ timeout: 60_000 });
  await expect(head.getByTestId("auto-start-text")).toHaveText(/^Next heat sequence starts in \d+ s$/);
  await expect(head.getByTestId("auto-start-stop")).toHaveText("Stop");
  await expect(head.getByTestId("head-live-console")).toHaveAttribute("data-heat", w.heats[1]);
  // not stopped: the same start sequence as the head judge's button (the yellow with its pre-start), by itself
  await expect.poll(async () => (await heatRow(w.heats[1])).armed_at, { timeout: 60_000 }).not.toBeNull();
  expect(await heatRow(w.heats[1])).toMatchObject({ status: "scheduled", prestart_sec: 30, auto_start_at: null });
  await expect(notice).toHaveCount(0, { timeout: 30_000 });
  expect((await audits("heat_auto_started"))[0].reason).toContain("after Publish");
  await expect(head.getByTestId("heat-timer")).toHaveAttribute("data-flag", "before_start", { timeout: 40_000 }); // the yellow flag strip, as when the button is pressed
});

test("Stop pressed during the notice: nothing starts, the head judge starts it by hand; the switch turns auto start off and on", async ({ browser }) => {
  test.setTimeout(400_000);
  await eventSettings(w, { startNextHeat: "after_publish", flags: { enabled: true, prestartSec: 30 } });
  const head = await phone(browser, "head", `/head/${w.eventId}`, laptop);
  await publishFirstHeat(head);
  await expect(head.getByTestId("auto-start-notice")).toBeVisible({ timeout: 60_000 });
  await head.getByTestId("auto-start-stop").click();
  await expect(head.getByTestId("auto-start-notice")).toHaveCount(0, { timeout: 30_000 });
  await expect(head.getByTestId("auto-start-note")).toContainText("Stopped.");
  await head.waitForTimeout(13_000);
  expect(await heatRow(w.heats[1])).toMatchObject({ status: "scheduled", armed_at: null, auto_start_at: null });
  expect((await audits("auto_start_stopped")).length).toBeGreaterThan(0);

  // the switch: off for the rest of the event, on again
  await expect(head.getByTestId("auto-start-state")).toContainText("Auto start is on");
  await head.getByTestId("auto-start-switch").click();
  await expect(head.getByTestId("auto-start-state")).toHaveText("Auto start is off", { timeout: 30_000 });
  expect((await w.db.from("events").select("settings").eq("id", w.eventId).single()).data!.settings).toMatchObject({ autoStartOff: true });
  await head.getByTestId("auto-start-switch").click();
  await expect(head.getByTestId("auto-start-state")).toContainText("Auto start is on", { timeout: 30_000 });
  expect((await audits("auto_start_switched")).map((a) => a.reason)).toEqual(expect.arrayContaining(["Auto start switched off", "Auto start switched on"]));

  // and the head judge's own Start heat sequence still works
  await head.getByTestId("start").click();
  await expect.poll(async () => (await heatRow(w.heats[1])).armed_at, { timeout: 40_000 }).not.toBeNull();
});

test("a Hold that starts during the notice blocks the start: the notice ends, nothing starts, the audit log says why", async ({ browser }) => {
  test.setTimeout(400_000);
  await eventSettings(w, { startNextHeat: "after_publish", flags: { enabled: true, prestartSec: 30 } });
  const head = await phone(browser, "head", `/head/${w.eventId}`, laptop);
  await publishFirstHeat(head);
  await expect(head.getByTestId("auto-start-notice")).toBeVisible({ timeout: 60_000 });
  await w.db.from("schedule_plans").update({ hold: { since: new Date().toISOString() } }).eq("id", w.planId);
  await expect(head.getByTestId("auto-start-notice")).toHaveCount(0, { timeout: 40_000 });
  await head.waitForTimeout(3_000);
  expect(await heatRow(w.heats[1])).toMatchObject({ status: "scheduled", armed_at: null, auto_start_at: null });
  expect((await audits("auto_start_blocked"))[0].reason).toContain("on hold");
});

test("a Stop or Hold wind call blocks the start; with the run order already on Hold or a wind call on when Publish is pressed, no notice is raised and the console says why", async ({ browser }) => {
  test.setTimeout(400_000);
  await eventSettings(w, { startNextHeat: "after_publish", flags: { enabled: true, prestartSec: 30 } });
  await w.db.from("wind_calls").insert({ event_id: w.eventId, status: "amber", message: "Gusty" });
  const head = await phone(browser, "head", `/head/${w.eventId}`, laptop);
  await publishFirstHeat(head);
  await expect(head.getByTestId("control-message").first()).toContainText("Next heat:", { timeout: 60_000 });
  await expect(head.getByTestId("auto-start-note")).toContainText("a Stop or Hold wind call is on", { timeout: 40_000 });
  await head.waitForTimeout(13_000);
  expect(await heatRow(w.heats[1])).toMatchObject({ armed_at: null, auto_start_at: null });
});

test("on a phone the notice and Stop are there and big enough", async ({ browser }) => {
  test.setTimeout(400_000);
  await eventSettings(w, { startNextHeat: "after_publish", flags: { enabled: true, prestartSec: 30 } });
  await endedHeat(w, w.heats[0]);
  await judgesFinish(w, w.heats[0]);
  const head = await phone(browser, "head", `/head/${w.eventId}`, phoneSize);
  await expect(head.getByTestId("review-bar")).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
  await head.getByTestId("publish").click();
  await head.getByRole("button", { name: "Yes, publish" }).click();
  const stop = head.getByTestId("auto-start-stop");
  await expect(stop).toBeVisible({ timeout: 60_000 });
  const b = (await stop.boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(44);
  expect(b.width).toBeGreaterThanOrEqual(44);
  expect(await head.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await stop.click();
  await expect(head.getByTestId("auto-start-notice")).toHaveCount(0, { timeout: 30_000 });
});

test("at the run order time: the sequence starts so that the heat itself begins at its time, after the same ten-second notice", async ({ browser }) => {
  test.setTimeout(600_000);
  // a minute boundary 70–130 s away; the pre-start is 10 s, so the notice shows from 20 s before and the sequence starts 10 s before the heat
  const anchorMs = Math.ceil((Date.now() + 70_000) / 60_000) * 60_000;
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(anchorMs));
  await eventSettings(w, { startNextHeat: "run_order", flags: { enabled: true, prestartSec: 10 } });
  // heat 1 was published long ago, heat 2 is pinned to the minute and is a short test heat
  await w.db.from("heats").update({ status: "published", started_at: new Date(Date.now() - 3_000_000).toISOString(), ended_at: new Date(Date.now() - 2_400_000).toISOString(), published_at: new Date(Date.now() - 2_300_000).toISOString() }).eq("id", w.heats[0]);
  await w.db.from("heats").update({ duration_sec: 40 }).eq("id", w.heats[1]);
  await w.db.from("schedule_plans").update({ anchors: { i2: local } as never }).eq("id", w.planId);
  const head = await phone(browser, "head", `/head/${w.eventId}`, laptop);
  await expect(head.getByTestId("head-live-console")).toBeVisible({ timeout: 60_000 });
  await expect(head.getByTestId("auto-start-state")).toContainText("Auto start is on (at the run order time)");
  // nothing before the notice
  expect((await heatRow(w.heats[1])).auto_start_at).toBeNull();
  await expect(head.getByTestId("auto-start-notice")).toBeVisible({ timeout: 150_000 });
  await expect(head.getByTestId("auto-start-notice")).toHaveAttribute("data-seconds", /^(10|9|8)$/);
  // the sequence begins about 10 s before the heat's time and the heat itself starts at its time (within a few seconds)
  await expect.poll(async () => (await heatRow(w.heats[1])).armed_at, { timeout: 60_000 }).not.toBeNull();
  const armed = Date.parse((await heatRow(w.heats[1])).armed_at!);
  expect(Math.abs(armed - (anchorMs - 10_000))).toBeLessThan(5_000);
  await expect.poll(async () => (await heatRow(w.heats[1])).status, { timeout: 60_000 }).toBe("running");
  const started = Date.parse((await heatRow(w.heats[1])).started_at!);
  expect(Math.abs(started - anchorMs)).toBeLessThan(5_000);
  expect((await audits("heat_auto_started"))[0].reason).toContain("run order time");
});
