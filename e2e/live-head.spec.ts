import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { BrowserContext, Page } from "@playwright/test";

// Phase 5b step 1 on a throwaway event: the head judge runs a whole heat from a phone: Start (with its refusals in plain words), Pause, Resume, End, Hold,
// Resume at, Shift, Cancel, and the rider totals as they come in. The clock is the database's: a phone whose own clock is an hour wrong still agrees.
let w: LiveWorld;
test.beforeEach(async () => {
  w = await createLiveWorld();
});
test.afterEach(async () => {
  await w?.cleanup();
});
const phones: BrowserContext[] = [];
test.afterEach(async () => {
  await closePhones(phones);
});
async function phone(browser: import("@playwright/test").Browser, key: Parameters<LiveWorld["signInAs"]>[1], path: string, skewMs = 0): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  phones.push(context);
  await installSupabaseProxy(context);
  if (skewMs) await context.addInitScript((skew) => { const real = Date.now.bind(Date); Date.now = () => real() + skew; }, skewMs);
  const page = await context.newPage();
  await w.signInAs(page, key, path);
  return page;
}
const row = (p: Page, heat: string) => p.locator(`[data-testid="order-row"][data-heat="${heat}"]`);
const heatRow = async (id: string) => (await w.db.from("heats").select("status, started_at, paused_at, paused_total_sec, ended_at").eq("id", id).single()).data!;
const message = (p: Page) => p.getByTestId("control-message");
const clockSeconds = async (p: Page) => {
  const text = (await p.getByTestId("heat-timer-clock").first().innerText()).trim();
  const [m, s] = text.split(":").map(Number);
  return m * 60 + s;
};

test("the head judge runs a whole heat from a phone: Start refused in plain words, Start, Pause, Resume, Hold, Resume at, Shift, End", async ({ browser }) => {
  test.setTimeout(300_000);
  await w.db.from("divisions").update({ draw_locked_at: null }).eq("id", w.divisionId);
  // The run order is for tomorrow, so "Resume at 23:30" is in the future at any hour (the engine never puts a start in the past: on today's plan this test failed after 23:30).
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(Date.now() + 36 * 3600_000);
  await w.db.from("schedule_plans").update({ day: tomorrow }).eq("id", w.planId);
  const head = await phone(browser, "head", `/head/${w.eventId}`);
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 30_000 });
  await expect(head.getByTestId("order-row")).toHaveCount(2);
  await expect(row(head, w.heats[0])).toContainText("R1 · H1");
  await expect(row(head, w.heats[0])).toContainText(/est\. \d\d:\d\d/); // pinned at 10:00 "not before": today it starts when the day really is

  // the draw is not locked: refused, in words
  await row(head, w.heats[0]).click();
  await head.getByTestId("start").click();
  // a refusal sentence carries a "Learn more" link to the manual page that explains it
  await expect(message(head)).toContainText("Draw for Pro Men is not locked — lock it in the Draw step");
  await expect(message(head).getByRole("link", { name: "Learn more" })).toBeVisible();
  expect((await heatRow(w.heats[0])).status).toBe("scheduled");

  // locked: Start works, the clock runs
  await w.db.from("divisions").update({ draw_locked_at: new Date().toISOString() }).eq("id", w.divisionId);
  await head.getByTestId("start").click();
  await expect(message(head)).toHaveText("Pro Men · R1 · Heat 1 started.");
  await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "running");
  const a = await clockSeconds(head);
  expect(a).toBeGreaterThan(590);
  await head.waitForTimeout(2500);
  expect(await clockSeconds(head)).toBeLessThan(a);

  // one running heat per event: the second one is refused, in words
  await row(head, w.heats[1]).click();
  await head.getByTestId("start").click();
  await expect(message(head)).toContainText("Another heat is already running (1 at a time)");
  await row(head, w.heats[0]).click();

  // Pause freezes the clock; Resume continues it
  await head.getByTestId("pause").click();
  await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "paused");
  const frozen = await clockSeconds(head);
  await head.waitForTimeout(2500);
  expect(await clockSeconds(head)).toBe(frozen);
  await head.getByTestId("resume").click();
  await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "running");

  // Hold the run order, then Resume at 23:30: the next heat that has not started is pinned there
  await head.getByTestId("hold").click();
  await expect(message(head)).toHaveText("Run order on hold.");
  await expect(head.getByTestId("hold-panel")).toContainText("on hold since");
  await expect.poll(async () => (await w.db.from("schedule_plans").select("hold").eq("id", w.planId).single()).data?.hold).not.toBeNull();
  const held = (await w.db.from("schedule_plans").select("hold").eq("id", w.planId).single()).data!.hold as { since: string };
  expect(Math.abs(Date.parse(held.since) - Date.now())).toBeLessThan(60_000);
  await head.getByTestId("restart-time").fill("23:30");
  await head.getByTestId("resume-at").click();
  await expect(message(head)).toHaveText("Run order restarts at 23:30.");
  const plan = (await w.db.from("schedule_plans").select("hold, anchors").eq("id", w.planId).single()).data!;
  expect(plan.hold).toBeNull();
  expect((plan.anchors as Record<string, string>).i2).toBe("23:30");
  await expect(row(head, w.heats[1])).toContainText("est. 23:30");

  // Shift +5 pins the next heat five minutes later than it was
  await head.getByTestId("shift5").click();
  await expect(message(head)).toHaveText("Everything not started moved 5 minutes later.");
  await expect.poll(async () => ((await w.db.from("schedule_plans").select("anchors").eq("id", w.planId).single()).data!.anchors as Record<string, string>).i2).toBe("23:35");

  // End; the ended heat and its start are in the database
  await head.getByTestId("end").click();
  await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "ended");
  const done = await heatRow(w.heats[0]);
  expect(done.status).toBe("ended");
  expect(done.started_at).not.toBeNull();
  expect(done.ended_at).not.toBeNull();
  // every action is audited
  const actions = ((await w.db.from("audit_log").select("action").eq("row_id", w.heats[0]).order("at")).data ?? []).map((r) => r.action);
  expect(actions).toEqual(["heat_started", "heat_paused", "heat_resumed", "heat_ended"]);
});

