import { test, expect } from "./base";
import type { Locator, Page } from "@playwright/test";

// Phase 5a, round 4: the public /design preview at the owner's phone size (390 × 844, an iPhone 14).
// Normal (genuinely compact): pad buttons 36–40 px with 4 px gaps and digits 15–16 px, chips no wider than their text plus 12 px, list rows 36–40, the composed trick name
// 14–15 px in two lines at most, CRASH and Log one row 44 px high, headings 11–13, slim timer 18–22 (48 px only on the head console), other buttons >= 36 px,
// weight 700 only on the selected score, the selected score the only large number. Large (what Normal was): pad 46 px with 6 px gaps, digits >= 19, names >= 17, buttons >= 44.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const frame = (page: Page, id: string) => page.getByTestId(`section-${id}`).getByTestId("phone-frame");

async function noSidewaysScroll(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(scroll, "page is wider than the screen").toBeLessThanOrEqual(inner);
}

async function tapAudit(page: Page, minOther: number) {
  return page.evaluate((min) => {
    const out: string[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    // the sticky bar and its menu are the preview page's own chrome (always Normal sizes); the screens and parts below it follow the text size
    for (const el of Array.from(document.querySelectorAll("button, a[href], summary, input:not([type=hidden]):not([type=checkbox]), select"))) {
      if (!visible(el) || el.hasAttribute("data-pad-button") || el.closest("header")) continue;
      const r = el.getBoundingClientRect();
      if (r.height < min - 0.5 || r.width < min - 0.5) out.push(`${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)} < ${min}`);
    }
    for (const box of Array.from(document.querySelectorAll("label:has(input[type=checkbox])"))) if (box.getBoundingClientRect().height < min - 0.5) out.push("checkbox label too small");
    return out;
  }, minOther);
}

async function padStats(page: Page) {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("[data-pad-button]"));
    const rects = buttons.map((b) => b.getBoundingClientRect());
    const gaps = Array.from(document.querySelectorAll("[data-testid=score-pad]")).map((p) => {
      const [a, b] = Array.from(p.querySelectorAll("[data-pad-button]")).slice(0, 2).map((x) => x.getBoundingClientRect());
      return Math.round(b.left - a.right);
    });
    return { count: buttons.length, minH: Math.min(...rects.map((r) => r.height)), maxH: Math.max(...rects.map((r) => r.height)), minW: Math.min(...rects.map((r) => r.width)), gaps, digit: Math.min(...buttons.map((b) => parseFloat(getComputedStyle(b).fontSize))), digitMax: Math.max(...buttons.map((b) => parseFloat(getComputedStyle(b).fontSize))) };
  });
}

const fontPx = (loc: Locator) => loc.first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

async function score(scope: Locator, whole: number, tenth: string) {
  await scope.getByRole("button", { name: `Set ${whole}`, exact: true }).click();
  await scope.getByRole("button", { name: `Set .${tenth}` }).click();
}

test("the page opens without a login, says it is not live, and has a short menu that jumps to a screen", async ({ page }) => {
  await page.goto("/design");
  await expect(page.getByTestId("not-live")).toHaveText("Design preview — nothing here is live");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByTestId("design-menu").locator("summary").click();
  await page.getByRole("link", { name: "Judge — heat end" }).click();
  await expect(page.getByTestId("section-judge-end")).toBeInViewport();
  await expect(page.getByTestId("design-menu")).not.toHaveAttribute("open", "");
});

test("the screens come first, in order: judge live, Details, spotter, heat end, head judge Score and Control tabs, the laptop console", async ({ page }) => {
  await page.goto("/design");
  const ids = await page.locator("[data-testid^=section-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(ids.slice(0, 7)).toEqual(["section-judge-live", "section-judge-details", "section-spotter-live", "section-judge-end", "section-head-score", "section-head-control", "section-head-laptop"]);
  for (const id of ["judge-live", "judge-details", "spotter-live", "judge-end", "head-score", "head-control"]) await expect(frame(page, id)).toHaveCount(1);
  await expect(page.getByTestId("laptop-frame")).toHaveCount(1);
});

test("on a computer each phone mock is a 390 × 844 frame; on a phone it fills the display", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/design");
  const box = (await frame(page, "judge-live").boundingBox())!;
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([390, 844]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/design");
  const phone = (await frame(page, "judge-live").boundingBox())!;
  expect(phone.height).toBeGreaterThan(844 - 100);
  expect(phone.height).toBeLessThanOrEqual(844);
});

test("Judge — live heat is a queue: header, ONE attempt with its pad, '2 waiting', a thin history; no rider to choose; fits with NO scrolling at 844, 750 and 664 high", async ({ page }) => {
  for (const height of [844, 750, 664]) {
    await page.setViewportSize({ width: 390, height });
    await page.goto("/design");
    const f = frame(page, "judge-live");
    await f.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -56));
    await expect(f.getByTestId("screen-header")).toBeVisible();
    await expect(f.getByTestId("queue-card")).toHaveCount(1);
    await expect(f.getByTestId("waiting-pill")).toHaveText("2 waiting");
    await expect(f.getByTestId("rider-tile")).toHaveCount(0); // no rider selection to score
    await expect(f.getByTestId("history-row")).toHaveCount(3);
    expect(await f.getByTestId("screen-body").evaluate((el) => el.scrollHeight <= el.clientHeight + 1), `scrolls at ${height}`).toBe(true);
    const fb = (await f.boundingBox())!;
    const last = (await f.getByTestId("history-row").last().boundingBox())!;
    expect(last.y + last.height, `history cut off at ${height}`).toBeLessThanOrEqual(fb.y + fb.height + 0.5);
    const timer = (await f.getByTestId("heat-timer").boundingBox())!;
    const card = (await f.getByTestId("queue-card").boundingBox())!;
    expect(timer.y + timer.height).toBeLessThanOrEqual(card.y);
  }
});

