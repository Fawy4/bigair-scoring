import { expect, test } from "./base";
import { createLiveWorld } from "./live-world";

// Polish 2, item 14, on a throwaway organisation: a day with no plan offers Create (name pre-filled) and Copy another day's plan; the Day list says per day
// which plan is active. Polish 2b, item 6: a copy takes only the heats that have not ended, never the breaks or any pin, and the page says what to add.
test("Run order per day: no-plan day offers Create and Copy; the copy brings only un-run heats and no breaks or pins, and says what to add", async ({ page }) => {
  test.setTimeout(300_000);
  const w = await createLiveWorld();
  try {
    const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date(Date.now() + offset * 86_400_000));
    const tomorrow = day(1);
    const after = day(2);
    await w.db.from("events").update({ end_date: after }).eq("id", w.eventId);
    // today's plan: Heat 1 pinned by hand at 10:00; Heat 2 pinned 11:11 by the console (not hand-set)
    await w.db.from("schedule_plans").update({ anchors: { i1: "10:00", i2: "11:11" } as never }).eq("id", w.planId);
    await w.db.from("schedule_plans").update({ hand_pins: ["i1"] as never }).eq("id", w.planId);
    // a lunch break between the two heats, and Heat 1 has already been run and published
    await w.db.from("schedule_plans").update({ items: [{ id: "i1", kind: "heat", heatId: w.heats[0] }, { id: "lunch", kind: "break", label: "Lunch", durationMin: 45 }, { id: "i2", kind: "heat", heatId: w.heats[1] }] as never }).eq("id", w.planId);
    await w.db.from("heats").update({ status: "published", started_at: new Date(Date.now() - 3_600_000).toISOString(), ended_at: new Date(Date.now() - 3_000_000).toISOString(), published_at: new Date(Date.now() - 2_900_000).toISOString() }).eq("id", w.heats[0]);

    await w.org.signIn(page, `/org/events/${w.eventId}/schedule?day=${tomorrow}`);
    await expect(page.locator("#day-pick")).toHaveValue(tomorrow, { timeout: 60_000 });
    const options = await page.locator("#day-pick option").allTextContents();
    expect(options[0]).toMatch(/· Main active$/);
    expect(options[1]).toMatch(/· no plan$/);
    const empty = page.getByTestId("no-plan-day");
    await expect(empty).toBeVisible();
    await expect(page.locator("#day-plan-name")).toHaveValue(/^Plan A – \w{3} \d{1,2} \w{3}$/);
    await expect(empty.getByTestId("create-day-plan")).toHaveText(/^Create a plan for \w{3} \d{1,2} \w{3}$/);
    const copy = empty.getByTestId("copy-day-plan");
    await expect(copy).toHaveCount(1);
    await expect(copy).toHaveText(/^Copy \w{3} \d{1,2} \w{3}'s plan to \w{3} \d{1,2} \w{3}$/);

    // copy today's plan to tomorrow
    await copy.click();
    await expect(empty).toHaveCount(0, { timeout: 30_000 });
    const copied = (await w.db.from("schedule_plans").select("items, anchors, actual_starts, active, name").eq("event_id", w.eventId).eq("day", tomorrow).single()).data!;
    expect((copied.items as Array<{ heatId?: string; kind: string }>).map((i) => [i.kind, i.heatId])).toEqual([["heat", w.heats[1]]]); // only the heat that has not ended; no lunch
    expect(copied.anchors).toEqual({});
    expect(copied.actual_starts).toEqual({});
    expect(copied.active).toBe(true);
    await expect(page.locator("#day-pick option").nth(1)).toHaveText(/· Plan A – .* active$/);
    await expect(page.getByTestId("copied-note")).toHaveText("Copied 1 heat — add this day's breaks and the first heat's pin");

    // the day after: Create with the name pre-filled
    await page.locator("#day-pick").selectOption(after);
    await expect(page.getByTestId("no-plan-day")).toBeVisible();
    await expect(page.getByTestId("copy-day-plan")).toHaveCount(2);
    await page.getByTestId("create-day-plan").click();
    await expect(page.getByTestId("no-plan-day")).toHaveCount(0, { timeout: 30_000 });
    const created = (await w.db.from("schedule_plans").select("name, active, items").eq("event_id", w.eventId).eq("day", after).single()).data!;
    expect(created.name).toMatch(/^Plan A – /);
    expect(created.active).toBe(true);
    expect(created.items).toEqual([]);
    // a grey button says why
    await page.locator("#new-plan").fill("");
    await expect(page.getByTestId("why-new-plan")).toHaveText("Type a name of at least 2 characters first.");
  } finally {
    await w.cleanup();
  }
});
