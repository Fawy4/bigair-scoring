import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { addSecondChance, createLiveWorld, publishDirect, type LiveWorld } from "./live-world";
import type { BrowserContext, Page } from "@playwright/test";
import type { DivisionDraw } from "../src/lib/engine/ladder";

// Console – Walkover and absent riders, on the head judge's laptop console, with 12 riders in "Knockout with a second chance" (throwaway organisation; Arrow, EKL and
// Demo are never touched). One worker, no retries (playwright.config.ts has none): the first timeout is the result.
let w: LiveWorld;
test.beforeEach(async () => {
  w = await createLiveWorld();
});
test.afterEach(async () => {
  await w?.cleanup();
});
const phones: BrowserContext[] = [];
test.afterEach(async () => {
  await closePhones(phones);
});
async function laptop(browser: import("@playwright/test").Browser, path: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  phones.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await w.signInAs(page, "head", path);
  return page;
}
const dialog = (p: Page) => p.getByTestId("console-dialog");
const pickHeat = async (p: Page, heat: string) => {
  const row = p.locator(`[data-testid="order-row"][data-heat="${heat}"]`);
  await row.waitFor({ state: "attached", timeout: 40_000 });
  if (!(await row.isVisible())) await p.getByTestId("other-divisions").locator("summary").click();
  await row.click();
};
const rowText = (p: Page, heat: string) => p.locator(`[data-testid="order-row"][data-heat="${heat}"]`).innerText();
const slotsOf = async (heat: string) => (await w.db.from("heat_slots").select("entry_id, modifier, position").eq("heat_id", heat).order("position")).data!;

