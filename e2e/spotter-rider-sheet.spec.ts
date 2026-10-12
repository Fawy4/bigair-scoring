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
async function phone(browser: Browser, key: Parameters<LiveWorld["signInAs"]>[1], path: string, o: { newViews?: boolean; size?: { width: number; height: number }; trackLit?: boolean } = {}): Promise<Page> {
  const context = await browser.newContext({ viewport: o.size ?? { width: 390, height: 844 } });
  contexts.push(context);
  await installSupabaseProxy(context, { newViews: o.newViews });
  // counts every moment a line is highlighted as needing a score (a line the judge filled ahead must never light up, not even for a moment)
  if (o.trackLit)
    await context.addInitScript(() => {
      (window as unknown as { __lit: number }).__lit = 0;
      const check = (n: Node) => {
        const el = n as Element;
        if (el.nodeType === 1 && (el.matches?.('[data-needs-score="true"]') || el.querySelector?.('[data-needs-score="true"]'))) (window as unknown as { __lit: number }).__lit++;
      };
      new MutationObserver((ms) => {
        for (const m of ms) {
          if (m.type === "attributes") check(m.target);
          else m.addedNodes.forEach(check);
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-needs-score"] });
    });
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
  expect(second.trick_name).toBe("Zzzflip"); // names start with a capital
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
  await expect(jbox(j1, 1)).toBeEditable();
  for (const n of [2, 3, 7]) await expect(jbox(j1, n)).toHaveAttribute("readonly", "");
  await jtype(j1, 1, "7");
  await expect.poll(async () => ((await w.db.from("pending_scores").select("slot").eq("heat_id", H)).data ?? []).length, { timeout: 30_000 }).toBe(1);
  // line 2 is empty (nothing scored there): line 3 waits
  await expect(jbox(j1, 2)).toBeEditable();
  await expect(jbox(j1, 3)).toHaveAttribute("readonly", "");
  // Missed on line 2 counts as done and opens line 3
  await jline(j1, 2).getByTestId("line-missed").click();
  await expect.poll(async () => ((await w.db.from("pending_scores").select("slot, missed").eq("heat_id", H).order("slot")).data ?? []).map((n) => [n.slot, n.missed]), { timeout: 30_000 }).toEqual([[1, false], [2, true]]);
  await expect(jbox(j1, 3)).toBeEditable();
  await expect(jbox(j1, 4)).toHaveAttribute("readonly", "");
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
  await expect(jline(j1, 2).getByTestId("line-missed")).toHaveAttribute("aria-pressed", "true", { timeout: 40_000 }); // Missed is shown by its own switch; the score box stays empty
  await expect(jline(j1, 2).getByTestId("line-score")).toHaveValue("");
  await expect(cellOf(head, 2, 0)).toHaveAttribute("data-state", "missed", { timeout: 40_000 }); // the console's own word for a Missed score

  // a filled line can still be changed until Submit (line 1), and Missed can be marked on a line that has its attempt
  await jtype(j1, 1, "7.5");
  await expect.poll(async () => (await scoresOf(rows[0].id)).filter((s) => s.judge_seat_id === w.seats.j1.id).map((s) => Number(s.score)), { timeout: 30_000 }).toEqual([7.5]);
  // j2 has scored lines 1 and 2; line 3 is its first line without a score, line 4 waits
  await expect(jbox(j2, 3)).toBeEditable({ timeout: 40_000 });
  await expect(jbox(j2, 4)).toHaveAttribute("readonly", "");
  await jline(j2, 3).getByTestId("line-missed").click();
  await expect.poll(async () => (await scoresOf(rows[2].id)).filter((s) => s.judge_seat_id === w.seats.j2.id), { timeout: 30_000 }).toEqual([{ judge_seat_id: w.seats.j2.id, score: null, missed: true }]);
  await expect(jbox(j2, 4)).toBeEditable({ timeout: 40_000 });
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

test("a Missed note left at the end of the heat blocks Publish and says it is a Missed note (no score is lost by clearing it); the head judge's Clear removes it", async ({ browser }) => {
  test.setTimeout(600_000);
  const H = w.heats[0];
  await w.db.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", H).neq("entry_id", w.entries[0]);
  await w.startHeat(H);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`, { newViews: true });
  const head = await phone(browser, "head", `/head/${w.eventId}`, { size: { width: 1500, height: 1000 } });
  await head.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });
  await expect(j1.getByTestId("rider-sheet")).toBeVisible({ timeout: 30_000 });

  // the judge did not see an attempt that the spotter never logged: Missed on line 1 is a note
  await jline(j1, 1).getByTestId("line-missed").click();
  await expect.poll(async () => ((await w.db.from("pending_scores").select("slot, missed").eq("heat_id", H)).data ?? []).map((n) => [n.slot, n.missed]), { timeout: 30_000 }).toEqual([[1, true]]);
  await expect(head.getByTestId("pending-row")).toHaveCount(1, { timeout: 40_000 });
  await expect(head.getByTestId("pending-row").first().getByTestId("pending-cell").first()).toContainText("Missed");

  // the heat ends with the note still there: the blocker says Missed note, and there is no override
  await w.db.from("heats").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", H);
  const blockerLine = head.getByTestId("blockers").getByTestId("blocker-line").filter({ hasText: "Missed note with no attempt" });
  await expect(blockerLine).toContainText("no score is lost by clearing it", { timeout: 60_000 });
  await head.getByTestId("publish").click();
  const dialog = head.getByTestId("console-dialog");
  await expect(dialog.getByTestId("publish-blockers")).toContainText("Missed note with no attempt");
  await expect(dialog.getByTestId("dialog-save")).toBeDisabled();
  await dialog.getByTestId("dialog-cancel").click();

  // the head judge's Clear removes it, and the blocker goes
  await head.getByTestId("clear-note").click();
  await dialog.getByTestId("dialog-save").click();
  await expect.poll(async () => ((await w.db.from("pending_scores").select("id").eq("heat_id", H)).data ?? []).length, { timeout: 30_000 }).toBe(0);
  await expect(blockerLine).toHaveCount(0, { timeout: 60_000 });
  const audit = (await w.db.from("audit_log").select("action, before").eq("event_id", w.eventId).eq("action", "pending_cleared_by_head")).data ?? [];
  expect(audit).toHaveLength(1);
  expect(audit[0].before).toMatchObject({ judge_seat_id: w.seats.j1.id, missed: true });
});


// ---- Judges' Rider sheet 0.20.0: every line visible, the judge never waits for the spotter
const mkAttempts = async (heat: string, entry: string, n: number, seat?: string) => {
  const ids: string[] = [];
  for (let i = 1; i <= n; i++) {
    const r = await w.db.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq: i, status: "landed", trick_name: `Left Backroll ${i}`, direction: "left", client_key: crypto.randomUUID(), ...(seat ? { created_by_seat: seat } : {}) }).select("id").single();
    ids.push(r.data!.id as string);
  }
  return ids;
};
const myScores = async (judge: "j1" | "j2", heat: string) => (await w.db.from("trick_scores").select("score, missed, trick_attempts!inner(seq)").eq("heat_id", heat).eq("judge_seat_id", w.seats[judge].id)).data ?? [];

test("the judge never waits for the spotter: all 7 lines are there, lines 1, 2 and 3 take a score at once, the console shows three pending rows, and the scores land on attempts 1, 2 and 3 in order", async ({ browser }) => {
  test.setTimeout(900_000);
  const H = w.heats[0];
  const E = w.entries[0];
  await w.db.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", H).neq("entry_id", E);
  await w.startHeat(H);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`, { newViews: true });
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`); // the Trick list
  const head = await phone(browser, "head", `/head/${w.eventId}`, { size: { width: 1500, height: 1000 } });
  await head.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });
  await expect(j1.getByTestId("rider-sheet")).toBeVisible({ timeout: 30_000 });

  // every line is there from the start (the division's limit), none hidden or greyed like a crash
  await expect(j1.getByTestId("sheet-line")).toHaveCount(7);
  for (const n of [1, 2, 3, 4, 5, 6, 7]) await expect(jline(j1, n)).toBeVisible();
  await expect(j1.locator('[data-testid="sheet-line"][data-kind="crash"]')).toHaveCount(0);

  await expect(j1.locator('[data-needs-score="true"]')).toHaveCount(0); // nothing logged yet: nothing to highlight
  // the spotter has logged nothing: the judge scores lines 1, 2 and 3 straight away, each one opening the next
  await jtype(j1, 1, "7");
  await jtype(j1, 2, "8");
  await jtype(j1, 3, "6.5");
  await expect.poll(async () => ((await w.db.from("pending_scores").select("slot, score").eq("heat_id", H).order("slot")).data ?? []).map((n) => [n.slot, Number(n.score)]), { timeout: 30_000 }).toEqual([[1, 7], [2, 8], [3, 6.5]]);
  await expect(head.getByTestId("pending-row")).toHaveCount(3, { timeout: 40_000 });
  await expect(jbox(j1, 4)).toBeEditable(); // the next line is open

  // the spotter catches up: three attempts, and the scores land on attempts 1, 2 and 3 in order, with the spotter's trick names on the lines
  for (const base of ["backroll", "frontroll", "kiteloop"]) {
    await block(spotter, "direction:left").click();
    await block(spotter, `base:${base}`).click();
    await spotter.getByTestId("log-button").click();
  }
  await expect.poll(async () => (await myScores("j1", H)).map((s) => [(s.trick_attempts as unknown as { seq: number }).seq, Number(s.score)]).sort(), { timeout: 40_000 }).toEqual([[1, 7], [2, 8], [3, 6.5]]);
  await expect(jline(j1, 1)).toContainText("Left Backroll", { timeout: 40_000 });
  await expect(jline(j1, 3)).toContainText("Left Kiteloop");
  await expect(head.getByTestId("pending-row")).toHaveCount(0, { timeout: 40_000 });
  await expect(j1.locator('[data-needs-score="true"]')).toHaveCount(0); // the three attempts arrived already scored by the notes
});

test("tapping a line below one with no score asks once, in one line, and one tap marks the lines above Missed and opens the tapped line; a Missed line can still be given a score", async ({ browser }) => {
  test.setTimeout(600_000);
  const H = w.heats[0];
  const E = w.entries[0];
  await w.db.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", H).neq("entry_id", E);
  await w.startHeat(H);
  const ids = await mkAttempts(H, E, 3, w.seats.spotter.id);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`, { newViews: true });
  await expect(jline(j1, 3)).toContainText("Left Backroll 3", { timeout: 40_000 });
  await expect(j1.getByTestId("sheet-line")).toHaveCount(7);

  // lines 1-3 have attempts and no score from this judge: they are highlighted with the words "Needs your score"; line 4 (no attempt yet) is not
  for (const n of [1, 2, 3]) {
    await expect(jline(j1, n)).toHaveAttribute("data-needs-score", "true");
    await expect(jline(j1, n).getByTestId("line-needs-score")).toHaveText("Needs your score");
  }
  await expect(jline(j1, 4)).not.toHaveAttribute("data-needs-score", "true");
  // sleek, not a box: a slim bar on the left edge, a rounded tag with the words, a glow on the score box; the row itself is not filled and has no frame
  for (const n of [1, 2, 3]) await expect(jline(j1, n).getByTestId("line-needs-bar")).toBeVisible();
  await expect(jline(j1, 4).getByTestId("line-needs-bar")).toHaveCount(0);
  expect(await jline(j1, 1).evaluate((e) => getComputedStyle(e).boxShadow)).toBe("none");
  expect(await jline(j1, 1).evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  // only the line he types on next (line 1) pulses and glows; the other lines that need a score keep the bar and the tag
  await expect(jline(j1, 1)).toHaveAttribute("data-pulse", "true");
  for (const n of [2, 3, 4]) await expect(jline(j1, n)).not.toHaveAttribute("data-pulse", "true");
  expect(await jbox(j1, 1).evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe("none"); // the glow on the box to type in
  for (const n of [2, 3, 4]) expect(await jbox(j1, n).evaluate((e) => getComputedStyle(e).boxShadow), `line ${n}`).toBe("none");
  // line 4 is below them: tapping it asks, it does not do nothing
  await jbox(j1, 4).click();
  await expect(j1.getByTestId("skip-ask")).toHaveText(/Lines 1–3 have no score from you\. Set them to Missed and score line 4\?/);
  await expect(jbox(j1, 4)).toHaveAttribute("readonly", "");
  // Not now leaves everything as it was
  await j1.getByTestId("skip-cancel").click();
  await expect(j1.getByTestId("skip-ask")).toHaveCount(0);
  expect(await myScores("j1", H)).toHaveLength(0);

  // one tap: 1-3 are Missed, line 4 is open (and focused)
  await jbox(j1, 4).click();
  await j1.getByTestId("skip-confirm").click();
  await expect.poll(async () => (await myScores("j1", H)).map((s) => [(s.trick_attempts as unknown as { seq: number }).seq, s.missed, s.score]).sort(), { timeout: 30_000 }).toEqual([[1, true, null], [2, true, null], [3, true, null]]);
  await expect(jbox(j1, 4)).toBeEditable({ timeout: 30_000 });
  await expect(j1.getByTestId("skip-ask")).toHaveCount(0);
  await expect(j1.locator('[data-needs-score="true"]')).toHaveCount(0); // Missed lines are done: nothing is highlighted any more
  await expect(jline(j1, 1).getByTestId("line-missed")).toHaveAttribute("aria-pressed", "true");
  await expect(jbox(j1, 1)).toHaveValue("");
  await jtype(j1, 4, "8"); // the spotter has not logged attempt 4: a pending note, as always
  await expect.poll(async () => ((await w.db.from("pending_scores").select("slot, score").eq("heat_id", H)).data ?? []).map((n) => [n.slot, Number(n.score)]), { timeout: 30_000 }).toEqual([[4, 8]]);

  // a Missed line can still be given a score until Submit
  await jtype(j1, 2, "6");
  await expect.poll(async () => (await myScores("j1", H)).filter((s) => (s.trick_attempts as unknown as { seq: number }).seq === 2).map((s) => [s.missed, Number(s.score)]), { timeout: 30_000 }).toEqual([[false, 6]]);
  expect(ids).toHaveLength(3);
});

test("with no attempt limit the judge's sheet starts with 10 lines and filling the last one makes a new line appear at once", async ({ browser }) => {
  test.setTimeout(600_000);
  await w.db.from("divisions").update({ scoring_overrides: { heat: { maxAttemptsPerRider: null } } as never }).eq("id", w.divisionId);
  const H = w.heats[0];
  const E = w.entries[0];
  await w.db.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", H).neq("entry_id", E);
  await w.startHeat(H);
  // nine attempts logged and scored by this judge: line 10 is the line ahead (the server keeps a note only one line ahead of the attempts logged)
  const ids = await mkAttempts(H, E, 9, w.seats.spotter.id);
  for (const id of ids) await w.db.from("trick_scores").insert({ attempt_id: id, judge_seat_id: w.seats.j1.id, score: 7, client_key: crypto.randomUUID(), client_rev: 1 });
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`, { newViews: true });
  await expect(jline(j1, 9)).toContainText("Left Backroll 9", { timeout: 40_000 });
  await expect(j1.getByTestId("sheet-line")).toHaveCount(10); // 10 lines, none hidden
  await expect(jbox(j1, 10)).toBeEditable();
  await jtype(j1, 10, "7.5");
  await expect(j1.getByTestId("sheet-line")).toHaveCount(11, { timeout: 30_000 }); // a new line appears under the last one at once
  await expect(jline(j1, 11)).toBeVisible();
  await expect.poll(async () => ((await w.db.from("pending_scores").select("slot").eq("heat_id", H)).data ?? []).length, { timeout: 30_000 }).toBe(1);
});


// ---- Last round of #45: judges never wait (also with no limit), the late crash, the highlight, the Missed switch, Flag, sticky cards, 16 px, no Note button, the clear button
const noLimit = () => w.db.from("divisions").update({ scoring_overrides: { heat: { maxAttemptsPerRider: null } } as never }).eq("id", w.divisionId);
const onlyRed = async (H: string) => w.db.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", H).neq("entry_id", w.entries[0]);
const logList = async (spotter: Page, base: string, dir = "left") => {
  await block(spotter, `direction:${dir}`).click();
  await block(spotter, `base:${base}`).click();
  await spotter.getByTestId("log-button").click();
};
const crashList = async (spotter: Page, base: string) => {
  await block(spotter, "direction:right").click();
  await block(spotter, `base:${base}`).click();
  await spotter.getByTestId("crash-button").click();
  await spotter.getByTestId("crash-yes").click();
};

test("(a) no attempt limit: a judge scores lines 1, 2 and 3 straight away, the console shows three pending rows, then the spotter logs three attempts and the scores land on attempts 1, 2 and 3 in order", async ({ browser }) => {
  test.setTimeout(900_000);
  await noLimit();
  const H = w.heats[0];
  const E = w.entries[0];
  await onlyRed(H);
  await w.startHeat(H);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`, { newViews: true });
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`);
  const head = await phone(browser, "head", `/head/${w.eventId}`, { size: { width: 1500, height: 1000 } });
  await head.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });
  await expect(j1.getByTestId("sheet-line")).toHaveCount(10, { timeout: 30_000 }); // 10 lines from the start
  await jtype(j1, 1, "7");
  await jtype(j1, 2, "8");
  await jtype(j1, 3, "6.5");
  await expect.poll(async () => ((await w.db.from("pending_scores").select("slot, score").eq("heat_id", H).order("slot")).data ?? []).map((n) => [n.slot, Number(n.score)]), { timeout: 30_000 }).toEqual([[1, 7], [2, 8], [3, 6.5]]);
  await expect(head.getByTestId("pending-row")).toHaveCount(3, { timeout: 40_000 });
  await expect(spotter.getByTestId("trick-builder")).toBeVisible({ timeout: 30_000 });
  for (const base of ["backroll", "frontroll", "kiteloop"]) await logList(spotter, base);
  await expect.poll(async () => (await myScores("j1", H)).map((s) => [(s.trick_attempts as unknown as { seq: number }).seq, Number(s.score)]).sort(), { timeout: 40_000 }).toEqual([[1, 7], [2, 8], [3, 6.5]]);
  await expect(head.getByTestId("pending-row")).toHaveCount(0, { timeout: 40_000 });
});

for (const second of ["a score", "Missed"] as const) {
  test(`(b) a crash logged late (line 2 holds ${second} typed ahead): lines 1 and 3 land on attempts 1 and 3, line 2 shows the crash, nothing shifts, no line lights up, no note is left to block Publish`, async ({ browser }) => {
    test.setTimeout(900_000);
    const H = w.heats[0];
    await onlyRed(H);
    await w.startHeat(H);
    const j1 = await phone(browser, "j1", `/judge/${w.eventId}`, { newViews: true, trackLit: true });
    const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`);
    await expect(j1.getByTestId("rider-sheet")).toBeVisible({ timeout: 30_000 });
    await jtype(j1, 1, "7");
    if (second === "a score") await jtype(j1, 2, "8");
    else await jline(j1, 2).getByTestId("line-missed").click();
    await jtype(j1, 3, "6.5");
    await expect.poll(async () => ((await w.db.from("pending_scores").select("slot").eq("heat_id", H)).data ?? []).length, { timeout: 30_000 }).toBe(3);
    await expect(spotter.getByTestId("trick-builder")).toBeVisible({ timeout: 30_000 });
    await logList(spotter, "backroll");
    await expect.poll(async () => (await attempts(H, w.entries[0])).length, { timeout: 30_000 }).toBe(1);
    await crashList(spotter, "frontroll");
    await expect.poll(async () => (await attempts(H, w.entries[0])).length, { timeout: 30_000 }).toBe(2);
    await logList(spotter, "kiteloop");
    await expect.poll(async () => (await attempts(H, w.entries[0])).length, { timeout: 30_000 }).toBe(3);
    const rows = await attempts(H, w.entries[0]);
    expect(rows.map((a) => [a.seq, a.status])).toEqual([[1, "landed"], [2, "crashed"], [3, "landed"]]);
    await expect.poll(async () => (await myScores("j1", H)).map((s) => [(s.trick_attempts as unknown as { seq: number }).seq, Number(s.score)]).sort(), { timeout: 40_000 }).toEqual([[1, 7], [3, 6.5]]);
    expect(await scoresOf(rows[1].id)).toEqual([]); // the crash absorbed what was typed on its line
    await expect(jline(j1, 2)).toHaveAttribute("data-kind", "crash", { timeout: 40_000 });
    await expect(jline(j1, 1)).toContainText("Left Backroll");
    await expect(jline(j1, 3)).toContainText("Left Kiteloop");
    // nothing left behind that blocks Publish
    expect(((await w.db.from("pending_scores").select("id").eq("heat_id", H)).data ?? []).length).toBe(0);
    // and no line lit up at any moment
    await j1.waitForTimeout(1500);
    expect(await j1.evaluate(() => (window as unknown as { __lit: number }).__lit)).toBe(0);
  });
}

test("(c) the highlight: three attempts logged, the judge scores only line 1: lines 2 and 3 show the teal bar and the tag, only line 2 pulses and glows, and scoring line 2 moves them to line 3", async ({ browser }) => {
  test.setTimeout(600_000);
  const H = w.heats[0];
  await onlyRed(H);
  await w.startHeat(H);
  await mkAttempts(H, w.entries[0], 3, w.seats.spotter.id);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`, { newViews: true });
  await expect(jline(j1, 3)).toContainText("Left Backroll 3", { timeout: 40_000 });
  await jtype(j1, 1, "7");
  for (const n of [2, 3]) {
    await expect(jline(j1, n)).toHaveAttribute("data-needs-score", "true");
    await expect(jline(j1, n).getByTestId("line-needs-score")).toHaveText("Needs your score");
    await expect(jline(j1, n).getByTestId("line-needs-bar")).toBeVisible();
  }
  await expect(jline(j1, 1)).not.toHaveAttribute("data-needs-score", "true");
  // only line 2 pulses and glows
  await expect(jline(j1, 2)).toHaveAttribute("data-pulse", "true");
  await expect(jline(j1, 3)).not.toHaveAttribute("data-pulse", "true");
  const anim = (n: number) => jline(j1, n).getByTestId("line-needs-dot").evaluate((e) => getComputedStyle(e).animationName);
  expect(await anim(2)).not.toBe("none");
  expect(await anim(3)).toBe("none");
  expect(await jbox(j1, 2).evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe("none");
  expect(await jbox(j1, 3).evaluate((e) => getComputedStyle(e).boxShadow)).toBe("none");
  // teal, not red: the bar is the colour of the selected Rider sheet button (and not the colour of the Crash tag or the lycra card)
  const bar = await jline(j1, 2).getByTestId("line-needs-bar").evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bar).toBe(await j1.getByTestId("view-sheet").evaluate((e) => getComputedStyle(e).backgroundColor));
  expect(await jline(j1, 2).getByTestId("line-needs-dot").evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(bar);
  // scoring line 2 moves the pulse and the glow to line 3
  await jtype(j1, 2, "8");
  await expect(jline(j1, 3)).toHaveAttribute("data-pulse", "true", { timeout: 20_000 });
  await expect(jline(j1, 2)).not.toHaveAttribute("data-needs-score", "true");
  expect(await anim(3)).not.toBe("none");
  expect(await jbox(j1, 3).evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe("none");
  expect(await jbox(j1, 2).evaluate((e) => getComputedStyle(e).boxShadow)).toBe("none");
});

test("(d) Missed is a switch: a tap turns it on (the box stays empty), another turns it off, and typing a score on a Missed line turns it off by itself with nothing to clear", async ({ browser }) => {
  test.setTimeout(600_000);
  const H = w.heats[0];
  await onlyRed(H);
  await w.startHeat(H);
  await mkAttempts(H, w.entries[0], 1, w.seats.spotter.id);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`, { newViews: true });
  await expect(jline(j1, 1)).toContainText("Left Backroll 1", { timeout: 40_000 });
  const sw = (n: number) => jline(j1, n).getByTestId("line-missed");
  if (process.env.DEBUG_RPC) j1.on("request", (r) => /\/rpc\//.test(r.url()) && !/heartbeat|seat_/.test(r.url()) && console.log("RPC", r.url().split("/rpc/")[1], r.postData()));
  // a line that has its attempt
  await sw(1).click();
  await expect(sw(1)).toHaveAttribute("aria-pressed", "true");
  await expect(jbox(j1, 1)).toHaveValue("");
  await expect.poll(async () => (await myScores("j1", H)).map((s) => s.missed), { timeout: 30_000 }).toEqual([true]);
  await sw(1).click();
  await expect(sw(1)).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await myScores("j1", H)).length, { timeout: 30_000 }).toBe(0); // switched off: the Missed is gone
  await expect(jline(j1, 1)).toHaveAttribute("data-needs-score", "true"); // and the attempt needs his score again
  await sw(1).click();
  await expect(sw(1)).toHaveAttribute("aria-pressed", "true");
  await jtype(j1, 1, "7"); // typing a score on a Missed line: no clearing first
  await expect(sw(1)).toHaveAttribute("aria-pressed", "false", { timeout: 20_000 });
  await expect.poll(async () => (await myScores("j1", H)).map((s) => [s.missed, Number(s.score)]), { timeout: 30_000 }).toEqual([[false, 7]]);
  // an empty line (the spotter has not logged it): a Missed note, switched off, then a score typed over a Missed note
  await sw(2).click();
  await expect(sw(2)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => ((await w.db.from("pending_scores").select("missed").eq("heat_id", H)).data ?? []).map((n) => n.missed), { timeout: 30_000 }).toEqual([true]);
  await sw(2).click();
  await expect(sw(2)).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => ((await w.db.from("pending_scores").select("id").eq("heat_id", H)).data ?? []).length, { timeout: 30_000 }).toBe(0);
  await sw(2).click();
  await jtype(j1, 2, "6");
  await expect(sw(2)).toHaveAttribute("aria-pressed", "false", { timeout: 20_000 });
  await expect.poll(async () => ((await w.db.from("pending_scores").select("missed, score").eq("heat_id", H)).data ?? []).map((n) => [n.missed, Number(n.score)]), { timeout: 30_000 }).toEqual([[false, 6]]);
});

