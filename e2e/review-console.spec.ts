import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld, type SeatKey } from "./live-world";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// The review bar and the Impression card on the head judge's console, on a throwaway organisation (Arrow, EKL and Demo are never touched): the bar from End heat
// until Publish (amber, red, green), the Impression grid with its outlier colours, and the card's sizing at laptop width. The Legacy model has an Impression scale
// (labelled Variety, 0-10 in halves), so every ended heat here owes each judge an Impression / Variety score per rider.
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

async function head(browser: Browser, size = { width: 1500, height: 1000 }): Promise<Page> {
  const context = await browser.newContext({ viewport: size });
  contexts.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await w.signInAs(page, "head", `/head/${w.eventId}`);
  return page;
}
const pick = async (p: Page, heat: string) => {
  const row = p.locator(`[data-testid="order-row"][data-heat="${heat}"]`);
  await row.waitFor({ state: "attached", timeout: 60_000 });
  await row.click();
};
const keys: SeatKey[] = ["j1", "j2", "j3"];
const imp = async (heat: string, entry: string, key: SeatKey, value: number | null) => {
  if (value === null) return;
  await w.db.from("impression_scores").insert({ heat_id: heat, entry_id: entry, judge_seat_id: w.seats[key].id, value, client_key: crypto.randomUUID(), client_rev: 1 });
};
const submit = async (heat: string, ks: SeatKey[]) => {
  for (const key of ks) await w.db.from("judge_sheets").upsert({ event_id: w.eventId, heat_id: heat, judge_seat_id: w.seats[key].id, submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });
};
/** An ended heat of the division with `riders` riders (new ones are made when the world has fewer), every rider scored once by every judge. */
async function ensureEntries(riders: number) {
  while (w.entries.length < riders) {
    const rider = (await w.db.from("riders").insert({ organisation_id: w.orgId, first_name: `Extra${w.entries.length}`, last_name: "Rider" }).select("id").single()).data!;
    w.entries.push((await w.db.from("entries").insert({ division_id: w.divisionId, rider_id: rider.id, seed: w.entries.length + 1, status: "confirmed", source: "manual" }).select("id").single()).data!.id);
  }
}
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
  const colours = ["red", "blue", "yellow", "green", "white"];
  for (const [p, entry] of entries.entries()) {
    await w.db.from("heat_slots").insert({ heat_id: heat, position: p + 1, entry_id: entry, vest_colour: colours[p] });
    const a = (await w.db.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq: 1, status: "landed", trick_name: "Left Backroll", direction: "left", client_key: crypto.randomUUID() }).select("id").single()).data!;
    for (const key of keys) await w.db.from("trick_scores").insert({ attempt_id: a.id, judge_seat_id: w.seats[key].id, score: 8 - p * 0.5, client_key: crypto.randomUUID(), client_rev: 1 });
  }
  return { heat, entries };
}

