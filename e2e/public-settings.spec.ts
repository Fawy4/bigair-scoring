import { expect, test } from "@playwright/test";
import { createOrganiser } from "./organiser";

// Phase 6 settings on the Event step: the big screen's page time and the outside leaderboards that become tabs on the public site.
test("Event step: seconds per big-screen page and outside leaderboards are saved, refused when not https, and show up as a tab on the public site", async ({ page }) => {
  test.setTimeout(180_000);
  const org = await createOrganiser();
  try {
    const slug = `lb-${org.run}`;
    const { data: ev } = await org.db
      .from("events")
      .insert({ organisation_id: org.orgId, name: `Leaderboards ${org.run}`, slug, timezone: "Africa/Cairo", start_date: "2026-10-02", end_date: "2026-10-04", status: "published" })
      .select("id")
      .single();
    await org.signIn(page, `/org/events/${ev!.id}/event`);
    const field = (label: string) => page.getByLabel(label, { exact: true });
    await field("Big screen: seconds per page").fill("12");
    await page.getByRole("button", { name: "+ Add leaderboard" }).click();
    await field("Leaderboard 1 title").fill("Highest Jump");
    await field("Leaderboard 1 web address").fill("http://woo.example.com/hj");
    await page.getByRole("button", { name: /Save event/ }).click();
    await expect(page.getByText("a full web address, starting with https://")).toBeVisible();
    await field("Leaderboard 1 web address").fill("https://woo.example.com/highest-jump");
    await page.getByRole("button", { name: /Save event/ }).click();
    await expect.poll(async () => (await org.db.from("events").select("settings").eq("id", ev!.id).single()).data!.settings, { timeout: 20_000 }).toMatchObject({
      screenRotateSec: 12,
      externalLeaderboards: [{ title: "Highest Jump", url: "https://woo.example.com/highest-jump", embed: false }],
    });
    // the "?" explains it, and the public site has the tab
    await page.getByRole("button", { name: /Help: Other leaderboards/ }).click();
    await expect(page.getByRole("note").filter({ hasText: "Highest Jump — https://" })).toBeVisible();
    await page.goto(`/e/${slug}`);
    await page.getByRole("link", { name: "Highest Jump" }).click();
    await expect(page.getByTestId("leaderboard-open")).toHaveAttribute("href", "https://woo.example.com/highest-jump");
  } finally {
    await org.cleanup();
  }
});
