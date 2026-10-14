import { expect, test } from "./base";
import { createOrganiser } from "./organiser";

// A new division starts on "trick name + score"; one that already exists keeps what it has. Throwaway organisation.
test("a division added in the Divisions step starts on trick name + score; an existing division keeps its choice", async ({ page }) => {
  test.setTimeout(240_000);
  const org = await createOrganiser();
  try {
    const { data: ev } = await org.db.from("events").insert({ organisation_id: org.orgId, name: "Display Cup", slug: `e2e-ad-${org.run}`, status: "draft" }).select("id").single();
    // two divisions that exist already: one that never stored the choice, one that chose scores only
    await org.db.from("divisions").insert({ event_id: ev!.id, name: "Old default", sort_order: 1 });
    await org.db.from("divisions").insert({ event_id: ev!.id, name: "Old scores only", sort_order: 2, live_settings: { spectatorAttemptDisplay: "score_only" } as never });
    await org.signIn(page, `/org/events/${ev!.id}/divisions`);
    await page.getByLabel("New division name").fill("Pro Men");
    await page.getByRole("button", { name: "+ Add division" }).click();
    await expect(page.getByTestId("scoring-panel")).toBeVisible({ timeout: 60_000 });
    const rows = (await org.db.from("divisions").select("name, live_settings").eq("event_id", ev!.id)).data ?? [];
    const display = (name: string) => (rows.find((r) => r.name === name)?.live_settings as { spectatorAttemptDisplay?: string } | undefined)?.spectatorAttemptDisplay;
    expect(display("Pro Men")).toBe("trick_score");
    expect(display("Old default")).toBeUndefined();
    expect(display("Old scores only")).toBe("score_only");
  } finally {
    await org.cleanup();
  }
});
