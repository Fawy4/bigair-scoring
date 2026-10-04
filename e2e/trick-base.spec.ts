import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

type Org = Awaited<ReturnType<typeof createOrganiser>>;

/** The newest published master version's family names and one block of the add-on family that is not retired (read, never hard-coded: the owner renames families in each version). */
async function masterNames(org: Org) {
  const json = (await org.db.from("trick_vocabularies").select("json").is("organisation_id", null).is("event_id", null).eq("key", "big-air-vocabulary").not("published_at", "is", null).order("version", { ascending: false }).limit(1).single()).data!.json as {
    families: Array<{ key: string; label: string }>;
    modifiers: Array<{ key: string; family?: string; retired?: boolean }>;
  };
  const label = (key: string) => json.families.find((f) => f.key === key)!.label;
  const addon = json.modifiers.find((m) => !m.retired && (m.family ?? "addon") === "addon")!;
  return { families: json.families, addonLabel: label("addon"), addonBlock: `addon:${addon.key}` };
}

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
    for (const f of (await masterNames(org)).families) await expect(panel.getByRole("group", { name: f.label }).first()).toBeVisible(); // the names of the master version in use
    const boxes = panel.getByRole("checkbox");
    const total = await boxes.count();
    expect(total).toBeGreaterThan(20); // the master base has fewer blocks in v7 than in v6 (the count follows the version in use)
    // every block is on by default (nobody types trick names), except the ones the master base itself switches off (defaultOn false) or retires: those are read from
    // the newest published master version, which the owner may edit and publish at any time
    const master = (await org.db.from("trick_vocabularies").select("json").is("organisation_id", null).is("event_id", null).eq("key", "big-air-vocabulary").not("published_at", "is", null).order("version", { ascending: false }).limit(1).single()).data!.json as Record<string, Array<{ key: string; defaultOn?: boolean; retired?: boolean }>>;
    const off = new Set(["directions", "multipliers", "baseTricks", "modifiers"].flatMap((k) => (master[k] ?? []).filter((b) => b.defaultOn === false || b.retired === true).map((b) => b.key)));
    for (let i = 0; i < total; i++) {
      const id = (await boxes.nth(i).getAttribute("data-testid")) ?? "";
      if (off.has(id.replace(/^block-[a-z_]+:/, ""))) await expect(boxes.nth(i), id).not.toBeChecked();
      else await expect(boxes.nth(i), id).toBeChecked();
    }
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
    await expect.poll(async () => (await org.db.from("divisions").select("trick_base").eq("id", divisionId).single()).data?.trick_base).toMatchObject({ disabled: [] }); // Tick all also records the blocks the master base has off by default as switched on
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
    const { addonBlock, addonLabel } = await masterNames(org);
    await org.db.from("divisions").update({ trick_base: { disabled: [addonBlock] } }).eq("id", divisionId);
    const { data: round } = await org.db.from("rounds").insert({ division_id: divisionId, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} }).select("id").single();
    await org.db.from("heats").insert({ round_id: round!.id, division_id: divisionId, event_id: eventId, number: 1, duration_sec: 600, status: "running", started_at: new Date().toISOString() });
    await page.reload();
    await page.getByRole("tab", { name: "Trick base" }).click();
    await expect(page.getByTestId("trick-base-locked")).toContainText("cannot be unticked");
    await expect(page.getByTestId("block-base:backroll")).toBeDisabled();
    await expect(page.getByTestId(`block-${addonBlock}`)).toBeEnabled();
    await page.getByTestId(`block-${addonBlock}`).check();
    await expect.poll(async () => (await org.db.from("divisions").select("trick_base").eq("id", divisionId).single()).data?.trick_base).toEqual({ disabled: [] });
    await page.getByTestId("add-block").click();
    await page.getByLabel("Family", { exact: true }).selectOption({ label: addonLabel });
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

// Accepting and dismissing proposals: e2e/trick-base-editor.spec.ts (the proposals moved to the top of Master presets → Trick base).
