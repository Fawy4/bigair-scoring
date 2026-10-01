import { test, expect } from "./base";
import type { Locator, Page } from "@playwright/test";

// Phase 5a, round 3: the public /design preview at the owner's phone size (390 × 844, an iPhone 14).
// Normal text size: pad buttons 44–48 px tall with 6 px gaps and digits 18–20 px, rider names 16–18, status words 13–14, body 15–16, section headings 13–14,
// slim timer 20–24 px (48 px only on the head console), other buttons >= 44 px, weight 700 only on the selected score, and the selected score is the only large number.
// Large text size: pad buttons >= 56 px with 8 px gaps, digits >= 28 px, names >= 20 px, other buttons >= 48 px.
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

test("Judge — live heat is a queue: header, ONE attempt with its pad, '2 waiting', a thin history; no rider to choose; fits at 844, 750 and 664 high", async ({ page }) => {
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
    const fb = (await f.boundingBox())!;
    const card = (await f.getByTestId("queue-card").boundingBox())!;
    expect(card.y + card.height, `card cut off at ${height}`).toBeLessThanOrEqual(fb.y + fb.height);
    const pads = f.locator("[data-pad-button]");
    for (let i = 0; i < (await pads.count()); i++) {
      const b = (await pads.nth(i).boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(fb.y + fb.height + 0.5);
    }
    const firstRow = (await f.getByTestId("history-row").first().boundingBox())!;
    expect(firstRow.y, `history cannot be seen at ${height}`).toBeLessThan(fb.y + fb.height - 12);
    // the small timer sits in the header, above the card
    const timer = (await f.getByTestId("heat-timer").boundingBox())!;
    expect(timer.y + timer.height).toBeLessThanOrEqual(card.y);
    if (height === 844) expect(await f.getByTestId("screen-body").evaluate((el) => el.scrollHeight <= el.clientHeight + 1), "scrolls at 844").toBe(true);
  }
});

test("the queue: a score brings the next attempt in, the waiting count drops, the scored card drops into the history; Missed counts; a history row can be corrected", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "judge-live");
  await expect(f.getByTestId("queue-trick")).toHaveText("Left ×2 Backroll");
  await f.getByRole("button", { name: "Set 7", exact: true }).click();
  await expect(f.getByTestId("pad-value")).toHaveText("7."); // a whole number alone is not a score yet
  await expect(f.getByTestId("queue-card")).toHaveAttribute("data-attempt", "6");
  await f.getByRole("button", { name: "Set .5" }).click();
  // the next attempt is in front, Blue's, with the repeat badge; 1 waiting
  await expect(f.getByTestId("queue-trick")).toHaveText("Right Frontroll");
  await expect(f.getByTestId("repeat-badge")).toContainText("Repeat — 2nd time · you gave 6.5 before");
  await expect(f.getByTestId("waiting-pill")).toHaveText("1 waiting");
  await expect(f.getByTestId("pad-caption")).toHaveText("Saved 7.5 — RED — attempt 6");
  await expect(f.getByTestId("history-row").first()).toContainText("7.5");
  // Missed is an answer too
  await f.getByRole("button", { name: "Missed" }).click();
  await expect(f.getByTestId("queue-trick")).toHaveText("Left Kiteloop");
  await expect(f.getByTestId("waiting-pill")).toHaveCount(0);
  await score(f.getByTestId("queue-card"), 8, "0");
  await expect(f.getByTestId("all-scored")).toBeVisible();
  // correcting
  await f.getByTestId("history-row").nth(2).click();
  await expect(f.getByTestId("queue-card")).toBeVisible();
  await expect(f.getByText("Correcting attempt")).toBeVisible();
  await score(f.getByTestId("queue-card"), 9, "0");
  await expect(f.getByTestId("all-scored")).toBeVisible();
});

