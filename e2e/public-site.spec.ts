import { devices, expect, test, type Page } from "@playwright/test";
import { createPublicWorld, type PublicWorld } from "./public-world";

// Phase 6: the public event site as a visitor on a phone sees it (no login anywhere). One throwaway event: Pro Men with a published heat and a heat on the water
// (scores logged), two ladders (fixed seats, and a Final dealt from all arrivals), a run order for today. Everything hangs off one throwaway organisation.
test.use({ ...devices["Pixel 5"] });
test.describe.configure({ mode: "serial" });

let w: PublicWorld;
const url = (path = "") => `/e/${w.slug}${path}`;
const ogTag = (page: Page, prop: string) => page.locator(`meta[property="${prop}"]`).first();

test.beforeAll(async () => {
  test.setTimeout(240_000);
  w = await createPublicWorld({ settings: { screenRotateSec: 5 } });
});
test.afterAll(async () => {
  await w?.cleanup();
});

test("home: wind banner, now with the clock, the next two heats with estimates, today's timetable with its states, share and QR", async ({ page }) => {
  await w.db.from("wind_calls").insert({ event_id: w.eventId, status: "amber", message: "Light wind — heats on hold" });
  await page.goto(url());
  await expect(page.getByTestId("wind-banner")).toContainText("Amber — caution");
  await expect(page.getByTestId("wind-banner")).toContainText("Light wind");
  await expect(page.getByTestId("now-title")).toContainText("Now: Pro Men · R1 · Heat 2");
  await expect(page.getByTestId("now-title")).toContainText(/\d+:\d\d left/);
  await expect(page.getByTestId("up-next-row")).toHaveCount(2);
  await expect(page.getByTestId("up-next-row").first()).toContainText("est.");
  const states = await page.getByTestId("timetable-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
  expect(states.slice(0, 3)).toEqual(["done", "live", "done"]);
  expect(states).toContain("next");
  expect(states).toContain("est");
  await expect(page.getByTestId("estimates-note")).toContainText("Times are estimates and update live.");
  await expect(page.getByTestId("share-whatsapp")).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=.*e2e-live/);
  await expect(page.getByTestId("qr")).toBeVisible();
  await expect(page.getByTestId("copy-link")).toBeVisible();
  await expect(page.getByLabel(/password|PIN|sign in/i)).toHaveCount(0); // no login anywhere
  await w.db.from("wind_calls").insert({ event_id: w.eventId, status: "clear", message: null });
  await page.reload();
  await expect(page.getByTestId("wind-banner")).toHaveCount(0);
});

test("a wind hold shows every heat that has not started as on hold and says so", async ({ page }) => {
  const { data: plan } = await w.db.from("schedule_plans").select("id").eq("id", w.planId).single();
  await w.db.from("schedule_plans").update({ hold: { since: new Date().toISOString(), reason: "wind" } as never }).eq("id", plan!.id);
  await page.goto(url());
  await expect(page.getByTestId("on-hold")).toContainText("Competition on hold");
  await expect(page.locator('[data-testid="timetable-row"][data-state="held"]').first()).toBeVisible();
  await w.db.from("schedule_plans").update({ hold: null }).eq("id", plan!.id);
});

test("live heat with live scores on: the clock, Rider labels with the colour word, running totals, graded boxes; with them off: 'Scores published after the heat'", async ({ page }) => {
  await page.goto(url(`/live?heat=${w.running}`));
  await expect(page.getByTestId("live-title")).toContainText("Pro Men · R1 · Heat 2");
  await expect(page.getByTestId("live-state")).toHaveText("Running");
  await expect(page.getByTestId("heat-clock")).toContainText("left");
  const riders = page.getByTestId("public-rider");
  await expect(riders.first()).toContainText("RED");
  await expect(riders.first()).toContainText("Sam Rivera");
  await expect(riders.first().getByTestId("public-total")).toHaveText("6.0");
  await expect(riders.first().getByTestId("public-formula")).toContainText("6.0 = tricks 6.0");
  await expect(page.locator('[data-testid="score-box"][data-tone="crash"]').first()).toContainText("CRASH");
  // switch live scores off for the event: the seats stay, the totals go
  const { data: ev } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  await w.db.from("events").update({ settings: { ...(ev!.settings as object), publicLiveScores: "after_publish" } as never }).eq("id", w.eventId);
  await page.reload();
  await expect(page.getByTestId("scores-after")).toContainText("Scores published after the heat.");
  await expect(page.getByTestId("public-total")).toHaveCount(0);
  await expect(page.getByTestId("public-rider").first()).toContainText("Sam Rivera");
  await w.db.from("events").update({ settings: ev!.settings as never }).eq("id", w.eventId);
});

