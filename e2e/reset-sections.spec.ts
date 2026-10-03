import { randomUUID } from "node:crypto";
import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { addLadder, createLiveWorld, type LiveWorld } from "./live-world";
import { createClient } from "@supabase/supabase-js";
import type { BrowserContext, Page } from "@playwright/test";

// Reset per section (branch fix-reset-visibility) on a throwaway organisation: Reset this heat from the head console, Reset this division, Clear actual times and
// Reset event (a division with no saved copy is rebuilt). Arrow, EKL and Demo are never touched.
let w: LiveWorld;
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld();
});
test.afterEach(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});
const row = (p: Page, heat: string) => p.locator(`[data-testid="order-row"][data-heat="${heat}"]`);
const status = async (id: string) => (await w.db.from("heats").select("status, started_at, ended_at").eq("id", id).single()).data!;

test("run a heat, reset it from the console, see it not started", async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  contexts.push(context);
  await installSupabaseProxy(context);
  const head = await context.newPage();
  await w.signInAs(head, "head", `/head/${w.eventId}`);
  await expect(row(head, w.heats[0])).toBeVisible({ timeout: 60_000 });
  await head.getByTestId("start").click();
  await expect(row(head, w.heats[0])).toHaveAttribute("data-state", "running", { timeout: 40_000 });
  await w.db.from("trick_attempts").insert({ heat_id: w.heats[0], entry_id: w.entries[0], seq: 1, client_key: randomUUID(), status: "landed", trick_name: "Backroll" });

  // while it runs, Reset this heat is a visible button before Cancel heat, off, and says why
  await expect(head.getByTestId("reset-heat")).toBeDisabled();
  await expect(head.getByTestId("why-reset-heat")).toContainText("running");

  await head.getByTestId("end").click();
  await expect(row(head, w.heats[0])).toHaveAttribute("data-state", "ended", { timeout: 40_000 });
  await expect(head.getByTestId("reset-heat")).toBeEnabled();
  // Reset this heat is a visible button immediately before Cancel heat (same row, same size), and there is no heat menu any more
  await expect(head.getByTestId("heat-menu")).toHaveCount(0);
  const resetBox = (await head.getByTestId("reset-heat").boundingBox())!;
  const cancelBox = (await head.getByTestId("cancel").boundingBox())!;
  expect(Math.abs(resetBox.y - cancelBox.y)).toBeLessThan(4);
  expect(resetBox.x + resetBox.width).toBeLessThanOrEqual(cancelBox.x + 1);
  expect(cancelBox.x - (resetBox.x + resetBox.width)).toBeLessThan(40); // immediately before
  expect(Math.abs(resetBox.height - cancelBox.height)).toBeLessThan(2);
  await head.getByTestId("reset-heat").click();
  // it asks once: the dialog, and nothing is reset until Save
  await expect(head.getByTestId("console-dialog")).toHaveCount(1);
  expect((await status(w.heats[0])).started_at).not.toBeNull();
  const dialog = head.getByTestId("console-dialog");
  await expect(dialog.getByTestId("reset-heat-line")).toContainText("1 attempt", { timeout: 30_000 });
  // live scores were on while it ran, so a reason is needed
  const reason = dialog.getByTestId("reason-input");
  if (await reason.count()) await reason.fill("Started by mistake");
  await dialog.getByTestId("dialog-save").click();
  await expect(row(head, w.heats[0])).toHaveAttribute("data-state", "scheduled", { timeout: 40_000 });
  await expect(head.getByTestId("start")).toBeVisible();

  expect(await status(w.heats[0])).toMatchObject({ status: "scheduled", started_at: null, ended_at: null });
  expect((await w.db.from("trick_attempts").select("id").eq("heat_id", w.heats[0])).data).toHaveLength(0);
  expect((await w.db.from("heat_reset_records").select("id").eq("heat_id", w.heats[0])).data).toHaveLength(1);
  expect((await w.db.from("heat_slots").select("entry_id").eq("heat_id", w.heats[0])).data).toHaveLength(4); // same riders in the same seats
  expect((await w.db.from("audit_log").select("action").eq("event_id", w.eventId).eq("action", "heat_reset")).data).toHaveLength(1);
});

