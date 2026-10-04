import { expect, test } from "./base";
import { addLadder, createLiveWorld } from "./live-world";

// Polish 3, item 5, on a throwaway organisation: "Clear this plan" returns every heat that has not started to "Heats not in the run order" in one click (the reason box is
// optional), removes breaks and pins, keeps heats that already ran, leaves the plan, and writes one audit line.
test("Clear this plan: a plan with 5 heats, a break and a note is emptied in one click; 5 heats are under 'not in the run order'", async ({ page }) => {
  test.setTimeout(300_000);
  const w = await createLiveWorld();
  try {
    const ladder = await addLadder(w);
    const all = [...w.heats, ...Object.values(ladder.heats)];
    const items = [
      ...all.slice(0, 2).map((id, i) => ({ id: `i${i + 1}`, kind: "heat", heatId: id })),
      { id: "lunch", kind: "break", label: "Lunch", durationMin: 30 },
      ...all.slice(2).map((id, i) => ({ id: `j${i + 1}`, kind: "heat", heatId: id })),
      { id: "n1", kind: "note", label: "Wind call" },
    ];
    await w.db.from("schedule_plans").update({ items: items as never, anchors: { i1: "10:00", j1: "13:00" } as never }).eq("id", w.planId);
    await w.org.signIn(page, `/org/events/${w.eventId}/schedule`);
    await expect(page.getByTestId("run-row")).toHaveCount(all.length + 2, { timeout: 60_000 });
    await expect(page.getByTestId("unscheduled-group")).toHaveCount(0);
    await page.getByTestId("clear-plan-open").click();
    await expect(page.getByTestId("clear-plan-panel")).toContainText(`This will return ${all.length} heats to “Heats not in the run order” and remove 2 breaks and notes.`, { timeout: 30_000 });
    await expect(page.getByTestId("clear-plan-reason")).toBeVisible(); // the box stays; it is optional
    await page.getByTestId("clear-plan-confirm").click(); // one click, no reason
    await expect(page.getByTestId("run-row")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("unscheduled-group").getByRole("listitem")).toHaveCount(all.length);
    const row = (await w.db.from("schedule_plans").select("items, anchors, actual_starts, active, name").eq("id", w.planId).single()).data!;
    expect(row.items).toEqual([]);
    expect(row.anchors).toEqual({});
    expect(row.active).toBe(true); // the plan remains, empty
    const audit = (await w.db.from("audit_log").select("reason").eq("event_id", w.eventId).eq("action", "plan_cleared")).data ?? [];
    expect(audit).toEqual([{ reason: "no reason given" }]);
    // reload: still empty
    await page.reload();
    await expect(page.getByTestId("unscheduled-group").getByRole("listitem")).toHaveCount(all.length, { timeout: 60_000 });
  } finally {
    await w.cleanup();
  }
});

test("Clear this plan: heats that already ran stay and the confirmation says so; a typed reason is logged", async ({ page }) => {
  test.setTimeout(300_000);
  const w = await createLiveWorld();
  try {
    const ladder = await addLadder(w);
    const all = [...w.heats, ...Object.values(ladder.heats)];
    const items = all.map((id, i) => ({ id: `i${i + 1}`, kind: "heat", heatId: id }));
    await w.db.from("schedule_plans").update({ items: items as never, anchors: { i1: "10:00", i3: "12:00" } as never }).eq("id", w.planId);
    const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    await w.db.from("heats").update({ status: "published", started_at: ago(90), ended_at: ago(80), published_at: ago(75) }).eq("id", all[0]);
    await w.db.from("heats").update({ status: "ended", started_at: ago(60), ended_at: ago(50) }).eq("id", all[1]);
    await w.org.signIn(page, `/org/events/${w.eventId}/schedule`);
    await expect(page.getByTestId("run-row")).toHaveCount(all.length, { timeout: 60_000 });
    await page.getByTestId("clear-plan-open").click();
    await expect(page.getByTestId("clear-plan-panel")).toContainText(`This will return ${all.length - 2} heats to “Heats not in the run order” and remove 0 breaks and notes. 2 heats already run stay.`, { timeout: 30_000 });
    await page.getByTestId("clear-plan-reason").fill("Wind changed, starting again");
    await page.getByTestId("clear-plan-confirm").click();
    await expect(page.getByTestId("run-row")).toHaveCount(2, { timeout: 30_000 });
    await expect(page.getByTestId("unscheduled-group").getByRole("listitem")).toHaveCount(all.length - 2);
    const row = (await w.db.from("schedule_plans").select("items, anchors").eq("id", w.planId).single()).data!;
    expect((row.items as Array<{ heatId: string }>).map((i) => i.heatId)).toEqual([all[0], all[1]]);
    expect(row.anchors).toEqual({ i1: "10:00" }); // a pin goes with its heat
    const audit = (await w.db.from("audit_log").select("reason").eq("event_id", w.eventId).eq("action", "plan_cleared")).data ?? [];
    expect(audit).toEqual([{ reason: "Wind changed, starting again" }]);
  } finally {
    await w.cleanup();
  }
});