test("(e) a Flag from the Rider sheet reaches the head judge as one from the Queue does: the same kinds, the same record, on a landing and on a crash line", async ({ browser }) => {
  test.setTimeout(600_000);
  const H = w.heats[0];
  await onlyRed(H);
  await w.startHeat(H);
  const ids = await mkAttempts(H, w.entries[0], 2, w.seats.spotter.id);
  await w.db.from("trick_attempts").update({ status: "crashed" }).eq("id", ids[1]);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`, { newViews: true });
  await expect(jline(j1, 2)).toHaveAttribute("data-kind", "crash", { timeout: 40_000 });
  // under Missed, with a flag icon
  const missedBox = (await jline(j1, 1).getByTestId("line-missed").boundingBox())!;
  const flagBox = (await jline(j1, 1).getByTestId("line-flag").boundingBox())!;
  expect(flagBox.y).toBeGreaterThan(missedBox.y + missedBox.height - 2);
  expect(Math.abs(flagBox.x - missedBox.x)).toBeLessThan(3);
  await expect(jline(j1, 1).getByTestId("line-flag").locator("svg")).toBeVisible();
  await jline(j1, 1).getByTestId("line-flag").click();
  await expect(jline(j1, 1).getByTestId("line-flag-sheet")).toBeVisible();
  await jline(j1, 1).locator('[data-flag="wrong_rider"]').click();
  await jline(j1, 2).getByTestId("line-flag").click();
  await jline(j1, 2).locator('[data-flag="landed"]').click(); // "That was a landing" on a crash line, as on the Queue
  await expect.poll(async () => ((await w.db.from("attempt_flags").select("kind, attempt_id, judge_seat_id").eq("heat_id", H)).data ?? []).map((f) => [f.kind, f.judge_seat_id === w.seats.j1.id]).sort(), { timeout: 30_000 }).toEqual([["landed", true], ["wrong_rider", true]]);
  await expect(jline(j1, 1).getByTestId("line-flag")).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
});

test("(f) the rider cards stay in view when the sheet is scrolled to line 7, on both Rider sheets, and switching rider works from there", async ({ browser }) => {
  test.setTimeout(600_000);
  await w.startHeat(w.heats[0]);
  const size = { width: 390, height: 560 };
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`, { newViews: true, size });
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`, { newViews: true, size });
  for (const [who, page, line, heading] of [["spotter", spotter, (n: number) => sline(spotter, n), "sheet-heading"], ["judge", j1, (n: number) => jline(j1, n), "sheet-heading"]] as const) {
    await expect(page.getByTestId(heading)).toBeVisible({ timeout: 40_000 });
    const first = await page.getByTestId(heading).textContent();
    await line(7).scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector('[data-testid="screen-body"]')?.scrollBy(0, 5000));
    await expect(line(7)).toBeInViewport();
    const strip = (await page.getByTestId("rider-strip").boundingBox())!;
    expect(strip.y, who).toBeGreaterThanOrEqual(0);
    expect(strip.y + strip.height, who).toBeLessThan(220); // the cards are at the top, under the header
    await page.getByTestId("rider-tile").nth(1).click();
    await expect(page.getByTestId(heading), who).not.toHaveText(first ?? "");
    await expect(page.getByTestId("rider-tile").nth(1), who).toBeInViewport();
  }
});

test("(g) the text in every box on the officials' screens is at least 16 px, so an iPhone never zooms in when typing", async ({ browser }) => {
  test.setTimeout(600_000);
  await w.startHeat(w.heats[0]);
  const smallBoxes = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("input, textarea, select")]
        .filter((e) => !["checkbox", "radio", "range", "hidden"].includes((e as HTMLInputElement).type) && e.getClientRects().length > 0)
        .map((e) => [e.getAttribute("data-testid") ?? e.id ?? e.tagName, parseFloat(getComputedStyle(e).fontSize)] as [string, number])
        .filter(([, px]) => px < 16),
    );
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`, { newViews: true });
  await expect(strick(spotter, 1)).toBeVisible({ timeout: 40_000 });
  expect(await smallBoxes(spotter), "spotter Rider sheet").toEqual([]);
  expect(await strick(spotter, 1).evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  await spotter.getByTestId("spot-view-list").click();
  await expect(spotter.locator("#trick-text")).toBeVisible();
  expect(await smallBoxes(spotter), "spotter Trick list").toEqual([]);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`, { newViews: true });
  await expect(jbox(j1, 1)).toBeVisible({ timeout: 40_000 });
  expect(await smallBoxes(j1), "judge Rider sheet").toEqual([]);
  expect(await jbox(j1, 1).evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  await j1.getByTestId("view-queue").click();
  await expect(j1.getByTestId("view-queue")).toHaveAttribute("aria-pressed", "true");
  expect(await smallBoxes(j1), "judge Queue").toEqual([]);
  const head = await phone(browser, "head", `/head/${w.eventId}`);
  await expect(head.getByTestId("screen-body").or(head.locator("body")).first()).toBeVisible({ timeout: 40_000 });
  expect(await smallBoxes(head), "head judge phone").toEqual([]);
  // zooming is never blocked
  expect(await spotter.locator('meta[name="viewport"]').getAttribute("content")).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/);
});

test("(h) no Note button on any officials' screen, also for a signed-in organiser; it stays on the organiser's own pages", async ({ browser }) => {
  test.setTimeout(600_000);
  await w.startHeat(w.heats[0]);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  contexts.push(context);
  await installSupabaseProxy(context, { newViews: true });
  const page = await context.newPage();
  await w.org.signIn(page, `/org/events/${w.eventId}`);
  await expect(page.getByTestId("note-button")).toBeVisible({ timeout: 60_000 }); // the organiser's own page has it
  for (const path of [`/spot/${w.eventId}`, `/judge/${w.eventId}`, `/head/${w.eventId}`, `/observe/${w.eventId}`]) {
    await page.goto(path);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2500);
    await expect(page.getByTestId("note-button"), path).toHaveCount(0);
  }
  // and not for the officials themselves, on the Trick list where it used to cover Log
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`);
  await expect(spotter.getByTestId("trick-builder")).toBeVisible({ timeout: 40_000 });
  await expect(spotter.getByTestId("note-button")).toHaveCount(0);
});

