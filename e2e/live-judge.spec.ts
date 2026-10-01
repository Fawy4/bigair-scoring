import { test, expect, installSupabaseProxy } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { BrowserContext, Page } from "@playwright/test";

// Phase 5b step 3 on a throwaway event: two judge phones and a spotter. Each attempt lands on both judge phones, one tap scores it (Missed is an answer),
// 20 seconds without a connection lose and duplicate nothing, a reload keeps what was not sent yet, and at time up the Impression / Variety step opens
// with the summary card; Submit asks once and locks the sheet. In this sandbox the browser cannot open the Realtime WebSocket, so the phones follow the
// heat through the 5 second fallback; the Realtime path itself is tested in tests/rls/live-realtime.test.ts.
let w: LiveWorld;
test.beforeEach(async () => {
  w = await createLiveWorld();
});
test.afterEach(async () => {
  await w?.cleanup();
});

const phones: BrowserContext[] = [];
test.afterEach(async () => {
  while (phones.length) await phones.pop()!.close();
});
async function phone(browser: import("@playwright/test").Browser, key: Parameters<LiveWorld["signInAs"]>[1], path: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  phones.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await w.signInAs(page, key, path);
  return page;
}
const attempts = async (entry = w.entries[0]) => (await w.db.from("trick_attempts").select("id, seq, status").eq("heat_id", w.heats[0]).eq("entry_id", entry).is("deleted_at", null).order("seq")).data ?? [];
const scores = async (judge: string) => (await w.db.from("trick_scores").select("attempt_id, score, missed, version").eq("heat_id", w.heats[0]).eq("judge_seat_id", w.seats[judge as "j1"].id)).data ?? [];
const score = async (p: Pick<Page, "getByRole">, whole: number, half: "0" | "5") => {
  await p.getByRole("button", { name: `Set ${whole}`, exact: true }).click();
  await p.getByRole("button", { name: `Set .${half}` }).click();
};
const log = async (spotter: Page, trick: [string, string]) => {
  await spotter.locator(`[data-block="${trick[0]}"]`).click();
  await spotter.locator(`[data-block="${trick[1]}"]`).click();
  await spotter.getByTestId("log-button").click();
};

test("two judge phones see each attempt, score it with one tap, Missed counts, a crash never needs a score; 20 s offline and a reload lose and duplicate nothing", async ({ browser }) => {
  test.setTimeout(420_000);
  await w.startHeat(w.heats[0]);
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`);
  const j2 = await phone(browser, "j2", `/judge/${w.eventId}`);
  await expect(spotter.getByTestId("trick-builder")).toBeVisible({ timeout: 30_000 });
  for (const p of [j1, j2]) await expect(p.getByTestId("all-scored")).toBeVisible({ timeout: 30_000 });

  // the spotter logs Red; both judges get the card
  const t0 = Date.now();
  await log(spotter, ["direction:left", "base:backroll"]);
  await spotter.locator('[data-block="direction:left"]').click(); // (the builder is empty again; this only warms the next trick)
  await spotter.locator('[data-block="direction:left"]').click();
  for (const p of [j1, j2]) await expect(p.getByTestId("queue-card")).toContainText("Left Backroll", { timeout: 20_000 });
  console.log(`attempt reached both judge phones after ${Date.now() - t0} ms (fallback polling in this sandbox)`);
  await expect(j1.getByTestId("queue-card")).toContainText("RED");
  await expect(j1.getByTestId("queue-card")).toContainText("Sam Rivera");

  // Judge 1 taps 7.5; Judge 2 taps Missed
  await score(j1, 7, "5");
  await expect(j1.getByTestId("pad-caption")).toHaveCount(0); // the card moved on: nothing waits any more
  await j1.getByTestId("details-toggle").click();
  await j1.getByTestId("details-toggle").click();
  await expect.poll(async () => (await scores("j1"))[0]?.score ?? null, { timeout: 20_000 }).toBe(7.5);
  await j2.getByTestId("missed-button").click();
  await expect.poll(async () => (await scores("j2"))[0]?.missed ?? false, { timeout: 20_000 }).toBe(true);

  // more attempts for the offline part
  await log(spotter, ["direction:right", "base:frontroll"]);
  await log(spotter, ["direction:left", "base:kiteloop"]);
  await expect(j1.getByTestId("queue-card")).toContainText("Right Frontroll", { timeout: 20_000 });
  await expect(j1.getByTestId("waiting-pill")).toContainText("1 waiting", { timeout: 20_000 });

  // 20 seconds without a connection: score the card, change it, score the next one
  const blocked = async (route: import("@playwright/test").Route) => route.abort("internetdisconnected");
  await j1.context().route(/https:\/\/[a-z0-9]+\.supabase\.co\/rest\//, blocked);
  await score(j1, 7, "0");
  await expect(j1.getByTestId("queue-card")).toContainText("Left Kiteloop");
  await j1.getByTestId("history-row").first().click(); // correct Right Frontroll: 7.0 becomes 8.0
  await expect(j1.getByTestId("queue-card")).toContainText("Right Frontroll");
  await score(j1, 8, "0");
  await expect(j1.getByTestId("queue-card")).toContainText("Left Kiteloop");
  await score(j1, 6, "5");
  await expect(j1.getByTestId("connection-badge")).toContainText("Pending");
  await j1.waitForTimeout(20_000);
  expect((await scores("j1")).length).toBe(1); // nothing reached the server while it was cut
  await j1.context().unroute(/https:\/\/[a-z0-9]+\.supabase\.co\/rest\//, blocked);
  await expect.poll(async () => (await scores("j1")).length, { timeout: 60_000 }).toBe(3);
  await expect(j1.getByTestId("connection-badge")).not.toContainText("Pending", { timeout: 60_000 });
  const rows = await scores("j1");
  expect(rows.map((r) => r.score).sort()).toEqual([6.5, 7.5, 8]); // exactly one row per attempt, the newest values won
  expect(new Set((await w.db.from("trick_scores").select("attempt_id").eq("heat_id", w.heats[0]).eq("judge_seat_id", w.seats.j1.id)).data?.map((r) => r.attempt_id)).size).toBe(3);

  // a reload while the connection is cut keeps what was not sent yet
  await log(spotter, ["direction:right", "base:megaloop"]);
  await expect(j1.getByTestId("queue-card")).toContainText("Right Megaloop", { timeout: 20_000 });
  await j1.context().route(/https:\/\/[a-z0-9]+\.supabase\.co\/rest\//, blocked);
  await score(j1, 9, "0");
  await expect(j1.getByTestId("connection-badge")).toContainText("Pending 1");
  await j1.reload();
  await expect(j1.getByTestId("connection-badge")).toContainText("Pending 1", { timeout: 30_000 });
  await j1.context().unroute(/https:\/\/[a-z0-9]+\.supabase\.co\/rest\//, blocked);
  await expect.poll(async () => (await scores("j1")).length, { timeout: 60_000 }).toBe(4);
});

test("a crash never enters the judge's queue; 'That was a landing' reaches the head judge", async ({ browser }) => {
  test.setTimeout(240_000);
  await w.startHeat(w.heats[0]);
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`);
  await expect(spotter.getByTestId("trick-builder")).toBeVisible({ timeout: 30_000 });
  await expect(j1.getByTestId("all-scored")).toBeVisible({ timeout: 30_000 });
  await spotter.locator('[data-block="base:backroll"]').click();
  await spotter.getByTestId("crash-button").click();
  await spotter.getByTestId("crash-yes").click();
  await expect(j1.getByTestId("history-row")).toHaveCount(1, { timeout: 20_000 });
  await expect(j1.getByTestId("history-row")).toContainText("Crashed");
  await expect(j1.getByTestId("queue-card")).toHaveCount(0);
  await j1.getByTestId("history-row").click();
  await j1.locator('[data-flag="landed"]').click();
  await expect.poll(async () => ((await w.db.from("attempt_flags").select("kind").eq("heat_id", w.heats[0])).data ?? []).map((f) => f.kind), { timeout: 30_000 }).toEqual(["landed"]);
});

