import { test, expect, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import { endedHeat, judgesFinish, laptop, phone as openPhone } from "./heat-end-helpers";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// HE1 rule 5: a judge's flag cannot be missed. A flag look of its own, "1 open flag" beside the heat header (laptop and phone), the flags listed in the review bar with the
// judge's note and a jump to the attempt, on a narrow screen the box above the table, Publish asking once while a flag is open, fixing the attempt resolving its flag.
// Throwaway organisation, production build, ONE worker.
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
const jline = (p: Page, n: number) => p.locator(`[data-testid="sheet-line"][data-line="${n}"]`);

test("a judge flags a line with a note: the head judge sees the count, the bar, the box and the jump; Publish asks once; fixing the attempt resolves the flag", async ({ browser }) => {
  test.setTimeout(600_000);
  const H = w.heats[0];
  const [attempt] = await endedHeat(w, H);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`);
  await expect(j1.getByTestId("heat-ended-strip")).toBeVisible({ timeout: 60_000 }); // the judge is still on his sheet
  await expect(jline(j1, 1)).toContainText("Backroll", { timeout: 40_000 });

  // ---- the judge flags line 1 with a note
  await jline(j1, 1).getByTestId("line-flag").click();
  await expect(j1.getByTestId("line-flag-sheet")).toBeVisible();
  await j1.getByTestId("flag-note").fill("The board hit the water first");
  await j1.locator('[data-flag="crash"]').click();
  await expect.poll(async () => ((await w.db.from("attempt_flags").select("kind, note, resolved_at").eq("attempt_id", attempt)).data ?? []).map((f) => [f.kind, f.note, f.resolved_at]), { timeout: 30_000 }).toEqual([["crash", "The board hit the water first", null]]);

  // ---- the head judge's laptop: "1 open flag" beside the heat header, the flag in the review bar with the note, the box in the side column
  const head = await phone(browser, "head", `/head/${w.eventId}`, laptop);
  await head.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });
  const count = head.getByTestId("open-flag-count");
  await expect(count).toHaveText("1 open flag", { timeout: 60_000 });
  const title = (await head.locator('[data-testid="head-live-console"] p.text-name').first().boundingBox())!;
  const pill = (await count.boundingBox())!;
  expect(Math.abs(pill.y - title.y)).toBeLessThan(40); // on the heat header's own row
  const barFlag = head.getByTestId("review-bar").getByTestId("review-flag");
  await expect(barFlag).toContainText("Judge 1 · That was a crash · ");
  await expect(barFlag.getByTestId("review-flag-note")).toHaveText("“The board hit the water first”");
  const side = (await head.getByTestId("head-side").boundingBox())!;
  const box = (await head.getByTestId("flags").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(side.x - 1); // beside the table on a laptop
  // the flag has a look of its own: the brand's ink, filled; not the amber of an outlier
  const inked = await barFlag.evaluate((el) => {
    const s = getComputedStyle(el);
    const root = getComputedStyle(document.documentElement);
    return { bg: s.backgroundColor, ink: getComputedStyle(document.querySelector('[data-testid="head-page"]') ?? document.body).getPropertyValue("--beach-ink") || root.getPropertyValue("--beach-ink") };
  });
  expect(inked.bg).not.toBe("rgba(0, 0, 0, 0)");
  // the jump: the attempt's row is outlined
  await barFlag.getByTestId("review-flag-jump").click();
  await expect(head.locator(`[data-testid="matrix-row"][data-row-id="${attempt}"]`)).toHaveAttribute("data-highlight", "true");
  await expect(head.locator(`[data-testid="matrix-row"][data-row-id="${attempt}"]`).getByTestId("row-flag")).toContainText("That was a crash");

  // ---- Publish asks once about the open flag and does not block
  await judgesFinish(w, H);
  await head.getByTestId("publish").click();
  await expect(head.getByTestId("publish-open")).toContainText("1 open flag", { timeout: 40_000 });
  await expect(head.getByRole("button", { name: "Publish anyway" })).toBeEnabled();
  await head.getByTestId("dialog-cancel").click();

  // ---- fixing the attempt (it was a crash) resolves its flag; the count, the bar's flag and the box go
  await w.db.from("trick_attempts").update({ status: "crashed" }).eq("id", attempt);
  await expect.poll(async () => ((await w.db.from("attempt_flags").select("resolved_at").eq("attempt_id", attempt)).data ?? []).map((f) => f.resolved_at !== null), { timeout: 30_000 }).toEqual([true]);
  await expect(count).toHaveCount(0, { timeout: 60_000 });
  await expect(head.getByTestId("review-flag")).toHaveCount(0);
  await expect(head.getByTestId("flags")).toContainText("No open flags");
  await head.getByTestId("publish").click();
  await expect(head.getByTestId("publish-open")).toHaveCount(0);
  await expect(head.getByTestId("dialog-save")).toHaveText("Publish");
});

test("on a narrow console the flags box sits above the table; on a phone the count, the bar and the box are there without a table", async ({ browser }) => {
  test.setTimeout(600_000);
  const H = w.heats[0];
  const [attempt] = await endedHeat(w, H);
  await w.db.from("attempt_flags").insert({ event_id: w.eventId, heat_id: H, attempt_id: attempt, judge_seat_id: w.seats.j2.id, kind: "wrong_rider", note: "That was Blue", client_key: crypto.randomUUID() });
  // a tablet-width console (the right column drops below the table)
  const narrow = await phone(browser, "head", `/head/${w.eventId}`, { width: 1100, height: 900 });
  await narrow.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });
  await expect(narrow.getByTestId("flags")).toBeVisible({ timeout: 60_000 });
  await expect(narrow.getByTestId("flag-row")).toContainText("That was Blue", { timeout: 40_000 }); // settled: the box has its final height
  // both rectangles read at the same instant (a font arriving moves things between two separate reads)
  const placed = await narrow.evaluate(() => {
    const f = document.querySelector('[data-testid="flags"]')!;
    const t = document.querySelector('[data-testid="head-matrix"]')!;
    const fr = f.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    return { flagsBottom: fr.bottom, tableTop: tr.top, before: Boolean(f.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) };
  });
  expect(placed.before).toBe(true);
  expect(placed.flagsBottom).toBeLessThanOrEqual(placed.tableTop + 1);
  await expect(narrow.getByTestId("flag-row")).toContainText("That was Blue");
  await expect(narrow.getByTestId("open-flag-count")).toHaveText("1 open flag");

  // a phone (390 px): "1 open flag" under the heat's header, the Heat ended strip, the bar with the flag and its note, the box; no horizontal scroll
  const small = await phone(browser, "head", `/head/${w.eventId}`);
  await small.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });
  await expect(small.getByTestId("open-flag-count")).toHaveText("1 open flag", { timeout: 60_000 });
  await expect(small.getByTestId("heat-ended-strip")).toContainText("Heat ended");
  await expect(small.getByTestId("review-bar").getByTestId("review-flag-note")).toHaveText("“That was Blue”");
  await expect(small.getByTestId("flags")).toBeVisible();
  expect(await small.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
