import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// Polish 4, G / H / I on the head console (a throwaway organisation; one worker, no retries):
//   G  End heat asks once: the heat keeps running until Confirm; Cancel leaves it running.
//   H  after End heat the next heat's start controls are there at once (no refresh), on the laptop and the phone, at x1 and x10; nothing starts by itself on a real event.
//   I  the red banner keeps "Finished" and adds "Next heat in m:ss · Division · R1 · Heat 2 · est. hh:mm" from the run order; +1 min, + Other… and Set length… change the real break, every
//      screen follows; at 0:00 it reads "Next heat due" and nothing has started.
let w: LiveWorld;
const phones: BrowserContext[] = [];

test.beforeEach(async () => {
  w = await createLiveWorld({ flags: true });
  const { data } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  await w.db.from("events").update({ status: "live", settings: { ...((data?.settings ?? {}) as object), publicLiveScores: "live", livePollSec: 3, flags: { enabled: true, prestartSec: 10, lastMinuteSec: 60 } } as never }).eq("id", w.eventId);
  // a 4-minute break after Heat 1 (no warm-up in this world), so Heat 2 is planned 4:00 after Heat 1 ends
  await w.db.from("schedule_plans").update({ items: [{ id: "i1", kind: "heat", heatId: w.heats[0], breakAfterMin: 4 }, { id: "i2", kind: "heat", heatId: w.heats[1] }] as never }).eq("id", w.planId);
});
test.afterEach(async () => {
  await closePhones(phones);
  await w?.cleanup();
});

async function open(browser: Browser, viewport: { width: number; height: number }, go: (page: Page) => Promise<void>): Promise<Page> {
  const context = await browser.newContext({ viewport });
  phones.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await go(page);
  return page;
}
const heatRow = async (id: string) => (await w.db.from("heats").select("status, armed_at, started_at, ended_at").eq("id", id).single()).data!;
const run = async () => w.db.from("heats").update({ status: "running", started_at: new Date(Date.now() - 30_000).toISOString() }).eq("id", w.heats[0]);
/** "Next heat in 3:40 · …" → 220 */
const nextSeconds = async (p: Page, id: string) => {
  const m = /Next heat in (\d+):(\d\d)/.exec((await p.getByTestId(id).first().innerText()).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};
const headLaptop = (browser: Browser) => open(browser, { width: 1280, height: 800 }, (p) => w.signInAs(p, "head", `/head/${w.eventId}`));

test("G: End heat asks once; Cancel leaves the heat running; Confirm ends it", async ({ browser }) => {
  test.setTimeout(240_000);
  await run();
  const head = await headLaptop(browser);
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 45_000 });
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
  await head.getByTestId("end").click();
  await expect(head.getByTestId("end-panel")).toContainText("End this heat now? The clock stops and the heat goes to review.");
  expect((await heatRow(w.heats[0])).status).toBe("running"); // nothing ended yet
  await head.getByTestId("end-cancel").click();
  await expect(head.getByTestId("end-panel")).toHaveCount(0);
  expect((await heatRow(w.heats[0])).status).toBe("running");
  await head.getByTestId("end").click();
  await head.getByTestId("end-reason").fill("the kite went down");
  await head.getByTestId("end-confirm").click();
  await expect.poll(async () => (await heatRow(w.heats[0])).status, { timeout: 15_000 }).toBe("ended");
  const lines = (await w.db.from("audit_log").select("reason").eq("row_id", w.heats[0]).eq("action", "heat_ended")).data ?? [];
  expect(lines.map((l) => l.reason)).toContain("the kite went down");
});

test("H on a laptop: after End heat the next heat's start controls are there at once, no refresh; nothing starts by itself however long the break runs", async ({ browser }) => {
  test.setTimeout(300_000);
  await run();
  const head = await headLaptop(browser);
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 45_000 });
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
  await expect(head.getByTestId("start")).toBeDisabled(); // the heat shown is running: nothing to start
  await head.getByTestId("end").click();
  await head.getByTestId("end-confirm").click();
  await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", /ended|under_review/, { timeout: 15_000 });
  // the controls of the NEXT heat, within a moment, with no reload
  await expect(head.getByTestId("start")).toBeEnabled({ timeout: 5_000 });
  await expect(head.getByTestId("prestart-choice")).toBeVisible();
  await expect(head.getByTestId("start-target")).toContainText("Next:");
  // publishing the ended heat (behind the screen's back) leaves them there
  await w.db.from("heats").update({ status: "published", published_at: new Date().toISOString() }).eq("id", w.heats[0]);
  await expect(head.getByTestId("selected-heat")).toHaveAttribute("data-state", "published", { timeout: 15_000 });
  await expect(head.getByTestId("start")).toBeEnabled();
  // a break of 5 seconds: it runs out, and nothing starts or arms by itself
  await w.db.from("schedule_plans").update({ items: [{ id: "i1", kind: "heat", heatId: w.heats[0], breakAfterMin: 0 }, { id: "i2", kind: "heat", heatId: w.heats[1] }] as never }).eq("id", w.planId);
  await head.waitForTimeout(30_000); // the break has run out: nothing starts or arms by itself
  const next = await heatRow(w.heats[1]);
  expect(next).toMatchObject({ status: "scheduled", armed_at: null, started_at: null });
  await expect(head.getByTestId("start")).toBeEnabled();
});

