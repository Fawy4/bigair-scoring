import path from "node:path";
import { expect, test } from "./base";
import { createReportWorld } from "./report-world";

/**
 * The manual's pictures of the rider report and of its setting (retaken with `npm run manual:shots`). A throwaway event with made-up riders only; Arrow, EKL, Red Bull and Demo
 * are never touched. Runs only when MANUAL_SHOTS=1.
 */
test.skip(process.env.MANUAL_SHOTS !== "1", "set MANUAL_SHOTS=1 (npm run manual:shots) to retake the manual's pictures");
const OUT = path.join(process.cwd(), "docs", "manual", "img");
const hideDevOverlay = (page: import("@playwright/test").Page) => page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);

test("the rider report in Day and in Dark, a heat card, and the Event step's setting", async ({ browser, page }) => {
  test.setTimeout(400_000);
  const w = await createReportWorld({ setting: "after_heat" });
  try {
    const url = `/e/${w.slug}/riders/${w.entry("Ana")}/report`;
    for (const theme of ["day", "dark"] as const) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      await ctx.addInitScript((t) => window.localStorage.setItem("bigair.beach-theme", t), theme);
      const p = await ctx.newPage();
      await p.goto(url);
      await expect(p.getByTestId("rider-report")).toBeVisible({ timeout: 60_000 });
      await hideDevOverlay(p);
      await p.waitForTimeout(1500);
      await p.screenshot({ path: path.join(OUT, theme === "day" ? "public-report-390.png" : "public-report-dark-390.png") });
      if (theme === "day") {
        const heat = p.getByTestId("report-heat").first();
        await heat.scrollIntoViewIfNeeded();
        await heat.screenshot({ path: path.join(OUT, "public-report-heat-390.png") });
        await p.getByTestId("rider-picker").scrollIntoViewIfNeeded();
        await p.getByTestId("rider-picker").locator("xpath=ancestor::header").screenshot({ path: path.join(OUT, "public-report-picker-390.png") });
        await p.getByTestId("report-takeaways").screenshot({ path: path.join(OUT, "public-report-takeaways-390.png") });
        await p.getByTestId("notes-well").fill("Two clean loops, good wind");
        await p.getByTestId("report-highlights").screenshot({ path: path.join(OUT, "public-report-highlights-390.png") });
        await p.getByTestId("report-notes").screenshot({ path: path.join(OUT, "public-report-notes-390.png") });
      }
      await ctx.close();
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await w.org.signIn(page, `/org/events/${w.eventId}/event`);
    await expect(page.getByTestId("event-panel")).toBeVisible({ timeout: 60_000 });
    const toggle = page.getByTestId("advanced-toggle");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    const card = page.getByTestId("public-page-settings");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByTestId("rider-reports-pick").selectOption(w.entry("Ana"));
    await hideDevOverlay(page);
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: path.join(OUT, "organiser-event-rider-reports-1280.png") });
  } finally {
    await w.cleanup();
  }
});