test("(i) the clear button empties the trick box in one tap (the attempt keeps its trick), and typing '6 front rolls' logs '6x Frontroll'", async ({ browser }) => {
  test.setTimeout(600_000);
  const H = w.heats[0];
  const E = w.entries[0];
  await onlyRed(H);
  await w.startHeat(H);
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`, { newViews: true });
  await expect(strick(spotter, 1)).toBeEnabled({ timeout: 40_000 });
  await expect(strick(spotter, 1)).toHaveAttribute("autocapitalize", "sentences");
  await expect(sline(spotter, 1).getByTestId("line-trick-clear")).toHaveCount(0); // nothing to clear in an empty box
  await strick(spotter, 1).fill("6 front rolls");
  await expect.poll(async () => (await attempts(H, E)).map((a) => a.trick_name), { timeout: 30_000 }).toEqual(["6x Frontroll"]);
  // a tidy name for a plain word too
  await strick(spotter, 2).fill("zzzflip");
  await expect.poll(async () => (await attempts(H, E)).map((a) => a.trick_name).at(1), { timeout: 30_000 }).toBe("Zzzflip");
  // narrower L and R, still at least 44 px tall; the box is wide
  const l = (await sline(spotter, 1).getByTestId("line-left").boundingBox())!;
  expect(l.height).toBeGreaterThanOrEqual(44);
  expect(l.width).toBeLessThanOrEqual(44);
  expect((await strick(spotter, 1).boundingBox())!.width).toBeGreaterThan(130);
  // the Crash button looks like the Trick list's CRASH button: the same red fill and the same word
  const crashColour = await sline(spotter, 1).getByTestId("line-crash").evaluate((e) => getComputedStyle(e).backgroundColor);
  await spotter.getByTestId("spot-view-list").click();
  expect(await spotter.getByTestId("crash-button").evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(crashColour);
  await expect(spotter.getByTestId("crash-button")).toHaveText("CRASH");
  await spotter.getByTestId("spot-view-sheet").click();
  await expect(sline(spotter, 1).getByTestId("line-crash")).toContainText("CRASH");
  // the × empties the box; the attempt keeps its trick until a new trick is logged
  await sline(spotter, 1).getByTestId("line-trick-clear").click();
  await expect(strick(spotter, 1)).toHaveValue("");
  await spotter.waitForTimeout(3000);
  await expect(strick(spotter, 1)).toHaveValue(""); // still empty after the pause and after the keyboard has gone
  expect((await attempts(H, E)).map((a) => a.trick_name).at(0)).toBe("6x Frontroll");
  // the Trick list's box has its × too, and takes the count as well
  await spotter.getByTestId("spot-view-list").click();
  await spotter.locator("#trick-text").fill("3x kiteloop");
  await expect(spotter.getByTestId("trick-text-clear")).toBeVisible();
  await spotter.locator("#trick-text").press("Enter");
  await expect(spotter.getByTestId("composed-name").locator("p.sr-only")).toHaveText("3x Kiteloop");
  await spotter.getByTestId("trick-text-clear").click();
  await expect(spotter.locator("#trick-text")).toHaveValue("");
});