test("Details: the rider cards, and picking a rider shows all of their attempts, my scores, which tricks count, left and right and the counter", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "judge-live");
  await f.getByTestId("details-toggle").click();
  const d = f.getByTestId("details-view");
  await expect(d.getByTestId("rider-tile")).toHaveCount(4);
  await expect(d.getByTestId("rider-tile-counter").first()).toHaveText("6 / 7");
  await expect(d.getByTestId("rider-tile").nth(2)).toContainText("Out");
  await expect(f.getByTestId("queue-card")).toHaveCount(0);
  const detail = d.getByTestId("rider-detail");
  await expect(detail).toContainText("Attempts 6 / 7 · Left 3 · Right 1");
  expect(await detail.locator('li[data-counted="true"]').count()).toBe(3);
  await expect(detail.getByText("Crashed", { exact: true })).toBeVisible();
  await d.getByTestId("rider-tile").nth(1).click();
  await expect(d.getByTestId("rider-detail")).toContainText("Noor Haddad");
  await f.getByTestId("details-toggle").click();
  await expect(f.getByTestId("queue-card")).toBeVisible();
  // the second mock starts with Details on
  await expect(frame(page, "judge-details").getByTestId("details-view")).toBeVisible();
});

test("spotter: riders in one row, direction, vertical lists per family (add-ons and grabs in two columns), CRASH and Log fixed at the bottom, the common tricks without scrolling", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "spotter-live");
  await f.scrollIntoViewIfNeeded();
  const tiles = f.getByTestId("rider-tile");
  await expect(tiles).toHaveCount(4);
  const ys = await tiles.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(ys).size).toBe(1); // one row
  await expect(f.getByTestId("rider-tile-counter").first()).toHaveText("6 / 7");
  // base tricks: one vertical list
  const base = await f.locator('[data-block^="base:"]').evaluateAll((els) => els.slice(0, 6).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
  expect(new Set(base.map((b) => b[0])).size).toBe(1);
  expect(base.every((b, i) => i === 0 || b[1] > base[i - 1][1])).toBe(true);
  // add-ons and grabs: two columns
  for (const fam of ["addon", "grab_landing"]) {
    const xs = await f.locator(`[data-block^="${fam}:"]`).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(xs).size).toBe(2);
  }
  // the bar is fixed at the bottom of the frame and the first six base tricks are inside the visible list
  const fb = (await f.boundingBox())!;
  const bar = (await f.getByTestId("builder-bar").boundingBox())!;
  expect(Math.round(bar.y + bar.height)).toBeLessThanOrEqual(Math.round(fb.y + fb.height));
  expect(bar.y + bar.height).toBeGreaterThan(fb.y + fb.height - 14);
  const list = (await f.getByTestId("base-list").boundingBox())!;
  for (const key of ["straight_jump", "backroll", "frontroll", "kiteloop", "megaloop", "double_loop"]) {
    const b = (await f.locator(`[data-block="base:${key}"]`).boundingBox())!;
    expect(b.y + b.height, key).toBeLessThanOrEqual(list.y + list.height + 1);
  }
  for (const id of ["direction:left", "multiplier:x2", "base:backroll", "addon:handle_pass", "addon:board_off"]) await f.locator(`[data-block="${id}"]`).click();
  await expect(f.getByTestId("composed-name")).toContainText("Left ×2 Backroll Board-off Handle pass");
  await f.getByTestId("log-button").click();
  await expect(f.getByTestId("composed-name")).toContainText("Logged — RED — attempt 7");
  await expect(f.getByTestId("rider-tile-counter").first()).toHaveText(/^7 \/ 7/);
  await f.getByTestId("crash-button").click();
  await expect(f.getByRole("alertdialog")).toBeVisible();
  await f.getByRole("button", { name: "Cancel" }).click();
});

test("heat end: smaller numbers, a compact summary above the pad, the button says Submit (never Submit sheet), asks once, then locks", async ({ page }) => {
  await page.goto("/design");
  const f = frame(page, "judge-end");
  const card = f.getByTestId("impression-card");
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
  await expect(s.getByRole("tab", { name: "Control" })).toBeVisible();
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
  await expect(ctl.locator('[data-control="start"]')).toBeDisabled(); // already running
  for (const id of ["pause", "end", "hold", "resumeAt", "shift5", "shift10", "cancel", "rerun"]) await expect(ctl.locator(`[data-control="${id}"]`)).toBeEnabled();
  await expect(ctl.getByRole("button", { name: /reset/i })).toHaveCount(0);
  await expect(ctl).toContainText("There is no timer reset");
  // Cancel heat asks for a reason, then Start is the way back
  await ctl.locator('[data-control="cancel"]').click();
  await expect(c.getByRole("alertdialog")).toBeVisible();
  await expect(c.getByRole("button", { name: "Save" })).toBeDisabled();
  await c.getByLabel("Reason (required)").fill("kite tangle");
  await c.getByRole("button", { name: "Save" }).click();
  await expect(ctl.locator('[data-control="start"]')).toBeEnabled();
  await ctl.locator('[data-control="start"]').click();
  await expect(ctl.locator('[data-control="pause"]')).toBeEnabled();
  // Details: totals and blockers
  await c.getByTestId("details-toggle").click();
  await expect(c.getByTestId("head-details")).toContainText("31.54");
  await expect(c.getByTestId("blockers")).toContainText("Judge 2 has no Impression score for BLUE");
});

