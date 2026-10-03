import type { Page } from "@playwright/test";
import { expect, test } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";

/**
 * Every simulator speed, end to end, measured in REAL seconds: a heat of 10 minutes with a 1:00 pre-start and a 1:00 last minute at ×5, ×10 and ×20.
 * The pre-start, the heat clock, the last minute and the virtual officials' pace are all divided by the speed (×10: 6 s of pre-start, a 60 s heat, a 6 s last minute).
 * Throwaway organisation and a throwaway simulation of its event (removed by the ledger); Arrow, EKL and Demo are never touched.
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

for (const speed of [5, 10, 20] as const) {
  test(`speed ×${speed}: the pre-start, the heat clock, the last minute and the officials all run ${speed} times faster, in real seconds`, async ({ page }) => {
    test.setTimeout(540_000);
    const w = await createLiveWorld({ flags: true });
    const simIds: string[] = [];
    try {
      const simId = await makeSimulation(page, w);
      simIds.push(simId);
      await expect(async () => {
        await page.getByTestId(`sim-speed-${speed}`).click({ timeout: 5_000 });
        await expect(page.getByTestId(`sim-speed-${speed}`)).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
      }).toPass({ timeout: 60_000 });
      const [head] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId("view-head-laptop").click()]);
      await head.waitForLoadState("domcontentloaded");
      await page.getByTestId("sim-start").click();
      await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "playing");

      const first = async () => (await w.db.from("heats").select("id, status, armed_at, prestart_sec, started_at, ended_at, duration_sec, time_scale").eq("event_id", simId).not("armed_at", "is", null).limit(1)).data?.[0] ?? null;
      const byId = async (id: string) => (await w.db.from("heats").select("id, status, armed_at, prestart_sec, started_at, ended_at, duration_sec, time_scale").eq("id", id).single()).data!;

      // the yellow: the pre-start is a 1:00 pre-start divided by the speed
      let armed = null as Awaited<ReturnType<typeof first>>;
      await expect.poll(async () => (armed = await first()), { timeout: 120_000, intervals: [250] }).not.toBeNull();
      const wallArmed = Date.now();
      expect(armed!.time_scale).toBe(speed);
      expect(armed!.prestart_sec).toBe(Math.ceil(60 / speed));
      expect(armed!.duration_sec).toBe(Math.ceil(600 / speed));
      // the green comes by itself after that many REAL seconds
      await expect.poll(async () => (await byId(armed!.id)).status, { timeout: 60_000, intervals: [250] }).toBe("running");
      const wallRunning = Date.now();
      expect((wallRunning - wallArmed) / 1000, "real seconds of yellow").toBeLessThan(armed!.prestart_sec! + 8);
      const running = await byId(armed!.id);
      expect(Date.parse(running.started_at!) - Date.parse(armed!.armed_at!)).toBe(armed!.prestart_sec! * 1000);

      // the last minute starts when a minute / speed is left on the heat clock (the strip on the head console says so)
      const lastMinuteSec = 60 / speed;
      await expect(head.getByTestId("heat-timer").first()).toHaveAttribute("data-flag", /running|last_minute/, { timeout: 30_000 });
      await expect(head.getByTestId("heat-timer").first()).toHaveAttribute("data-flag", "last_minute", { timeout: running.duration_sec * 1000 });
      const [m, s] = (await head.getByTestId("heat-timer-clock").first().innerText()).trim().split(":").map(Number);
      expect(m * 60 + s, "seconds left when the last minute began").toBeLessThanOrEqual(Math.ceil(lastMinuteSec) + 2);

      // the heat ends after duration REAL seconds (the clock, then whoever writes the end down)
      await expect.poll(async () => (await byId(armed!.id)).ended_at, { timeout: running.duration_sec * 1000 + 30_000, intervals: [500] }).not.toBeNull();
      const done = await byId(armed!.id);
      const real = (Date.parse(done.ended_at!) - Date.parse(done.started_at!)) / 1000;
      expect(real, "real seconds the heat ran").toBeGreaterThanOrEqual(done.duration_sec - 1);
      expect(real, "real seconds the heat ran").toBeLessThanOrEqual(done.duration_sec + 10);

      // the virtual officials kept the same pace: attempts and scores arrived during those seconds, not over ten real minutes
      const attempts = (await w.db.from("trick_attempts").select("created_at").eq("heat_id", armed!.id).order("created_at")).data ?? [];
      expect(attempts.length).toBeGreaterThan(3);
      const offsets = attempts.map((a) => (Date.parse(a.created_at) - Date.parse(done.started_at!)) / 1000);
      expect(Math.min(...offsets)).toBeGreaterThanOrEqual(-1);
      expect(Math.max(...offsets), "the last attempt came in before the heat ended").toBeLessThanOrEqual(done.duration_sec + 3);
      const scores = await w.db.from("trick_scores").select("id", { count: "exact", head: true }).eq("heat_id", armed!.id);
      expect(scores.count ?? 0).toBeGreaterThan(0);
      await page.getByTestId("sim-stop").click();
    } finally {
      await removeSimulatorUsers(w, simIds);
      await w.cleanup();
    }
  });
}
