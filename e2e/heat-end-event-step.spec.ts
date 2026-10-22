import { test, expect } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";

// HE1: the Event step's "Start the next heat" sits in the Flags card with a one-line explanation, is "By hand" for every event (old and new), and is saved.
let w: LiveWorld;
test.beforeEach(async () => {
  w = await createLiveWorld({ headScores: false, flags: true });
});
test.afterEach(async () => {
  await w?.cleanup();
});

test("Event step: Start the next heat is by hand by default, has its one-line explanation next to the flag settings, and is saved", async ({ page }) => {
  test.setTimeout(240_000);
  // an event made before this setting existed has no such key
  const { data } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  expect((data!.settings as { startNextHeat?: string }).startNextHeat).toBeUndefined();
  await w.org.signIn(page, `/org/events/${w.eventId}/event`);
  await expect(page.getByTestId("event-panel")).toBeVisible({ timeout: 60_000 });
  if (!(await page.getByTestId("flags-card").isVisible())) await page.getByTestId("advanced-toggle").click();
  const card = page.getByTestId("flags-card");
  await expect(card).toBeVisible({ timeout: 15_000 });
  const group = card.getByTestId("start-next-heat");
  await expect(group).toContainText("By hand");
  await expect(group).toContainText("Automatically after Publish");
  await expect(group).toContainText("At its run order time");
  await expect(card.getByTestId("start-next-manual")).toBeChecked();
  await expect(card.getByTestId("start-next-line")).toHaveText(/^Who starts the next heat: the head judge by hand/);
  // next to the flag settings: after the last-minute length, in the same card
  const last = (await card.locator("#ev-lastminute").boundingBox())!;
  const mine = (await group.boundingBox())!;
  expect(mine.y).toBeGreaterThan(last.y);

  await card.getByTestId("start-next-after_publish").check();
  await page.getByRole("button", { name: "Save event" }).click();
  await expect.poll(async () => ((await w.db.from("events").select("settings").eq("id", w.eventId).single()).data?.settings as { startNextHeat?: string }).startNextHeat, { timeout: 30_000 }).toBe("after_publish");
  await page.reload();
  await expect(page.getByTestId("event-panel")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("start-next-after_publish")).toBeChecked({ timeout: 30_000 }); // the fold above stays open on this device
});
