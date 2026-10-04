import path from "node:path";
import { expect, test } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";

/**
 * Polish 3's two manual pictures, retaken with `npm run manual:shots`: the Event step with its cards folded (org-event-folded-1280.png) and the Join tab on a phone with
 * registration closed (public-join-closed-390.png). A throwaway organisation; Arrow, EKL and Demo are never touched. Runs only when MANUAL_SHOTS=1.
 */
test.skip(process.env.MANUAL_SHOTS !== "1", "set MANUAL_SHOTS=1 (npm run manual:shots) to retake the manual's pictures");
test.use({ foldCardsOpen: false });
const OUT = path.join(process.cwd(), "docs", "manual", "img");

let w: LiveWorld;
test.beforeAll(async () => {
  test.setTimeout(240_000);
  w = await createLiveWorld();
});
test.afterAll(async () => {
  await w?.cleanup();
});

test("the Event step with its cards folded", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await w.org.signIn(page, `/org/events/${w.eventId}/event`);
  await expect(page.getByTestId("event-panel")).toBeVisible({ timeout: 60_000 });
  await expect(async () => {
    if (!(await page.getByTestId("fold-slug").isVisible())) await page.getByTestId("advanced-toggle").click({ timeout: 3000 });
    await expect(page.getByTestId("fold-slug")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);
  await page.getByTestId("fold-slug").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "org-event-folded-1280.png") });
});

test("the Join tab on a phone with registration closed", async ({ page }) => {
  test.setTimeout(240_000);
  await w.db.from("events").update({ status: "published" }).eq("id", w.eventId);
  await page.setViewportSize({ width: 390, height: 1100 });
  await page.goto(`/e/e2e-live-${w.org.run}/join`);
  await expect(page.getByTestId("join-registration-closed")).toBeVisible({ timeout: 60_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);
  await page.screenshot({ path: path.join(OUT, "public-join-closed-390.png"), fullPage: true });
});
