import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { addSecondChance, createLiveWorld, type LiveWorld } from "./live-world";
import type { BrowserContext, Locator, Page } from "@playwright/test";

// The ··· button of a rider card is small and sits inside the card's top-right corner: the card is no taller than it would be without it, so the score table starts
// where it did before the walkover work. Checked at 1280 px and 1920 px laptop widths (throwaway organisation; one worker, no retries).
let w: LiveWorld;
test.beforeEach(async () => {
  w = await createLiveWorld();
});
test.afterEach(async () => {
  await w?.cleanup();
});
const phones: BrowserContext[] = [];
test.afterEach(async () => {
  await closePhones(phones);
});
const pickHeat = async (p: Page, heat: string) => {
  // the second-chance division is not the one the console opens on
  await p.getByTestId("division-tab").filter({ hasText: "Second chance" }).click({ timeout: 40_000 });
  const row = p.locator(`[data-testid="order-row"][data-heat="${heat}"]`);
  await row.waitFor({ state: "attached", timeout: 40_000 });
  if (!(await row.isVisible())) await p.getByTestId("other-divisions").locator("summary").click();
  // press it until the console really shows that heat (the page may still be switching division)
  await expect(async () => {
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "true", { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
};
type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const width of [1280, 1920]) {
  test(`at ${width} px the ··· button is a small corner button inside the card, the card is no taller for it, and no text runs under it`, async ({ browser }) => {
    test.setTimeout(300_000);
    const ladder = await addSecondChance(w, "round2");
    const r2 = ladder.draw.rounds.find((r) => r.id === "R2")!;
    const oneVsOne = r2.heats.find((h) => h.slots.length === 2)!;
    const scheduled = ladder.heats[oneVsOne.uid ?? oneVsOne.id];
    const r1 = ladder.draw0.rounds[0].heats[0];
    const published = ladder.heats[r1.uid ?? r1.id];
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    phones.push(context);
    await installSupabaseProxy(context);
    const head = await context.newPage();
    await w.signInAs(head, "head", `/head/${w.eventId}`);

    await pickHeat(head, scheduled);
    const cards = head.getByTestId("rider-card");
    await expect(cards).toHaveCount(2, { timeout: 40_000 });
    const heights: number[] = [];
    for (const i of [0, 1]) {
      const card = cards.nth(i);
      const c = await box(card);
      const tile = await box(card.getByTestId("rider-strip-tile"));
      const button = card.getByTestId("rider-card-menu");
      const b = await box(button);
      const icon = await box(card.getByTestId("rider-card-menu-icon"));
      // small: about 24 × 24 visible; the tap area is a little bigger but never more than about 40 px
      expect(icon.width).toBeGreaterThanOrEqual(22);
      expect(icon.width).toBeLessThanOrEqual(26);
      expect(icon.height).toBeGreaterThanOrEqual(22);
      expect(icon.height).toBeLessThanOrEqual(26);
      expect(b.width).toBeLessThanOrEqual(42);
      expect(b.height).toBeLessThanOrEqual(42);
      // inside the card, in its top-right corner
      expect(b.x).toBeGreaterThanOrEqual(c.x - 0.5);
      expect(b.y).toBeGreaterThanOrEqual(c.y - 0.5);
      expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
      expect(b.y + b.height).toBeLessThanOrEqual(c.y + c.height + 0.5);
      expect(c.x + c.width - (icon.x + icon.width)).toBeLessThanOrEqual(10);
      expect(icon.y - c.y).toBeLessThanOrEqual(10);
      // the button adds nothing to the card: it is as tall as the rider's own tile plus its 1 px border top and bottom
      expect(Math.abs(c.height - tile.height - 2)).toBeLessThanOrEqual(1);
      heights.push(c.height);
      // the name, the total and the attempts never run under the button
      for (const id of ["rider-card-label", "rider-strip-total", "rider-strip-attempts"]) expect(overlap(await box(card.getByTestId(id)), b), `${id} under the button`).toBe(false);
    }

    // the same kind of card in a published heat (no menu there) is as tall: the score table starts where it did
    await pickHeat(head, published);
    await expect(head.getByTestId("rider-card").first()).toBeVisible({ timeout: 40_000 });
    await expect(head.getByTestId("rider-card-menu")).toHaveCount(0);
    const publishedHeights = await head.getByTestId("rider-card").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(Math.abs(Math.max(...publishedHeights) - Math.max(...heights))).toBeLessThanOrEqual(2);
  });
}