test("laptop console is a working tool: edit a score with a reason, attempt menu, rider menu, who owes an Impression score, Publish with its blocker list, Re-open, Re-run heat", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/design");
  const k = page.getByTestId("head-console");
  await k.scrollIntoViewIfNeeded();
  // the attempt menu is open on the possible duplicate
  const menu = k.getByTestId("attempt-menu");
  for (const name of ["Delete", "Merge duplicate", "Edit attempt", "Add attempt"]) await expect(menu.getByRole("menuitem", { name })).toBeVisible();
  await expect(k.getByTestId("owes")).toContainText("Owes Impression score: Judge 2 (BLUE)");
  await expect(k.getByTestId("publish")).toBeDisabled();
  await expect(k.getByTestId("blockers")).toContainText("Publish is blocked");
  await expect(k.getByTestId("blockers")).toContainText("Judge 3 has no score for BLUE, attempt 2");

  // edit one cell with a reason
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

  // the rider menu: DNS needs a reason and takes the total away
  await k.getByLabel("RED: Rider menu").first().click();
  const rm = k.getByTestId("rider-menu");
  for (const name of ["DNS (did not start)", "DNF (did not finish)", "DSQ (disqualified)", "Interference"]) await expect(rm.getByRole("menuitem", { name })).toBeVisible();
  await rm.getByRole("menuitem", { name: "Interference" }).click();
  await k.getByTestId("reason-input").fill("kite collision");
  await k.getByTestId("dialog-save").click();
  await expect(k.locator('[data-testid=console-total][data-rider=red]')).toContainText("Interference".slice(0, 3).toUpperCase());

  // merge the duplicate: the first logged is kept by default
  await k.locator('[data-row-id="red-6"]').getByTestId("attempt-menu-button").click();
  await k.getByRole("menuitem", { name: "Merge duplicate" }).click();
  await expect(k.getByRole("radio").first()).toBeChecked();
  await k.getByTestId("reason-input").fill("two spotters");
  await k.getByTestId("dialog-save").click();
  await expect(k.locator('[data-row-id="red-6"]')).toHaveAttribute("data-row-state", "deleted");

  // clear the blockers: Judge 3's score for BLUE attempt 2 and Judge 2's Impression score
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
  await expect(k.getByTestId("reopen")).toBeEnabled();
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

test("public result rows: three choices of what spectators see per attempt; crash red, not counted grey, counted green from darkest to lightest, each with a word", async ({ page }) => {
  await page.goto("/design#result");
  const modes = ["trick_score", "number_score", "scores_only"];
  for (const m of modes) await expect(page.getByTestId(`result-mode-${m}`)).toHaveCount(1);
  const rows = (m: string) => page.getByTestId(`result-mode-${m}`).locator("li[data-tone]");
  await expect(rows("trick_score").nth(1)).toContainText("2. Double loop");
  await expect(rows("number_score").nth(1)).toContainText("Attempt 2");
  expect((await rows("scores_only").nth(1).innerText()).includes("Double")).toBe(false);
  await expect(rows("scores_only").nth(1)).toContainText("8.25");
  const t = rows("trick_score");
  await expect(t.nth(3)).toHaveAttribute("data-tone", "crash");
  await expect(t.nth(3)).toContainText("CRASH");
  await expect(t.nth(2)).toHaveAttribute("data-tone", "notCounted");
  await expect(t.nth(2)).toContainText("Not counted");
  // counted: 8.25 darkest (0), 8.08 (2), 7.71 lightest (3)
  expect(await t.evaluateAll((els) => els.map((e) => e.getAttribute("data-shade")))).toEqual(["3", null, null, null, "2"].map((v, i) => (i === 1 ? "0" : v)));
  for (const i of [0, 1, 4]) await expect(t.nth(i)).toContainText("Counted");
  const bg = await t.evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  expect(new Set([bg[0], bg[1], bg[4]]).size).toBe(3); // three different greens
  expect(bg[3]).not.toBe(bg[2]); // red is not grey
});

test("the Rider label picks its look from the scheme: coloured block for Lycra, number block for bib, name first for name call-out; no switch", async ({ page }) => {
  await page.goto("/design#labels");
  const scheme = async (name: string) => page.getByTestId("standard-scheme").filter({ has: page.getByRole("heading", { name, exact: true }) }).getByTestId("rider-label").first();
  await expect(await scheme("Lycra colour per heat")).toHaveAttribute("data-style", "colour-block");
  await expect(await scheme("Bib / sail number")).toHaveAttribute("data-style", "number-block");
  await expect(await scheme("Name call-out")).toHaveAttribute("data-style", "name-first");
  await expect(page.getByTestId("section-labels").getByRole("switch")).toHaveCount(0);
  // the colour word sits in a block of its colour
  const block = await (await scheme("Lycra colour per heat")).getByTestId("rider-label-primary").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(block).not.toBe("rgba(0, 0, 0, 0)");
  if ((await page.getByTestId("arrow-scheme").count()) === 0) await expect(page.getByTestId("arrow-missing")).toBeVisible();
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

test("Normal sizes: pad 44–48 px tall with 6 px gaps and 18–20 px digits; the selected score is the only large number; other sizes and taps as agreed", async ({ page }) => {
  await page.goto("/design");
  const stats = await padStats(page);
  expect(stats.count).toBeGreaterThan(40);
  expect(stats.minH).toBeGreaterThanOrEqual(44);
  expect(stats.maxH).toBeLessThanOrEqual(48);
  expect(stats.minW).toBeGreaterThanOrEqual(44);
  for (const g of stats.gaps) expect(g).toBe(6);
  expect(stats.digit).toBeGreaterThanOrEqual(18);
  expect(stats.digitMax).toBeLessThanOrEqual(20);
  expect(await tapAudit(page, 44)).toEqual([]);
  const j = frame(page, "judge-live");
  const name = await fontPx(j.getByTestId("rider-label").locator("span.text-name").first());
  expect(name).toBeGreaterThanOrEqual(16);
  expect(name).toBeLessThanOrEqual(18);
  const small = await fontPx(j.getByTestId("connection-badge").locator("span").last());
  expect(small).toBeGreaterThanOrEqual(13);
  expect(small).toBeLessThanOrEqual(14);
  const body = await fontPx(page.getByTestId("design-root"));
  expect(body).toBeGreaterThanOrEqual(15);
  expect(body).toBeLessThanOrEqual(16);
  const heading = await fontPx(page.getByTestId("section-judge-live").locator("h2"));
  expect(heading).toBeGreaterThanOrEqual(13);
  expect(heading).toBeLessThanOrEqual(14);
  const slim = await fontPx(j.getByTestId("heat-timer-clock"));
  expect(slim).toBeGreaterThanOrEqual(20);
  expect(slim).toBeLessThanOrEqual(24);
  const readout = await fontPx(j.getByTestId("pad-value"));
  expect(readout).toBeGreaterThanOrEqual(28);
  expect(readout).toBeLessThanOrEqual(32);
  // nothing else on a live screen is larger than 21 px except the selected score (and the 48 px head-judge timer on its own screen)
  for (const id of ["judge-live", "judge-details", "spotter-live", "judge-end"]) {
    const big = await frame(page, id).evaluate((root) => Array.from(root.querySelectorAll("*")).filter((el) => parseFloat(getComputedStyle(el).fontSize) > 21 && !el.closest("[data-testid=pad-value]") && Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim())).map((el) => `${el.tagName} ${(el.textContent ?? "").slice(0, 20)}`));
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
  expect(await fontPx(frame(page, "judge-live").getByTestId("rider-label").locator("span.text-name").first())).toBeGreaterThanOrEqual(20);
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

test("no percentages anywhere on screen; the preview of the division setting shows them", async ({ page }) => {
  await page.goto("/design");
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/\d\s*%/);
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
  await expect(panel.nth(0)).toContainText("7.71");
  await expect(panel.nth(1)).toContainText("8.25");
  await expect(panel.nth(2)).toContainText("7.29");
  await expect(panel.nth(3)).toContainText("—");
  await expect(panel.nth(4)).toContainText("8.08");
});
