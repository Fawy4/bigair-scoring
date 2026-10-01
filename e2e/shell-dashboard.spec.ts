import { test, expect } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";

// Phase 7a-1: the organiser shell (top bar, seven-step rail with states and reasons) and the Go live dashboard. Needs Supabase keys in the environment.
// One throwaway organisation with a live world (division, 4 riders, 6 seats without stored PINs, a run order for today); Arrow, EKL and Demo are never touched.
test.describe.configure({ mode: "serial" });
let w: LiveWorld;
test.beforeAll(async () => {
  w = await createLiveWorld();
});
test.afterAll(async () => {
  await w?.cleanup();
});

// the dashboard's clock asks the database for its time; a request still in flight when a test ends is given up on quietly
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
});

const STATE_WORDS = /Done|Needs attention|Not started/;

test("the rail shows seven steps, each with a state word and one line of reason, and the top bar names the event", async ({ page }) => {
  test.setTimeout(120_000);
  await w.org.signIn(page, `/org/events/${w.eventId}`);
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await expect(page.getByTestId("top-bar")).toContainText(`E2E Live ${w.org.run}`);
  await expect(page.getByTestId("top-bar").getByTestId("status-pill").first()).toHaveText("Published");
  const items = page.getByTestId("step-rail").getByRole("link");
  await expect(items).toHaveCount(7);
  for (const key of ["event", "divisions", "riders", "officials", "draw", "schedule", "golive"]) {
    const item = page.getByTestId(`rail-${key}`);
    await expect(item.getByTestId("status-pill")).toHaveText(STATE_WORDS);
  }
  await expect(page.getByTestId("rail-golive")).toHaveAttribute("aria-current", "step");
  // what the live world has: no location, no format, riders in the division, a full panel, a locked draw, a run order for today, seats without PINs
  await expect(page.getByTestId("rail-event")).toHaveAttribute("data-state", "attention");
  await expect(page.getByTestId("rail-event")).toContainText("Add the location.");
  await expect(page.getByTestId("rail-divisions")).toHaveAttribute("data-state", "attention");
  await expect(page.getByTestId("rail-divisions")).toContainText("Pro Men: choose its format.");
  await expect(page.getByTestId("rail-riders")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("rail-draw")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("rail-schedule")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("rail-golive")).toHaveAttribute("data-state", "attention");
  await expect(page.getByTestId("rail-golive")).toContainText("6 seats have no PIN");

  // the rail changes as things are fixed
  await w.db.from("events").update({ location: "El Gouna" }).eq("id", w.eventId);
  await page.reload();
  await expect(page.getByTestId("rail-event")).toHaveAttribute("data-state", "done");
  await page.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/shell-laptop.png`, fullPage: true });
});

test("the checklist names what is missing, links to the step that fixes it, and turns green as it is fixed", async ({ page }) => {
  test.setTimeout(120_000);
  await w.org.signIn(page, `/org/events/${w.eventId}`);
  const list = page.getByTestId("dashboard-missing");
  await expect(list).toContainText("Pro Men: 4 riders confirmed");
  await expect(list).toContainText("Pro Men: 3 of 3 judges");
  await expect(list).toContainText("Pro Men: draw locked");
  await expect(list).toContainText("Run order active for today");
  await expect(list).toContainText("6 seats have no PIN");
  await expect(page.getByTestId("dashboard-ready")).toHaveCount(0);
  await expect(page.getByTestId("check-pins")).toHaveAttribute("data-state", "attention");
  await expect(page.getByTestId("check-riders:" + w.divisionId)).toHaveAttribute("data-state", "done");

  await page.getByTestId("fix-pins").click();
  await expect(page).toHaveURL(new RegExp(`/org/events/${w.eventId}/officials$`));

  // the seats get a stored PIN (stands in for "Regenerate PIN"): the row turns green and the list says Ready to run
  await w.db.from("judge_seats").update({ pin_enc: "stored" }).eq("event_id", w.eventId);
  await page.goto(`/org/events/${w.eventId}`);
  await expect(page.getByTestId("check-pins")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("dashboard-missing")).toContainText("All 6 seats have a PIN");
  await expect(page.getByTestId("dashboard-ready")).toHaveText("Ready to run");
  await expect(page.getByTestId("rail-golive")).toHaveAttribute("data-state", "done");
  await page.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/dashboard-laptop.png`, fullPage: true });
});

