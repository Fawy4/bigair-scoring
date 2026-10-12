import path from "node:path";
import { expect, test, installSupabaseProxy } from "./base";
import { createLiveWorld } from "./live-world";

/**
 * The manual's pictures of the Rider sheet (retaken with `npm run manual:shots`): a judge's phone with a rider's sheet (two attempts logged, the second a crash, notes typed
 * on the next lines) and the head console's table with its pending rows. Throwaway organisation; Arrow, EKL and Demo are never touched. Runs only when MANUAL_SHOTS=1.
 */
test.skip(process.env.MANUAL_SHOTS !== "1", "set MANUAL_SHOTS=1 (npm run manual:shots) to retake the manual's pictures");
const OUT = path.join(process.cwd(), "docs", "manual", "img");
const hideDevOverlay = (page: import("@playwright/test").Page) => page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);

test("the Rider sheet on a judge's phone, and the console's pending rows", async ({ browser }) => {
  test.setTimeout(300_000);
  const w = await createLiveWorld();
  try {
    const H = w.heats[0];
    await w.db.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", H).neq("entry_id", w.entries[0]);
    await w.startHeat(H);
    const att = (seq: number, status: "landed" | "crashed", trick: string, direction: "left" | "right") =>
      w.db.from("trick_attempts").insert({ heat_id: H, entry_id: w.entries[0], seq, status, trick_name: trick, direction, client_key: crypto.randomUUID() }).select("id").single();
    const a1 = (await att(1, "landed", "Left Backroll", "left")).data!.id;
    await att(2, "crashed", "Right Frontroll", "right");
    await w.db.from("trick_scores").insert({ attempt_id: a1, judge_seat_id: w.seats.j1.id, score: 7.5, client_key: crypto.randomUUID(), client_rev: 1 });
    await w.db.from("trick_scores").insert({ attempt_id: a1, judge_seat_id: w.seats.j2.id, score: 7, client_key: crypto.randomUUID(), client_rev: 1 });
    const note = (seat: "j1" | "j3", slot: number, score: number) => w.db.from("pending_scores").insert({ event_id: w.eventId, heat_id: H, entry_id: w.entries[0], judge_seat_id: w.seats[seat].id, slot, score, client_key: crypto.randomUUID(), client_rev: 1 });
    await note("j1", 3, 6.5);
    await note("j3", 3, 7);
    await note("j1", 4, 8);

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await installSupabaseProxy(phone);
    const j1 = await phone.newPage();
    await w.signInAs(j1, "j1", `/judge/${w.eventId}`);
    await expect(j1.getByTestId("view-switch")).toBeVisible({ timeout: 60_000 });
    await j1.getByTestId("view-sheet").click();
    await expect(j1.locator('[data-testid="sheet-line"][data-line="3"] [data-testid="line-pending"]')).toBeVisible({ timeout: 30_000 });
    await hideDevOverlay(j1);
    await j1.waitForTimeout(500);
    await j1.screenshot({ path: path.join(OUT, "judge-rider-sheet-390.png") });
    // tapping line 7 while lines 5 and 6 have no score from this judge asks once (nothing is marked until the judge taps Mark Missed)
    await j1.locator('[data-testid="sheet-line"][data-line="7"] [data-testid="line-score"]').click();
    await expect(j1.getByTestId("skip-ask")).toBeVisible();
    await j1.getByTestId("skip-confirm").scrollIntoViewIfNeeded();
    await hideDevOverlay(j1);
    await j1.waitForTimeout(500);
    await j1.screenshot({ path: path.join(OUT, "judge-rider-sheet-skip-390.png") });
    await phone.close();

    const laptop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installSupabaseProxy(laptop);
    const head = await laptop.newPage();
    await w.signInAs(head, "head", `/head/${w.eventId}`);
    await head.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });
    await expect(head.getByTestId("pending-row")).toHaveCount(2, { timeout: 60_000 });
    await hideDevOverlay(head);
    await head.getByTestId("head-matrix").scrollIntoViewIfNeeded();
    await head.waitForTimeout(500);
    await head.getByTestId("matrix-scroll").screenshot({ path: path.join(OUT, "console-pending-rows-1280.png") });
    await laptop.close();
  } finally {
    await w.cleanup();
  }
});

test("the spotter's Rider sheet, and the Trick list cut to the height a keyboard leaves", async ({ browser }) => {
  test.setTimeout(300_000);
  const w = await createLiveWorld();
  try {
    const H = w.heats[0];
    await w.startHeat(H);
    const att = (seq: number, status: "landed" | "crashed", trick: string, direction: "left" | "right") =>
      w.db.from("trick_attempts").insert({ heat_id: H, entry_id: w.entries[0], seq, status, trick_name: trick, raw_text: trick.replace(/^(Left|Right) /, ""), direction, client_key: crypto.randomUUID(), created_by_seat: w.seats.spotter.id }).select("id").single();
    await att(1, "landed", "Left Backroll", "left");
    await att(2, "landed", "Right Frontroll", "right");
    await att(3, "crashed", "Left Kiteloop", "left");

    // a spotter's phone that never chose a view opens on the Rider sheet; line 4 is being typed
    const phone = await browser.newContext({ viewport: { width: 390, height: 600 } });
    await installSupabaseProxy(phone, { newViews: true });
    const sp = await phone.newPage();
    await w.signInAs(sp, "spotter", `/spot/${w.eventId}`);
    await expect(sp.getByTestId("spotter-sheet")).toBeVisible({ timeout: 60_000 });
    await expect(sp.locator('[data-testid="spotter-line"][data-line="3"][data-state="logged"]')).toBeVisible({ timeout: 30_000 });
    const box = sp.locator('[data-testid="spotter-line"][data-line="4"] [data-testid="line-trick"]');
    await box.click();
    await box.fill("back");
    await expect(sp.getByTestId("suggestion").first()).toBeVisible();
    await hideDevOverlay(sp);
    await sp.waitForTimeout(500);
    await sp.screenshot({ path: path.join(OUT, "spotter-rider-sheet-390.png") });

    // the Trick list at 390 x 508: the height left above a phone keyboard; the text box, Log and CRASH stay in view
    await sp.getByTestId("spot-view-list").click();
    // the Trick list at full phone height (the picture of the Spotter page)
    await sp.setViewportSize({ width: 390, height: 844 });
    await expect(sp.getByTestId("trick-builder")).toBeVisible();
    await hideDevOverlay(sp);
    await sp.waitForTimeout(500);
    await sp.screenshot({ path: path.join(OUT, "spotter-390.png") });
    await sp.setViewportSize({ width: 390, height: 508 });
    await sp.locator("#trick-text").fill("left back");
    await hideDevOverlay(sp);
    await sp.waitForTimeout(500);
    await sp.screenshot({ path: path.join(OUT, "spotter-keyboard-390.png") });
    await phone.close();
  } finally {
    await w.cleanup();
  }
});