test("the card explains Missed and Flag in one line", async ({ page }) => {
  await page.goto("/design");
  const help = frame(page, "judge-live").getByTestId("queue-help");
  await expect(help).toContainText("Missed: I did not see it. No score from me; the panel average uses the others.");
  await expect(help).toContainText("Flag: alert the head judge. I still score.");
});

test("the queue: a score brings the next attempt in, the waiting count drops, the scored card drops into the history; Missed counts; a history row can be corrected", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "judge-live");
  await expect(f.getByTestId("queue-trick")).toHaveText("Left ×2 Backroll");
  await score(f.getByTestId("queue-card"), 7, "5");
  await expect(f.getByTestId("queue-trick")).toHaveText("Right Frontroll");
  await expect(f.getByTestId("repeat-badge")).toContainText("Repeat — 2nd time · you gave 6.5 before");
  await expect(f.getByTestId("waiting-pill")).toHaveText("1 waiting");
  await expect(f.getByTestId("pad-caption")).toHaveText("Saved 7.5 — RED — attempt 6");
  await expect(f.getByTestId("history-row").first()).toContainText("7.5");
  await f.getByTestId("missed-button").click();
  await expect(f.getByTestId("queue-trick")).toHaveText("Left Kiteloop");
  await expect(f.getByTestId("waiting-pill")).toHaveCount(0);
  await score(f.getByTestId("queue-card"), 8, "0");
  await expect(f.getByTestId("all-scored")).toBeVisible();
  await f.getByTestId("history-row").nth(2).click();
  await expect(f.getByText("Correcting attempt")).toBeVisible();
  await score(f.getByTestId("queue-card"), 9, "0");
  await expect(f.getByTestId("all-scored")).toBeVisible();
});

test("pad: tap or type. A whole number alone is a valid score (Save completes it); a decimal tap completes it; typing then Save completes it; off-step and out-of-range typing is refused", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "judge-live");
  const card = f.getByTestId("queue-card");
  // whole number + Save
  await expect(card.getByTestId("pad-save")).toBeDisabled();
  await card.getByRole("button", { name: "Set 7", exact: true }).click();
  await expect(card.getByTestId("pad-value")).toHaveText("7.");
  await expect(card.getByTestId("queue-trick")).toHaveText("Left ×2 Backroll");
  await card.getByTestId("pad-save").click();
  await expect(f.getByTestId("pad-caption")).toHaveText("Saved 7.0 — RED — attempt 6");
  await expect(f.getByTestId("queue-trick")).toHaveText("Right Frontroll");
  // typing, with the numeric keyboard
  const input = f.getByTestId("pad-input");
  await expect(input).toHaveAttribute("inputmode", "decimal");
  await input.fill("8.55");
  await expect(f.getByTestId("pad-save")).toBeDisabled(); // off the 0.1 step
  await input.fill("11");
  await expect(f.getByTestId("pad-save")).toBeDisabled(); // out of range
  await input.fill("8,5");
  await expect(f.getByTestId("pad-save")).toBeEnabled();
  await f.getByTestId("pad-save").click();
  await expect(f.getByTestId("pad-caption")).toHaveText("Saved 8.5 — BLUE — attempt 4");
  // the decimal tap completes it as before
  await score(f.getByTestId("queue-card"), 6, "2");
  await expect(f.getByTestId("all-scored")).toBeVisible();
});

