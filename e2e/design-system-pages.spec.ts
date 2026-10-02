import { test, expect } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import { createOrganiser } from "./organiser";

// Phase 7a-2, step 3: the page layouts of the design system (two-column Event form, the Riders grid with search and a bulk bar, the Officials and
// Organisations tables, the Go live and Run order date notes). Throwaway organisation; Arrow, EKL and Demo are never touched.
test.describe.configure({ mode: "serial" });
let w: LiveWorld;
test.beforeAll(async () => {
  w = await createLiveWorld();
});
test.afterAll(async () => {
  await w?.cleanup();
});
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
});

test("Event step: the form and the 'In words' card sit side by side on a laptop and one above the other on a phone", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await w.org.signIn(page, `/org/events/${w.eventId}/event`);
  const panel = page.getByTestId("event-panel");
  const card = page.getByTestId("event-sentence");
  await expect(panel).toBeVisible();
  const p = (await panel.boundingBox())!;
  const c = (await card.boundingBox())!;
  expect(c.x).toBeGreaterThan(p.x + p.width - 1); // to the right of the form
  expect(c.y).toBeLessThan(p.y + 200); // at the top, level with it
  await expect(page.getByTestId("event-sentence")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId("event-panel")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("event-sentence")).toBeVisible();
  const p2 = (await page.getByTestId("event-panel").boundingBox())!;
  const c2 = (await page.getByTestId("event-sentence").boundingBox())!;
  expect(c2.y + c2.height).toBeLessThanOrEqual(p2.y + 1); // above the form
});

test("Go live names both dates when the active run order is for another day", async ({ page }) => {
  test.setTimeout(120_000);
  await w.db.from("schedule_plans").update({ day: "2099-10-16" }).eq("id", w.planId);
  try {
    await w.org.signIn(page, `/org/events/${w.eventId}`);
    const row = page.getByTestId("check-run-order");
    await expect(row).toContainText("No run order is active for today, ");
    await expect(row).toContainText("the active plan is for Fri 16 Oct");
    await expect(row).not.toContainText("No run order is active for today —");
  } finally {
    await w.db.from("schedule_plans").update({ day: w.today }).eq("id", w.planId);
  }
});

test("Run order says which day the heats already ran on, once a plan's heats have real start times", async ({ page }) => {
  test.setTimeout(120_000);
  await w.org.signIn(page, `/org/events/${w.eventId}/schedule`);
  await expect(page.getByTestId("run-header")).toBeVisible();
  await expect(page.getByTestId("heats-ran-on")).toHaveCount(0);
  await w.db.from("heats").update({ status: "ended", started_at: "2026-10-02T09:05:00Z", ended_at: "2026-10-02T09:20:00Z" }).eq("id", w.heats[0]);
  try {
    await page.reload();
    await expect(page.getByTestId("heats-ran-on")).toHaveText("Heats already ran on Fri 2 Oct");
  } finally {
    await w.db.from("heats").update({ status: "scheduled", started_at: null, ended_at: null }).eq("id", w.heats[0]);
  }
});

test("Riders: search narrows the list, ticked riders get a bulk bar, and a bulk status change and a bulk remove are saved", async ({ page }) => {
  test.setTimeout(180_000);
  await w.org.signIn(page, `/org/events/${w.eventId}/riders`);
  const rows = page.getByTestId("rider-row");
  await expect(rows).toHaveCount(4);
  await expect(page.getByTestId("table-count")).toHaveText("4 shown");
  await page.getByTestId("table-search").fill("noor");
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId("table-count")).toHaveText("1 of 4 shown");
  await page.getByTestId("table-search").fill("zzz");
  await expect(page.getByTestId("no-match")).toBeVisible();
  await page.getByTestId("table-search").fill("");
  await expect(rows).toHaveCount(4);

  await page.getByLabel("Select Lena Vogt").check();
  await page.getByLabel("Select Mia Costa").check();
  await expect(page.getByTestId("bulk-bar")).toContainText("2 selected");
  await page.getByTestId("bulk-status").getByRole("button", { name: "Set status" }).click();
  await page.getByRole("menuitem", { name: "Withdrawn" }).click();
  await expect.poll(async () => (await w.db.from("entries").select("id").eq("division_id", w.divisionId).eq("status", "withdrawn")).data?.length).toBe(2);

  await page.getByLabel("Select Lena Vogt").check();
  await page.getByLabel("Select Mia Costa").check();
  await page.getByTestId("bulk-bar").getByRole("button", { name: "Remove from division" }).click();
  await expect(page.getByTestId("bulk-bar")).toContainText("Remove 2 riders from this division?");
  await page.getByTestId("bulk-bar").getByRole("button", { name: "Remove 2" }).click();
  await expect.poll(async () => (await w.db.from("entries").select("id").eq("division_id", w.divisionId)).data?.length).toBe(2);
});

