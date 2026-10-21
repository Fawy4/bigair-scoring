import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld, type SeatKey } from "./live-world";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// HE1 (0.25.0): the end of a heat takes nobody off the sheet. On a throwaway organisation (Arrow, EKL and Demo are never touched), phones at 390 × 844 for the spotter and the
// judge, a laptop for the head judge, ONE worker, on a production build. In this sandbox the browser cannot open the Realtime socket, so the phones follow through the
// 5-second fallback.
let w: LiveWorld;
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld({ headScores: false });
});
test.afterEach(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});

async function phone(browser: Browser, key: SeatKey, path: string, size = { width: 390, height: 844 }): Promise<Page> {
  const context = await browser.newContext({ viewport: size });
  contexts.push(context);
  await installSupabaseProxy(context, { officialsOnly: true }); // exactly what an official's phone is on the live site: the Rider sheet only
  const page = await context.newPage();
  await w.signInAs(page, key, path);
  return page;
}
const laptop = { width: 1500, height: 1000 };
const sline = (p: Page, n: number) => p.locator(`[data-testid="spotter-line"][data-line="${n}"]`);
const strick = (p: Page, n: number) => sline(p, n).getByTestId("line-trick");
const jline = (p: Page, n: number) => p.locator(`[data-testid="sheet-line"][data-line="${n}"]`);
const jbox = (p: Page, n: number) => jline(p, n).getByTestId("line-score");
const jtype = async (p: Page, n: number, text: string) => {
  await jbox(p, n).click();
  await jbox(p, n).fill(text);
  await jbox(p, n).blur();
};
const attempts = async (heat: string, entry: string) => (await w.db.from("trick_attempts").select("id, seq, status, trick_name, direction, created_at").eq("heat_id", heat).eq("entry_id", entry).is("deleted_at", null).order("seq")).data ?? [];
const sheetOf = async (heat: string, key: SeatKey) => (await w.db.from("judge_sheets").select("submitted_at, reopened_at").eq("heat_id", heat).eq("judge_seat_id", w.seats[key].id).maybeSingle()).data;
/** The spotter logs a trick on a line by typing and tapping the suggestion (the Rider sheet, as on the beach). */
async function spotterLogs(p: Page, n: number, word: string, trick: string) {
  await strick(p, n).click();
  await strick(p, n).fill(word);
  await sline(p, n).getByTestId("suggestion").filter({ hasText: trick }).click();
  await expect(sline(p, n).getByTestId("line-state")).toHaveText("Logged ✓", { timeout: 30_000 });
}
/** Judges 2 and 3 are done: scores for every landed attempt, a Variety score for each rider, sheet submitted (as the database sees it). */
async function judgesTwoAndThreeFinish(heat: string) {
  const rows = (await w.db.from("trick_attempts").select("id, status").eq("heat_id", heat).is("deleted_at", null)).data ?? [];
  for (const key of ["j2", "j3"] as const) {
    for (const a of rows.filter((x) => x.status === "landed")) await w.db.from("trick_scores").upsert({ attempt_id: a.id, heat_id: heat, event_id: w.eventId, judge_seat_id: w.seats[key].id, score: 7, client_key: crypto.randomUUID(), client_rev: 1 }, { onConflict: "attempt_id,judge_seat_id" });
    for (const e of w.entries) await w.db.from("impression_scores").upsert({ heat_id: heat, entry_id: e, judge_seat_id: w.seats[key].id, event_id: w.eventId, value: 6, client_key: crypto.randomUUID(), client_rev: 1 }, { onConflict: "heat_id,entry_id,judge_seat_id" });
    await w.db.from("judge_sheets").upsert({ event_id: w.eventId, heat_id: heat, judge_seat_id: w.seats[key].id, submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });
  }
}

