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
  const openMore = async () => {
    const toggle = page.getByTestId("advanced-toggle");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  };

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
  await openMore(); // the web address, logo, sponsors, registration and rider label are behind "More settings"
  await expect(field("Web address (slug)")).toHaveValue(`arrow-big-air-${org.run}`);

  // "?" help: a tap opens one sentence with an example, another tap closes it
  await page.getByRole("button", { name: "About “Event name”" }).click();
  await expect(page.getByRole("note").filter({ hasText: "Example:" }).first()).toBeVisible();
  await page.getByRole("button", { name: "About “Event name”" }).click();
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

  await page.getByTestId("registration-settings").getByRole("radio", { name: "Open" }).check();
  await page.getByRole("checkbox", { name: /^Published: the event is listed/ }).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/org\/events\/[0-9a-f-]{36}\/event$/);
  await expect(field("Event name")).toHaveValue(`Arrow Big Air ${org.run}`);
  await expect(field("Sponsor 1 name")).toHaveValue("WOO");
  await expect(page.getByTestId("rider-label-primary")).toContainText("SCARLET");
  await expect(page.getByTestId("registration-settings").getByRole("radio", { name: "Open" })).toBeChecked();
  await expect(live).toBeChecked();
  await expect(results).not.toBeChecked();
  await expect(hold).toBeChecked();
  await expect(page.getByTestId("event-code")).toHaveText(`arrow-big-air-${org.run}`);
  await expect(page.getByTestId("step-rail")).toBeVisible();

  // the choices are stored in the existing settings fields
  const { data: saved } = await org.db.from("events").select("settings").eq("slug", `arrow-big-air-${org.run}`).single();
  expect(saved!.settings).toMatchObject({ publicLiveScores: "live", publicResultsOnPublish: false, holdFinalResult: true });

  // the published event appears on the public home page, labelled with its organisation, and links to the event's own page
  await page.goto("/");
  const link = page.getByRole("link", { name: new RegExp(`Arrow Big Air ${org.run}`) });
  await expect(link).toHaveAttribute("href", `/e/arrow-big-air-${org.run}`);
  await expect(link).toContainText(`Arrow ${org.run} · El Gouna, Egypt · `); // "Organisation · Location · Date": the organisation comes first
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
  const divisionsRail = () => page.getByTestId("rail-divisions"); // the left rail on a laptop: a state word and one line of reason
  // the quiet "Load…" menu of a settings panel (presets), and the "More settings" fold
  const loadFrom = async (name: string | RegExp) => {
    await page.getByTestId("load-menu").getByRole("button", { name: "Load…" }).click();
    await page.getByRole("menuitem", { name }).click();
  };
  const openMore = async () => {
    const toggle = page.getByTestId("advanced-toggle");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  };
  const openPresetTools = async () => {
    if ((await page.getByTestId("preset-tools").count()) === 0) await page.getByRole("button", { name: "Save as preset…" }).click();
  };

  await org.signIn(page, `/org/events/${eventId}/divisions`);
  await expect(page.getByRole("heading", { name: "Step 2: Divisions" })).toBeVisible();
  await page.getByRole("button", { name: "Help: when the rules lock" }).click(); // the notice is one small pill with a "?"
  await expect(page.getByTestId("lock-banner")).toHaveText("Editable until the first heat of this division starts; after that, unlock with a reason (saved).");
  await expect(divisionsRail()).toContainText("Add at least one division");
  await expect(divisionsRail()).toHaveAttribute("data-state", "not_started");

  // add, and the rail follows
  await field("New division name").fill("Pro Men");
  await page.getByRole("button", { name: "+ Add division" }).click();
  await expect(page.getByTestId("division-card")).toHaveCount(1);
  await expect(divisionsRail()).toContainText("Pro Men: choose how it is scored.");
  await expect(divisionsRail()).toHaveAttribute("data-state", "attention");

  // Scoring: the legacy preset gives the owner's example sentence
  await loadFrom(/^Legacy \(previous app\)/);
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
  // Polish 2, item 8: the trimmed average is offered from 5 judges on, and its own setting shows only when it is chosen
  await expect(field("How the judges’ scores are combined").locator("option[value=trimmed_mean]")).toHaveCount(0);
  await expect(page.getByTestId("trim-needs-five")).toHaveText("Trimmed average needs at least 5 judges.");
  await field("Number of judges").fill("5");
  await expect(field("Trim only with at least this many judges")).toHaveCount(0);
  await field("How the judges’ scores are combined").selectOption("trimmed_mean");
  await expect(page.getByTestId("panel-sentence")).toHaveText("5 judges — highest and lowest score dropped, the rest averaged");
  await expect(page.getByText("Trimming only applies from 5 judges. With fewer judges the plain average is used automatically.")).toBeVisible();
  await expect(field("Trim only with at least this many judges")).toBeVisible();
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
  await page.getByRole("button", { name: "About “How the judges’ scores are combined”" }).click();
  await expect(page.getByRole("note").filter({ hasText: "Example: Plain average of 3 judges" })).toBeVisible();
  // Polish 2, item 9: the "?" ends with where the setting shows and what it changes
  await expect(page.getByRole("note").filter({ hasText: "Example: Plain average of 3 judges" }).getByTestId("setting-where")).toHaveText(" Changes the panel score of every trick on the console and so the heat total.");

  // More settings: the Simple fields stay where they are, every other field appears below them, and the sentence stays in view
  await openMore();
  for (const label of ["Best tricks that count (N)", "Attempts allowed per rider per heat (M)", "Number of judges", "How the judges’ scores are combined"]) {
    await expect(field(label), `Simple field still visible: ${label}`).toBeVisible();
  }
  await expect(page.getByRole("switch", { name: "Judges also give an Impression / Variety score for each rider" })).toBeVisible();
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
  await openPresetTools();
  await field("Save these settings as a new preset").fill("Arrow best 2");
  await page.getByRole("button", { name: "Save as new preset" }).click();
  await expect(page.getByText("Preset “Arrow best 2” saved; Pro Men now uses it").first()).toBeVisible();
  await page.getByTestId("load-menu").getByRole("button", { name: "Load…" }).click();
  await expect(page.getByRole("menuitem", { name: "Arrow best 2" })).toBeVisible();
  await page.keyboard.press("Escape");
  const { data: presetRow } = await org.db.from("scoring_models").select("key, version").eq("organisation_id", org.orgId).single();
  expect(presetRow).toMatchObject({ key: "arrow-best-2", version: 1 });

  // editing the saved preset creates version 2 and leaves version 1 alone
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

  // Format tab: ONE picker. No separate "Start from a format" list; a small "Load…" menu in the panel header instead.
  await page.getByRole("tab", { name: "Format" }).click();
  await expect(page.getByLabel("Start from a format")).toHaveCount(0);
  await expect(page.getByTestId("load-menu").getByRole("button", { name: "Load…" })).toBeVisible();
  const kinds = ["Knockout", "Knockout with a second chance", "Double elimination", "Qualifying heats + finals", "Pools to a final", "Round robin", "Single final"];
  for (const k of kinds) await expect(page.getByRole("radio", { name: k, exact: true }), `card: ${k}`).toBeVisible();
  const explanations: Record<string, string> = {
    "Knockout": "Top riders from each heat advance; the rest are out.",
    "Knockout with a second chance": "Heat winners go straight through; the other riders get one more heat to qualify.",
    "Double elimination": "Lose once and you drop to a second draw; lose twice and you're out. The best riders of each draw meet in the final.",
    "Qualifying heats + finals": "Qualifying heats seed the finals directly: the best-scoring riders go to the Final, the next best to a Small Final, the rest are placed by their qualifying result.",
    "Pools to a final": "Everyone rides once; all heat scores are ranked together and the top N ride the final.",
    "Round robin": "Everyone rides several heats against different riders; heat points add up to a ranking, no knockout.",
    "Single final": "One heat, that's the result.",
  };
  // compact cards: one line each (name + tag); nothing is chosen yet, so no explanation is printed; every card has a "?" with it
  await expect(page.getByTestId("kind-explain")).toHaveCount(0);
  for (const [name, text] of Object.entries(explanations)) {
    await page.getByRole("button", { name: `About “${name}”`, exact: true }).click();
    await expect(page.getByRole("note").filter({ hasText: text })).toBeVisible();
    await page.getByRole("button", { name: `About “${name}”`, exact: true }).click(); // close it again
  }

  // a tag under each card says how many heats a rider is guaranteed
  for (const [kind, tag] of [
    ["knockout", "Riders can be out after 1 heat"],
    ["second_chance", "Every rider gets at least 2 heats"],
    ["double_elimination", "Every rider gets at least 2 heats"],
    ["qualifying", "Every rider gets at least 2 heats"],
    ["pools", "Riders can be out after 1 heat"],
    ["round_robin", "Every rider gets at least 2 heats"],
    ["single_final", "Riders can be out after 1 heat"],
  ] as const) {
    await expect(page.getByTestId(`tag-${kind}`), `tag: ${kind}`).toHaveText(tag);
  }

  // choosing a card is the only step: its numbers, the preview field, the diagram and the per-round lengths are all there at the
  // Simple level, with nothing to toggle
  await page.getByRole("radio", { name: "Knockout", exact: true }).check();
  await expect(page.getByTestId("kind-explain")).toHaveCount(1); // under the selected card only
  await expect(page.getByTestId("kind-explain")).toHaveText(explanations["Knockout"]);
  await expect(page.getByTestId("advanced-toggle")).toHaveAttribute("aria-expanded", "false");
  for (const label of ["Riders per heat (target)", "Minimum per heat", "Maximum per heat", "How many advance", "Final size", "Preview with"]) {
    await expect(field(label), `Simple: ${label}`).toBeVisible();
  }
  for (const n of ["8", "14", "24"]) await expect(page.getByRole("button", { name: n, exact: true })).toBeVisible();
  await expect(page.getByTestId("ladder-diagram")).toBeVisible();
  await expect(page.getByTestId("format-preview")).toBeVisible();
  await expect(page.getByTestId("per-round-lengths")).toBeVisible();
  // one laptop screen: with the Format tab at the top of a 1440 × 900 window, the cards, the numbers row, the preview field and the top of the diagram are all in view
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("tab", { name: "Format" }).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8));
  await expect(page.getByRole("radiogroup")).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId("format-numbers")).toBeInViewport({ ratio: 1 });
  await expect(field("Preview with")).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId("ladder-diagram").locator("figcaption")).toBeInViewport({ ratio: 1 }); // the top of the diagram
  await expect(page.getByTestId("min-heats")).toHaveText("Minimum heats per rider: 1");
  await expect(field("Break after each heat")).toHaveCount(0); // lengths and breaks live under Show all settings

  // clicking a round name in the diagram renames it; blank restores the default; heats too; kept when the ladder is regenerated
  await field("Preview with").fill("14");
  await page.getByRole("button", { name: "Rename round Semi-finals" }).click();
  await page.getByLabel("New name for Semi-finals").fill("Semi-finals (women)");
  await page.getByLabel("New name for Semi-finals").press("Enter");
  await expect(page.getByTestId("ladder-diagram")).toContainText("Semi-finals (women)");
  await page.getByRole("button", { name: "Rename heat R1 H2" }).click();
  await page.getByLabel("New name for R1 H2").fill("Youth heat");
  await page.getByLabel("New name for R1 H2").press("Enter");
  await expect(page.getByTestId("ladder-round").first().getByTestId("ladder-heat").nth(1)).toContainText("Youth heat: 3 riders");
  await field("Preview with").fill("24");
  await expect(page.getByTestId("ladder-diagram")).toContainText("Semi-finals (women)");
  await expect(page.getByTestId("ladder-diagram")).toContainText("Youth heat");
  await page.getByRole("button", { name: "Rename round Semi-finals (women)" }).click();
  await page.getByLabel("New name for Semi-finals (women)").fill("");
  await page.getByLabel("New name for Semi-finals (women)").press("Enter");
  await expect(page.getByTestId("ladder-diagram")).not.toContainText("Semi-finals (women)");
  await page.getByRole("button", { name: "Rename round Semi-finals" }).click();
  await page.getByLabel("New name for Semi-finals").fill("Semi-finals (women)");
  await page.getByLabel("New name for Semi-finals").press("Enter");
  await field("Preview with").fill("14");

  // three plain numbers: 14 riders, target 3, minimum 3 (maximum 4 by default) → heats of 3, 3, 4, 4 (smaller heats first)
  await field("Riders per heat (target)").fill("3");
  await expect(field("Minimum per heat")).toHaveValue("2"); // the default follows the target
  await expect(field("Maximum per heat")).toHaveValue("4"); // target + 1
  await field("Minimum per heat").fill("3");
  await expect(page.getByTestId("format-preview")).toContainText("With 14 riders: R1 4 heats of 3–4");
  await expect(page.getByTestId("ladder-round").first().getByTestId("ladder-heat")).toHaveText([/R1 H1: 3 riders/, /Youth heat: 3 riders/, /R1 H3: 4 riders/, /R1 H4: 4 riders/]);
  await expect(page.getByTestId("ladder-round").nth(1).getByTestId("ladder-from").first()).toContainText("1st H1");
  await page.getByRole("button", { name: "About “Minimum per heat”" }).click();
  await expect(page.getByRole("note").filter({ hasText: "Minimum per heat — the system will never make a heat smaller than this" })).toBeVisible();
  await page.getByRole("button", { name: "About “Maximum per heat”" }).click();
  await expect(page.getByRole("note").filter({ hasText: "Maximum per heat — the system will never make a heat bigger than this" })).toBeVisible();
  await field("Minimum per heat").fill("2");
  await field("Maximum per heat").fill("3");
  await expect(page.getByTestId("ladder-round").first().getByTestId("ladder-heat")).toHaveText([/2 riders/, /3 riders/, /3 riders/, /3 riders/, /3 riders/]);
  await field("Riders per heat (target)").fill("4");
  await field("Minimum per heat").fill("4");
  await field("Maximum per heat").fill("5");
  await field("Preview with").fill("13");
  await expect(page.getByTestId("ladder-round").first().getByTestId("ladder-heat")).toHaveText([/4 riders/, /4 riders/, /5 riders/]);
  await field("Preview with").fill("5");
  await expect(page.getByTestId("ladder-round")).toHaveCount(1);
  await field("Maximum per heat").fill("4");
  await field("Preview with").fill("24");
  await expect(page.getByTestId("ladder-round").first().getByTestId("ladder-heat")).toHaveCount(6);
  await field("Minimum per heat").fill("3");
  await field("Maximum per heat").fill("5");
  await field("Preview with").fill("14");

  // the same three numbers apply to EVERY round: target 3 / minimum 3 / maximum 3, 1 advances, final of 2, 24 riders
  await field("Riders per heat (target)").fill("3");
  await field("Minimum per heat").fill("3");
  await field("Maximum per heat").fill("3");
  await field("How many advance").fill("1");
  await field("Final size").fill("2");
  await field("Preview with").fill("24");
  await expect(page.getByTestId("format-preview")).toHaveText("With 24 riders: R1 8 heats of 3 → R2 4 heats of 2 → SF 2 heats of 2 → F 1 heat of 2 (15 heats)");
  await expect(page.getByTestId("final-note")).toHaveText("Final of 2 — 2 riders remain after Semi-finals (women)");
  await expect(page.getByTestId("ladder-round")).toHaveCount(4);
  await expect(page.getByTestId("ladder-round").nth(1)).toContainText("1 v 1");
  await expect(page.getByTestId("ladder-round").nth(1).getByTestId("ladder-heat")).toHaveCount(4);
  await expect(page.getByTestId("ladder-round").nth(1).getByTestId("ladder-from").first()).toContainText("1st H1");
  await expect(page.getByTestId("ladder-round").nth(1).getByTestId("ladder-from").first()).toContainText("1st H2"); // adjacent heats meet
  await field("Riders per heat (target)").fill("4");
  await field("Minimum per heat").fill("4");
  await field("Maximum per heat").fill("5");
  await field("How many advance").fill("2");
  await field("Final size").fill("4");
  await field("Preview with").fill("14");

  // second chance: every round follows the three numbers; nobody advances without riding
  await page.getByRole("radio", { name: "Knockout with a second chance" }).check();
  await expect(page.getByTestId("tag-second_chance")).toHaveText("Every rider gets at least 2 heats");
  await expect(page.getByTestId("min-heats")).toHaveText("Minimum heats per rider: 2");
  await expect(page.getByTestId("ladder-diagram")).toContainText("Second chance H1");
  await expect(page.getByTestId("ladder-diagram")).not.toContainText("Advances without riding");
  await expect(page.getByTestId("ladder-diagram")).toContainText("1st R1 H1");
  await field("Minimum per heat").fill("3");
  await expect(page.getByTestId("format-preview")).toHaveText("With 14 riders: R1 4 heats of 3–4 → Second chance 3 heats of 3–4 → SF 2 heats of 3–4 → F 1 heat of 4 (10 heats)");
  await field("Riders who get a second chance").selectOption({ label: "2nd and 3rd only; the others are out" });
  await expect(page.getByTestId("ladder-round").first()).toContainText("4th → out");
  await expect(page.getByTestId("min-heats")).toHaveText("Minimum heats per rider: 1");
  await expect(page.getByTestId("tag-second_chance")).toHaveText("Riders can be out after 1 heat");
  await field("Riders who get a second chance").selectOption({ label: "Everyone who did not win" });
  await expect(page.getByTestId("min-heats")).toHaveText("Minimum heats per rider: 2");

  // double elimination, qualifying, round robin, single final: each card shows the numbers that format uses
  await page.getByRole("radio", { name: "Double elimination" }).check();
  for (const label of ["Riders per heat (target)", "Minimum per heat", "Maximum per heat", "How many advance", "Final size"]) await expect(field(label), `DE: ${label}`).toBeVisible();
  await expect(page.getByTestId("format-preview")).toContainText("M1");
  await expect(page.getByTestId("ladder-diagram")).toContainText("Main draw 1");
  await expect(page.getByTestId("ladder-diagram")).toContainText("Second-chance draw 1");
  await expect(page.getByTestId("ladder-diagram")).not.toContainText("Advances without riding");
  await expect(page.getByTestId("min-heats")).toHaveText("Minimum heats per rider: 2");
  await field("Final size").fill("2");
  await expect(page.getByTestId("ladder-round").last()).toContainText("2 riders");
  await field("Final size").fill("4");

  await page.getByRole("radio", { name: "Qualifying heats + finals" }).check();
  for (const label of ["Riders per heat (target)", "Minimum per heat", "Maximum per heat", "Final size", "Small final size", "Heats per rider"]) await expect(field(label), `QF: ${label}`).toBeVisible();
  await expect(page.getByTestId("ladder-diagram")).toContainText("Small final");
  await expect(page.getByTestId("ladder-diagram")).toContainText("next best 4 of all heats");
  await field("Heats per rider").fill("1");
  await expect(page.getByTestId("min-heats")).toHaveText("Minimum heats per rider: 1");
  await expect(page.getByTestId("tag-qualifying")).toHaveText("Riders can be out after 1 heat");
  await field("Heats per rider").fill("2");

  await page.getByRole("radio", { name: "Round robin" }).check();
  for (const label of ["Riders per heat (target)", "Minimum per heat", "Maximum per heat", "Heats per rider", "Points table"]) await expect(field(label), `RR: ${label}`).toBeVisible();
  await expect(page.getByTestId("ladder-diagram")).toContainText("ranked by heat points");
  await field("Heats per rider").fill("4");
  await expect(page.getByTestId("ladder-round")).toHaveCount(4);
  await field("Points table").fill("10, 6, 3, 1");
  await expect(page.getByTestId("ladder-round")).toHaveCount(4);
  await page.getByRole("button", { name: "About “Points table”" }).click();
  await expect(page.getByTestId("setting-fs-points-table")).toContainText("Points for 1st, 2nd, 3rd … place in a heat");
  await expect(page.getByTestId("setting-fs-points-table").getByRole("note")).toContainText("Example: 4, 3, 2, 1");

  await page.getByRole("radio", { name: "Single final" }).check();
  await expect(page.getByText("Everyone rides one heat: there is nothing to set.")).toBeVisible();
  await expect(page.getByTestId("ladder-round")).toHaveCount(1);
  await field("Preview with").fill("8");
  await expect(page.getByTestId("format-preview")).toContainText("F 1 heat of 8");
  await field("Preview with").fill("14");

  // Show all settings keeps every Simple field on screen, with the advanced ones (heat lengths, breaks, flag-out) added below
  await page.getByRole("radio", { name: "Knockout with a second chance" }).check();
  await openMore();
  const screenText = await page.locator("body").innerText();
  expect(screenText).not.toMatch(/\b(byes?|repechage|dingle|man-on-man)\b/i);
  expect(screenText).not.toMatch(/\b(winners?|losers?)['’]?\s+bracket\b/i);
  for (const label of ["Riders per heat (target)", "Minimum per heat", "Maximum per heat", "Riders who get a second chance", "Final size", "Preview with", "Heat length: R1 (minutes)"]) {
    await expect(field(label), `Simple format field still visible: ${label}`).toBeVisible();
  }
  for (const k of kinds) await expect(page.getByRole("radio", { name: k, exact: true })).toBeVisible();
  await expect(page.getByTestId("per-round-lengths")).toBeVisible();
  await expect(page.getByTestId("ladder-diagram")).toBeVisible();
  // Polish 2, item 10: timing is in one place, the table; More settings no longer repeats it
  await expect(page.getByText("Default timing (minutes)", { exact: true })).toHaveCount(0);
  await expect(field("Break after each heat, every round (minutes)")).toBeVisible();
  await expect(page.getByText("Flag-out", { exact: true })).toBeVisible();
  await page.getByTestId("advanced-toggle").click(); // fold it again
  await expect(page.getByText("Flag-out", { exact: true })).toHaveCount(0);

  // heat length per round: pre-filled from the ladder's own lengths, optional override, diagram in sync, breaks untouched
  await page.getByRole("radio", { name: "Knockout", exact: true }).check();
  await field("Riders per heat (target)").fill("3");
  await expect(page.getByTestId("format-preview")).toContainText("R1 5 heats of 2–3");
  await field("Preview with").fill("24");
  await expect(page.getByTestId("format-preview")).toContainText("R1 8 heats of 3");
  await expect(page.getByTestId("per-round-lengths")).toContainText("Timing per round");
  await expect(field("Heat length: R1 (minutes)")).toHaveValue("10");
  await expect(field("Heat length: F (minutes)")).toHaveValue("10");
  await expect(page.getByTestId("ladder-round").first()).toContainText("10 min");
  await field("Heat length: R1 (minutes)").fill("9");
  await field("Heat length: F (minutes)").fill("20");
  await expect(page.getByTestId("ladder-round").first()).toContainText("9 min");
  await expect(page.getByTestId("ladder-round").last()).toContainText("20 min");
  await expect(page.getByTestId("per-round-lengths").getByText("own length", { exact: true })).toHaveCount(2);
  // a break of its own in Round 1, and the preview's time sentence follows at once
  const before = await page.getByTestId("time-sentence").textContent();
  await field("Break after each heat: R1 (minutes)").fill("12");
  await expect(page.getByTestId("per-round-lengths").getByText("own break", { exact: true })).toHaveCount(1);
  await expect(page.getByTestId("time-sentence")).not.toHaveText(before ?? "");
  await field("Break after each heat: R1 (minutes)").fill("");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  // names: a fresh card load starts from the built-in format; put the names back before saving
  await page.getByRole("button", { name: "Rename round Final" }).click();
  await page.getByLabel("New name for Final").fill("Grand final");
  await page.getByLabel("New name for Final").press("Enter");
  await page.getByRole("button", { name: "Save format for Pro Men" }).click();
  await expect(page.getByText("Format saved for Pro Men").first()).toBeVisible();
  await expect(divisionsRail()).toHaveAttribute("data-state", "done"); // nothing missing any more
  const { data: fmt } = await org.db.from("divisions").select("format_params").eq("event_id", eventId).single();
  expect(fmt!.format_params).toMatchObject({ roundDurationMin: { R1: 9, F: 20 }, roundNames: { F: "Grand final" } });
  expect(JSON.stringify(fmt!.format_params)).not.toContain("SF");
  await page.getByRole("button", { name: "Use the division's numbers for every round" }).click();
  await expect(page.getByTestId("ladder-round").first()).toContainText("10 min");

  // pools: heats of everybody, the best N of all go to the final
  await page.getByRole("radio", { name: "Pools to a final" }).check();
  await field("Riders per pool (target)").fill("8");
  await field("How many make the final").fill("6");
  await field("Preview with").fill("23");
  await expect(page.getByTestId("format-preview")).toContainText("With 23 riders: P1 3 heats");
  await expect(page.getByTestId("ladder-diagram")).toContainText("best 6 of all heats → F");

  // the hidden fixed templates are not offered anywhere in the menus
  await page.getByTestId("load-menu").getByRole("button", { name: "Load…" }).click();
  const offered = await page.getByRole("menuitem").allTextContents();
  expect(offered.join(" | ")).not.toMatch(/megaloop/i);
  expect(offered.join(" | ")).toMatch(/Double elimination/);
  expect(offered.join(" | ")).toMatch(/Round robin/);
  await page.getByRole("menuitem", { name: offered.find((o) => /Single final/.test(o))! }).click();
  await expect(page.getByRole("radio", { name: "Single final" })).toBeChecked();

  // custom ladder: the whiteboard builder (the full walk-through is in draw-timetable.spec.ts)
  await page.getByRole("radio", { name: "Custom ladder" }).check();
  await expect(page.getByTestId("ladder-builder")).toBeVisible();
  await page.getByRole("button", { name: "+ Add round" }).click();
  await expect(page.getByTestId("builder-round")).toHaveCount(1);
  await expect(page.getByTestId("ladder-status")).toContainText("Not complete yet");
  await page.getByRole("radio", { name: "Single final" }).check();
  await expect(page.getByTestId("ladder-builder")).toHaveCount(0);

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
  await expect(page.getByText("Scoring and format are locked").first()).toBeVisible();
  await expect(page.getByTestId("load-menu")).toHaveCount(0);
  await expect(page.getByText("Unlock the rules first to load a different set.").first()).toBeVisible(); // the first division opens by itself
  await expect(page.getByRole("button", { name: /Save scoring for/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toBeDisabled(); // it has heats
  await page.getByLabel("Reason for unlocking").fill("Wrong heat length entered");
  await page.getByRole("button", { name: /^Unlock/ }).first().click();
  await expect(page.getByText("Unlocked. Your reason was written to the audit log.").first()).toBeVisible();
  const { data: audit } = await org.db.from("audit_log").select("action, reason").eq("event_id", eventId).eq("action", "rules_unlocked");
  expect(audit).toEqual([{ action: "rules_unlocked", reason: "Wrong heat length entered" }]);
});
