import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

type Org = Awaited<ReturnType<typeof createOrganiser>>;

async function setup(org: Org) {
  const { data: ev } = await org.db.from("events").insert({ organisation_id: org.orgId, name: `Tricks Cup ${org.run}`, slug: `e2e-tricks-${org.run}`, status: "draft" }).select("id").single();
  const { data: div } = await org.db.from("divisions").insert({ event_id: ev!.id, name: "Pro Men", sort_order: 1 }).select("id").single();
  return { eventId: ev!.id, divisionId: div!.id };
}

test("Trick base: five families, every block ticked, categories follow the ticks, the selection is stored on the division", async ({ page }) => {
  test.setTimeout(180_000);
  const org = await createOrganiser();
  try {
    const { eventId, divisionId } = await setup(org);
    await org.signIn(page, `/org/events/${eventId}/divisions`);
    await page.getByRole("tab", { name: "Trick base" }).click();
    const panel = page.getByTestId("trick-base");
    for (const f of ["Direction", "Multiplier", "Base trick", "Add-ons", "Grabs & landings"]) await expect(panel.getByRole("group", { name: f })).toBeVisible();
    const boxes = panel.getByRole("checkbox");
    const total = await boxes.count();
    expect(total).toBeGreaterThan(30);
    for (let i = 0; i < total; i++) await expect(boxes.nth(i)).toBeChecked(); // all on by default: nobody types trick names
    await expect(page.getByTestId("derived-categories")).toHaveText("Handle pass · Board-off · Kiteloop · Rotation · Other"); // the vocabulary's precedence

    // untick the handle pass: that category goes away; it is stored as "unticked" on the division
    await page.getByTestId("block-addon:handle_pass").uncheck();
    await expect(page.getByTestId("derived-categories")).toHaveText("Board-off · Kiteloop · Rotation · Other");
    await expect.poll(async () => (await org.db.from("divisions").select("trick_base").eq("id", divisionId).single()).data?.trick_base).toEqual({ disabled: ["addon:handle_pass"] });
    await page.reload();
    await page.getByRole("tab", { name: "Trick base" }).click();
    await expect(page.getByTestId("block-addon:handle_pass")).not.toBeChecked();
    await expect(page.getByTestId("block-base:backroll")).toBeChecked();
    await page.getByRole("button", { name: "Tick all" }).click();
    await expect.poll(async () => (await org.db.from("divisions").select("trick_base").eq("id", divisionId).single()).data?.trick_base).toEqual({ disabled: [] });
  } finally {
    await org.cleanup();
  }
});

