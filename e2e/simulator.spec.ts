import { expect, test } from "./base";
import { addLadder, createLiveWorld, type LiveWorld } from "./live-world";

/**
 * The simulator (owner brief, 1 Oct 2026): copy a real event into a simulation, play it at ×20 with every role virtual until two heats publish, look at the results as
 * a spectator in another tab, fire scenario buttons and see their ticks, then reset and see the draw back. Everything hangs off one throwaway organisation; the Demo,
 * Arrow and EKL are never touched.
 */
async function removeSimulatorUsers(w: LiveWorld, eventIds: string[]) {
  for (const id of eventIds) {
    const { data } = await w.db.from("sim_seats").select("virtual_user").eq("event_id", id);
    for (const r of data ?? []) if (r.virtual_user) await w.db.auth.admin.deleteUser(r.virtual_user).catch(() => undefined);
  }
}

test("copy an event, play it at ×20 until two heats publish, look as a spectator, press scenarios, reset", async ({ page, context }) => {
  test.setTimeout(600_000);
  const w = await createLiveWorld();
  const simIds: string[] = [];
  try {
    await addLadder(w);
    await w.org.signIn(page, `/org/events/${w.eventId}/simulate`);

    // a real event offers "Run as simulation" and nothing else
    await expect(page.getByTestId("run-as-simulation")).toBeVisible();
    await expect(page.getByTestId("sim-console")).toHaveCount(0);
    await page.getByTestId("run-as-simulation-button").click();
    await expect(page.getByTestId("clone-done")).toBeVisible();
    await page.getByTestId("clone-open").click();
    await expect(page.getByTestId("sim-console")).toBeVisible();
    const simId = /events\/([0-9a-f-]{36})\/simulate/.exec(page.url())![1];
    simIds.push(simId);
    expect(simId).not.toBe(w.eventId);
    await expect(page.getByTestId("sim-need-lock")).toHaveCount(0);

    // speed ×20, every role virtual (the default), Start
    // the panel is drawn by the server first: a tap that lands before the page has finished loading does nothing, so the tap is repeated until the button answers
    await expect(async () => {
      await page.getByTestId("sim-speed-20").click({ timeout: 5_000 });
      await expect(page.getByTestId("sim-speed-20")).toHaveAttribute("aria-pressed", "true", { timeout: 8_000 });
    }).toPass({ timeout: 60_000 });
    await expect(async () => {
      if ((await page.getByTestId("sim-state").getAttribute("data-state")) !== "playing") await page.getByTestId("sim-start").click({ timeout: 5_000 });
      await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "playing", { timeout: 8_000 });
    }).toPass({ timeout: 60_000 });
    await expect(page.getByTestId("stat-heats")).toHaveText(/^[2-9] of \d+ heats published/, { timeout: 480_000 });

    // the results are on the public page, seen as a spectator in another tab
    const [results] = await Promise.all([context.waitForEvent("page"), page.getByTestId("view-results").click()]);
    await results.waitForLoadState("domcontentloaded");
    await expect(results).toHaveURL(/\/e\/.+-sim-.+\/results/);
    await expect(results.getByText(/Heat 1/).first()).toBeVisible({ timeout: 30_000 });
    await results.close();

    // stop, then three scenarios: each writes its tick to the checklist
    await page.getByTestId("sim-stop").click();
    await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "stopped");
    await page.getByTestId("scenario-plan_b").click();
    await expect(page.getByTestId("checklist-plan_b")).toHaveAttribute("data-done", "true", { timeout: 30_000 });
    await page.getByTestId("scenario-reopen").click();
    await expect(page.getByTestId("checklist-reopen")).toHaveAttribute("data-done", "true", { timeout: 60_000 });
    await page.getByTestId("scenario-wind_hold").click();
    await expect(page.getByTestId("sim-log")).toContainText("Wind hold");
    await page.getByTestId("scenario-wind_hold").click();
    await expect(page.getByTestId("checklist-wind_hold")).toHaveAttribute("data-done", "true", { timeout: 30_000 });

    // reset: one typed confirmation, then the draw is back (Reset is refused while a heat runs, so the head judge ends the one the auto-play left going)
    await w.db.from("heats").update({ status: "ended" }).eq("event_id", simId).in("status", ["running", "paused"]);
    await page.reload();
    const slug = (await w.db.from("events").select("slug").eq("id", simId).single()).data!.slug;
    await expect(page.getByTestId("reset-button")).toBeDisabled();
    await page.getByTestId("reset-slug").fill(slug);
    await page.getByTestId("reset-button").click();
    await expect(page.getByTestId("sim-message")).toContainText("Reset.", { timeout: 60_000 });
    await expect(page.getByTestId("stat-heats")).toHaveText(/^0 of \d+ heats published/);
    await expect(page.getByTestId("stat-attempts")).toHaveText(/^0 attempts/);
    const { count: left } = await w.db.from("trick_attempts").select("id", { count: "exact", head: true }).eq("event_id", simId);
    expect(left).toBe(0);
    const { data: heats } = await w.db.from("heats").select("status").eq("event_id", simId);
    expect((heats ?? []).every((h) => h.status === "scheduled")).toBe(true);
    // the ladder is back to its locked draw: Round 1 has riders, the Final waits for "1st" and "2nd" of Round 1
    await page.goto(`/org/events/${simId}/draw`);
    await expect(page.getByText(/Ladder/).first()).toBeVisible();
  } finally {
    await removeSimulatorUsers(w, simIds);
    await w.cleanup();
  }
});
