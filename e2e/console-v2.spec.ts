import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { addLadder, createLiveWorld, type LiveWorld } from "./live-world";
import type { BrowserContext, Browser, Page } from "@playwright/test";

// Console v2 (the head judge console redesign) on a throwaway organisation: two divisions with their draws locked, the laptop console picks one and shows only its
// heats; Heat 2 is started before Heat 1 with one warning; the big timer sits beside Start / End; after End the break counts down with "+1 min" and "Pause break";
// the judges are read by their seat names; a cancelled heat is re-run from its own row. Arrow, EKL and Demo are never touched.
let w: LiveWorld;
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld();
});
test.afterEach(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});
async function open(browser: Browser, key: Parameters<LiveWorld["signInAs"]>[1], path: string, size = { width: 1500, height: 1000 }): Promise<Page> {
  const context = await browser.newContext({ viewport: size });
  contexts.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await w.signInAs(page, key, path);
  return page;
}
const tab = (p: Page, name: string) => p.getByTestId("division-tab").filter({ hasText: name });
const mainRows = (p: Page) => p.getByTestId("run-order").getByTestId("order-row");
const row = (p: Page, heat: string) => p.locator(`[data-testid="order-row"][data-heat="${heat}"]`);
const secondsOf = (text: string): number => {
  const m = /(\d+):(\d\d)/.exec(text.split("starts in")[1] ?? "");
  if (!m) throw new Error(`no countdown in "${text}"`);
  return Number(m[1]) * 60 + Number(m[2]);
};

test("two divisions locked: select one and see only its heats; the choice is remembered; a phone has the same selector", async ({ browser }) => {
  test.setTimeout(300_000);
  const ladder = await addLadder(w);
  const head = await open(browser, "head", `/head/${w.eventId}`);
  await expect(head.getByTestId("division-tab")).toHaveCount(2, { timeout: 60_000 });
  await tab(head, "Pro Men").click();
  await expect(mainRows(head)).toHaveCount(2);
  await expect(row(head, w.heats[0])).toBeVisible();
  await expect(head.getByTestId("run-order").locator(`[data-heat="${ladder.heats["R1-H1"]}"]`)).toHaveCount(0);
  await tab(head, "Ladder").click();
  await expect(mainRows(head)).toHaveCount(3);
  await expect(head.getByTestId("run-order").locator(`[data-heat="${w.heats[0]}"]`)).toHaveCount(0);
  // a line is short: round and heat (these heats are not in a run order, so there is no time)
  await expect(row(head, ladder.heats["R1-H1"])).toHaveText("R1 · H1");
  await expect(row(head, ladder.heats["R1-H1"])).not.toContainText("Pro");
  // remembered on this device
  await head.reload();
  await expect(tab(head, "Ladder")).toHaveAttribute("aria-pressed", "true", { timeout: 60_000 });
  await expect(mainRows(head)).toHaveCount(3);
  // the phone has the same selector
  const phone = await open(browser, "head", `/head/${w.eventId}`, { width: 390, height: 844 });
  await expect(phone.getByTestId("division-tab")).toHaveCount(2, { timeout: 60_000 });
  await tab(phone, "Pro Men").click();
  await expect(mainRows(phone)).toHaveCount(2);
});

test("a heat running in another division puts a live dot on its tab", async ({ browser }) => {
  test.setTimeout(240_000);
  await addLadder(w);
  await w.startHeat(w.heats[0]);
  const head = await open(browser, "head", `/head/${w.eventId}`);
  await expect(head.getByTestId("division-tab")).toHaveCount(2, { timeout: 60_000 });
  await tab(head, "Ladder").click();
  await expect(tab(head, "Pro Men").getByTestId("division-live-dot")).toBeVisible({ timeout: 30_000 });
  await expect(tab(head, "Ladder").getByTestId("division-live-dot")).toHaveCount(0);
  await expect(head.getByTestId("live-elsewhere")).toContainText("Pro Men");
});

