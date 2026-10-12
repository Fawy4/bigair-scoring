import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// Rider sheets (0.20.0) on a throwaway organisation (Arrow, EKL and Demo are never touched), phone size 390 × 844, ONE worker, on a production build:
//   - the spotter's Rider sheet: a line logs itself (a tapped suggestion, a 2-second pause with free text, Crash on), later changes update the same attempt, the judge's
//     score stays on a corrected attempt, a second spotter's log appears, no limit gives 10 lines and Add attempt makes 11;
//   - the judges' Rider sheet: line by line, Missed opens the next line and leaves no score from that judge on that attempt, a filled line can be changed;
//   - the Trick list: the text box sits directly above Log and CRASH, Left and Right fill their row, the text box and Log stay visible when the height is cut the way a keyboard
//     cuts it (a browser cannot open a real phone keyboard: the owner checks that part on his iPhone);
//   - the defaults: a phone that never chose opens on the Rider sheet (judge and spotter), a chosen view is kept after a reload, a criteria division stays on the Queue.
// In this sandbox the browser cannot open the Realtime socket, so the other phones and the console follow through the 5-second fallback.
let w: LiveWorld;
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld({ headScores: false });
});
test.afterEach(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});

/** A phone with its own login. `newViews: true` is a phone that never chose a view; the default is a phone that chose the old ones (Queue, Trick list). */
async function phone(browser: Browser, key: Parameters<LiveWorld["signInAs"]>[1], path: string, o: { newViews?: boolean; size?: { width: number; height: number } } = {}): Promise<Page> {
  const context = await browser.newContext({ viewport: o.size ?? { width: 390, height: 844 } });
  contexts.push(context);
  await installSupabaseProxy(context, { newViews: o.newViews });
  const page = await context.newPage();
  await w.signInAs(page, key, path);
  return page;
}
const sline = (p: Page, n: number) => p.locator(`[data-testid="spotter-line"][data-line="${n}"]`);
const strick = (p: Page, n: number) => sline(p, n).getByTestId("line-trick");
const jline = (p: Page, n: number) => p.locator(`[data-testid="sheet-line"][data-line="${n}"]`);
const jbox = (p: Page, n: number) => jline(p, n).getByTestId("line-score");
const jtype = async (p: Page, n: number, text: string) => {
  await jbox(p, n).click();
  await jbox(p, n).fill(text);
  await jbox(p, n).blur();
};
const attempts = async (heat: string, entry: string) => (await w.db.from("trick_attempts").select("id, seq, status, trick_name, direction, trick_parts, created_by_seat").eq("heat_id", heat).eq("entry_id", entry).is("deleted_at", null).order("seq")).data ?? [];
const scoresOf = async (attempt: string) => (await w.db.from("trick_scores").select("judge_seat_id, score, missed").eq("attempt_id", attempt)).data ?? [];
const cellOf = (head: Page, seq: number, judgeIndex: number) => head.locator('[data-testid="matrix-row"]').filter({ has: head.locator(`th >> text="${seq}"`) }).getByTestId("matrix-cell").nth(judgeIndex);
const block = (p: Page, id: string) => p.locator(`[data-block="${id}"]`);

