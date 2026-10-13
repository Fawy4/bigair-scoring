import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { BrowserContext, Page } from "@playwright/test";

// The head judge's laptop console (900 px and wider): the flag strip sits in the top bar between the heat's status and "Sound on" when it fits whole, with Start / Resume / End
// directly below; a window too narrow for it puts it back on its own row. A throwaway organisation; Arrow, EKL and Demo are never touched.
let w: LiveWorld;
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld({ flags: true });
});
test.afterEach(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});
async function open(browser: import("@playwright/test").Browser, width: number, height: number): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height } });
  contexts.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await w.signInAs(page, "head", `/head/${w.eventId}`);
  return page;
}
const box = async (p: Page, id: string) => (await p.getByTestId(id).first().boundingBox())!;

test("the flag strip is in the top bar at 1280 and 1920, whole, with Start right below; a narrow window gives it its own row back", async ({ browser }) => {
  test.setTimeout(240_000);
  const head = await open(browser, 1280, 800);
  await expect(head.getByTestId("heat-timer")).toBeVisible({ timeout: 60_000 });
  const pics = process.env.CONSOLE_PICS;
  for (const [width, height] of [[1280, 800], [1920, 1080]] as const) {
    await head.setViewportSize({ width, height });
    await expect(head.getByTestId("top-bar-flag").getByTestId("heat-timer")).toBeVisible();
    const strip = await box(head, "heat-timer");
    const bar = await box(head, "top-bar");
    const sound = await box(head, "sound-toggle");
    const status = head.getByTestId("top-bar").locator("[data-flag-message]");
    const st = (await status.boundingBox())!;
    // inside the top bar, left of "Sound on", right of the status, on the same line
    expect(strip.y).toBeGreaterThanOrEqual(bar.y);
    expect(strip.y + strip.height).toBeLessThanOrEqual(bar.y + bar.height);
    expect(strip.x + strip.width).toBeLessThanOrEqual(sound.x + 1);
    expect(strip.x).toBeGreaterThanOrEqual(st.x - 1);
    expect(strip.y).toBeLessThan(sound.y + sound.height);
    // whole: nothing is cut or hidden inside it
    const cut = await head.getByTestId("heat-timer").evaluate((el) => el.scrollWidth > el.clientWidth + 1 || [...el.querySelectorAll("*")].some((c) => (c as HTMLElement).scrollWidth > (c as HTMLElement).clientWidth + 1));
    expect(cut).toBe(false);
    // Start (or Resume) and End sit directly under the top bar's first line, not under a strip row
    const start = await box(head, "start");
    expect(start.y).toBeLessThan(strip.y + strip.height + 70);
    expect(await head.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (pics) await head.screenshot({ path: `${pics}/console-top-${width}.png`, clip: { x: 0, y: 0, width, height: 260 } });
  }
  // too narrow for the whole strip: its own row again (inside the timer bar, below the top row), still whole
  await head.setViewportSize({ width: 900, height: 800 });
  await expect(head.getByTestId("top-bar-flag")).toHaveCount(0);
  await expect(head.getByTestId("heat-timer")).toBeVisible();
  const narrow = await box(head, "heat-timer");
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(900);
});