test("Officials: the team is a dense table with search; ticking seats switches them off in one step", async ({ page }) => {
  test.setTimeout(180_000);
  await w.org.signIn(page, `/org/events/${w.eventId}/officials`);
  const table = page.getByTestId("officials-table");
  await expect(table.getByTestId("table-row")).toHaveCount(6);
  await table.getByTestId("table-search").fill("spotter");
  await expect(table.getByTestId("table-row")).toHaveCount(2);
  await table.getByLabel("Select all shown").check();
  await table.getByTestId("bulk-bar").getByRole("button", { name: "Switch off" }).click();
  await expect.poll(async () => (await w.db.from("judge_seats").select("id").eq("event_id", w.eventId).eq("active", false)).data?.length).toBe(2);
  await expect(table.getByText("Switched off").first()).toBeVisible();
});

test("Admin: the organisations list is a table with search and a status filter", async ({ page }) => {
  test.setTimeout(120_000);
  const owner = await createOrganiser({ platformAdmin: "owner" });
  try {
    await owner.signIn(page, "/admin");
    const table = page.getByTestId("organisations-table");
    await expect(table).toBeVisible();
    await table.getByTestId("table-search").fill(owner.run);
    await expect(table.getByTestId("table-row")).toHaveCount(1);
    await expect(table.getByRole("button", { name: "Open as this organiser" })).toBeVisible();
    await table.getByRole("button", { name: "Archived" }).click();
    await expect(table.getByTestId("no-match")).toBeVisible();
  } finally {
    await owner.cleanup();
  }
});

test("Landing page: a live event shows a live dot and what is on now; an event code opens an unlisted event; the page has the same preview tags", async ({ page }) => {
  test.setTimeout(180_000);
  await w.db.from("events").update({ status: "live" }).eq("id", w.eventId);
  await w.startHeat(w.heats[0]);
  try {
    await page.goto("/");
    const card = page.getByTestId("live-events").getByTestId("landing-event").filter({ hasText: `E2E Live ${w.org.run}` });
    await expect(card).toBeVisible();
    await expect(card.getByTestId("live-dot")).toHaveText("Live");
    await expect(card.getByTestId("live-now")).toContainText("Now: Pro Men");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /live scores/i);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    // an unlisted event is reached with its code
    await w.db.from("events").update({ status: "draft" }).eq("id", w.eventId);
    await page.reload();
    await expect(page.getByText(`E2E Live ${w.org.run}`)).toHaveCount(0);
    await w.db.from("events").update({ status: "published" }).eq("id", w.eventId);
    await page.getByLabel("Have an event code?").fill(`e2e-live-${w.org.run}`);
    await page.getByRole("button", { name: "Go" }).click();
    await expect(page).toHaveURL(new RegExp(`/e/e2e-live-${w.org.run}$`));
  } finally {
    await w.db.from("heats").update({ status: "scheduled" }).eq("id", w.heats[0]);
    await w.db.from("events").update({ status: "published" }).eq("id", w.eventId);
  }
});

test("The time now (HH:MM, small, muted) and the schedule-drift badge on the organiser's screens, the public home and the console's run-order lines", async ({ page }) => {
  test.setTimeout(240_000);
  // Go live: the clock and a drift badge ("On schedule", "n min late" or "n min early")
  await w.org.signIn(page, `/org/events/${w.eventId}`);
  await expect(page.getByTestId("now-clock").first()).toHaveText(/^\d\d:\d\d$/);
  await expect(page.getByTestId("drift-badge")).toHaveText(/On schedule|\d+ min (late|early)/);
  // Run order: the same, in the plan's header
  await page.goto(`/org/events/${w.eventId}/schedule`);
  await expect(page.getByTestId("run-header").getByTestId("now-clock")).toHaveText(/^\d\d:\d\d$/);
  await expect(page.getByTestId("run-header").getByTestId("drift-badge")).toBeVisible();
  // the public home: the clock beside the timetable; the quiet "Running about …" line only when the day has slipped
  await page.goto(`/e/e2e-live-${w.org.run}`);
  await expect(page.getByTestId("timetable-section").getByTestId("now-clock")).toHaveText(/^\d\d:\d\d$/);
  // the console: a heat that has started carries both times, one that has not carries the estimate
  await w.startHeat(w.heats[0]);
  try {
    await w.signInAs(page, "head", `/head/${w.eventId}`);
    const started = page.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`);
    await expect(started).toContainText(/planned \d\d:\d\d · started \d\d:\d\d/);
    await expect(page.locator(`[data-testid="order-row"][data-heat="${w.heats[1]}"]`)).toContainText(/est\. \d\d:\d\d/);
    await expect(page.getByTestId("top-bar").getByTestId("now-clock")).toHaveText(/^\d\d:\d\d$/);
    await expect(page.getByTestId("top-bar").getByTestId("drift-badge")).toBeVisible();
  } finally {
    await w.db.from("heats").update({ status: "scheduled", started_at: null }).eq("id", w.heats[0]);
  }
});