test("Details: every rider card is tappable, including a rider who has used all attempts; picking a rider shows all of their attempts, my scores, counted tricks, left and right and the counter", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "judge-live");
  await f.getByTestId("details-toggle").click();
  const d = f.getByTestId("details-view");
  await expect(d.getByTestId("rider-tile")).toHaveCount(4);
  await expect(d.getByTestId("rider-tile-counter").first()).toHaveText("6 / 7");
  await expect(f.getByTestId("queue-card")).toHaveCount(0);
  const detail = d.getByTestId("rider-detail");
  await expect(detail).toContainText("Attempts 6 / 7 · Left 3 · Right 1");
  expect(await detail.locator('li[data-counted="true"]').count()).toBe(3);
  const out = d.getByTestId("rider-tile").nth(2);
  await expect(out).toContainText("Out");
  await expect(out).toBeEnabled();
  await out.click();
  await expect(d.getByTestId("rider-detail")).toContainText("Lena Vogt");
  await expect(d.getByTestId("rider-detail")).toContainText("Attempts 7 / 7");
  await f.getByTestId("details-toggle").click();
  await expect(f.getByTestId("queue-card")).toBeVisible();
  await expect(frame(page, "judge-details").getByTestId("details-view")).toBeVisible();
});

test("every rider strip shows the name next to the colour word (spotter, Details, heat end)", async ({ page }) => {
  await page.goto("/design");
  for (const id of ["spotter-live", "judge-end"]) {
    const tiles = frame(page, id).getByTestId("rider-tile");
    const n = await tiles.count();
    expect(n).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < n; i++) {
      await expect(tiles.nth(i).getByTestId("rider-tile-word")).not.toBeEmpty();
      await expect(tiles.nth(i).getByTestId("rider-tile-name")).not.toBeEmpty();
    }
  }
  await expect(frame(page, "judge-details").getByTestId("rider-tile-name").first()).toHaveText("Sam Rivera");
});

test("spotter: riders in one row, a row for Left / Right, a row for the multipliers, base tricks as a list, add-ons and grabs in two columns, CRASH and Log fixed at the bottom; the common tricks are loggable without scrolling", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "spotter-live");
  await f.scrollIntoViewIfNeeded();
  const tiles = f.getByTestId("rider-tile");
  await expect(tiles).toHaveCount(4);
  expect(new Set(await tiles.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))).size).toBe(1);
  await expect(f.getByTestId("rider-tile-counter").first()).toHaveText("6 / 7");
  const top = async (id: string) => Math.round((await f.locator(`[data-block="${id}"]`).boundingBox())!.y);
  expect(await top("direction:left")).toBe(await top("direction:right"));
  expect(new Set([await top("multiplier:x1"), await top("multiplier:x2"), await top("multiplier:x3"), await top("multiplier:x4")]).size).toBe(1);
  expect(await top("multiplier:x1")).toBeGreaterThan(await top("direction:left"));
  const base = await f.locator('[data-block^="base:"]').evaluateAll((els) => els.slice(0, 6).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
  expect(new Set(base.map((b) => b[0])).size).toBe(1);
  expect(base.every((b, i) => i === 0 || b[1] > base[i - 1][1])).toBe(true);
  for (const fam of ["addon", "grab_landing"]) expect(new Set(await f.locator(`[data-block^="${fam}:"]`).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))).size).toBe(2);
  // CRASH and Log: one row, 44 px high, fixed at the bottom of the frame
  const fb = (await f.boundingBox())!;
  const crash = (await f.getByTestId("crash-button").boundingBox())!;
  const log = (await f.getByTestId("log-button").boundingBox())!;
  expect(Math.round(crash.y)).toBe(Math.round(log.y));
  expect(Math.round(crash.height)).toBe(44);
  expect(Math.round(log.height)).toBe(44);
  expect(crash.y + crash.height).toBeLessThanOrEqual(fb.y + fb.height);
  expect(crash.y + crash.height).toBeGreaterThan(fb.y + fb.height - 14);
  // the common tricks are on screen without scrolling the frame: direction, multiplier, six base tricks, add-ons, Log
  const list = (await f.getByTestId("base-list").boundingBox())!;
  for (const key of ["straight_jump", "backroll", "frontroll", "kiteloop", "megaloop", "double_loop"]) {
    const b = (await f.locator(`[data-block="base:${key}"]`).boundingBox())!;
    expect(b.y + b.height, key).toBeLessThanOrEqual(list.y + list.height + 1);
  }
  for (const id of ["direction:left", "multiplier:x2", "addon:board_off", "addon:handle_pass"]) {
    const b = (await f.locator(`[data-block="${id}"]`).boundingBox())!;
    expect(b.y + b.height, id).toBeLessThanOrEqual(crash.y);
  }
  for (const id of ["direction:left", "multiplier:x2", "base:backroll", "addon:handle_pass", "addon:board_off"]) await f.locator(`[data-block="${id}"]`).click();
  const name = f.getByTestId("composed-name");
  await expect(name).toContainText("Left ×2 Backroll Board-off Handle pass");
  const nameP = name.locator("p").first();
  expect(await fontPx(nameP)).toBeGreaterThanOrEqual(14);
  expect(await fontPx(nameP)).toBeLessThanOrEqual(15);
  expect(await nameP.evaluate((el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))).toBeLessThanOrEqual(2.05);
  await f.getByTestId("log-button").click();
  await expect(name).toContainText("Logged — RED — attempt 7");
  await expect(f.getByTestId("rider-tile-counter").first()).toHaveText(/^7 \/ 7/);
  await f.getByTestId("crash-button").click();
  await expect(f.getByRole("alertdialog")).toBeVisible();
  await f.getByRole("button", { name: "Cancel" }).click();
});