test("H on a phone: the same, with the phone console", async ({ browser }) => {
  test.setTimeout(240_000);
  await run();
  const head = await open(browser, { width: 390, height: 844 }, (p) => w.signInAs(p, "head", `/head/${w.eventId}`));
  await expect(head.getByTestId("selected-heat")).toBeVisible({ timeout: 60_000 });
  await expect(head.getByTestId("end")).toBeVisible();
  await head.getByTestId("end").click();
  await expect(head.getByTestId("end-panel")).toBeVisible();
  await head.getByTestId("end-confirm").click();
  await expect(head.getByTestId("start")).toBeEnabled({ timeout: 10_000 });
  await expect(head.getByTestId("prestart-choice")).toBeVisible();
  if (process.env.SHOT_DIR) await head.screenshot({ path: `${process.env.SHOT_DIR}/break-phone.png` });
});

test("H at x10: the controls are back at once on a heat that ran at ten times the speed", async ({ browser }) => {
  test.setTimeout(240_000);
  await w.db.from("heats").update({ duration_sec: 60, time_scale: 10 }).in("id", w.heats);
  await run();
  const head = await headLaptop(browser);
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 45_000 });
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
  await head.getByTestId("end").click();
  await head.getByTestId("end-confirm").click();
  await expect(head.getByTestId("start")).toBeEnabled({ timeout: 8_000 });
  await expect(head.getByTestId("prestart-choice")).toBeVisible();
});

