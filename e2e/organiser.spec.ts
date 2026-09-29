import { test, expect } from "./base";
import { createOrganiser, PNG } from "./organiser";

// Needs Supabase keys in the environment and the Phase 4a-1 migration. Creates and removes its own organiser and organisation.
type Organiser = Awaited<ReturnType<typeof createOrganiser>>;
let org: Organiser;

test.beforeAll(async () => {
  org = await createOrganiser();
});
test.afterAll(async () => {
  await org?.cleanup();
});

test("organiser: settings, then the Event step", async ({ page }) => {
  test.setTimeout(180_000);
  await org.signIn(page, "/org/settings");
  await expect(page.getByRole("heading", { name: "Organisation settings" })).toBeVisible();

  // Settings: rename, new slug (with the warning), logo, time zone
  await page.getByLabel("Organisation name").fill(`Arrow ${org.run}`);
  await page.getByLabel("Web address (slug)").fill(`arrow-${org.run}`);
  await expect(page.getByText("Changing the web address changes your public links")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled(); // needs the confirmation first
  await page.getByLabel("I understand, change the address").check();
  await page.getByLabel("Organisation logo: choose an image file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByAltText("Organisation logo (current)")).toBeVisible();
  await page.getByLabel("Default time zone for new events").selectOption("Europe/Berlin");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Organisation settings saved").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Organisation name")).toHaveValue(`Arrow ${org.run}`);
  await expect(page.getByLabel("Web address (slug)")).toHaveValue(`arrow-${org.run}`);
  await expect(page.getByLabel("Default time zone for new events")).toHaveValue("Europe/Berlin");
  await expect(page.getByAltText("Organisation logo (current)")).toBeVisible();

  // a wrong file is refused in plain words and nothing is uploaded
  await page.getByLabel("Organisation logo: choose an image file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByRole("alert").filter({ hasText: "PNG, JPEG or WebP" })).toBeVisible();

  // Event step: the time zone is pre-filled from the organisation
  await page.goto("/org/events/new");
  await expect(page.getByLabel("Time zone", { exact: true })).toHaveValue("Europe/Berlin");
  await page.getByLabel("Event name").fill(`Arrow Big Air ${org.run}`);
  await expect(page.getByLabel("Web address (slug)")).toHaveValue(`arrow-big-air-${org.run}`);
  await page.getByLabel("Location").fill("El Gouna, Egypt");
  await page.getByLabel("First day").fill("2026-10-02");
  await page.getByLabel("Last day").fill("2026-10-04");
  await page.getByLabel("Time zone", { exact: true }).selectOption("Africa/Cairo");
  await page.getByLabel("Event logo: choose an image file").setInputFiles({ name: "event.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByAltText("Event logo (current)")).toBeVisible();
  await page.getByRole("button", { name: "+ Add sponsor" }).click();
  await page.getByLabel("Sponsor 1 name").fill("WOO");

  // identification: pick a preset and edit it, live preview of a rider chip
  await expect(page.getByTestId("rider-chip-primary")).toContainText("RED");
  await page.getByLabel("Start from a preset").selectOption({ label: "Bib / sail numbers" });
  await expect(page.getByTestId("rider-chip-primary")).toHaveText("14");
  await page.getByLabel("Start from a preset").selectOption({ label: "Coloured vests / lycras assigned per heat (DEFAULT)" });
  await page.getByLabel("Name of colour 1", { exact: true }).fill("Scarlet");
  await expect(page.getByTestId("rider-chip-primary")).toContainText("SCARLET");
  await page.getByLabel("Save this scheme as a preset").fill(`Arrow vests ${org.run}`);
  await page.getByRole("button", { name: "Save as preset" }).click();
  await expect(page.getByText(`Preset “Arrow vests ${org.run}” saved`).first()).toBeVisible();

  await page.getByLabel("Registration is open").check();
  await page.getByLabel("Published: the event is listed").check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/org\/events\/[0-9a-f-]{36}\/event$/);
  await expect(page.getByLabel("Event name")).toHaveValue(`Arrow Big Air ${org.run}`);
  await expect(page.getByLabel("Sponsor 1 name")).toHaveValue("WOO");
  await expect(page.getByTestId("rider-chip-primary")).toContainText("SCARLET");
  await expect(page.getByLabel("Registration is open")).toBeChecked();
  await expect(page.getByTestId("event-code")).toHaveText(`arrow-big-air-${org.run}`);
  await expect(page.getByRole("navigation", { name: "Organiser" })).toBeVisible();

  // the published event appears on the public home page and links to its join page
  await page.goto("/");
  const link = page.getByRole("link", { name: new RegExp(`Arrow Big Air ${org.run}`) });
  await expect(link).toHaveAttribute("href", `/e/arrow-big-air-${org.run}/join`);
});

test("organiser: Divisions step (Simple, Advanced, presets, formats, import/export, lock)", async ({ page }) => {
  test.setTimeout(240_000);
  const slug = `divs-${org.run}`;
  const { data: ev, error } = await org.db
    .from("events")
    .insert({ organisation_id: org.orgId, name: `Divisions Cup ${org.run}`, slug, timezone: "Africa/Cairo", start_date: "2026-10-02", end_date: "2026-10-04", location: "El Gouna", status: "draft" })
    .select("id")
    .single();
  expect(error).toBeNull();
  const eventId = ev!.id;
  const missingInRail = () => page.getByLabel("What is missing in 2. Divisions"); // the left rail on a laptop

  await org.signIn(page, `/org/events/${eventId}/divisions`);
  await expect(page.getByRole("heading", { name: "Step 2: Divisions" })).toBeVisible();
  await expect(missingInRail().getByText("Add at least one division")).toBeVisible();

  // add, and the rail follows
  await page.getByLabel("New division name").fill("Pro Men");
  await page.getByRole("button", { name: "+ Add division" }).click();
  await expect(page.getByTestId("division-card")).toHaveCount(1);
  await expect(missingInRail().getByText("Pro Men: choose how it is scored.")).toBeVisible();

  // Scoring: choose the legacy preset → the live sentence from the owner's example
  const scoringSelect = page.getByLabel("Scoring preset");
  await scoringSelect.selectOption({ label: "Legacy (previous app): single mark 0-10 per trick, best 3 + Variety 0-10, 7 attempts" });
  await expect(page.getByTestId("model-sentence")).toHaveText("Best 3 of 7 attempts + Variety 0–10, 3 judges averaged");

  // Simple level edits the sentence live
  await page.getByLabel("How many tricks count (N)").fill("2");
  await expect(page.getByTestId("model-sentence")).toHaveText("Best 2 of 7 attempts + Variety 0–10, 3 judges averaged");
  await page.getByLabel("Attempts allowed per rider per heat").fill("5");
  await page.getByLabel("Judges on the panel (fewest)").fill("4");
  await expect(page.getByTestId("model-sentence")).toHaveText("Best 2 of 5 attempts + Variety 0–10, 4 judges averaged");
  await page.getByRole("button", { name: "Save scoring for Pro Men" }).click();
  await expect(page.getByText("Scoring saved for Pro Men").first()).toBeVisible();

  // it is stored as a small overrides object on the division, not as a copy of the model
  const { data: saved } = await org.db.from("divisions").select("scoring_model_id, scoring_overrides").eq("event_id", eventId).single();
  expect(saved!.scoring_model_id).not.toBeNull();
  expect(saved!.scoring_overrides).toMatchObject({ heat: { maxAttemptsPerRider: 5, counting: { n: 2 } }, panel: { minJudges: 4 } });
  expect(JSON.stringify(saved!.scoring_overrides).length).toBeLessThan(400);

  // Advanced level: every field, including the two new dials
  await page.getByLabel("Advanced: every setting").check();
  await page.getByText("Counting and heat total", { exact: true }).click();
  await page.getByLabel("Weights for the counted tricks, best first").fill("1, 0.75, 0.5");
  await expect(page.getByTestId("model-sentence")).toContainText("counted tricks weighted 1 / 0.75 / 0.5");
  // a mistake is reported next to the field, in plain words
  await page.getByLabel("Weights for the counted tricks, best first").fill("1, abc");
  await expect(page.getByText("Type numbers separated by commas")).toBeVisible();
  await page.getByLabel("Weights for the counted tricks, best first").fill("1, 0.75, 0.5");

  // save as a preset, division switches to it
  await page.getByLabel("Save these settings as a new preset").fill("Arrow best 2");
  await page.getByRole("button", { name: "Save as new preset" }).click();
  await expect(page.getByText("Preset “Arrow best 2” saved; Pro Men now uses it").first()).toBeVisible();
  await expect(page.getByLabel("Scoring preset")).toContainText("Arrow best 2");
  const { data: presetRow } = await org.db.from("scoring_models").select("key, version, json").eq("organisation_id", org.orgId).single();
  expect(presetRow).toMatchObject({ key: "arrow-best-2", version: 1 });

  // editing the saved preset creates version 2 and leaves version 1 alone
  await page.getByLabel("Advanced: every setting").check();
  await page.getByLabel("Simple: the common settings").check();
  await page.getByLabel("Attempts allowed per rider per heat").fill("6");
  await page.getByRole("button", { name: "Save as new version of “Arrow best 2”" }).click();
  await expect(page.getByText("as version 2").first()).toBeVisible();
  const { data: versions } = await org.db.from("scoring_models").select("version, json").eq("organisation_id", org.orgId).order("version");
  expect(versions!.map((v) => v.version)).toEqual([1, 2]);
  expect((versions![0].json as { heat: { maxAttemptsPerRider: number } }).heat.maxAttemptsPerRider).toBe(5);
  expect((versions![1].json as { heat: { maxAttemptsPerRider: number } }).heat.maxAttemptsPerRider).toBe(6);

  // export
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export as JSON" }).click()]);
  expect(download.suggestedFilename()).toBe("arrow-best-2.json");
  const exported = JSON.parse(await (await import("node:fs/promises")).readFile((await download.path())!, "utf8"));
  expect(exported.heat.countedWeights).toEqual([1, 0.75, 0.5]);

  // import: a broken file gets readable problems, a good one becomes a new preset
  await page.getByRole("button", { name: "Paste JSON instead" }).click();
  await page.getByLabel("Paste the JSON here").fill('{ "id": "x", "name": "Broken" "oops": 1 }');
  await page.getByRole("button", { name: "Import pasted JSON" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not valid JSON" })).toBeVisible();
  const broken = { ...exported, name: "Imported bad" };
  broken.heat = { ...exported.heat, counting: { type: "best_n", n: 0 } };
  await page.getByLabel("Paste the JSON here").fill(JSON.stringify(broken));
  await page.getByRole("button", { name: "Import pasted JSON" }).click();
  await expect(page.getByText("heat › counting › n: Must be at least 1")).toBeVisible();
  await page.getByLabel("Paste the JSON here").fill(JSON.stringify({ ...exported, name: "Imported OK" }));
  await page.getByRole("button", { name: "Import pasted JSON" }).click();
  await expect(page.getByText("Imported “Imported OK” as a new preset").first()).toBeVisible();

  // Format tab: preset + live preview from the real draw engine
  await page.getByRole("tab", { name: "Format" }).click();
  await page.getByLabel("Format", { exact: true }).selectOption({ label: "Single elimination — heats of 4, top 2 advance, final of 4" });
  await expect(page.getByTestId("format-preview")).toHaveText("With 14 riders: R1 4 heats of 3–4 → SF 2 heats of 4 → F 1 heat of 4 (7 heats)");
  await page.getByLabel("Preview with").fill("24");
  await expect(page.getByTestId("format-preview")).toContainText("With 24 riders: R1 6 heats of 4");
  await page.getByText("Format generator", { exact: true }).click();
  await page.getByLabel("Riders per heat").first().fill("3");
  await expect(page.getByTestId("format-preview")).toContainText("R1 8 heats of 3");
  await page.getByRole("button", { name: "Save format for Pro Men" }).click();
  await expect(page.getByText("Format saved for Pro Men").first()).toBeVisible();
  // the rail no longer lists anything missing for Divisions
  await expect(page.getByLabel("What is missing in 2. Divisions")).toHaveCount(0);

  // custom format builder
  await page.getByRole("button", { name: "+ Start a custom format" }).click();
  await expect(page.getByTestId("format-preview")).toContainText("With 24 riders: R1 6 heats of 4");
  await page.getByText("Rounds", { exact: true }).click();
  await page.getByRole("button", { name: "+ Add round" }).click();
  await expect(page.getByTestId("format-preview")).toContainText("R3");
  await page.getByLabel("Save these settings as a new preset").fill("Arrow custom");
  await page.getByRole("button", { name: "Save as new preset" }).click();
  await expect(page.getByText("Preset “Arrow custom” saved").first()).toBeVisible();

  // duplicate, reorder, delete
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect(page.getByTestId("division-card")).toHaveCount(2);
  await expect(page.getByLabel("Name of division 2")).toHaveValue("Pro Men (copy)");
  await page.getByRole("button", { name: "Move Pro Men (copy) up" }).click();
  await expect(page.getByLabel("Name of division 1")).toHaveValue("Pro Men (copy)");
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("button", { name: "Yes, delete Pro Men (copy)" }).click();
  await expect(page.getByTestId("division-card")).toHaveCount(1);

  // lock: once a heat has started the rules are read-only until unlocked with a reason
  const { data: div } = await org.db.from("divisions").select("id").eq("event_id", eventId).single();
  const { data: round } = await org.db.from("rounds").insert({ division_id: div!.id, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} }).select("id").single();
  await org.db.from("heats").insert({ round_id: round!.id, division_id: div!.id, event_id: eventId, number: 1, duration_sec: 600, status: "running", started_at: new Date().toISOString() });
  await page.reload();
  await expect(page.getByText("Scoring and format are locked").first()).toBeVisible(); // the first division opens by itself
  await expect(page.getByRole("button", { name: /Save scoring for/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toBeDisabled(); // it has heats
  await page.getByLabel("Reason for unlocking").fill("Wrong heat length entered");
  await page.getByRole("button", { name: /^Unlock/ }).first().click();
  await expect(page.getByText("Unlocked. Your reason was written to the audit log.").first()).toBeVisible();
  const { data: audit } = await org.db.from("audit_log").select("action, reason").eq("event_id", eventId).eq("action", "rules_unlocked");
  expect(audit).toEqual([{ action: "rules_unlocked", reason: "Wrong heat length entered" }]);
});