test("Trick base: + Add block adds a local name, proposed to the master base; after a heat has started blocks can be added but not removed", async ({ page }) => {
  test.setTimeout(180_000);
  const org = await createOrganiser();
  try {
    const { eventId, divisionId } = await setup(org);
    await org.signIn(page, `/org/events/${eventId}/divisions`);
    await page.getByRole("tab", { name: "Trick base" }).click();
    await page.getByTestId("add-block").click();
    await page.getByLabel("Family", { exact: true }).selectOption({ label: "Base trick" });
    await page.getByLabel("Name of the block").fill("Sloth roll");
    await page.getByLabel("Scoring category (optional)").selectOption({ label: "Rotation" });
    await page.getByRole("button", { name: "Add block", exact: true }).click();
    const block = page.getByTestId("block-base:local_sloth_roll");
    await expect(block).toBeChecked();
    await expect(page.getByText("proposed to the master base")).toBeVisible();
    const { data: row } = await org.db.from("trick_vocabularies").select("json, event_id, organisation_id").eq("event_id", eventId).eq("key", "event-additions").single();
    expect(row!.organisation_id).toBe(org.orgId);
    expect(row!.json).toMatchObject({ blocks: [{ family: "base", key: "local_sloth_roll", label: "Sloth roll", category: "rotation", status: "proposed" }] });

    // a name that already exists is refused in words
    await page.getByTestId("add-block").click();
    await page.getByLabel("Name of the block").fill("backroll");
    await page.getByRole("button", { name: "Add block", exact: true }).click();
    await expect(page.getByText("“backroll” already exists in that family.")).toBeVisible();

    // a heat starts: ticked blocks are locked, unticked ones can still be ticked, new ones can still be added
    await org.db.from("divisions").update({ trick_base: { disabled: ["addon:late"] } }).eq("id", divisionId);
    const { data: round } = await org.db.from("rounds").insert({ division_id: divisionId, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} }).select("id").single();
    await org.db.from("heats").insert({ round_id: round!.id, division_id: divisionId, event_id: eventId, number: 1, duration_sec: 600, status: "running", started_at: new Date().toISOString() });
    await page.reload();
    await page.getByRole("tab", { name: "Trick base" }).click();
    await expect(page.getByTestId("trick-base-locked")).toContainText("cannot be unticked");
    await expect(page.getByTestId("block-base:backroll")).toBeDisabled();
    await expect(page.getByTestId("block-addon:late")).toBeEnabled();
    await page.getByTestId("block-addon:late").check();
    await expect.poll(async () => (await org.db.from("divisions").select("trick_base").eq("id", divisionId).single()).data?.trick_base).toEqual({ disabled: [] });
    await page.getByTestId("add-block").click();
    await page.getByLabel("Family", { exact: true }).selectOption({ label: "Add-ons" });
    await page.getByLabel("Name of the block").fill("Shark bite");
    await page.getByRole("button", { name: "Add block", exact: true }).click();
    await expect(page.getByTestId("block-addon:local_shark_bite")).toBeChecked();
    // and the database refuses the removal even from a stale page
    const r = await org.db.from("divisions").update({ trick_base: { disabled: ["base:backroll"] } }).eq("id", divisionId);
    expect(r.error?.message).toContain("TRICK_BASE_LOCKED"); // a rule in the database, not only a disabled tick box
  } finally {
    await org.cleanup();
  }
});

test("Trick base proposals: the owner sees them in /admin and accepts one into the master base", async ({ page }) => {
  test.setTimeout(180_000);
  const owner = await createOrganiser({ platformAdmin: "owner" });
  let blockKey = "";
  try {
    const { eventId } = await setup(owner);
    blockKey = `local_e2e_${owner.run}`;
    await owner.db.from("trick_vocabularies").insert({ organisation_id: owner.orgId, event_id: eventId, key: "event-additions", json: { blocks: [{ family: "base", key: blockKey, label: `E2E roll ${owner.run}`, category: "rotation", status: "proposed" }] }, content_hash: "x" });
    await owner.signIn(page, "/admin/tricks");
    const row = page.getByTestId("proposal").filter({ hasText: `E2E roll ${owner.run}` });
    await expect(row).toContainText("Base trick");
    await expect(row).toContainText(`Tricks Cup ${owner.run}`);
    await row.getByRole("button", { name: "Accept into the master base" }).click();
    await row.getByRole("button", { name: "Yes, add it" }).click();
    await expect(page.getByTestId("proposal").filter({ hasText: `E2E roll ${owner.run}` })).toHaveCount(0);

    const { data: versions } = await owner.db.from("trick_vocabularies").select("version, json, published_at").is("organisation_id", null).is("event_id", null).eq("key", "big-air-vocabulary").order("version", { ascending: false });
    expect(versions![0].published_at).not.toBeNull();
    expect(JSON.stringify(versions![0].json)).toContain(blockKey);
    expect(JSON.stringify(versions![1].json)).not.toContain(blockKey); // the older version is untouched
    const { data: ev } = await owner.db.from("trick_vocabularies").select("json").eq("event_id", eventId).eq("key", "event-additions").single();
    expect((ev!.json as { blocks: Array<{ status: string }> }).blocks[0].status).toBe("accepted");
  } finally {
    // the master base must not keep a test block: remove the version this test created
    if (blockKey) {
      const { data: rows } = await owner.db.from("trick_vocabularies").select("id, json").is("organisation_id", null).is("event_id", null).eq("key", "big-air-vocabulary");
      for (const r of rows ?? []) if (JSON.stringify(r.json).includes(blockKey)) await owner.db.from("trick_vocabularies").delete().eq("id", r.id);
    }
    await owner.cleanup();
  }
});
