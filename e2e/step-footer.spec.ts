import { expect, test, installSupabaseProxy } from "./base";
import { createLiveWorld } from "./live-world";

// Polish 2, item 12: the Next / Previous bar stays at the bottom on every screen size and the floating Note button sits above it, never on it, in Daylight
// and Dark. A throwaway organisation; Arrow, EKL and Demo are never touched.
test("the Note button floats above the Next / Previous bar, laptop and phone, Daylight and Dark", async ({ browser }) => {
  test.setTimeout(300_000);
  const w = await createLiveWorld();
  try {
    for (const [vp, theme] of [[{ width: 1280, height: 800 }, "day"], [{ width: 390, height: 844 }, "dark"]] as const) {
      const ctx = await browser.newContext({ viewport: vp });
      await installSupabaseProxy(ctx);
      await ctx.addInitScript((t) => window.localStorage.setItem("bigair.beach-theme", t), theme);
      const page = await ctx.newPage();
      await w.org.signIn(page, `/org/events/${w.eventId}/divisions`);
      const bar = page.getByTestId("step-footer");
      const note = page.getByTestId("note-button");
      await expect(bar).toBeVisible({ timeout: 60_000 });
      await expect(note).toBeVisible({ timeout: 30_000 });
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(500);
      const b = (await bar.boundingBox())!;
      const n = (await note.boundingBox())!;
      expect(Math.round(b.y + b.height), "the bar sits at the bottom of the screen").toBeGreaterThanOrEqual(vp.height - 1);
      expect(n.y + n.height, "the Note button ends above the bar").toBeLessThanOrEqual(b.y);
      // the bar and the button carry the page's own colours, not white on dark
      const bg = await bar.evaluate((el) => getComputedStyle(el).backgroundColor);
      const page_bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      if (theme === "dark") expect(bg).not.toBe("rgb(255, 255, 255)");
      expect(bg === page_bg || bg !== "rgba(0, 0, 0, 0)").toBe(true);
      await ctx.close();
    }
  } finally {
    await w.cleanup();
  }
});
