import { test, expect } from "./base";
import { createOrganiser, PNG } from "./organiser";

// Needs Supabase keys in the environment and the Phase 4a-1 migrations. Creates and removes its own organiser and organisation.
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
  // exact matching: every setting also has a "Help: …" button whose name contains the same words
  const field = (label: string) => page.getByLabel(label, { exact: true });

  await org.signIn(page, "/org/settings");
  await expect(page.getByRole("heading", { name: "Organisation settings" })).toBeVisible();

  // Settings: rename, new slug (with the warning), logo, time zone
  await field("Organisation name").fill(`Arrow ${org.run}`);
  await field("Web address (slug)").fill(`arrow-${org.run}`);
  await expect(page.getByText("Changing the web address changes your public links")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled(); // needs the confirmation first
  await page.getByLabel("I understand, change the address").check();
  await field("Organisation logo: choose an image file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByAltText("Organisation logo (current)")).toBeVisible();
  await field("Default time zone for new events").selectOption("Europe/Berlin");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Organisation settings saved").first()).toBeVisible();
  await page.reload();
  await expect(field("Organisation name")).toHaveValue(`Arrow ${org.run}`);
  await expect(field("Web address (slug)")).toHaveValue(`arrow-${org.run}`);
  await expect(field("Default time zone for new events")).toHaveValue("Europe/Berlin");
  await expect(page.getByAltText("Organisation logo (current)")).toBeVisible();

  // a wrong file is refused in plain words and nothing is uploaded
  await field("Organisation logo: choose an image file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByRole("alert").filter({ hasText: "PNG, JPEG or WebP" })).toBeVisible();

  // Event step: the time zone is pre-filled from the organisation
  await page.goto("/org/events/new");
  await expect(field("Time zone")).toHaveValue("Europe/Berlin");
  await field("Event name").fill(`Arrow Big Air ${org.run}`);
  await expect(field("Web address (slug)")).toHaveValue(`arrow-big-air-${org.run}`);

  // "?" help: a tap opens one sentence with an example, another tap closes it
  await page.getByRole("button", { name: "Help: Event name" }).click();
  await expect(page.getByRole("note").filter({ hasText: "Example:" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Help: Event name" }).click();
  await expect(page.getByRole("note").filter({ hasText: "Arrow Big Air 2026" })).toHaveCount(0);

  await field("Location").fill("El Gouna, Egypt");
  await field("First day").fill("2026-10-02");
  await field("Last day").fill("2026-10-04");
  await field("Time zone").selectOption("Africa/Cairo");
  await field("Event logo: choose an image file").setInputFiles({ name: "event.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByAltText("Event logo (current)")).toBeVisible();
  await page.getByRole("button", { name: "+ Add sponsor" }).click();
  await field("Sponsor 1 name").fill("WOO");

  // visibility: one plain sentence and three tick boxes, all unticked
  await expect(page.getByText("Nothing is shown to riders or spectators until the head judge publishes it. Optionally:")).toBeVisible();
  const live = page.getByRole("checkbox", { name: "Show live scores during a heat (the head judge can switch this on per heat)" });
  const results = page.getByRole("checkbox", { name: "Show results automatically when a heat is published" });
  const hold = page.getByRole("checkbox", { name: "Hold the final’s result until the organiser releases it (podium)" });
  for (const box of [live, results, hold]) await expect(box).not.toBeChecked();
  await live.check();
  await hold.check();

  // identification: no lycras is the default, so riders are recognised by name
  await expect(page.getByTestId("rider-label-primary")).toHaveText("Sam Sample");
  await expect(page.getByLabel("No or not sure: identify riders by name")).toBeChecked();
  await page.getByLabel("Yes: each rider (or each heat) has a lycra colour").check();
  await expect(page.getByTestId("rider-label-primary")).toContainText("RED");
  await expect(field("Start from a preset")).toHaveValue("vests-per-heat");
  await field("Start from a preset").selectOption({ label: "Bib / sail numbers" });
  await expect(page.getByTestId("rider-label-primary")).toHaveText("14");
  await field("Start from a preset").selectOption({ label: "Lycra colour per heat" });
  await field("Name of colour 1").fill("Scarlet");
  await expect(page.getByTestId("rider-label-primary")).toContainText("SCARLET");
  await field("Save this scheme as a preset").fill(`Arrow lycras ${org.run}`);
  await page.getByRole("button", { name: "Save as preset" }).click();
  await expect(page.getByText(`Preset “Arrow lycras ${org.run}” saved`).first()).toBeVisible();

  await page.getByRole("checkbox", { name: /^Registration is open/ }).check();
  await page.getByRole("checkbox", { name: /^Published: the event is listed/ }).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/org\/events\/[0-9a-f-]{36}\/event$/);
  await expect(field("Event name")).toHaveValue(`Arrow Big Air ${org.run}`);
  await expect(field("Sponsor 1 name")).toHaveValue("WOO");
  await expect(page.getByTestId("rider-label-primary")).toContainText("SCARLET");
  await expect(page.getByRole("checkbox", { name: /^Registration is open/ })).toBeChecked();
  await expect(live).toBeChecked();
  await expect(results).not.toBeChecked();
  await expect(hold).toBeChecked();
  await expect(page.getByTestId("event-code")).toHaveText(`arrow-big-air-${org.run}`);
  await expect(page.getByRole("navigation", { name: "Organiser" })).toBeVisible();

  // the choices are stored in the existing settings fields
  const { data: saved } = await org.db.from("events").select("settings").eq("slug", `arrow-big-air-${org.run}`).single();
  expect(saved!.settings).toMatchObject({ publicLiveScores: "live", publicResultsOnPublish: false, holdFinalResult: true });

  // the published event appears on the public home page and links to its join page
  await page.goto("/");
  const link = page.getByRole("link", { name: new RegExp(`Arrow Big Air ${org.run}`) });
  await expect(link).toHaveAttribute("href", `/e/arrow-big-air-${org.run}/join`);
});

test("organiser: Divisions step (Simple, Show all settings, presets, ladder choice and diagram, import/export, lock)", async ({ page }) => {
  test.setTimeout(300_000);
  const field = (label: string) => page.getByLabel(label, { exact: true });
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
  await expect(page.getByTestId("lock-banner")).toHaveText("Editable until the first heat of this division starts; after that, unlock with a reason (recorded).");
  await expect(missingInRail().getByText("Add at least one division")).toBeVisible();

  // add, and the rail follows
  await field("New division name").fill("Pro Men");
  await page.getByRole("button", { name: "+ Add division" }).click();
  await expect(page.getByTestId("division-card")).toHaveCount(1);
  await expect(missingInRail().getByText("Pro Men: choose how it is scored.")).toBeVisible();

  // Scoring: the legacy preset gives the owner's example sentence
  await field("Scoring preset").selectOption({ label: "Legacy (previous app): single score 0-10 per trick, best 3 + Variety 0-10, 7 attempts" });
  await expect(page.getByTestId("model-sentence")).toHaveText("Best 3 of 7 attempts + Variety 0–10, 3 judges averaged");

  // Simple mode shows only what the default needs
  await expect(field("Best tricks that count (N)")).toBeVisible();
  await expect(field("Number of judges")).toBeVisible();
  await expect(page.getByText("Judges also give an Impression / Variety score for each rider")).toBeVisible();
  await expect(page.getByText("Tie-breakers, in order")).toHaveCount(0);
  await expect(page.getByText("Counting and heat total", { exact: true })).toHaveCount(0);

  // Simple level edits the sentence live; the judges sentence explains the setting in words
  await expect(page.getByTestId("panel-sentence")).toHaveText("3 judges — plain average");
  await field("Best tricks that count (N)").fill("2");
  await expect(page.getByTestId("model-sentence")).toHaveText("Best 2 of 7 attempts + Variety 0–10, 3 judges averaged");
  await field("Attempts allowed per rider per heat (M)").fill("5");
  await field("Number of judges").fill("4");
  await expect(page.getByTestId("model-sentence")).toHaveText("Best 2 of 5 attempts + Variety 0–10, 4 judges averaged");
  await expect(page.getByTestId("panel-sentence")).toHaveText("4 judges — plain average");
  await field("How the judges’ scores are combined").selectOption("trimmed_mean");
  await expect(page.getByTestId("panel-sentence")).toHaveText("4 judges — plain average; with 5 or more judges the highest and lowest score are dropped and the rest averaged");
  await field("Number of judges").fill("5");
  await expect(page.getByTestId("panel-sentence")).toHaveText("5 judges — highest and lowest score dropped, the rest averaged");
  await expect(page.getByText("Trimming only applies from 5 judges. With fewer judges the plain average is used automatically.")).toBeVisible();
  await field("How the judges’ scores are combined").selectOption("mean");
  await field("Number of judges").fill("4");
  await page.getByRole("button", { name: "Save scoring for Pro Men" }).click();
  await expect(page.getByText("Scoring saved for Pro Men").first()).toBeVisible();

  // it is stored as a small overrides object on the division, not as a copy of the model
  const { data: saved } = await org.db.from("divisions").select("scoring_model_id, scoring_overrides").eq("event_id", eventId).single();
  expect(saved!.scoring_model_id).not.toBeNull();
  expect(saved!.scoring_overrides).toMatchObject({ heat: { maxAttemptsPerRider: 5, counting: { n: 2 } }, panel: { minJudges: 4 } });
  expect(JSON.stringify(saved!.scoring_overrides).length).toBeLessThan(400);

  // "?" help on a Simple setting: tap to open, with an example
  await page.getByRole("button", { name: "Help: How the judges’ scores are combined" }).click();
  await expect(page.getByRole("note").filter({ hasText: "Example: Plain average of 3 judges" })).toBeVisible();

  // Show all settings: the Simple fields stay where they are, every other field appears below them
  await page.getByRole("checkbox", { name: "Show all settings" }).check();
  for (const label of ["Best tricks that count (N)", "Attempts allowed per rider per heat (M)", "Number of judges", "How the judges’ scores are combined"]) {
    await expect(field(label), `Simple field still visible: ${label}`).toBeVisible();
  }
  await expect(page.getByRole("checkbox", { name: "Judges also give an Impression / Variety score for each rider" })).toBeVisible();
  await expect(page.getByTestId("panel-sentence")).toBeVisible();
  await expect(page.getByText("Tie-breakers, in order")).toBeVisible(); // the advanced part is there too
  await page.getByText("Counting and heat total", { exact: true }).click();
  // an optional dial is a switch, off by default; turning it on shows its field
  await page.getByRole("checkbox", { name: "Weights for the counted tricks, best first: All counted tricks count fully" }).check();
  await field("Weights for the counted tricks, best first").fill("1, 0.75, 0.5");
  await expect(page.getByTestId("model-sentence")).toContainText("counted tricks weighted 1 / 0.75 / 0.5");
  // a mistake is reported next to the field, in plain words
  await field("Weights for the counted tricks, best first").fill("1, abc");
  await expect(page.getByText("Type numbers separated by commas")).toBeVisible();
  await field("Weights for the counted tricks, best first").fill("1, 0.75, 0.5");

  // save as a preset, division switches to it
  await field("Save these settings as a new preset").fill("Arrow best 2");
  await page.getByRole("button", { name: "Save as new preset" }).click();
  await expect(page.getByText("Preset “Arrow best 2” saved; Pro Men now uses it").first()).toBeVisible();
  await expect(field("Scoring preset")).toContainText("Arrow best 2");
  const { data: presetRow } = await org.db.from("scoring_models").select("key, version").eq("organisation_id", org.orgId).single();
  expect(presetRow).toMatchObject({ key: "arrow-best-2", version: 1 });

  // editing the saved preset creates version 2 and leaves version 1 alone
  await page.getByRole("checkbox", { name: "Show all settings" }).uncheck();
  await field("Attempts allowed per rider per heat (M)").fill("6");
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
  await field("Paste the JSON here").fill('{ "id": "x", "name": "Broken" "oops": 1 }');
  await page.getByRole("button", { name: "Import pasted JSON" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not valid JSON" })).toBeVisible();
  const broken = { ...exported, name: "Imported bad" };
  broken.heat = { ...exported.heat, counting: { type: "best_n", n: 0 } };
  await field("Paste the JSON here").fill(JSON.stringify(broken));
  await page.getByRole("button", { name: "Import pasted JSON" }).click();
  await expect(page.getByText("heat › counting › n: Must be at least 1")).toBeVisible();
  await field("Paste the JSON here").fill(JSON.stringify({ ...exported, name: "Imported OK" }));
  await page.getByRole("button", { name: "Import pasted JSON" }).click();
  await expect(page.getByText("Imported “Imported OK” as a new preset").first()).toBeVisible();

  // Format tab: three ladder types, each with its one-line explanation printed under it
  await page.getByRole("tab", { name: "Format" }).click();
  await field("Start from a format").selectOption({ label: "Single elimination — heats of 4, top 2 advance, final of 4" });
  for (const text of [
    "Top riders from each heat advance to the next round; the rest are out.",
    "Example: heats of 4, top 2 go through.",
    "Heat winners advance directly; 2nd and 3rd get one more heat to qualify.",
    "Example: King of the Air Round 1 → Round 2.",
    "Everyone rides once; all heat scores are ranked together and the top N ride the final.",
    "Example: 23 riders in 3 pools, best 6 to the final.",
  ]) {
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("radio", { name: "Knockout", exact: true })).toBeChecked();

  // a tag under each choice says how many heats a rider is guaranteed
  await expect(page.getByTestId("tag-knockout")).toHaveText("Riders can be out after 1 heat");
  await expect(page.getByTestId("tag-second_chance")).toHaveText("Every rider gets at least 2 heats");
  await expect(page.getByTestId("tag-pools")).toHaveText("Riders can be out after 1 heat");
  await expect(page.getByTestId("min-heats")).toHaveText("Minimum heats per rider: 1");

  // two plain numbers: 14 riders, target 3, minimum 3 → heats of 3, 3, 4, 4 (smaller heats first)
  await field("Riders per heat (target)").fill("3");
  await expect(field("Minimum riders per heat")).toHaveValue("2"); // the default follows the target
  await field("Minimum riders per heat").fill("3");
  await expect(page.getByTestId("format-preview")).toContainText("With 14 riders: R1 4 heats of 3–4");
  await expect(page.getByTestId("ladder-round").first().getByTestId("ladder-heat")).toHaveText([/R1 H1: 3 riders/, /R1 H2: 3 riders/, /R1 H3: 4 riders/, /R1 H4: 4 riders/]);
  // placeholders read "1st H1"; heats are named by round
  await expect(page.getByTestId("ladder-round").nth(1).getByTestId("ladder-from").first()).toContainText("1st H1");
  await page.getByRole("button", { name: "Help: Minimum riders per heat" }).click();
  await expect(page.getByRole("note").filter({ hasText: "Minimum riders per heat — the system will never make a heat smaller than this; extra riders make some heats one bigger" })).toBeVisible();
  // target 4, minimum 4: 13 riders → 4/4/5 and 5 riders → one heat of 5
  await field("Riders per heat (target)").fill("4");
  await field("Minimum riders per heat").fill("4");
  await field("Preview with").fill("13");
  await expect(page.getByTestId("ladder-round").first().getByTestId("ladder-heat")).toHaveText([/4 riders/, /4 riders/, /5 riders/]);
  await field("Preview with").fill("5");
  await expect(page.getByTestId("ladder-round")).toHaveCount(1);
  await expect(page.getByTestId("ladder-heat")).toHaveText([/5 riders/]);
  await field("Minimum riders per heat").fill("3"); // back to the default
  await field("Preview with").fill("14");

  // second chance: plain words for the second-chance round and for riders who advance without riding; no bracket jargon anywhere
  await page.getByRole("radio", { name: "Knockout with a second chance" }).check();
  await expect(page.getByTestId("min-heats")).toHaveText("Minimum heats per rider: 2");
  await expect(page.getByTestId("ladder-diagram")).toContainText("Second chance H1");
  await expect(page.getByTestId("ladder-diagram")).toContainText("Advances without riding");
  await expect(page.getByTestId("ladder-diagram")).toContainText("1st R1 H1");
  await expect(page.getByTestId("format-preview")).toContainText("Second chance 4 heats of 2 + 1 advancing without riding");
  await page.getByRole("checkbox", { name: "Show all settings" }).check();
  const screenText = await page.locator("body").innerText();
  expect(screenText).not.toMatch(/\b(byes?|repechage|dingle|man-on-man)\b/i);
  expect(screenText).not.toMatch(/\b(winners?|losers?)['’]?\s+bracket\b/i);
  // Show all settings keeps every Simple setting on screen, with the advanced ones added below
  for (const label of ["Riders per heat (target)", "Minimum riders per heat", "Final size", "Heat length: R1 (minutes)", "Break after each heat (minutes)", "Break after the round (minutes)"]) {
    await expect(field(label), `Simple format field still visible: ${label}`).toBeVisible();
  }
  await expect(page.getByRole("radio", { name: "Knockout", exact: true })).toBeVisible();
  await expect(page.getByTestId("per-round-lengths")).toBeVisible();
  await expect(page.getByText("Flag-out", { exact: true })).toBeVisible(); // advanced part
  await page.getByRole("checkbox", { name: "Show all settings" }).uncheck();
  await page.getByRole("radio", { name: "Knockout", exact: true }).check();
  await field("Riders per heat (target)").fill("4");

  // the text preview and the ladder diagram follow the rider count
  await expect(page.getByTestId("format-preview")).toHaveText("With 14 riders: R1 4 heats of 3–4 → SF 2 heats of 4 → F 1 heat of 4 (7 heats)");
  await expect(page.getByTestId("ladder-round")).toHaveCount(3);
  await expect(page.getByTestId("ladder-heat")).toHaveCount(7);
  await expect(page.getByTestId("ladder-diagram")).toContainText("3 rounds, 7 heats");
  await expect(page.getByTestId("ladder-diagram")).toContainText("1st–2nd → SF");
  await field("Preview with").fill("24");
  await expect(page.getByTestId("format-preview")).toContainText("With 24 riders: R1 6 heats of 4");
  await expect(page.getByTestId("ladder-heat").first()).toContainText("4 riders");

  // only the simple numbers are shown under the choice; changing one updates the ladder
  await expect(field("Riders per heat (target)")).toBeVisible();
  await expect(field("Minimum riders per heat")).toHaveValue("3"); // default: target − 1
  await expect(field("How many advance per heat")).toBeVisible();
  await expect(field("Final size")).toBeVisible();
  await expect(page.getByText("Flag-out", { exact: true })).toHaveCount(0); // flag-out lives under Show all settings
  await field("Riders per heat (target)").fill("3");
  await expect(page.getByTestId("format-preview")).toContainText("R1 8 heats of 3");

  // heat length per round: pre-filled from the single setting, optional override, diagram in sync, breaks untouched
  await expect(page.getByTestId("per-round-lengths")).toContainText("Heat length per round");
  await expect(field("Heat length: R1 (minutes)")).toHaveValue("10");
  await expect(field("Heat length: F (minutes)")).toHaveValue("15");
  await expect(page.getByTestId("ladder-round").first()).toContainText("10 min");
  await field("Heat length: R1 (minutes)").fill("9");
  await field("Heat length: F (minutes)").fill("20");
  await expect(page.getByTestId("ladder-round").first()).toContainText("9 min");
  await expect(page.getByTestId("ladder-round").last()).toContainText("20 min");
  await expect(page.getByTestId("ladder-round").nth(1)).toContainText("10 min"); // R2 (another early round) untouched
  await expect(page.getByTestId("per-round-lengths").getByText("own length", { exact: true })).toHaveCount(2);
  await expect(page.getByTestId("format-preview")).toContainText("R1 8 heats of 3"); // same shape
  await page.getByRole("button", { name: "Save format for Pro Men" }).click();
  await expect(page.getByText("Format saved for Pro Men").first()).toBeVisible();
  await expect(page.getByLabel("What is missing in 2. Divisions")).toHaveCount(0); // nothing missing any more
  const { data: fmt } = await org.db.from("divisions").select("format_params").eq("event_id", eventId).single();
  expect(fmt!.format_params).toMatchObject({ roundDurationMin: { R1: 9, F: 20 } });
  expect(JSON.stringify(fmt!.format_params)).not.toContain("SF");
  await page.getByRole("button", { name: "Use the single settings for every round" }).click();
  await expect(page.getByTestId("ladder-round").first()).toContainText("10 min");
  await expect(page.getByTestId("per-round-lengths").getByText("own length", { exact: true })).toHaveCount(0);

  // pools: heats of everybody, the best N of all go to the final
  await page.getByRole("radio", { name: "Pools to a final" }).check();
  await field("Riders per pool (target)").fill("8");
  await field("How many make the final").fill("6");
  await field("Preview with").fill("23");
  await expect(page.getByTestId("format-preview")).toContainText("With 23 riders: P1 3 heats");
  await expect(page.getByTestId("ladder-diagram")).toContainText("best 6 of all heats → F");
  // second chance: the fixed structure is explained
  await page.getByRole("radio", { name: "Knockout with a second chance" }).check();
  await expect(page.getByText("Heat winners go straight through; the other riders get one more heat (the second-chance round)")).toBeVisible();
  await page.getByRole("radio", { name: "Knockout", exact: true }).check();

  // Show all settings: flag-out and the default timing sit here, with their helper text
  await page.getByRole("checkbox", { name: "Show all settings" }).check();
  await page.getByText("Flag-out", { exact: true }).click();
  await page.getByRole("button", { name: "Help: Flag-out" }).click();
  await expect(page.getByRole("note").filter({ hasText: "KOTA-style: in 3-rider heats the lowest-scoring rider is flagged out at minute X and the other two ride on. Off by default." })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Flag-out: No flag-out" })).not.toBeChecked(); // off by default
  await page.getByText("Default timing (minutes)", { exact: true }).click();
  await page.getByRole("button", { name: "Help: Default timing (minutes)" }).click();
  await expect(page.getByRole("note").filter({ hasText: "Defaults used to pre-fill new rounds. The per-round values decide." })).toBeVisible();
  await page.getByText("Field size this format suits", { exact: true }).click();
  await page.getByRole("button", { name: "Help: Field size this format suits" }).click();
  await expect(page.getByRole("note").filter({ hasText: "The field sizes this template was designed for. The per-round values decide." })).toBeVisible();
  await page.getByRole("checkbox", { name: "Show all settings" }).uncheck();

  // custom ladder (advanced) keeps the full per-round editor
  await page.getByRole("button", { name: "+ Start a custom ladder" }).click();
  await expect(page.getByTestId("format-preview")).toContainText("With 23 riders: R1 6 heats of 3–4");
  await page.getByText("Custom ladder (advanced)", { exact: true }).click();
  await page.getByRole("button", { name: "+ Add round" }).click();
  await expect(page.getByTestId("format-preview")).toContainText("R3");
  await expect(page.getByTestId("ladder-round")).toHaveCount(3);
  await field("Save these settings as a new preset").fill("Arrow custom");
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
