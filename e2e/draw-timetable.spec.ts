import { writeFileSync, readFileSync } from "node:fs";
import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

// Phase 4b, on a throwaway organisation: the 24-rider Knockout draw (15 heats in four columns), moving riders by drag and by tap,
// hand-placing, locking; the same ladder built by hand in the custom builder until the checker is green; warm-up; the run order with
// pins, plans and exports. Everything is removed by the ledger.
type Organiser = Awaited<ReturnType<typeof createOrganiser>>;
let org: Organiser;
let eventId = "";
let divisionId = "";
let slug = "";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

async function makeDivision(name: string, formatOverrides: object | null = {}, riderCount = 24, sortOrder = 1) {
  const { data: fmt } = await org.db.from("format_templates").select("id, version").is("organisation_id", null).eq("key", "heats4-top2-single-elim").order("version", { ascending: false }).limit(1).single();
  const { data: model } = await org.db.from("scoring_models").select("id").is("organisation_id", null).limit(1).single();
  const { data: div } = await org.db
    .from("divisions")
    .insert({ event_id: eventId, name, sort_order: sortOrder, scoring_model_id: model!.id, ...(formatOverrides === null ? {} : { format_template_id: fmt!.id, format_params: formatOverrides as never }) })
    .select("id")
    .single();
  const { data: riders } = await org.db.from("riders").insert(Array.from({ length: riderCount }, (_, i) => ({ organisation_id: org.orgId, first_name: `Rider${pad(i + 1)}`, last_name: "Test" }))).select("id, first_name");
  const sorted = riders!.sort((a, b) => a.first_name.localeCompare(b.first_name));
  await org.db.from("entries").insert(sorted.map((r, i) => ({ event_id: eventId, division_id: div!.id, rider_id: r.id, seed: i + 1, status: "confirmed", source: "manual" })));
  return div!.id;
}

// the owner's real event: Knockout 3 / 3 / 3, 1 advances, final of 2, by original seeding, breaks 2, every heat 10 minutes
const KNOCKOUT_24 = {
  generator: { params: { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: "by_original_seed" } },
  timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 2, defaultBreakAfterRoundMin: 2 },
  roundDurationMin: { SF: 10, F: 10 },
};