test("the spotter's Rider sheet: a line logs itself, later changes update the same attempt, a crash keeps the typed trick, the judge's score survives a correction, a second spotter's log appears", async ({ browser }) => {
  test.setTimeout(900_000);
  const H = w.heats[0];
  const E = w.entries[0];
  await w.db.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", H).neq("entry_id", E);
  await w.startHeat(H);
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`, { newViews: true });
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`, { newViews: true });
  const head = await phone(browser, "head", `/head/${w.eventId}`, { size: { width: 1500, height: 1000 } });
  await head.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });

  // ---- the Rider sheet is the default; one empty line per attempt the division allows (7); only the first empty line takes typing
  await expect(spotter.getByTestId("spotter-sheet")).toBeVisible({ timeout: 30_000 });
  await expect(spotter.getByTestId("spot-view-sheet")).toHaveAttribute("aria-pressed", "true");
  await expect(spotter.getByTestId("spotter-line")).toHaveCount(7);
  await expect(spotter.getByTestId("rider-tile").first()).toContainText("RED");
  await spotter.getByTestId("rider-tile").first().click();
  await expect(strick(spotter, 1)).toBeEnabled();
  await expect(strick(spotter, 2)).toBeDisabled();
  await expect(sline(spotter, 1).getByTestId("line-state")).toHaveText("Empty");
  await expect(j1.getByTestId("rider-sheet")).toBeVisible({ timeout: 30_000 }); // the judge's phone also opens on the Rider sheet

  // ---- line 1: type "back", tap Backroll: the attempt exists with nothing else pressed, on the judge's phone and on the console
  await strick(spotter, 1).click();
  await strick(spotter, 1).fill("back");
  await expect(sline(spotter, 1).getByTestId("suggestion").filter({ hasText: "Backroll" })).toBeVisible();
  // typed but not logged: the suggestions are open and wait for a tap, and the line says so in words (never taken for a logged one), even after a long pause
  await expect(sline(spotter, 1).getByTestId("line-state")).toHaveText("Tap a trick to log");
  await spotter.waitForTimeout(3000);
  expect(await attempts(H, E)).toHaveLength(0);
  await expect(sline(spotter, 1).getByTestId("line-state")).toHaveText("Tap a trick to log");
  await sline(spotter, 1).getByTestId("suggestion").filter({ hasText: "Backroll" }).click();
  await expect.poll(async () => (await attempts(H, E)).map((a) => a.trick_name), { timeout: 30_000 }).toEqual(["Backroll"]);
  await expect(sline(spotter, 1).getByTestId("line-state")).toHaveText("Logged ✓", { timeout: 20_000 });
  await expect(jline(j1, 1)).toContainText("Backroll", { timeout: 40_000 });
  await expect(cellOf(head, 1, 0)).toBeAttached({ timeout: 40_000 });
  await expect(head.locator('[data-testid="matrix-row"]').first()).toContainText("Backroll", { timeout: 40_000 });
  await expect(strick(spotter, 2)).toBeEnabled(); // the next line opens

  // ---- the judge scores it (line 1 is the judge's first line without a score), then the spotter taps L: the SAME attempt now says Left, no second attempt
  await jtype(j1, 1, "7.5");
  await expect.poll(async () => (await scoresOf((await attempts(H, E))[0].id)).map((s) => Number(s.score)), { timeout: 30_000 }).toEqual([7.5]);
  await sline(spotter, 1).getByTestId("line-left").click();
  await expect.poll(async () => (await attempts(H, E)).map((a) => [a.seq, a.direction, a.trick_name]), { timeout: 30_000 }).toEqual([[1, "left", "Left Backroll"]]);
  await expect(jline(j1, 1)).toContainText("Left", { timeout: 40_000 });
  await expect(sline(spotter, 1).getByTestId("line-left")).toHaveAttribute("aria-pressed", "true");
  await sline(spotter, 1).getByTestId("line-right").click(); // only one can be on
  await expect(sline(spotter, 1).getByTestId("line-left")).toHaveAttribute("aria-pressed", "false");
  await expect(sline(spotter, 1).getByTestId("line-right")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await attempts(H, E)).map((a) => [a.direction, a.trick_name]), { timeout: 30_000 }).toEqual([["right", "Right Backroll"]]);
  await sline(spotter, 1).getByTestId("line-left").click();
  await expect.poll(async () => (await attempts(H, E)).map((a) => a.direction), { timeout: 30_000 }).toEqual(["left"]);

  // ---- line 2: free text that matches nothing logs itself after about 2 seconds, flagged for the head judge
  await strick(spotter, 2).click();
  await strick(spotter, 2).fill("zzzflip");
  await expect.poll(async () => (await attempts(H, E)).length, { timeout: 30_000 }).toBe(2);
  const second = (await attempts(H, E))[1];
  expect(second.trick_name).toBe("zzzflip");
  expect((second.trick_parts as { needsReview?: boolean }).needsReview).toBe(true);
  await expect(sline(spotter, 2).getByTestId("line-state")).toHaveText("Logged ✓", { timeout: 20_000 });

  // ---- line 3: "front" typed, Crash on: logged at once as a crash with the typed trick kept; the judge's line greys, the console shows the crash
  await strick(spotter, 3).click();
  await strick(spotter, 3).fill("front");
  await sline(spotter, 3).getByTestId("line-crash").click();
  await expect.poll(async () => (await attempts(H, E)).map((a) => [a.status, a.trick_name]).at(2), { timeout: 30_000 }).toEqual(["crashed", "Frontroll"]);
  await expect(sline(spotter, 3).getByTestId("line-crash-word")).toContainText("CRASH");
  await expect(sline(spotter, 3).getByTestId("line-kept-trick")).toContainText("Frontroll");
  await expect(jline(j1, 3)).toHaveAttribute("data-kind", "crash", { timeout: 40_000 });
  await expect(head.locator('[data-testid="matrix-row"]').filter({ has: head.locator('th >> text="3"') }).getByTestId("matrix-cell").first()).toHaveAttribute("data-state", "crash", { timeout: 40_000 });
  await expect(head.locator('[data-testid="matrix-row"]').filter({ has: head.locator('th >> text="3"') })).toContainText("Frontroll");
  // Crash off makes it a normal attempt again
  await sline(spotter, 3).getByTestId("line-crash").click();
  await expect.poll(async () => (await attempts(H, E)).map((a) => a.status).at(2), { timeout: 30_000 }).toBe("landed");
  await sline(spotter, 3).getByTestId("line-crash").click();
  await expect.poll(async () => (await attempts(H, E)).map((a) => a.status).at(2), { timeout: 30_000 }).toBe("crashed");

  // ---- correct line 1's trick: the same attempt, the judge's score stays, an audit line is written in words
  await strick(spotter, 1).click();
  await strick(spotter, 1).fill("front");
  await sline(spotter, 1).getByTestId("suggestion").filter({ hasText: "Frontroll" }).click();
  await expect.poll(async () => (await attempts(H, E))[0].trick_name, { timeout: 30_000 }).toBe("Left Frontroll");
  const rows = await attempts(H, E);
  expect(rows).toHaveLength(3);
  expect((await scoresOf(rows[0].id)).map((s) => Number(s.score))).toEqual([7.5]);
  await expect(jline(j1, 1)).toContainText("Frontroll", { timeout: 40_000 });
  await expect(jbox(j1, 1)).toHaveValue("7.5");
  const audit = (await w.db.from("audit_log").select("action, before, after").eq("event_id", w.eventId).eq("action", "attempt_edited_by_spotter").eq("row_id", rows[0].id)).data ?? [];
  expect(audit.length).toBeGreaterThan(0);

  // emptying the box does not delete the attempt
  await strick(spotter, 1).click();
  await strick(spotter, 1).fill("");
  await strick(spotter, 1).blur();
  await spotter.waitForTimeout(3000);
  expect(await attempts(H, E)).toHaveLength(3);

  // ---- a second spotter logs on the Trick list: the first spotter's sheet shows it as line 4, in order, and it cannot be changed from there
  const spotter2 = await phone(browser, "spotter2", `/spot/${w.eventId}`);
  await expect(spotter2.getByTestId("trick-builder")).toBeVisible({ timeout: 30_000 });
  await block(spotter2, "direction:left").click();
  await block(spotter2, "base:kiteloop").click();
  await spotter2.getByTestId("log-button").click();
  await expect.poll(async () => (await attempts(H, E)).length, { timeout: 30_000 }).toBe(4);
  await expect(strick(spotter, 4)).toHaveValue(/Kiteloop/, { timeout: 40_000 });
  await expect(sline(spotter, 4)).toHaveAttribute("data-state", "logged");
  await expect(strick(spotter, 4)).toBeDisabled();
  await expect(strick(spotter, 5)).toBeEnabled(); // the next empty line is the next attempt
  expect((await attempts(H, E))[3].trick_name).toBe("Left Kiteloop");
});