test("start Heat 2 before Heat 1: one warning, the big timer beside Start / End; end it and the break counts down with +1 min and Pause break", async ({ browser }) => {
  test.setTimeout(420_000);
  const head = await open(browser, "head", `/head/${w.eventId}`);
  await tab(head, "Pro Men").waitFor({ timeout: 60_000 });
  await row(head, w.heats[1]).click();
  // the timer is 48 px and sits in the top bar with Start and End
  await expect(head.getByTestId("heat-timer-clock")).toHaveCSS("font-size", "48px");
  await expect(head.getByTestId("top-bar").getByTestId("start")).toBeVisible();
  await expect(head.getByTestId("top-bar").getByTestId("end")).toBeVisible();
  await head.getByTestId("start").click();
  await expect(head.getByTestId("start-warning")).toContainText("Not the next heat in the run order — R1 · H1 was next");
  expect((await w.db.from("heats").select("status").eq("id", w.heats[1]).single()).data!.status).toBe("scheduled");
  await head.getByTestId("start-anyway").click();
  await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "running", { timeout: 40_000 });
  const started = (await w.db.from("heats").select("status, started_at").eq("id", w.heats[1]).single()).data!;
  expect(started.started_at).not.toBeNull();
  expect((await w.db.from("heats").select("status").eq("id", w.heats[0]).single()).data!.status).toBe("scheduled");
  await expect(head.getByTestId("break-strip")).toHaveCount(0); // not while a heat is on

  // End: the break counts down to the heat that is next in the run order (Heat 1)
  await head.getByTestId("end").click();
  await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "ended", { timeout: 40_000 });
  await expect(head.getByTestId("break-text")).toContainText(/Next: R1 · H1 · starts in \d+:\d\d/, { timeout: 30_000 });
  const before = secondsOf((await head.getByTestId("break-text").textContent()) ?? "");
  await head.getByTestId("break-plus-one").click();
  await expect(head.getByTestId("control-message")).toContainText("Break one minute longer", { timeout: 30_000 });
  await expect.poll(async () => secondsOf((await head.getByTestId("break-text").textContent()) ?? ""), { timeout: 30_000 }).toBeGreaterThan(before + 40);
  const after = secondsOf((await head.getByTestId("break-text").textContent()) ?? "");
  expect(after - before).toBeLessThan(130);
  // nothing starts by itself
  expect((await w.db.from("heats").select("status").eq("id", w.heats[0]).single()).data!.status).toBe("scheduled");
  // Pause break holds the countdown until Resume
  await head.getByTestId("break-pause").click();
  await expect(head.getByTestId("break-strip")).toHaveAttribute("data-state", "paused", { timeout: 30_000 });
  const frozen = await head.getByTestId("break-text").textContent();
  await head.waitForTimeout(2500);
  expect(await head.getByTestId("break-text").textContent()).toBe(frozen);
  await head.getByTestId("break-resume").click();
  await expect(head.getByTestId("break-strip")).toHaveAttribute("data-state", "counting", { timeout: 30_000 });
});