test("results of a published heat: compact rows in rank order, the formula in words, no percentage, boxes red / grey / graded yellow to green; the leaderboard opens on the live heat", async ({ page }) => {
  await page.goto(url("/results"));
  await expect(page.getByTestId("results-title")).toContainText("Pro Men · R1 · Heat 2"); // the live heat first
  await page.getByTestId("heat-tab").filter({ hasText: "Heat 1" }).click();
  await expect(page.getByTestId("results-title")).toContainText("Heat 1");
  const rows = page.getByTestId("public-rider");
  await expect(rows).toHaveCount(4);
  expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-place")))).toEqual(["1", "2", "3", "4"]);
  await expect(rows.first().getByTestId("public-total")).toHaveText("20.5");
  await expect(rows.first().getByTestId("public-formula")).toHaveText(/^20\.5 = tricks 15\.5 \+ Variety 5\.0$/);
  await expect(page.getByText(/%/)).toHaveCount(0);
  const boxes = rows.first().getByTestId("score-box");
  await expect(boxes).toHaveCount(4);
  await expect(boxes.nth(0)).toHaveAttribute("data-tone", "counted");
  await expect(boxes.nth(0)).toHaveAttribute("data-grade", "4"); // 7.0: the highest counted score of the heat
  await expect(boxes.nth(3)).toHaveAttribute("data-tone", "crash");
  await expect(boxes.nth(3)).toContainText("CRASH");
  await expect(rows.nth(1).getByTestId("score-box").nth(2)).toHaveAttribute("data-tone", "notCounted");
  await expect(rows.nth(3).getByTestId("score-box").first()).toHaveAttribute("data-grade", "0"); // 2.5: the lowest counted score
});

test("the division's setting decides what a box says: attempt number + score, trick name + score, scores only", async ({ page }) => {
  const box = () => page.getByTestId("public-rider").first().getByTestId("score-box").first();
  for (const [mode, text] of [["number_score", "1 · 7.0"], ["trick_score", "Backroll · 7.0"], ["score_only", "7.0"]] as const) {
    await w.db.from("divisions").update({ live_settings: { spectatorAttemptDisplay: mode } as never }).eq("id", w.divisionId);
    await page.goto(url(`/results?heat=${w.published}`));
    await expect(box()).toHaveText(text);
  }
  await w.db.from("divisions").update({ live_settings: { spectatorAttemptDisplay: "number_score" } as never }).eq("id", w.divisionId);
});

test("ladder: a released heat's winner sits in the next seat with the total shown; a seat dealt later reads 'Name · 1st H1 · seat pending'; waiting seats read '1st H2'", async ({ page }) => {
  await page.goto(url(`/ladder?division=${w.ladder.div}`));
  const heats = page.getByTestId("ladder-heat");
  await expect(heats).toHaveCount(3);
  await expect(heats.first()).toContainText("Complete");
  await expect(heats.first().getByTestId("ladder-rider").first()).toContainText("20.0");
  const final = heats.nth(2);
  await expect(final.getByTestId("ladder-rider").first()).toContainText("Ana"); // the winner is in the Final
  await expect(final.getByTestId("ladder-rider").nth(1)).toContainText("1st H2");
  await expect(heats.first().getByTestId("ladder-rider").first()).toContainText("Red"); // the colour is a word too
  await page.goto(url(`/ladder?division=${w.reseedLadder.div}`));
  await expect(page.locator('[data-testid="ladder-rider"][data-pending="true"]').first()).toContainText(/Ana .* · 1st H1 · seat pending/);
});

