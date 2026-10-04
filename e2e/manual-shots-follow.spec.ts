import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./base";
import { createPublicWorld, type PublicWorld } from "./public-world";

/**
 * The manual's pictures of "Big screen — Follow the heat" (docs/manual/img/follow-*), retaken with `npm run manual:shots` (the same command as every other picture).
 * A throwaway organisation with a Knockout ladder and a Pro Men heat on the water; Arrow, EKL and Demo are never touched. Runs only when MANUAL_SHOTS=1.
 * The screen is drawn in vw, so a 1280 × 720 window looks exactly like a 1920 × 1080 TV, only smaller.
 */
test.skip(process.env.MANUAL_SHOTS !== "1", "set MANUAL_SHOTS=1 (npm run manual:shots) to retake the manual's pictures");
const OUT = path.join(process.cwd(), "docs", "manual", "img");
const TV = { width: 1280, height: 720 };
let w: PublicWorld;
const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();

async function shot(page: Page, name: string, settle = 1200) {
  await page.waitForTimeout(settle);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);
  await page.screenshot({ path: path.join(OUT, `${name}-1280.png`) });
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  w = await createPublicWorld({ settings: { followRotateSec: 15, flags: { enabled: true } } });
  // Pro Men heat 1 is not part of the walk; heat 2 is on the water with its scores logged
  await w.db.from("heats").update({ status: "scheduled", started_at: null, ended_at: null, published_at: null }).eq("id", w.heats[0]);
  await w.db.from("heats").update({ publish_hold: true }).eq("id", w.reseedLadder.heats["R1-H1"]);
  // the Knockout's first heat: a fuller result, five attempts a rider
  const rows = (await w.db.from("heat_results").select("id, total, breakdown").eq("heat_id", w.ladder.heats["R1-H1"])).data ?? [];
  const tricks: Array<[string, number | null, boolean]> = [["Backroll", 7.5, true], ["Frontroll", 6, true], ["Kiteloop", 4.5, false], ["Megaloop", null, false], ["Handlepass", 5.5, true]];
  for (const [i, r] of rows.entries()) {
    const bd = r.breakdown as Record<string, unknown>;
    const all = tricks.slice(0, 5 - i).map(([name, score, counted], n) => ({ seq: n + 1, status: score === null ? "crashed" : "landed", trickName: name, categoryKey: null, score, counted, repeatIndex: 0, priorCrashesSameTrick: 0, panel: score === null ? null : { score, unrounded: score, judgeScores: [], incomplete: false, missing: [], missedBy: [], outlier: false } }));
    await w.db.from("heat_results").update({ breakdown: { ...bd, allAttempts: all } as never }).eq("id", r.id);
  }
});
test.afterAll(async () => {
  await w?.cleanup();
});

test("the pictures of Follow the heat", async ({ page }) => {
  test.setTimeout(240_000);
  const follow = `/screen/${w.slug}/follow`;
  const [, h2] = w.heats;
  await page.setViewportSize(TV);
  // live: heat 2 on the water, the flag frame, riders with Lycra colours and live totals
  await w.db.from("heats").update({ status: "running", started_at: ago(75), ended_at: null }).eq("id", h2);
  await page.goto(follow);
  await expect(page.getByTestId("follow-live-page")).toBeVisible({ timeout: 60_000 });
  await shot(page, "follow-live");
  // reviewing: the head judge pressed End heat
  await w.db.from("heats").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", h2);
  await expect(page.getByTestId("follow-reviewing")).toBeVisible({ timeout: 10_000 });
  await shot(page, "follow-reviewing");
  // back to the rotation: heat 2 is not published, so the newest published heat is the Knockout's first
  await w.db.from("heats").update({ status: "scheduled", started_at: null, ended_at: null }).eq("id", h2);
  await expect(page.getByTestId("follow-results-page")).toBeVisible({ timeout: 10_000 });
  await shot(page, "follow-results");
  await expect(page.getByTestId("follow-ladder-page")).toBeVisible({ timeout: 25_000 });
  await shot(page, "follow-ladder", 400);
  // Day and Dark, on the results page (key D flips them)
  await page.keyboard.press("Space"); // hold the page still for the pictures
  await page.keyboard.press("d");
  await expect(page.getByTestId("big-screen")).toHaveAttribute("data-mode", "day");
  await shot(page, "follow-day", 400);
  await page.keyboard.press("d");
  await expect(page.getByTestId("big-screen")).toHaveAttribute("data-mode", "dark");
  await shot(page, "follow-dark", 400);

  // the Event step: the new setting beside the existing one, with its "?" open
  await w.org.signIn(page, `/org/events/${w.eventId}/event`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByTestId("advanced-toggle").click();
  await page.getByRole("button", { name: /About “Follow the heat/ }).click();
  const group = page.locator("section", { has: page.getByLabel("Follow the heat — seconds per page", { exact: true }) }).first();
  await group.scrollIntoViewIfNeeded();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; } [data-testid=note-button] { display: none !important; }" }).catch(() => undefined);
  await group.screenshot({ path: path.join(OUT, "follow-event-setting-1280.png") });

  // Go live: the shortcut beside Big screen
  await page.goto(`/org/events/${w.eventId}`);
  await expect(page.getByTestId("follow-screen-link")).toBeVisible({ timeout: 30_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; } [data-testid=note-button] { display: none !important; }" }).catch(() => undefined);
  await page.getByTestId("follow-screen-link").locator("xpath=..").screenshot({ path: path.join(OUT, "follow-go-live-shortcut-1280.png") });
});
