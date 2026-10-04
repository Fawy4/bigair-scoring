import { expect, test } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { Page } from "@playwright/test";

// Polish 3, item 11, on a throwaway organisation: the Event step's section cards fold and unfold from their header. The first card starts open and the others folded; the choice is
// remembered in this browser; what was typed in a folded card is still there; a card with an error unfolds itself. Arrow, EKL and Demo are never touched.
test.use({ foldCardsOpen: false });

let w: LiveWorld;
test.beforeEach(async () => {
  w = await createLiveWorld();
});
test.afterEach(async () => {
  await w?.cleanup();
});

async function openEventStep(page: Page) {
  await w.org.signIn(page, `/org/events/${w.eventId}/event`);
  await expect(page.getByTestId("event-panel")).toBeVisible({ timeout: 60_000 });
  const toggle = page.getByTestId("advanced-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(page.getByTestId("fold-slug")).toBeVisible({ timeout: 15_000 });
}

test("the first card starts open, the others folded; Branding folds and its fields are hidden; what was typed is still there after unfolding", async ({ page }) => {
  test.setTimeout(240_000);
  await openEventStep(page);
  await expect(page.getByTestId("fold-slug")).toHaveAttribute("aria-expanded", "true");
  for (const id of ["branding", "timing", "scoring", "flags", "public-page", "registration"]) await expect(page.getByTestId(`fold-${id}`)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("impression-name")).toBeHidden(); // the Scoring settings card is folded
  // open Branding, add a sponsor and type a name
  await page.getByTestId("fold-branding").click();
  await expect(page.getByTestId("fold-branding")).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Add sponsor" }).click();
  await page.locator("#sp-name-0").fill("Acme Kites");
  // fold it: the fields are hidden
  await page.getByTestId("fold-branding").click();
  await expect(page.locator("#sp-name-0")).toBeHidden();
  await expect(page.getByRole("button", { name: "Add sponsor" })).toBeHidden();
  // unfold: the value is still there
  await page.getByTestId("fold-branding").click();
  await expect(page.locator("#sp-name-0")).toHaveValue("Acme Kites");
  // the "?" and the Simple / Advanced fold are untouched: the Advanced toggle still folds the whole group
  await page.getByTestId("advanced-toggle").click();
  await expect(page.getByTestId("fold-branding")).toBeHidden();
});

test("the choice is remembered in this browser", async ({ page }) => {
  test.setTimeout(240_000);
  await openEventStep(page);
  await page.getByTestId("fold-flags").click(); // open
  await page.getByTestId("fold-slug").click(); // fold the first one
  await page.reload();
  await expect(page.getByTestId("event-panel")).toBeVisible({ timeout: 60_000 });
  await expect(async () => {
    if (!(await page.getByTestId("fold-flags").isVisible())) await page.getByTestId("advanced-toggle").click({ timeout: 3000 });
    await expect(page.getByTestId("fold-flags")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId("fold-flags")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("fold-slug")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("fold-timing")).toHaveAttribute("aria-expanded", "false");
});

test("a card holding an error unfolds itself when Save finds it", async ({ page }) => {
  test.setTimeout(240_000);
  await openEventStep(page);
  await page.getByTestId("fold-branding").click();
  await page.getByRole("button", { name: "Add sponsor" }).click();
  await page.locator("#sp-url-0").fill("not a web address"); // a sponsor's link must be a web address
  await page.getByTestId("fold-branding").click(); // fold it with the mistake inside
  await expect(page.locator("#sp-url-0")).toBeHidden();
  await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByTestId("fold-branding")).toHaveAttribute("aria-expanded", "true", { timeout: 15_000 });
  await expect(page.locator("#sp-url-0")).toBeVisible();
  await expect(page.getByTestId("fold-branding").locator("xpath=ancestor::section[1]").locator(".field-error").first()).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the same fold on a phone", async ({ page }) => {
    test.setTimeout(240_000);
    await w.org.signIn(page, `/org/events/${w.eventId}/event`);
    await expect(page.getByTestId("event-panel")).toBeVisible({ timeout: 60_000 });
    const toggle = page.getByTestId("advanced-toggle");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(page.getByTestId("fold-slug")).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("fold-public-page")).toHaveAttribute("aria-expanded", "false");
    await page.getByTestId("fold-public-page").click();
    await expect(page.getByTestId("public-tab-home")).toBeVisible();
    await page.getByTestId("fold-public-page").click();
    await expect(page.getByTestId("public-tab-home")).toBeHidden();
  });
});