test("placings: riders knocked out together share a place; the highest jump shows when an attempt has a height", async ({ page }) => {
  const div = w.divisionId;
  await w.db.from("trick_attempts").insert({ heat_id: w.published, entry_id: w.entries[0], seq: 1, status: "landed", trick_name: "Backroll", client_key: crypto.randomUUID(), height_m: 13.4 });
  await page.goto(url(`/placings?division=${div}`));
  await expect(page.getByTestId("highest-jump")).toContainText("Highest jump: 13.4 m");
  await expect(page.getByTestId("no-placings")).toBeVisible();
});

test("rider page: next heat with an estimate and the ready call, their heats, results and a share line", async ({ page }) => {
  await page.goto(url(`/riders/${w.ladder.entries[1]}`));
  await expect(page.getByTestId("rider-next")).toContainText(/^Your next heat: Knockout · R1 · Heat 2 — est\. \d\d:\d\d — be ready \d\d:\d\d$/);
  await expect(page.getByTestId("rider-card")).toContainText("Ben");
  await page.goto(url(`/riders/${w.entries[0]}`));
  await expect(page.getByTestId("rider-share")).toContainText("Sam Rivera: 1st · Pro Men · R1 · Heat 1 · 20.5");
  await expect(page.getByTestId("rider-share").getByTestId("share-whatsapp")).toHaveAttribute("href", /wa\.me/);
  await expect(page.getByTestId("rider-heats").getByTestId("rider-heat")).toHaveCount(2);
  await page.goto(url("/riders/00000000-0000-0000-0000-000000000000"));
  await expect(page.getByRole("heading", { name: "This page doesn't exist" })).toBeVisible(); // a public event, an unknown rider: the page does not exist
});

test("rules: generated in plain words for each division, with the Lycra legend", async ({ page }) => {
  await page.goto(url("/rules"));
  const pro = page.getByTestId("rules-division").first();
  await expect(pro.getByTestId("rules-summary")).toContainText("Best 3 of 7 attempts");
  await expect(pro.getByTestId("rules-counting")).toContainText("The best 3 tricks count.");
  await expect(pro.getByTestId("rules-impression")).toContainText("Variety");
  await expect(pro.getByTestId("rules-tiebreakers")).toContainText("1. the highest counted trick");
  await expect(pro.getByTestId("rules-legend")).toContainText("Red");
});

test("join page: every role is its own deep link; 'Not on the list? Add your name' stays", async ({ page }) => {
  await page.goto(url("/join"));
  for (const role of ["judge", "spotter", "head", "announcer"]) await expect(page.getByTestId(`role-${role}`)).toHaveAttribute("href", `/e/${w.slug}/join?role=${role}#join-pin`);
  await expect(page.getByTestId("role-leaderboard")).toHaveAttribute("href", `/e/${w.slug}/results`);
  await expect(page.getByTestId("role-ladder")).toHaveAttribute("href", `/e/${w.slug}/ladder`);
  await expect(page.getByTestId("role-timetable")).toHaveAttribute("href", `/e/${w.slug}`);
  await expect(page.getByText("Not on the list? Add your name")).toBeVisible();
  await page.getByTestId("role-head").click();
  await expect(page.getByTestId("joining-as")).toHaveText("Head judge");
  await expect(page.getByLabel("Your 6-digit PIN")).toBeVisible();
});

test("an outside leaderboard is a tab: it links, and embeds when the organiser chose to", async ({ page }) => {
  const { data: ev } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  await w.db.from("events").update({ settings: { ...(ev!.settings as object), externalLeaderboards: [{ title: "Highest Jump", url: "https://woo.example.com/highest-jump", embed: false }, { title: "Embedded", url: "https://example.com/board", embed: true }] } as never }).eq("id", w.eventId);
  await page.goto(url());
  await page.getByRole("link", { name: "Highest Jump" }).click();
  await expect(page.getByTestId("leaderboard-title")).toHaveText("Highest Jump");
  await expect(page.getByTestId("leaderboard-open")).toHaveAttribute("href", "https://woo.example.com/highest-jump");
  await expect(page.getByTestId("leaderboard-frame")).toHaveCount(0);
  await page.goto(url("/leaderboards/2"));
  await expect(page.getByTestId("leaderboard-frame")).toHaveAttribute("src", "https://example.com/board");
  await w.db.from("events").update({ settings: ev!.settings as never }).eq("id", w.eventId);
});

