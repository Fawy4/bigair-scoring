import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { BrowserContext, Page } from "@playwright/test";

// Polish 2, item 1, on a throwaway organisation: a blocked Publish names the judge and the exact score, "Fix" jumps to it, and once the head judge has marked
// every missing score of that judge Absent the judge's sheet counts as submitted and Publish goes through with no reason. Arrow, EKL and Demo are never touched.
let w: LiveWorld;
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld();
});
test.afterEach(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});

test("Publish blocked: 'Fawy: score … missing' with Fix; Absent on the score and on the Impression / Variety score; then Publish needs no reason", async ({ browser }) => {
  test.setTimeout(360_000);
  const H = w.heats[0];
  // every judge's score is needed in this division (the legacy preset alone does not require it)
  await w.db.from("divisions").update({ scoring_overrides: { heat: { maxAttemptsPerRider: 7 }, panel: { requireAllJudges: true } } as never }).eq("id", w.divisionId);
  await w.db.from("judge_seats").update({ name: "Fawy" }).eq("id", w.seats.j1.id);
  await w.db.from("heats").update({ status: "ended", started_at: new Date(Date.now() - 900_000).toISOString(), ended_at: new Date(Date.now() - 300_000).toISOString() }).eq("id", H);
  const att = (await w.db.from("trick_attempts").insert({ heat_id: H, entry_id: w.entries[0], seq: 1, status: "landed", trick_name: "Left Backroll", direction: "left", client_key: crypto.randomUUID() }).select("id").single()).data!;
  for (const key of ["j2", "j3"] as const) await w.db.from("trick_scores").insert({ attempt_id: att.id, judge_seat_id: w.seats[key].id, score: 7.5, client_key: crypto.randomUUID(), client_rev: 1 });
  for (const key of ["j1", "j2", "j3"] as const)
    for (const [i, entry] of w.entries.entries()) if (!(key === "j1" && i === 0)) await w.db.from("impression_scores").insert({ heat_id: H, entry_id: entry, judge_seat_id: w.seats[key].id, value: 6, client_key: crypto.randomUUID(), client_rev: 1 });
  for (const key of ["j2", "j3"] as const) await w.db.from("judge_sheets").upsert({ event_id: w.eventId, heat_id: H, judge_seat_id: w.seats[key].id, submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });

  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  contexts.push(context);
  await installSupabaseProxy(context);
  const head: Page = await context.newPage();
  await w.signInAs(head, "head", `/head/${w.eventId}`);
  await head.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });

  // the side panel names the judge and the exact thing
  const lines = head.getByTestId("blockers").getByTestId("blocker-line");
  await expect(lines.first()).toHaveText(/Fawy: sheet not submitted — 1 attempt unscored, 1 Impression \/ Variety score missing/, { timeout: 60_000 });
  await expect(head.getByTestId("blockers")).toContainText(/Fawy: score for \w+, attempt 1 missing/);
  await expect(head.getByTestId("blockers")).toContainText(/Fawy: Impression \/ Variety score for \w+ missing/);

  // Publish: the same lines, each with Fix; Fix on the score closes the dialog and opens Fawy's cell of that attempt
  await head.getByTestId("publish").click();
  const dialog = head.getByTestId("console-dialog");
  await expect(dialog.getByTestId("publish-blockers")).toContainText(/Fawy: score for \w+, attempt 1 missing/);
  await dialog.getByTestId("publish-blockers").locator("li").filter({ hasText: "attempt 1 missing" }).getByTestId("publish-fix").click();
  await expect(dialog).toContainText("Fawy");
  await dialog.getByTestId("mark-absent").click();
  await expect(head.getByTestId("blockers")).not.toContainText("attempt 1 missing", { timeout: 40_000 });
  // still held back by the missing Impression / Variety score: Fix on that line opens it; Absent
  await expect(head.getByTestId("blockers")).toContainText("Fawy: sheet not submitted — 1 Impression / Variety score missing");
  await lines.filter({ hasText: /Impression \/ Variety score for \w+ missing/ }).getByTestId("blocker-fix").click();
  // the sheet opens on that rider; Absent, a reason, Save
  await expect(dialog.locator(`[data-testid="sheet-rider"][data-rider="${w.entries[0]}"]`)).toHaveAttribute("aria-pressed", "true");
  await dialog.getByTestId("mark-impression-absent").click();
  await expect(dialog.locator(`[data-testid="sheet-rider"][data-rider="${w.entries[0]}"]`)).toHaveAttribute("data-state", "absent");
  await dialog.getByTestId("reason-input").fill("Absent");
  await dialog.getByTestId("impression-save").click();
  // every gap of Fawy is settled with Absent: the sheet counts as submitted, nothing blocks
  await expect(head.getByTestId("blockers").getByTestId("blocker-line")).toHaveCount(0, { timeout: 40_000 });
  const imp = (await w.db.from("impression_scores").select("value, missed").eq("heat_id", H).eq("judge_seat_id", w.seats.j1.id).eq("entry_id", w.entries[0]).single()).data!;
  expect(imp).toEqual({ value: null, missed: true });
  await head.getByTestId("publish").click();
  await expect(dialog.getByTestId("publish-blockers")).toHaveCount(0);
  await dialog.getByTestId("dialog-save").click();
  await expect(head.getByTestId("control-message")).toContainText("Published", { timeout: 60_000 });
  expect((await w.db.from("heats").select("status").eq("id", H).single()).data!.status).toBe("published");
  // no override was needed
  expect((await w.db.from("audit_log").select("id").eq("row_id", H).eq("action", "publish_override")).data ?? []).toHaveLength(0);
});