test("the whole flow: late log after 0:00, the judge's sheet reopens, Publish, the next heat is selected", async ({ browser }) => {
  test.setTimeout(900_000);
  const H = w.heats[0];
  const E = w.entries[0];
  await w.db.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", H).neq("entry_id", E); // only rider 1 rides (nothing tied to settle before Publish)
  const startedAt = Date.now() - 20_000;
  await w.db.from("heats").update({ status: "running", started_at: new Date(startedAt).toISOString(), duration_sec: 600 }).eq("id", H);
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`);
  const head = await phone(browser, "head", `/head/${w.eventId}`, laptop);
  await expect(spotter.getByTestId("spotter-sheet")).toBeVisible({ timeout: 60_000 });
  await expect(j1.getByTestId("rider-sheet")).toBeVisible({ timeout: 60_000 });
  await expect(head.getByTestId("head-live-console")).toBeVisible({ timeout: 60_000 });
  await expect(spotter.getByTestId("heat-ended-strip")).toHaveCount(0); // nothing to say while the heat is on the water

  // ---- before the horn: the spotter logs line 1, judge 1 scores it
  await spotter.getByTestId("rider-tile").first().click();
  await spotterLogs(spotter, 1, "back", "Backroll");
  await expect(jline(j1, 1)).toContainText("Backroll", { timeout: 40_000 });
  await jtype(j1, 1, "7.5");
  await expect.poll(async () => ((await w.db.from("trick_scores").select("score").eq("judge_seat_id", w.seats.j1.id)).data ?? []).length, { timeout: 30_000 }).toBe(1);

  // ---- the clock reaches 0:00 (the length is cut so that it runs out in a few seconds)
  await w.db.from("heats").update({ duration_sec: Math.round((Date.now() - startedAt) / 1000) + 4 }).eq("id", H);

  // spotter: the same Rider sheet, a "Heat ended" strip on top, nothing locked
  await expect(spotter.getByTestId("heat-ended-strip")).toContainText("Heat ended", { timeout: 60_000 });
  await expect(spotter.getByTestId("heat-ended-strip")).toContainText("until the head judge publishes");
  await expect(spotter.getByTestId("spotter-sheet")).toBeVisible();
  await expect(spotter.getByTestId("between-heats")).toHaveCount(0);
  await expect(strick(spotter, 2)).toBeEnabled();
  // judge: still on the Rider sheet (not moved to Impression), with the strip and the Done — Impression button
  await expect(j1.getByTestId("heat-ended-strip")).toContainText("Heat ended", { timeout: 60_000 });
  await expect(j1.getByTestId("rider-sheet")).toBeVisible();
  await expect(j1.getByTestId("impression-card")).toHaveCount(0);
  await expect(j1.getByTestId("done-impression")).toHaveText("Done — Variety");
  // head: the Heat ended strip over the review bar, which says who is still working
  await expect(head.getByTestId("head-live-console").getByTestId("heat-ended-strip")).toContainText("Heat ended", { timeout: 60_000 });

  // ---- the late jump: the spotter logs line 2 after the horn; it is accepted and the judge scores it on the same sheet
  await spotterLogs(spotter, 2, "front", "Frontroll");
  const late = (await attempts(H, E))[1];
  expect(Date.parse(late.created_at)).toBeGreaterThan(startedAt + 20_000);
  await expect(jline(j1, 2)).toContainText("Frontroll", { timeout: 40_000 });
  await expect(jline(j1, 2).getByTestId("line-needs-score")).toBeVisible();
  await jtype(j1, 2, "6.5");
  await expect.poll(async () => ((await w.db.from("trick_scores").select("score").eq("judge_seat_id", w.seats.j1.id)).data ?? []).length, { timeout: 30_000 }).toBe(2);
  // the review bar names the spotter (a line was logged seconds ago)
  await expect(head.getByTestId("review-work-spotter")).toHaveText("Spotter still logging", { timeout: 40_000 });

  // ---- judge 1 moves to Impression himself, gives Variety for the four riders (as the database sees them) and submits
  await j1.getByTestId("done-impression").click();
  await expect(j1.getByTestId("impression-card")).toBeVisible();
  for (const e of w.entries) await w.db.from("impression_scores").upsert({ heat_id: H, entry_id: e, judge_seat_id: w.seats.j1.id, event_id: w.eventId, value: 6, client_key: crypto.randomUUID(), client_rev: 1 }, { onConflict: "heat_id,entry_id,judge_seat_id" });
  await j1.reload();
  await j1.getByTestId("done-impression").click().catch(() => undefined);
  await j1.getByRole("button", { name: "Submit", exact: true }).click({ timeout: 40_000 });
  await j1.getByRole("button", { name: "Yes, submit" }).click();
  await expect.poll(async () => (await sheetOf(H, "j1"))?.submitted_at ?? null, { timeout: 30_000 }).not.toBeNull();
  await expect(j1.getByTestId("heat-ended-strip")).toContainText("your sheet is submitted", { timeout: 30_000 });
  await judgesTwoAndThreeFinish(H);

  // ---- a third jump is logged AFTER judge 1 submitted: his sheet opens again for it, and the console counts him as not finished
  await spotterLogs(spotter, 3, "kite", "Kiteloop");
  await expect.poll(async () => {
    const s = await sheetOf(H, "j1");
    return Boolean(s?.reopened_at && Date.parse(s.reopened_at) >= Date.parse(s.submitted_at!));
  }, { timeout: 30_000 }).toBe(true);
  await expect(j1.getByTestId("rider-sheet")).toBeVisible({ timeout: 40_000 }); // back on his lines, not on the Impression card
  await expect(jline(j1, 3).getByTestId("line-needs-score")).toHaveText("New attempt to score", { timeout: 40_000 });
  await expect(j1.getByTestId("heat-ended-strip")).toContainText("1 new attempt to score");
  // all three judges had submitted, so all three sheets opened again for the new line: the bar says who still has it to score
  const owes = (key: SeatKey) => head.locator(`[data-testid="review-work-judge"][data-seat="${w.seats[key].id}"]`);
  await expect(owes("j1")).toHaveText("Judge 1: 1 line to score", { timeout: 40_000 });
  await expect(owes("j2")).toHaveText("Judge 2: 1 line to score");
  await expect(owes("j3")).toHaveText("Judge 3: 1 line to score");
  await jtype(j1, 3, "8");
  await expect.poll(async () => ((await w.db.from("trick_scores").select("score").eq("judge_seat_id", w.seats.j1.id)).data ?? []).length, { timeout: 30_000 }).toBe(3);
  await j1.getByTestId("done-impression").click();
  await j1.getByRole("button", { name: "Submit", exact: true }).click();
  await j1.getByRole("button", { name: "Yes, submit" }).click();
  await expect.poll(async () => {
    const s = await sheetOf(H, "j1");
    return Boolean(s && Date.parse(s.submitted_at!) > Date.parse(s.reopened_at!));
  }, { timeout: 30_000 }).toBe(true);
  await judgesTwoAndThreeFinish(H); // the late line needs judges 2 and 3's scores as well

  // ---- Publish asks once about what is still open (the spotter logged moments ago), never blocks; then the next heat is selected
  // the spotter corrects line 3's direction just now (a correction, not a new line: nothing reopens) — he is "still logging" for 45 seconds
  await sline(spotter, 3).getByTestId("line-left").click();
  await expect.poll(async () => ((await attempts(H, E)).at(2) as { direction?: string } | undefined)?.direction ?? null, { timeout: 30_000 }).toBe("left");
  await expect(head.getByTestId("review-work-spotter")).toBeVisible({ timeout: 40_000 });
  await head.getByTestId("publish").click();
  await expect(head.getByTestId("publish-open")).toContainText("Spotter still logging", { timeout: 40_000 });
  await head.getByRole("button", { name: "Publish anyway" }).click();
  await expect(head.getByTestId("control-message").first()).toContainText("Next heat:", { timeout: 60_000 });
  await expect(head.getByTestId("head-live-console")).toHaveAttribute("data-heat", w.heats[1], { timeout: 60_000 });
  expect((await w.db.from("heats").select("status").eq("id", H).single()).data!.status).toBe("published");
  // the spotter's phone moves on once the heat is published
  await expect(spotter.getByTestId("between-heats")).toBeVisible({ timeout: 60_000 });
});
