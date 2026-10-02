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
  await dialog.getByTestId("mark-impression-absent").click();
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
