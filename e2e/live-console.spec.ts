import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { addLadder, createLiveWorld, type LiveWorld } from "./live-world";
import type { BrowserContext, Page } from "@playwright/test";

// Phase 5c step 4 on a throwaway event: the head judge's laptop console. Two spotters log the same rider 5 seconds apart and the console shows the duplicate; Merge
// keeps the first logged and the judge's phone drops the merged card; a score edited with a reason is in the audit log; a rider who did not start ranks last. In
// this sandbox the browser cannot open the Realtime WebSocket, so every screen follows the heat through the 5 second fallback.
let w: LiveWorld;
test.beforeEach(async () => {
  w = await createLiveWorld();
});
test.afterEach(async () => {
  await w?.cleanup();
});
const phones: BrowserContext[] = [];
test.afterEach(async () => {
  await closePhones(phones);
});
async function open(browser: import("@playwright/test").Browser, key: Parameters<LiveWorld["signInAs"]>[1], path: string, size = { width: 390, height: 844 }): Promise<Page> {
  const context = await browser.newContext({ viewport: size });
  phones.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await w.signInAs(page, key, path);
  return page;
}
/** The console shows one division at a time (Phase 7a): pick the one with the heat to work on. */
const showDivision = async (page: Page, name: string) => {
  if ((page.viewportSize()?.width ?? 1500) < 900) await page.getByTestId("division-select").selectOption({ label: name });
  else await page.getByTestId("division-tabs").getByRole("tab", { name: new RegExp(name) }).click();
};
const laptop = (browser: import("@playwright/test").Browser, path: string) => open(browser, "head", path, { width: 1500, height: 1000 });
const log = async (spotter: Page, trick: [string, string]) => {
  await spotter.locator(`[data-block="${trick[0]}"]`).click();
  await spotter.locator(`[data-block="${trick[1]}"]`).click();
  await spotter.getByTestId("log-button").click();
};
const pad = async (p: Pick<Page, "getByRole">, whole: number, half: "0" | "5") => {
  await p.getByRole("button", { name: `Set ${whole}`, exact: true }).click();
  await p.getByRole("button", { name: `Set .${half}` }).click();
};
const rows = (head: Page) => head.getByTestId("matrix-row");
const dialog = (head: Page) => head.getByTestId("console-dialog");
const audit = async (heat: string, action: string) => (await w.db.from("audit_log").select("action, reason, before, after, actor_user_id").eq("row_id", heat).eq("action", action)).data ?? [];

test("two spotters log Red 5 s apart: the console shows the duplicate; Merge keeps the first logged and the judge's phone drops the merged card", async ({ browser }) => {
  test.setTimeout(420_000);
  await w.startHeat(w.heats[0]);
  const s1 = await open(browser, "spotter", `/spot/${w.eventId}`);
  const s2 = await open(browser, "spotter2", `/spot/${w.eventId}`);
  const j1 = await open(browser, "j1", `/judge/${w.eventId}`);
  const head = await laptop(browser, `/head/${w.eventId}`);
  for (const s of [s1, s2]) await expect(s.getByTestId("trick-builder")).toBeVisible({ timeout: 40_000 });
  await expect(j1.getByTestId("all-scored")).toBeVisible({ timeout: 40_000 });

  await log(s1, ["direction:left", "base:backroll"]);
  await head.waitForTimeout(5000);
  await log(s2, ["direction:left", "base:backroll"]);
  await expect(rows(head)).toHaveCount(2, { timeout: 40_000 });
  await expect(rows(head).nth(1)).toHaveAttribute("data-row-state", "duplicate");
  await expect(rows(head).nth(1)).toContainText("possible duplicate");
  await expect(j1.getByTestId("waiting-pill")).toContainText("1 waiting", { timeout: 30_000 });

  // tick both and Merge: the first logged is kept (the dialog says so), a reason is needed
  await rows(head).nth(0).getByTestId("row-select").check();
  await rows(head).nth(1).getByTestId("row-select").check();
  await head.getByTestId("merge-selected").click();
  await expect(dialog(head)).toContainText("first logged");
  await expect(dialog(head).getByTestId("merge-keep").first()).toBeChecked();
  await expect(dialog(head).getByTestId("dialog-save")).toBeDisabled();
  await dialog(head).getByTestId("reason-input").fill("same trick logged twice");
  await dialog(head).getByTestId("dialog-save").click();
  await expect(rows(head).nth(1)).toHaveAttribute("data-row-state", "deleted", { timeout: 30_000 });
  const attempts = (await w.db.from("trick_attempts").select("id, seq, deleted_at, created_at").eq("heat_id", w.heats[0]).order("created_at")).data!;
  expect(attempts[0].deleted_at).toBeNull();
  expect(attempts[1].deleted_at).not.toBeNull();
  expect((await audit(w.heats[0], "attempt_merged")).length + (await w.db.from("audit_log").select("id").eq("row_id", attempts[1].id).eq("action", "attempt_merged")).data!.length).toBeGreaterThan(0);
  // the judge's phone no longer waits for the merged card
  await expect(j1.getByTestId("waiting-pill")).toHaveCount(0, { timeout: 30_000 });
  await expect(j1.getByTestId("queue-card")).toContainText("Left Backroll");
});

