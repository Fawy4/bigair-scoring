import { test, expect } from "./base";
import type { Locator, Page } from "@playwright/test";

// Phase 5a: the public /design preview at the owner's phone size (390 × 844, an iPhone 14).
// Normal text size (docs/06 §00.2 after the outdoor test): pad buttons 48–52 px with 6–8 px gaps, digits 22–24 px, rider names 17–18 px,
// status words 13–14 px, body 15–16 px, slim timer 20–24 px (48 px only on the head console), other buttons >= 44 px, weight 700 only on the selected score.
// Large text size: pad buttons >= 56 px with 8 px gaps, digits >= 28 px, names >= 20 px, other buttons >= 48 px.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const frame = (page: Page, id: string) => page.getByTestId(`section-${id}`).getByTestId("phone-frame");

async function noSidewaysScroll(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(scroll, "page is wider than the screen").toBeLessThanOrEqual(inner);
}

/** Smallest tap targets that are not pad buttons, and pad button boxes, for everything visible on the page. */
async function tapAudit(page: Page, minOther: number) {
  return page.evaluate((min) => {
    const out: string[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden";
    };
    // the sticky bar and its menu are the preview page's own chrome (always Normal sizes); the official screens and parts below it follow the text size
    for (const el of Array.from(document.querySelectorAll("button, a[href], summary, input:not([type=hidden]):not([type=checkbox])"))) {
      if (!visible(el) || el.hasAttribute("data-pad-button") || el.closest("header")) continue;
      const r = el.getBoundingClientRect();
      if (r.height < min - 0.5 || r.width < min - 0.5) out.push(`${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)} < ${min}`);
    }
    for (const box of Array.from(document.querySelectorAll("label:has(input[type=checkbox])"))) {
      const r = box.getBoundingClientRect();
      if (r.height < min - 0.5) out.push(`checkbox label ${Math.round(r.height)} < ${min}`);
    }
    return out;
  }, minOther);
}

async function padStats(page: Page) {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("[data-pad-button]"));
    const heights = buttons.map((b) => b.getBoundingClientRect().height);
    const widths = buttons.map((b) => b.getBoundingClientRect().width);
    const gaps = Array.from(document.querySelectorAll("[data-testid=score-pad]")).map((p) => {
      const [a, b] = Array.from(p.querySelectorAll("[data-pad-button]")).slice(0, 2).map((x) => x.getBoundingClientRect());
      return Math.round(b.left - a.right);
    });
    const size = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
    return { count: buttons.length, minH: Math.min(...heights), maxH: Math.max(...heights), minW: Math.min(...widths), gaps, digit: Math.min(...buttons.map(size)) };
  });
}

const fontPx = (loc: Locator) => loc.first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

test("the page opens without a login, says it is not live, and has a short menu that jumps to a screen", async ({ page }) => {
  await page.goto("/design");
  await expect(page.getByTestId("not-live")).toHaveText("Design preview — nothing here is live");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByTestId("design-menu").locator("summary").click();
  await page.getByRole("link", { name: "Judge — heat end" }).click();
  await expect(page.getByTestId("section-judge-end")).toBeInViewport();
  await expect(page.getByTestId("design-menu")).not.toHaveAttribute("open", "");
});

test("the six full-screen mocks come first, in order, each as a phone frame", async ({ page }) => {
  await page.goto("/design");
  const ids = await page.locator("[data-testid^=section-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(ids.slice(0, 6)).toEqual(["section-judge-live", "section-judge-details", "section-judge-sheet", "section-spotter-live", "section-judge-end", "section-head-phone"]);
  for (const id of ["judge-live", "judge-details", "judge-sheet", "spotter-live", "judge-end", "head-phone"]) await expect(frame(page, id)).toHaveCount(1);
});

test("on a computer each mock is a 390 × 844 phone frame", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/design");
  const box = await frame(page, "judge-live").boundingBox();
  expect(Math.round(box!.width)).toBe(390);
  expect(Math.round(box!.height)).toBe(844);
});