test("a heat ends with one judge not submitted: the bar is amber and names the judge; the head judge opens the sheet from the bar and submits it; the bar turns green", async ({ browser }) => {
  test.setTimeout(300_000);
  const { heat, entries } = await endedHeat(4, 11);
  for (const key of keys) for (const e of entries) await imp(heat, e, key, 6);
  await submit(heat, ["j1", "j2"]);
  const page = await head(browser);
  await pick(page, heat);
  const bar = page.getByTestId("review-bar");
  await expect(bar).toHaveAttribute("data-state", "waiting", { timeout: 60_000 });
  await expect(bar).toContainText("Waiting for 1 of 3 judges:");
  await expect(bar.getByTestId("review-bar-judge")).toHaveText("Judge 3");
  // directly under the heat header and above the rider cards, across the page
  const b = (await bar.boundingBox())!;
  const strip = (await page.getByTestId("rider-strip").boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(strip.y + 1);
  // the small submission status is gone from the judges pane (it is the bar's job now)
  await expect(page.getByTestId("judges").getByText("Not submitted")).toHaveCount(0);

  await bar.getByTestId("review-bar-judge").click();
  const dialog = page.getByTestId("console-dialog");
  await expect(dialog.getByTestId("impression-sheet")).toBeVisible();
  await dialog.getByTestId("reason-input").fill("paper sheet");
  await dialog.getByTestId("impression-submit").click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  await expect(bar).toHaveAttribute("data-state", "ready", { timeout: 40_000 });
  await expect(bar).toContainText("All 3 judges submitted — ready to publish");
  expect((await w.db.from("judge_sheets").select("submitted_at").eq("heat_id", heat).eq("judge_seat_id", w.seats.j3.id).single()).data!.submitted_at).not.toBeNull();
  // the Publish button's own blocker sentence is unchanged: nothing blocks now
  await expect(page.getByTestId("blockers")).toContainText("Nothing blocks Publish");
});

test("a judge's missing Impression: the bar is red with the Publish blocker's words; Fix opens the sheet and Absent turns it green; so does Absent from the bar", async ({ browser }) => {
  test.setTimeout(300_000);
  for (const via of ["fix", "bar"] as const) {
    const { heat, entries } = await endedHeat(4, via === "fix" ? 12 : 13);
    for (const key of keys) for (const [i, e] of entries.entries()) await imp(heat, e, key, key === "j3" && i === 0 ? null : 6);
    await submit(heat, ["j1", "j2"]);
    const page = await head(browser);
    await pick(page, heat);
    const bar = page.getByTestId("review-bar");
    await expect(bar).toHaveAttribute("data-state", "blocked", { timeout: 60_000 });
    await expect(page.getByTestId("review-bar-text")).toContainText(/^Blocked: Judge 3: Variety score for .+ missing/);
    // the same sentence the Publish blocker list has
    await expect(page.getByTestId("blockers").getByTestId("blocker-line").filter({ hasText: /Variety score for .+ missing/ })).toHaveCount(1);
    if (via === "fix") {
      await bar.getByTestId("review-bar-fix").click();
      const dialog = page.getByTestId("console-dialog");
      await expect(dialog.locator(`[data-testid="sheet-rider"][data-rider="${entries[0]}"]`)).toHaveAttribute("aria-pressed", "true");
      await dialog.getByTestId("mark-impression-absent").click();
      await dialog.getByTestId("reason-input").fill("Absent");
      await dialog.getByTestId("impression-save").click();
    } else {
      await bar.getByTestId("review-bar-absent").click();
    }
    await expect(bar).toHaveAttribute("data-state", "ready", { timeout: 40_000 });
    const row = (await w.db.from("impression_scores").select("value, missed").eq("heat_id", heat).eq("judge_seat_id", w.seats.j3.id).eq("entry_id", entries[0]).single()).data!;
    expect(row).toEqual({ value: null, missed: true });
    await w.db.from("heats").update({ status: "published", published_at: new Date().toISOString() }).eq("id", heat); // out of the way of the next round
  }
});

test("Absent from the bar turns it green within two seconds (the console's fast answers must never leave the bar blocked)", async ({ browser }) => {
  test.setTimeout(300_000);
  const { heat, entries } = await endedHeat(4, 14);
  for (const key of keys) for (const [i, e] of entries.entries()) await imp(heat, e, key, key === "j3" && i === 0 ? null : 6);
  await submit(heat, ["j1", "j2"]);
  const page = await head(browser);
  await pick(page, heat);
  const bar = page.getByTestId("review-bar");
  await expect(bar).toHaveAttribute("data-state", "blocked", { timeout: 60_000 });
  await expect(page.getByTestId("review-bar-absent")).toBeEnabled();
  const t0 = Date.now();
  await bar.getByTestId("review-bar-absent").click();
  // looked at on every frame, so the time is the screen's and not Playwright's own retry interval
  await page.waitForFunction(() => document.querySelector('[data-testid="review-bar"]')?.getAttribute("data-state") === "ready", null, { polling: "raf", timeout: Number(process.env.BAR_WAIT_MS ?? 5_000) });
  const took = Date.now() - t0;
  console.log(`ABSENT-TO-GREEN ${took} ms`);
  expect(took).toBeLessThan(Number(process.env.BAR_LIMIT_MS ?? 2_000));
  await expect(page.getByTestId("blockers")).toContainText("Nothing blocks Publish");
});

test("while the heat is running the bar is a quiet one-liner", async ({ browser }) => {
  test.setTimeout(180_000);
  await w.startHeat(w.heats[0]);
  const page = await head(browser);
  await pick(page, w.heats[0]);
  const bar = page.getByTestId("review-bar");
  await expect(bar).toHaveAttribute("data-state", "running", { timeout: 60_000 });
  await expect(bar).toContainText(/\d of 3 judges scoring/);
  await expect(page.getByTestId("impression-card")).toHaveCount(0);
});

test("the Impression grid shows what the judges gave, with the outlier colour on a deliberately low score; a tap corrects it", async ({ browser }) => {
  test.setTimeout(300_000);
  const { heat, entries } = await endedHeat(4, 14);
  const given: Array<[number | null, number | null, number | null]> = [[8, 8, 1], [6, 6.5, 6], [7, null, 7], [9, null, 9]];
  for (const [i, e] of entries.entries()) for (const [k, key] of keys.entries()) await imp(heat, e, key, given[i][k]);
  await w.db.from("impression_scores").insert({ heat_id: heat, entry_id: entries[3], judge_seat_id: w.seats.j2.id, value: null, missed: true, client_key: crypto.randomUUID(), client_rev: 1 }).then(() => undefined);
  const page = await head(browser, { width: 1700, height: 1000 }); // wide enough for four riders and the grid side by side
  await pick(page, heat);
  const card = page.getByTestId("impression-card");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card.locator("h3")).toHaveCount(1);
  await expect(card.locator("h3")).toHaveText("Variety"); // the division's own name for the score (the Legacy model calls it Variety)
  // one column per judge with the table's short names and J-numbers, and a Panel column
  await expect(card.getByTestId("impression-judge")).toHaveCount(3);
  await expect(card.getByTestId("impression-judge").first()).toContainText("Judge 1");
  await expect(card).toContainText("Panel");
  const cell = (rider: string, seat: SeatKey) => card.locator(`[data-testid="impression-cell"][data-rider="${rider}"][data-seat="${w.seats[seat].id}"]`);
  await expect(cell(entries[0], "j1")).toContainText("8.00");
  await expect(cell(entries[0], "j3")).toHaveText(/^1\.00/);
  await expect(cell(entries[0], "j3")).toHaveAttribute("data-band", "3"); // the deliberately low one: red, further than twice the tolerance from the panel mean
  await expect(cell(entries[0], "j1")).not.toHaveAttribute("data-band", "3");
  await expect(cell(entries[2], "j2")).toHaveText("—");
  await expect(cell(entries[3], "j2")).toHaveText("Absent");
  // no "Impression" repeated per row, and no Impression row in the attempt table
  for (const row of await card.getByTestId("impression-row").all()) await expect(row).not.toContainText("Impression");
  await expect(page.getByTestId("head-matrix")).not.toContainText("Impression");
  // the rider cards are as they were
  await expect(page.getByTestId("rider-strip-tile")).toHaveCount(4);
  // tap a cell to correct it: the judge's sheet opens on that rider
  await cell(entries[1], "j2").click();
  const dialog = page.getByTestId("console-dialog");
  await expect(dialog.locator(`[data-testid="sheet-rider"][data-rider="${entries[1]}"]`)).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Set 7", exact: true }).click();
  await dialog.getByRole("button", { name: "Set .0", exact: true }).click();
  await dialog.getByTestId("reason-input").fill("paper sheet");
  await dialog.getByTestId("impression-save").click();
  await expect(cell(entries[1], "j2")).toContainText("7.00", { timeout: 40_000 });
});

