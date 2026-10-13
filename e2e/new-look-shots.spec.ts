import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createPublicWorld, type PublicWorld } from "./public-world";
import { createOrganiser } from "./organiser";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// The pictures for the New look pull request, and a look with real data at the screens the unit tests cannot see: the head judge's console, the big screen, the Flag view, the
// public event page and its results, the Riders step, Admin. One throwaway event (removed afterwards); a screen that overflows sideways fails the test. Pictures go to
// docs/design-pass/ (final-*.png). Run with one worker on a production build.
const OUT = process.env.SHOTS_OUT ?? "docs/design-pass";
let w: PublicWorld;
const contexts: BrowserContext[] = [];
test.beforeAll(async () => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  w = await createPublicWorld({ settings: { screenRotateSec: 5 } });
  // flags on, so the Flag view and the flag strip show
  const { data } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  await w.db.from("events").update({ settings: { ...((data?.settings ?? {}) as object), flags: { enabled: true, prestartSec: 10, lastMinuteSec: 60 } } as never }).eq("id", w.eventId);
});
test.afterAll(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});

async function open(browser: Browser, size: { width: number; height: number }, theme: "day" | "dark" | null = null): Promise<Page> {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2 });
  contexts.push(context);
  await installSupabaseProxy(context, { newViews: true });
  if (theme)
    await context.addInitScript((t) => {
      try {
        window.localStorage.setItem("bigair.beach-theme", t);
      } catch {
        /* no storage */
      }
    }, theme);
  return context.newPage();
}
/** No sideways scrolling: the page is never wider than the display. */
async function noOverflow(page: Page, what: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `${what} scrolls sideways by ${over} px`).toBeLessThanOrEqual(1);
}

test("the officials' screens with a running heat, in Day and in Dark", async ({ browser }) => {
  test.setTimeout(400_000);
  for (const theme of ["day", "dark"] as const) {
    const spotter = await open(browser, { width: 390, height: 844 }, theme);
    await w.signInAs(spotter, "spotter", `/spot/${w.eventId}`);
    await expect(spotter.getByTestId("spotter-sheet")).toBeVisible({ timeout: 60_000 });
    await expect(spotter.getByTestId("rider-tile").first()).toBeVisible();
    await spotter.waitForTimeout(1500);
    await noOverflow(spotter, `spotter ${theme}`);
    await spotter.screenshot({ path: `${OUT}/final-spotter-sheet-${theme}.png` });

    const judge = await open(browser, { width: 390, height: 844 }, theme);
    await w.signInAs(judge, "j1", `/judge/${w.eventId}`);
    await expect(judge.getByTestId("rider-sheet")).toBeVisible({ timeout: 60_000 });
    await expect(judge.getByTestId("sheet-line")).toHaveCount(7, { timeout: 30_000 });
    await judge.waitForTimeout(1500);
    await noOverflow(judge, `judge ${theme}`);
    await judge.screenshot({ path: `${OUT}/final-judge-sheet-${theme}.png` });

    const head = await open(browser, { width: 390, height: 844 }, theme);
    await w.signInAs(head, "head", `/head/${w.eventId}`);
    await expect(head.getByTestId("selected-heat").first()).toBeVisible({ timeout: 60_000 });
    await head.waitForTimeout(2000);
    await noOverflow(head, `head judge phone ${theme}`);
    await head.screenshot({ path: `${OUT}/final-head-phone-${theme}.png` });
  }
});

test("the console, the big screen, the Flag view and the public pages with real data (Day)", async ({ browser }) => {
  test.setTimeout(400_000);
  // the head judge's console on a laptop, top of the page
  const console_ = await open(browser, { width: 1440, height: 900 }, "day");
  await w.signInAs(console_, "head", `/head/${w.eventId}`);
  await expect(console_.getByTestId("selected-heat")).toBeVisible({ timeout: 60_000 });
  await console_.waitForTimeout(2500);
  await noOverflow(console_, "console");
  await console_.screenshot({ path: `${OUT}/final-console-day.png`, clip: { x: 0, y: 0, width: 1440, height: 560 } });

  // the big screen in Day (the D key flips the mode)
  const screen = await open(browser, { width: 1600, height: 900 });
  await screen.goto(`/screen/${w.slug}`);
  await expect(screen.getByTestId("big-screen")).toBeVisible({ timeout: 60_000 });
  await screen.keyboard.press("d");
  await expect(screen.getByTestId("big-screen")).toHaveAttribute("data-mode", "day", { timeout: 10_000 });
  await screen.waitForTimeout(1500);
  await noOverflow(screen, "big screen");
  await screen.screenshot({ path: `${OUT}/final-big-screen-day.png` });

  // the Flag view (the marshal's page)
  const flag = await open(browser, { width: 390, height: 844 });
  await flag.goto(`/e/${w.slug}/flag`);
  await flag.waitForTimeout(3000);
  await noOverflow(flag, "Flag view");
  await flag.screenshot({ path: `${OUT}/final-flag-view-day.png` });

  // the public event page and the results of a published heat
  const pub = await open(browser, { width: 390, height: 844 });
  await pub.goto(`/e/${w.slug}`);
  await expect(pub.locator("main")).toBeVisible({ timeout: 60_000 });
  await pub.waitForTimeout(1500);
  await noOverflow(pub, "public event page");
  await pub.screenshot({ path: `${OUT}/final-public-event-day.png` });
  await pub.goto(`/e/${w.slug}/results`);
  await pub.getByTestId("heat-tab").filter({ hasText: "Heat 1" }).click();
  await expect(pub.getByTestId("public-rider")).toHaveCount(4, { timeout: 30_000 });
  await noOverflow(pub, "public results");
  await pub.screenshot({ path: `${OUT}/final-public-results-day.png` });
});

test("the Riders step and Admin (Day)", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await open(browser, { width: 1280, height: 900 }, "day");
  await w.org.signIn(page, `/org/events/${w.eventId}/riders`);
  await expect(page.locator("main").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  await noOverflow(page, "Riders step");
  await page.screenshot({ path: `${OUT}/final-riders-step-day.png` });
  const owner = await createOrganiser({ platformAdmin: "owner" });
  try {
    const admin = await open(browser, { width: 1280, height: 900 }, "day");
    await owner.signIn(admin, "/admin");
    await expect(admin.locator("main, body").first()).toBeVisible({ timeout: 60_000 });
    await admin.waitForTimeout(2500);
    await noOverflow(admin, "Admin");
    await admin.screenshot({ path: `${OUT}/final-admin-day.png` });
  } finally {
    await owner.cleanup();
  }
});
