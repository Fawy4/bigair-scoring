import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld, type SeatKey } from "./live-world";
import { contrastRatio } from "../src/lib/live/theme-tokens";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// The Impression card and the Impression step show each rider as the shared Rider label (Lycra block, name, nationality) and as a bar filled in the rider's Lycra colour with
// the colour word on it, the selected bar marked with a thick border and a tick. On the head judge's laptop console, on a throwaway organisation
// (Arrow, EKL and Demo are never touched). Run with ONE worker, no retries: `npx playwright test impression-bars --workers=1 --retries=0`.
let w: LiveWorld;
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld();
  await w.db.from("divisions").update({ scoring_overrides: { heat: { maxAttemptsPerRider: 7 }, panel: { requireAllJudges: true } } as never }).eq("id", w.divisionId);
});
test.afterEach(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});

const keys: SeatKey[] = ["j1", "j2", "j3"];
const COLOURS = ["red", "blue", "yellow", "green", "white"];
const WORDS = ["RED", "BLUE", "YELLOW", "GREEN", "WHITE"]; // the colour word as the Rider label writes it
const HEX: Record<string, string> = { red: "#e11d48", blue: "#2563eb", yellow: "#facc15", green: "#16a34a", white: "#ffffff" };

async function open(browser: Browser, size: { width: number; height: number }, key: "head" | "j1", path: string): Promise<Page> {
  const context = await browser.newContext({ viewport: size });
  contexts.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await w.signInAs(page, key, path);
  return page;
}
async function ensureEntries(riders: number) {
  while (w.entries.length < riders) {
    const rider = (await w.db.from("riders").insert({ organisation_id: w.orgId, first_name: `Extra${w.entries.length}`, last_name: "Rider", nationality: "EG" }).select("id").single()).data!;
    w.entries.push((await w.db.from("entries").insert({ division_id: w.divisionId, rider_id: rider.id, seed: w.entries.length + 1, status: "confirmed", source: "manual" }).select("id").single()).data!.id);
  }
}
/** An ended heat with `riders` riders in Lycra colours, every rider scored once by every judge, Impression owed by every judge. */
async function endedHeat(riders: number, number: number): Promise<{ heat: string; entries: string[] }> {
  await ensureEntries(riders);
  const round = (await w.db.from("rounds").select("id").eq("division_id", w.divisionId).single()).data!;
  const heat = (
    await w.db
      .from("heats")
      .insert({ round_id: round.id, division_id: w.divisionId, event_id: w.eventId, number, duration_sec: 600, warm_up_sec: 0, status: "ended", started_at: new Date(Date.now() - 900_000).toISOString(), ended_at: new Date(Date.now() - 300_000).toISOString() })
      .select("id")
      .single()
  ).data!.id;
  const entries = w.entries.slice(0, riders);
  for (const [p, entry] of entries.entries()) {
    await w.db.from("heat_slots").insert({ heat_id: heat, position: p + 1, entry_id: entry, vest_colour: COLOURS[p] });
    const a = (await w.db.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq: 1, status: "landed", trick_name: "Left Backroll", direction: "left", client_key: crypto.randomUUID() }).select("id").single()).data!;
    for (const key of keys) await w.db.from("trick_scores").insert({ attempt_id: a.id, judge_seat_id: w.seats[key].id, score: 8 - p * 0.5, client_key: crypto.randomUUID(), client_rev: 1 });
  }
  return { heat, entries };
}
const pick = async (p: Page, heat: string) => {
  const row = p.locator(`[data-testid="order-row"][data-heat="${heat}"]`);
  await row.waitFor({ state: "attached", timeout: 60_000 });
  await row.click();
};
const rgb = (css: string): string => {
  const m = css.match(/\d+/g)!.map(Number);
  return "#" + m.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
};
/** The word on a bar reads at 7:1 on what is directly behind it. */
async function expectWordReads(word: import("@playwright/test").Locator) {
  const [ink, bg] = await word.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  expect(contrastRatio(rgb(ink), rgb(bg))).toBeGreaterThanOrEqual(7);
}

