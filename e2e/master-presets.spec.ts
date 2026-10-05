import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

// Polish 4, item 3: the owner manages built-in presets in /admin without touching JSON: add, rename, edit (a new version), retire, restore, DEFAULT, delete.
// Throwaway built-in (its own key); the real DEFAULT is put back; no Arrow / EKL / Demo preset is touched.
test("the owner adds, renames, edits, retires, restores and deletes a built-in; a division that loaded it is unchanged", async ({ page }) => {
  test.setTimeout(300_000);
  const org = await createOrganiser({ platformAdmin: "owner" });
  const name = `E2E P4 ${org.run}`;
  let key = "";
  const row = () => page.getByTestId(`master-scoring_model-e2e-p4-${org.run}`);
  const { data: before } = await org.db.from("platform_default_presets").select("key").eq("kind", "scoring_model").maybeSingle();
  try {
    await org.signIn(page, "/admin/presets/scoring-models/new");
    // ---- Add: the same form; start from a built-in through Load…
    await page.getByTestId("scoring-panel").getByRole("button", { name: "Load…" }).click();
    await page.getByRole("menuitem", { name: "Simple overall heat score (one score per rider per judge)" }).click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByTestId("standalone-save").getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/admin\/presets$/);
    const card = row();
    await expect(card).toBeVisible();
    const row1 = (await org.db.from("scoring_models").select("id, key, version, published_at, json").is("organisation_id", null).eq("name", name)).data!;
    expect(row1).toHaveLength(1);
    key = row1[0].key;
    expect(row1[0].published_at).not.toBeNull();
    const v1 = row1[0];

    // a division of a live event loads it
    const { data: ev } = await org.db.from("events").insert({ organisation_id: org.orgId, name: "P4 Master Cup", slug: `e2e-mp-${org.run}`, status: "draft" }).select("id").single();
    await org.db.from("divisions").insert({ event_id: ev!.id, name: "Other", sort_order: 1 }); // the first (open) division uses no preset
    const { data: div } = await org.db.from("divisions").insert({ event_id: ev!.id, name: "Pro Men", sort_order: 2, scoring_model_id: v1.id }).select("id").single();

    // ---- Rename
    await card.getByRole("button", { name: "Rename", exact: true }).click();
    await card.getByLabel("Name", { exact: true }).fill(`${name} renamed`);
    await card.getByRole("button", { name: "Save name" }).click();
    await expect(row()).toBeVisible();
    const renamed = row();

    // ---- Edit (the form): saving adds version 2, published; the division still has version 1
    await renamed.getByRole("link", { name: `Edit ${name} renamed` }).click();
    await expect(page.getByTestId("scoring-panel")).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill(`${name} v2`);
    await page.getByTestId("standalone-save").getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/admin\/presets$/);
    const versions = (await org.db.from("scoring_models").select("id, version, name, published_at, json").is("organisation_id", null).eq("key", key).order("version")).data!;
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect(versions.every((v) => v.published_at)).toBe(true);
    expect(versions.every((v) => v.name === `${name} v2`)).toBe(true);
    expect((await org.db.from("divisions").select("scoring_model_id").eq("id", div!.id).single()).data?.scoring_model_id).toBe(v1.id);
    expect((await org.db.from("scoring_models").select("json").eq("id", v1.id).single()).data?.json).toMatchObject({ id: key });

    // ---- Retire: gone from the organiser's Load… menu, still on the division that uses it; Restore brings it back
    const item = row();
    await item.getByRole("button", { name: "Retire" }).click();
    await expect(item).toContainText("Retired");
    const menuOf = async () => {
      await page.goto(`/org/events/${ev!.id}/divisions`);
      const m = page.getByTestId("scoring-panel").getByTestId("load-menu");
      await m.getByRole("button", { name: "Load…" }).click();
      return m;
    };
    let m = await menuOf();
    await expect(m.getByRole("menuitem", { name: `${name} v2` })).toHaveCount(0);
    await expect(page.getByText(`Scoring: ${name} v2`)).toBeVisible(); // the division keeps its copy
    await page.goto("/admin/presets");
    await row().getByRole("button", { name: "Restore" }).click();
    await expect(row()).not.toContainText("Retired");
    m = await menuOf();
    await expect(m.getByRole("menuitem", { name: `${name} v2` })).toBeVisible();

    // ---- Set as DEFAULT: it cannot be retired any more
    await page.goto("/admin/presets");
    const again = row();
    await again.getByRole("button", { name: "Set as DEFAULT" }).click();
    await expect(again).toContainText("DEFAULT");
    await expect(again.getByRole("button", { name: "Retire" })).toHaveCount(0);
    await org.db.from("platform_default_presets").upsert({ kind: "scoring_model", key: before!.key }); // the real DEFAULT is back at once

    // ---- Delete is refused while a division uses it; works once none does
    await page.goto("/admin/presets");
    const last = row();
    await last.getByRole("button", { name: "Delete", exact: true }).click();
    await last.getByRole("button", { name: "Yes, delete" }).click();
    await expect(last.getByTestId("master-note")).toContainText("Pro Men in P4 Master Cup");
    expect((await org.db.from("scoring_models").select("id").is("organisation_id", null).eq("key", key)).data).toHaveLength(2);
    await org.db.from("divisions").delete().eq("id", div!.id);
    await last.getByRole("button", { name: "Yes, delete" }).click();
    await expect(row()).toHaveCount(0);
    expect((await org.db.from("scoring_models").select("id").is("organisation_id", null).eq("key", key)).data).toHaveLength(0);
  } finally {
    if (before) await org.db.from("platform_default_presets").upsert({ kind: "scoring_model", key: before.key });
    await org.cleanup();
    if (key) {
      await org.db.from("scoring_models").delete().is("organisation_id", null).eq("key", key);
    }
  }
});
