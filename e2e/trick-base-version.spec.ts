import { randomUUID } from "node:crypto";
import { test, expect } from "./base";
import { record } from "./cleanup";
import { createLiveWorld, type LiveWorld } from "./live-world";

// Fix 2, bug T1: after a master version renames a family and the event is updated to latest, the Divisions step's Trick base panel, "+ Add block" and the spotter
// all show the new name — they read the same source (the event's trick base version and the division's layout) — and saving the panel never writes the old
// families back over the spotter's layout. The test publishes a real master version (renaming two families) and removes it again, like trick-base-editor.spec.ts.
test.describe.configure({ mode: "serial" });
const KEY = "big-air-vocabulary";
let w: LiveWorld;
let versionId: string | null = null;

test.beforeEach(async () => {
  const { data } = await (await import("@supabase/supabase-js")).createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).from("trick_vocabularies").select("version").is("organisation_id", null).is("event_id", null).eq("key", KEY).is("published_at", null).limit(1);
  test.skip((data ?? []).length > 0, "The master trick base has an unpublished draft (the owner's work in progress): publish or discard it first.");
  w = await createLiveWorld();
});
test.afterEach(async () => {
  if (versionId) await w?.db.from("trick_vocabularies").delete().eq("id", versionId);
  versionId = null;
  await w?.cleanup();
});

test("a renamed family shows in the panel, in + Add block and on the spotter after Update to latest, and saving the panel keeps the layout", async ({ page }) => {
  test.setTimeout(300_000);
  const db = w.db;
  const latest = (await db.from("trick_vocabularies").select("version, json").is("organisation_id", null).is("event_id", null).eq("key", KEY).not("published_at", "is", null).order("version", { ascending: false }).limit(1).single()).data!;
  const oldLabel = (latest.json as { families: Array<{ key: string; label: string }> }).families.find((f) => f.key === "addon")!.label;
  // the event stays on the version that is newest now; a new version renames two families
  await db.from("events").update({ trick_vocabulary_version: latest.version }).eq("id", w.eventId);
  const renamed = JSON.parse(JSON.stringify(latest.json)) as { families: Array<{ key: string; label: string }> };
  for (const f of renamed.families) {
    if (f.key === "addon") f.label = "Zeta Variations";
    if (f.key === "grab_landing") f.label = "Zeta Landings";
  }
  const made = await db.from("trick_vocabularies").insert({ organisation_id: null as never, event_id: null as never, key: KEY, version: latest.version + 1, json: renamed as never, content_hash: randomUUID(), published_at: new Date().toISOString() }).select("id").single();
  expect(made.error).toBeNull();
  versionId = made.data!.id;
  record({ trickVersionId: made.data!.id });

  // a division with a saved layout: a favourite and a family order the organiser chose
  const layout = { families: ["direction", "multiplier", "base", "grab_landing", "addon", "fam_kiteloop"], moved: { "addon:tic_tac": "base" }, order: {}, favourites: ["base:backroll"] };
  await db.from("divisions").update({ trick_base: { disabled: [], layout } as never }).eq("id", w.divisionId);

  await w.org.signIn(page, `/org/events/${w.eventId}/divisions`);
  await page.getByRole("tab", { name: "Trick base" }).click();
  const panel = page.getByTestId("trick-base");
  await expect(page.getByTestId("trick-base-version")).toContainText(`version ${latest.version} of`);
  await expect(panel.getByRole("group", { name: oldLabel })).toBeVisible(); // still on the older version: its own names

  await page.getByTestId("update-to-latest").getByRole("button", { name: "Update to latest" }).click();
  await page.getByRole("button", { name: "Yes, update" }).click();
  await expect(page.getByTestId("trick-base-version")).toContainText(`version ${latest.version + 1} of`);
  await expect(panel.getByRole("group", { name: "Zeta Variations" })).toBeVisible();
  await expect(panel.getByRole("group", { name: "Zeta Landings" })).toBeVisible();
  await expect(panel.getByRole("group", { name: oldLabel })).toHaveCount(0);

  // + Add block lists the new names (and not the old ones)
  await page.getByTestId("add-block").click();
  const options = await page.getByLabel("Family", { exact: true }).locator("option").allInnerTexts();
  expect(options).toContain("Zeta Variations");
  expect(options).toContain("Zeta Landings");
  expect(options).not.toContain(oldLabel);
  await page.getByTestId("add-block").click(); // close it

  // saving the panel (untick one block) keeps the division's layout exactly, with no old family written back
  await page.getByTestId("block-addon:board_off").uncheck();
  await expect.poll(async () => (await db.from("divisions").select("trick_base").eq("id", w.divisionId).single()).data?.trick_base).toMatchObject({ disabled: ["addon:board_off"], layout });
  const stored = JSON.stringify((await db.from("divisions").select("trick_base").eq("id", w.divisionId).single()).data!.trick_base);
  expect(stored).not.toContain("Add-ons");
  expect(stored).not.toContain("Grabs");

  // the spotter reads the same source: the new name, the saved layout
  await w.signInAs(page, "spotter", "/seat");
  await w.startHeat(w.heats[0]);
  await expect(page.getByTestId("trick-builder")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("trick-builder").getByRole("group", { name: "Zeta Variations" })).toBeVisible();
  await expect(page.getByTestId("trick-builder").getByRole("group", { name: "Zeta Landings" })).toBeVisible();
  const base = await page.getByTestId("base-list").locator("[data-block]").evaluateAll((els) => els.map((e) => e.getAttribute("data-block")));
  expect(base[0]).toBe("base:backroll"); // the favourite on top
  expect(base).toContain("addon:tic_tac"); // the moved block
});
