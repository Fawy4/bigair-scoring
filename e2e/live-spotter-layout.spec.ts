import { test, expect } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";

// Phase 5b step 2: the layout the organiser saved in the Divisions step is what the spotter's phone shows (throwaway event, removed by the ledger).
let w: LiveWorld;
test.beforeEach(async () => {
  w = await createLiveWorld();
});
test.afterEach(async () => {
  await w?.cleanup();
});

test("the spotter screen shows the division's layout: a favourite on top, a moved block in its new family, the families in the saved order", async ({ page }) => {
  test.setTimeout(240_000);
  const { error } = await w.db
    .from("divisions")
    .update({
      trick_base: { disabled: [], layout: { families: ["direction", "multiplier", "base", "grab_landing", "addon"], moved: { "addon:tic_tac": "base" }, order: {}, favourites: ["base:megaloop"] } } as never,
    })
    .eq("id", w.divisionId);
  expect(error).toBeNull();

  await w.signInAs(page, "spotter", "/seat");
  await w.startHeat(w.heats[0]);
  await expect(page.getByTestId("trick-builder")).toBeVisible({ timeout: 30_000 });

  const baseIds = await page.getByTestId("base-list").locator("[data-block]").evaluateAll((els) => els.map((e) => e.getAttribute("data-block")));
  expect(baseIds[0]).toBe("base:megaloop");
  expect(baseIds).toContain("addon:tic_tac");

  const all = await page.getByTestId("trick-builder").locator("[data-block]").evaluateAll((els) => els.map((e) => e.getAttribute("data-block")));
  expect(all.indexOf("grab_landing:grab")).toBeGreaterThan(-1);
  expect(all.indexOf("grab_landing:grab")).toBeLessThan(all.indexOf("addon:board_off"));
});
