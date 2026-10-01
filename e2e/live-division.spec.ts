import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { addLadder, createLiveWorld, type LiveWorld } from "./live-world";
import type { BrowserContext, Page } from "@playwright/test";

// Phase 7a-1, step 8e: the head judge's console shows one division at a time, with the selector in the header. Two divisions on a throwaway event.
let w: LiveWorld;
const phones: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld();
});
test.afterEach(async () => {
  await closePhones(phones);
  await w?.cleanup();
});
async function open(browser: import("@playwright/test").Browser, size: { width: number; height: number }): Promise<Page> {
  const context = await browser.newContext({ viewport: size });
  phones.push(context);
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await w.signInAs(page, "head", `/head/${w.eventId}`);
  return page;
}

test("the console shows one division; a heat starting in the other one only shows Live on its tab, and the choice is remembered", async ({ browser }) => {
  test.setTimeout(180_000);
  const ladder = await addLadder(w);
  const head = await open(browser, { width: 1500, height: 1000 });
  const tabs = head.getByTestId("division-tabs");
  await expect(tabs.getByRole("tab", { name: /Pro Men/ })).toHaveAttribute("aria-selected", "true"); // the next heat on the run order is Pro Men's
  await expect(head.locator('[data-testid="run-order"] li')).toHaveCount(2);
  await expect(head.getByTestId("run-order")).not.toContainText("Ladder");
  await expect(tabs.getByTestId("division-live")).toHaveCount(0);

  // a heat starts in the other division: Pro Men stays shown, the Ladder tab says Live (a dot and the word)
  const first = Object.values(ladder.heats)[0];
  await w.db.from("heats").update({ status: "running", started_at: new Date().toISOString() }).eq("id", first);
  await expect(tabs.getByRole("tab", { name: /Ladder/ }).getByTestId("division-live")).toHaveText("Live", { timeout: 30_000 });
  await expect(tabs.getByRole("tab", { name: /Pro Men/ })).toHaveAttribute("aria-selected", "true");
  await expect(head.getByTestId("run-order")).not.toContainText("Ladder");

  // choosing the other division shows its heats; the choice is kept after a reload
  await tabs.getByRole("tab", { name: /Ladder/ }).click();
  await expect(tabs.getByRole("tab", { name: /Ladder/ })).toHaveAttribute("aria-selected", "true");
  await expect(head.getByTestId("run-order")).toContainText("Ladder");
  await head.reload();
  await expect(head.getByTestId("division-tabs").getByRole("tab", { name: /Ladder/ })).toHaveAttribute("aria-selected", "true");
  await head.context().unrouteAll({ behavior: "ignoreErrors" });
});

test("on a phone the selector is a drop-down that names the live division", async ({ browser }) => {
  test.setTimeout(120_000);
  const ladder = await addLadder(w);
  await w.db.from("heats").update({ status: "running", started_at: new Date().toISOString() }).eq("id", Object.values(ladder.heats)[0]);
  const head = await open(browser, { width: 390, height: 844 });
  const select = head.getByTestId("division-select");
  await expect(select).toBeVisible();
  // arriving with a heat running in Ladder: that division is shown
  await expect(select).toHaveValue(ladder.divisionId);
  const options = await select.locator("option").allTextContents();
  expect(options.some((o) => /Ladder — Live/.test(o))).toBe(true);
  await select.selectOption({ label: "Pro Men" });
  await expect(select).toHaveValue(w.divisionId);
  await head.context().unrouteAll({ behavior: "ignoreErrors" });
});