test("Hold, Resume at and Shift work from the dashboard; without a run order they are disabled with the reason", async ({ page }) => {
  test.setTimeout(120_000);
  await w.org.signIn(page, `/org/events/${w.eventId}`);
  const actions = page.getByTestId("quick-actions");
  await expect(actions.getByRole("button", { name: "Hold", exact: true })).toBeEnabled();
  await expect(actions.getByRole("button", { name: "Resume at…" })).toBeDisabled();
  await expect(actions.getByText("Nothing is on hold.")).toBeVisible();

  await actions.getByRole("button", { name: "Hold", exact: true }).click();
  await expect(page.getByTestId("run-hold")).toBeVisible();
  const { data: held } = await w.db.from("schedule_plans").select("hold").eq("id", w.planId).single();
  expect(held!.hold).not.toBeNull();
  await expect(actions.getByText("The run order is already on hold.")).toBeVisible();
  await expect(actions.getByRole("button", { name: "Shift +5 min" })).toBeDisabled();

  await actions.getByTestId("action-resume").getByRole("button", { name: "Resume at…" }).click();
  await page.getByLabel("Resume at", { exact: true }).fill("23:30");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByTestId("run-hold")).toHaveCount(0);
  const { data: resumed } = await w.db.from("schedule_plans").select("hold").eq("id", w.planId).single();
  expect(resumed!.hold).toBeNull();

  const { data: before } = await w.db.from("schedule_plans").select("anchors").eq("id", w.planId).single();
  await actions.getByTestId("action-shift-5").click();
  await expect.poll(async () => JSON.stringify((await w.db.from("schedule_plans").select("anchors").eq("id", w.planId).single()).data!.anchors)).not.toBe(JSON.stringify(before!.anchors));

  // no active run order for today: each button says why
  await w.db.from("schedule_plans").update({ active: false }).eq("id", w.planId);
  await page.reload();
  await expect(actions.getByRole("button", { name: "Hold", exact: true })).toBeDisabled();
  await expect(actions.getByText("No run order is active for today. Activate one in Run order.").first()).toBeVisible();
  // the big screen and the wind call are waiting for Phase 6 and say so
  await expect(actions.getByRole("button", { name: "Big screen" })).toBeDisabled();
  await expect(actions.getByText("The big screen comes with the public pages.")).toBeVisible();
  await expect(page.getByTestId("wind-call-slot").getByText("The wind call arrives with the public pages.")).toBeVisible();
  await expect(actions.getByRole("link", { name: "Open head judge console" })).toHaveAttribute("href", `/head/${w.eventId}`);
  await w.db.from("schedule_plans").update({ active: true }).eq("id", w.planId);
});

test("Previous and Next at the foot of every step: Next saves the Event form first, and stays with the error when it cannot", async ({ page }) => {
  test.setTimeout(180_000);
  await w.org.signIn(page, `/org/events/${w.eventId}/event`);
  const footer = page.getByTestId("step-footer");
  await expect(footer.getByRole("link", { name: /Previous/ })).toHaveCount(0); // the first step has only Next
  // an empty name cannot be saved: Next stays on the Event step and says why
  await page.getByLabel("Event name", { exact: true }).fill("");
  await footer.getByRole("link", { name: "Next: Divisions" }).click();
  await expect(page).toHaveURL(new RegExp(`/event$`));
  await expect(page.getByRole("alert").first()).toBeVisible();
  // a new name is saved by Next, then the Divisions step opens
  await page.getByLabel("Event name", { exact: true }).fill(`Next Cup ${w.org.run}`);
  await footer.getByRole("link", { name: "Next: Divisions" }).click();
  await expect(page).toHaveURL(new RegExp(`/divisions$`));
  await expect.poll(async () => (await w.db.from("events").select("name").eq("id", w.eventId).single()).data?.name).toBe(`Next Cup ${w.org.run}`);
  // Next, Next, Next, Next: Riders, Officials, Draw, Run order
  for (const [next, url] of [["Riders", "riders"], ["Officials", "officials"], ["Draw", "draw"], ["Run order", "schedule"]] as const) {
    await page.getByTestId("step-footer").getByRole("link", { name: `Next: ${next}` }).click();
    await expect(page).toHaveURL(new RegExp(`/${url}$`));
  }
  await page.getByTestId("step-footer").getByRole("link", { name: "Next: Go live" }).click();
  await expect(page).toHaveURL(new RegExp(`/org/events/${w.eventId}$`));
  // Go live has only Previous
  await expect(page.getByTestId("step-footer").getByRole("link", { name: /Next/ })).toHaveCount(0);
  await page.getByTestId("step-footer").getByRole("link", { name: "Previous: Run order" }).click();
  await expect(page).toHaveURL(new RegExp(`/schedule$`));
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("the rail becomes the step picker with the state words, and nothing scrolls sideways", async ({ page }) => {
    test.setTimeout(120_000);
    await w.org.signIn(page, `/org/events/${w.eventId}`);
    const picker = page.getByTestId("step-picker");
    await expect(picker).toBeVisible();
    const options = await page.locator("#step-picker-select option").allTextContents();
    expect(options).toHaveLength(7);
    for (const o of options) expect(o).toMatch(STATE_WORDS);
    expect(options[6]).toContain("Go live");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/dashboard-phone.png`, fullPage: true });
    await page.locator("#step-picker-select").selectOption("officials");
    await expect(page).toHaveURL(new RegExp(`/officials$`));
  });
});