test("Cancel heat needs a reason and keeps what ran; rider totals appear as scores come in", async ({ browser }) => {
  test.setTimeout(240_000);
  await w.startHeat(w.heats[0]);
  const head = await phone(browser, "head", `/head/${w.eventId}`);
  await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "running", { timeout: 30_000 });
  // an attempt and three scores: Red's total is on the head's phone
  const attempt = (await w.db.from("trick_attempts").insert({ heat_id: w.heats[0], entry_id: w.entries[0], seq: 1, status: "landed", trick_name: "Left Backroll", direction: "left", client_key: crypto.randomUUID() }).select("id").single()).data!;
  for (const [i, key] of (["j1", "j2", "j3"] as const).entries()) await w.db.from("trick_scores").insert({ attempt_id: attempt.id, judge_seat_id: w.seats[key].id, score: [7.5, 8, 7][i], client_key: crypto.randomUUID(), client_rev: 1 });
  await head.getByTestId("details-toggle").click(); // on a phone the rider totals and the blocker list are behind Details
  const totals = head.getByTestId("rider-totals");
  await expect(totals.getByTestId("total-row").first()).toContainText("RED", { timeout: 30_000 });
  await expect(totals.getByTestId("total-row").first().getByTestId("total-value")).toHaveText("7.5", { timeout: 30_000 });
  await expect(totals.getByTestId("total-row").first()).toContainText("1 / 7 attempts");

  await head.getByTestId("cancel").click();
  await expect(head.getByTestId("cancel-confirm")).toBeDisabled();
  await head.getByTestId("cancel-reason").fill("kite tangle");
  await head.getByTestId("cancel-confirm").click();
  await expect(message(head)).toHaveText("Pro Men · R1 · Heat 1 cancelled.");
  const row0 = await heatRow(w.heats[0]);
  expect(row0.status).toBe("cancelled");
  expect(row0.started_at).not.toBeNull();
  expect(row0.ended_at).not.toBeNull();
  expect(((await w.db.from("audit_log").select("reason").eq("row_id", w.heats[0]).eq("action", "heat_cancelled")).data ?? [])[0]?.reason).toBe("kite tangle");
});

test("the head page and a judge phone agree within a second, even when the phone's own clock is 40 s fast; at 0:00 the heat ends without anyone pressing End", async ({ browser }) => {
  test.setTimeout(240_000);
  await w.db.from("heats").update({ status: "running", started_at: new Date(Date.now() - 540_000).toISOString() }).eq("id", w.heats[0]);
  const head = await phone(browser, "head", `/head/${w.eventId}`);
  const judge = await phone(browser, "j1", `/judge/${w.eventId}`, 40_000); // this phone's clock is 40 seconds fast
  await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "running", { timeout: 30_000 });
  await expect(judge.getByTestId("heat-timer-clock")).toBeVisible({ timeout: 30_000 });
  await head.waitForTimeout(1500); // both clocks have measured the server's time
  const [h, j] = await Promise.all([clockSeconds(head), clockSeconds(judge)]);
  expect(Math.abs(h - j)).toBeLessThanOrEqual(1);
  expect(h).toBeLessThan(55);
  // time up: both say so, and the database has ended the heat by itself
  await expect(head.getByTestId("selected-heat").getByTestId("heat-timer-state")).toContainText("Time up", { timeout: 90_000 });
  await expect(judge.getByTestId("heat-timer-state")).toContainText("Time up", { timeout: 90_000 });
  await expect.poll(async () => (await heatRow(w.heats[0])).status, { timeout: 60_000 }).toBe("ended");
  const lines = ((await w.db.from("audit_log").select("action").eq("row_id", w.heats[0])).data ?? []).map((r) => r.action);
  expect(lines).toContain("heat_ended_by_clock");
});

test("the organiser's Hold, Resume at and Shift use the server's time, not the device's", async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  phones.push(context);
  await installSupabaseProxy(context);
  await context.addInitScript(() => { const real = Date.now.bind(Date); Date.now = () => real() - 7_200_000; }); // this laptop's clock is two hours behind
  const page = await context.newPage();
  await w.org.signIn(page, `/org/events/${w.eventId}/schedule`);
  await expect(page.getByTestId("live-overrides")).toBeVisible({ timeout: 40_000 });
  await page.getByRole("button", { name: "Hold", exact: true }).click();
  await expect.poll(async () => (await w.db.from("schedule_plans").select("hold").eq("id", w.planId).single()).data?.hold, { timeout: 30_000 }).not.toBeNull();
  const held = (await w.db.from("schedule_plans").select("hold").eq("id", w.planId).single()).data!.hold as { since: string };
  expect(Math.abs(Date.parse(held.since) - Date.now())).toBeLessThan(60_000); // the database's moment, not the laptop's
});