test("a cancelled heat that was already re-run says so on its Re-run button", async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  contexts.push(context);
  await installSupabaseProxy(context);
  const head = await context.newPage();
  await w.signInAs(head, "head", `/head/${w.eventId}`);
  await head.getByTestId("start").click();
  await expect(row(head, w.heats[0])).toHaveAttribute("data-state", "running", { timeout: 40_000 });
  await head.getByTestId("cancel").click();
  await head.getByTestId("cancel-reason").fill("kite tangle");
  await head.getByTestId("cancel-confirm").click();
  await expect(row(head, w.heats[0])).toHaveAttribute("data-state", "cancelled", { timeout: 40_000 });
  await head.getByTestId("rerun").click();
  await head.getByTestId("reason-input").fill("restart");
  await head.getByTestId("dialog-save").click();
  await row(head, w.heats[0]).click();
  await expect(head.getByTestId("rerun")).toBeDisabled({ timeout: 40_000 });
  await expect(head.getByTestId("rerun")).toHaveText(/Already re-run as H1R/);
  // a cancelled heat that was re-run cannot be reset: the menu says to reset the re-run
  await expect(head.getByTestId("reset-heat")).toBeDisabled();
  await expect(head.getByTestId("why-reset-heat")).toContainText("Reset the re-run instead");
});

test("Reset this division: asks once, says it is a rebuild when there is no saved copy, wipes it and leaves the other division alone", async ({ page }) => {
  test.setTimeout(300_000);
  const ladder = await addLadder(w);
  const [h1] = Object.values(ladder.heats);
  await w.db.from("heats").update({ status: "ended", started_at: new Date(Date.now() - 600_000).toISOString(), ended_at: new Date().toISOString() }).eq("id", h1);
  await w.db.from("trick_attempts").insert({ heat_id: h1, entry_id: ladder.entries[0], seq: 1, client_key: randomUUID(), status: "landed", trick_name: "Backroll" });
  await w.db.from("heats").update({ status: "ended", started_at: new Date(Date.now() - 600_000).toISOString(), ended_at: new Date().toISOString() }).eq("id", w.heats[0]);
  await w.org.signIn(page, `/org/events/${w.eventId}/divisions`);
  const card = page.getByTestId("division-card").nth(1);
  await card.getByTestId("reset-division-open").click();
  const panel = card.getByTestId("reset-division-panel");
  await expect(panel.getByTestId("reset-division-line")).toContainText("1 attempt", { timeout: 30_000 });
  await expect(panel.getByTestId("reset-division-note")).toContainText("a rebuild, not the saved copy");
  await panel.getByTestId("reset-division-reason").fill("Practice heat by mistake").catch(() => {});
  await panel.getByTestId("reset-division-confirm").click();
  await expect(page.getByText(/reset: \d+ heats?/).first()).toBeVisible({ timeout: 30_000 });
  expect((await status(h1)).status).toBe("scheduled");
  expect((await w.db.from("trick_attempts").select("id").eq("heat_id", h1)).data).toHaveLength(0);
  expect((await status(w.heats[0])).status).toBe("ended"); // the other division
  const lines = (await w.db.from("audit_log").select("after").eq("event_id", w.eventId).eq("action", "division_reset")).data!;
  expect(lines).toHaveLength(1);
  expect(lines[0].after).toMatchObject({ rebuilt: true });
});

test("Reset this division is refused while a heat runs, and the button stays with the reason", async ({ page }) => {
  test.setTimeout(180_000);
  const ladder = await addLadder(w);
  await w.db.from("heats").update({ status: "running", started_at: new Date().toISOString() }).eq("id", Object.values(ladder.heats)[0]);
  await w.org.signIn(page, `/org/events/${w.eventId}/divisions`);
  const card = page.getByTestId("division-card").nth(1);
  await card.getByTestId("reset-division-open").click();
  await expect(card.getByTestId("reset-division-blocked")).toContainText("is running. End it first.", { timeout: 30_000 });
  await expect(card.getByTestId("reset-division-confirm")).toBeDisabled();
  await expect(card.getByTestId("reset-division-open")).toHaveCount(0); // the panel is open; Cancel brings the button back
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(card.getByTestId("reset-division-open")).toBeVisible();
});

/** The head seat's own login, to write a pin the way the console does (Shift, Resume at, +1 min). */
async function headPins(anchors: Record<string, string>) {
  const head = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: signInError } = await head.auth.signInWithPassword({ email: w.seats.head.email, password: `Pw-${w.org.run}-live` });
  if (signInError) throw new Error(signInError.message);
  const { error } = await head.rpc("set_plan_anchors", { p_plan: w.planId, p_anchors: anchors as never });
  if (error) throw new Error(error.message);
}
const planItems = (w0: LiveWorld) => [{ id: "i1", kind: "heat", heatId: w0.heats[0] }, { id: "b1", kind: "break", label: "Lunch", durationMin: 20 }, { id: "i2", kind: "heat", heatId: w0.heats[1] }, { id: "b2", kind: "break", label: "Prize giving", durationMin: 15 }];

