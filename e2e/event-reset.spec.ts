import { test, expect } from "./base";
import { addLadder, createLiveWorld, type LiveWorld } from "./live-world";
import { createOrganiser } from "./organiser";

// Phase 7a-1, step 8d: Reset event on the dashboard and Restore in /admin. A throwaway event with a ladder; Arrow, EKL and Demo are never touched.
let w: LiveWorld;
test.beforeEach(async () => {
  w = await createLiveWorld();
});
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await w?.cleanup();
});

test("Reset: says what blocks it, asks for the address, asks for a reason only because a result was public, wipes, and Restore brings it back", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const ladder = await addLadder(w);
  const firstLadderHeat = Object.values(ladder.heats)[0];
  await w.org.signIn(page, `/org/events/${w.eventId}`);

  // a division locked before Reset existed has no saved starting draw: it is named, and Reset says it will rebuild it from the current draw (it no longer refuses)
  await page.getByTestId("reset-open").click();
  const panel = page.getByTestId("reset-panel");
  await expect(page.getByTestId("reset-rebuild-note")).toContainText("Ladder");
  await expect(page.getByTestId("reset-rebuild-note")).toContainText("a rebuild, not the saved copy");
  await expect(panel).not.toContainText("A reset is not possible yet");
  await expect(page.getByTestId("reset-confirm")).toBeDisabled(); // still needs the web address
  await page.getByRole("button", { name: "Cancel" }).click();

  // the lock takes the copy (what unlock and lock again does): the note goes away
  const { data: dv } = await w.db.from("divisions").select("draw").eq("id", ladder.divisionId).single();
  await w.db.from("divisions").update({ draw_at_lock: dv!.draw as never }).eq("id", ladder.divisionId);

  // a heat is running: the button is disabled and says which
  await w.db.from("heats").update({ status: "running", started_at: new Date().toISOString() }).eq("id", w.heats[0]);
  await page.reload();
  await expect(page.getByRole("button", { name: "Reset event…" })).toBeDisabled();
  await expect(page.getByText("Pro Men").first()).toBeVisible();
  await expect(page.getByText(/is running\. End it first\./)).toBeVisible();

  // the heat ends and is published: its result was public, so a reason is needed
  await w.db.from("heats").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", w.heats[0]);
  await w.db.from("heats").update({ status: "published", published_at: new Date().toISOString() }).eq("id", w.heats[0]);
  await w.db.from("heat_results").insert({ heat_id: w.heats[0], entry_id: w.entries[0], place: 1, total: 8, version: 1 });
  await w.db.from("heat_slots").update({ place: 1, total: 8 }).eq("heat_id", w.heats[0]).eq("entry_id", w.entries[0]);
  await w.db.from("heats").update({ status: "ended", ended_at: new Date().toISOString(), started_at: new Date(Date.now() - 600_000).toISOString() }).eq("id", firstLadderHeat);
  await page.reload();
  await page.getByTestId("reset-open").click();
  await expect(page.getByTestId("reset-counts")).toContainText("1 published result");
  await expect(page.getByLabel("Reason (at least 5 characters)")).toBeVisible();
  const confirm = page.getByTestId("reset-confirm");
  await expect(confirm).toBeDisabled();
  await expect(page.getByText("Type the web address exactly first.")).toBeVisible();
  await page.getByLabel("Event web address").fill("not-it");
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Event web address").fill(`e2e-live-${w.org.run}`);
  await expect(page.getByText("Write a reason of at least 5 characters first.")).toBeVisible();
  await page.getByLabel("Reason (at least 5 characters)").fill("Practice results were shown by mistake");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText(/Event reset: /).first()).toBeVisible({ timeout: 30_000 });

  const { data: results } = await w.db.from("heat_results").select("id").eq("event_id", w.eventId);
  expect(results).toHaveLength(0);
  const { data: heats } = await w.db.from("heats").select("status, started_at").eq("event_id", w.eventId);
  expect(heats!.every((h) => h.status === "scheduled" && h.started_at === null)).toBe(true);
  // the ladder shows Round 1 riders and empty later seats; riders and officials are still there
  const { data: slots } = await w.db.from("heat_slots").select("entry_id").in("heat_id", Object.values(ladder.heats));
  expect(slots!.filter((s) => s.entry_id === null).length).toBeGreaterThan(0);
  expect((await w.db.from("entries").select("id").eq("division_id", ladder.divisionId)).data).toHaveLength(6);
  expect((await w.db.from("judge_seats").select("id").eq("event_id", w.eventId)).data!.length).toBeGreaterThanOrEqual(6);
  const { data: audit } = await w.db.from("audit_log").select("action, reason").eq("event_id", w.eventId).eq("action", "event_reset");
  expect(audit).toEqual([{ action: "event_reset", reason: "Practice results were shown by mistake" }]);

  // Restore, as a platform owner in /admin
  const owner = await createOrganiser({ platformAdmin: "owner" });
  try {
    const page2 = await browser.newPage();
    await owner.signIn(page2, `/admin/organisations/${w.orgId}`);
    const restore = page2.getByTestId(`restore-${w.eventId}`);
    await expect(restore).toBeVisible();
    await restore.getByRole("button", { name: /^Restore results from/ }).click();
    await restore.getByRole("button", { name: "Yes, restore" }).click();
    await expect.poll(async () => ((await w.db.from("heat_results").select("id").eq("event_id", w.eventId)).data ?? []).length, { timeout: 30_000 }).toBe(1);
    await page2.close();
  } finally {
    await owner.cleanup();
  }
});

test("a practice event that never published is reset without a reason", async ({ page }) => {
  test.setTimeout(180_000);
  await w.db.from("heats").update({ status: "ended", started_at: new Date(Date.now() - 600_000).toISOString(), ended_at: new Date().toISOString() }).eq("id", w.heats[0]);
  await w.db.from("events").update({ settings: {} }).eq("id", w.eventId); // live scores off
  await w.org.signIn(page, `/org/events/${w.eventId}`);
  await page.getByTestId("reset-open").click();
  await expect(page.getByLabel("Reason (at least 5 characters)")).toHaveCount(0);
  await page.getByLabel("Event web address").fill(`e2e-live-${w.org.run}`);
  await page.getByTestId("reset-confirm").click();
  await expect(page.getByText(/Event reset: /).first()).toBeVisible({ timeout: 30_000 });
});
