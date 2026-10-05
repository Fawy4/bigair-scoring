import { devices, type Page } from "@playwright/test";
import { test, expect, installSupabaseProxy } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import { createOrganiser } from "./organiser";

// Polish 4, C / D / E: a way Home from the public pages, the Join page in the front door's design, and a quiet Help link on every page that has a header or footer
// (not on the officials' live screens or the big screens). One worker, no retries; throwaway organisations.
let w: LiveWorld;
test.beforeAll(async () => {
  test.setTimeout(240_000);
  w = await createLiveWorld();
  await w.db.from("events").update({ status: "published" }).eq("id", w.eventId);
});
test.afterAll(async () => {
  await w?.cleanup();
});

const slug = () => `e2e-live-${w.org.run}`;

for (const path of [() => `/e/${slug()}`, () => `/e/${slug()}/join`, () => "/join", () => "/org/login"]) {
  test(`the wordmark and a quiet Home link both land on the home page, and Help goes to the manual (${path.toString().slice(6, 30)})`, async ({ page }) => {
    test.setTimeout(120_000);
    const url = path();
    await page.goto(url);
    await expect(page.getByTestId("site-footer")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("footer-help")).toHaveAttribute("href", "/help");
    await expect(page.getByTestId("footer-home")).toHaveAttribute("href", "/");
    await expect(page.getByTestId("home-wordmark")).toHaveAttribute("href", "/");
    await page.getByTestId("home-wordmark").click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto(url);
    await page.getByTestId("footer-home").click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto(url);
    await page.getByTestId("footer-help").click();
    await expect(page).toHaveURL(/\/help/, { timeout: 90_000 }); // the manual page compiles on its first visit in dev
  });
}

test("Help is in the organiser's top bar and in /admin's, and goes to /help", async ({ page }) => {
  test.setTimeout(180_000);
  const owner = await createOrganiser({ platformAdmin: "owner" });
  try {
    await owner.signIn(page, "/org");
    await expect(page.getByTestId("top-bar").getByTestId("help-link")).toHaveAttribute("href", "/help");
    await page.getByTestId("top-bar").getByTestId("help-link").click();
    await expect(page).toHaveURL(/\/help/, { timeout: 90_000 }); // the manual page compiles on its first visit in dev
    await page.goto("/admin");
    await expect(page.getByTestId("top-bar").getByTestId("help-link")).toHaveAttribute("href", "/help");
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/org");
    await expect(page.getByTestId("top-bar").getByRole("link", { name: "Help" })).toHaveAttribute("href", "/help");
  } finally {
    await owner.cleanup();
  }
});

test("no Home or Help link on the judge screen, the Flag view or the big screens (they stay clean)", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const clean = async (p: Page) => {
    await expect(p.locator('a[href="/help"]')).toHaveCount(0);
    await expect(p.getByTestId("home-wordmark")).toHaveCount(0);
    await expect(p.getByTestId("site-footer")).toHaveCount(0);
  };
  await page.goto(`/screen/${slug()}`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
  await clean(page);
  await page.goto(`/screen/${slug()}/follow`);
  await page.waitForTimeout(1500);
  await clean(page);
  await page.goto(`/e/${slug()}/flag`);
  await page.waitForTimeout(1500);
  await clean(page);
  const ctx = await browser.newContext();
  await installSupabaseProxy(ctx);
  const judge = await ctx.newPage();
  await w.signInAs(judge, "j1", `/judge/${w.eventId}`);
  await judge.waitForURL(/\/judge\//, { timeout: 60_000 });
  await judge.waitForTimeout(4000);
  await clean(judge);
  await ctx.close();
});

for (const scheme of ["light", "dark"] as const) {
  test(`the Join page in the front door's design, ${scheme}: officials first, riders below, one accent on the PIN button, 16 px cards without shadow, 7:1`, async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: devices["Pixel 5"].viewport, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(`/e/${slug()}/join`);
    await expect(page.getByTestId("role-judge")).toBeVisible({ timeout: 60_000 });
    // the officials' part first, the rider part below it
    const officials = (await page.getByTestId("role-judge").boundingBox())!;
    const pinForm = (await page.locator("#join-pin").boundingBox())!;
    await expect(page.getByTestId("join-riders")).toBeVisible();
    const riders = (await page.getByTestId("join-riders").boundingBox())!;
    expect(officials.y).toBeLessThan(pinForm.y);
    expect(pinForm.y).toBeLessThan(riders.y);
    // cards: 16 px radius, 1 px border, no shadow
    const card = await page.getByTestId("role-judge").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { radius: cs.borderTopLeftRadius, border: cs.borderTopWidth, shadow: cs.boxShadow };
    });
    expect(card).toEqual({ radius: "16px", border: "1px", shadow: "none" });
    // the PIN button is the one accent
    const accent = await page.evaluate(() => {
      const hits: string[] = [];
      for (const el of document.querySelectorAll<Element>(".home *")) {
        const cs = getComputedStyle(el);
        if ([cs.color, cs.backgroundColor, cs.borderTopColor].includes("rgb(255, 106, 0)")) hits.push((el.getAttribute("class") ?? el.tagName).split(" ")[0]);
      }
      return [...new Set(hits)];
    });
    expect(accent).toEqual(["home-go"]);
    // contrast of every essential text pair
    for (const sel of [".home-brand", ".home-title", ".home-lede", ".home-label", ".home-name", ".home-meta", ".home-field label", ".home-go", ".home-input", ".home-tip", ".home-footer a", ".home-details > summary"]) {
      const ratio = await page.locator(sel).first().evaluate((el) => {
        const parse = (c: string) => {
          const m = c.match(/rgba?\(([^)]+)\)/)!;
          const [r, g, b, a = "1"] = m[1].split(/[ ,/]+/).filter(Boolean);
          return { r: +r, g: +g, b: +b, a: +a };
        };
        const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
          const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        let bg = { r: 255, g: 255, b: 255, a: 0 };
        for (let n: Element | null = el; n; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c.a > 0.99) {
            bg = c;
            break;
          }
        }
        const [hi, lo] = [lum(parse(getComputedStyle(el).color)), lum(bg)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      });
      expect(ratio, `${sel} on ${scheme}`).toBeGreaterThanOrEqual(7);
    }
    await ctx.close();
  });
}
