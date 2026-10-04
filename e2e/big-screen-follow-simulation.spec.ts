import type { Page } from "@playwright/test";
import { expect, test } from "./base";
import { addLadder, createLiveWorld, type LiveWorld } from "./live-world";

/**
 * "Big screen — Follow the heat" watching a real simulation at ×20, as its own organiser (the preview of a simulation is for its organiser only). The organiser also holds
 * the head judge's seat, so the virtual head judge waits for them: each heat shows live from the yellow until it ends, "Judges reviewing" until Publish is pressed on the
 * console, then the walk. Three heats are published; then the simulation is paused and the walk is read back: newest heat first, then each earlier one, then the newest again.
 * A visitor gets "not found" for the simulation's address. Throwaway organisation; Arrow, EKL and Demo are never touched.
 */
test.use({ viewport: { width: 1920, height: 1080 } });

async function removeSimulatorUsers(w: LiveWorld, eventIds: string[]) {
  for (const id of eventIds) {
    const { data } = await w.db.from("sim_seats").select("virtual_user").eq("event_id", id);
    for (const r of data ?? []) if (r.virtual_user) await w.db.auth.admin.deleteUser(r.virtual_user).catch(() => undefined);
  }
}

async function record(page: Page) {
  await page.addInitScript(() => {
    const seen: Array<{ k: string; t: number }> = [];
    (window as unknown as { __seen: typeof seen }).__seen = seen;
    setInterval(() => {
      const s = document.querySelector('[data-testid="follow-screen"]');
      if (!s) return;
      const p = document.querySelector('[data-testid="follow-results-page"],[data-testid="follow-ladder-page"],[data-testid="follow-live-page"],[data-testid="follow-reviewing-page"]');
      const k = `${s.getAttribute("data-phase")}|${p?.getAttribute("data-testid")?.replace("follow-", "").replace("-page", "") ?? "none"}|${p?.getAttribute("data-heat") ?? p?.getAttribute("data-division") ?? ""}`;
      if (!seen.length || seen[seen.length - 1].k !== k) seen.push({ k, t: Date.now() });
    }, 50);
  });
}
const seenOf = (page: Page) => page.evaluate(() => (window as unknown as { __seen: Array<{ k: string; t: number }> }).__seen);

test("simulation at ×20: live from the yellow, 'Judges reviewing' until Publish, three heats walk back newest first and wrap; a visitor gets not found", async ({ page, context, browser }) => {
  test.setTimeout(900_000);
  const w = await createLiveWorld({ flags: true });
  const simIds: string[] = [];
  try {
    await addLadder(w);
    await w.org.signIn(page, `/org/events/${w.eventId}/simulate`);
    await page.getByTestId("run-as-simulation-button").click();
    await expect(page.getByTestId("clone-done")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("clone-open").click();
    await expect(page.getByTestId("sim-console")).toBeVisible({ timeout: 60_000 });
    const simId = /events\/([0-9a-f-]{36})\/simulate/.exec(page.url())![1];
    simIds.push(simId);
    const sim = (await w.db.from("events").select("slug, settings").eq("id", simId).single()).data!;
    await w.db.from("events").update({ settings: { ...(sim.settings as object), followRotateSec: 5 } as never }).eq("id", simId);
    const slug = sim.slug as string;

    // a visitor (nobody signed in) is told there is no such event
    const visitor = await browser.newContext();
    expect((await visitor.request.get(`/screen/${slug}/follow`)).status()).toBe(404);
    expect((await visitor.request.get(`/screen/${slug}/follow/data`)).status()).toBe(404);
    await visitor.close();

    await expect(async () => {
      await page.getByTestId("sim-speed-20").click({ timeout: 5_000 });
      await expect(page.getByTestId("sim-speed-20")).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
    }).toPass({ timeout: 60_000 });
    // the organiser takes the head judge's seat (the virtual head judge then waits for them) and opens the screen through "View as"
    const [head] = await Promise.all([context.waitForEvent("page"), page.getByTestId("view-head-laptop").click()]);
    await head.waitForLoadState("domcontentloaded");
    const [tv] = await Promise.all([context.waitForEvent("page"), page.getByTestId("view-screen").click()]);
    await tv.waitForLoadState("domcontentloaded");
    await record(tv);
    await tv.goto(`/screen/${slug}/follow`);
    await expect(tv.getByTestId("follow-screen")).toBeVisible({ timeout: 60_000 });
    await expect(tv.getByRole("button", { name: /note|feedback/i })).toHaveCount(0);

    await page.getByTestId("sim-start").click();
    await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "playing");

    const published: string[] = [];
    for (let n = 1; n <= 3; n++) {
      // the yellow, the green: the live heat, no rotation
      await expect(tv.getByTestId("follow-screen")).toHaveAttribute("data-phase", "live", { timeout: 240_000 });
      await expect(tv.getByTestId("follow-live-page")).toBeVisible();
      // the heat ends by its clock: Judges reviewing, and it stays until Publish
      await expect(tv.getByTestId("follow-screen")).toHaveAttribute("data-phase", "reviewing", { timeout: 240_000 });
      await expect(tv.getByTestId("follow-reviewing")).toHaveText("Judges reviewing");
      const heatId = (await tv.getByTestId("follow-reviewing-page").getAttribute("data-heat"))!;
      if (n === 3) await page.getByTestId("sim-pause").click(); // nothing is armed after the third publish: the walk is read back in peace
      await tv.waitForTimeout(3_000);
      await expect(tv.getByTestId("follow-screen")).toHaveAttribute("data-phase", "reviewing");
      // Publish on the head console
      const row = head.locator(`[data-testid="order-row"][data-heat="${heatId}"]`);
      await row.waitFor({ state: "attached", timeout: 60_000 });
      if (!(await row.isVisible())) await head.getByTestId("other-divisions").locator("summary").click();
      await row.click();
      await expect(head.getByTestId("publish")).toBeEnabled({ timeout: 60_000 });
      await head.getByTestId("publish").click();
      await head.getByTestId("dialog-save").click();
      await expect(head.getByTestId("control-message")).toContainText(/ublished/, { timeout: 90_000 });
      published.push(heatId);
      await expect(tv.getByTestId("follow-screen")).toHaveAttribute("data-phase", "rotation", { timeout: 10_000 });
      await expect(tv.getByTestId("follow-results-page")).toHaveAttribute("data-heat", heatId);
    }

    // read the walk back: newest first, then each earlier heat, then the newest again
    const mark = (await seenOf(tv)).length;
    await expect.poll(async () => (await seenOf(tv)).length - mark, { timeout: 150_000, intervals: [1_000] }).toBeGreaterThanOrEqual(7);
    const results = (await seenOf(tv)).slice(mark - 1).map((s) => s.k.split("|")).filter((k) => k[1] === "results").map((k) => k[2]);
    const [h1, h2, h3] = published;
    expect(results.slice(0, 4)).toEqual([h3, h2, h1, h3]);
    // each Results page names its heat and when it was published
    await expect(tv.getByTestId("follow-title")).toContainText("published");
    await page.getByTestId("sim-stop").click();
  } finally {
    await removeSimulatorUsers(w, simIds);
    await w.cleanup();
  }
});
