import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

// The Draw step is compact: a round of 8 heats of 3 fits a laptop screen without scrolling, every seat is one line, and the banner of a selected rider is pinned to the
// top of the window (it stays in view while the page scrolls). A throwaway organisation; Arrow, EKL and Demo are never touched.
type Organiser = Awaited<ReturnType<typeof createOrganiser>>;
let org: Organiser;
let eventId = "";
let divisionId = "";
const pad = (n: number) => String(n).padStart(2, "0");
const KNOCKOUT_24 = {
  generator: { params: { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: "by_original_seed" } },
  timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 2, defaultBreakAfterRoundMin: 2 },
  roundDurationMin: { SF: 10, F: 10 },
};

test.beforeEach(async () => {
  org = await createOrganiser();
  const { data: ev } = await org.db
    .from("events")
    .insert({ organisation_id: org.orgId, name: `E2E Compact ${org.run}`, slug: `e2e-dc-${org.run}`, status: "published", timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11", settings: {} })
    .select("id")
    .single();
  eventId = ev!.id;
  const { data: fmt } = await org.db.from("format_templates").select("id").is("organisation_id", null).eq("key", "heats4-top2-single-elim").order("version", { ascending: false }).limit(1).single();
  const { data: model } = await org.db.from("scoring_models").select("id").is("organisation_id", null).limit(1).single();
  const { data: div } = await org.db.from("divisions").insert({ event_id: eventId, name: "Pro Men", sort_order: 1, scoring_model_id: model!.id, format_template_id: fmt!.id, format_params: KNOCKOUT_24 as never }).select("id").single();
  divisionId = div!.id;
  const { data: riders } = await org.db.from("riders").insert(Array.from({ length: 24 }, (_, i) => ({ organisation_id: org.orgId, first_name: `Rider${pad(i + 1)}`, last_name: "Test" }))).select("id, first_name");
  const sorted = riders!.sort((a, b) => a.first_name.localeCompare(b.first_name));
  await org.db.from("entries").insert(sorted.map((r, i) => ({ event_id: eventId, division_id: divisionId, rider_id: r.id, seed: i + 1, status: "confirmed", source: "manual" })));
});
test.afterEach(async () => {
  await org?.cleanup();
});

test("a round of 8 heats of 3 fits a 1440 x 900 laptop screen without scrolling; every seat is one line with the Lycra block, the name and the seed", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await org.signIn(page, `/org/events/${eventId}/draw?division=${divisionId}`);
  await page.getByRole("button", { name: "Generate draw" }).click();
  await expect(page.getByTestId("heat-card").first()).toBeVisible({ timeout: 60_000 });
  const round1 = page.getByTestId("round-column").first();
  await expect(round1.getByTestId("heat-card")).toHaveCount(8);
  await page.evaluate(() => window.scrollTo(0, 0));
  // every heat card of round 1 is inside the window, without scrolling
  const boxes = await round1.getByTestId("heat-card").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: r.top, bottom: r.bottom, left: r.left, right: r.right })));
  expect(Math.max(...boxes.map((b) => b.bottom)), "the last heat card ends inside the window, above the step footer").toBeLessThanOrEqual(840); // above the step footer that is fixed at the bottom of the window
  expect(Math.min(...boxes.map((b) => b.top))).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // the heats sit in tight columns, side by side (two rows of four), not stacked in one tall column
  const tops = new Set(boxes.map((b) => Math.round(b.top)));
  expect(tops.size).toBe(2);
  // one line per seat: the block, the name and the seed
  const seat = round1.locator('[data-testid="seat"]').first();
  const seatBox = (await seat.boundingBox())!;
  expect(seatBox.height).toBeLessThan(44);
  await expect(seat.getByTestId("rider-label-primary")).toBeVisible();
  await expect(seat.getByTestId("rider-seed")).toHaveText(/^#\d+$/);
  const line = await seat.evaluate((el) => {
    const parts = [...el.querySelectorAll('[data-testid="rider-label-primary"], [data-testid="rider-seed"]')].map((e) => Math.round(e.getBoundingClientRect().top));
    return new Set(parts).size;
  });
  expect(line, "the block, the name and the seed share one line").toBeLessThanOrEqual(2);
  // + Seat and Take heat out are behind one small button on each card: they still work
  const card = round1.getByTestId("heat-card").first();
  await card.getByTestId("heat-options").locator("summary").click();
  await card.getByRole("button", { name: "+ Seat" }).click();
  await expect(card.getByTestId("seat")).toHaveCount(4, { timeout: 30_000 });
});

test("the selection banner is pinned to the top of the window: it stays in view while the page scrolls, with its buttons", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 560 });
  await org.signIn(page, `/org/events/${eventId}/draw?division=${divisionId}`);
  await page.getByRole("button", { name: "Generate draw" }).click();
  await expect(page.getByTestId("heat-card").first()).toBeVisible({ timeout: 60_000 });
  const first = page.locator('[data-testid="seat"]').first().getByRole("button").first();
  await first.click();
  const bar = page.getByTestId("tap-bar");
  await expect(bar).toContainText("is picked");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY), "the page really scrolled").toBeGreaterThan(100);
  const box = (await bar.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeLessThanOrEqual(2);
  await expect(bar).toBeInViewport();
  // tap another rider far down the page: the banner offers the swap and Cancel, still on screen
  const other = page.locator('[data-testid="seat"]').nth(20).getByRole("button").first();
  await other.scrollIntoViewIfNeeded();
  await other.click();
  await expect(bar.getByRole("button", { name: /^Swap with / })).toBeInViewport();
  await bar.getByRole("button", { name: "Cancel" }).click();
  await expect(bar).toHaveCount(0);
});
