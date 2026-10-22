import { test, expect, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import { endedHeat, eventSettings, laptop, phone as openPhone } from "./heat-end-helpers";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// HE1: the judge's Done button, its strip, the Impression step and the head judge's review bar use the name the EVENT gives the separate score. Arrow's scoring calls it
// Variety; an event that says "Impression" (Event step, "Name of the impression score") must read Impression everywhere, and any other name must too.
let w: LiveWorld;
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld({ headScores: false });
});
test.afterEach(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});
const phone = (browser: Browser, key: Parameters<LiveWorld["signInAs"]>[1], path: string, size?: { width: number; height: number }): Promise<Page> => openPhone(w, contexts, browser, key, path, size);

for (const name of ["Impression", "Flow"]) {
  test(`an event whose score is named "${name}": the Done button, the strip, the step and the review bar say ${name}, never Variety`, async ({ browser }) => {
    test.setTimeout(400_000);
    const H = w.heats[0];
    await eventSettings(w, { impressionName: name });
    await endedHeat(w, H);
    const j1 = await phone(browser, "j1", `/judge/${w.eventId}`);
    await expect(j1.getByTestId("heat-ended-strip")).toBeVisible({ timeout: 60_000 });
    await expect(j1.getByTestId("done-impression")).toHaveText(`Done — ${name}`, { timeout: 40_000 });
    await expect(j1.getByTestId("done-impression")).toHaveAttribute("aria-label", new RegExp(name));
    await j1.getByTestId("done-impression").click();
    await expect(j1.getByTestId("impression-card")).toBeVisible();
    await expect(j1.getByTestId("heat-ended-strip")).toContainText(name);
    await expect(j1.locator("body")).not.toContainText("Variety");
    const head = await phone(browser, "head", `/head/${w.eventId}`, laptop);
    await head.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });
    await expect(head.getByTestId("review-bar")).toContainText(`${name} score`, { timeout: 60_000 });
    await expect(head.getByTestId("review-bar")).not.toContainText("Variety");
  });
}
