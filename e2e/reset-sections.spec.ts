import { randomUUID } from "node:crypto";
import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { addLadder, createLiveWorld, type LiveWorld } from "./live-world";
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

  // while it runs, Reset this heat is in the heat menu, off, and says why
  await head.getByTestId("heat-menu").click();
  await expect(head.getByTestId("reset-heat")).toBeDisabled();
  await expect(head.getByTestId("why-reset-heat")).toContainText("running");
  await head.getByTestId("heat-menu").click();

  await head.getByTestId("end").click();
  await expect(row(head, w.heats[0])).toHaveAttribute("data-state", "ended", { timeout: 40_000 });
  await head.getByTestId("heat-menu").click();
  await expect(head.getByTestId("reset-heat")).toBeEnabled();
  await head.getByTestId("reset-heat").click();
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
  await head.getByTestId("heat-menu").click();
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

test("Clear actual times: the plan's actual starts and pins go, the first pin stays", async ({ page }) => {
  test.setTimeout(180_000);
  await w.db.from("schedule_plans").update({
    items: [{ id: "i1", kind: "heat", heatId: w.heats[0] }, { id: "b1", kind: "break", label: "Lunch", durationMin: 20 }, { id: "i2", kind: "heat", heatId: w.heats[1] }],
    anchors: { i1: "10:00", i2: "11:30" },
    actual_starts: { b1: new Date().toISOString() },
  }).eq("id", w.planId);
  await w.org.signIn(page, `/org/events/${w.eventId}/schedule`);
  await page.getByTestId("clear-actuals-open").click();
  await expect(page.getByTestId("clear-actuals-line")).toContainText("1 actual start and 1 pin");
  await page.getByTestId("clear-actuals-confirm").click();
  await expect(page.getByText(/Cleared 1 actual start and 1 pin/).first()).toBeVisible({ timeout: 30_000 });
  const plan = (await w.db.from("schedule_plans").select("anchors, actual_starts").eq("id", w.planId).single()).data!;
  expect(plan.anchors).toEqual({ i1: "10:00" });
  expect(plan.actual_starts).toEqual({});
  // nothing left to clear: the button stays, off, and says so
  await page.reload();
  await expect(page.getByTestId("clear-actuals-open")).toBeDisabled();
  await expect(page.getByText("There are no actual times or extra pins to clear in this run order.")).toBeVisible();
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
