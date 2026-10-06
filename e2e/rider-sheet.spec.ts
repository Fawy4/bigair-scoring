import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// The judge's Rider sheet on a throwaway organisation (Arrow, EKL and Demo are never touched), phone size, one worker: a judge types scores on lines 1-3 before the spotter
// logs anything; the console shows them as pending; the spotter logs a landing, a crash and a landing; the scores land on attempts 1 and 3 and the crash line greys; the
// judge changes line 3 and the console follows; a leftover note on line 4 blocks Publish by name until the judge clears it. A phone reload keeps the notes, the Queue view
// is untouched, and the public live page never shows a pending score. In this sandbox the browser cannot open the Realtime socket, so the phones and the console follow
// through the 5-second fallback; the Realtime path (and its sub-second delivery) is tested in tests/rls/live-realtime.test.ts.
let w: LiveWorld;
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld({ headScores: false });
  // the public live page needs a live event
  await w.db.from("events").update({ status: "live" }).eq("id", w.eventId);
});
test.afterEach(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});

async function phone(browser: Browser, key: Parameters<LiveWorld["signInAs"]>[1], path: string, size = { width: 390, height: 844 }): Promise<Page> {
  const context = await browser.newContext({ viewport: size });
  contexts.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await w.signInAs(page, key, path);
  return page;
}
const line = (p: Page, n: number) => p.locator(`[data-testid="sheet-line"][data-line="${n}"]`);
const box = (p: Page, n: number) => line(p, n).getByTestId("line-score");
const type = async (p: Page, n: number, text: string) => {
  await box(p, n).click();
  await box(p, n).fill(text);
  await box(p, n).blur();
};
const notes = async () => (await w.db.from("pending_scores").select("slot, score, judge_seat_id").eq("heat_id", w.heats[0]).order("slot")).data ?? [];
const scoresOf = async (key: "j1" | "j2" | "j3") => (await w.db.from("trick_scores").select("score, trick_attempts!inner(seq)").eq("heat_id", w.heats[0]).eq("judge_seat_id", w.seats[key].id)).data ?? [];
const block = (p: Page, id: string) => p.locator(`[data-block="${id}"]`);
const logLanded = async (spotter: Page, dir: string, base: string) => {
  await block(spotter, `direction:${dir}`).click();
  await block(spotter, `base:${base}`).click();
  await spotter.getByTestId("log-button").click();
};
const logCrash = async (spotter: Page, dir: string, base: string) => {
  await block(spotter, `direction:${dir}`).click();
  await block(spotter, `base:${base}`).click();
  await spotter.getByTestId("crash-button").click();
  await spotter.getByTestId("crash-yes").click();
};
const cellOf = (head: Page, rowTestId: "matrix-row", seq: number, judgeIndex: number) => head.locator(`[data-testid="${rowTestId}"]`).filter({ has: head.locator(`th >> text="${seq}"`) }).getByTestId("matrix-cell").nth(judgeIndex);

