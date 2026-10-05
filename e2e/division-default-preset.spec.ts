import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

// A new division starts with the DEFAULT built-in scoring preset already applied and editable: no Load… needed. Throwaway organisation.
test("a new division's scoring form is there at once, says what it is based on, marks edits, saves as a preset and takes another preset from Load…", async ({ page }) => {
  test.setTimeout(240_000);
  const org = await createOrganiser();
  try {
    const { data: ev } = await org.db.from("events").insert({ organisation_id: org.orgId, name: "Default Cup", slug: `e2e-dp-${org.run}`, status: "draft" }).select("id").single();
    await org.signIn(page, `/org/events/${ev!.id}/divisions`);
    await page.getByLabel("New division name").fill("Pro Men");
    await page.getByRole("button", { name: "+ Add division" }).click();
    const panel = page.getByTestId("scoring-panel");
    // the form and the sentence are there without touching Load…
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByTestId("model-sentence")).not.toContainText("Choose a scoring preset");
    await expect(panel.getByTestId("model-sentence")).toContainText("Best 3 tricks");
    await expect(panel.getByTestId("based-on")).toHaveText("Based on: KOTA-style: best 3 tricks + impression");
    await expect(panel.locator("#s-n")).toBeEnabled();
    expect((await org.db.from("divisions").select("scoring_model_id").eq("event_id", ev!.id).single()).data?.scoring_model_id).not.toBeNull();

    // an edit shows "(edited)"
    await panel.locator("#s-n").fill("2");
    await expect(panel.getByTestId("based-on")).toHaveText("Based on: KOTA-style: best 3 tricks + impression (edited)");
    await expect(panel.getByTestId("model-sentence")).toContainText("Best 2 tricks");

    // Save as preset works: the division now uses the new preset
    await panel.getByRole("button", { name: "Save as preset…" }).click();
    await panel.getByLabel("Save these settings as a new preset").fill("My start");
    await panel.getByRole("button", { name: "Save as new preset" }).click();
    await expect(panel.getByTestId("based-on")).toHaveText("Based on: My start");
    expect((await org.db.from("scoring_models").select("name").eq("organisation_id", org.orgId)).data?.map((r) => r.name)).toEqual(["My start"]);

    // Load… another preset replaces the settings
    await panel.getByTestId("load-menu").getByRole("button", { name: "Load…" }).click();
    await panel.getByRole("menuitem", { name: "Simple overall heat score (one score per rider per judge)" }).click();
    await expect(panel.getByTestId("model-sentence")).toContainText("Judges do not score individual tricks");
    await expect(panel.getByTestId("based-on")).toHaveText("Based on: Simple overall heat score (one score per rider per judge)");
  } finally {
    await org.cleanup();
  }
});
