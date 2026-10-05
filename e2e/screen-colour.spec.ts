import { expect, test, type Browser, type Page } from "@playwright/test";
import { createLiveWorld } from "./live-world";
import { createPublicWorld, type PublicWorld } from "./public-world";

/**
 * Polish 2b, item 3 — the big screen's Day and Dark colours. A throwaway public event: the control shows on mouse move or tap and hides after three seconds, D flips the mode,
 * the choice is remembered in the browser, the event's default (Event step) applies until then; every big-screen state renders readably in both modes: before the event,
 * a running heat, the published result, a wind hold, a held final.
 */
test.describe.configure({ mode: "serial" });

let w: PublicWorld;
const SHOTS = process.env.SCREEN_SHOTS_DIR ?? "";
const screen = () => `/screen/${w.slug}`;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  w = await createPublicWorld({ settings: { screenRotateSec: 5 } });
});
test.afterAll(async () => {
  await w?.cleanup();
});

const fresh = async (browser: Browser, opts: { touch?: boolean } = {}) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, ...(opts.touch ? { hasTouch: true } : {}) });
  return { context, page: await context.newPage() };
};

/** Moves the mouse until the control shows (the first moves may come before the page has finished loading). */
async function wake(page: Page) {
  let x = 300;
  await expect(async () => {
    await page.mouse.move((x += 7), 300);
    await expect(page.getByTestId("screen-mode-toggle")).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 20_000 });
}

/** WCAG contrast ratio between the screen's text colour and its ground, from the computed colours. */
async function contrastOf(page: Page): Promise<number> {
  return page.getByTestId("big-screen").evaluate((el) => {
    const parse = (c: string) => c.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const cs = getComputedStyle(el);
    const a = lum(parse(cs.color)) + 0.05;
    const b = lum(parse(cs.backgroundColor)) + 0.05;
    return Math.max(a, b) / Math.min(a, b);
  });
}