test("with no attempt limit the spotter's sheet has 10 lines and Add attempt makes 11", async ({ browser }) => {
  test.setTimeout(300_000);
  await w.db.from("divisions").update({ scoring_overrides: { heat: { maxAttemptsPerRider: null } } as never }).eq("id", w.divisionId);
  await w.startHeat(w.heats[0]);
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`, { newViews: true });
  await expect(spotter.getByTestId("spotter-sheet")).toBeVisible({ timeout: 30_000 });
  await expect(spotter.getByTestId("spotter-line")).toHaveCount(10);
  await expect(spotter.getByTestId("add-attempt")).toBeVisible();
  await spotter.getByTestId("add-attempt").click();
  await expect(spotter.getByTestId("spotter-line")).toHaveCount(11);
  await spotter.getByTestId("add-attempt").click();
  await expect(spotter.getByTestId("spotter-line")).toHaveCount(12);
});

test("the judges' Rider sheet is line by line: line 3 takes no score while line 2 is empty, Missed opens it and leaves no score from that judge, a filled line can still be changed", async ({ browser }) => {
  test.setTimeout(900_000);
  const H = w.heats[0];
  const E = w.entries[0];
  await w.db.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", H).neq("entry_id", E);
  await w.startHeat(H);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`, { newViews: true });
  const j2 = await phone(browser, "j2", `/judge/${w.eventId}`, { newViews: true });
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`); // the Trick list
  const head = await phone(browser, "head", `/head/${w.eventId}`, { size: { width: 1500, height: 1000 } });
  await head.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });
  await expect(j1.getByTestId("rider-sheet")).toBeVisible({ timeout: 30_000 });
  await expect(spotter.getByTestId("trick-builder")).toBeVisible({ timeout: 30_000 });

  // only line 1 takes a score on a fresh sheet
  await expect(jbox(j1, 1)).toBeEnabled();
  for (const n of [2, 3, 7]) await expect(jbox(j1, n)).toBeDisabled();
  await jtype(j1, 1, "7");
  await expect.poll(async () => ((await w.db.from("pending_scores").select("slot").eq("heat_id", H)).data ?? []).length, { timeout: 30_000 }).toBe(1);
  // line 2 is empty (nothing scored there): line 3 waits
  await expect(jbox(j1, 2)).toBeEnabled();
  await expect(jbox(j1, 3)).toBeDisabled();
  // Missed on line 2 counts as done and opens line 3
  await jline(j1, 2).getByTestId("line-missed").click();
  await expect.poll(async () => ((await w.db.from("pending_scores").select("slot, missed").eq("heat_id", H).order("slot")).data ?? []).map((n) => [n.slot, n.missed]), { timeout: 30_000 }).toEqual([[1, false], [2, true]]);
  await expect(jbox(j1, 3)).toBeEnabled();
  await expect(jbox(j1, 4)).toBeDisabled();
  await jtype(j1, 3, "8");

  // j2 on the same attempts scores normally, line by line
  await jtype(j2, 1, "6");
  await jtype(j2, 2, "5");

  // the spotter logs three landings: the notes land by order of logging; attempt 2 gets "Missed" from j1 and nothing else from j1
  for (const base of ["backroll", "frontroll", "kiteloop"]) {
    await block(spotter, "direction:left").click();
    await block(spotter, `base:${base}`).click();
    await spotter.getByTestId("log-button").click();
  }
  await expect.poll(async () => (await attempts(H, E)).length, { timeout: 30_000 }).toBe(3);
  const rows = await attempts(H, E);
  await expect.poll(async () => (await scoresOf(rows[0].id)).filter((s) => s.judge_seat_id === w.seats.j1.id).map((s) => Number(s.score)), { timeout: 30_000 }).toEqual([7]);
  await expect.poll(async () => (await scoresOf(rows[2].id)).filter((s) => s.judge_seat_id === w.seats.j1.id).map((s) => Number(s.score)), { timeout: 30_000 }).toEqual([8]);
  const two = (await scoresOf(rows[1].id)).filter((s) => s.judge_seat_id === w.seats.j1.id);
  expect(two).toEqual([{ judge_seat_id: w.seats.j1.id, score: null, missed: true }]);
  expect(((await w.db.from("pending_scores").select("id").eq("heat_id", H)).data ?? []).length).toBe(0);
  await expect(jline(j1, 2).getByTestId("line-score")).toHaveValue("Missed", { timeout: 40_000 });
  await expect(cellOf(head, 2, 0)).toHaveAttribute("data-state", "missed", { timeout: 40_000 }); // the console's own word for a Missed score

  // a filled line can still be changed until Submit (line 1), and Missed can be marked on a line that has its attempt
  await jtype(j1, 1, "7.5");
  await expect.poll(async () => (await scoresOf(rows[0].id)).filter((s) => s.judge_seat_id === w.seats.j1.id).map((s) => Number(s.score)), { timeout: 30_000 }).toEqual([7.5]);
  // j2 has scored lines 1 and 2; line 3 is its first line without a score, line 4 waits
  await expect(jbox(j2, 3)).toBeEnabled({ timeout: 40_000 });
  await expect(jbox(j2, 4)).toBeDisabled();
  await jline(j2, 3).getByTestId("line-missed").click();
  await expect.poll(async () => (await scoresOf(rows[2].id)).filter((s) => s.judge_seat_id === w.seats.j2.id), { timeout: 30_000 }).toEqual([{ judge_seat_id: w.seats.j2.id, score: null, missed: true }]);
  await expect(jbox(j2, 4)).toBeEnabled({ timeout: 40_000 });
});

test("the Trick list: the text box sits directly above Log and CRASH, Left and Right fill their row, and the text box and Log stay visible when the height is cut the way a keyboard cuts it", async ({ browser }) => {
  test.setTimeout(300_000);
  await w.startHeat(w.heats[0]);
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`); // chose the Trick list
  await expect(spotter.getByTestId("trick-builder")).toBeVisible({ timeout: 30_000 });
  const rect = async (id: string) => (await spotter.getByTestId(id).boundingBox())!;
  const input = (await spotter.locator("#trick-text").boundingBox())!;
  const log = await rect("log-button");
  const crash = await rect("crash-button");
  // the text box is directly above Log and CRASH (a small gap, never another control between them) and spans the same width
  expect(input.y + input.height).toBeLessThanOrEqual(log.y + 1);
  expect(log.y - (input.y + input.height)).toBeLessThan(14);
  expect(input.x).toBeLessThanOrEqual(crash.x + 1);
  expect(Math.abs(log.y - crash.y)).toBeLessThan(2);
  // the text box is the lowest thing above the buttons: it is below every block
  const blocks = await spotter.locator("[data-block]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
  expect(Math.max(...blocks)).toBeLessThanOrEqual(input.y + 1);

  // Left and Right share the row: half each, the selected one with a thick border and a tick
  const left = (await block(spotter, "direction:left").boundingBox())!;
  const right = (await block(spotter, "direction:right").boundingBox())!;
  expect(Math.abs(left.width - right.width)).toBeLessThan(2);
  expect(Math.abs(left.y - right.y)).toBeLessThan(2);
  expect(left.width + right.width + 6).toBeGreaterThan(390 - 24); // the whole row, minus the screen margins
  expect(left.width).toBeGreaterThan(150);
  await block(spotter, "direction:left").click();
  await expect(block(spotter, "direction:left")).toHaveAttribute("aria-pressed", "true");
  await expect(block(spotter, "direction:left").locator("svg")).toBeVisible();
  await expect(block(spotter, "direction:right").locator("svg")).toHaveCount(0);
  expect(await block(spotter, "direction:left").evaluate((e) => getComputedStyle(e).borderTopWidth)).toBe("4px");
  expect(await block(spotter, "direction:right").evaluate((e) => getComputedStyle(e).borderTopWidth)).toBe("1px");
  await block(spotter, "direction:right").click();
  await expect(block(spotter, "direction:right").locator("svg")).toBeVisible();
  await expect(block(spotter, "direction:left").locator("svg")).toHaveCount(0);

  // the height cut the way a keyboard cuts it (844 → 508): the text box, Log and CRASH are all still on the screen, typing is visible
  await spotter.setViewportSize({ width: 390, height: 508 });
  await spotter.locator("#trick-text").fill("back");
  for (const el of [spotter.locator("#trick-text"), spotter.getByTestId("log-button"), spotter.getByTestId("crash-button")]) {
    const b = (await el.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(508);
  }
  await expect(spotter.locator("#trick-text")).toHaveValue("back");
  await expect(spotter.getByTestId("log-button")).toBeInViewport();

  // the Rider sheet: the line being typed stays on the screen at that height
  await spotter.getByTestId("spot-view-sheet").click();
  await expect(spotter.getByTestId("spotter-sheet")).toBeVisible();
  await strick(spotter, 1).click();
  await strick(spotter, 1).fill("back");
  await expect(strick(spotter, 1)).toBeInViewport();
  await expect(sline(spotter, 1).getByTestId("line-left")).toBeInViewport();
  await expect(sline(spotter, 1).getByTestId("line-crash")).toBeInViewport();
  await expect(sline(spotter, 1).getByTestId("suggestion").first()).toBeInViewport({ timeout: 5000 });
});