test("the head judge edits a score with a reason and sees it in the audit log; a rider who did not start ranks last", async ({ browser }) => {
  test.setTimeout(300_000);
  await w.startHeat(w.heats[0]);
  const att = (await w.db.from("trick_attempts").insert({ heat_id: w.heats[0], entry_id: w.entries[0], seq: 1, status: "landed", trick_name: "Left Backroll", direction: "left", client_key: crypto.randomUUID() }).select("id").single()).data!;
  for (const [i, key] of (["j1", "j2", "j3"] as const).entries()) await w.db.from("trick_scores").insert({ attempt_id: att.id, judge_seat_id: w.seats[key].id, score: [7.5, 8, 7][i], client_key: crypto.randomUUID(), client_rev: 1 });
  const head = await laptop(browser, `/head/${w.eventId}`);
  await expect(rows(head)).toHaveCount(1, { timeout: 40_000 });
  const cells = rows(head).first().getByTestId("matrix-cell");
  await expect(cells.nth(0)).toContainText("7.50");
  await expect(rows(head).first().getByTestId("matrix-panel")).toContainText("7.50"); // mean of 7.5, 8.0, 7.0

  // tap Judge 1's cell: new score 8.5 needs a reason
  await cells.nth(0).click();
  await pad(dialog(head), 8, "5");
  await expect(dialog(head).getByTestId("dialog-save")).toBeDisabled();
  await dialog(head).getByTestId("reason-input").fill("paper sheet");
  await dialog(head).getByTestId("dialog-save").click();
  await expect(cells.nth(0)).toContainText("8.50", { timeout: 30_000 });
  await expect(head.getByTestId("audit-line").first()).toContainText("Judge 1", { timeout: 30_000 });
  await expect(head.getByTestId("audit-line").first()).toContainText("7.50 → 8.50");
  await expect(head.getByTestId("audit-line").first()).toContainText("paper sheet");
  const lines = ((await w.db.from("audit_log").select("action, reason, before, after").eq("event_id", w.eventId).eq("action", "score_edited")).data ?? []).filter((l) => (l.after as { attempt_id?: string }).attempt_id === att.id);
  expect(lines).toHaveLength(1);
  expect(Number((lines[0].before as { score: number }).score)).toBe(7.5);
  expect(Number((lines[0].after as { score: number }).score)).toBe(8.5);

  // Blue did not start: DNS from the rider menu, ranked last with no total
  await head.getByTestId("rider-menu-button").first().click();
  await head.getByRole("menuitem", { name: /DNS/ }).click();
  await dialog(head).getByTestId("reason-input").fill("did not come to the beach");
  await dialog(head).getByTestId("dialog-save").click();
  const totals = head.getByTestId("console-total");
  await expect(totals).toHaveCount(4, { timeout: 30_000 });
  const last = totals.last();
  await expect(last).toContainText("—");
  expect((await w.db.from("heat_slots").select("modifier").eq("heat_id", w.heats[0]).eq("entry_id", w.entries[0]).single()).data!.modifier).toBe("DNS");
});