test("heat end: fits with no scrolling, compact summary above the pad, the button says Submit, asks once, then locks", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "judge-end");
  const card = f.getByTestId("impression-card");
  expect(await f.getByTestId("screen-body").evaluate((el) => el.scrollHeight <= el.clientHeight + 1), "heat end scrolls").toBe(true);
  await expect(card.getByTestId("impression-progress")).toHaveText("1 / 3 riders");
  await expect(card.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/Submit sheet/i);
  const summary = card.getByTestId("heat-summary");
  await expect(summary.getByTestId("summary-counts")).toHaveText("5 attempts · 4 landed · 1 crashed");
  await expect(summary).toContainText("Left 3 · Right 1");
  await expect(summary).toContainText("Repeats ×0");
  await expect(summary).not.toContainText(/famil|rotation/i);
  const sBox = (await summary.boundingBox())!;
  const pBox = (await card.getByTestId("score-pad").boundingBox())!;
  expect(sBox.y + sBox.height).toBeLessThanOrEqual(pBox.y);
  for (const i of [1, 2]) {
    await card.getByTestId("rider-tile").nth(i).click();
    await score(card, 7, "0");
  }
  await expect(card.getByTestId("impression-progress")).toHaveText("3 / 3 riders");
  await card.getByRole("button", { name: "Submit", exact: true }).click();
  await card.getByRole("button", { name: "Yes, submit" }).click();
  await expect(card.getByTestId("submitted-note")).toBeVisible();
});

test("head judge who also scores: two tabs; Score is exactly a judge's queue; Control has the buttons, totals and blockers behind Details, and no timer reset", async ({ page }) => {
  await page.goto("/design");
  const s = frame(page, "head-score");
  await expect(s.getByRole("tab", { name: "Score" })).toHaveAttribute("aria-selected", "true");
  await expect(s.getByTestId("queue-card")).toHaveCount(1);
  await expect(s.getByTestId("waiting-pill")).toHaveText("2 waiting");
  await s.getByRole("tab", { name: "Control" }).click();
  await expect(s.getByTestId("head-control")).toBeVisible();
  await s.getByRole("tab", { name: "Score" }).click();
  await expect(s.getByTestId("queue-card")).toHaveCount(1);

  const c = frame(page, "head-control");
  await expect(c.getByRole("tab", { name: "Control" })).toHaveAttribute("aria-selected", "true");
  const ctl = c.getByTestId("head-control");
  expect(await fontPx(ctl.getByTestId("heat-timer-clock"))).toBe(48);
  await expect(ctl.locator('[data-control="start"]')).toBeDisabled();
  for (const id of ["pause", "end", "hold", "resumeAt", "shift5", "shift10", "cancel", "rerun"]) await expect(ctl.locator(`[data-control="${id}"]`)).toBeEnabled();
  await expect(ctl.getByRole("button", { name: /reset/i })).toHaveCount(0);
  await expect(ctl).toContainText("There is no timer reset");
  await ctl.locator('[data-control="cancel"]').click();
  await expect(c.getByRole("alertdialog")).toBeVisible();
  await expect(c.getByRole("button", { name: "Save" })).toBeDisabled();
  await c.getByLabel("Reason (required)").fill("kite tangle");
  await c.getByRole("button", { name: "Save" }).click();
  await expect(ctl.locator('[data-control="start"]')).toBeEnabled();
  await ctl.locator('[data-control="start"]').click();
  await expect(ctl.locator('[data-control="pause"]')).toBeEnabled();
  await c.getByTestId("details-toggle").click();
  await expect(c.getByTestId("head-details")).toContainText("31.54");
  await expect(c.getByTestId("blockers")).toContainText("Judge 2 has no Impression score for BLUE");
});

test("laptop console: judge cells are coloured by their distance from the panel score (tolerance 1.5 from the model), high and low alike, with the distance written", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/design");
  const k = page.getByTestId("head-console");
  await expect(k).toContainText("green within 1.5");
  const band = (row: string, j: number) => k.locator(`[data-row-id="${row}"]`).getByTestId("matrix-cell").nth(j).getAttribute("data-band");
  // docs/08 §1A attempt 1 (7.625, 7.75, 7.75 around 7.71): all green
  for (const j of [0, 1, 2]) expect(await band("red-1", j)).toBe("0");
  // Blue attempt 1: 3.5, 8.5, 9.0 around 7.0 → red, green (1.5 = tolerance), yellow (2.0 is within 1.5× tolerance); Blue attempt 2: 4.8 and 8.2 around 6.5 → yellow, yellow
  expect([await band("blue-1", 0), await band("blue-1", 1), await band("blue-1", 2)]).toEqual(["3", "0", "1"]);
  expect([await band("blue-2", 0), await band("blue-2", 1)]).toEqual(["1", "1"]);
  await expect(k.locator('[data-row-id="blue-1"]').getByTestId("cell-delta").first()).toHaveText("−3.5");
  await expect(k.locator('[data-row-id="blue-2"]').getByTestId("cell-delta").nth(1)).toHaveText("+1.7");
  // low and high alike: attempt 2's two cells are the same distance, the same colour
  const bg = await k.locator('[data-row-id="blue-2"]').getByTestId("matrix-cell").evaluateAll((els) => els.slice(0, 2).map((e) => getComputedStyle(e).backgroundColor));
  expect(bg[0]).toBe(bg[1]);
});