test("Open Graph tags are on every public page, and the picture is a real 1200 × 630 image", async ({ page, request }) => {
  const paths = ["", "/live", "/results", "/ladder", "/placings", "/rules", "/join", `/riders/${w.entries[0]}`];
  for (const p of paths) {
    await page.goto(url(p));
    await expect(ogTag(page, "og:title"), p).toHaveAttribute("content", /E2E Live/);
    await expect(ogTag(page, "og:description"), p).toHaveAttribute("content", /.+/);
    await expect(ogTag(page, "og:image"), p).toHaveAttribute("content", /^https?:\/\/.+\/e\/.+\/og/);
    await expect(ogTag(page, "og:url"), p).toHaveAttribute("content", /^https?:\/\//);
    await expect(page.locator('meta[name="twitter:card"]'), p).toHaveAttribute("content", "summary_large_image");
  }
  await page.goto(url());
  // the home page says what is on now
  await expect(ogTag(page, "og:description")).toHaveAttribute("content", /Live now: Pro Men · R1 · Heat 2/);
  const image = await request.get(url("/og"));
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");
  const body = await image.body();
  expect(body.length).toBeGreaterThan(2000);
  expect(body.readUInt32BE(16)).toBe(1200);
  expect(body.readUInt32BE(20)).toBe(630);
  const heatImage = await request.get(url(`/og?kind=heat&id=${w.published}`));
  expect(heatImage.status()).toBe(200);
});

test("big screen: white on dark, pages rotate by themselves, Space pauses, a QR to the public site, sponsors page, the wind call", async ({ page }) => {
  await w.db.from("events").update({ branding: { sponsors: [{ name: "WOO Events" }] } }).eq("id", w.eventId);
  await w.db.from("wind_calls").insert({ event_id: w.eventId, status: "green", message: "Good to go" });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/screen/${w.slug}`);
  await expect(page.getByTestId("big-screen")).toBeVisible();
  const bg = await page.getByTestId("big-screen").evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg).toBe("rgb(11, 14, 15)");
  await expect(page.getByTestId("wind-banner")).toContainText("Green — go");
  await expect(page.getByTestId("qr")).toBeVisible();
  const rot = page.getByTestId("screen-rotator");
  const kinds = await page.getByTestId("screen-slide").evaluateAll((els) => els.map((e) => e.getAttribute("data-slide")));
  expect(kinds).toEqual(["Live heat", "Timetable", "Latest result", "Thank you to our sponsors"]);
  await expect(rot).toHaveAttribute("data-index", "0");
  await expect(page.getByTestId("screen-rider").first()).toBeVisible();
  const digit = await page.getByTestId("screen-rider").first().locator("span").last().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(digit).toBeGreaterThanOrEqual(100); // digits readable from 10 m on a 1600 px screen
  await expect(rot).toHaveAttribute("data-index", "1", { timeout: 15_000 }); // rotated on its own
  await page.keyboard.press("Space");
  await expect(rot).toHaveAttribute("data-paused", "true");
  await page.keyboard.press("Digit3");
  await expect(rot).toHaveAttribute("data-index", "2");
  await expect(page.getByTestId("screen-slide").nth(2)).toBeVisible();
  const anim = await page.evaluate(() => document.getAnimations().length);
  expect(anim).toBe(0); // nothing animates
  await w.db.from("wind_calls").insert({ event_id: w.eventId, status: "clear", message: null });
});

test("the big screen shows a podium once the final is released, and nothing while it is held", async ({ page }) => {
  // release the Knockout ladder completely, with the Final held first
  const { publishLadderHeat } = await import("../tests/rls/public-helpers");
  const ctx = { s: w.db, ids: { orgA: w.orgId, evA1: w.eventId, modelA1: w.modelId } };
  let draw = (await w.db.from("divisions").select("draw").eq("id", w.ladder.div).single()).data!.draw as never;
  draw = (await publishLadderHeat(ctx, w.ladder, "R1-H2", { draw })).draw as never;
  const { winner, draw: after } = await publishLadderHeat(ctx, w.ladder, "F-H1", { draw, hold: true });
  void after;
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/screen/${w.slug}`);
  await expect(page.getByTestId("screen-podium")).toHaveCount(0); // held: nothing
  await w.db.from("heats").update({ publish_hold: false }).eq("id", w.ladder.heats["F-H1"]);
  await page.reload();
  await expect(page.getByTestId("screen-podium")).toHaveCount(1);
  await expect(page.getByTestId("screen-podium")).toContainText("Podium: Knockout");
  void winner;
  await page.goto(url(`/placings?division=${w.ladder.div}`));
  await expect(page.getByTestId("placing-row").first()).toHaveAttribute("data-place", "1");
  await expect(page.locator('[data-testid="placing-row"][data-place="3="]').first()).toBeVisible();
});