/** The Ladder division's first heat of Round 1, ended, three riders scored by all three judges (rider 1 wins), Impression scores in; the sheets of the judges in `submitted` are in. */
async function endedLadderHeat(ladder: Awaited<ReturnType<typeof addLadder>>, submitted: Array<"j1" | "j2" | "j3">) {
  const heat = ladder.heats["R1-H1"];
  await w.db.from("heats").update({ status: "ended", started_at: new Date(Date.now() - 900_000).toISOString(), ended_at: new Date(Date.now() - 300_000).toISOString() }).eq("id", heat);
  const slots = (await w.db.from("heat_slots").select("entry_id, position").eq("heat_id", heat).order("position")).data!;
  const attempts: string[] = [];
  for (const [i, slot] of slots.entries()) {
    const a = (await w.db.from("trick_attempts").insert({ heat_id: heat, entry_id: slot.entry_id!, seq: 1, status: "landed", trick_name: "Left Backroll", direction: "left", client_key: crypto.randomUUID() }).select("id").single()).data!;
    attempts.push(a.id);
    for (const key of ["j1", "j2", "j3"] as const) {
      await w.db.from("trick_scores").insert({ attempt_id: a.id, judge_seat_id: w.seats[key].id, score: 8 - i, client_key: crypto.randomUUID(), client_rev: 1 });
      await w.db.from("impression_scores").insert({ heat_id: heat, entry_id: slot.entry_id!, judge_seat_id: w.seats[key].id, value: 5, client_key: crypto.randomUUID(), client_rev: 1 });
    }
  }
  for (const key of submitted) await w.db.from("judge_sheets").upsert({ event_id: w.eventId, heat_id: heat, judge_seat_id: w.seats[key].id, submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });
  return { heat, entries: slots.map((s) => s.entry_id as string), attempts };
}
const results = async (heat: string) => (await w.db.from("heat_results").select("entry_id, place, total, version").eq("heat_id", heat).order("version")).data ?? [];
const finalSeat = async (ladder: Awaited<ReturnType<typeof addLadder>>, pos: number) => (await w.db.from("heat_slots").select("entry_id").eq("heat_id", ladder.heats["F-H1"]).eq("position", pos).single()).data!.entry_id;

test("Publish is blocked until the second judge submits, then publishes; the winner takes the Final's seat (also on the Draw step); Publish twice gives one result; Re-open then Publish gives version 2", async ({ browser }) => {
  test.setTimeout(600_000);
  const ladder = await addLadder(w);
  const { heat, entries } = await endedLadderHeat(ladder, ["j1", "j3"]);
  const head = await laptop(browser, `/head/${w.eventId}`);
  await showDivision(head, "Ladder");
  await head.locator(`[data-testid="order-row"][data-heat="${heat}"]`).click({ timeout: 40_000 });
  await expect(rows(head)).toHaveCount(3, { timeout: 40_000 });

  // Judge 2 has not submitted: Publish says so in words, and a reason is needed to go on
  await head.getByTestId("publish").click();
  await expect(head.getByTestId("publish-blockers")).toContainText("Judge 2 has not submitted");
  await expect(dialog(head).getByTestId("dialog-save")).toBeDisabled();
  await dialog(head).getByTestId("dialog-cancel").click();
  expect(await results(heat)).toHaveLength(0);

  // Judge 2 submits: the blocker goes, Publish asks once and publishes
  await w.db.from("judge_sheets").upsert({ event_id: w.eventId, heat_id: heat, judge_seat_id: w.seats.j2.id, submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });
  await expect(head.getByTestId("blockers")).toContainText("Nothing blocks Publish", { timeout: 40_000 });
  await head.getByTestId("publish").click();
  await expect(dialog(head)).toContainText("Publish this result?");

  // a second laptop presses Publish at the same moment: one result, not two
  const head2 = await laptop(browser, `/head/${w.eventId}`);
  await showDivision(head2, "Ladder");
  await head2.locator(`[data-testid="order-row"][data-heat="${heat}"]`).click({ timeout: 40_000 });
  await expect(rows(head2)).toHaveCount(3, { timeout: 40_000 });
  await head2.getByTestId("publish").click();
  await expect(dialog(head2)).toContainText("Publish this result?");
  await Promise.all([dialog(head).getByTestId("dialog-save").click(), dialog(head2).getByTestId("dialog-save").click()]);
  await expect(head.getByTestId("control-message")).toContainText("Published", { timeout: 60_000 });
  const first = await results(heat);
  expect(first).toHaveLength(3);
  expect(new Set(first.map((r) => r.version))).toEqual(new Set([1]));
  expect(first.find((r) => r.entry_id === entries[0])!.place).toBe(1);
  expect((await w.db.from("heats").select("status").eq("id", heat).single()).data!.status).toBe("published");
  expect(await finalSeat(ladder, 1)).toBe(entries[0]);
  expect(await finalSeat(ladder, 2)).toBeNull();

  // the Draw step shows the winner's name in the Final's seat
  const org = await browser.newContext({ viewport: { width: 1400, height: 1800 } });
  phones.push(org);
  await installSupabaseProxy(org);
  const orgPage = await org.newPage();
  await w.org.signIn(orgPage, `/org/events/${w.eventId}/draw?division=${ladder.divisionId}`);
  await expect(orgPage.locator('[data-seat="F-H1:0"]')).toContainText(ladder.names[ladder.entries.indexOf(entries[0])].split(" ")[0], { timeout: 60_000 });

  // Re-open (one confirmation, a reason), change one score so rider 2 wins, publish again: version 2, the Final's seat changes
  await head.getByTestId("reopen").click();
  await dialog(head).getByTestId("reason-input").fill("a paper sheet showed a different score");
  await dialog(head).getByTestId("dialog-save").click();
  await expect(head.getByTestId("under-correction")).toBeVisible({ timeout: 40_000 });
  await rows(head).first().getByTestId("matrix-cell").first().click();
  await pad(dialog(head), 0, "0");
  await dialog(head).getByTestId("reason-input").fill("paper sheet");
  await dialog(head).getByTestId("dialog-save").click();
  await expect(rows(head).first().getByTestId("matrix-cell").first()).toContainText("0.00", { timeout: 40_000 });
  await head.getByTestId("publish").click();
  await dialog(head).getByTestId("dialog-save").click();
  await expect(head.getByTestId("control-message")).toContainText("Published — version 2", { timeout: 60_000 });
  const versions = new Set((await results(heat)).map((r) => r.version));
  expect(versions).toEqual(new Set([1, 2]));
  expect(await finalSeat(ladder, 1)).toBe(entries[1]);
});

