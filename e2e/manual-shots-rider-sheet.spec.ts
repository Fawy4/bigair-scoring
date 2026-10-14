import path from "node:path";
import { expect, test, installSupabaseProxy } from "./base";
import { createLiveWorld } from "./live-world";

/**
 * The manual's pictures of the Rider sheet (retaken with `npm run manual:shots`): a judge's phone with a rider's sheet (two attempts logged, the second a crash, notes typed
 * on the next lines), a judge's sheet in a division scored by criteria, the spotter's Rider sheet and the head console's table with its pending rows. Throwaway organisation; Arrow, EKL and Demo are never touched. Runs only when MANUAL_SHOTS=1.
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
    // two more jumps the spotter has logged and judge 1 has not scored yet: their lines are highlighted "Needs your score"
    await att(3, "landed", "Left Kiteloop", "left");
    await att(4, "landed", "Right Backroll", "right");
    await w.db.from("trick_scores").insert({ attempt_id: a1, judge_seat_id: w.seats.j1.id, score: 7.5, client_key: crypto.randomUUID(), client_rev: 1 });
    await w.db.from("trick_scores").insert({ attempt_id: a1, judge_seat_id: w.seats.j2.id, score: 7, client_key: crypto.randomUUID(), client_rev: 1 });
    // judge 3 scored ahead of the spotter: two pending rows on the console
    const note = (seat: "j1" | "j3", slot: number, score: number) => w.db.from("pending_scores").insert({ event_id: w.eventId, heat_id: H, entry_id: w.entries[0], judge_seat_id: w.seats[seat].id, slot, score, client_key: crypto.randomUUID(), client_rev: 1 });
    await note("j3", 5, 7);
    await note("j3", 6, 6.5);

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await installSupabaseProxy(phone, { officialsOnly: true }); // an official's phone as it is on the live site: the Rider sheet, no switch
    const j1 = await phone.newPage();
    await w.signInAs(j1, "j1", `/judge/${w.eventId}`);
    await expect(j1.getByTestId("rider-sheet")).toBeVisible({ timeout: 60_000 });
    await expect(j1.getByTestId("view-switch")).toHaveCount(0);
    await expect(j1.locator('[data-testid="sheet-line"][data-line="3"][data-needs-score="true"]')).toBeVisible({ timeout: 30_000 });
    await hideDevOverlay(j1);
    await j1.waitForTimeout(500);
    await j1.screenshot({ path: path.join(OUT, "judge-rider-sheet-390.png") });
    // tapping line 7 while lines 3 to 6 have no score from this judge asks once (nothing is set until the judge taps Set to Missed)
    await j1.locator('[data-testid="sheet-line"][data-line="7"] [data-testid="line-score"]').click();
    await expect(j1.getByTestId("skip-ask")).toBeVisible();
    await j1.getByTestId("skip-confirm").scrollIntoViewIfNeeded();
    await hideDevOverlay(j1);
    await j1.waitForTimeout(500);
    await j1.screenshot({ path: path.join(OUT, "judge-rider-sheet-skip-390.png") });
    // the same sheet in Dark (Daylight and Dark are both looked at before anything is pushed)
    await j1.getByTestId("skip-cancel").click();
    await j1.getByTestId("settings-button").click(); // Dark is behind the round Settings button (since 0.21.0)
    await j1.getByRole("button", { name: "Dark", exact: true }).click();
    await j1.keyboard.press("Escape");
    await j1.evaluate(() => document.querySelector('[data-testid="screen-body"]')?.scrollTo(0, 0));
    await expect(j1.getByTestId("live-root")).toHaveAttribute("data-theme", "dark");
    await hideDevOverlay(j1);
    await j1.waitForTimeout(500);
    await j1.screenshot({ path: path.join(OUT, "judge-rider-sheet-dark-390.png") });
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

test("the spotter's Rider sheet", async ({ browser }) => {
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
    await installSupabaseProxy(phone, { officialsOnly: true });
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

    await phone.close();
  } finally {
    await w.cleanup();
  }
});

test("the judge's Rider sheet in a division scored by criteria (three criteria)", async ({ browser }) => {
  test.setTimeout(300_000);
  const w = await createLiveWorld({ model: "kota-best3-impression" });
  try {
    const H = w.heats[0];
    const { data: base } = await w.db.from("scoring_models").select("json").is("organisation_id", null).eq("key", "kota-best3-impression").order("version", { ascending: false }).limit(1).single();
    const useCriteria = async (list: Array<{ key: string; label: string }>) => {
      const json = structuredClone(base!.json) as { trick: { criteria: unknown[]; scale: unknown } };
      const scale = { min: 0, max: 10, step: 0.5 };
      json.trick.criteria = list.map((c) => ({ key: c.key, label: c.label, weight: 1, scale }));
      json.trick.scale = scale;
      const { data: model } = await w.db.from("scoring_models").insert({ organisation_id: w.orgId, key: `shot-${list.length}-${w.org.run}`, name: "Criteria shot", version: 1, json: json as never, content_hash: "shot" }).select("id").single();
      await w.db.from("divisions").update({ scoring_model_id: model!.id }).eq("id", w.divisionId);
    };
    const three = [{ key: "height", label: "Height" }, { key: "extremity", label: "Extremity" }, { key: "technicality", label: "Technicality" }];
    await useCriteria(three);
    await w.db.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", H).neq("entry_id", w.entries[0]);
    await w.startHeat(H);
    const att = (seq: number, trick: string, direction: "left" | "right") => w.db.from("trick_attempts").insert({ heat_id: H, entry_id: w.entries[0], seq, status: "landed", trick_name: trick, direction, client_key: crypto.randomUUID() }).select("id").single();
    const a1 = (await att(1, "Left Backroll", "left")).data!.id;
    await att(2, "Right Frontroll", "right");
    await att(3, "Left Kiteloop", "left");
    await w.db.from("trick_scores").insert({ attempt_id: a1, judge_seat_id: w.seats.j1.id, criteria: { height: 6.5, extremity: 8, technicality: 7 }, score: 7.17, client_key: crypto.randomUUID(), client_rev: 1 });
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await installSupabaseProxy(phone, { officialsOnly: true });
    const j1 = await phone.newPage();
    await w.signInAs(j1, "j1", `/judge/${w.eventId}`);
    await expect(j1.getByTestId("rider-sheet")).toBeVisible({ timeout: 60_000 });
    const box = (n: number, key: string) => j1.locator(`[data-testid="sheet-line"][data-line="${n}"] [data-testid="line-criterion"][data-criterion="${key}"]`);
    await expect(box(1, "height")).toHaveValue("6.5", { timeout: 30_000 });
    await box(2, "technicality").fill("7"); // line 2 half typed: the other boxes wait for you
    await box(2, "technicality").blur();
    await hideDevOverlay(j1);
    await j1.waitForTimeout(500);
    await j1.screenshot({ path: path.join(OUT, "judge-rider-sheet-criteria-390.png") });
    await phone.close();
  } finally {
    await w.cleanup();
  }
});