test("the defaults: a phone that never chose opens on the Rider sheet; a chosen view is kept after a reload; a criteria division stays on the Queue", async ({ browser }) => {
  test.setTimeout(600_000);
  await w.startHeat(w.heats[0]);
  // a judge's phone that never chose
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`, { newViews: true });
  await expect(j1.getByTestId("view-sheet")).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  await expect(j1.getByTestId("rider-sheet")).toBeVisible();
  await j1.getByTestId("view-queue").click();
  await expect(j1.getByTestId("all-scored")).toBeVisible();
  await j1.reload();
  await expect(j1.getByTestId("view-queue")).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  await expect(j1.getByTestId("all-scored")).toBeVisible();
  // another judge's phone: still the new default
  const j2 = await phone(browser, "j2", `/judge/${w.eventId}`, { newViews: true });
  await expect(j2.getByTestId("view-sheet")).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });

  // a spotter's phone that never chose; then the Trick list, kept after a reload; another spotter's phone: the Rider sheet
  const s1 = await phone(browser, "spotter", `/spot/${w.eventId}`, { newViews: true });
  await expect(s1.getByTestId("spot-view-sheet")).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  await s1.getByTestId("spot-view-list").click();
  await expect(s1.getByTestId("trick-builder")).toBeVisible();
  await s1.reload();
  await expect(s1.getByTestId("spot-view-list")).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  await expect(s1.getByTestId("trick-builder")).toBeVisible();
  const s2 = await phone(browser, "spotter2", `/spot/${w.eventId}`, { newViews: true });
  await expect(s2.getByTestId("spotter-sheet")).toBeVisible({ timeout: 30_000 });

  // a division scored by criteria has no Rider sheet: the judge stays on the Queue
  const cw = await createLiveWorld({ model: "kota-best3-impression" });
  const old = w;
  w = cw;
  try {
    await cw.startHeat(cw.heats[0]);
    const jc = await phone(browser, "j1", `/judge/${cw.eventId}`, { newViews: true });
    await expect(jc.getByTestId("all-scored")).toBeVisible({ timeout: 40_000 });
    await expect(jc.getByTestId("rider-sheet")).toHaveCount(0);
    await expect(jc.getByTestId("view-switch")).toHaveCount(0);
  } finally {
    w = old;
    await cw.cleanup();
  }
});