test("on a phone the Control tab has Publish and Re-open, and Details holds the totals and the blocker list; Publish with a reason is audited", async ({ browser }) => {
  test.setTimeout(300_000);
  const ladder = await addLadder(w);
  const { heat } = await endedLadderHeat(ladder, ["j1"]);
  const phone = await open(browser, "head", `/head/${w.eventId}`);
  await showDivision(phone, "Ladder");
  await phone.locator(`[data-testid="order-row"][data-heat="${heat}"]`).click({ timeout: 40_000 });
  await expect(phone.getByTestId("publish")).toBeEnabled({ timeout: 40_000 });
  await expect(phone.getByTestId("reopen")).toBeDisabled();
  await expect(phone.getByTestId("why-reopen")).toContainText("Only a published heat can be re-opened.");
  await phone.getByTestId("details-toggle").click();
  await expect(phone.getByTestId("details").getByTestId("total-row")).toHaveCount(3, { timeout: 40_000 });
  await expect(phone.getByTestId("phone-blockers")).toContainText("Judge 2 has not submitted");
  await expect(phone.getByTestId("phone-blockers")).toContainText("Judge 3 has not submitted");
  await expect(phone.getByTestId("details")).toContainText("tablet or laptop");
  await phone.getByTestId("publish").click();
  await expect(phone.getByTestId("publish-blockers")).toContainText("Judge 2 has not submitted");
  await phone.getByTestId("reason-input").fill("Judges 2 and 3 left the beach");
  await phone.getByTestId("dialog-save").click();
  await expect(phone.getByTestId("control-message")).toContainText("Published", { timeout: 60_000 });
  const line = (await w.db.from("audit_log").select("reason, after").eq("row_id", heat).eq("action", "publish_override")).data ?? [];
  expect(line).toHaveLength(1);
  expect(line[0].reason).toBe("Judges 2 and 3 left the beach");
  expect(JSON.stringify(line[0].after)).toContain("Judge 2 has not submitted");
});