test("Clear actual times: the actual starts and the pins the console wrote go; the pins set by hand stay", async ({ page }) => {
  test.setTimeout(180_000);
  // the organiser's side wrote the pins on Heat 1 and Heat 2 (hand-set); an actual start for the lunch break
  await w.db.from("schedule_plans").update({ items: planItems(w) as never, anchors: { i1: "10:00", i2: "11:30" }, actual_starts: { b1: new Date().toISOString() } }).eq("id", w.planId);
  // the head console pins the prize giving while the day runs (Shift, +1 min…)
  await headPins({ i1: "10:00", i2: "11:30", b2: "13:07" });
  await w.org.signIn(page, `/org/events/${w.eventId}/schedule`);
  await page.getByTestId("clear-actuals-open").click();
  await expect(page.getByTestId("clear-actuals-line")).toContainText("1 actual start and 1 pin written while the day ran. The 2 pins you set by hand stay.");
  await page.getByTestId("clear-actuals-confirm").click();
  await expect(page.getByText(/Cleared 1 actual start and 1 pin\. 2 pins stay\./).first()).toBeVisible({ timeout: 30_000 });
  const plan = (await w.db.from("schedule_plans").select("anchors, actual_starts").eq("id", w.planId).single()).data!;
  expect(plan.anchors).toEqual({ i1: "10:00", i2: "11:30" });
  expect(plan.actual_starts).toEqual({});
  // nothing left to clear: the button stays, off, and says so
  await expect(page.getByTestId("clear-actuals-open")).toBeDisabled();
  // Polish 2, item 14: it says what stays instead of "nothing to clear"
  await expect(page.getByText("This run order has no actual start times and no pins written while the day ran. Your pinned 10:00 and 11:30 stay.")).toBeVisible();
});

test("Clear actual times on an older run order (hand-set pins not told apart): every pin stays, and the confirmation says so", async ({ page }) => {
  test.setTimeout(180_000);
  await w.db.from("schedule_plans").update({ items: planItems(w) as never, anchors: { i1: "10:00", i2: "11:30" }, actual_starts: { b1: new Date().toISOString() } }).eq("id", w.planId);
  await w.db.from("schedule_plans").update({ hand_pins: null }).eq("id", w.planId); // as every plan made before pins were marked
  await w.org.signIn(page, `/org/events/${w.eventId}/schedule`);
  await page.getByTestId("clear-actuals-open").click();
  await expect(page.getByTestId("clear-actuals-line")).toContainText("made before the app told hand-set pins apart, so all 2 pins stay");
  await page.getByTestId("clear-actuals-confirm").click();
  await expect(page.getByText(/Cleared 1 actual start and 0 pins\. 2 pins stay\./).first()).toBeVisible({ timeout: 30_000 });
  const plan = (await w.db.from("schedule_plans").select("anchors, actual_starts").eq("id", w.planId).single()).data!;
  expect(plan.anchors).toEqual({ i1: "10:00", i2: "11:30" });
  expect(plan.actual_starts).toEqual({});
});

test("Reset event from the dashboard for a division with no saved copy: rebuilt, not refused", async ({ page }) => {
  test.setTimeout(180_000);
  const ladder = await addLadder(w);
  const [h1] = Object.values(ladder.heats);
  await w.db.from("heats").update({ status: "ended", started_at: new Date(Date.now() - 600_000).toISOString(), ended_at: new Date().toISOString() }).eq("id", h1);
  await w.db.from("events").update({ settings: {} }).eq("id", w.eventId); // live scores off: no reason needed
  await w.org.signIn(page, `/org/events/${w.eventId}`);
  await page.getByTestId("reset-open").click();
  await expect(page.getByTestId("reset-rebuild-note")).toContainText("Ladder");
  await page.getByLabel("Event web address").fill(`e2e-live-${w.org.run}`);
  await page.getByTestId("reset-confirm").click();
  await expect(page.getByText(/Event reset: /).first()).toBeVisible({ timeout: 30_000 });
  expect((await status(h1)).status).toBe("scheduled");
  expect((await w.db.from("audit_log").select("after").eq("event_id", w.eventId).eq("action", "event_reset")).data![0].after).toMatchObject({ rebuilt_divisions: ["Ladder"] });
});
