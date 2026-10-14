import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

// "What spectators see per attempt" changes only when the organiser changes it: a page opened earlier saves only the setting that was touched, so it cannot bring an old
// value of another setting back, and a setting that was never stored is not written down. On a throwaway organisation; Arrow, EKL and Demo are never touched.
type Org = Awaited<ReturnType<typeof createOrganiser>>;
async function setup(org: Org, live?: object) {
  const { data: ev } = await org.db.from("events").insert({ organisation_id: org.orgId, name: `Patch Cup ${org.run}`, slug: `e2e-patch-${org.run}`, status: "draft" }).select("id").single();
  const { data: model } = await org.db.from("scoring_models").select("id").is("organisation_id", null).eq("key", "legacy-kol-best3-variety").order("version", { ascending: false }).limit(1).single();
  const { data: div } = await org.db.from("divisions").insert({ event_id: ev!.id, name: "Pro Men", sort_order: 1, scoring_model_id: model!.id, ...(live ? { live_settings: live as never } : {}) }).select("id").single();
  return { eventId: ev!.id, divisionId: div!.id };
}
const live = async (org: Org, id: string) => (await org.db.from("divisions").select("live_settings").eq("id", id).single()).data!.live_settings as Record<string, unknown>;

test("saving another live setting from a page opened earlier does not change 'What spectators see per attempt'", async ({ page }) => {
  test.setTimeout(240_000);
  const org = await createOrganiser();
  try {
    const { eventId, divisionId } = await setup(org, { spectatorAttemptDisplay: "number_score" });
    await org.signIn(page, `/org/events/${eventId}/divisions`);
    await page.getByRole("tab", { name: "Scoring" }).click();
    await expect(page.getByTestId("model-sentence")).toBeVisible({ timeout: 40_000 });
    await page.getByTestId("advanced-toggle").click();
    const panel = page.getByTestId("live-settings");
    await expect(panel.getByTestId("attempt-display")).toHaveValue("number_score");
    // somebody else (another tab, a script) changes it while this page stays open
    await org.db.from("divisions").update({ live_settings: { spectatorAttemptDisplay: "trick_score" } as never }).eq("id", divisionId);
    // the organiser changes something else on the stale page
    await panel.getByTestId("show-percent").check();
    await expect.poll(async () => (await live(org, divisionId)).showPercentOfMax).toBe(true);
    expect((await live(org, divisionId)).spectatorAttemptDisplay).toBe("trick_score"); // untouched
    await panel.getByTestId("summary-variety").uncheck();
    await expect.poll(async () => ((await live(org, divisionId)).impressionSummary as { variety?: boolean } | undefined)?.variety).toBe(false);
    expect((await live(org, divisionId)).spectatorAttemptDisplay).toBe("trick_score");
    // and when the organiser does choose it, it changes
    await panel.getByTestId("attempt-display").selectOption("score_only");
    await expect.poll(async () => (await live(org, divisionId)).spectatorAttemptDisplay).toBe("score_only");
  } finally {
    await org.cleanup();
  }
});

test("a division that never stored the choice stays without it when another live setting is saved", async ({ page }) => {
  test.setTimeout(240_000);
  const org = await createOrganiser();
  try {
    const { eventId, divisionId } = await setup(org);
    await org.signIn(page, `/org/events/${eventId}/divisions`);
    await page.getByRole("tab", { name: "Scoring" }).click();
    await expect(page.getByTestId("model-sentence")).toBeVisible({ timeout: 40_000 });
    await page.getByTestId("advanced-toggle").click();
    const panel = page.getByTestId("live-settings");
    await expect(panel.getByTestId("attempt-display")).toHaveValue("number_score");
    await panel.getByTestId("show-percent").check();
    await expect.poll(async () => (await live(org, divisionId)).showPercentOfMax).toBe(true);
    expect("spectatorAttemptDisplay" in (await live(org, divisionId))).toBe(false);
  } finally {
    await org.cleanup();
  }
});