test.beforeEach(async () => {
  org = await createOrganiser();
  slug = `e2e-dt-${org.run}`;
  const { data: ev } = await org.db
    .from("events")
    .insert({ organisation_id: org.orgId, name: `E2E Draw ${org.run}`, slug, status: "published", timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11", settings: {} })
    .select("id")
    .single();
  eventId = ev!.id;
});
test.afterEach(async () => {
  await org?.cleanup();
});

const drawUrl = () => `/org/events/${eventId}/draw?division=${divisionId}`;
const seatOf = (page: import("@playwright/test").Page, heat: string, n: number) => page.locator(`[data-seat="${heat}:${n}"]`);

test("Draw: generate the 24-rider Knockout, drag and tap riders, hand-place, warnings, lock and unlock with a reason", async ({ page }) => {
  test.setTimeout(240_000);
  divisionId = await makeDivision("Pro Men", KNOCKOUT_24);
  await page.setViewportSize({ width: 1400, height: 2400 }); // tall, so both seats of the mouse drag are on screen
  await org.signIn(page, drawUrl());

  await expect(page.getByTestId("draw-status")).toHaveText("No draw yet");
  await page.getByRole("button", { name: "Generate draw" }).click();
  await expect(page.getByTestId("draw-count")).toHaveText("4 rounds, 15 heats");
  await expect(page.getByTestId("round-column")).toHaveCount(4);
  await expect(page.getByTestId("heat-card")).toHaveCount(15);
  // later rounds show placeholders "1st H1 · 1st H2"
  const r2h1 = page.locator('[data-heat="R2-H1"]');
  await expect(r2h1.getByTestId("placeholder")).toHaveText(["1st H1", "1st H2"]);
  await expect(page.getByTestId("draw-checks-ok")).toBeVisible();
  // stored: 15 heats
  expect((await org.db.from("heats").select("id").eq("division_id", divisionId)).data).toHaveLength(15);

  // drag a rider onto another seat (desktop): they swap
  const from = seatOf(page, "R1-H1", 0);
  const to = seatOf(page, "R1-H2", 0);
  const nameBefore = { a: await from.innerText(), b: await to.innerText() };
  const fb = (await from.getByRole("button").first().boundingBox())!;
  const tb = (await to.boundingBox())!;
  await page.mouse.move(fb.x + 10, fb.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(fb.x + 10 + ((tb.x + 20 - fb.x - 10) * i) / 12, fb.y + 10 + ((tb.y + 20 - fb.y - 10) * i) / 12);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await expect(seatOf(page, "R1-H1", 0)).toContainText(nameBefore.b.split("\n").find((l) => /Rider\d+/.test(l))!);
  await expect(page.getByTestId("draw-notice")).toContainText("Swapped");
  await expect(page.locator('[data-heat="R1-H1"]').getByTestId("by-hand")).toBeVisible();

  // tap alternative: tap a rider, tap the destination seat, "Swap with …"
  await seatOf(page, "R1-H3", 0).getByRole("button").first().click();
  await expect(page.getByTestId("tap-bar")).toContainText("is picked");
  await seatOf(page, "R1-H4", 1).getByRole("button").first().click();
  await expect(page.getByTestId("tap-bar")).toContainText("That seat is taken by");
  await page.getByTestId("tap-bar").getByRole("button", { name: /^Swap with / }).click();
  await expect(page.getByTestId("draw-notice")).toContainText("Swapped");
  await expect(page.getByTestId("draw-checks-ok")).toBeVisible();

  // hand-place a rider into a seat that waits for a result ("1st H1")
  await page.getByRole("button", { name: /Options for Heat 9, seat 1/ }).click();
  const choices = await page.getByLabel("Place a rider here").locator("option").allTextContents();
  await page.getByLabel("Place a rider here").selectOption({ label: choices.find((o) => /Rider24/.test(o))! });
  await expect(page.locator('[data-heat="R2-H1"]').getByTestId("by-hand")).toBeVisible();
  await expect(page.getByTestId("round-by-hand")).toHaveCount(1);

  // the same rider in two heats of Round 1: a warning, not a block
  await page.getByRole("button", { name: /Options for Heat 2, seat 3/ }).click();
  const opts = await page.getByLabel("Place a rider here").locator("option").allTextContents();
  await page.getByLabel("Place a rider here").selectOption({ label: opts.find((o) => /Rider05/.test(o))! });
  await expect(page.getByTestId("draw-warning").filter({ hasText: "is in two heats of Round 1" })).toBeVisible();

  // add an extra heat, a seat, and rename
  await page.getByRole("button", { name: "+ Heat" }).first().click();
  await expect(page.getByTestId("draw-warning").filter({ hasText: "Round 1 expects 24 riders" })).toBeVisible();
  await expect(page.getByTestId("heat-card")).toHaveCount(16);
  await page.getByRole("button", { name: "Rename Round 2" }).click();
  await page.getByLabel("Rename Round 2").fill("Quarter-finals");
  await page.getByLabel("Rename Round 2").press("Enter");
  await expect(page.getByRole("button", { name: "Rename Quarter-finals" })).toBeVisible();
  // every change is audited
  await expect
    .poll(async () => ((await org.db.from("audit_log").select("id").eq("row_id", divisionId).eq("action", "draw_edited")).data ?? []).length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(6);

  // lock: nothing can be moved; unlock needs a reason
  await page.getByRole("button", { name: "Lock draw" }).click();
  await expect(page.getByTestId("draw-status")).toHaveText("Locked");
  await expect(page.getByRole("button", { name: /Options for Heat 1/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Unlock draw" }).click();
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeDisabled();
  await page.getByLabel(/Why are you unlocking/).fill("Rider 7 is injured");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByTestId("draw-status")).toHaveText("Draft — you can still change it");
  const { data: unlock } = await org.db.from("audit_log").select("reason").eq("row_id", divisionId).eq("action", "draw_unlocked");
  expect(unlock).toEqual([{ reason: "Rider 7 is injured" }]);

  // regenerate: one confirmation, the question names what was arranged by hand; refused once a heat has started
  await page.getByRole("button", { name: "Regenerate draw" }).click();
  await expect(page.getByText(/You arranged .* by hand/)).toBeVisible();
  await page.getByRole("button", { name: "Regenerate and keep my hand-arranged heats" }).click();
  await expect(page.getByTestId("draw-notice")).toContainText("Draw made");
  const heats = (await org.db.from("heats").select("id").eq("division_id", divisionId)).data!;
  await org.db.from("heats").update({ status: "running", started_at: new Date().toISOString() }).eq("id", heats[0].id);
  await page.reload();
  await expect(page.getByRole("button", { name: "Regenerate draw" })).toBeDisabled();
  await expect(page.getByText(/A heat has started/).first()).toBeVisible();
});

test("Custom ladder: build the 24-rider Knockout by hand until the checker is green, apply it, and get the same 15 heats", async ({ page }) => {
  test.setTimeout(300_000);
  divisionId = await makeDivision("Pro Men", null);
  await org.signIn(page, `/org/events/${eventId}/divisions`);
  await page.getByRole("tab", { name: "Format" }).click();
  await page.getByRole("radio", { name: "Custom ladder" }).check();
  const builder = page.getByTestId("ladder-builder");
  await expect(builder).toBeVisible();
  await expect(page.getByTestId("ladder-status")).toContainText("Add a round to start the ladder");

  // the division's three numbers: 3 riders per heat, minimum 3, maximum 3
  await page.locator("#lb-min").fill("3");
  await page.locator("#lb-max").fill("3");
  // whiteboard: four named rounds; Round 1 gets eight heats of 3 (the division's riders per heat)
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "+ Add round" }).click();
  await expect(page.getByTestId("builder-round")).toHaveCount(4);
  await page.getByLabel("Name of round 3").fill("Semi-finals");
  await page.getByLabel("Name of round 3").press("Enter");
  await page.getByLabel("Name of round 4").fill("Final");
  await page.getByLabel("Name of round 4").press("Enter");
  const round = (n: number) => page.getByTestId("builder-round").nth(n - 1);
  for (let i = 0; i < 8; i++) await round(1).getByRole("button", { name: "+ Add heat" }).click();
  await expect(round(1).getByTestId("builder-heat")).toHaveCount(8);
  await expect(round(1).getByTestId("seat-count").first()).toHaveText("3 seats");
  // "24 riders, 21 seats": take a seat away to see the fault, then put it back
  await page.getByLabel("One seat fewer in Round 1 heat 8").click();
  await expect(page.getByTestId("ladder-fault").filter({ hasText: "24 riders, 23 seats — 1 rider has no heat." })).toBeVisible();
  await page.getByLabel("One seat more in Round 1 heat 8").click();

  // Round 1: choose seeds with the dropdowns for the first heat, the rest in order with the one-tap fix
  await page.getByLabel("R1 H1, seat 1", { exact: true }).selectOption({ label: "Seed 1 · Rider01 Test" });
  await page.getByLabel("R1 H1, seat 2", { exact: true }).selectOption({ label: "Seed 16 · Rider16 Test" });
  await page.getByLabel("R1 H1, seat 3", { exact: true }).selectOption({ label: "Seed 17 · Rider17 Test" });
  // a seed cannot be used twice: it is greyed out and says where it went
  await expect(page.getByLabel("R1 H2, seat 1", { exact: true }).locator("option", { hasText: "Seed 1 ·" })).toBeDisabled();
  await expect(page.getByLabel("R1 H2, seat 1", { exact: true }).locator("option", { hasText: "Seed 1 ·" })).toContainText("→ R1 H1");
  await page.getByTestId("ladder-fix").filter({ hasText: "Fill the remaining seats in order" }).first().click();
  await expect(page.getByTestId("ladder-fault").filter({ hasText: "empty seat" }).filter({ hasText: "R1" })).toHaveCount(0);

  // later rounds: heats of 2 (− once per heat), so the checker shows the minimum of 3 is broken
  for (const [r, heats] of [[2, 4], [3, 2], [4, 1]] as const) {
    for (let i = 0; i < heats; i++) await round(r).getByRole("button", { name: "+ Add heat" }).click();
    for (let h = 1; h <= heats; h++) await page.getByLabel(`One seat fewer in ${["", "", "Round 2", "Semi-finals", "Final"][r]} heat ${h}`).click();
  }
  await expect(page.getByTestId("ladder-fault").filter({ hasText: "minimum is 3" }).first()).toBeVisible();
  // one tap per round: "Allow heats of 2 in …"
  for (const name of ["Round 2", "Semi-finals", "Final"]) await page.getByTestId("ladder-fix").filter({ hasText: `Allow heats of 2 in ${name}` }).first().click();
  await expect(page.getByTestId("ladder-fault").filter({ hasText: "minimum is 3" })).toHaveCount(0);

  // Round 2: the dropdown lists the places of Round 1, grouped, used ones greyed with where they went
  await page.getByLabel("R2 H1, seat 1", { exact: true }).selectOption({ label: "1st H1" });
  await expect(page.getByLabel("R2 H1, seat 2", { exact: true }).locator("option", { hasText: "1st H1" })).toBeDisabled();
  await expect(page.getByLabel("R2 H1, seat 2", { exact: true }).locator("option", { hasText: "1st H1" })).toContainText("→ R2 H1");
  // the reverse gesture: "1st →" on a heat sends that place to a seat
  await round(1).getByTestId("builder-heat").nth(1).getByRole("button", { name: "1st →" }).click();
  await expect(page.getByTestId("sending-bar")).toContainText("Sending 1st of H2");
  await page.getByLabel("R2 H1, seat 2", { exact: true }).locator("xpath=ancestor::li[1]").getByRole("button", { name: "Put here" }).click();
  await expect(page.getByLabel("R2 H1, seat 2", { exact: true })).toHaveValue("place:R1:2:1");

  // the checker still has things to say: empty seats in rounds 2–4; one tap fills them in order
  await expect(page.getByTestId("ladder-status")).toContainText("Not complete yet");
  for (let i = 0; i < 3; i++) await page.getByTestId("ladder-fix").filter({ hasText: "Fill the remaining seats in order" }).first().click().catch(() => undefined);
  await expect(page.getByTestId("ladder-status")).toContainText("Ladder complete — 15 heats, 24 riders, every place accounted for");
  await expect(page.getByTestId("ladder-fault")).toHaveCount(0);
  // recommendations are amber and never block
  await expect(page.getByTestId("ladder-recommendation").filter({ hasText: "Final of 2" })).toBeVisible();

  // apply to draw: saved as my format, the division's format, the draw is made and the Draw step opens
  await page.getByRole("button", { name: "Apply to draw" }).click();
  await expect(page).toHaveURL(new RegExp(`/org/events/${eventId}/draw\\?division=`));
  await expect(page.getByTestId("draw-count")).toHaveText("4 rounds, 15 heats");
  await expect(page.getByTestId("round-column")).toHaveCount(4);
  await expect(page.locator('[data-heat="R2-H1"]').getByTestId("placeholder")).toHaveText(["1st H1", "1st H2"]);
  expect((await org.db.from("heats").select("id").eq("division_id", divisionId)).data).toHaveLength(15);
  // it is an organisation format preset
  const { data: preset } = await org.db.from("format_templates").select("json").eq("organisation_id", org.orgId);
  expect((preset![0].json as { kind: string }).kind).toBe("ladder");
});

test("Warm-up, run order and timetable: warm-up 5 + heat 10, breaks of 2, pin the first heat at 10:00, Plan B, exports", async ({ page, context }) => {
  test.setTimeout(300_000);
  divisionId = await makeDivision("Pro Men", KNOCKOUT_24);

  // the text preview states the total time; adding a 5-minute warm-up changes it
  await org.signIn(page, `/org/events/${eventId}/divisions`);
  await page.getByRole("tab", { name: "Format" }).click();
  await page.getByLabel("Preview with", { exact: true }).fill("24");
  await expect(page.getByTestId("time-sentence")).toHaveText("15 heats · 10 min · about 3 h with 2-minute breaks");
  await page.locator("#warm-up-single").fill("5");
  await expect(page.getByTestId("time-sentence")).toHaveText("15 heats · 5 + 10 min · about 4 h with 2-minute breaks");
  await page.getByRole("button", { name: /^Save format for/ }).click();
  await expect(page.getByText(/Format saved for/).first()).toBeVisible();

  await page.goto(drawUrl());
  await page.getByRole("button", { name: "Generate draw" }).click();
  await expect(page.getByTestId("draw-count")).toHaveText("4 rounds, 15 heats");
  await expect(page.locator('[data-heat="R1-H1"]')).toContainText("5 + 10 min");
  expect((await org.db.from("heats").select("warm_up_sec").eq("division_id", divisionId)).data!.every((h) => h.warm_up_sec === 300)).toBe(true);
  await page.getByRole("button", { name: "Lock draw" }).click();
  await expect(page.getByTestId("draw-status")).toHaveText("Locked");

  // run order: Saturday
  await page.goto(`/org/events/${eventId}/schedule`);
  await page.getByLabel("Day").selectOption({ index: 0 });
  await page.getByLabel("Name of a new empty plan").fill("Plan A – Good wind");
  await page.getByRole("button", { name: "New plan" }).click();
  await expect(page.getByTestId("run-header")).toContainText("Plan A – Good wind");
  await expect(page.getByTestId("unscheduled-group")).toHaveCount(4);
  for (let i = 0; i < 4; i++) await page.getByTestId("unscheduled-group").first().getByRole("button", { name: /^Add all/ }).click();
  await expect(page.getByTestId("run-row")).toHaveCount(15);
  await expect(page.getByTestId("unscheduled-group")).toHaveCount(0);
  // breaks of 2 between every heat
  await page.getByLabel("Break after every heat").fill("2");
  await page.getByRole("button", { name: "Set for all heats" }).click();
  // pin the first heat's start at 10:00: every time follows
  await page.getByRole("button", { name: /^Start of row 1:/ }).click();
  await page.getByLabel("Pin start time of row 1").fill("10:00");
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  const rows = page.getByTestId("run-row");
  await expect(rows.nth(0).getByTestId("row-start")).toContainText("10:00");
  await expect(rows.nth(0).getByTestId("row-warmup")).toContainText("warm-up 09:55");
  await expect(rows.nth(0).getByTestId("row-end")).toContainText("ends 10:10");
  for (let k = 0; k < 15; k++) {
    await expect(rows.nth(k).getByTestId("row-start")).toContainText(hhmm(600 + k * 17));
  }
  await expect(rows.nth(14).getByTestId("row-end")).toContainText("ends 14:08");
  await expect(page.getByTestId("run-finish")).toHaveText("Projected finish 14:08");
  await expect(page.getByTestId("run-left")).toHaveText("15 heats left");
  // the same in the database (plans are saved at once)
  await expect
    .poll(async () => Object.values(((await org.db.from("schedule_plans").select("anchors").eq("event_id", eventId)).data ?? [])[0]?.anchors as Record<string, string>), { timeout: 30_000 })
    .toEqual(["10:00"]);
  expect(((await org.db.from("schedule_plans").select("items, active").eq("event_id", eventId)).data ?? [])[0]).toMatchObject({ active: true });

  // a break and a note; move a row by tap (↑), then take them out again
  await page.getByLabel("Break name").fill("Lunch");
  await page.getByLabel("Minutes", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Add break" }).click();
  await expect(rows).toHaveCount(16);
  await page.getByRole("button", { name: "Move row 16 up" }).click();
  await expect(rows.nth(14).getByRole("textbox").first()).toHaveValue("Lunch");
  await page.getByRole("button", { name: "Take row 15 out of the run order" }).click();
  await expect(rows).toHaveCount(15);

  // Plan B: duplicate, name it, activate
  await page.getByLabel("Name for the copy").fill("Plan B – Bad wind");
  await page.getByRole("button", { name: "Duplicate plan" }).click();
  await expect(page.getByLabel("Plan", { exact: true })).toContainText("Plan B – Bad wind");
  await expect(page.getByTestId("run-header")).toContainText("Plan B – Bad wind");
  await page.getByRole("button", { name: "Activate this plan" }).click();
  await page.getByRole("button", { name: "Yes, activate it" }).click();
  await expect(page.getByLabel("Plan", { exact: true }).locator("option:checked")).toContainText("(active)");
  const { data: after } = await org.db.from("schedule_plans").select("name, active").eq("event_id", eventId).order("created_at");
  expect(after!.map((p) => [p.name, p.active])).toEqual([["Plan A – Good wind", false], ["Plan B – Bad wind", true]]);
  await expect(page.getByTestId("run-finish")).toHaveText("Projected finish 14:08");

  // live changes: hold and resume at a time
  await page.getByRole("button", { name: "Hold", exact: true }).click();
  await expect(page.getByTestId("run-hold")).toBeVisible();
  await page.getByLabel("Resume at").fill("11:00");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByTestId("run-hold")).toHaveCount(0);

  // exports: PNG download and the print page for PDF
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export PNG" }).click()]);
  const file = await download.path();
  const png = readFileSync(file!);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.length).toBeGreaterThan(5000);
  const [popup] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: "Export PDF" }).click()]);
  await popup.waitForLoadState();
  await expect(popup.getByTestId("schedule-print-table").locator("tbody tr")).toHaveCount(15);
  await expect(popup.getByRole("columnheader")).toHaveText(["Division", "Session", "Warm-up", "Start", "Duration", "End", "Break"]);
  await expect(popup.getByText("Times are estimates and update live")).toBeVisible();
  const pdf = await popup.pdf({ format: "A4" });
  writeFileSync(`${process.env.TMPDIR ?? "/tmp"}/e2e-timetable-${org.run}.pdf`, pdf);
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");

  // the printed draw shows each heat's start time from the active run order, and says the times are estimates
  await page.goto(`/org/events/${eventId}/draw/print?division=${divisionId}`);
  await expect(page.getByTestId("print-page")).toHaveCount(1);
  await expect(page.getByTestId("print-heat")).toHaveCount(15);
  await expect(page.getByTestId("print-heat-time")).toHaveCount(15);
  await expect(page.getByTestId("print-heat-time").first()).toHaveText("10:00");
  await expect(page.getByTestId("print-heat-time").nth(1)).toHaveText("10:17");
  await expect(page.getByTestId("print-page")).toContainText("Times are estimates");

  // the dashboard: missing list, share cards with link and QR
  await page.goto(`/org/events/${eventId}`);
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await expect(page.getByTestId("share-join-link")).toHaveText(new RegExp(`/e/${slug}/join$`));
  await expect(page.getByTestId("share-public-link")).toHaveText(new RegExp(`/e/${slug}$`));
  await expect(page.getByTestId("share-join").getByRole("img")).toBeVisible();
  await expect(page.getByTestId("dashboard-missing")).toContainText("No judge seats yet.");
});

