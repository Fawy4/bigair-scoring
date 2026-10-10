import path from "node:path";
import { expect, test, installSupabaseProxy } from "./base";
import { addSecondChance, createLiveWorld } from "./live-world";

/**
 * The manual's pictures of the walkover (retaken with `npm run manual:shots`, ideally against a production build: `npm run build`, `npx next start -p 3200`,
 * E2E_BASE_URL=http://localhost:3200, so there is no dev badge): the head console with the rider menu open on a card, and the big Walkover button once one rider is left.
 * Throwaway organisation; Arrow, EKL and Demo are never touched. Runs only when MANUAL_SHOTS=1.
 */
test.skip(process.env.MANUAL_SHOTS !== "1", "set MANUAL_SHOTS=1 (npm run manual:shots) to retake the manual's pictures");
const OUT = path.join(process.cwd(), "docs", "manual", "img");
const hideDevOverlay = (page: import("@playwright/test").Page) => page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);

test("the rider menu on a card, and the Walkover button", async ({ browser }) => {
  test.setTimeout(300_000);
  const w = await createLiveWorld();
  try {
    const ladder = await addSecondChance(w, "round2");
    const oneVsOne = ladder.draw.rounds.find((r) => r.id === "R2")!.heats.find((h) => h.slots.length === 2)!;
    const heatId = ladder.heats[oneVsOne.uid ?? oneVsOne.id];
    const [, missing] = oneVsOne.slots.map((s) => s.entrantId!);
    const laptop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installSupabaseProxy(laptop);
    const head = await laptop.newPage();
    await w.signInAs(head, "head", `/head/${w.eventId}`);
    const row = head.locator(`[data-testid="order-row"][data-heat="${heatId}"]`);
    await row.waitFor({ state: "attached", timeout: 60_000 });
    if (!(await row.isVisible())) await head.getByTestId("other-divisions").locator("summary").click();
    await row.click();
    await expect(head.getByTestId("rider-card")).toHaveCount(2, { timeout: 60_000 });
    await head.locator(`[data-testid="rider-card-menu"][data-rider="${missing}"]`).click();
    await expect(head.getByTestId("rider-menu")).toBeVisible();
    await hideDevOverlay(head);
    await head.waitForTimeout(500);
    await head.screenshot({ path: path.join(OUT, "console-rider-menu-1280.png") });
    await head.getByRole("menuitem", { name: "Did not start (this heat only)" }).click();
    await head.getByTestId("reason-pick").filter({ hasText: "Injured" }).click();
    await head.getByTestId("dialog-save").click();
    await expect(head.getByTestId("walkover-button")).toBeVisible({ timeout: 60_000 });
    await hideDevOverlay(head);
    await head.waitForTimeout(500);
    await head.screenshot({ path: path.join(OUT, "console-walkover-1280.png") });
    await laptop.close();
  } finally {
    await w.cleanup();
  }
});