test("I: the red banner says Finished and counts down Next heat in …; +1 min, + Other… and Set length… change the real break on every screen; at 0:00 it reads Next heat due and nothing has started", async ({ browser }) => {
  test.setTimeout(420_000);
  await run();
  const head = await headLaptop(browser);
  const marshal = await open(browser, { width: 390, height: 844 }, async (p) => void (await p.goto(`/e/e2e-live-${w.org.run}/flag`)));
  const follow = await open(browser, { width: 1280, height: 720 }, async (p) => void (await p.goto(`/screen/e2e-live-${w.org.run}/follow`)));
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 45_000 });
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
  await head.getByTestId("end").click();
  await head.getByTestId("end-confirm").click();

  // the banner keeps its state word and adds the break from the run order
  const strip = head.getByTestId("heat-timer").first();
  await expect(strip.getByTestId("heat-timer-state")).toHaveText("Finished", { timeout: 15_000 });
  await expect(strip.getByTestId("flag-next-heat")).toContainText(/^Next heat in [34]:\d\d · Pro Men · R1 · Heat 2 · est\. \d\d:\d\d$/, { timeout: 15_000 });
  expect(await nextSeconds(head, "flag-next-heat")).toBeGreaterThan(200);
  await expect(marshal.getByTestId("flag-next-heat")).toContainText("Next heat in", { timeout: 20_000 });
  await expect(marshal.getByTestId("flag-label")).toHaveText("Finished");
  await expect(follow.getByTestId("screen-flag-next")).toContainText("Next heat in", { timeout: 20_000 });
  // it counts down
  const a = await nextSeconds(head, "flag-next-heat");
  await head.waitForTimeout(3000);
  expect(a - (await nextSeconds(head, "flag-next-heat"))).toBeGreaterThanOrEqual(2);
  // one source of truth: the run order's break after Heat 1
  const planBefore = (await w.db.from("schedule_plans").select("items").eq("id", w.planId).single()).data!.items as Array<{ breakAfterMin?: number }>;
  expect(planBefore[0].breakAfterMin).toBe(4);

  // +1 min: exactly one more minute everywhere
  const before = await nextSeconds(head, "flag-next-heat");
  await head.getByTestId("break-plus-one").click();
  await expect.poll(async () => nextSeconds(head, "flag-next-heat"), { timeout: 10_000 }).toBeGreaterThan(before + 50);
  await expect.poll(async () => nextSeconds(marshal, "flag-next-heat"), { timeout: 20_000 }).toBeGreaterThan(before + 50);
  await expect.poll(async () => nextSeconds(follow, "screen-flag-next"), { timeout: 20_000 }).toBeGreaterThan(before + 50);
  const planAfter = (await w.db.from("schedule_plans").select("items").eq("id", w.planId).single()).data!.items as Array<{ breakAfterMin?: number }>;
  expect(planAfter[0].breakAfterMin).toBeCloseTo(5, 3);
  const audit = (await w.db.from("audit_log").select("reason").eq("action", "plan_break_set")).data ?? [];
  expect(audit.length).toBeGreaterThan(0);

  // + Other… 2:30 ADDS 2:30 to the break as it stands (like +1 min), on every screen
  const beforeAdd = await nextSeconds(head, "flag-next-heat");
  await head.getByTestId("break-add").click();
  await head.getByTestId("break-add-input").fill("2:30");
  await head.getByTestId("break-add-apply").click();
  await expect.poll(async () => nextSeconds(head, "flag-next-heat"), { timeout: 10_000 }).toBeGreaterThan(beforeAdd + 140);
  expect(await nextSeconds(head, "flag-next-heat")).toBeLessThanOrEqual(beforeAdd + 155);
  await expect.poll(async () => nextSeconds(marshal, "flag-next-heat"), { timeout: 20_000 }).toBeGreaterThan(beforeAdd + 140);
  await expect.poll(async () => nextSeconds(follow, "screen-flag-next"), { timeout: 20_000 }).toBeGreaterThan(beforeAdd + 140);
  // adding 0 is refused in words and changes nothing
  await head.getByTestId("break-add").click();
  await head.getByTestId("break-add-input").fill("0");
  await head.getByTestId("break-add-apply").click();
  await expect(head.getByTestId("break-add-error")).toBeVisible();
  await head.getByTestId("break-add").click(); // closes it

  // Set length… 2:30 makes the WHOLE break 2:30, counted from the end of the heat: what is left is under 2:30 (and not the 7+ minutes before)
  await head.getByTestId("break-set").click();
  await head.getByTestId("break-set-input").fill("2:30");
  await head.getByTestId("break-set-apply").click();
  await expect.poll(async () => nextSeconds(head, "flag-next-heat"), { timeout: 10_000 }).toBeLessThanOrEqual(150);
  expect(await nextSeconds(head, "flag-next-heat")).toBeGreaterThan(60);
  await expect.poll(async () => nextSeconds(marshal, "flag-next-heat"), { timeout: 20_000 }).toBeLessThanOrEqual(150);
  await expect.poll(async () => nextSeconds(follow, "screen-flag-next"), { timeout: 20_000 }).toBeLessThanOrEqual(150);

  // the banner is never covered: the Break group and the Start controls are below it
  const banner = await head.getByTestId("heat-timer").first().boundingBox();
  const group = await head.getByTestId("break-choice").boundingBox();
  expect(banner && group && group.y >= banner.y + banner.height - 1).toBe(true);
  // Pre-start stays right beside Start heat sequence (same line, Pre-start to its left)
  const pre = await head.getByTestId("prestart-choice").boundingBox();
  const go = await head.getByTestId("start").boundingBox();
  expect(pre && go && group && Math.abs(pre.y + pre.height / 2 - (go.y + go.height / 2)) < 40 && pre.x < go.x && group.y > go.y).toBe(true);
  if (process.env.SHOT_DIR) await head.screenshot({ path: `${process.env.SHOT_DIR}/break-laptop.png` });

  // at 0:00: "Next heat due", and nothing has started or armed (the break is cut to nothing behind the screen's back)
  await w.db.from("schedule_plans").update({ items: [{ id: "i1", kind: "heat", heatId: w.heats[0], breakAfterMin: 0 }, { id: "i2", kind: "heat", heatId: w.heats[1] }] as never }).eq("id", w.planId);
  await expect(head.getByTestId("flag-next-heat")).toHaveText(/^Next heat due · Pro Men · R1 · Heat 2$/, { timeout: 30_000 });
  await expect(marshal.getByTestId("flag-next-heat")).toHaveText(/^Next heat due · Pro Men · R1 · Heat 2$/, { timeout: 30_000 });
  await head.waitForTimeout(8000);
  await expect(head.getByTestId("flag-next-heat")).toContainText("Next heat due");
  expect(await heatRow(w.heats[1])).toMatchObject({ status: "scheduled", armed_at: null, started_at: null });
});

test("I: with no active run order the banner shows the state word and no countdown", async ({ browser }) => {
  test.setTimeout(240_000);
  await w.db.from("schedule_plans").update({ active: false }).eq("id", w.planId);
  await run();
  const head = await headLaptop(browser);
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 45_000 });
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
  await head.getByTestId("end").click();
  await head.getByTestId("end-confirm").click();
  await expect(head.getByTestId("heat-timer").first().getByTestId("heat-timer-state")).toContainText("Finished", { timeout: 15_000 });
  await expect(head.getByTestId("flag-next-heat")).toHaveCount(0);
  await expect(head.getByTestId("break-choice")).toHaveCount(0);
});