test("the control shows on mouse move, hides after three seconds; Dark is the default; the choice is remembered; D flips it; a tap shows the control on a touch screen", async ({ browser }) => {
  const { context, page } = await fresh(browser);
  await page.goto(screen());
  const frame = page.getByTestId("big-screen");
  await expect(frame).toHaveAttribute("data-mode", "dark");
  expect(await frame.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(11, 14, 15)");
  await expect(page.getByTestId("screen-mode-toggle")).toHaveCount(0); // the screen stays clean
  await wake(page);
  await expect(page.getByTestId("screen-mode-toggle")).toHaveAccessibleName("Day colours");
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("screen-mode-toggle")).toBeVisible(); // not yet
  await expect(page.getByTestId("screen-mode-toggle")).toHaveCount(0, { timeout: 4000 }); // gone after three seconds
  await wake(page);
  await page.getByTestId("screen-mode-toggle").click();
  await expect(frame).toHaveAttribute("data-mode", "day");
  expect(await frame.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(251, 250, 245)");
  await page.reload();
  await expect(frame).toHaveAttribute("data-mode", "day"); // remembered in this browser
  await page.keyboard.press("d");
  await expect(frame).toHaveAttribute("data-mode", "dark");
  await page.reload();
  await expect(frame).toHaveAttribute("data-mode", "dark");
  await page.keyboard.press("D");
  await expect(frame).toHaveAttribute("data-mode", "day");
  await expect(page.getByTestId("screen-mode-toggle")).toHaveCount(0); // the key does not show the control
  await context.close();

  // a touch screen: a tap shows it
  const touch = await fresh(browser, { touch: true });
  await touch.page.goto(screen());
  await expect(touch.page.getByTestId("big-screen")).toHaveAttribute("data-mode", "dark");
  await touch.page.tap("body", { position: { x: 800, y: 450 } });
  await expect(touch.page.getByTestId("screen-mode-toggle")).toBeVisible();
  await touch.page.getByTestId("screen-mode-toggle").tap();
  await expect(touch.page.getByTestId("big-screen")).toHaveAttribute("data-mode", "day");
  await touch.context.close();
});

test("the event's default decides until a browser has chosen: Day set on the Event step opens in Day", async ({ browser }) => {
  const { data } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  await w.db.from("events").update({ settings: { ...(data!.settings as object), screenColourMode: "day" } as never }).eq("id", w.eventId);
  const a = await fresh(browser);
  await a.page.goto(screen());
  await expect(a.page.getByTestId("big-screen")).toHaveAttribute("data-mode", "day");
  await wake(a.page);
  await a.page.getByTestId("screen-mode-toggle").click();
  await expect(a.page.getByTestId("big-screen")).toHaveAttribute("data-mode", "dark");
  await a.page.reload();
  await expect(a.page.getByTestId("big-screen")).toHaveAttribute("data-mode", "dark"); // the browser's own choice beats the event's default
  await a.context.close();
  await w.db.from("events").update({ settings: data!.settings as never }).eq("id", w.eventId);
});

const MODES = ["dark", "day"] as const;

for (const mode of MODES) {
  test(`${mode}: the running heat, the published result and the sponsors page, a wind hold and a held final are readable`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page } = await fresh(browser);
    await context.addInitScript((m) => window.localStorage.setItem("bigair-screen-mode", m), mode);
    const shot = async (name: string) => {
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/screen-${name}-${mode}.png` });
    };
    const frame = page.getByTestId("big-screen");
    const check = async () => {
      await expect(frame).toHaveAttribute("data-mode", mode);
      expect(await contrastOf(page)).toBeGreaterThanOrEqual(7);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };
    const slide = async (label: string) => {
      const kinds = await page.getByTestId("screen-slide").evaluateAll((els) => els.map((e) => e.getAttribute("data-slide")));
      await page.keyboard.press("Space"); // stop the rotation, then jump
      await page.keyboard.press(`Digit${kinds.indexOf(label) + 1}`);
      await expect(page.locator(`[data-testid="screen-slide"][data-slide="${label}"]`)).toBeVisible();
    };

    // running heat, with a green wind call
    await w.db.from("events").update({ branding: { sponsors: [{ name: "WOO Events" }] } }).eq("id", w.eventId);
    await w.db.from("wind_calls").insert({ event_id: w.eventId, status: "green", message: "Good to go" });
    await page.goto(screen());
    await check();
    await slide("Live heat");
    await expect(page.getByTestId("screen-rider").first()).toBeVisible();
    const digit = await page.getByTestId("screen-rider").first().locator("span").last().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(digit).toBeGreaterThanOrEqual(100); // the same sizes in both modes
    await expect(page.getByTestId("wind-banner")).toHaveText("Wind Call: Good to go");
    await shot("running");
    // the Lycra chip of the first rider is its own solid colour, with the word beside it
    await expect(page.getByTestId("screen-rider").first()).toContainText(/RED/i);

    // published result and the sponsors page
    await slide("Latest result");
    await expect(page.getByTestId("screen-rider").first()).toBeVisible();
    await shot("results");
    await slide("Thank you to our sponsors");
    await shot("sponsors");

    // wind hold: a red call and the plan on hold
    await w.db.from("wind_calls").insert({ event_id: w.eventId, status: "red", message: "Wind hold — heats paused" });
    const { data: plan } = await w.db.from("schedule_plans").select("id").eq("id", w.planId).single();
    await w.db.from("schedule_plans").update({ hold: { since: new Date().toISOString(), reason: "wind" } as never }).eq("id", plan!.id);
    await page.reload();
    await check();
    await expect(page.getByTestId("wind-banner")).toHaveText("Wind Call: Wind hold — heats paused");
    await slide("Timetable");
    await shot("wind-hold");
    await w.db.from("schedule_plans").update({ hold: null }).eq("id", plan!.id);
    await w.db.from("wind_calls").insert({ event_id: w.eventId, status: "clear", message: null });

    // held final: published but held back, so no podium; then released
    const { publishLadderHeat } = await import("../tests/rls/public-helpers");
    const ctx = { s: w.db, ids: { orgA: w.orgId, evA1: w.eventId, modelA1: w.modelId } };
    const { data: div } = await w.db.from("divisions").select("draw").eq("id", w.ladder.div).single();
    const { data: held } = await w.db.from("heats").select("id, status").eq("id", w.ladder.heats["F-H1"]).single();
    if (held!.status !== "published") {
      let draw = div!.draw as never;
      draw = (await publishLadderHeat(ctx, w.ladder, "R1-H2", { draw })).draw as never;
      await publishLadderHeat(ctx, w.ladder, "F-H1", { draw, hold: true });
    } else await w.db.from("heats").update({ publish_hold: true }).eq("id", w.ladder.heats["F-H1"]);
    await page.reload();
    await check();
    await expect(page.getByTestId("screen-podium")).toHaveCount(0);
    await shot("held-final");
    await w.db.from("heats").update({ publish_hold: false }).eq("id", w.ladder.heats["F-H1"]);
    await page.reload();
    await check();
    await expect(page.getByTestId("screen-podium")).toHaveCount(1);
    await slide("Podium");
    await shot("podium");
    await w.db.from("heats").update({ publish_hold: true }).eq("id", w.ladder.heats["F-H1"]);
    await context.close();
  });
}

test("before the event: the screen waits for the next heat, in both modes", async ({ browser }) => {
  test.setTimeout(240_000);
  const early = await createLiveWorld();
  try {
    const { data } = await early.db.from("events").select("slug, settings").eq("id", early.eventId).single();
    await early.db.from("events").update({ status: "published", settings: { ...(data!.settings as object), readyCallMin: 15 } as never }).eq("id", early.eventId);
    for (const mode of MODES) {
      const { context, page } = await fresh(browser);
      await context.addInitScript((m) => window.localStorage.setItem("bigair-screen-mode", m), mode);
      await page.goto(`/screen/${data!.slug}`);
      await expect(page.getByTestId("big-screen")).toHaveAttribute("data-mode", mode);
      expect(await contrastOf(page)).toBeGreaterThanOrEqual(7);
      await expect(page.getByTestId("big-screen")).toContainText(/waiting for the next heat|timetable/i);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/screen-before-${mode}.png` });
      await context.close();
    }
  } finally {
    await early.cleanup();
  }
});
