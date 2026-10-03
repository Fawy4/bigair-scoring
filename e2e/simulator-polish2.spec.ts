import { expect, test } from "./base";
import { addLadder, createLiveWorld, type LiveWorld } from "./live-world";
import type { Page } from "@playwright/test";

/**
 * Polish 2 on the simulator, each test on its own throwaway organisation (the Demo, Arrow and EKL are never touched):
 *   item 2 — View as Judge, then back to virtual (closing the tab, or "Give back"), leaves the simulator scoring; the panel shows who holds each seat.
 *   item 3 — the simulator's Pause pauses the heat on the console ("Paused by the simulator"); Resume resumes both; Stop leaves the heat paused.
 *   item 7 — "Skip to end of heat" ends the heat now and the virtual head judge publishes it; "Run the whole event" plays both days' run orders until the
 *            final is published.
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
    await page.getByTestId(`sim-speed-${speed}`).click({ timeout: 5_000 });
    await expect(page.getByTestId(`sim-speed-${speed}`)).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  await expect(async () => {
    if ((await page.getByTestId("sim-state").getAttribute("data-state")) !== "playing") await page.getByTestId("sim-start").click({ timeout: 5_000 });
    await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "playing", { timeout: 10_000 });
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

test("item 7: Skip to end of heat fast-forwards the virtual officials and leaves the heat running; End heat and publish ends and publishes it", async ({ page }) => {
  test.setTimeout(600_000);
  const w = await createLiveWorld();
  const simIds: string[] = [];
  try {
    const simId = await makeSimulation(page, w);
    simIds.push(simId);
    // nothing on the water yet: both buttons are off and say why
    await expect(page.getByTestId("sim-skip-end")).toBeDisabled();
    await expect(page.getByTestId("sim-end-publish")).toBeDisabled();
    await expect(page.getByTestId("sim-skip-why")).toHaveText("Available while a heat is running.");
    await expect(page.getByTestId("sim-end-why")).toHaveText("Available while a heat is running, paused or waiting to be published.");
    await startAt(page, 1); // ×1: ten minutes a heat, so only the buttons can finish it in time
    const live = async () => (await w.db.from("heats").select("id, status").eq("event_id", simId).in("status", ["running", "paused"]).maybeSingle()).data;
    await expect.poll(async () => (await live())?.status, { timeout: 120_000 }).toBe("running");
    const heatId = (await live())!.id as string;
    const attempts = async () => (await w.db.from("trick_attempts").select("id", { count: "exact", head: true }).eq("heat_id", heatId)).count ?? 0;
    await expect.poll(attempts, { timeout: 120_000 }).toBeGreaterThan(0);
    const before = await attempts();
    // Skip to end of heat: every rider's attempts are logged and every attempt scored by every virtual judge, and the heat is still running
    await page.getByTestId("sim-skip-end").click();
    await expect(page.getByTestId("sim-log")).toContainText("Skipped to the end of", { timeout: 120_000 });
    expect(await attempts()).toBeGreaterThan(before);
    const slots = (await w.db.from("heat_slots").select("entry_id").eq("heat_id", heatId)).data ?? [];
    const perRider = new Map<string, number>();
    for (const a of (await w.db.from("trick_attempts").select("entry_id").eq("heat_id", heatId)).data ?? []) perRider.set(a.entry_id, (perRider.get(a.entry_id) ?? 0) + 1);
    for (const sl of slots) expect(perRider.get(sl.entry_id as string) ?? 0, "every rider has all attempts logged").toBeGreaterThanOrEqual(3);
    const ids = ((await w.db.from("trick_attempts").select("id").eq("heat_id", heatId)).data ?? []).map((x) => x.id);
    const scores = (await w.db.from("trick_scores").select("attempt_id").in("attempt_id", ids)).data ?? [];
    expect(scores.length, "every attempt scored by the three virtual judges").toBeGreaterThanOrEqual(ids.length * 3 - 3);
    expect((await w.db.from("heats").select("status").eq("id", heatId).single()).data!.status, "the heat is still running: it waits for End heat").toBe("running");
    expect(((await w.db.from("judge_sheets").select("submitted_at").eq("heat_id", heatId)).data ?? []).filter((x) => x.submitted_at)).toHaveLength(0);
    // End heat and publish: the heat ends, the virtual judges finish and submit, the virtual head judge publishes
    await page.getByTestId("sim-end-publish").click();
    await expect.poll(async () => (await w.db.from("heats").select("status").eq("id", heatId).single()).data!.status, { timeout: 120_000 }).toBe("published");
    const sheets = (await w.db.from("judge_sheets").select("submitted_at").eq("heat_id", heatId)).data ?? [];
    expect(sheets.filter((x) => x.submitted_at)).toHaveLength(3);
    expect((await w.db.from("audit_log").select("id").eq("row_id", heatId).eq("action", "publish_override")).data ?? []).toHaveLength(0);
    await page.getByTestId("sim-stop").click();
  } finally {
    await removeSimulatorUsers(w, simIds);
    await w.cleanup();
  }
});

test("item 7: Run the whole event plays Saturday's and Sunday's run orders, every division and round, until the final is published", async ({ page }) => {
  test.setTimeout(1_200_000);
  const w = await createLiveWorld();
  const simIds: string[] = [];
  try {
    const ladder = await addLadder(w);
    // the ladder runs on the next day, in its own run order
    const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date(Date.now() + 86_400_000));
    await w.db.from("events").update({ end_date: tomorrow }).eq("id", w.eventId);
    await w.db.from("schedule_plans").insert({ event_id: w.eventId, day: tomorrow, name: "Sunday", active: true, items: Object.values(ladder.heats).map((id, i) => ({ id: `s${i}`, kind: "heat", heatId: id })) as never, anchors: {} as never });
    const simId = await makeSimulation(page, w);
    simIds.push(simId);
    const total = (await w.db.from("heats").select("id", { count: "exact", head: true }).eq("event_id", simId)).count ?? 0;
    expect(total).toBe(5);
    await expect(async () => {
      await page.getByTestId("sim-speed-20").click();
      await expect(page.getByTestId("sim-speed-20")).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
    await page.getByTestId("sim-whole-event").click();
    await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "playing", { timeout: 30_000 });
    await expect(page.getByTestId("sim-whole-on")).toBeVisible();
    await expect(page.getByTestId("stat-heats")).toHaveText(new RegExp(`^${total} of ${total} heats published`), { timeout: 1_080_000 });
    await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "stopped", { timeout: 60_000 });
    await expect(page.getByTestId("sim-log")).toContainText("The whole event is published");
    // the final has the winners of the two ladder heats
    const final = (await w.db.from("heats").select("id, status").eq("event_id", simId).eq("division_id", (await w.db.from("divisions").select("id").eq("event_id", simId).eq("name", "Ladder").single()).data!.id).order("created_at")).data ?? [];
    expect(final.every((h) => h.status === "published")).toBe(true);
  } finally {
    await removeSimulatorUsers(w, simIds);
    await w.cleanup();
  }
});