test("on a phone a mock fills the display under the sticky bar", async ({ page }) => {
  await page.goto("/design");
  const box = await frame(page, "judge-live").boundingBox();
  const vh = page.viewportSize()!.height;
  expect(box!.height).toBeGreaterThan(vh - 100);
  expect(box!.height).toBeLessThanOrEqual(vh);
});

test("Judge — live heat fits: header, 3–4 riders, the current attempt with its whole pad, and the top of the previous card (390 × 844, 750 and 664 high; no scrolling at 844)", async ({ page }) => {
  for (const height of [844, 750, 664]) {
    await page.setViewportSize({ width: 390, height });
    await page.goto("/design");
    const f = frame(page, "judge-live");
    await f.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -56));
    const body = f.getByTestId("screen-body");
    if (height === 844) expect(await body.evaluate((el) => el.scrollHeight <= el.clientHeight + 1), "scrolls at 844").toBe(true);
    await expect(f.getByTestId("screen-header")).toBeVisible();
    const riders = await f.getByTestId("rider-tile").count();
    expect(riders).toBeGreaterThanOrEqual(3);
    expect(riders).toBeLessThanOrEqual(4);
    const fb = (await f.boundingBox())!;
    const current = (await f.getByTestId("attempt-card").first().boundingBox())!;
    expect(current.y + current.height, `current attempt (incl. Missed / Flag) cut off at ${height}`).toBeLessThanOrEqual(fb.y + fb.height);
    const pads = f.locator("[data-pad-button]");
    const n = await pads.count();
    for (let i = 0; i < n; i++) {
      const b = (await pads.nth(i).boundingBox())!;
      expect(b.y + b.height, `pad button ${i} below the frame at ${height}`).toBeLessThanOrEqual(fb.y + fb.height + 0.5);
    }
    const prev = (await f.locator('[data-testid=attempt-card][data-compact="true"]').first().boundingBox())!;
    expect(prev.y, `the previous card cannot be seen at ${height}`).toBeLessThan(fb.y + fb.height - 12);
    // the timer is slim and sits in the header, above the rider strip
    const timer = (await f.getByTestId("heat-timer").boundingBox())!;
    const strip = (await f.getByTestId("rider-tile").first().boundingBox())!;
    expect(timer.y + timer.height).toBeLessThanOrEqual(strip.y);
  }
});

test("the default judge view is only header, riders and the current attempt (no Details content)", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "judge-live");
  await expect(f.getByTestId("attempt-card")).toHaveCount(2); // the current attempt and the top of the previous one
  await expect(f.getByTestId("details-list")).toHaveCount(0);
  await expect(f.getByTestId("rider-sheet")).toHaveCount(0);
});

test("Details switches the whole screen to every attempt and back", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "judge-live");
  await f.getByTestId("details-toggle").click();
  await expect(f.getByTestId("details-list")).toBeVisible();
  await expect(f.getByTestId("attempt-card")).toHaveCount(6);
  await expect(f.locator("[data-pad-button]")).toHaveCount(0);
  await expect(f.getByTestId("details-toggle")).toHaveText("Details on");
  await f.getByTestId("details-toggle").click();
  await expect(f.getByTestId("details-list")).toHaveCount(0);
  await expect(f.locator("[data-pad-button]").first()).toBeVisible();
  // the mock that starts in Details shows trick names, status pills
  const d = frame(page, "judge-details");
  await expect(d.getByTestId("attempt-card")).toHaveCount(6);
  await expect(d.getByText("Crashed", { exact: true })).toBeVisible();
});

test("tapping a rider's name opens that rider's sheet, which closes on one tap", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "judge-live");
  await f.getByTestId("rider-name-button").click();
  const sheet = f.getByTestId("rider-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Attempts 6 / 7");
  await expect(sheet).toContainText("Left 3 · Right 1");
  expect(await sheet.locator('li[data-counted="true"]').count()).toBe(3);
  await expect(sheet.getByText("Crashed", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
  // the other mock starts with the sheet open; the dimmed area closes it too
  const g = frame(page, "judge-sheet");
  await expect(g.getByTestId("rider-sheet")).toBeVisible();
  await g.getByRole("button", { name: "Close" }).first().click({ position: { x: 20, y: 20 } });
  await expect(g.getByTestId("rider-sheet")).toHaveCount(0);
});