test("at a 15-inch laptop width the card sits beside the rider cards for 2 and 3 riders, shrinks or becomes a button for 5, and the table's top edge never moves", async ({ browser }) => {
  test.setTimeout(420_000);
  await ensureEntries(5); // the console reads the riders when the page opens
  const page = await head(browser, { width: 1500, height: 900 });
  const tops: number[] = [];
  const fits: string[] = [];
  for (const [n, number] of [[2, 21], [3, 22], [5, 23]] as const) {
    const { heat, entries } = await endedHeat(n, number);
    for (const key of keys) for (const e of entries) await imp(heat, e, key, 6.5);
    await submit(heat, keys);
    await page.reload();
    await pick(page, heat);
    await expect(page.getByTestId("rider-strip-tile")).toHaveCount(n, { timeout: 60_000 });
    const region = page.getByTestId("impression-region");
    await expect(region).toBeVisible({ timeout: 40_000 });
    // the tiles settle (the totals arrive) before the room is read: the same measure twice, a moment apart
    await expect.poll(async () => { const a = await region.getAttribute("data-room"); await page.waitForTimeout(700); return a === (await region.getAttribute("data-room")); }, { timeout: 20_000 }).toBe(true);
    const fit = (await region.getAttribute("data-fit"))!;
    const box = async (id: string) => JSON.stringify(await page.getByTestId(id).first().boundingBox());
    console.log(`riders ${n}: fit ${fit}, room ${await region.getAttribute("data-room")}; strip ${await box("rider-strip")}; tiles ${await box("rider-tiles")}; first tile ${await box("rider-strip-tile")}; region ${await box("impression-region")}`);
    fits.push(fit);
    // the card (or its button) is in the same row as the rider cards, to the right of them, never below
    const r = (await region.boundingBox())!;
    const tiles = await page.getByTestId("rider-strip-tile").all();
    const last = (await tiles[tiles.length - 1].boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(last.x + last.width - 1);
    const t = (await page.getByTestId("matrix-scroll").boundingBox())!;
    expect(r.y + r.height).toBeLessThanOrEqual(t.y + 1);
    if (fit !== "button") {
      const card = (await page.getByTestId("impression-card").boundingBox())!;
      expect(card.y + card.height).toBeLessThanOrEqual(t.y + 1);
      // nothing is cut off inside the card
      expect(await page.getByTestId("impression-card").evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    }
    // the table sits the same distance under the rider cards whatever the heat (anything above the cards, like the clock line, is not this layout's)
    tops.push(Math.round(t.y - (await page.getByTestId("rider-strip").boundingBox())!.y));
  }
  expect(fits[0]).not.toBe("button");
  expect(fits[1]).not.toBe("button");
  expect(new Set(tops).size).toBe(1);
  // the 5-rider heat: either a shrunken grid or the button, and the button opens the grid as a pop-over
  if (fits[2] === "button") {
    await page.getByTestId("impression-button").click();
    await expect(page.getByTestId("impression-popover").getByTestId("impression-row")).toHaveCount(5);
  }
});

test("Fix 2: at 1280 px and 1366 px the Impression card stays a card, beside the rider cards, with 3, 4 and 5 riders (the rider cards shrink, never the card)", async ({ browser }) => {
  test.setTimeout(600_000);
  await ensureEntries(5);
  let number = 40;
  for (const width of [1280, 1366]) {
    const page = await head(browser, { width, height: 900 });
    for (const n of [3, 4, 5]) {
      const { heat, entries } = await endedHeat(n, ++number);
      for (const key of keys) for (const e of entries) await imp(heat, e, key, 6.5);
      await submit(heat, keys);
      await page.reload();
      await pick(page, heat);
      await expect(page.getByTestId("rider-strip-tile")).toHaveCount(n, { timeout: 60_000 });
      const region = page.getByTestId("impression-region");
      await expect(region).toBeVisible({ timeout: 40_000 });
      await expect.poll(async () => { const a = await region.getAttribute("data-room"); await page.waitForTimeout(700); return a === (await region.getAttribute("data-room")); }, { timeout: 20_000 }).toBe(true);
      const label = `${width}px, ${n} riders`;
      expect(await region.getAttribute("data-fit"), `${label}: still a card`).not.toBe("button");
      await expect(page.getByTestId("impression-card"), label).toBeVisible();
      // beside the rider cards, never below them, nothing cut off inside, and the rider cards do not overlap the card
      const card = (await page.getByTestId("impression-card").boundingBox())!;
      const tiles = await page.getByTestId("rider-strip-tile").all();
      for (const t of tiles) {
        const b = (await t.boundingBox())!;
        expect(b.x + b.width, `${label}: a rider card overlaps the Impression card (tile ${Math.round(b.x)}+${Math.round(b.width)}, card at ${Math.round(card.x)}, tiles ${JSON.stringify(await Promise.all(tiles.map(async (x) => Math.round((await x.boundingBox())!.width))))}, strip ${JSON.stringify(await page.getByTestId("rider-strip").boundingBox())})`).toBeLessThanOrEqual(card.x + 1);
        expect(Math.abs(b.y - card.y) < 160, `${label}: rider cards and card share the row`).toBe(true);
      }
      const table = (await page.getByTestId("matrix-scroll").boundingBox())!;
      expect(card.y + card.height, label).toBeLessThanOrEqual(table.y + 1);
      const sizes = await page.getByTestId("impression-card").evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
      expect(sizes.sw <= sizes.cw + 1 && sizes.sh <= sizes.ch + 1, `${label}: nothing cut off in the card ${JSON.stringify(sizes)} fit ${await region.getAttribute("data-fit")} room ${await region.getAttribute("data-room")}`).toBe(true);
      // the page itself does not scroll sideways
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label}: no sideways scroll`).toBe(true);
    }
    await page.context().close();
  }
});

test("on a phone the Control tab has the review bar under the heat's header and the Impression card open under the rider controls", async ({ browser }) => {
  test.setTimeout(300_000);
  const { heat, entries } = await endedHeat(3, 31);
  for (const key of keys) for (const e of entries) await imp(heat, e, key, 6);
  await submit(heat, ["j1", "j2"]);
  const page = await head(browser, { width: 390, height: 844 });
  await pick(page, heat);
  const bar = page.getByTestId("review-bar");
  await expect(bar).toHaveAttribute("data-state", "waiting", { timeout: 60_000 });
  await expect(page.getByTestId("impression-card")).toHaveAttribute("data-open", "true");
  await expect(page.getByTestId("impression-row")).toHaveCount(3);
  await bar.getByTestId("review-bar-judge").click();
  await page.getByTestId("console-dialog").getByTestId("reason-input").fill("paper sheet");
  await page.getByTestId("console-dialog").getByTestId("impression-submit").click();
  await expect(bar).toHaveAttribute("data-state", "ready", { timeout: 40_000 });
});