test("the judges are read by their seat names: 'Fawy' with 'J1' under it in the table header, and 'Fawy: sheet not submitted' in the blocker list", async ({ browser }) => {
  test.setTimeout(300_000);
  await w.db.from("judge_seats").update({ name: "Fawy" }).eq("id", w.seats.j1.id);
  await w.db.from("heats").update({ status: "ended", started_at: new Date(Date.now() - 900_000).toISOString(), ended_at: new Date(Date.now() - 300_000).toISOString() }).eq("id", w.heats[0]);
  const att = (await w.db.from("trick_attempts").insert({ heat_id: w.heats[0], entry_id: w.entries[0], seq: 1, status: "landed", trick_name: "Left Backroll", direction: "left", client_key: crypto.randomUUID() }).select("id").single()).data!;
  for (const [i, key] of (["j1", "j2", "j3"] as const).entries()) await w.db.from("trick_scores").insert({ attempt_id: att.id, judge_seat_id: w.seats[key].id, score: [7.5, 8, 7][i], client_key: crypto.randomUUID(), client_rev: 1 });
  for (const key of ["j2", "j3"] as const) await w.db.from("judge_sheets").upsert({ event_id: w.eventId, heat_id: w.heats[0], judge_seat_id: w.seats[key].id, submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });
  const head = await open(browser, "head", `/head/${w.eventId}`);
  await row(head, w.heats[0]).click({ timeout: 60_000 });
  await expect(head.getByTestId("judge-column").first()).toBeVisible({ timeout: 60_000 });
  await expect(head.getByTestId("judge-column-name").first()).toHaveText("Fawy");
  await expect(head.getByTestId("judge-column-tag").first()).toHaveText("J1");
  await expect(head.getByTestId("judge-column-name").nth(1)).toHaveText("Judge 2"); // a seat the organiser did not rename keeps its own name
  await expect(head.getByTestId("blockers")).toContainText("Fawy: sheet not submitted", { timeout: 40_000 });
  await expect(head.getByTestId("judges")).toContainText("Fawy");
  await expect(head.locator("body")).not.toContainText("Judge 1");
});

test("cancel a heat and re-run it from the cancelled row", async ({ browser }) => {
  test.setTimeout(420_000);
  await w.startHeat(w.heats[0]);
  const head = await open(browser, "head", `/head/${w.eventId}`);
  await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "running", { timeout: 60_000 });
  await head.getByTestId("cancel").click();
  await head.getByTestId("cancel-reason").fill("kite tangle");
  await head.getByTestId("cancel-confirm").click();
  await expect(head.getByTestId("control-message")).toContainText("cancelled", { timeout: 40_000 });
  await row(head, w.heats[0]).click();
  await expect(row(head, w.heats[0])).toHaveAttribute("data-state", "cancelled", { timeout: 30_000 });
  // a cancelled heat cannot be started, and offers Re-run
  await expect(head.getByTestId("start")).toHaveCount(0);
  await expect(head.getByTestId("rerun")).toBeEnabled({ timeout: 30_000 });
  await head.getByTestId("rerun").click();
  await head.getByTestId("reason-input").fill("restart after the tangle");
  await head.getByTestId("dialog-save").click();
  await expect(head.getByTestId("control-message")).toContainText("is next in the run order", { timeout: 40_000 });
  const re = (await w.db.from("heats").select("id, status, number_suffix, rerun_of").eq("rerun_of", w.heats[0]).single()).data!;
  expect(re).toMatchObject({ status: "scheduled", number_suffix: "R" });
  expect((await w.db.from("heats").select("status").eq("id", w.heats[0]).single()).data!.status).toBe("cancelled");
  // the cancelled row stays, and cannot be re-run twice
  await row(head, w.heats[0]).click();
  await expect(head.getByTestId("rerun")).toBeDisabled({ timeout: 30_000 });
  await expect(head.getByTestId("cancelled-note")).toContainText("re-run as");
});

test("the judge's number field shows a greyed 0.0, never the word 'type'", async ({ browser }) => {
  test.setTimeout(240_000);
  await w.startHeat(w.heats[0]);
  await w.db.from("trick_attempts").insert({ heat_id: w.heats[0], entry_id: w.entries[0], seq: 1, status: "landed", trick_name: "Left Backroll", direction: "left", client_key: crypto.randomUUID() });
  const judge = await open(browser, "j1", `/judge/${w.eventId}`, { width: 390, height: 844 });
  const field = judge.getByTestId("pad-input");
  await expect(field).toBeVisible({ timeout: 60_000 });
  await expect(field).toHaveAttribute("placeholder", "0.0");
  await expect(field).toHaveValue("");
  expect(await field.evaluate((el) => getComputedStyle(el, "::placeholder").color)).not.toBe(await field.evaluate((el) => getComputedStyle(el).color));
  await expect(judge.locator("body")).not.toContainText(/^type$/m);
});