test("score pad: a whole number then a tenth; the confirmation line stays until the next tap", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "judge-live");
  await f.getByRole("button", { name: "Set 7", exact: true }).click();
  await expect(f.getByTestId("pad-value")).toHaveText("7.0");
  await f.getByRole("button", { name: "Set .5" }).click();
  await expect(f.getByTestId("pad-value")).toHaveText("7.5");
  await expect(f.getByTestId("pad-caption")).toHaveText("Saved 7.5 — RED — attempt 6");
  await f.getByRole("button", { name: "Missed" }).click();
  await expect(f.getByTestId("missed-note")).toBeVisible();
  await expect(f.getByTestId("pad-value")).toHaveText("—");
});

test("spotter: riders with counters, direction, builder, CRASH asks once, Log confirms", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "spotter-live");
  await expect(f.getByTestId("rider-tile")).toHaveCount(4);
  await expect(f.getByTestId("rider-tile-counter").first()).toHaveText("6 / 7");
  await expect(f.getByTestId("rider-tile").nth(2)).toContainText("Out");
  for (const id of ["direction:left", "multiplier:x2", "base:backroll", "addon:handle_pass", "addon:board_off"]) await f.locator(`[data-block="${id}"]`).click();
  await expect(f.getByTestId("composed-name")).toContainText("Left ×2 Backroll Board-off Handle pass");
  await expect(f.getByTestId("composed-name")).toContainText("Handle pass");
  await f.getByTestId("log-button").click();
  await expect(f.getByTestId("spotter-logged")).toHaveText("Logged — RED — attempt 7");
  await expect(f.getByTestId("rider-tile-counter").first()).toHaveText("7 / 7");
  await f.getByTestId("crash-button").click();
  await expect(f.getByRole("alertdialog")).toBeVisible();
  await f.getByRole("button", { name: "Cancel" }).click();
  await expect(f.getByTestId("crash-button")).toBeVisible();
});

test("heat end: compact summary above the pad, Submit sheet waits for every rider, asks once, then locks", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "judge-end");
  const card = f.getByTestId("impression-card");
  await expect(card.getByTestId("impression-progress")).toHaveText("1 / 3 riders");
  await expect(card.getByRole("button", { name: "Submit sheet" })).toBeDisabled();
  const summary = card.getByTestId("heat-summary");
  await expect(summary.getByTestId("summary-counts")).toHaveText("5 attempts · 4 landed · 1 crashed");
  await expect(summary).toContainText("Left 3 · Right 1");
  await expect(summary).toContainText("Repeats ×0");
  await expect(summary).toContainText("Double loop");
  await expect(summary).toContainText("8.25");
  await expect(summary).not.toContainText(/famil|rotation/i);
  // the summary is above the pad
  const sBox = (await summary.boundingBox())!;
  const pBox = (await card.getByTestId("score-pad").boundingBox())!;
  expect(sBox.y + sBox.height).toBeLessThanOrEqual(pBox.y);
  for (const i of [1, 2]) {
    await card.getByTestId("rider-tile").nth(i).click();
    await card.getByRole("button", { name: "Set 7", exact: true }).click();
  }
  await expect(card.getByTestId("impression-progress")).toHaveText("3 / 3 riders");
  await card.getByRole("button", { name: "Submit sheet" }).click();
  await card.getByRole("button", { name: "Yes, submit" }).click();
  await expect(card.getByTestId("submitted-note")).toBeVisible();
  await expect(card.getByRole("button", { name: "Set 8", exact: true })).toBeDisabled();
});

test("head judge on a phone: the controls only, the big timer (48 px), no scores", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "head-phone");
  await expect(f.getByTestId("head-controls")).toBeVisible();
  for (const id of ["pause", "end", "hold", "resumeAt", "shift5", "shift10", "publish", "reopen"]) await expect(f.locator(`[data-control="${id}"]`)).toBeVisible();
  await expect(f.locator('[data-control="publish"]')).toBeDisabled();
  expect(await fontPx(f.getByTestId("heat-timer-clock"))).toBe(48);
  await expect(f.getByText("Score table: open this page on a tablet or laptop")).toBeVisible();
  await expect(f.locator("[data-pad-button]")).toHaveCount(0);
});