test("laptop console: tick boxes select several attempts; Merge needs a possible duplicate, Delete works on any selection; the single-attempt menus stay", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/design");
  const k = page.getByTestId("head-console");
  await expect(k.getByTestId("selection-bar")).toHaveCount(0);
  await k.locator('[data-row-id="red-3"]').getByTestId("row-select").check();
  await k.locator('[data-row-id="red-4"]').getByTestId("row-select").check();
  await expect(k.getByTestId("selection-bar")).toContainText("2 selected");
  await expect(k.getByTestId("merge-selected")).toBeDisabled(); // different tricks
  await expect(k.getByTestId("delete-selected")).toBeEnabled();
  await k.locator('[data-row-id="red-3"]').getByTestId("row-select").uncheck();
  await k.locator('[data-row-id="red-4"]').getByTestId("row-select").uncheck();
  await k.locator('[data-row-id="red-2"]').getByTestId("row-select").check();
  await k.locator('[data-row-id="red-6"]').getByTestId("row-select").check();
  await expect(k.getByTestId("merge-selected")).toBeEnabled();
  await k.getByTestId("merge-selected").click();
  await expect(k.getByTestId("console-dialog")).toContainText("The first logged attempt is kept");
  await expect(k.getByTestId("dialog-save")).toBeDisabled();
  await k.getByTestId("reason-input").fill("two spotters");
  await k.getByTestId("dialog-save").click();
  await expect(k.locator('[data-row-id="red-6"]')).toHaveAttribute("data-row-state", "deleted");
  await expect(k.locator('[data-row-id="red-2"]')).toHaveAttribute("data-row-state", "ok");
  await expect(k.getByTestId("selection-bar")).toHaveCount(0);
  // delete a selection
  await k.locator('[data-row-id="red-3"]').getByTestId("row-select").check();
  await k.locator('[data-row-id="blue-1"]').getByTestId("row-select").check();
  await k.getByTestId("delete-selected").click();
  await expect(k.getByTestId("console-dialog")).toContainText("Delete 2 attempts?");
  await k.getByTestId("reason-input").fill("test");
  await k.getByTestId("dialog-save").click();
  await expect(k.locator('[data-row-id="red-3"]')).toHaveAttribute("data-row-state", "deleted");
  await expect(k.locator('[data-row-id="blue-1"]')).toHaveAttribute("data-row-state", "deleted");
  // the single-attempt menu is still there
  await k.locator('[data-row-id="red-5"]').getByTestId("attempt-menu-button").click();
  for (const name of ["Delete", "Merge duplicate", "Edit attempt", "Add attempt"]) await expect(k.getByTestId("attempt-menu").getByRole("menuitem", { name })).toBeVisible();
});

