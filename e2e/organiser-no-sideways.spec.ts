import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { BrowserContext, Page } from "@playwright/test";

// No sideways scrolling in the organiser's event setup at 390 × 844 in Day, also once every section that opens (the "‹n› more settings" of a card, details, advanced) is open.
// A phone that has something wider than the screen zooms out and shifts the page left, leaving white on the right (owner, iPhone, "23 more settings").
// A throwaway organisation (removed afterwards; Arrow, EKL and Demo are never touched). One worker, on a production build.
let w: LiveWorld;
const contexts: BrowserContext[] = [];
test.beforeAll(async () => {
  test.setTimeout(240_000);
  w = await createLiveWorld();
});
test.afterAll(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});

/** Every element whose right edge is past the screen's edge and that no clipping or scrolling box of its own holds in: what makes the page wider than the display. */
export async function widerThanScreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const clipped = (el: Element): boolean => {
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const o = getComputedStyle(p);
        if (o.overflowX !== "visible") return true;
      }
      return false;
    };
    const desc = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}.${(el.getAttribute("class") ?? "").split(/\s+/).slice(0, 4).join(".")}`;
    const out: string[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right <= vw + 0.5) continue;
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.visibility === "hidden") continue;
      if (clipped(el)) continue;
      out.push(`${desc(el)} right ${Math.round(r.right)} width ${Math.round(r.width)} (screen ${vw})`);
    }
    // keep the outermost ones: a child of an element already listed is only a consequence
    return out.slice(0, 40);
  });
}

async function openEverything(page: Page): Promise<number> {
  let opened = 0;
  for (let round = 0; round < 4; round++) {
    const toggles = page.locator('[data-testid="advanced-toggle"][aria-expanded="false"], [data-testid^="fold-"][aria-expanded="false"], summary:not([open]) , details:not([open]) > summary');
    const n = await toggles.count();
    if (n === 0) break;
    for (let i = 0; i < n; i++) {
      const t = toggles.nth(i);
      if (await t.isVisible().catch(() => false)) {
        await t.click({ timeout: 5_000 }).catch(() => undefined);
        opened++;
      }
    }
    await page.waitForTimeout(300);
  }
  return opened;
}

const STEPS = ["/event", "/divisions", "/riders", "/officials", "/draw", "/schedule", ""];

test("event setup at 390 × 844 in Day: nothing is wider than the screen, also with every 'more settings' open", async ({ browser }) => {
  test.setTimeout(600_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  contexts.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await w.org.signIn(page, `/org/events/${w.eventId}`);
  const report: string[] = [];
  for (const step of STEPS) {
    await page.goto(`/org/events/${w.eventId}${step}`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(1500);
    const before = await widerThanScreen(page);
    const opened = await openEverything(page);
    await page.waitForTimeout(500);
    const after = await widerThanScreen(page);
    const doc = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (process.env.OVERFLOW_PICS) await page.screenshot({ path: `${process.env.OVERFLOW_PICS}/organiser${step.replace("/", "-") || "-dashboard"}-open.png`, fullPage: false });
    if (before.length || after.length || doc > 1) report.push(`step "${step || "dashboard"}": ${opened} sections opened; wider before: ${before.length}, after: ${after.length}; page overflow ${doc}px\n   ${[...before, ...after].slice(0, 12).join("\n   ")}`);
  }
  expect(report, report.join("\n")).toEqual([]);
});
