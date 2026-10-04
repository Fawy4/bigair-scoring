import { expect, test } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { Page } from "@playwright/test";

/** Polish 3 on the simulator, each test on its own throwaway organisation (the Demo, Arrow and EKL are never touched). */
async function removeSimulatorUsers(w: LiveWorld, eventIds: string[]) {
  for (const id of eventIds) {
    const { data } = await w.db.from("sim_seats").select("virtual_user").eq("event_id", id);
    for (const r of data ?? []) if (r.virtual_user) await w.db.auth.admin.deleteUser(r.virtual_user).catch(() => undefined);
  }
}

/** Speed, then Start. A click that lands before the panel is live is pressed again. */
async function startAt(page: Page, speed: 1 | 5 | 10 | 20) {
  await expect(async () => {
    await page.getByTestId(`sim-speed-${speed}`).click({ timeout: 5_000 });
    await expect(page.getByTestId(`sim-speed-${speed}`)).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  await expect(async () => {
    if ((await page.getByTestId("sim-state").getAttribute("data-state")) !== "playing") await page.getByTestId("sim-start").click({ timeout: 5_000 });
    await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "playing", { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
}

async function makeSimulation(page: Page, w: LiveWorld): Promise<string> {
  await w.org.signIn(page, `/org/events/${w.eventId}/simulate`);
  await page.getByTestId("run-as-simulation-button").click();
  await expect(page.getByTestId("clone-done")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("clone-open").click();
  await expect(page.getByTestId("sim-console")).toBeVisible({ timeout: 60_000 });
  return /events\/([0-9a-f-]{36})\/simulate/.exec(page.url())![1];
}

test("item 4: on the simulator page the left rail opens the step you click, and highlights it", async ({ page }) => {
  test.setTimeout(240_000);
  const w = await createLiveWorld();
  const simIds: string[] = [];
  try {
    const simId = await makeSimulation(page, w);
    simIds.push(simId);
    // the auto-play is running, as in real use: the panel keeps asking the server every second or two
    await startAt(page, 1);
    await expect(page.getByTestId("rail-golive")).toHaveAttribute("aria-current", "step");
    await page.getByTestId("rail-draw").click();
    await expect(page).toHaveURL(new RegExp(`/org/events/${simId}/draw`), { timeout: 15_000 });
    await expect(page.getByTestId("rail-draw")).toHaveAttribute("aria-current", "step");
    await expect(page.getByTestId("rail-golive")).not.toHaveAttribute("aria-current", "step");
  } finally {
    await removeSimulatorUsers(w, simIds);
    await w.cleanup();
  }
});
