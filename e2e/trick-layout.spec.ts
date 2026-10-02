import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

// Phase 5b step 2: the spotter's layout per division, set in the Trick base panel of the Divisions step: order of the families, order of the blocks, blocks moved
// between Base trick, Add-ons and Grabs & landings, favourites on top; drag with a tap alternative (arrows and "Move to…"). Also the live-screen settings
// ("Show scores as % of maximum", off by default). On a throwaway organisation.
type Org = Awaited<ReturnType<typeof createOrganiser>>;
async function setup(org: Org) {
  const { data: ev } = await org.db.from("events").insert({ organisation_id: org.orgId, name: `Layout Cup ${org.run}`, slug: `e2e-layout-${org.run}`, status: "draft" }).select("id").single();
  const { data: model } = await org.db.from("scoring_models").select("id").is("organisation_id", null).eq("key", "legacy-kol-best3-variety").order("version", { ascending: false }).limit(1).single();
  const { data: div } = await org.db.from("divisions").insert({ event_id: ev!.id, name: "Pro Men", sort_order: 1, scoring_model_id: model!.id }).select("id").single();
  return { eventId: ev!.id, divisionId: div!.id };
}
const stored = async (org: Org, divisionId: string) => (await org.db.from("divisions").select("trick_base, live_settings").eq("id", divisionId).single()).data!;
const keys = (page: import("@playwright/test").Page, family: string) => page.getByTestId(`list-${family}`).locator("[data-testid^='block-row-']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("block-row-", "")));

test("Trick base layout: arrows, Move to…, favourites, family order and drag all change what the spotter will see; it is stored on the division and survives a reload", async ({ page }) => {
  test.setTimeout(240_000);
  const org = await createOrganiser();
  try {
    const { eventId, divisionId } = await setup(org);
    await page.setViewportSize({ width: 1400, height: 2600 }); // tall, so both ends of the mouse drag are on screen
    await org.signIn(page, `/org/events/${eventId}/divisions`);
    await page.getByRole("tab", { name: "Trick base" }).click();
    await expect(page.getByTestId("trick-base")).toBeVisible({ timeout: 40_000 });
    expect((await keys(page, "base")).slice(0, 3)).toEqual(["base:straight_jump", "base:backroll", "base:frontroll"]);

    // tap alternative: ↓ on Backroll
    await page.getByTestId("down-base:backroll").click();
    await expect.poll(async () => (await keys(page, "base")).slice(0, 3)).toEqual(["base:straight_jump", "base:frontroll", "base:backroll"]);
    await expect.poll(async () => ((await stored(org, divisionId)).trick_base as { layout?: { order?: { base?: string[] } } }).layout?.order?.base?.slice(0, 3)).toEqual(["base:straight_jump", "base:frontroll", "base:backroll"]);

    // a block moves to another family: Tic-tac from Add-ons to Base trick, last in the list
    await page.getByTestId("moveto-addon:tic_tac").selectOption("base");
    await expect.poll(async () => (await keys(page, "base")).at(-1)).toBe("addon:tic_tac");
    expect(await keys(page, "addon")).not.toContain("addon:tic_tac");
    // Direction and Multiplier blocks have no "Move to…"
    await expect(page.getByTestId("moveto-direction:left")).toHaveCount(0);

    // favourites go to the top of their list
    await page.getByTestId("fav-base:megaloop").click();
    await expect.poll(async () => (await keys(page, "base"))[0]).toBe("base:megaloop");

    // the order of the families: Grabs & landings above Add-ons
    await page.getByTestId("family-up-grab_landing").click();
    await expect.poll(async () => page.locator("[data-testid^='family-'][data-testid$='-undefined']").count()).toBe(0);
    await expect.poll(async () => (await page.locator("fieldset[data-testid^='family-']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("family-", ""))))).toEqual(["direction", "multiplier", "base", "grab_landing", "addon"]);

    // drag: take Frontroll by its handle and drop it on Kiteloop
    const handle = page.getByTestId("drag-base:frontroll");
    const target = page.getByTestId("block-row-base:kiteloop");
    const from = (await handle.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 12, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect.poll(async () => { const k = await keys(page, "base"); return k.indexOf("base:frontroll") > k.indexOf("base:backroll"); }, { timeout: 15_000 }).toBe(true);

    // stored on the division, and still there after a reload
    type Stored = { layout?: { families: string[]; moved: Record<string, string>; favourites: string[]; order?: { base?: string[] } } };
    const read = async () => ((await stored(org, divisionId)).trick_base as Stored).layout;
    await expect.poll(async () => { const b = (await read())?.order?.base ?? []; return b.indexOf("base:frontroll") > b.indexOf("base:backroll"); }, { timeout: 15_000 }).toBe(true);
    const layout = (await read())!;
    expect(layout.families).toEqual(["direction", "multiplier", "base", "grab_landing", "addon"]);
    expect(layout.moved).toEqual({ "addon:tic_tac": "base" });
    expect(layout.favourites).toEqual(["base:megaloop"]);
    await page.reload();
    await page.getByRole("tab", { name: "Trick base" }).click();
    await expect(page.getByTestId("trick-base")).toBeVisible(); // the tab first loads the version of the trick base this event uses
    expect((await keys(page, "base"))[0]).toBe("base:megaloop");
    expect(await keys(page, "base")).toContain("addon:tic_tac");

    // "Reset the order" stores nothing again
    await page.getByTestId("reset-layout").click();
    await expect.poll(async () => (await stored(org, divisionId)).trick_base).toEqual({ disabled: [] });
  } finally {
    await org.cleanup();
  }
});

test("Live screen settings: 'Show scores as % of maximum' is off by default, under Show all settings, and is stored per division", async ({ page }) => {
  test.setTimeout(180_000);
  const org = await createOrganiser();
  try {
    const { eventId, divisionId } = await setup(org);
    await org.signIn(page, `/org/events/${eventId}/divisions`);
    await page.getByRole("tab", { name: "Scoring" }).click();
    await expect(page.getByTestId("model-sentence")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("live-settings")).toHaveCount(0); // only under Show all settings
    await page.getByTestId("advanced-toggle").click(); // the fold called More settings
    const panel = page.getByTestId("live-settings");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("show-percent")).not.toBeChecked();
    await panel.getByTestId("show-percent").check();
    await expect.poll(async () => ((await stored(org, divisionId)).live_settings as { showPercentOfMax?: boolean }).showPercentOfMax).toBe(true);
    await panel.getByTestId("summary-variety").uncheck();
    await expect.poll(async () => ((await stored(org, divisionId)).live_settings as { impressionSummary?: { variety?: boolean } }).impressionSummary?.variety).toBe(false);
    // every setting has a "?" with a sentence and an example
    await panel.getByRole("button", { name: /Show scores as % of maximum/ }).last().click();
    await expect(panel.getByRole("note").first()).toContainText("78.85 %");
  } finally {
    await org.cleanup();
  }
});