test("criteria: one tab per criterion and one pad; the trick score appears once all four are set (docs/08 §1A attempt 1 gives 7.625)", async ({ page }) => {
  await page.goto("/design#criteria");
  const rows = page.getByTestId("criteria-rows");
  const entry = async (key: string, whole: number, tenth: string) => {
    await rows.locator(`[data-criterion="${key}"]`).click();
    await rows.getByRole("button", { name: `Set ${whole}`, exact: true }).click();
    await rows.getByRole("button", { name: `Set .${tenth}` }).click();
  };
  await entry("height", 8, "0");
  await entry("extremity", 7, "5");
  await entry("technicality", 7, "0");
  await expect(rows.getByTestId("computed-trick-score")).not.toContainText("7.625");
  await entry("execution", 8, "0");
  await expect(rows.getByTestId("computed-trick-score")).toContainText("7.625");
  expect(await rows.getByTestId("score-pad").count()).toBe(1);
});

test("every colour carries its name, in both themes", async ({ page }) => {
  await page.goto("/design#labels");
  for (const theme of ["Daylight", "Dark"]) {
    await page.getByRole("button", { name: theme, exact: true }).click();
    const labels = page.getByTestId("section-labels").getByTestId("rider-label-primary");
    const n = await labels.count();
    expect(n).toBeGreaterThan(10);
    for (let i = 0; i < n; i++) expect((await labels.nth(i).innerText()).trim().length, `label ${i} in ${theme}`).toBeGreaterThan(0);
    for (const word of ["RED", "WHITE", "BLACK"]) await expect(page.getByTestId("section-labels").getByTestId("rider-label-text").filter({ hasText: new RegExp(`^${word}$`) }).first()).toBeAttached();
    expect(await page.getByTestId("section-labels").getByTestId("rider-label-dot").count()).toBeGreaterThan(5);
  }
});

test("the Rider label section shows Arrow's scheme when it can be read, otherwise the three standard ones", async ({ page }) => {
  await page.goto("/design#labels");
  if ((await page.getByTestId("arrow-scheme").count()) === 0) await expect(page.getByTestId("arrow-missing")).toBeVisible();
  await expect(page.getByTestId("standard-scheme")).toHaveCount(3);
  for (const name of ["Lycra colour per heat", "Bib / sail number", "Name call-out"]) await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
});

test("Normal sizes: pad 48–52 px tall with 6 px gaps, digits 22–24, names 17–18, status words 13–14, body 15–16, slim timer 20–24, other taps >= 44", async ({ page }) => {
  await page.goto("/design");
  const stats = await padStats(page);
  expect(stats.count).toBeGreaterThan(40);
  expect(stats.minH).toBeGreaterThanOrEqual(48);
  expect(stats.maxH).toBeLessThanOrEqual(52);
  expect(stats.minW).toBeGreaterThanOrEqual(48);
  for (const g of stats.gaps) expect(g).toBe(6);
  expect(stats.digit).toBeGreaterThanOrEqual(22);
  expect(stats.digit).toBeLessThanOrEqual(24);
  expect(await tapAudit(page, 44)).toEqual([]);

  const name = await fontPx(frame(page, "judge-live").getByTestId("attempt-card").first().locator("button span.text-name"));
  expect(name).toBeGreaterThanOrEqual(17);
  expect(name).toBeLessThanOrEqual(18);
  const small = await fontPx(frame(page, "judge-live").getByTestId("connection-badge").locator("span").last());
  expect(small).toBeGreaterThanOrEqual(13);
  expect(small).toBeLessThanOrEqual(14);
  const body = await fontPx(page.getByTestId("design-root"));
  expect(body).toBeGreaterThanOrEqual(15);
  expect(body).toBeLessThanOrEqual(16);
  const slim = await fontPx(frame(page, "judge-live").getByTestId("heat-timer-clock"));
  expect(slim).toBeGreaterThanOrEqual(20);
  expect(slim).toBeLessThanOrEqual(24);
  const bodyWeight = await page.getByTestId("design-root").evaluate((el) => getComputedStyle(el).fontWeight);
  expect(Number(bodyWeight)).toBeGreaterThanOrEqual(400);
  expect(Number(bodyWeight)).toBeLessThanOrEqual(500);
});

