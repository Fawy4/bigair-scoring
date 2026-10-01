import { randomUUID } from "node:crypto";
import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

// fix-run-order-duration, on a throwaway organisation: two divisions are drawn and locked on the Draw screen, both go into today's run order, then the second
// division's draw is made again so one of its heats is gone while a run-order row still names it (what happened to Demo Cup). The head console and the Run order
// step must both open, show the problem on that row, and keep working for every other row. Before the fix both pages ended in "Application error".
const pad = (n: number) => String(n).padStart(2, "0");

test("two locked divisions, one run-order row whose heat is gone: head console and Run order step both open and flag the row", async ({ page }) => {
  test.setTimeout(300_000);
  const org = await createOrganiser();
  try {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
    const { data: ev } = await org.db
      .from("events")
      .insert({ organisation_id: org.orgId, name: `E2E RunOrder ${org.run}`, slug: `e2e-ro-${org.run}`, status: "published", timezone: "Africa/Cairo", start_date: today, end_date: today, settings: {} })
      .select("id")
      .single();
    const eventId = ev!.id;
    const { data: fmt } = await org.db.from("format_templates").select("id").is("organisation_id", null).eq("key", "heats4-top2-single-elim").order("version", { ascending: false }).limit(1).single();
    const { data: model } = await org.db.from("scoring_models").select("id").is("organisation_id", null).limit(1).single();
    const divisions: Record<string, string> = {};
    for (const [i, name] of ["Pro Men", "Pro Women"].entries()) {
      const { data: div } = await org.db.from("divisions").insert({ event_id: eventId, name, sort_order: i + 1, scoring_model_id: model!.id, format_template_id: fmt!.id, format_params: {} }).select("id").single();
      const { data: riders } = await org.db.from("riders").insert(Array.from({ length: 6 }, (_, r) => ({ organisation_id: org.orgId, first_name: `${name.split(" ")[1]}${pad(r + 1)}`, last_name: "Test" }))).select("id, first_name");
      await org.db.from("entries").insert(riders!.sort((a, b) => a.first_name.localeCompare(b.first_name)).map((r, s) => ({ event_id: eventId, division_id: div!.id, rider_id: r.id, seed: s + 1, status: "confirmed", source: "manual" })));
      divisions[name] = div!.id;
    }

    // 1. lock both draws on the Draw screen
    await org.signIn(page, `/org/events/${eventId}/draw?division=${divisions["Pro Men"]}`);
    for (const name of ["Pro Men", "Pro Women"]) {
      if (name !== "Pro Men") await page.goto(`/org/events/${eventId}/draw?division=${divisions[name]}`);
      await page.getByRole("button", { name: "Generate draw" }).click();
      await expect(page.getByTestId("draw-count")).toHaveText("2 rounds, 3 heats");
      await page.getByRole("button", { name: "Lock draw" }).click();
      await expect(page.getByTestId("draw-status")).toContainText(/locked/i);
    }
    const { data: heats } = await org.db.from("heats").select("id, division_id, number, duration_sec").eq("event_id", eventId).order("division_id").order("number");
    expect(heats).toHaveLength(6);
    expect(heats!.every((h) => h.duration_sec > 0)).toBe(true); // every stored heat has a length

    // 2. both divisions in today's run order, the first pinned
    const items = heats!.map((h, i) => ({ id: `r${i + 1}`, kind: "heat", heatId: h.id }));
    await org.db.from("schedule_plans").insert({ event_id: eventId, day: today, name: "Plan A", active: true, items: items as never, anchors: { r1: "10:00" } });

    // 3. the second division's draw is made again: one of its heats goes (the database deletes it), and a row naming a heat that no longer exists stays
    const womenFinal = heats!.filter((h) => h.division_id === divisions["Pro Women"]).at(-1)!;
    await org.db.from("heats").delete().eq("id", womenFinal.id);
    const ghost = randomUUID();
    const { data: plan } = await org.db.from("schedule_plans").select("id, items").eq("event_id", eventId).single();
    await org.db.from("schedule_plans").update({ items: [...(plan!.items as object[]).filter((i) => (i as { heatId?: string }).heatId !== womenFinal.id), { id: "r99", kind: "heat", heatId: ghost }] as never }).eq("id", plan!.id);

    // 4. the head console opens (the organiser acts as head judge) and shows the problem on that row
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/head/${eventId}`);
    await expect(page.getByTestId("run-order")).toBeVisible();
    await expect(page.getByTestId("order-row")).toHaveCount(5);
    await expect(page.getByTestId("order-gone")).toHaveCount(1);
    await expect(page.getByTestId("order-problem")).toContainText("no longer in the draw");
    await expect(page.locator("body")).not.toContainText("Application error");

    // 5. the Run order step opens, lists every row with its times, flags the row, and the row can be taken out
    await page.goto(`/org/events/${eventId}/schedule`);
    await expect(page.getByTestId("run-order")).toBeVisible();
    await expect(page.getByTestId("run-row")).toHaveCount(6);
    await expect(page.getByTestId("row-problem")).toHaveCount(1);
    await expect(page.getByTestId("row-problem")).toContainText("no longer in the draw");
    await expect(page.getByTestId("run-warnings")).toContainText("no longer in the draw");
    await expect(page.getByTestId("row-start").first()).toHaveText(/\d{2}:\d{2}/); // a pin is "not before", so today it may be pushed to now
    await expect(page.getByTestId("row-start").nth(4)).toHaveText(/\d{2}:\d{2}/); // the real heat before the flagged row is still timed; the flagged row itself has no time
    await expect(page.locator("body")).not.toContainText("Application error");
    await page.getByRole("button", { name: "Take row 6 out of the run order" }).click();
    await expect(page.getByTestId("run-row")).toHaveCount(5);
    await expect(page.getByTestId("row-problem")).toHaveCount(0);

    expect(errors, `uncaught page errors: ${errors.join(" | ")}`).toEqual([]);
  } finally {
    await org.cleanup();
  }
});
