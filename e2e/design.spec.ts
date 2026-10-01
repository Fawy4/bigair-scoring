import { test, expect } from "./base";
import type { Page } from "@playwright/test";

// Phase 5a: the public /design preview at a phone size (390 × 844). Sizes follow docs/06 §00.2: pad buttons >= 56 px with 8 px gaps,
// pad digits >= 28 px, rider names >= 20 px, heat timer >= 48 px, every other tap target >= 48 px, and nothing scrolls sideways.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function noSidewaysScroll(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(scroll, "page is wider than the screen").toBeLessThanOrEqual(inner);
}

test("the page opens without a login, says it is not live, and has a jump menu", async ({ page }) => {
  await page.goto("/design");
  await expect(page.getByTestId("not-live")).toHaveText("Design preview — nothing here is live");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByTestId("design-menu").locator("summary").click();
  await page.getByRole("link", { name: "Impression / Variety step" }).click();
  await expect(page.getByTestId("section-impression")).toBeInViewport();
  // the menu closed itself after the jump
  await expect(page.getByTestId("design-menu")).not.toHaveAttribute("open", "");
});

test("the Rider label section shows Arrow's scheme when it can be read, otherwise the three standard ones", async ({ page }) => {
  await page.goto("/design#labels");
  const arrow = await page.getByTestId("arrow-scheme").count();
  if (arrow === 0) await expect(page.getByTestId("arrow-missing")).toBeVisible();
  await expect(page.getByTestId("standard-scheme")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Lycra colour per heat", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bib / sail number" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Name call-out" })).toBeVisible();
});

test("every colour carries its name, in both themes", async ({ page }) => {
  await page.goto("/design");
  for (const theme of ["Daylight", "Dark"]) {
    await page.getByRole("button", { name: theme }).click();
    const labels = page.getByTestId("rider-label-primary");
    const n = await labels.count();
    expect(n).toBeGreaterThan(10);
    for (let i = 0; i < n; i++) expect((await labels.nth(i).innerText()).trim().length, `label ${i} in ${theme}`).toBeGreaterThan(0);
    for (const word of ["RED", "WHITE", "BLACK"]) await expect(page.getByTestId("rider-label-text").filter({ hasText: new RegExp(`^${word}$`) }).first()).toBeVisible();
  }
});

test("tap sizes: pad buttons >= 56 px with 8 px gaps, everything else >= 48 px", async ({ page }) => {
  await page.goto("/design");
  const small = await page.evaluate(() => {
    const out: string[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden";
    };
    const pads = new Set(Array.from(document.querySelectorAll("[data-pad-button]")));
    for (const el of Array.from(document.querySelectorAll("button, a[href], summary, input:not([type=hidden])"))) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const min = pads.has(el) ? 56 : 48;
      if (r.height < min - 0.5 || r.width < min - 0.5) out.push(`${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)} < ${min}`);
    }
    return out;
  });
  expect(small).toEqual([]);
  expect(await page.locator("[data-pad-button]").count()).toBeGreaterThan(40);

  // gaps between neighbouring pad buttons are 8 px
  const gaps = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll("[data-testid=score-pad]")).map((p) => Array.from(p.querySelectorAll("[data-pad-button]")).slice(0, 2).map((b) => b.getBoundingClientRect()));
    return row.map(([a, b]) => Math.round(b.left - a.right));
  });
  for (const g of gaps) expect(g).toBe(8);
});

test("type sizes: timer >= 48 px, pad digits >= 28 px, rider names >= 20 px", async ({ page }) => {
  await page.goto("/design");
  const sizes = await page.evaluate(() => {
    const px = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : 0);
    const name = Array.from(document.querySelectorAll("[data-testid=rider-label] span")).find((s) => (s.textContent ?? "").trim() === "Sam Rivera");
    return {
      timer: Math.min(...Array.from(document.querySelectorAll("[data-testid=heat-timer-clock]")).map(px)),
      pad: Math.min(...Array.from(document.querySelectorAll("[data-pad-button]")).map(px)),
      name: px(name ?? null),
    };
  });
  expect(sizes.timer).toBeGreaterThanOrEqual(48);
  expect(sizes.pad).toBeGreaterThanOrEqual(28);
  expect(sizes.name).toBeGreaterThanOrEqual(20);
});

test("nothing scrolls sideways at 390 px, in Daylight and in Dark (the score table scrolls inside its own box)", async ({ page }) => {
  await page.goto("/design");
  await noSidewaysScroll(page);
  await page.getByRole("button", { name: "Dark" }).click();
  await noSidewaysScroll(page);
  const box = page.getByTestId("matrix-scroll").first();
  expect(await box.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true); // it scrolls inside its own box...
  await noSidewaysScroll(page); // ...and the page itself does not
});