test("Custom ladder: the builder follows the Preview with number; Apply to draw uses the real riders and says what differs", async ({ page }) => {
  test.setTimeout(240_000);
  divisionId = await makeDivision("Pro Men", null, 22);
  await org.signIn(page, `/org/events/${eventId}/divisions`);
  await page.getByRole("tab", { name: "Format" }).click();
  await page.getByRole("radio", { name: "Custom ladder" }).check();
  const builder = page.getByTestId("ladder-builder");
  await expect(builder).toBeVisible();
  const preview = page.getByLabel("Preview with", { exact: true });
  // the box is never locked, even though the division has confirmed riders; it starts at the division's 22
  await expect(preview).toBeEnabled();
  await expect(preview).toHaveValue("22");
  await expect(page.getByTestId("designing-for")).toHaveText("Designing for 22 riders: the division has 22 confirmed.");

  await page.locator("#lb-min").fill("3");
  await page.locator("#lb-max").fill("3");
  await page.getByRole("button", { name: "+ Add round" }).click();
  for (let i = 0; i < 7; i++) await builder.getByRole("button", { name: "+ Add heat" }).click();
  // 7 heats of 3 = 21 seats
  await preview.fill("24");
  await expect(page.getByTestId("designing-for")).toHaveText("Designing for 24 riders (the preview number above); the division has 22 confirmed.");
  await expect(page.getByTestId("ladder-fault").filter({ hasText: "24 riders, 21 seats — 3 riders have no heat." })).toBeVisible();
  await expect(page.getByTestId("ladder-recommendation").first()).toContainText("24 riders");
  await preview.fill("20");
  await expect(page.getByTestId("ladder-fault").filter({ hasText: "20 riders, 21 seats — 1 seat has no rider." })).toBeVisible();
  await expect(page.getByTestId("ladder-fault").filter({ hasText: "24 riders" })).toHaveCount(0);

  // design for 24: one more heat, the remaining seats filled in order; the ladder is complete
  await preview.fill("24");
  await builder.getByRole("button", { name: "+ Add heat" }).click();
  await page.getByTestId("ladder-fix").filter({ hasText: "Fill the remaining seats in order" }).first().click();
  await expect(page.getByTestId("ladder-status")).toContainText("Ladder complete — 8 heats, 24 riders");
  // seeds 23 and 24 exist in the design but nobody holds them yet: the dropdown names real riders only
  await expect(page.getByTestId("apply-difference")).toHaveText("Designed for 24, the division has 22 — 2 seats will be empty.");

  await page.getByRole("button", { name: "Apply to draw" }).click();
  await expect(page).toHaveURL(new RegExp(`/org/events/${eventId}/draw\\?division=`));
  // the draw has all 24 seats of the design, 22 with a rider and 2 empty
  await expect(page.getByTestId("seat")).toHaveCount(24);
  await expect(page.getByTestId("empty-seat")).toHaveCount(2);
});

