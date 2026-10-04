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

test.describe("Follow the heat shows every trick's score as it lands (items 6, 7, 8)", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });
  test("simulation at ×20: one clock, a chip per trick with its score, no page counter; a chip reaches the TV within a few seconds of the public Live page", async ({ page, context }) => {
    test.setTimeout(600_000);
    const w = await createLiveWorld({ flags: true });
    const simIds: string[] = [];
    try {
      const simId = await makeSimulation(page, w);
      simIds.push(simId);
      const slug = (await w.db.from("events").select("slug").eq("id", simId).single()).data!.slug as string;
      // both pages count their score chips every 50 ms and keep the moment each count was first reached
      const counter = () => {
        const seen: Record<number, number> = {};
        (window as unknown as { __chips: Record<number, number> }).__chips = seen;
        setInterval(() => {
          const n = document.querySelectorAll('[data-testid="score-box"]').length;
          for (let k = 1; k <= n; k++) if (!(k in seen)) seen[k] = Date.now();
        }, 50);
      };
      // "View as → screen" gives this browser the organiser's preview of the simulation (a simulation is never public)
      const [tv] = await Promise.all([context.waitForEvent("page"), page.getByTestId("view-screen").click()]);
      await tv.waitForLoadState("domcontentloaded");
      await tv.addInitScript(counter);
      const pub = await context.newPage();
      await pub.addInitScript(counter);
      await tv.goto(`/screen/${slug}/follow`);
      await pub.goto(`/e/${slug}/live`);
      await startAt(page, 20);
      await expect(tv.getByTestId("follow-live-page")).toBeVisible({ timeout: 240_000 });
      // item 6: one clock. The big black "left" clock is gone; the flag pill with the time stays
      await expect(tv.getByTestId("heat-clock")).toHaveCount(0);
      await expect(tv.getByTestId("screen-flag-frame")).toBeVisible();
      // item 7: a chip per trick, with the total and the formula line, as the public Live tab
      await expect(tv.getByTestId("score-box").first()).toBeVisible({ timeout: 240_000 });
      await expect(tv.getByTestId("follow-formula").first()).toHaveText(/^[\d.]+ = tricks [\d.]+ \+ \w[\w \/]* [\d.]+/);
      await expect(tv.getByTestId("follow-total").first()).toBeVisible();
      await expect.poll(async () => tv.getByTestId("score-box").count(), { timeout: 120_000 }).toBeGreaterThan(2);
      // nothing is cut or scrolled: a heat that does not fit is split across pages, never shrunk
      for (let i = 0; i < 6; i++) {
        const overflow = await tv.getByTestId("follow-body").evaluate((e) => e.scrollHeight - e.clientHeight);
        expect(overflow, "the page body overflows").toBeLessThanOrEqual(1);
        await tv.waitForTimeout(700);
      }
      // item 8: no "page 1 of 2" anywhere
      await expect(tv.getByTestId("follow-part")).toHaveCount(0);
      expect(await tv.getByTestId("follow-body").innerText()).not.toMatch(/page \d+ of \d+/i);
      // the same chips as the public Live page, and each one reaches the TV within a few seconds of the public page
      await pub.reload();
      await expect.poll(async () => pub.getByTestId("score-box").count(), { timeout: 60_000 }).toBeGreaterThan(0);
      await page.waitForTimeout(4_000);
      const lag = await Promise.all([tv, pub].map((p) => p.evaluate(() => (window as unknown as { __chips: Record<number, number> }).__chips)));
      const common = Object.keys(lag[0]).filter((k) => k in lag[1]).map(Number);
      expect(common.length).toBeGreaterThan(0);
      // the public page only changes when its own poll fires; the TV asks twice a second. Both read the same shared answer, so the TV is never later than one cache interval (3 s) behind it.
      for (const k of common.slice(0, 4)) expect(lag[0][k] - lag[1][k], `chip ${k}: TV behind the public page by`).toBeLessThan(4_000);
      await page.getByTestId("sim-stop").click();
    } finally {
      await removeSimulatorUsers(w, simIds);
      await w.cleanup();
    }
  });
});