test("the organiser sets the wind call on the dashboard and visitors see the banner on their next poll", async ({ page, browser }) => {
  await w.org.signIn(page, `/org/events/${w.eventId}`);
  await page.getByTestId("wind-red").click();
  await page.getByLabel("Message (shown with the call)").fill("Gusts — all stop");
  await page.getByTestId("wind-set").click();
  await expect(page.getByTestId("wind-note")).toHaveText("Wind call updated.");
  await expect(page.getByTestId("wind-now")).toContainText("Red — stop");
  const visitor = await browser.newPage({ ...devices["Pixel 5"] });
  await visitor.goto(url());
  await expect(visitor.getByTestId("wind-banner")).toContainText("Gusts — all stop");
  await page.getByTestId("wind-clear").click();
  await expect(page.getByTestId("wind-note")).toHaveText("Banner cleared.");
  // the visitor's page polls every 3 s in this event: the banner goes by itself, with no reload
  await expect(visitor.getByTestId("wind-banner")).toHaveCount(0, { timeout: 20_000 });
  await visitor.close();
});

test("an event that is a simulation, a draft or archived is not on the public site at all; nor on the organisation page or the home list", async ({ page }) => {
  const { data: org } = await w.db.from("organisations").select("slug").eq("id", w.orgId).single();
  await page.goto(`/o/${org!.slug}`);
  await expect(page.getByText(`E2E Live ${w.org.run}`).first()).toBeVisible();
  await w.db.from("events").update({ is_simulation: true }).eq("id", w.eventId);
  for (const p of ["", "/live", "/results", "/ladder", "/placings", "/rules"]) {
    const res = await page.goto(url(p));
    expect(res?.status(), p).toBe(404);
  }
  expect((await page.goto(`/screen/${w.slug}`))?.status()).toBe(404);
  // the answer is a page of the product, in the design system, with a way home: not the black default 404
  await page.goto(url());
  await expect(page.getByRole("heading", { name: "This event isn't public" })).toBeVisible();
  await expect(page.getByTestId("not-found")).toHaveClass(/beach-day/);
  await page.getByRole("link", { name: "Back to the home page" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await page.goto(`/o/${org!.slug}`))?.status()).toBe(404);
  await page.goto("/");
  await expect(page.getByText(`E2E Live ${w.org.run}`)).toHaveCount(0);
  await w.db.from("events").update({ is_simulation: false, archived_at: new Date().toISOString() }).eq("id", w.eventId);
  expect((await page.goto(url()))?.status()).toBe(404);
  await w.db.from("events").update({ archived_at: null, status: "draft" }).eq("id", w.eventId);
  expect((await page.goto(url()))?.status()).toBe(404);
  await w.db.from("events").update({ status: "live" }).eq("id", w.eventId);
});
