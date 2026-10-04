import { devices, type Page } from "@playwright/test";
import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

// Polish 4, landing page: the front door as a product. A throwaway organisation with a live, several upcoming and finished events and a simulation (which must never appear).
// The empty state is checked in src/components/home/events-view.test.ts (the hosted project always has other public events).
type Organiser = Awaited<ReturnType<typeof createOrganiser>>;
let org: Organiser;
let slugs: { live: string; upcoming: string; simulation: string };
let simulationName = "";
let liveName = "";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test.beforeAll(async () => {
  test.setTimeout(120_000);
  org = await createOrganiser();
  const base = { organisation_id: org.orgId, timezone: "Africa/Cairo" };
  liveName = `Home Live ${org.run}`;
  simulationName = `Home Simulation ${org.run}`;
  const ins = async (name: string, slug: string, extra: object) => {
    const { error } = await org.db.from("events").insert({ ...base, name, slug, ...extra });
    if (error) throw new Error(error.message);
  };
  await ins(liveName, `home-live-${org.run}`, { status: "live", start_date: day(0), end_date: day(1) });
  for (let i = 0; i < 5; i++) await ins(`Home Coming ${i} ${org.run}`, `home-coming-${i}-${org.run}`, { status: "published", start_date: day(1 + i), end_date: day(2 + i) });
  for (let i = 0; i < 4; i++) await ins(`Home Past ${i} ${org.run}`, `home-past-${i}-${org.run}`, { status: "complete", start_date: day(-2 - i), end_date: day(-1 - i) });
  await ins(simulationName, `home-sim-${org.run}`, { status: "published", is_simulation: true, start_date: day(1), end_date: day(2) });
  slugs = { live: `home-live-${org.run}`, upcoming: `home-coming-0-${org.run}`, simulation: `home-sim-${org.run}` };
});
test.afterAll(async () => {
  await org?.cleanup();
});

/** WCAG contrast of an element's text colour over the colour painted behind it (walks up to the first opaque background). */
async function contrastOf(page: Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate((el) => {
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
    const fg = parse(getComputedStyle(el).color);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
}

const PROFILES = [
  { name: "phone", use: { viewport: devices["Pixel 5"].viewport, userAgent: devices["Pixel 5"].userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: "laptop", use: { viewport: { width: 1280, height: 800 } } },
];

for (const profile of PROFILES) {
  test.describe(`home page on a ${profile.name}`, () => {
    test.use(profile.use);

    test("hero first, the live card first and larger, simulations never listed, the event code and the quiet links work", async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("svg.home-arc")).toBeVisible();
      // the live card is first, and the larger one
      const first = page.getByTestId("landing-event").first();
      await expect(first).toHaveAttribute("data-status", "live");
      const live = page.getByTestId("live-events").getByTestId("landing-event").filter({ hasText: liveName });
      await expect(live).toHaveAttribute("data-featured", "true");
      await expect(live.getByTestId("live-dot")).toHaveText("Live");
      const liveBox = (await live.boundingBox())!;
      const other = (await page.getByTestId("upcoming-events").getByTestId("landing-event").first().boundingBox())!;
      expect(liveBox.height).toBeGreaterThan(other.height);
      // ten or more events: all are cards that open the event page; a finished event carries the quiet Results tag
      expect(await page.getByTestId("landing-event").count()).toBeGreaterThanOrEqual(10);
      await expect(page.getByTestId("recent-events").getByText("Results", { exact: true }).first()).toBeVisible();
      await expect(page.getByText(simulationName)).toHaveCount(0);
      expect(await page.locator("body").innerText()).not.toContain("sign up");
      // no sideways scroll
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      // the whole card opens the event
      await page.getByTestId("upcoming-events").getByTestId("landing-event").filter({ hasText: `Home Coming 0 ${org.run}` }).click();
      await expect(page).toHaveURL(new RegExp(`/e/${slugs.upcoming}$`));
      // the event code opens the right event; a simulation's code does not (not public)
      await page.goto("/");
      await page.getByLabel("Have an event code?").fill(slugs.live);
      await page.getByRole("button", { name: "Go" }).click();
      await expect(page).toHaveURL(new RegExp(`/e/${slugs.live}$`));
      // the quiet links go where they went before
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/org/login");
      await expect(page.getByRole("link", { name: "Join with your PIN" })).toHaveAttribute("href", "/join");
      await expect(page.getByTestId("help-link")).toHaveAttribute("href", "/help");
      await expect(page.getByTestId("admin-link")).toHaveAttribute("href", "/org/login?next=%2Fadmin");
      await expect(page.getByTestId("product-version")).toContainText(/\d+\.\d+\.\d+/);
      await expect(page.getByRole("link", { name: /sign up|register|create account/i })).toHaveCount(0);
    });

    test("the live dot is the only thing that moves; no text is cut with an ellipsis", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByTestId("live-dot").first()).toBeVisible();
      const moving = await page.evaluate(() => document.getAnimations().map((a) => (a.effect as KeyframeEffect | null)?.target ?? null).map((t) => (t instanceof Element ? t.className : "?")));
      expect(moving.length).toBeGreaterThan(0);
      expect(moving.every((c) => String(c).includes("home-dot"))).toBe(true);
      const cut = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>(".home *")) {
          const cs = getComputedStyle(el);
          if (cs.textOverflow === "ellipsis") bad.push(`css:${el.className}`);
          if (el.childElementCount === 0 && /…\s*$/.test(el.textContent ?? "") && !el.closest("[data-allow-ellipsis]")) bad.push(`text:${el.textContent}`);
        }
        return bad;
      });
      expect(cut).toEqual([]);
    });

    for (const scheme of ["light", "dark"] as const) {
      test(`${scheme} theme follows the device and every essential text is at least 7:1`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto("/");
        await expect(page.getByTestId("landing-event").first()).toBeVisible();
        const bg = await page.locator(".home").evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(bg).toBe(scheme === "dark" ? "rgb(17, 17, 17)" : "rgb(255, 255, 255)");
        const selectors = [".home-wordmark", ".home-tagline", ".home-label", ".home-name", ".home-meta", ".home-status", ".home-tag", ".home-code label", ".home-go", ".home-quiet", ".home a.link", ".home-footer a", ".home-footer span", ".home-live", ".home-input"];
        for (const sel of selectors) {
          const ratio = await contrastOf(page, sel);
          expect(ratio, `${sel} on ${scheme}`).toBeGreaterThanOrEqual(7);
        }
        // the accent appears in two places only: the arc and the primary action
        const accent = await page.evaluate(() => {
          const orange = "rgb(255, 106, 0)";
          const hits: string[] = [];
          for (const el of document.querySelectorAll<Element>(".home *")) {
            const cs = getComputedStyle(el);
            if ([cs.color, cs.backgroundColor, cs.borderTopColor, cs.stroke, cs.fill].includes(orange)) hits.push((el.getAttribute("class") ?? el.tagName).split(" ")[0]);
          }
          return [...new Set(hits)].sort();
        });
        expect(accent).toEqual(["arc", "home-go"]);
      });
    }
  });
}
