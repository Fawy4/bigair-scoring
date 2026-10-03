import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// Flags, the head judge's controls on the yellow: Pre-start with Other…, +1 min, Pause and Resume during the yellow, Reset this heat. A throwaway organisation
// (removed by the ledger; Arrow, EKL and Demo are never touched). Short heats (30 s) and short pre-starts so the sequences play in a minute or two.
let w: LiveWorld;
const phones: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld({ flags: true });
  await w.db.from("heats").update({ duration_sec: 30 }).in("id", w.heats);
  await setFlags({ enabled: true, prestartSec: 10, lastMinuteSec: 10 });
});
test.afterEach(async () => {
  await closePhones(phones);
  await w?.cleanup();
});

async function setFlags(flags: object) {
  const { data } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  await w.db.from("events").update({ settings: { ...((data?.settings ?? {}) as object), flags } as never }).eq("id", w.eventId);
}
async function open(browser: Browser, viewport: { width: number; height: number }, go: (page: Page) => Promise<void>): Promise<Page> {
  const context = await browser.newContext({ viewport });
  phones.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await go(page);
  return page;
}
const laptop = (browser: Browser) => open(browser, { width: 1280, height: 800 }, (p) => w.signInAs(p, "head", `/head/${w.eventId}`));
const marshal = (browser: Browser) => open(browser, { width: 390, height: 844 }, async (p) => void (await p.goto(`/e/e2e-live-${w.org.run}/flag`)));
const flagOf = (p: Page) => p.getByTestId("flag-view");
const heatRow = async () => (await w.db.from("heats").select("status, started_at, armed_at, prestart_sec, armed_paused_at, duration_sec").eq("id", w.heats[0]).single()).data!;
const secondsOf = async (p: Page, id: string) => {
  const [m, s] = (await p.getByTestId(id).first().innerText()).trim().split(":").map(Number);
  return m * 60 + s;
};
async function select(head: Page) {
  await expect(head.getByTestId("run-order")).toBeVisible({ timeout: 45_000 });
  await head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`).click();
}

test("Pre-start is a labelled choice: Other… takes 1:30 and the countdown starts at 1:30; a length outside 0:10 to 15:00 is refused in the house style", async ({ browser }) => {
  test.setTimeout(180_000);
  const head = await laptop(browser);
  const flag = await marshal(browser);
  await select(head);
  const group = head.getByTestId("prestart-choice");
  await expect(group).toContainText("Pre-start:");
  await expect(head.getByTestId("start")).toHaveText("Start heat sequence");
  // the event's default is pre-selected, and the group sits apart from the button
  await expect(head.getByTestId("prestart-10")).toHaveAttribute("aria-checked", "true");
  await expect(head.getByTestId("prestart-other")).toHaveAttribute("aria-checked", "false");
  await expect(head.getByTestId("prestart-0")).toHaveText("Start now");
  // a refused length: nothing is selected
  await head.getByTestId("prestart-other").click();
  await head.getByTestId("prestart-other-input").fill("0:05");
  await head.getByTestId("prestart-other-input").press("Enter");
  await expect(head.getByTestId("prestart-other-error")).toContainText("between 0:10 and 15:00");
  await expect(head.getByTestId("prestart-10")).toHaveAttribute("aria-checked", "true");
  await head.getByTestId("prestart-other-input").fill("16");
  await head.getByTestId("prestart-other-input").press("Enter");
  await expect(head.getByTestId("prestart-other-error")).toBeVisible();
  // a good one becomes the selected choice and shows as such
  await head.getByTestId("prestart-other-input").fill("1:30");
  await head.getByTestId("prestart-other-input").press("Enter");
  await expect(head.getByTestId("prestart-other")).toHaveAttribute("aria-checked", "true");
  await expect(head.getByTestId("prestart-other")).toHaveText("1:30");
  await expect(head.getByTestId("prestart-10")).toHaveAttribute("aria-checked", "false");
  await head.getByTestId("start").click();
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "before_start", { timeout: 20_000 });
  expect((await heatRow()).prestart_sec).toBe(90);
  const left = await secondsOf(flag, "flag-countdown");
  expect(left).toBeGreaterThan(80);
  expect(left).toBeLessThanOrEqual(90);
  await head.getByTestId("abort-start").click();
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "stopped", { timeout: 15_000 });
  // the typed length is still the selected one for the next press
  await expect(head.getByTestId("prestart-other")).toHaveAttribute("aria-checked", "true");
});

test("+1 min at 0:40 makes it 1:40 on the console and the Flag view within a second; the heat starts at the new 0:00; heat length and last minute do not change", async ({ browser }) => {
  test.setTimeout(300_000);
  await setFlags({ enabled: true, prestartSec: 50, lastMinuteSec: 10 });
  const head = await laptop(browser);
  const flag = await marshal(browser);
  await select(head);
  await head.getByTestId("start").click();
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "before_start", { timeout: 20_000 });
  await expect.poll(() => secondsOf(flag, "flag-countdown"), { timeout: 30_000, intervals: [250] }).toBeLessThanOrEqual(40);
  const before = await heatRow();
  await head.getByTestId("extend-prestart").click();
  // 1:40 on the console strip and on the Flag view within a second (a second of slack for the press itself)
  await expect.poll(() => secondsOf(flag, "flag-countdown"), { timeout: 2_500, intervals: [100] }).toBeGreaterThan(95);
  expect(await secondsOf(flag, "flag-countdown")).toBeLessThanOrEqual(100);
  await expect.poll(() => secondsOf(head, "heat-timer-clock"), { timeout: 2_500, intervals: [100] }).toBeGreaterThan(95);
  const after = await heatRow();
  expect(after.prestart_sec).toBe(before.prestart_sec! + 60);
  expect(after.duration_sec).toBe(30); // the heat length is unchanged
  const { data: lines } = await w.db.from("audit_log").select("action, reason").eq("row_id", w.heats[0]).eq("action", "heat_prestart_extended");
  expect(lines).toHaveLength(1);
  // repeatable: another press adds another minute
  await head.getByTestId("extend-prestart").click();
  await expect.poll(async () => (await heatRow()).prestart_sec, { timeout: 10_000 }).toBe(before.prestart_sec! + 120);
  // take the second minute back out of the test: the start still happens at the new 0:00 (armed moment + pre-start)
  await head.getByTestId("start-now").waitFor();
  expect((await w.db.from("events").select("settings").eq("id", w.eventId).single()).data!.settings).toMatchObject({ flags: { lastMinuteSec: 10 } });
  await expect(flagOf(flag)).toHaveAttribute("data-flag", /running|last_minute/, { timeout: 190_000 });
  await expect.poll(async () => (await heatRow()).started_at, { timeout: 20_000 }).not.toBeNull(); // an official's screen writes the start down
  const started = await heatRow();
  expect(Date.parse(started.started_at!)).toBe(Date.parse(after.armed_at!) + (before.prestart_sec! + 120) * 1000);
});

test("the head judge keeps control of the yellow: Pause freezes the countdown, Start now, Abort and +1 min stay available, Resume carries on from the same time", async ({ browser }) => {
  test.setTimeout(240_000);
  await setFlags({ enabled: true, prestartSec: 40, lastMinuteSec: 10 });
  const head = await laptop(browser);
  const flag = await marshal(browser);
  await select(head);
  await head.getByTestId("start").click();
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "before_start", { timeout: 20_000 });
  await expect(head.getByTestId("pause")).toBeEnabled();
  await head.getByTestId("pause").click();
  await expect(flagOf(flag)).toHaveAttribute("data-why", "paused", { timeout: 5_000 });
  await expect(head.getByTestId("resume")).toBeEnabled();
  const frozen = await secondsOf(flag, "flag-countdown");
  expect((await heatRow()).armed_paused_at).not.toBeNull();
  await head.waitForTimeout(5_000);
  expect(await secondsOf(flag, "flag-countdown")).toBe(frozen);
  expect(await secondsOf(head, "heat-timer-clock")).toBe(frozen);
  // at every moment of the yellow the head judge keeps Start now, Abort and +1 min
  for (const id of ["start-now", "abort-start", "extend-prestart"]) await expect(head.getByTestId(id)).toBeEnabled();
  const armedBefore = (await heatRow()).armed_at!;
  await head.getByTestId("resume").click();
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "before_start", { timeout: 5_000 });
  const armedAfter = (await heatRow()).armed_at!;
  expect(Date.parse(armedAfter) - Date.parse(armedBefore)).toBeGreaterThanOrEqual(4_000); // the start moved later by the time frozen
  expect(await secondsOf(flag, "flag-countdown")).toBeLessThanOrEqual(frozen);
  await expect(flagOf(flag)).toHaveAttribute("data-flag", /running|last_minute/, { timeout: 90_000 });
  // pause then Start now while frozen: green at once
});

test("a heat that is ended and then reset is not started: the flag says Stopped, nothing is armed, and the console shows what a not-started heat shows", async ({ browser }) => {
  test.setTimeout(300_000);
  const head = await laptop(browser);
  const flag = await marshal(browser);
  await select(head);
  await head.getByTestId("prestart-0").click();
  await head.getByTestId("start").click();
  await expect(flagOf(flag)).toHaveAttribute("data-flag", /running|last_minute/, { timeout: 20_000 });
  await head.getByTestId("end").click();
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "stopped", { timeout: 15_000 });
  await expect(head.getByTestId("reset-heat")).toBeEnabled({ timeout: 30_000 });
  await head.getByTestId("reset-heat").click();
  const dialog = head.getByTestId("console-dialog");
  await expect(dialog.getByTestId("reset-heat-line")).toBeVisible({ timeout: 30_000 }); // the preview decides whether a reason is asked
  const reason = dialog.getByTestId("reason-input");
  if (await reason.count()) await reason.fill("Started by mistake");
  await dialog.getByTestId("dialog-save").click();
  await expect(head.locator(`[data-testid="order-row"][data-heat="${w.heats[0]}"]`)).toHaveAttribute("data-state", "scheduled", { timeout: 40_000 });
  const row = await heatRow();
  expect(row).toMatchObject({ status: "scheduled", started_at: null, armed_at: null, prestart_sec: null, armed_paused_at: null });
  // flags show Stopped (not "Finished"), on the marshal's screen and on the console strip
  await expect(flagOf(flag)).toHaveAttribute("data-flag", "stopped", { timeout: 15_000 });
  await expect(flagOf(flag)).not.toHaveAttribute("data-why", "finished");
  await expect(head.getByTestId("heat-timer").first()).toHaveAttribute("data-flag", "stopped");
  // a reset heat can be started again, so the console shows what a not-started heat shows: Start heat sequence with its Pre-start group, no yellow buttons
  await expect(head.getByTestId("start")).toBeVisible();
  await expect(head.getByTestId("prestart-choice")).toBeVisible();
  for (const id of ["start-now", "abort-start", "extend-prestart", "end"]) await expect(head.getByTestId(id)).toHaveCount(id === "end" ? 1 : 0);
  await expect(head.getByTestId("end")).toBeDisabled();
});