test("a judge scores on the Rider sheet before the spotter logs; the scores land by order of logging, the crash line greys, changes follow, a leftover note blocks Publish by name until cleared", async ({ browser }) => {
  test.setTimeout(900_000);
  const H = w.heats[0];
  // only Red rides: the others did not start (riders with nothing scored would be tied, and a tie is never published past)
  await w.db.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", H).neq("entry_id", w.entries[0]);
  await w.startHeat(H);
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`);
  const j2 = await phone(browser, "j2", `/judge/${w.eventId}`);
  const head = await phone(browser, "head", `/head/${w.eventId}`, { width: 1500, height: 1000 });
  await head.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });
  await expect(spotter.getByTestId("trick-builder")).toBeVisible({ timeout: 30_000 });

  // ---- the switch: Queue is the default; the choice is remembered on the device
  await expect(j1.getByTestId("view-queue")).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  await expect(j1.getByTestId("all-scored")).toBeVisible();
  await j1.getByTestId("view-sheet").click();
  await expect(j1.getByTestId("rider-sheet")).toBeVisible();
  await expect(j1.getByTestId("sheet-line")).toHaveCount(7); // the division's cap
  await j1.reload();
  await expect(j1.getByTestId("view-sheet")).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  await expect(j2.getByTestId("view-queue")).toHaveAttribute("aria-pressed", "true"); // another device: still the Queue

  // ---- three scores on lines 1-3, before any attempt exists (the Red card is the first rider)
  await expect(j1.getByTestId("rider-tile").first()).toContainText("RED");
  await type(j1, 3, "8");
  await type(j1, 1, "7.5");
  await type(j1, 2, "6");
  await expect.poll(async () => (await notes()).map((n) => Number(n.score)), { timeout: 30_000 }).toEqual([7.5, 6, 8]);
  await expect(line(j1, 1).getByTestId("line-pending")).toBeVisible();
  // the off-step refusal is the pad's own sentence, and nothing is saved for it
  await box(j1, 4).fill("7.25");
  await expect(line(j1, 4).getByTestId("line-refusal")).toContainText("That score is not on the 0.5 step. Use 7 or 7.5.");
  await box(j1, 4).blur();
  expect((await notes()).length).toBe(3);

  // a phone reload (or a dead phone) keeps the notes: they are on the server
  await j1.reload();
  await expect(box(j1, 1)).toHaveValue("7.5", { timeout: 30_000 });
  await expect(box(j1, 2)).toHaveValue("6.0");
  await expect(box(j1, 3)).toHaveValue("8.0");

  // ---- the console shows them as pending rows, in Judge 1's column, never counted
  const pendingRows = head.getByTestId("pending-row");
  const seen = Date.now();
  await expect(pendingRows).toHaveCount(3, { timeout: 40_000 });
  console.log(`pending rows reached the console after ${Date.now() - seen} ms (fallback polling in this sandbox)`);
  await expect(pendingRows.first().getByTestId("pending-tag")).toContainText("pending · J1");
  await expect(pendingRows.first().getByTestId("pending-cell").first()).toContainText("7.50");
  await expect(head.getByTestId("matrix-row")).toHaveCount(0); // not attempts
  await expect(pendingRows.first().locator("td").last()).toHaveText("—"); // no panel score: never counted

  // ---- the public live page never shows a pending score
  const publicPage = await (await browser.newContext()).newPage();
  contexts.push(publicPage.context());
  await installSupabaseProxy(publicPage.context());
  await publicPage.goto(`/e/e2e-live-${w.org.run}/live?heat=${H}`);
  await expect(publicPage.locator("body")).not.toContainText("pending", { timeout: 30_000 });
  await expect(publicPage.locator("body")).not.toContainText("7.5");

  // ---- the spotter logs a landing, a crash and a landing (a Queue judge, j2, scores them as they land)
  await logLanded(spotter, "left", "backroll");
  await logCrash(spotter, "right", "frontroll");
  await logLanded(spotter, "left", "kiteloop");
  await expect.poll(async () => (await w.db.from("trick_attempts").select("seq").eq("heat_id", H)).data?.length, { timeout: 30_000 }).toBe(3);

  // the notes became scores by order of logging: line 1 on attempt 1, line 3 on attempt 3; the crash line took none and its note is gone
  await expect.poll(async () => (await scoresOf("j1")).map((s) => [(s.trick_attempts as unknown as { seq: number }).seq, Number(s.score)]).sort(), { timeout: 30_000 }).toEqual([[1, 7.5], [3, 8]]);
  expect(await notes()).toEqual([]);
  await expect(line(j1, 1)).toContainText("Left Backroll", { timeout: 30_000 });
  await expect(line(j1, 2)).toHaveAttribute("data-kind", "crash");
  await expect(line(j1, 2).getByTestId("line-crash")).toContainText("Crash");
  await expect(line(j1, 2).getByTestId("line-score")).toHaveCount(0);
  await expect(line(j1, 3)).toContainText("Left Kiteloop");
  await expect(box(j1, 1)).toHaveValue("7.5");
  await expect(box(j1, 3)).toHaveValue("8.0");
  await expect(line(j1, 4)).toHaveAttribute("data-kind", "empty");

  // the Queue view is unchanged: j2 (still on the Queue) sees the landed attempts as cards and scores with the pad
  await expect(j2.getByTestId("queue-card")).toContainText("Left Backroll", { timeout: 30_000 });
  await j2.getByRole("button", { name: "Set 7", exact: true }).click();
  await j2.getByRole("button", { name: "Set .0", exact: true }).click();
  await expect.poll(async () => (await scoresOf("j2")).length, { timeout: 30_000 }).toBe(1);

  // the console: the pending rows are gone, J1's scores sit on attempts 1 and 3, J2's on attempt 1 (mixed views, one table)
  await expect(pendingRows).toHaveCount(0, { timeout: 40_000 });
  await expect(cellOf(head, "matrix-row", 1, 0)).toContainText("7.50", { timeout: 40_000 });
  await expect(cellOf(head, "matrix-row", 3, 0)).toContainText("8.00");
  await expect(cellOf(head, "matrix-row", 1, 1)).toContainText("7.00", { timeout: 40_000 });
  await expect(head.locator('[data-testid="matrix-row"]').filter({ has: head.locator('th >> text="2"') }).getByTestId("matrix-cell").first()).toHaveAttribute("data-state", "crash");

  // ---- a change on the sheet is the judge's current score: no Save button, the console follows, the audit log keeps it
  await type(j1, 3, "8.5");
  await expect.poll(async () => Number((await scoresOf("j1")).find((s) => (s.trick_attempts as unknown as { seq: number }).seq === 3)?.score), { timeout: 30_000 }).toBe(8.5);
  const changed = Date.now();
  await expect(cellOf(head, "matrix-row", 3, 0)).toContainText("8.50", { timeout: 40_000 });
  console.log(`a changed score reached the console after ${Date.now() - changed} ms (fallback polling in this sandbox)`);
  const audit = (await w.db.from("audit_log").select("action, before, after").eq("event_id", w.eventId).eq("table_name", "trick_scores").eq("action", "update")).data ?? [];
  expect(audit.some((a) => Number((a.before as { score: number }).score) === 8 && Number((a.after as { score: number }).score) === 8.5)).toBe(true);

  // ---- a note left on line 4 holds Publish back, by name, with a Learn more link and no override
  await type(j1, 4, "5");
  await expect(pendingRows).toHaveCount(1, { timeout: 40_000 });
  await w.db.from("heats").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", H);
  const blockerLine = head.getByTestId("blockers").getByTestId("blocker-line").filter({ hasText: "has a score with no attempt" });
  await expect(blockerLine).toContainText("Sam Rivera: J1 has a score with no attempt", { timeout: 60_000 });
  await expect(blockerLine.getByTestId("learn-more")).toHaveAttribute("href", /\/help#cl-pending/);
  await head.getByTestId("publish").click();
  const dialog = head.getByTestId("console-dialog");
  await expect(dialog.getByTestId("publish-blockers")).toContainText("Sam Rivera: J1 has a score with no attempt");
  await expect(dialog.getByTestId("dialog-save")).toBeDisabled();
  await dialog.getByTestId("dialog-cancel").click();
  expect((await w.db.from("heats").select("status").eq("id", H).single()).data!.status).toBe("ended");

  // the judge is told at Submit which lines, opens the sheet, and clears the note ("no attempt logged here")
  await expect(j1.getByTestId("held-notes")).toContainText("Clear them, then submit", { timeout: 40_000 });
  await j1.getByTestId("open-rider-sheet").click();
  await expect(line(j1, 4)).toContainText("no attempt logged here");
  await line(j1, 4).getByTestId("line-clear").click();
  await expect.poll(async () => (await notes()).length, { timeout: 30_000 }).toBe(0);

  // the blocker is gone and Publish goes ahead (with a reason for whatever else is open: the other judges have not scored or submitted)
  await expect(blockerLine).toHaveCount(0, { timeout: 60_000 });
  await head.getByTestId("publish").click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("publish-blockers")).not.toContainText("has a score with no attempt");
  const needsReason = await dialog.getByTestId("publish-blockers").isVisible();
  if (needsReason) await dialog.getByTestId("reason-input").fill("rider sheet test");
  await dialog.getByTestId("dialog-save").click();
  await expect(head.getByTestId("control-message")).toContainText("Published", { timeout: 60_000 });
  expect((await w.db.from("heats").select("status").eq("id", H).single()).data!.status).toBe("published");
});

test("the head judge's Score tab has the same switch, no listener is added to a channel that is already subscribed, and the Queue is as before", async ({ browser }) => {
  test.setTimeout(420_000);
  const hw = await createLiveWorld({ headScores: true });
  const old = w;
  w = hw;
  try {
    const H = hw.heats[0];
    await hw.startHeat(H);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    contexts.push(context);
    await installSupabaseProxy(context);
    const page = await context.newPage();
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    await hw.signInAs(page, "head", `/head/${hw.eventId}`);
    await page.getByRole("tab", { name: "Score" }).click({ timeout: 60_000 });
    await expect(page.getByTestId("view-switch")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("view-queue")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("all-scored")).toBeVisible();
    await page.getByTestId("view-sheet").click();
    await expect(page.getByTestId("sheet-line")).toHaveCount(7);
    await page.getByTestId("view-queue").click();
    await expect(page.getByTestId("all-scored")).toBeVisible();
    // a note typed on the head judge's own sheet is the head judge's, and only theirs
    await page.getByTestId("view-sheet").click();
    await box(page, 2).fill("6.5");
    await box(page, 2).blur();
    await expect.poll(async () => ((await hw.db.from("pending_scores").select("score").eq("heat_id", H)).data ?? []).length, { timeout: 30_000 }).toBe(1);
    expect(problems.filter((p) => /after `?subscribe\(\)/i.test(p) || /postgres_changes callbacks/i.test(p))).toEqual([]);
  } finally {
    w = old;
    await hw.cleanup();
  }
});

