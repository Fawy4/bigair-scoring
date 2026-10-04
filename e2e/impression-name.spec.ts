import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld, type SeatKey } from "./live-world";
import type { BrowserContext, Page } from "@playwright/test";

// The Event step's "Name of the impression score": set to Variety, the console's card heading, the judge's phone, the review bar and the public results all say Variety.
// The division's own name for the score is "Impression" here, so the change is visible. A throwaway organisation (Arrow, EKL and Demo are never touched).
let w: LiveWorld;
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld();
  await w.db.from("divisions").update({ scoring_overrides: { heat: { maxAttemptsPerRider: 7, impression: { label: "Impression" } }, panel: { requireAllJudges: true } } as never }).eq("id", w.divisionId);
  const { data } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  await w.db.from("events").update({ settings: { ...((data?.settings ?? {}) as object), publicResultsOnPublish: true } as never }).eq("id", w.eventId);
});
test.afterEach(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});
const keys: SeatKey[] = ["j1", "j2", "j3"];
async function open(browser: import("@playwright/test").Browser, size: { width: number; height: number }, go: (p: Page) => Promise<void>): Promise<Page> {
  const context = await browser.newContext({ viewport: size });
  contexts.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await go(page);
  return page;
}

test("Name of the impression score = Variety: the card heading, the judge's phone, the review bar and the public results all say Variety", async ({ browser, page }) => {
  test.setTimeout(600_000);
  // a heat that has ended: three riders scored, every judge's Impression in except Judge 3's for the first rider; Judges 1 and 2 have submitted
  const round = (await w.db.from("rounds").select("id").eq("division_id", w.divisionId).single()).data!;
  const heat = (
    await w.db
      .from("heats")
      .insert({ round_id: round.id, division_id: w.divisionId, event_id: w.eventId, number: 11, duration_sec: 600, warm_up_sec: 0, status: "ended", started_at: new Date(Date.now() - 900_000).toISOString(), ended_at: new Date(Date.now() - 300_000).toISOString() })
      .select("id")
      .single()
  ).data!.id;
  const entries = w.entries.slice(0, 3); // three riders: the card fits beside the rider cards at this width
  for (const [p, entry] of entries.entries()) {
    await w.db.from("heat_slots").insert({ heat_id: heat, position: p + 1, entry_id: entry, vest_colour: ["red", "blue", "yellow"][p] });
    const a = (await w.db.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq: 1, status: "landed", trick_name: "Left Backroll", direction: "left", client_key: crypto.randomUUID() }).select("id").single()).data!;
    for (const key of keys) {
      await w.db.from("trick_scores").insert({ attempt_id: a.id, judge_seat_id: w.seats[key].id, score: 8 - p * 0.5, client_key: crypto.randomUUID(), client_rev: 1 });
      if (!(key === "j3" && p === 0)) await w.db.from("impression_scores").insert({ heat_id: heat, entry_id: entry, judge_seat_id: w.seats[key].id, value: 6, client_key: crypto.randomUUID(), client_rev: 1 });
    }
  }
  for (const key of ["j1", "j2"] as SeatKey[]) await w.db.from("judge_sheets").upsert({ event_id: w.eventId, heat_id: heat, judge_seat_id: w.seats[key].id, submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });

  // before: the division's own name
  const head = await open(browser, { width: 1500, height: 1000 }, (p) => w.signInAs(p, "head", `/head/${w.eventId}`));
  await head.locator(`[data-testid="order-row"][data-heat="${heat}"]`).click({ timeout: 60_000 });
  await expect(head.getByTestId("impression-heading")).toHaveText("Impression", { timeout: 60_000 });

  // the organiser sets the name on the Event step
  await w.org.signIn(page, `/org/events/${w.eventId}/event`);
  await expect(page.getByTestId("event-panel")).toBeVisible({ timeout: 60_000 });
  if (!(await page.getByTestId("scoring-settings").isVisible())) await page.getByTestId("advanced-toggle").click();
  await expect(page.getByTestId("scoring-settings")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("impression-name").fill("Variety");
  await page.getByRole("button", { name: "Save event" }).click();
  await expect.poll(async () => ((await w.db.from("events").select("settings").eq("id", w.eventId).single()).data!.settings as { impressionName?: string }).impressionName, { timeout: 30_000 }).toBe("Variety");

  // the console's card: a proper heading, the same style as the other section headings, left-aligned above the grid
  await head.reload();
  await head.locator(`[data-testid="order-row"][data-heat="${heat}"]`).click({ timeout: 60_000 });
  const region = head.getByTestId("impression-region");
  await expect(region).toBeVisible({ timeout: 60_000 });
  // the tiles settle (the totals arrive) before the card is measured: the same room twice, a moment apart
  await expect.poll(async () => { const a = await region.getAttribute("data-room"); await head.waitForTimeout(700); return a === (await region.getAttribute("data-room")); }, { timeout: 20_000 }).toBe(true);
  await expect(region).not.toHaveAttribute("data-fit", "button");
  const heading = head.getByTestId("impression-heading");
  await expect(heading).toHaveText("Variety", { timeout: 60_000 });
  await expect(head.getByTestId("impression-grid")).toBeVisible();
  const h = (await heading.boundingBox())!;
  const grid = (await head.getByTestId("impression-grid").boundingBox())!;
  expect(h.y + h.height, "the heading is above the grid").toBeLessThanOrEqual(grid.y + 1);
  expect(Math.abs(h.x - grid.x), "left-aligned with the grid").toBeLessThan(16);
  const same = await head.evaluate(() => {
    const a = getComputedStyle(document.querySelector('[data-testid="impression-heading"]')!);
    const b = getComputedStyle(document.querySelector("h3.text-heading:not([data-testid='impression-heading'])")!);
    return { size: a.fontSize === b.fontSize, weight: a.fontWeight === b.fontWeight };
  });
  expect(same).toEqual({ size: true, weight: true });
  // the review bar's blocker sentence
  await expect(head.getByTestId("review-bar-text")).toContainText(/^Blocked: Judge 3: Variety score for .+ missing/);

  // the judge's phone
  const judge = await open(browser, { width: 390, height: 844 }, (p) => w.signInAs(p, "j3", `/judge/${w.eventId}`));
  await expect(judge.getByTestId("impression-card").locator("h3").first()).toHaveText("Variety score", { timeout: 60_000 });
  await expect(judge.getByText("Impression", { exact: false })).toHaveCount(0);

  // publish (Absent from the bar, then Publish) and the public results
  await head.getByTestId("review-bar-absent").click();
  await expect(head.getByTestId("review-bar")).toHaveAttribute("data-state", "ready", { timeout: 40_000 });
  await head.getByTestId("publish").click();
  await head.getByTestId("dialog-save").click();
  await expect(head.getByTestId("control-message")).toContainText("Published", { timeout: 60_000 });
  const pub = await open(browser, { width: 390, height: 844 }, async (p) => void (await p.goto(`/e/e2e-live-${w.org.run}/results`)));
  await pub.getByTestId("heat-tab").filter({ hasText: "Heat 11" }).click({ timeout: 60_000 }).catch(() => undefined);
  await expect(pub.getByTestId("public-formula").first()).toContainText("Variety", { timeout: 60_000 });
  await expect(pub.getByTestId("public-formula").first()).not.toContainText("Impression");
});

test("Polish 3: the empty 'Name of the impression score' field shows what the division calls the score now", async ({ page }) => {
  test.setTimeout(300_000);
  await w.org.signIn(page, `/org/events/${w.eventId}/event`);
  await expect(page.getByTestId("event-panel")).toBeVisible({ timeout: 60_000 });
  if (!(await page.getByTestId("impression-name").isVisible())) await page.getByTestId("advanced-toggle").click();
  await expect(page.getByTestId("impression-name")).toHaveValue("");
  await expect(page.getByTestId("impression-name")).toHaveAttribute("placeholder", "Impression"); // the division's own name here (set in beforeEach)
  // the division is renamed on the Divisions step: the empty field follows it
  await w.db.from("divisions").update({ scoring_overrides: { heat: { maxAttemptsPerRider: 7, impression: { label: "Style" } }, panel: { requireAllJudges: true } } as never }).eq("id", w.divisionId);
  await page.reload();
  await expect(page.getByTestId("event-panel")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1_000);
  if (!(await page.getByTestId("impression-name").isVisible())) await page.getByTestId("advanced-toggle").click();
  await expect(page.getByTestId("impression-name")).toHaveAttribute("placeholder", "Style", { timeout: 30_000 });
});