test("laptop console, 3 riders: the Impression card rows show the Rider label (block, name, nationality) and the sheet's bars are filled in the Lycra colours with the word on them; the selected bar is marked", async ({ browser }) => {
  test.setTimeout(240_000);
  const { heat, entries } = await endedHeat(3, 21);
  const page = await open(browser, { width: 1500, height: 1000 }, "head", `/head/${w.eventId}`);
  await pick(page, heat);
  const card = page.getByTestId("impression-card");
  await expect(card).toBeVisible({ timeout: 60_000 });
  for (const [i, e] of entries.entries()) {
    const row = card.locator(`[data-testid="impression-row"][data-rider="${e}"]`);
    await expect(row.getByTestId("rider-label-text")).toHaveText(WORDS[i]);
    await expect(row.getByTestId("rider-label-primary")).toHaveCSS("background-color", /^rgb/);
    expect(rgb(await row.getByTestId("rider-label-primary").evaluate((el) => getComputedStyle(el).backgroundColor))).toBe(HEX[COLOURS[i]]);
    await expect(row.getByTestId("rider-label-name")).not.toHaveText(""); // the rider, not only the lycra word
    await expect(row.getByTestId("rider-label-rest")).toHaveText("EG"); // nationality
  }
  if (process.env.SHOTS) await page.getByTestId("rider-strip").screenshot({ path: `${process.env.SHOTS}/console-impression-card.png` });
  // a judge's cell opens that judge's sheet: one bar per rider, in the Lycra colour, the word on it, the selected one marked
  await card.getByTestId("impression-cell").first().click();
  const sheet = page.getByTestId("impression-sheet");
  await expect(sheet).toBeVisible();
  if (process.env.SHOTS) {
    await page.screenshot({ path: `${process.env.SHOTS}/console-impression-sheet.png` });
  }
  const bars = sheet.getByTestId("sheet-rider");
  await expect(bars).toHaveCount(3);
  for (const [i, e] of entries.entries()) {
    const bar = sheet.locator(`[data-testid="sheet-rider"][data-rider="${e}"]`);
    await expect(bar).toHaveAttribute("data-bar", "lycra");
    expect(rgb(await bar.evaluate((el) => getComputedStyle(el).backgroundColor))).toBe(HEX[COLOURS[i]]);
    await expect(bar.getByTestId("rider-bar-word")).toHaveText(WORDS[i]);
    await expectWordReads(bar.getByTestId("rider-bar-word"));
    await expect(bar.getByTestId("rider-bar-name")).not.toHaveText("");
    await expect(bar.getByTestId("rider-bar-rest")).toHaveText("EG");
  }
  // exactly one bar is selected: thick border and a tick; tapping another moves it
  const selected = sheet.locator('[data-testid="sheet-rider"][aria-pressed="true"]');
  await expect(selected).toHaveCount(1);
  await expect(selected.getByTestId("rider-bar-tick")).toBeVisible();
  expect(parseFloat(await selected.evaluate((el) => getComputedStyle(el).borderTopWidth))).toBeGreaterThanOrEqual(3);
  await bars.nth(2).click();
  await expect(bars.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(bars.nth(2).getByTestId("rider-bar-tick")).toBeVisible();
  await expect(sheet.getByTestId("rider-bar-tick")).toHaveCount(1);
});

test("laptop console at 1280 px, 5 riders: the card is still a card (not the button), inside its room, with every rider's label on one line", async ({ browser }) => {
  test.setTimeout(240_000);
  const { heat, entries } = await endedHeat(5, 22);
  const page = await open(browser, { width: 1280, height: 800 }, "head", `/head/${w.eventId}`);
  await pick(page, heat);
  const card = page.getByTestId("impression-card");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("impression-region")).not.toHaveAttribute("data-fit", "button");
  const region = (await page.getByTestId("impression-region").boundingBox())!;
  const c = (await card.boundingBox())!;
  expect(c.x + c.width).toBeLessThanOrEqual(region.x + region.width + 1);
  expect(c.y + c.height).toBeLessThanOrEqual(region.y + region.height + 1);
  const rows = card.getByTestId("impression-row");
  await expect(rows).toHaveCount(5);
  for (const [i, e] of entries.entries()) {
    const label = card.locator(`[data-testid="impression-row"][data-rider="${e}"]`).getByTestId("rider-label");
    await expect(label.getByTestId("rider-label-text")).toHaveText(WORDS[i]);
    await expect(label.getByTestId("rider-label-rest")).toHaveText("EG");
    const b = (await label.boundingBox())!;
    expect(b.height).toBeLessThanOrEqual(24); // one line
    expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width);
  }
  // the page itself does not scroll sideways
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