test("items 5–6: after the heat, each judge's Impression / Variety scores per rider; the head judge types a judge's sheet, the next rider is picked, Save and submit", async ({ browser }) => {
  test.setTimeout(300_000);
  const H = w.heats[0];
  await w.db.from("judge_seats").update({ name: "Fawy" }).eq("id", w.seats.j1.id);
  await w.db.from("heats").update({ status: "ended", started_at: new Date(Date.now() - 900_000).toISOString(), ended_at: new Date(Date.now() - 300_000).toISOString() }).eq("id", H);
  // Judges 2 and 3 have scored everybody and submitted; Fawy has Red only
  for (const key of ["j2", "j3"] as const) {
    for (const entry of w.entries) await w.db.from("impression_scores").insert({ heat_id: H, entry_id: entry, judge_seat_id: w.seats[key].id, value: 6, client_key: crypto.randomUUID(), client_rev: 1 });
    await w.db.from("judge_sheets").upsert({ event_id: w.eventId, heat_id: H, judge_seat_id: w.seats[key].id, submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });
  }
  await w.db.from("impression_scores").insert({ heat_id: H, entry_id: w.entries[0], judge_seat_id: w.seats.j1.id, value: 7, client_key: crypto.randomUUID(), client_rev: 1 });

  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  contexts.push(context);
  await installSupabaseProxy(context);
  const head: Page = await context.newPage();
  await w.signInAs(head, "head", `/head/${w.eventId}`);
  await head.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });

  // item 5: per judge, per rider
  const fawy = head.locator(`[data-testid="owes-judge"][data-seat="${w.seats.j1.id}"]`);
  await expect(fawy).toHaveAttribute("data-missing", "3", { timeout: 60_000 });
  await expect(fawy.getByTestId("impression-cell")).toHaveCount(4);
  await expect(fawy.locator(`[data-testid="impression-cell"][data-rider="${w.entries[0]}"]`)).toHaveAttribute("data-state", "done");
  await expect(fawy.locator(`[data-testid="impression-cell"][data-rider="${w.entries[1]}"]`)).toHaveAttribute("data-state", "missing");
  await expect(head.locator(`[data-testid="owes-judge"][data-seat="${w.seats.j2.id}"]`)).toHaveAttribute("data-missing", "0");
  await expect(fawy).toContainText("3 missing");

  // item 6: the sheet opens on the first missing rider; a value moves on to the next one; Absent for the last; Save and submit
  await fawy.getByTestId("enter-impression").click();
  const dialog = head.getByTestId("console-dialog");
  const rider = (i: number) => dialog.locator(`[data-testid="sheet-rider"][data-rider="${w.entries[i]}"]`);
  await expect(rider(1)).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByTestId("impression-submit")).toBeDisabled();
  await dialog.getByRole("button", { name: "Set 6", exact: true }).click();
  await dialog.getByRole("button", { name: "Set .5", exact: true }).click();
  await expect(rider(1)).toHaveAttribute("data-state", "typed");
  await expect(rider(2)).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Set 8", exact: true }).click();
  await dialog.getByRole("button", { name: "Set .0", exact: true }).click();
  await expect(rider(3)).toHaveAttribute("aria-pressed", "true");
  await dialog.getByTestId("mark-impression-absent").click();
  await expect(rider(3)).toHaveAttribute("data-state", "absent");
  await expect(dialog.getByTestId("impression-save")).toHaveText("Save 3 riders");
  await dialog.getByTestId("reason-input").fill("paper sheet");
  await dialog.getByTestId("impression-submit").click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  await expect(fawy).toHaveAttribute("data-missing", "0", { timeout: 30_000 });
  const rows = (await w.db.from("impression_scores").select("entry_id, value, missed").eq("heat_id", H).eq("judge_seat_id", w.seats.j1.id)).data ?? [];
  const by = new Map(rows.map((r) => [r.entry_id, r]));
  expect(Number(by.get(w.entries[1])!.value)).toBe(6.5);
  expect(Number(by.get(w.entries[2])!.value)).toBe(8);
  expect(by.get(w.entries[3])).toMatchObject({ value: null, missed: true });
  // the sheet is submitted for Fawy: no sheet line in the blockers
  await expect(head.getByTestId("blockers")).not.toContainText("Fawy: sheet not submitted", { timeout: 30_000 });
  expect((await w.db.from("judge_sheets").select("submitted_at").eq("heat_id", H).eq("judge_seat_id", w.seats.j1.id).single()).data!.submitted_at).not.toBeNull();
});