test("Dark mode works, is remembered on this device, and the sticky switch stays on screen", async ({ page }) => {
  await page.goto("/design");
  const root = page.getByTestId("design-root");
  await expect(root).toHaveAttribute("data-theme", "day");
  await expect(root).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(root).toHaveCSS("background-color", "rgb(10, 10, 10)");
  await expect(root).toHaveCSS("color", "rgb(250, 250, 250)");
  await page.getByTestId("section-sizes").scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Daylight" })).toBeInViewport();
  await page.reload();
  await expect(page.getByTestId("design-root")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Daylight" }).click();
  await expect(page.getByTestId("design-root")).toHaveAttribute("data-theme", "day");
});

test("score pad: a whole number then a tenth; the banner stays until the next action", async ({ page }) => {
  await page.goto("/design#judge");
  const card = page.getByTestId("attempt-card").first();
  await card.getByRole("button", { name: "Set 7", exact: true }).click();
  await expect(card.getByTestId("pad-value")).toHaveText("7.0");
  await card.getByRole("button", { name: "Set .5" }).click();
  await expect(card.getByTestId("pad-value")).toHaveText("7.5");
  await expect(page.getByTestId("section-judge").getByTestId("saved-banner").first()).toHaveText("Saved 7.5 — BLUE — attempt 5");
});

test("criteria: the trick score appears once all four criteria are set (docs/08 §1A attempt 1 gives 7.625)", async ({ page }) => {
  await page.goto("/design#judge");
  const rows = page.getByTestId("criteria-rows");
  const pads = rows.getByTestId("score-pad");
  const entry = async (i: number, whole: number, tenth: string) => {
    await pads.nth(i).getByRole("button", { name: `Set ${whole}`, exact: true }).click();
    await pads.nth(i).getByRole("button", { name: `Set .${tenth}` }).click();
  };
  await entry(0, 8, "0");
  await entry(1, 7, "5");
  await entry(2, 7, "0");
  await expect(rows.getByTestId("computed-trick-score")).not.toContainText("7.625");
  await entry(3, 8, "0");
  await expect(rows.getByTestId("computed-trick-score")).toContainText("7.625");
});

test("impression step: Submit sheet waits for every rider, asks once, then locks", async ({ page }) => {
  await page.goto("/design#impression");
  const card = page.getByTestId("impression-card");
  await expect(card.getByTestId("impression-progress")).toHaveText("1 / 3 riders");
  await expect(card.getByRole("button", { name: "Submit sheet" })).toBeDisabled();
  await expect(card.getByTestId("heat-summary")).toHaveCount(3);
  for (const i of [1, 2]) {
    const rider = card.getByTestId("impression-rider").nth(i);
    await rider.getByRole("button", { name: "Set 7", exact: true }).click();
  }
  await expect(card.getByTestId("impression-progress")).toHaveText("3 / 3 riders");
  await card.getByRole("button", { name: "Submit sheet" }).click();
  await card.getByRole("button", { name: "Yes, submit" }).click();
  await expect(card.getByTestId("submitted-note")).toBeVisible();
  await expect(card.getByTestId("impression-rider").first().getByRole("button", { name: "Set 8", exact: true })).toBeDisabled();
});

test("spotter builder: tap blocks, the name and category follow, CRASH asks once", async ({ page }) => {
  await page.goto("/design#spotter");
  const b = page.getByTestId("trick-builder");
  for (const id of ["direction:left", "multiplier:x2", "base:backroll", "addon:handle_pass", "addon:board_off"]) await b.locator(`[data-block="${id}"]`).click();
  await expect(page.getByTestId("composed-name")).toContainText("Left ×2 Backroll Board-off Handle pass");
  await expect(page.getByTestId("composed-name")).toContainText("Handle pass");
  await b.getByTestId("log-button").click();
  await expect(page.getByTestId("section-spotter").getByTestId("saved-banner")).toContainText("Logged — RED — attempt 6");
  await b.getByTestId("crash-button").click();
  await expect(b.getByRole("alertdialog")).toBeVisible();
  await b.getByRole("button", { name: "Cancel" }).click();
  await expect(b.getByTestId("crash-button")).toBeVisible();
});

test("numbers from docs/08 are on the page: 31.54, 78.85 %, 7.71 / 8.25 / 7.29 / 8.08", async ({ page }) => {
  await page.goto("/design#result");
  await expect(page.getByTestId("result-formula").first()).toHaveText("31.54 = tricks 24.04 + Impression / Variety score 7.50");
  await expect(page.getByTestId("result-row").first()).toContainText("78.85 %");
  const panel = page.getByTestId("head-matrix").first().getByTestId("matrix-panel");
  await expect(panel).toHaveText([/7\.71/, /8\.25/, /7\.29/, /—/, /8\.08/]);
});