test("a 1 v 1 heat: ··· on the rider who is missing, Did not start, Walkover: the heat reads Walkover, the rider is in his next seat, the run order moves on and the public results say Walkover — nobody typed a score", async ({ browser }) => {
  test.setTimeout(420_000);
  const ladder = await addSecondChance(w, "round2");
  const r2 = ladder.draw.rounds.find((r) => r.id === "R2")!;
  const oneVsOne = r2.heats.find((h) => h.slots.length === 2)!;
  const uid = oneVsOne.uid ?? oneVsOne.id;
  const heatId = ladder.heats[uid];
  const [winner, missing] = oneVsOne.slots.map((s) => s.entrantId!);
  const order = ladder.rows.map((r) => r.id);
  const nextId = order[order.indexOf(heatId) + 1];

  const head = await laptop(browser, `/head/${w.eventId}`);
  await pickHeat(head, heatId);
  await expect(head.getByTestId("rider-card")).toHaveCount(2, { timeout: 40_000 });
  // two riders can ride: no Walkover yet; every card has its ··· button (44 px or more)
  await expect(head.getByTestId("walkover-button")).toHaveCount(0);
  const dots = head.locator(`[data-testid="rider-card-menu"][data-rider="${missing}"]`);
  await expect(dots).toBeVisible();
  expect((await dots.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const before = await rowText(head, nextId);

  await dots.click();
  await head.getByRole("menuitem", { name: "Did not start (this heat only)" }).click();
  await dialog(head).getByTestId("reason-pick").filter({ hasText: "Injured" }).click();
  await dialog(head).getByTestId("dialog-save").click();

  // exactly one rider can ride now: one big button
  const button = head.getByTestId("walkover-button");
  await expect(button).toContainText("Walkover —", { timeout: 40_000 });
  await expect(button).toContainText("goes through");
  await button.click();
  await expect(dialog(head).getByTestId("walkover-ask")).toContainText("no clock");
  await dialog(head).getByTestId("dialog-save").click();
  await expect(head.getByTestId("walkover-flash")).toContainText("Walkover:", { timeout: 40_000 });

  // the heat is published at one instant: no clock, no attempts, no scores
  const heat = (await w.db.from("heats").select("status, started_at, ended_at, published_at").eq("id", heatId).single()).data!;
  expect(heat.status).toBe("published");
  expect(heat.started_at).toBe(heat.ended_at);
  expect((await w.db.from("trick_attempts").select("id").eq("heat_id", heatId)).data).toHaveLength(0);
  const results = (await w.db.from("heat_results").select("entry_id, place, total, breakdown").eq("heat_id", heatId).order("place")).data!;
  expect(results.map((r) => [r.entry_id, r.place, r.total, (r.breakdown as { status: string }).status])).toEqual([[winner, 1, null, "WO"], [missing, 2, null, "DNS"]]);
  // the rider is in his next seat (the draw's Round 3 arrivals), and the one who did not start is still in the event
  const draw = (await w.db.from("divisions").select("draw").eq("id", ladder.divisionId).single()).data!.draw as unknown as DivisionDraw;
  expect(draw.rounds.find((r) => r.id === "R3")!.arrivals.some((a) => a.entrantId === winner && a.place === 1 && a.total === null)).toBe(true);
  expect((await w.db.from("entries").select("status").eq("id", missing).single()).data!.status).toBe("confirmed");

  // the console says it in words, and the run order moved on
  await expect(head.getByTestId("walkover-banner")).toContainText("Walkover", { timeout: 40_000 });
  await expect(head.locator(`[data-testid="rider-card"][data-rider="${winner}"]`)).toContainText("Walkover");
  await expect(head.locator(`[data-testid="rider-card"][data-rider="${missing}"]`)).toContainText("Did not start");
  await expect(head.locator(`[data-testid="rider-card"]`).filter({ hasText: /0\.0/ })).toHaveCount(0);
  await expect(head.locator(`[data-testid="order-row"][data-heat="${heatId}"]`)).toContainText("Walkover", { timeout: 40_000 });
  await expect.poll(() => rowText(head, nextId), { timeout: 40_000 }).not.toBe(before);

  // the public results page
  const pub = await laptop(browser, `/e/e2e-live-${w.org.run}/results?heat=${heatId}`);
  await expect(pub.getByTestId("public-rider").first()).toContainText("Walkover", { timeout: 40_000 });
  await expect(pub.getByTestId("public-rider").nth(1)).toContainText("Did not start");
  await expect(pub.getByTestId("public-total")).toHaveCount(0);

  // Re-open puts it back to Not started with its riders
  await head.getByTestId("reopen").click();
  await dialog(head).getByTestId("dialog-save").click();
  await expect(head.getByTestId("control-message")).toContainText("The walkover was taken back", { timeout: 40_000 });
  const back = (await w.db.from("heats").select("status, started_at, ended_at").eq("id", heatId).single()).data!;
  expect(back).toMatchObject({ status: "scheduled", started_at: null, ended_at: null });
  expect((await slotsOf(heatId)).map((s) => s.modifier)).toEqual([null, "DNS"]);
  await expect(head.getByTestId("walkover-button")).toBeVisible({ timeout: 40_000 });
});

test("a heat of three with one rider Out of the event (injured) runs with two, and his later seat is a walkover", async ({ browser }) => {
  test.setTimeout(420_000);
  const ladder = await addSecondChance(w, "round1");
  const h1 = ladder.draw0.rounds[0].heats[0];
  const heatId = ladder.heats[h1.uid ?? h1.id];
  const [first, out, third] = h1.slots.map((s) => s.entrantId!);

  const head = await laptop(browser, `/head/${w.eventId}`);
  await pickHeat(head, heatId);
  await expect(head.getByTestId("rider-card")).toHaveCount(3, { timeout: 40_000 });
  await head.locator(`[data-testid="rider-card-menu"][data-rider="${out}"]`).click();
  await head.getByRole("menuitem", { name: "Out of the event (injured or withdrew)" }).click();
  await expect(dialog(head).getByTestId("status-ask")).toContainText("same as Withdrawn on the Riders step");
  await dialog(head).getByTestId("reason-pick").filter({ hasText: "Injured" }).click();
  await dialog(head).getByTestId("dialog-save").click();
  await expect(head.locator(`[data-testid="rider-card"][data-rider="${out}"]`)).toContainText("Out of the event", { timeout: 40_000 });
  expect((await w.db.from("entries").select("status").eq("id", out).single()).data!.status).toBe("withdrawn");
  // two riders can still ride: no walkover, the heat starts and runs with two
  await expect(head.getByTestId("walkover-button")).toHaveCount(0);
  await w.startHeat(heatId);
  await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "running", { timeout: 40_000 });
  expect((await slotsOf(heatId)).map((s) => s.modifier)).toEqual([null, "DNS", null]);

  // the heat is finished and published as usual; his Round 2 seat is a walkover for the others
  const draw = (await w.db.from("divisions").select("draw").eq("id", ladder.divisionId).single()).data!.draw as unknown as DivisionDraw;
  const after = await publishDirect(w, draw, heatId, h1.uid ?? h1.id);
  const seatHeat = after.rounds.find((r) => r.id === "R2")!.heats.find((h) => h.slots.some((s) => s.entrantId === out))!;
  const seat = seatHeat.slots.find((s) => s.entrantId === out)!;
  expect(seat.modifier).toBe("DNS");
  const seatHeatId = ladder.heats[seatHeat.uid ?? seatHeat.id];
  expect((await slotsOf(seatHeatId)).find((s) => s.entry_id === out)!.modifier).toBe("DNS");
  await head.reload();
  await pickHeat(head, seatHeatId);
  await expect(head.locator(`[data-testid="rider-card"][data-rider="${out}"]`)).toContainText("Out of the event", { timeout: 40_000 });
  // a 1 v 1 second-chance heat offers the walkover for the other rider; a heat of three runs with two
  if (seatHeat.slots.length === 2) await expect(head.getByTestId("walkover-button")).toContainText("Walkover —", { timeout: 40_000 });
  else await expect(head.getByTestId("walkover-button")).toHaveCount(0);
  void [first, third];
});

test("nobody left: every rider Did not start or Out of the event — 'No rider — finish this heat'; Publish on a heat nobody rode asks once and names Walkover", async ({ browser }) => {
  test.setTimeout(300_000);
  const ladder = await addSecondChance(w, "round2");
  const r2 = ladder.draw.rounds.find((r) => r.id === "R2")!;
  const oneVsOne = r2.heats.find((h) => h.slots.length === 2)!;
  const heatId = ladder.heats[oneVsOne.uid ?? oneVsOne.id];
  const head = await laptop(browser, `/head/${w.eventId}`);
  await pickHeat(head, heatId);
  // a heat nobody has ridden: the Ties box stays empty
  await expect(head.getByTestId("ties")).toHaveCount(0);
  // Publish on a heat that ended with no attempt at all asks once, in words, and names Walkover
  const other = r2.heats.find((h) => h.slots.length === 3)!;
  const otherId = ladder.heats[other.uid ?? other.id];
  await w.db.from("heats").update({ status: "ended", started_at: new Date(Date.now() - 900_000).toISOString(), ended_at: new Date(Date.now() - 300_000).toISOString() }).eq("id", otherId);
  await pickHeat(head, otherId);
  await head.getByTestId("publish").click();
  await expect(dialog(head).getByTestId("publish-nobody-rode")).toContainText("To send a rider through without riding, use Walkover. Publish anyway?", { timeout: 40_000 });
  await dialog(head).getByTestId("dialog-cancel").click();
  await pickHeat(head, heatId);
  for (const s of oneVsOne.slots) {
    await head.locator(`[data-testid="rider-card-menu"][data-rider="${s.entrantId}"]`).click();
    await head.getByRole("menuitem", { name: "Did not start (this heat only)" }).click();
    await dialog(head).getByTestId("dialog-save").click();
    await expect(head.locator(`[data-testid="rider-card"][data-rider="${s.entrantId}"]`)).toContainText("Did not start", { timeout: 40_000 });
  }
  const button = head.getByTestId("walkover-button");
  await expect(button).toHaveText("No rider — finish this heat", { timeout: 40_000 });
  await button.click();
  await dialog(head).getByTestId("dialog-save").click();
  await expect(head.getByTestId("walkover-flash")).toContainText("Heat finished with no rider", { timeout: 40_000 });
  const results = (await w.db.from("heat_results").select("place").eq("heat_id", heatId)).data!;
  expect(results.every((r) => r.place === null)).toBe(true);
});
