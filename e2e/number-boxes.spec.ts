import { expect, test } from "./base";
import { createLiveWorld } from "./live-world";

// Polish 2, item 13: every number box has its up / down spinner again (and the keyboard arrows), still as wide as its digits with the digits at the right.
test("number boxes: arrow keys step the value, the spinner is shown, the box stays narrow and right-aligned", async ({ page }) => {
  test.setTimeout(240_000);
  const w = await createLiveWorld();
  try {
    await w.org.signIn(page, `/org/events/${w.eventId}/divisions`);
    const judges = page.getByLabel("Number of judges", { exact: true }).first();
    await expect(judges).toBeVisible({ timeout: 60_000 });
    const before = Number(await judges.inputValue());
    await judges.focus();
    await page.keyboard.press("ArrowUp");
    await expect(judges).toHaveValue(String(before + 1));
    await page.keyboard.press("ArrowDown");
    await expect(judges).toHaveValue(String(before));
    const look = await judges.evaluate((el) => {
      const s = getComputedStyle(el);
      return { type: (el as HTMLInputElement).type, appearance: s.appearance, align: s.textAlign, width: el.getBoundingClientRect().width, parent: el.closest("fieldset")!.getBoundingClientRect().width };
    });
    expect(look.type).toBe("number");
    expect(look.appearance).not.toBe("textfield");
    expect(look.align).toBe("right");
    expect(look.width).toBeLessThan(look.parent / 2);
  } finally {
    await w.cleanup();
  }
});