test("laptop console is a working tool: edit a score with a reason, rider menu, who owes an Impression score, Publish with its blocker list, Re-open, Re-run heat", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/design");
  const k = page.getByTestId("head-console");
  await k.scrollIntoViewIfNeeded();
  const menu = k.getByTestId("attempt-menu");
  for (const name of ["Delete", "Merge duplicate", "Edit attempt", "Add attempt"]) await expect(menu.getByRole("menuitem", { name })).toBeVisible();
  await expect(k.getByTestId("owes")).toContainText("Owes Impression score: Judge 2 (BLUE)");
  await expect(k.getByTestId("publish")).toBeDisabled();
  await expect(k.getByTestId("blockers")).toContainText("Judge 3 has no score for BLUE, attempt 2");
  await k.getByLabel("Judge 3, Attempt 3: 7.25").click();
  const dlg = k.getByTestId("console-dialog");
  await expect(dlg).toContainText("Edit score");
  await expect(dlg.getByTestId("dialog-save")).toBeDisabled();
  await score(dlg, 8, "0");
  await expect(dlg.getByTestId("dialog-save")).toBeDisabled(); // a reason is required
  await dlg.getByTestId("reason-input").fill("paper sheet");
  await dlg.getByTestId("dialog-save").click();
  await expect(k.getByTestId("audit")).toContainText("7.25 → 8.00 — paper sheet");
  await expect(k.locator('[data-row-id="red-3"]').getByTestId("matrix-panel")).toContainText("7.54");
  await k.getByLabel("RED: Rider menu").first().click();
  const rm = k.getByTestId("rider-menu");
  for (const name of ["DNS (did not start)", "DNF (did not finish)", "DSQ (disqualified)", "Interference"]) await expect(rm.getByRole("menuitem", { name })).toBeVisible();
  await rm.getByRole("menuitem", { name: "Interference" }).click();
  await k.getByTestId("reason-input").fill("kite collision");
  await k.getByTestId("dialog-save").click();
  await expect(k.locator("[data-testid=console-total][data-rider=red]")).toContainText("INT");
  await k.getByLabel("Judge 3, Attempt 2: —").click();
  await score(k.getByTestId("console-dialog"), 6, "5");
  await k.getByTestId("reason-input").fill("late paper sheet");
  await k.getByTestId("dialog-save").click();
  await k.getByTestId("enter-impression").click();
  await score(k.getByTestId("console-dialog"), 6, "5");
  await k.getByTestId("reason-input").fill("paper sheet");
  await k.getByTestId("dialog-save").click();
  await expect(k.getByTestId("publish")).toBeEnabled();
  await expect(k.getByTestId("owes")).toContainText("Every Impression score is in");
  await k.getByTestId("publish").click();
  await expect(k).toHaveAttribute("data-heat", "published");
  await expect(k.getByTestId("rerun")).toBeDisabled();
  await k.getByTestId("reopen").click();
  await expect(k).toHaveAttribute("data-heat", "ended");
  await k.getByTestId("rerun").click();
  await expect(k.getByTestId("console-dialog")).toContainText("Re-run this heat?");
  await expect(k.getByTestId("dialog-save")).toBeDisabled();
});

test("laptop console: Publish with a reason when something blocks it; Edit and Add attempt; Delete asks once", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/design");
  const k = page.getByTestId("head-console");
  await k.getByTestId("publish-anyway").click();
  await expect(k.getByTestId("console-dialog")).toContainText("Judge 2 has no Impression score for BLUE");
  await k.getByTestId("reason-input").fill("judge 2 left");
  await k.getByTestId("dialog-save").click();
  await expect(k).toHaveAttribute("data-heat", "published");
  await k.getByTestId("reopen").click();
  await k.getByRole("menuitem", { name: "Edit attempt" }).click();
  await expect(k.getByTestId("console-dialog")).toContainText("Edit attempt");
  await k.getByTestId("reason-input").fill("wrong trick");
  await k.getByTestId("edit-trick").fill("Right Megaloop");
  await k.getByTestId("dialog-save").click();
  await expect(k.locator('[data-row-id="red-6"]')).toContainText("Right Megaloop");
  await k.locator('[data-row-id="red-6"]').getByTestId("attempt-menu-button").click();
  await k.getByRole("menuitem", { name: "Add attempt" }).click();
  await k.getByTestId("edit-trick").fill("Left Backroll");
  await k.getByTestId("reason-input").fill("spotter missed it");
  await k.getByTestId("dialog-save").click();
  expect(await k.getByTestId("matrix-row").count()).toBe(9);
  await k.locator('[data-row-id="red-6"]').getByTestId("attempt-menu-button").click();
  await k.getByRole("menuitem", { name: "Delete" }).click();
  await expect(k.getByTestId("console-dialog")).toContainText("Delete this attempt?");
});

test("public results: tabs per heat, one compact row per rider in rank order, score boxes in attempt order, graded yellow to green across the heat, crash red, not counted grey, each with an icon or word", async ({ page }) => {
  await page.goto("/design#result");
  const pr = page.getByTestId("public-results");
  await expect(pr.locator("[data-heat-tab]")).toHaveCount(4);
  await expect(pr.getByTestId("public-caption")).toContainText("21 tricks logged so far in this heat · 7 attempts per rider");
  const riders = pr.getByTestId("public-rider");
  await expect(riders).toHaveCount(3);
  expect(await riders.evaluateAll((els) => els.map((e) => e.getAttribute("data-place")))).toEqual(["1", "2", "3"]);
  await expect(riders.first().getByTestId("public-total")).toHaveText("18.20");
  await expect(riders.first().getByTestId("public-formula")).toHaveText("18.20 = tricks 13.50 + Impression 4.70");
  await expect(riders.first()).toContainText("Lena Vogt"); // the name is always there
  const boxes = riders.first().getByTestId("score-box");
  await expect(boxes).toHaveCount(7);
  await expect(boxes.nth(0)).toHaveText("1 · 5.30"); // Arrow's default: attempt number + score
  expect(await boxes.evaluateAll((els) => els.map((e) => e.getAttribute("data-tone")))).toEqual(["counted", "counted", "counted", "notCounted", "notCounted", "crash", "crash"]);
  await expect(boxes.nth(5)).toHaveText("6 · CRASH");
  // graded across the HEAT: Lena's 5.3 is the heat's highest counted score (greenest, 4); Mia's 2.0 the lowest (yellowest, 0)
  const grade = async (rider: number, box: number) => riders.nth(rider).getByTestId("score-box").nth(box).getAttribute("data-grade");
  expect(await grade(0, 0)).toBe("4");
  expect(await grade(2, 2)).toBe("0");
  const bg = async (rider: number, box: number) => riders.nth(rider).getByTestId("score-box").nth(box).evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(new Set([await bg(0, 0), await bg(2, 2), await bg(0, 3), await bg(0, 5)]).size).toBe(4); // greenest, yellowest, grey, red
  // the division setting for what a box shows
  await pr.locator('[data-mode="trick_score"]').click();
  await expect(boxes.nth(0)).toHaveText("Double loop · 5.30");
  await pr.locator('[data-mode="scores_only"]').click();
  await expect(boxes.nth(0)).toHaveText("5.30");
  await expect(boxes.nth(5)).toHaveText("CRASH");
  await pr.locator('[data-mode="number_score"]').click();
  // another heat (docs/08 §1A is Heat 3)
  await pr.locator('[data-heat-tab="h3"]').click();
  await expect(pr.getByTestId("public-rider").first().getByTestId("public-total")).toHaveText("31.54");
  await expect(pr.getByTestId("public-rider").first().getByTestId("public-formula")).toHaveText("31.54 = tricks 24.04 + Impression 7.50");
  expect(await pr.getByTestId("public-rider").first().getByTestId("score-box").evaluateAll((els) => els.map((e) => e.getAttribute("data-tone")))).toEqual(["counted", "counted", "notCounted", "crash", "counted"]);
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/\d\s*%/);
});