const lycraSettings = () => {
  const file = JSON.parse(readFileSync("presets/identification/schemes.json", "utf8")) as { palette: unknown; schemes: Array<{ id: string }> };
  const scheme = { ...file.schemes.find((s) => s.id === "vests-per-heat")!, palette: file.palette };
  return { identification: { scheme, basedOn: "vests-per-heat", allowDivisionOverride: false } };
};

/** Number of pages and the first page's size in points, read from the PDF bytes. */
function pdfFacts(pdf: Buffer) {
  const text = pdf.toString("latin1");
  const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const box = text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  return { pages, width: Number(box?.[1]), height: Number(box?.[2]) };
}

test("Print / PDF and PNG of the draw: one landscape page, lycra colours as colour and as words, logo, event, division, date; two pages only for a round of more than 8 heats", async ({ page }) => {
  test.setTimeout(300_000);
  await org.db.from("events").update({ settings: lycraSettings() as never, branding: { logoUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='%23111'/></svg>" } as never }).eq("id", eventId);
  divisionId = await makeDivision("Pro Men", KNOCKOUT_24);
  await org.signIn(page, drawUrl());
  await page.getByRole("button", { name: "Generate draw" }).click();
  await expect(page.getByTestId("draw-count")).toHaveText("4 rounds, 15 heats");

  // the Draw step links to the print page
  const printUrl = `/org/events/${eventId}/draw/print?division=${divisionId}`;
  await page.goto(printUrl);
  await expect(page.getByTestId("print-page")).toHaveCount(1);
  await expect(page.getByTestId("print-title")).toHaveText(`E2E Draw ${org.run}`);
  await expect(page.getByTestId("print-subtitle")).toHaveText("Pro Men · Sat, 10 Oct 2026");
  await expect(page.getByTestId("print-page").locator("img").first()).toBeVisible();
  await expect(page.getByTestId("print-round").locator("h2")).toHaveText(["Round 1", "Round 2", "Semi-finals", "Final"]);
  await expect(page.getByTestId("print-heat")).toHaveCount(15);
  await expect(page.getByTestId("print-heat-title").first()).toHaveText("Heat 1");
  // no run order yet: no times, no "estimates" line
  await expect(page.getByTestId("print-heat-time")).toHaveCount(0);

  // every Round 1 seat: the real lycra colour AND its name as text
  const tags = page.getByTestId("print-tag");
  await expect(tags).toHaveCount(24);
  const first = tags.first();
  await expect(first).toHaveText("RED");
  await expect(first).toHaveAttribute("data-hex", /^#[0-9a-f]{6}$/i);
  for (const name of ["RED", "YELLOW", "BLUE"]) await expect(tags.filter({ hasText: name }).first()).toBeVisible();

  // colours are forced to print: print media, exact colour adjustment, a real background colour
  await page.emulateMedia({ media: "print" });
  const style = await first.evaluate((el) => {
    const c = getComputedStyle(el) as CSSStyleDeclaration & { printColorAdjust?: string };
    return { adjust: c.printColorAdjust ?? c.getPropertyValue("print-color-adjust") ?? c.getPropertyValue("-webkit-print-color-adjust"), background: c.backgroundColor };
  });
  expect(style.adjust).toBe("exact");
  expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(style.background).not.toBe("rgb(255, 255, 255)");
  // the whole ladder is inside one A4 landscape page (297 × 210 mm)
  const fit = await page.getByTestId("print-ladder").evaluate((el) => {
    const pageEl = el.closest("[data-testid=print-page]")!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { top: r.top - pageEl.top, left: r.left - pageEl.left, right: pageEl.right - r.right, bottom: pageEl.bottom - r.bottom, pageW: pageEl.width, pageH: pageEl.height };
  });
  expect(fit.top).toBeGreaterThanOrEqual(0);
  expect(fit.left).toBeGreaterThanOrEqual(0);
  expect(fit.right).toBeGreaterThanOrEqual(0);
  expect(fit.bottom).toBeGreaterThanOrEqual(0);
  expect(Math.abs(fit.pageW / fit.pageH - 297 / 210)).toBeLessThan(0.01);
  // the PDF: one landscape A4 page, the colours still there without "background graphics"
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: false });
  const facts = pdfFacts(pdf);
  expect(facts.pages).toBe(1);
  expect(facts.width).toBeGreaterThan(facts.height);
  expect(Math.abs(facts.width - 841.89)).toBeLessThan(2);
  writeFileSync(`${process.env.TMPDIR ?? "/tmp"}/e2e-draw-${org.run}.pdf`, pdf);
  await page.emulateMedia({ media: "screen" });

  // PNG of the same page
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-png").click()]);
  expect(download.suggestedFilename()).toBe("draw-pro-men.png");
  const png = readFileSync((await download.path())!);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2376, 1680]);
  expect(png.length).toBeGreaterThan(20_000);

  // a round of more than 8 heats: two pages, in the PDF and as two pictures
  const big = await makeDivision("Open", KNOCKOUT_24, 30, 2);
  await page.goto(`/org/events/${eventId}/draw?division=${big}`);
  await page.getByRole("button", { name: "Generate draw" }).click();
  await expect(page.getByTestId("draw-count")).toContainText("heats");
  await page.goto(`/org/events/${eventId}/draw/print?division=${big}`);
  await expect(page.getByTestId("print-page")).toHaveCount(2);
  await expect(page.getByTestId("print-page").first()).toContainText("Page 1 of 2");
  await page.emulateMedia({ media: "print" });
  const pdf2 = await page.pdf({ preferCSSPageSize: true });
  expect(pdfFacts(pdf2).pages).toBe(2);
  await page.emulateMedia({ media: "screen" });
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  await page.getByTestId("export-png").click();
  await expect.poll(() => downloads.length).toBe(2);
  expect(downloads.sort()).toEqual(["draw-open-1.png", "draw-open-2.png"]);
});
