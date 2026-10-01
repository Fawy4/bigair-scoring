import { test, expect } from "./base";
import type { Page } from "@playwright/test";

// Phase 7a-0: the public /design/organiser preview. Controls and rows are 40 px on a computer, 44 px on a touch screen, 48 px with Large text;
// text reads at 7:1 in both themes; nothing scrolls sideways at 390 or 1280 px; every status has a word; every disabled button says why.
const ROOT = '[data-testid="design-root"]';

/** Every control a person taps: buttons, links, selects, text and number boxes (tick boxes are checked through their label). */
const CONTROLS = "button, a[href], select, input:not([type=hidden]):not([type=checkbox])";

async function sizes(page: Page, scope: string) {
  return page.evaluate(
    ({ scope, controls }) => {
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
      };
      const roots = Array.from(document.querySelectorAll(scope));
      const out: { name: string; w: number; h: number }[] = [];
      const within = (selector: string) => roots.flatMap((r) => Array.from(r.querySelectorAll(selector)));
      for (const el of within(controls)) {
        if (!visible(el) || el.closest("[data-testid=preview-bar]") || el.closest("[data-today]")) continue;
        const r = el.getBoundingClientRect();
        out.push({ name: `${el.tagName} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}"`, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
      }
      const rows = within("[data-testid=table-row]").filter(visible).map((r) => Math.round(r.getBoundingClientRect().height * 10) / 10);
      const ticks = within("label:has(input[type=checkbox])").filter(visible).map((l) => Math.round(l.getBoundingClientRect().height * 10) / 10);
      return { out, rows, ticks };
    },
    { scope, controls: CONTROLS },
  );
}

async function noSidewaysScroll(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(scroll, "the page is wider than the screen").toBeLessThanOrEqual(inner);
}

/** Contrast of every piece of text against the colour behind it (WCAG), the lowest ratio and where it is. */
async function worstContrast(page: Page) {
  // colours fade over 150 ms when a theme is switched: measure when they have settled
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  return page.evaluate((root) => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/)!;
      const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const behind = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c.a > 0.95) return c;
      }
      return parse(getComputedStyle(document.body).backgroundColor);
    };
    let worst = { ratio: 99, at: "" };
    const check = (el: Element, label: string) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") return;
      const fg = parse(getComputedStyle(el).color);
      const bg = behind(el);
      const [a, b] = [lum(fg), lum(bg)];
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < worst.ratio) worst = { ratio, at: label };
    };
    for (const el of Array.from(document.querySelector(root)!.querySelectorAll("*"))) {
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
      if (own) check(el, `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
      if (el instanceof HTMLInputElement && el.type !== "checkbox" && el.type !== "hidden") check(el, `INPUT ${el.getAttribute("aria-label")}`);
    }
    return worst;
  }, ROOT);
}

test.describe("on a computer (1440 × 900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("opens signed out, says it is not live, is kept out of search engines and has the nine sections in order", async ({ page }) => {
    await page.goto("/design/organiser");
    await expect(page.getByTestId("not-live")).toHaveText("Design preview — nothing here is live");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const ids = await page.locator("[data-testid^=section-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(ids).toEqual(["section-shell", "section-dashboard", "section-riders", "section-settings-simple", "section-settings-advanced", "section-footer", "section-numbers", "section-buttons", "section-phone"]);
  });

  test("controls and rows are 40 px high, tick boxes have a 40 px target, and the phone mock measures like a touch screen (44 px)", async ({ page }) => {
    await page.goto("/design/organiser");
    const laptop = await sizes(page, "[data-testid=laptop-frame]");
    expect(laptop.out.length).toBeGreaterThan(150);
    expect(laptop.out.filter((c) => c.h < 39.5 || c.w < 39.5), "smaller than 40").toEqual([]);
    expect(new Set(laptop.rows)).toEqual(new Set([40]));
    expect(Math.min(...laptop.ticks)).toBeGreaterThanOrEqual(40);
    const buttons = await page.locator("[data-variant]").evaluateAll((els) => els.filter((e) => e.closest("[data-testid=laptop-frame]") && e.getBoundingClientRect().height > 0).map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(buttons.filter((h) => h === 40).length).toBeGreaterThan(20);
    const phone = await sizes(page, "[data-testid=phone-frame]");
    expect(phone.out.filter((c) => c.h < 43.5 || c.w < 43.5), "smaller than 44 in the phone mock").toEqual([]);
    expect(new Set(phone.rows)).toEqual(new Set([44]));
  });

  test("with Large text the controls and rows are 48 px", async ({ page }) => {
    await page.goto("/design/organiser");
    await page.getByRole("button", { name: "Large", exact: true }).click();
    const laptop = await sizes(page, "[data-testid=laptop-frame]");
    expect(laptop.out.filter((c) => c.h < 47.5 || c.w < 47.5), "smaller than 48").toEqual([]);
    expect(new Set(laptop.rows)).toEqual(new Set([48]));
    const phone = await sizes(page, "[data-testid=phone-frame]");
    expect(phone.out.filter((c) => c.h < 47.5 || c.w < 47.5), "smaller than 48 in the phone mock").toEqual([]);
  });

  test("the dashboard shows the readiness list and Now / Next in the first 900 px of the frame", async ({ page }) => {
    await page.goto("/design/organiser");
    const frame = page.getByTestId("section-dashboard").getByTestId("laptop-frame");
    const top = (await frame.boundingBox())!.y;
    for (const id of ["dashboard-missing", "dashboard-now"]) {
      const box = (await frame.getByTestId(id).boundingBox())!;
      expect(box.y + box.height - top, `${id} ends below 900`).toBeLessThanOrEqual(900);
    }
    await expect(frame.getByTestId("check-judges")).toContainText("Pro Women: 2 of 3 judges");
    await expect(frame.getByTestId("dashboard-timer")).toContainText("4:22");
  });

  test("the rail lists the seven steps in order, each with a state word and a reason", async ({ page }) => {
    await page.goto("/design/organiser");
    const rail = page.getByTestId("section-shell").getByTestId("step-rail");
    await expect(rail.locator("li")).toHaveCount(7);
    const names = await rail.locator("li > a > span:first-child").allTextContents();
    expect(names.map((n) => n.replace(/^\d+\s*/, "").trim())).toEqual(["Event", "Divisions", "Riders", "Officials", "Draw", "Run order", "Go live"]);
    await expect(rail.getByTestId("rail-riders")).toHaveAttribute("aria-current", "step");
    await expect(rail.getByTestId("rail-officials")).toContainText("Needs attention");
    await expect(rail.getByTestId("rail-golive")).toContainText("Not started");
    await expect(page.getByTestId("section-shell").getByTestId("step-picker")).toHaveCount(0);
  });

  test("every status pill has a word and an icon, never colour alone", async ({ page }) => {
    await page.goto("/design/organiser");
    const pills = page.getByTestId("status-pill");
    const count = await pills.count();
    expect(count).toBeGreaterThan(20);
    for (let i = 0; i < count; i++) {
      const pill = pills.nth(i);
      expect(((await pill.textContent()) ?? "").trim().length, `pill ${i}`).toBeGreaterThan(3);
      await expect(pill.locator("svg")).toHaveCount(1);
    }
    const words = new Set(await page.getByTestId("section-buttons").getByTestId("status-pill").allTextContents());
    expect(words).toEqual(new Set(["Done", "Needs attention", "Not started", "Live", "On hold", "Draft", "Published"]));
  });

  test("every disabled button says why, in words on the page", async ({ page }) => {
    await page.goto("/design/organiser");
    const disabled = page.locator("button:disabled");
    const count = await disabled.count();
    expect(count).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < count; i++) {
      const button = disabled.nth(i);
      const id = await button.getAttribute("aria-describedby");
      expect(id, `disabled button ${i} has no reason`).toBeTruthy();
      const reason = page.locator(`[id="${id}"]`);
      await expect(reason).toBeVisible();
      expect(((await reason.textContent()) ?? "").trim().split(/\s+/).length).toBeGreaterThanOrEqual(3);
    }
    await expect(page.getByTestId("section-dashboard").getByRole("button", { name: "Big screen" })).toBeDisabled();
    await expect(page.getByTestId("section-dashboard").getByText("The big screen comes with the public pages.")).toBeVisible();
    await expect(page.getByTestId("section-dashboard").getByTestId("wind-call-slot")).toContainText("The wind call arrives with the public pages.");
  });

  test("text reads at 7:1 or better in Daylight and in Dark, also with the Advanced fold open", async ({ page }) => {
    await page.goto("/design/organiser");
    for (const theme of ["Daylight", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).first().click();
      await expect(page.locator(ROOT)).toHaveAttribute("data-theme", theme === "Dark" ? "dark" : "day");
      const worst = await worstContrast(page);
      expect(worst.ratio, `${theme}: ${worst.at}`).toBeGreaterThanOrEqual(7);
    }
  });

  test("the riders table: search narrows, ticks make a bulk bar that names the count, Set status changes the ticked rows, the header stays put", async ({ page }) => {
    await page.goto("/design/organiser");
    const section = page.getByTestId("section-riders");
    const table = section.getByTestId("riders-table");
    await expect(table.getByTestId("table-row")).toHaveCount(18);
    await expect(table.getByTestId("bulk-bar")).toContainText("3 selected");
    await table.getByTestId("table-search").fill("ma");
    const shown = await table.getByTestId("table-row").count();
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(18);
    for (const text of await table.getByTestId("table-row").allInnerTexts()) expect(text.toLowerCase()).toContain("ma");
    await expect(table.getByTestId("table-count")).toContainText("hidden by the filter");
    await table.getByTestId("table-search").fill("jose");
    await expect(table.getByTestId("no-match")).toBeVisible();
    await table.getByTestId("table-search").fill("");
    await table.getByRole("checkbox", { name: "Select Idris Cole" }).check();
    await expect(table.getByTestId("bulk-bar")).toContainText("4 selected");
    await table.getByRole("button", { name: "Set status" }).click();
    await page.getByRole("menuitem", { name: "Withdrawn" }).click();
    await expect(table.getByTestId("table-row").filter({ hasText: "Idris Cole" })).toContainText("Withdrawn");
    await expect(table.getByTestId("table-row").filter({ hasText: "Jonas Berg" })).toContainText("Withdrawn");
    // the header stays on top while the rows scroll inside the table
    const scroller = table.locator("div.overflow-auto");
    await scroller.evaluate((el) => (el.scrollTop = 200));
    const head = (await table.locator("thead th").first().boundingBox())!;
    const box = (await scroller.boundingBox())!;
    expect(Math.abs(head.y - box.y)).toBeLessThanOrEqual(1);
  });

  test("one row is open for editing; Enter saves and a tick says so; the empty state says what to do next", async ({ page }) => {
    await page.goto("/design/organiser");
    const section = page.getByTestId("section-riders");
    const input = section.getByTestId("inline-input");
    await expect(input).toHaveCount(1);
    await expect(input).toHaveValue("Karim Nassar");
    await input.fill("Karim Nassar Jr");
    await input.press("Enter");
    await expect(section.getByTestId("saved-tick")).toContainText("Saved");
    await expect(section.getByTestId("saved-tick")).toHaveCount(0, { timeout: 5000 });
    await expect(section.getByTestId("empty-state")).toContainText("No riders in Juniors yet");
    await expect(section.getByTestId("empty-state")).toContainText("Add one below, paste a list, or open registrations.");
  });

  test("the sentence follows the dials, the “?” opens an example, and Advanced keeps the sentence in view", async ({ page }) => {
    await page.goto("/design/organiser");
    const simple = page.getByTestId("section-settings-simple");
    await expect(simple.getByTestId("model-sentence-simple")).toHaveText("Best 3 of 7 attempts + Variety 0–10, 3 judges averaged");
    await simple.getByRole("spinbutton", { name: "Tricks that count" }).fill("2");
    await expect(simple.getByTestId("model-sentence-simple")).toHaveText("Best 2 of 7 attempts + Variety 0–10, 3 judges averaged");
    await simple.getByRole("button", { name: "About “Judges on the panel”" }).click();
    await expect(simple.getByTestId("setting-example")).toContainText("Example: With 3 judges, every trick gets 3 scores that are combined into one.");
    await expect(simple.getByTestId("advanced-area")).toHaveCount(0);
    await simple.getByRole("button", { name: "Load…" }).click();
    await expect(page.getByRole("menuitem", { name: "Save as preset…" })).toBeVisible();
    await page.keyboard.press("Escape");

    const advanced = page.getByTestId("section-settings-advanced");
    await expect(advanced.getByTestId("advanced-area")).toBeVisible();
    await expect(advanced.getByTestId("advanced-toggle")).toContainText("More settings (10)");
    const last = advanced.getByTestId("setting-advanced-ratio");
    await last.scrollIntoViewIfNeeded();
    await expect(advanced.getByTestId("model-sentence-advanced")).toBeInViewport();
  });

  test("number boxes are as wide as their biggest number, never full width, with the digits at the right (and centred in the earlier version)", async ({ page }) => {
    await page.goto("/design/organiser");
    const section = page.getByTestId("section-numbers");
    const width = async (name: string) => (await section.getByRole("spinbutton", { name }).boundingBox())!.width;
    const one = await width("Riders per heat (right)");
    const two = await width("Heat length (right)");
    const three = await width("Most riders (right)");
    const decimal = await width("Impression scale step (right)");
    expect(one).toBeLessThan(two);
    expect(two).toBeLessThan(three);
    expect(decimal).toBeGreaterThan(two);
    expect(three).toBeLessThan(120);
    const today = (await section.getByRole("spinbutton", { name: "Riders per heat (today)" }).boundingBox())!.width;
    expect(today).toBeGreaterThan(200);
    const align = (name: string) => section.getByRole("spinbutton", { name }).evaluate((el) => getComputedStyle(el).textAlign);
    expect(await align("Most riders (right)")).toBe("right");
    expect(await align("Most riders (centre)")).toBe("center");
  });

  test("Previous and Next: both on step 2, only Previous on Go live; Next moves the open step", async ({ page }) => {
    await page.goto("/design/organiser");
    const demo = page.getByTestId("section-footer").getByTestId("step-footer");
    await expect(demo).toHaveCount(3);
    await expect(demo.nth(0).getByRole("button")).toHaveText(["Previous: Event", "Next: Riders"]);
    await expect(demo.nth(2).getByRole("button")).toHaveText(["Previous: Run order"]);
    const shell = page.getByTestId("section-shell");
    await shell.getByRole("button", { name: "Next: Officials" }).click();
    await expect(shell.getByTestId("rail-officials")).toHaveAttribute("aria-current", "step");
  });

  test("Hold puts the heat on hold and enables Resume; the top bar has the public link with a QR code and the organisation switcher", async ({ page }) => {
    await page.goto("/design/organiser");
    const dash = page.getByTestId("section-dashboard");
    await dash.getByRole("button", { name: "Hold", exact: true }).click();
    await expect(dash.getByTestId("dashboard-now").getByTestId("status-pill")).toContainText("On hold");
    await expect(dash.getByRole("button", { name: "Resume at…" })).toBeEnabled();
    await dash.getByRole("button", { name: "Resume at…" }).click();
    await expect(dash.getByTestId("dashboard-now").getByTestId("status-pill")).toContainText("Live");
    await dash.getByTestId("public-link-menu").getByRole("button").click();
    await expect(dash.getByTestId("qr-image")).toBeVisible();
    await expect(dash.getByTestId("public-url")).toHaveText("https://example.org/e/preview-cup");
    await page.keyboard.press("Escape");
    await dash.getByTestId("org-switcher").getByRole("button").click();
    await expect(page.getByRole("menuitem", { name: "Demo Watersports" })).toBeVisible();
  });

  test("nothing scrolls sideways at 1280 and 1440 px, in Daylight, Dark and Large", async ({ page }) => {
    await page.goto("/design/organiser");
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await noSidewaysScroll(page);
    }
    await page.getByRole("button", { name: "Dark", exact: true }).first().click();
    await page.getByRole("button", { name: "Large", exact: true }).first().click();
    await noSidewaysScroll(page);
  });
});

test.describe("on a phone (390 × 844, touch)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("starts on the Phone frame, controls and rows are 44 px, nothing scrolls sideways", async ({ page }) => {
    await page.goto("/design/organiser");
    await expect(page.getByRole("button", { name: "Phone", exact: true })).toHaveAttribute("aria-pressed", "true");
    await noSidewaysScroll(page);
    const phone = await sizes(page, ROOT);
    expect(phone.out.length).toBeGreaterThan(40);
    expect(phone.out.filter((c) => c.h < 43.5 || c.w < 43.5), "smaller than 44").toEqual([]);
    expect(new Set(phone.rows)).toEqual(new Set([44]));
  });

  test("the rail turns into the step picker, with the state word in every option", async ({ page }) => {
    await page.goto("/design/organiser");
    const frame = page.getByTestId("section-phone").getByTestId("phone-frame");
    await expect(frame.getByTestId("step-picker")).toBeVisible();
    await expect(frame.getByTestId("step-rail")).toHaveCount(0);
    const options = await frame.locator("#step-picker-select option").allTextContents();
    expect(options).toEqual([
      "1. Event — Done",
      "2. Divisions — Done",
      "3. Riders — Done",
      "4. Officials — Needs attention",
      "5. Draw — Needs attention",
      "6. Run order — Not started",
      "7. Go live — Not started",
    ]);
    // a one-shot action can land before the page has finished starting up in dev mode: try until it sticks
    await expect(async () => {
      await frame.locator("#step-picker-select").selectOption("officials");
      await expect(frame.getByTestId("step-picker")).toContainText("Pro Women needs 3 judges, 2 assigned", { timeout: 1500 });
    }).toPass();
  });

  test("the Previous / Next bar sticks to the bottom of the phone while the list scrolls", async ({ page }) => {
    await page.goto("/design/organiser");
    const frame = page.getByTestId("section-phone").getByTestId("phone-frame");
    await frame.scrollIntoViewIfNeeded();
    await frame.getByTestId("screen-body").evaluate((el) => (el.scrollTop = 120));
    const f = (await frame.boundingBox())!;
    const bar = (await frame.getByTestId("step-footer").boundingBox())!;
    expect(Math.abs(f.y + f.height - 6 - (bar.y + bar.height))).toBeLessThanOrEqual(8);
    await expect(frame.getByRole("button", { name: "Next: Officials" })).toBeInViewport();
  });

  test("a laptop mock on a phone is shrunk to fit: still nothing scrolls sideways", async ({ page }) => {
    await page.goto("/design/organiser");
    await page.getByRole("button", { name: "Laptop", exact: true }).click();
    await expect(page.getByTestId("section-shell").getByTestId("laptop-frame")).toBeVisible();
    await noSidewaysScroll(page);
    await page.getByRole("button", { name: "Large", exact: true }).first().click();
    await noSidewaysScroll(page);
  });

  test("text reads at 7:1 on the phone in both themes", async ({ page }) => {
    await page.goto("/design/organiser");
    for (const theme of ["Daylight", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).first().click();
      const worst = await worstContrast(page);
      expect(worst.ratio, `${theme}: ${worst.at}`).toBeGreaterThanOrEqual(7);
    }
  });
});
