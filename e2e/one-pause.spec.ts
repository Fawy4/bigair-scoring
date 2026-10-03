import type { Page } from "@playwright/test";
import { closePhones, expect, test } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";

/**
 * Polish 2b, item 1 — heat pause and simulator pause are ONE state. A simulation at ×10, the owner views it as head judge: Pause on the console stops the virtual
 * officials and the simulator panel says Paused; Resume from the simulator runs both again; then the other way round (Pause on the simulator, Resume on the console).
 */
async function removeSimulatorUsers(w: LiveWorld, eventIds: string[]) {
  for (const id of eventIds) {
    const { data } = await w.db.from("sim_seats").select("virtual_user").eq("event_id", id);
    for (const r of data ?? []) if (r.virtual_user) await w.db.auth.admin.deleteUser(r.virtual_user).catch(() => undefined);
  }
}

async function makeSimulation(page: Page, w: LiveWorld): Promise<string> {
  await w.org.signIn(page, `/org/events/${w.eventId}/simulate`);
  await page.getByTestId("run-as-simulation-button").click();
  await expect(page.getByTestId("clone-done")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("clone-open").click();
  await expect(page.getByTestId("sim-console")).toBeVisible({ timeout: 60_000 });
  return /events\/([0-9a-f-]{36})\/simulate/.exec(page.url())![1];
}

test("pausing from the console or the simulator is one pause: the heat clock and the virtual officials stop together and resume together", async ({ page }) => {
  test.setTimeout(600_000);
  const w = await createLiveWorld();
  const simIds: string[] = [];
  try {
    const simId = await makeSimulation(page, w);
    simIds.push(simId);
    await expect(async () => {
      await page.getByTestId("sim-speed-10").click({ timeout: 5_000 });
      await expect(page.getByTestId("sim-speed-10")).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
    }).toPass({ timeout: 60_000 });
    await page.getByTestId("sim-start").click();
    await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "playing");

    const [head] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId("view-head-laptop").click()]);
    await head.waitForLoadState("domcontentloaded");
    await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "running", { timeout: 180_000 });

    // what the virtual officials have done so far: attempts and scores
    const activity = async () => {
      const a = await w.db.from("trick_attempts").select("id", { count: "exact", head: true }).eq("event_id", simId);
      const s = await w.db.from("trick_scores").select("id", { count: "exact", head: true }).eq("event_id", simId);
      return (a.count ?? 0) + (s.count ?? 0);
    };
    const quietFor = async (ms: number) => {
      await page.waitForTimeout(2_500); // a beat already on its way may still land
      const before = await activity();
      await page.waitForTimeout(ms);
      expect(await activity(), "no new attempt or score while paused").toBe(before);
    };
    const grows = async () => {
      const before = await activity();
      await expect.poll(activity, { timeout: 60_000 }).toBeGreaterThan(before);
    };
    const bothSay = async (heatState: "paused" | "running", simState: "paused" | "playing") => {
      await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", simState, { timeout: 5_000 });
      // the console hears of a change by realtime (under a second on the live address); where websockets are blocked, as in this sandbox, it asks every 5 s instead
      await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", heatState, { timeout: 12_000 });
    };

    // a pause is pressed on a heat with time left (at ×10 a heat is short; one that is about to end is ended by the clock, not paused)
    const roomToPause = async () => {
      await expect
        .poll(
          async () => {
            const h = (await w.db.from("heats").select("status, started_at, duration_sec, paused_total_sec").eq("event_id", simId).eq("status", "running").maybeSingle()).data;
            if (!h?.started_at) return 0;
            return h.duration_sec - ((Date.now() - Date.parse(h.started_at)) / 1000 - h.paused_total_sec);
          },
          { timeout: 180_000, intervals: [500] },
        )
        .toBeGreaterThan(25);
    };

    // 1. Pause on the console → the simulator panel says Paused and nothing new arrives for 10 seconds
    await roomToPause();
    await head.getByTestId("pause").click();
    await bothSay("paused", "paused");
    await quietFor(10_000);
    // Resume from the simulator → both run again
    await page.getByTestId("sim-start").click();
    await bothSay("running", "playing");
    await grows();

    // 2. the other way round: Pause on the simulator, Resume on the console
    await roomToPause();
    await page.getByTestId("sim-pause").click();
    await bothSay("paused", "paused");
    await quietFor(10_000);
    await head.getByTestId("resume").click();
    await bothSay("running", "playing");
    await grows();
    await page.getByTestId("sim-stop").click();
  } finally {
    await removeSimulatorUsers(w, simIds);
    await w.cleanup();
  }
});