test("weight 700 appears only on the selected score", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "judge-live");
  await f.getByRole("button", { name: "Set 7", exact: true }).click();
  const heavy = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
      if (!own) continue;
      if (Number(getComputedStyle(el).fontWeight) >= 700 && !el.closest("[data-pad-button][aria-pressed=true], [data-testid=pad-value]")) out.push(`${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
    }
    return out;
  });
  expect(heavy).toEqual([]);
});

test("Large text size: pad >= 56 px with 8 px gaps, digits >= 28, names >= 20, other taps >= 48; the switch is remembered", async ({ page }) => {
  await page.goto("/design");
  await page.getByRole("button", { name: "Large", exact: true }).click();
  await expect(page.getByTestId("design-root")).toHaveAttribute("data-text", "large");
  const stats = await padStats(page);
  expect(stats.minH).toBeGreaterThanOrEqual(56);
  expect(stats.minW).toBeGreaterThanOrEqual(56);
  for (const g of stats.gaps) expect(g).toBe(8);
  expect(stats.digit).toBeGreaterThanOrEqual(28);
  expect(await tapAudit(page, 48)).toEqual([]);
  const name = await fontPx(frame(page, "judge-live").getByTestId("attempt-card").first().locator("button span.text-name"));
  expect(name).toBeGreaterThanOrEqual(20);
  await noSidewaysScroll(page);
  await page.reload();
  await expect(page.getByTestId("design-root")).toHaveAttribute("data-text", "large");
  await page.getByRole("button", { name: "Normal", exact: true }).click();
  await expect(page.getByTestId("design-root")).toHaveAttribute("data-text", "normal");
});

test("nothing scrolls sideways at 390 px, in Daylight, Dark and Large (the score table scrolls inside its own box)", async ({ page }) => {
  await page.goto("/design");
  await noSidewaysScroll(page);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await noSidewaysScroll(page);
  await page.getByRole("button", { name: "Large", exact: true }).click();
  await noSidewaysScroll(page);
  const box = page.getByTestId("matrix-scroll").first();
  expect(await box.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

test("Dark mode works, is remembered on this device, and the sticky bar stays on screen", async ({ page }) => {
  await page.goto("/design");
  const root = page.getByTestId("design-root");
  await expect(root).toHaveAttribute("data-theme", "day");
  await expect(root).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(root).toHaveCSS("background-color", "rgb(11, 14, 15)");
  await expect(root).toHaveCSS("color", "rgb(242, 245, 245)");
  await page.getByTestId("section-sizes").scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Daylight", exact: true })).toBeInViewport();
  await page.reload();
  await expect(page.getByTestId("design-root")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Daylight", exact: true }).click();
  await expect(page.getByTestId("design-root")).toHaveAttribute("data-theme", "day");
});

test("no percentages anywhere on screen; the preview of the division setting shows them", async ({ page }) => {
  await page.goto("/design");
  const visibleText = async () => page.evaluate(() => document.body.innerText);
  expect(await visibleText()).not.toMatch(/\d\s*%/);
  await page.getByTestId("section-result").scrollIntoViewIfNeeded();
  await page.getByLabel("Show scores as % of maximum").check();
  await expect(page.getByTestId("result-percent").first()).toHaveText("78.85 % of maximum");
  await page.getByLabel("Show scores as % of maximum").uncheck();
  await expect(page.getByTestId("result-percent")).toHaveCount(0);
});

test("numbers from docs/08 are on the page: the sum in words and the panel column 7.71 / 8.25 / 7.29 / — / 8.08", async ({ page }) => {
  await page.goto("/design#result");
  await expect(page.getByTestId("result-formula").first()).toHaveText("31.54 = tricks 24.04 + Impression 7.50");
  const panel = page.getByTestId("head-matrix").first().getByTestId("matrix-panel");
  await expect(panel).toHaveText([/7\.71/, /8\.25/, /7\.29/, /—/, /8\.08/]);
});