test("Re-run heat: a reason and one confirmation; Heat 1 is cancelled, 'Heat 1 re-run' is next with the same riders and Lycras, Blue did not start; Start opens it on the spotter's phone by itself", async ({ browser }) => {
  test.setTimeout(420_000);
  await w.startHeat(w.heats[0]);
  const spotter = await open(browser, "spotter", `/spot/${w.eventId}`);
  const head = await laptop(browser, `/head/${w.eventId}`);
  await expect(spotter.getByTestId("trick-builder")).toBeVisible({ timeout: 40_000 });
  await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "running", { timeout: 40_000 });
  await head.getByTestId("rerun").click();
  await expect(dialog(head)).toContainText("Re-run Pro Men · R1 · Heat 1");
  await expect(dialog(head).getByTestId("dialog-save")).toBeDisabled();
  await dialog(head).getByTestId("rerun-rider").nth(1).selectOption("DNS"); // Blue did not start
  await dialog(head).getByTestId("reason-input").fill("kite tangle");
  await dialog(head).getByTestId("dialog-save").click();
  await expect(head.getByTestId("control-message")).toContainText("is next in the run order", { timeout: 40_000 });
  const heats = (await w.db.from("heats").select("id, status, number, number_suffix, name, rerun_of, draw_uid").eq("division_id", w.divisionId).order("number").order("number_suffix")).data!;
  const rerun = heats.find((h) => h.rerun_of === w.heats[0])!;
  expect(rerun).toMatchObject({ status: "scheduled", number: 1, number_suffix: "R", name: "Heat 1 re-run" });
  expect(heats.find((h) => h.id === w.heats[0])!.status).toBe("cancelled");
  const slots = (await w.db.from("heat_slots").select("entry_id, vest_colour, modifier").eq("heat_id", rerun.id).order("position")).data!;
  expect(slots.map((s) => [s.entry_id, s.vest_colour, s.modifier])).toEqual(w.entries.map((e, i) => [e, w.colours[i], i === 1 ? "DNS" : null]));
  const plan = (await w.db.from("schedule_plans").select("items").eq("id", w.planId).single()).data!.items as Array<{ heatId?: string }>;
  expect(plan.map((i) => i.heatId)).toEqual([w.heats[0], rerun.id, w.heats[1]]); // right after the heat that was live
  // the cancelled heat stays visible, read-only, and says what replaced it
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
  await expect(head.getByTestId("cancelled-note")).toContainText("Cancelled — re-run as Heat 1 re-run");
  // Start the re-run: the spotter's phone opens it by itself
  await head.locator(`[data-testid="order-row"][data-heat="${rerun.id}"]`).click();
  await head.getByTestId("start").click();
  await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "running", { timeout: 40_000 });
  await expect(spotter.getByTestId("screen-header")).toContainText("Heat 1 re-run", { timeout: 40_000 });
  expect(((await w.db.from("audit_log").select("action").eq("event_id", w.eventId).eq("action", "heat_rerun")).data ?? []).length).toBe(1);
});

test("visibility: the head judge's per-heat live switch, and a held result stays hidden until Release", async ({ browser }) => {
  test.setTimeout(300_000);
  const ladder = await addLadder(w);
  const { heat } = await endedLadderHeat(ladder, ["j1", "j2", "j3"]);
  const head = await laptop(browser, `/head/${w.eventId}`);
  await showDivision(head, "Ladder");
  await head.locator(`[data-testid="order-row"][data-heat="${heat}"]`).click({ timeout: 40_000 });
  await expect(head.getByTestId("live-follow")).toHaveAttribute("aria-pressed", "true", { timeout: 40_000 });
  await head.getByTestId("live-on").click();
  await expect.poll(async () => (await w.db.from("heats").select("public_live").eq("id", heat).single()).data!.public_live, { timeout: 30_000 }).toBe(true);
  await head.getByTestId("live-off").click();
  await expect.poll(async () => (await w.db.from("heats").select("public_live").eq("id", heat).single()).data!.public_live, { timeout: 30_000 }).toBe(false);
  await head.getByTestId("live-follow").click();
  await expect.poll(async () => (await w.db.from("heats").select("public_live").eq("id", heat).single()).data!.public_live, { timeout: 30_000 }).toBeNull();
  // the event does not show results on publish (the default): the published result is held until released
  await head.getByTestId("publish").click();
  await dialog(head).getByTestId("dialog-save").click();
  await expect(head.getByTestId("control-message")).toContainText("Published", { timeout: 60_000 });
  expect((await w.db.from("heats").select("publish_hold").eq("id", heat).single()).data!.publish_hold).toBe(true);
  const anon = (await import("@supabase/supabase-js")).createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  expect(((await anon.from("heat_results").select("entry_id").eq("heat_id", heat)).data ?? []).length).toBe(0);
  await expect(head.getByTestId("held-note")).toBeVisible({ timeout: 40_000 });
  await head.getByTestId("release").click();
  await expect(head.getByTestId("control-message")).toContainText("Result released", { timeout: 40_000 });
  expect((await w.db.from("heats").select("publish_hold").eq("id", heat).single()).data!.publish_hold).toBe(false);
  expect(((await anon.from("heat_results").select("entry_id").eq("heat_id", heat)).data ?? []).length).toBe(3);
});