test("at time up the Impression / Variety step opens with the summary card; Submit waits for every rider, asks once, and locks the sheet", async ({ browser }) => {
  test.setTimeout(300_000);
  await w.startHeat(w.heats[0]);
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`);
  await expect(spotter.getByTestId("trick-builder")).toBeVisible({ timeout: 30_000 });
  await log(spotter, ["direction:left", "base:backroll"]);
  await expect(j1.getByTestId("queue-card")).toContainText("Left Backroll", { timeout: 20_000 });
  await score(j1, 7, "5");
  await expect.poll(async () => (await scores("j1")).length, { timeout: 20_000 }).toBe(1);
  // the clock runs out: started 601 seconds ago
  await w.db.from("heats").update({ started_at: new Date(Date.now() - 601_000).toISOString() }).eq("id", w.heats[0]);
  const card = j1.getByTestId("impression-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(j1.getByTestId("heat-timer-state")).toContainText("Time up");
  await expect(card.getByTestId("heat-summary")).toContainText("1 attempts · 1 landed · 0 crashed");
  await expect(card.getByTestId("impression-progress")).toHaveText("0 / 4 riders");
  await expect(card.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
  // the heat is ended in the database by the phones themselves (no one pressed End)
  await expect.poll(async () => (await w.db.from("heats").select("status").eq("id", w.heats[0]).single()).data?.status, { timeout: 30_000 }).toBe("ended");
  for (let i = 0; i < 4; i++) {
    await card.getByTestId("rider-tile").nth(i).click();
    await score(card, 6 + (i % 3), i % 2 ? "5" : "0");
  }
  await expect(card.getByTestId("impression-progress")).toHaveText("4 / 4 riders");
  await expect.poll(async () => ((await w.db.from("impression_scores").select("id").eq("heat_id", w.heats[0]).eq("judge_seat_id", w.seats.j1.id)).data ?? []).length, { timeout: 30_000 }).toBe(4);
  await card.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(j1.getByRole("alertdialog")).toBeVisible();
  await j1.getByRole("button", { name: "Yes, submit" }).click();
  await expect(j1.getByTestId("submitted-note")).toBeVisible({ timeout: 30_000 });
  const sheet = (await w.db.from("judge_sheets").select("submitted_at").eq("heat_id", w.heats[0]).eq("judge_seat_id", w.seats.j1.id)).data ?? [];
  expect(sheet).toHaveLength(1);
  expect(sheet[0].submitted_at).toBeTruthy();
});
