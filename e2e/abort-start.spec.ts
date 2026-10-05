import type { Page } from "@playwright/test";
import { expect, test } from "./base";
import { createLiveWorld } from "./live-world";

/**
 * Polish 4: Abort during the yellow must stay aborted. On a simulation with auto-play playing, the simulator used to arm the same heat again at its next step
 * ("Abort acts like a reset"); a person's Abort now makes the simulator leave that heat alone (the simulator keeps playing; the head judge starts the heat when ready). A real event never re-arms.
 */
test("a simulation's auto-play does not start the sequence again after the head judge presses Abort", async ({ page }) => {
  test.setTimeout(300_000);
  const w = await createLiveWorld({ flags: true });
  const simIds: string[] = [];
  try {
    await w.db.from("events").update({ settings: { ...(((await w.db.from("events").select("settings").eq("id", w.eventId).single()).data?.settings ?? {}) as object), flags: { enabled: true, prestartSec: 120, lastMinuteSec: 60 } } as never }).eq("id", w.eventId);
    await w.org.signIn(page, `/org/events/${w.eventId}/simulate`);
    await page.getByTestId("run-as-simulation-button").click();
    await expect(page.getByTestId("clone-done")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("clone-open").click();
    await expect(page.getByTestId("sim-console")).toBeVisible({ timeout: 60_000 });
    const simId = /events\/([0-9a-f-]{36})\/simulate/.exec(page.url())![1];
    simIds.push(simId);
    await expect(async () => {
      await page.getByTestId("sim-speed-1").click({ timeout: 5_000 });
      await expect(page.getByTestId("sim-speed-1")).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
    }).toPass({ timeout: 60_000 });
    const [head] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId("view-head-laptop").click()]);
    await head.waitForLoadState("domcontentloaded");
    await page.getByTestId("sim-start").click();
    await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "playing");
    const armed = async () => (await w.db.from("heats").select("id, status, armed_at, started_at").eq("event_id", simId).not("armed_at", "is", null)).data ?? [];
    await expect.poll(async () => (await armed()).length, { timeout: 120_000 }).toBe(1);

    await expect(head.getByTestId("abort-start")).toBeVisible({ timeout: 60_000 });
    await head.getByTestId("abort-start").click();
    await expect.poll(async () => (await armed()).length, { timeout: 20_000 }).toBe(0);
    // however long the simulator's step takes, nothing arms or starts again by itself
    await head.waitForTimeout(40_000);
    expect(await armed()).toEqual([]);
    const started = (await w.db.from("heats").select("id").eq("event_id", simId).not("started_at", "is", null)).data ?? [];
    expect(started).toEqual([]);
    await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "playing"); // Abort only aborts the start sequence: the simulator keeps playing
    await expect(head.getByTestId("start")).toBeEnabled();
  } finally {
    for (const id of simIds) {
      const { data } = await w.db.from("sim_seats").select("virtual_user").eq("event_id", id);
      for (const r of data ?? []) if (r.virtual_user) await w.db.auth.admin.deleteUser(r.virtual_user).catch(() => undefined);
    }
    await w.cleanup();
  }
});