test("Practice heat on a simulation event: the organiser's tab plays a spotter feed and a judge's phone fills by itself; the event is not on the home page", async ({ browser }) => {
  test.setTimeout(420_000);
  await w.db.from("events").update({ is_simulation: true }).eq("id", w.eventId);
  await w.startHeat(w.heats[0]);
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  phones.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await w.org.signIn(page, `/head/${w.eventId}`);
  const j1 = await open(browser, "j1", `/judge/${w.eventId}`);
  await expect(page.getByTestId("practice")).toBeVisible({ timeout: 60_000 });
  await expect(j1.getByTestId("all-scored")).toBeVisible({ timeout: 40_000 });
  await page.getByTestId("practice-seconds").fill("3");
  await page.getByTestId("practice-start").click();
  await expect(page.getByTestId("practice-status")).toContainText("Practice running", { timeout: 20_000 });
  await expect.poll(async () => ((await w.db.from("trick_attempts").select("id").eq("heat_id", w.heats[0])).data ?? []).length, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  await expect(j1.getByTestId("queue-card")).toBeVisible({ timeout: 40_000 }); // the judge's queue filled by itself
  await page.getByTestId("practice-stop").click();
  await expect(page.getByTestId("practice-status")).toContainText("Practice stopped");
  // never public
  const anon = (await import("@supabase/supabase-js")).createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const listed = ((await anon.rpc("get_public_events", { p_limit: 100 })).data ?? []) as Array<{ id: string }>;
  expect(listed.some((e) => e.id === w.eventId)).toBe(false);
  // a normal head seat does not get the Practice panel (organiser only)
  const headSeat = await laptop(browser, `/head/${w.eventId}`);
  await expect(headSeat.getByTestId("heat-control")).toBeVisible({ timeout: 40_000 });
  await expect(headSeat.getByTestId("practice")).toHaveCount(0);
});

test("the announcer view is read-only: the score table and the feed, no menus, no tick boxes, no controls; Sound on is a switch", async ({ browser }) => {
  test.setTimeout(300_000);
  await w.startHeat(w.heats[0]);
  const att = (await w.db.from("trick_attempts").insert({ heat_id: w.heats[0], entry_id: w.entries[0], seq: 1, status: "landed", trick_name: "Left Backroll", direction: "left", client_key: crypto.randomUUID() }).select("id").single()).data!;
  for (const [i, key] of (["j1", "j2"] as const).entries()) await w.db.from("trick_scores").insert({ attempt_id: att.id, judge_seat_id: w.seats[key].id, score: [7.5, 8][i], client_key: crypto.randomUUID(), client_rev: 1 });
  const ann = await laptop(browser, `/head/${w.eventId}?mode=announcer`);
  await expect(ann.getByTestId("announcer-view")).toBeVisible({ timeout: 40_000 });
  await expect(ann.getByTestId("matrix-row")).toHaveCount(1, { timeout: 40_000 });
  await expect(ann.getByTestId("announcer-feed")).toContainText("Red — attempt 1 — Left Backroll — landed", { timeout: 40_000 });
  await expect(ann.getByTestId("row-select")).toHaveCount(0);
  await expect(ann.getByTestId("attempt-menu-button")).toHaveCount(0);
  await expect(ann.getByTestId("matrix-cell").first()).not.toHaveJSProperty("tagName", "BUTTON");
  await expect(ann.getByTestId("start")).toHaveCount(0);
  // the head console has the Sound on switch, on by default, and it flips
  const head = await laptop(browser, `/head/${w.eventId}`);
  await expect(head.getByTestId("sound-toggle")).toHaveAttribute("aria-pressed", "true", { timeout: 40_000 });
  await head.getByTestId("sound-toggle").click();
  await expect(head.getByTestId("sound-toggle")).toHaveAttribute("aria-pressed", "false");
});