test("public results: the ladder shows each heat with its riders in their Lycra colour and their totals", async ({ page }) => {
  await page.goto("/design#result");
  const pr = page.getByTestId("public-results");
  await pr.getByTestId("view-ladder").click();
  await expect(pr.getByTestId("ladder")).toBeVisible();
  await expect(pr.getByRole("heading", { name: "Round 1" })).toBeVisible();
  await expect(pr.getByRole("heading", { name: "Finals" })).toBeVisible();
  await expect(pr.getByTestId("ladder-heat")).toHaveCount(4);
  await expect(pr.getByTestId("ladder-heat").first()).toContainText("complete");
  const rows = pr.getByTestId("ladder-heat").first().getByTestId("ladder-rider");
  await expect(rows.first()).toContainText("Noor Haddad");
  await expect(rows.first()).toContainText("26.00");
  const colours = await rows.evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  expect(new Set(colours).size).toBe(3); // pink, blue, yellow
  expect(await pr.locator('[data-placeholder="true"]').count()).toBeGreaterThanOrEqual(2);
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
  }
});

test("criteria: one tab per criterion and one pad; the trick score appears once all four are set (docs/08 §1A attempt 1 gives 7.625)", async ({ page }) => {
  await page.goto("/design#criteria");
  const rows = page.getByTestId("criteria-rows");
  const entry = async (key: string, whole: number, tenth: string) => {
    await rows.locator(`[data-criterion="${key}"]`).click();
    await score(rows, whole, tenth);
  };
  await entry("height", 8, "0");
  await entry("extremity", 7, "5");
  await entry("technicality", 7, "0");
  await expect(rows.getByTestId("computed-trick-score")).not.toContainText("7.625");
  await entry("execution", 8, "0");
  await expect(rows.getByTestId("computed-trick-score")).toContainText("7.625");
  expect(await rows.getByTestId("score-pad").count()).toBe(1);
});