test("the head judge clears a judge's pending note from the console (reason optional) and the judge's line empties; a spotter's Undo puts a taken note back on its line", async ({ browser }) => {
  test.setTimeout(600_000);
  const H = w.heats[0];
  await w.db.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", H).neq("entry_id", w.entries[0]);
  await w.startHeat(H);
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`);
  const head = await phone(browser, "head", `/head/${w.eventId}`, { width: 1500, height: 1000 });
  await head.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });
  await expect(j1.getByTestId("view-queue")).toBeVisible({ timeout: 30_000 });
  await j1.getByTestId("view-sheet").click();

  // ---- the judge's phone "dies" with a note on line 2: the head judge clears it on the console
  await type(j1, 2, "6.5");
  await expect.poll(async () => (await notes()).length, { timeout: 30_000 }).toBe(1);
  await expect(head.getByTestId("pending-row")).toHaveCount(1, { timeout: 40_000 });
  await head.getByTestId("clear-note").click();
  const dialog = head.getByTestId("console-dialog");
  await expect(dialog.getByTestId("clear-note-ask")).toContainText("Clear J1's pending score on Sam Rivera, attempt 2?");
  await dialog.getByTestId("dialog-save").click(); // no reason
  await expect.poll(async () => (await notes()).length, { timeout: 30_000 }).toBe(0);
  await expect(head.getByTestId("pending-row")).toHaveCount(0, { timeout: 40_000 });
  const audit = (await w.db.from("audit_log").select("reason, before").eq("event_id", w.eventId).eq("action", "pending_cleared_by_head")).data ?? [];
  expect(audit).toHaveLength(1);
  expect(audit[0].reason).toBeNull();
  expect(audit[0].before).toMatchObject({ judge_seat_id: w.seats.j1.id, line: 2 });
  const changed = Date.now();
  await expect(line(j1, 2).getByTestId("line-pending")).toHaveCount(0, { timeout: 40_000 });
  await expect(box(j1, 2)).toHaveValue("");
  console.log(`the judge's line showed the head judge's Clear after ${Date.now() - changed} ms (fallback polling in this sandbox)`);

  // ---- Undo: a note taken by an attempt goes back to the line when the spotter takes the attempt back
  await type(j1, 1, "7.5");
  await expect.poll(async () => (await notes()).map((n) => Number(n.score)), { timeout: 30_000 }).toEqual([7.5]);
  await logLanded(spotter, "left", "backroll");
  await expect(line(j1, 1)).toContainText("Left Backroll", { timeout: 30_000 });
  await expect(box(j1, 1)).toHaveValue("7.5");
  expect((await scoresOf("j1")).length).toBe(1);
  await spotter.getByTestId("undo-button").click();
  await expect(line(j1, 1)).not.toContainText("Left Backroll", { timeout: 40_000 });
  await expect(line(j1, 1)).toHaveAttribute("data-kind", "empty");
  await expect(line(j1, 1).getByTestId("line-pending")).toBeVisible();
  await expect(box(j1, 1)).toHaveValue("7.5");
  expect((await scoresOf("j1")).length).toBe(0);
  expect((await notes()).map((n) => [n.slot, Number(n.score)])).toEqual([[2, 7.5]]);
  // the right attempt then takes it again
  await logLanded(spotter, "right", "frontroll");
  await expect(line(j1, 1)).toContainText("Right Frontroll", { timeout: 30_000 });
  await expect(box(j1, 1)).toHaveValue("7.5");
  await expect.poll(async () => (await scoresOf("j1")).map((s) => Number(s.score)), { timeout: 30_000 }).toEqual([7.5]);
});