test("item 9: the simulator follows the real event's attempt limit after 'Refresh from event'", async ({ page }) => {
  test.setTimeout(480_000);
  const w = await createLiveWorld();
  const simIds: string[] = [];
  try {
    const simId = await makeSimulation(page, w);
    simIds.push(simId);
    const eventName = (await w.db.from("events").select("name").eq("id", w.eventId).single()).data!.name as string;
    await expect(page.getByTestId("sim-settings-line")).toHaveText(new RegExp(`^Settings from ${eventName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} at \\d\\d:\\d\\d$`));
    const limitOf = async (eventId: string) => {
      const d = (await w.db.from("divisions").select("scoring_overrides").eq("event_id", eventId)).data ?? [];
      return d.map((x) => (x.scoring_overrides as { heat?: { maxAttemptsPerRider?: number } } | null)?.heat?.maxAttemptsPerRider);
    };
    expect(await limitOf(simId)).toEqual([7]); // the copy has the limit the event had when it was copied
    // the limit is lowered on the real event; the simulation still has the old one until Refresh
    const div = (await w.db.from("divisions").select("id, scoring_overrides").eq("event_id", w.eventId).single()).data!;
    await w.db.from("divisions").update({ scoring_overrides: { ...(div.scoring_overrides as object), heat: { maxAttemptsPerRider: 3 } } as never }).eq("id", div.id);
    expect(await limitOf(simId)).toEqual([7]);
    await page.getByTestId("sim-refresh-settings").click();
    await expect(page.getByTestId("sim-message")).toContainText("Settings refreshed from", { timeout: 60_000 });
    expect(await limitOf(simId)).toEqual([3]);
    // the virtual spotters now stop at 3: play a heat and skip to its end
    await startAt(page, 1);
    const live = async () => (await w.db.from("heats").select("id, status").eq("event_id", simId).eq("status", "running").maybeSingle()).data;
    await expect.poll(async () => (await live())?.id, { timeout: 120_000 }).toBeTruthy();
    const heatId = (await live())!.id as string;
    await page.getByTestId("sim-skip-end").click();
    await expect(page.getByTestId("sim-log")).toContainText("Skipped to the end of", { timeout: 120_000 });
    const per = new Map<string, number>();
    for (const a of (await w.db.from("trick_attempts").select("entry_id").eq("heat_id", heatId)).data ?? []) per.set(a.entry_id, (per.get(a.entry_id) ?? 0) + 1);
    expect(per.size).toBeGreaterThan(0);
    for (const n of per.values()) expect(n, "every rider stops at the event's new limit").toBe(3);
    // once a heat has started the settings are kept, and the button says why
    await expect(page.getByTestId("sim-refresh-settings")).toBeDisabled();
    await expect(page.getByTestId("sim-refresh-why")).toBeVisible();
    await page.getByTestId("sim-stop").click();
  } finally {
    await removeSimulatorUsers(w, simIds);
    await w.cleanup();
  }
});

test("item 3: auto-play waits for the break — 4 min at ×10 with a 1-min pre-start: the yellow begins 18 s after the heat ended, not at once", async ({ page }) => {
  test.setTimeout(600_000);
  const w = await createLiveWorld({ flags: true });
  const simIds: string[] = [];
  try {
    await w.db.from("schedule_plans").update({ defaults: { breakAfterHeatMin: 4, breakAfterRoundMin: 4, readyCallMin: 0 } as never }).eq("id", w.planId);
    const simId = await makeSimulation(page, w);
    simIds.push(simId);
    await startAt(page, 10);
    const heats = async () => (await w.db.from("heats").select("id, status, ended_at, published_at, armed_at, started_at, number").eq("event_id", simId).order("number")).data ?? [];
    // heat 1 runs (1 minute at ×10), the virtual officials score it and the virtual head judge publishes it
    await expect.poll(async () => (await heats()).find((h) => h.number === 1)?.status, { timeout: 240_000 }).toBe("published");
    const first = (await heats()).find((h) => h.number === 1)!;
    // the break: nothing is armed at once
    await page.waitForTimeout(4_000);
    expect((await heats()).find((h) => h.number === 2)!.armed_at, "not armed at once").toBeNull();
    await expect(page.getByTestId("sim-line")).toContainText("Break:");
    await expect.poll(async () => (await heats()).find((h) => h.number === 2)?.armed_at ?? (await heats()).find((h) => h.number === 2)?.started_at, { timeout: 60_000 }).toBeTruthy();
    const second = (await heats()).find((h) => h.number === 2)!;
    const yellowAt = Date.parse((second.armed_at ?? second.started_at)!);
    const afterEnd = (yellowAt - Date.parse(first.ended_at!)) / 1000;
    const afterPublish = (yellowAt - Date.parse(first.published_at!)) / 1000;
    // 4 min / 10 = 24 s of break; the yellow (1 min / 10 = 6 s) ends at that start, so it begins 18 s after the heat ended (a tick is 2 s)
    expect(afterEnd, "the yellow begins about 18 s after the heat ended").toBeGreaterThanOrEqual(17);
    expect(afterEnd).toBeLessThanOrEqual(23);
    expect(afterPublish, "and not at once after the publish").toBeGreaterThan(8);
    await page.getByTestId("sim-stop").click();
  } finally {
    await removeSimulatorUsers(w, simIds);
    await w.cleanup();
  }
});