test("Normal sizes: pad 36–40 px with 4 px gaps and 15–16 px digits, chips no wider than their text plus 12 px, rows 36–40, the selected score the only large number", async ({ page }) => {
  await page.goto("/design");
  const stats = await padStats(page);
  expect(stats.count).toBeGreaterThan(40);
  expect(stats.minH).toBeGreaterThanOrEqual(36);
  expect(stats.maxH).toBeLessThanOrEqual(40);
  expect(stats.minW).toBeGreaterThanOrEqual(36);
  for (const g of stats.gaps) expect(g).toBe(4);
  expect(stats.digit).toBeGreaterThanOrEqual(15);
  expect(stats.digitMax).toBeLessThanOrEqual(16);
  expect(await tapAudit(page, 36)).toEqual([]);
  // chips: no wider than their text plus 12 px of padding (and 2 px of border), but at least a 36 px tap target
  const wide = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll("[data-chip]"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || el.closest("header")) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const content = range.getBoundingClientRect().width;
      if (r.width > Math.max(content + 14, 36) + 1) out.push(`"${(el.textContent ?? "").trim()}" ${Math.round(r.width)} > ${Math.round(content + 12)}`);
    }
    return out;
  });
  expect(wide).toEqual([]);
  expect(await page.locator("[data-chip]").count()).toBeGreaterThan(30);
  // list rows are 36–40 px
  const rowH = await page.evaluate(() => Array.from(document.querySelectorAll("[data-row], [data-testid=history-row]")).filter((e) => e.getBoundingClientRect().height > 0).map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(Math.min(...rowH)).toBeGreaterThanOrEqual(36);
  const j = frame(page, "judge-live");
  const name = await fontPx(j.getByTestId("rider-label").locator("span.text-name").first());
  expect(name).toBeGreaterThanOrEqual(14);
  expect(name).toBeLessThanOrEqual(16);
  const small = await fontPx(j.getByTestId("connection-badge").locator("span").last());
  expect(small).toBeGreaterThanOrEqual(11);
  expect(small).toBeLessThanOrEqual(13);
  const body = await fontPx(page.getByTestId("design-root"));
  expect(body).toBeGreaterThanOrEqual(13);
  expect(body).toBeLessThanOrEqual(15);
  const heading = await fontPx(page.getByTestId("section-judge-live").locator("h2"));
  expect(heading).toBeGreaterThanOrEqual(11);
  expect(heading).toBeLessThanOrEqual(13);
  const slim = await fontPx(j.getByTestId("heat-timer-clock"));
  expect(slim).toBeGreaterThanOrEqual(18);
  expect(slim).toBeLessThanOrEqual(22);
  const readout = await fontPx(j.getByTestId("pad-value"));
  expect(readout).toBeGreaterThanOrEqual(24);
  expect(readout).toBeLessThanOrEqual(28);
  for (const id of ["judge-live", "judge-details", "spotter-live", "judge-end"]) {
    const big = await frame(page, id).evaluate((root) => Array.from(root.querySelectorAll("*")).filter((el) => parseFloat(getComputedStyle(el).fontSize) > 17 && !el.closest("[data-testid=pad-value], [data-testid=heat-timer]") && Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim())).map((el) => `${el.tagName} ${(el.textContent ?? "").slice(0, 20)}`));
    expect(big, id).toEqual([]);
  }
  expect(Number(await page.getByTestId("design-root").evaluate((el) => getComputedStyle(el).fontWeight))).toBeLessThanOrEqual(500);
});

test("weight 700 appears only on the selected score", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "judge-live");
  await f.getByRole("button", { name: "Set 7", exact: true }).click();
  const heavy = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim())) continue;
      if (Number(getComputedStyle(el).fontWeight) >= 700 && !el.closest("[data-pad-button][aria-pressed=true], [data-testid=pad-value]")) out.push(`${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
    }
    return out;
  });
  expect(heavy).toEqual([]);
});

test("Large text size (what Normal was): pad 46 px with 6 px gaps, digits >= 19, names >= 17, other taps >= 44; the switch is remembered", async ({ page }) => {
  await page.goto("/design");
  await page.getByRole("button", { name: "Large", exact: true }).click();
  await expect(page.getByTestId("design-root")).toHaveAttribute("data-text", "large");
  const stats = await padStats(page);
  expect(stats.minH).toBeGreaterThanOrEqual(46);
  expect(stats.minW).toBeGreaterThanOrEqual(46);
  for (const g of stats.gaps) expect(g).toBe(6);
  expect(stats.digit).toBeGreaterThanOrEqual(19);
  expect(await tapAudit(page, 44)).toEqual([]);
  expect(await fontPx(frame(page, "judge-live").getByTestId("rider-label").locator("span.text-name").first())).toBeGreaterThanOrEqual(17);
  await noSidewaysScroll(page);
  await page.reload();
  await expect(page.getByTestId("design-root")).toHaveAttribute("data-text", "large");
  await page.getByRole("button", { name: "Normal", exact: true }).click();
  await expect(page.getByTestId("design-root")).toHaveAttribute("data-text", "normal");
});

test("nothing scrolls sideways at 390 px, in Daylight, Dark and Large (the laptop console scrolls inside its own box)", async ({ page }) => {
  await page.goto("/design");
  await noSidewaysScroll(page);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await noSidewaysScroll(page);
  await page.getByRole("button", { name: "Large", exact: true }).click();
  await noSidewaysScroll(page);
  expect(await page.getByTestId("laptop-frame").evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
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

test("no percentages anywhere on screen", async ({ page }) => {
  await page.goto("/design");
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/\d\s*%/);
});

test("numbers from docs/08 are on the page: Red's panel column 7.71 / 8.25 / 7.29 / — / 8.08 and the total 31.54", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/design");
  const k = page.getByTestId("head-console");
  const panel = k.locator('[data-testid=matrix-row][data-row-id^="red-"]').getByTestId("matrix-panel");
  await expect(panel.nth(0)).toContainText("7.71");
  await expect(panel.nth(1)).toContainText("8.25");
  await expect(panel.nth(2)).toContainText("7.29");
  await expect(panel.nth(3)).toContainText("—");
  await expect(panel.nth(4)).toContainText("8.08");
  await expect(k.locator("[data-testid=console-total][data-rider=red]")).toContainText("31.54");
});
