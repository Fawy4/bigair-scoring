import { expect, test } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { Page } from "@playwright/test";

/**
 * Polish 2 on the simulator, each test on its own throwaway organisation (the Demo, Arrow and EKL are never touched):
 *   item 2 — View as Judge, then back to virtual (closing the tab, or "Give back"), leaves the simulator scoring; the panel shows who holds each seat.
 *   item 3 — the simulator's Pause pauses the heat on the console ("Paused by the simulator"); Resume resumes both; Stop leaves the heat paused.
 */
async function removeSimulatorUsers(w: LiveWorld, eventIds: string[]) {
  for (const id of eventIds) {
    const { data } = await w.db.from("sim_seats").select("virtual_user").eq("event_id", id);
    for (const r of data ?? []) if (r.virtual_user) await w.db.auth.admin.deleteUser(r.virtual_user).catch(() => undefined);
  }
}

/** Copies the throwaway event into a simulation from the panel and opens its panel. */
async function makeSimulation(page: Page, w: LiveWorld): Promise<string> {
  await w.org.signIn(page, `/org/events/${w.eventId}/simulate`);
  await page.getByTestId("run-as-simulation-button").click();
  await expect(page.getByTestId("clone-done")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("clone-open").click();
  await expect(page.getByTestId("sim-console")).toBeVisible({ timeout: 60_000 });
  return /events\/([0-9a-f-]{36})\/simulate/.exec(page.url())![1];
}

/** Speed, then Start. A click that lands before the panel is live is pressed again. */
async function startAt(page: Page, speed: 1 | 5 | 10 | 20) {
  await expect(async () => {
    await page.getByTestId(`sim-speed-${speed}`).click();
    await expect(page.getByTestId(`sim-speed-${speed}`)).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await expect(async () => {
    await page.getByTestId("sim-start").click();
    await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "playing", { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
}

const seatId = async (w: LiveWorld, simId: string, name: string) => (await w.db.from("judge_seats").select("id").eq("event_id", simId).eq("name", name).single()).data!.id as string;
const scoresBy = async (w: LiveWorld, simId: string, seat: string) => (await w.db.from("trick_scores").select("id", { count: "exact", head: true }).eq("event_id", simId).eq("judge_seat_id", seat)).count ?? 0;

test("item 2: View as Judge 1 takes the seat; closing the tab gives it back and the virtual judge scores again; Give back does the same at once", async ({ page, context }) => {
  test.setTimeout(600_000);
  const w = await createLiveWorld();
  const simIds: string[] = [];
  try {
    const simId = await makeSimulation(page, w);
    simIds.push(simId);
    const j1 = await seatId(w, simId, "Judge 1");
    await startAt(page, 5);
    // the simulator plays Judge 1, and says so
    await expect(page.getByTestId(`held-${j1}`)).toHaveAttribute("data-held", "simulator", { timeout: 60_000 });
    await expect.poll(() => scoresBy(w, simId, j1), { timeout: 120_000 }).toBeGreaterThan(0);

    // View as Judge 1: a new tab, the seat is "You (View as)" and the simulator steps aside
    const [judge] = await Promise.all([context.waitForEvent("page"), page.getByTestId(`view-seat-${j1}`).click()]);
    await judge.waitForLoadState("domcontentloaded");
    await expect(judge).toHaveURL(new RegExp(`/judge/${simId}`));
    await expect(page.getByTestId(`held-${j1}`)).toHaveAttribute("data-held", "you", { timeout: 30_000 });
    await expect(page.getByTestId(`held-${j1}`)).toContainText("You (View as)");
    await expect(page.getByTestId(`role-${j1}-release`)).toBeVisible();

    // close the tab: within seconds the simulator has the seat again and scores with it
    await judge.close({ runBeforeUnload: true });
    await expect(page.getByTestId(`held-${j1}`)).toHaveAttribute("data-held", "simulator", { timeout: 45_000 });
    await expect(page.getByTestId("sim-log")).toContainText("Judge 1: given back to the simulator");
    const before = await scoresBy(w, simId, j1);
    await expect.poll(() => scoresBy(w, simId, j1), { timeout: 180_000 }).toBeGreaterThan(before);

    // View as again, then "Give back to the simulator" on the panel: back at once, without closing the tab
    const [again] = await Promise.all([context.waitForEvent("page"), page.getByTestId(`view-seat-${j1}`).click()]);
    await again.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId(`held-${j1}`)).toHaveAttribute("data-held", "you", { timeout: 30_000 });
    await page.getByTestId(`role-${j1}-release`).click();
    await expect(page.getByTestId(`held-${j1}`)).toHaveAttribute("data-held", "simulator", { timeout: 30_000 });
    expect((await w.db.from("judge_seats").select("auth_user_id").eq("id", j1).single()).data!.auth_user_id).not.toBe((await w.db.from("sim_seats").select("viewed_by").eq("seat_id", j1).single()).data!.viewed_by ?? "none");
    await again.close();
    await page.getByTestId("sim-stop").click();
  } finally {
    await removeSimulatorUsers(w, simIds);
    await w.cleanup();
  }
});

test("item 3: simulator Pause pauses the heat clock on the console; Resume resumes both; Stop leaves the heat paused", async ({ page, context }) => {
  test.setTimeout(600_000);
  const w = await createLiveWorld();
  const simIds: string[] = [];
  try {
    const simId = await makeSimulation(page, w);
    simIds.push(simId);
    await startAt(page, 1);
    const heatRow = async () => (await w.db.from("heats").select("id, status, paused_reason").eq("event_id", simId).in("status", ["running", "paused"]).maybeSingle()).data;
    await expect.poll(async () => (await heatRow())?.status, { timeout: 120_000 }).toBe("running");
    const heatId = (await heatRow())!.id as string;

    // the console, in a second tab: the heat is running
    const head = await context.newPage();
    await head.goto(`/head/${simId}`);
    await head.locator(`[data-testid="order-row"][data-heat="${heatId}"]`).click({ timeout: 60_000 });
    await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "running", { timeout: 60_000 });

    // Pause on the panel: the heat clock stops on the console and it says who paused it
    await page.getByTestId("sim-pause").click();
    await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "paused");
    await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "paused", { timeout: 30_000 });
    await expect(head.getByTestId("paused-by")).toHaveText("Paused by the simulator");
    expect(await heatRow()).toMatchObject({ status: "paused", paused_reason: "simulator" });
    const frozen = await head.getByTestId("heat-timer-clock").textContent();
    await head.waitForTimeout(2500);
    expect(await head.getByTestId("heat-timer-clock").textContent()).toBe(frozen);

    // Resume (Start) on the panel: both run again
    await page.getByTestId("sim-start").click();
    await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "playing");
    await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "running", { timeout: 30_000 });
    await expect(head.getByTestId("paused-by")).toHaveCount(0);

    // Stop: auto-play ends and the heat is left paused, still saying so
    await page.getByTestId("sim-stop").click();
    await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "stopped");
    await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "paused", { timeout: 30_000 });
    await expect(head.getByTestId("paused-by")).toHaveText("Paused by the simulator");
    await head.close();
  } finally {
    await removeSimulatorUsers(w, simIds);
    await w.cleanup();
  }
});
