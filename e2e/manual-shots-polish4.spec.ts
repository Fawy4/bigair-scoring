import path from "node:path";
import { expect, test } from "./base";
import { createOrganiser } from "./organiser";
import { createLiveWorld, type LiveWorld } from "./live-world";

/**
 * Polish 4's manual pictures, retaken with `npm run manual:shots`: the Load… menu with a preset's actions, the Presets card of the organisation settings, the
 * owner's Master presets list and form, and the home page (live, many and nothing public; light and dark; laptop and phone). Throwaway organisations only; Arrow,
 * EKL and Demo are never touched. The hosted project always lists other public events, so the home page pictures keep only the throwaway ones, and the "nothing
 * public" picture is the same page with its lists taken out (the page's own empty-state markup and words).
 * Runs only when MANUAL_SHOTS=1.
 */
test.skip(process.env.MANUAL_SHOTS !== "1", "set MANUAL_SHOTS=1 (npm run manual:shots) to retake the manual's pictures");
const OUT = path.join(process.cwd(), "docs", "manual", "img");
const hideDevOverlay = (page: import("@playwright/test").Page) => page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);

test("the organiser's pictures: the Load… menu with a preset's actions, and the Presets card", async ({ page }) => {
  test.setTimeout(240_000);
  const org = await createOrganiser();
  try {
    const { data: base } = await org.db.from("scoring_models").select("json").is("organisation_id", null).eq("key", "overall-impression").order("version", { ascending: false }).limit(1).single();
    const mk = (n: string, name: string) => ({ organisation_id: org.orgId, key: `shot-${org.run}-${n}`, name, version: 1, json: { ...(base!.json as object), id: `shot-${org.run}-${n}`, name, version: 1 }, content_hash: n });
    await org.db.from("scoring_models").insert([mk("a", "Club evening heats"), mk("b", "Kids best 2")]);
    const { data: ev } = await org.db.from("events").insert({ organisation_id: org.orgId, name: "Preset Cup", slug: `shot-pm-${org.run}`, status: "draft" }).select("id").single();
    await org.db.from("divisions").insert({ event_id: ev!.id, name: "Pro Men", sort_order: 1 });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await org.signIn(page, `/org/events/${ev!.id}/divisions`);
    const panel = page.getByTestId("scoring-panel");
    await panel.getByRole("button", { name: "Load…" }).click();
    await page.getByRole("button", { name: "Manage Club evening heats" }).click();
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    await hideDevOverlay(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "org-presets-menu-1280.png") });

    await page.goto("/org/settings");
    const card = page.getByTestId("presets-card");
    await expect(card).toBeVisible({ timeout: 60_000 });
    await card.getByRole("button", { name: "Manage Kids best 2" }).click();
    await hideDevOverlay(page);
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await card.screenshot({ path: path.join(OUT, "org-presets-card-1280.png") });
  } finally {
    await org.cleanup();
  }
});

test("the owner's pictures: the Master presets list and the form", async ({ page }) => {
  test.setTimeout(240_000);
  const owner = await createOrganiser({ platformAdmin: "owner" });
  try {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await owner.signIn(page, "/admin/presets");
    await expect(page.getByTestId("add-scoring_model")).toBeVisible({ timeout: 60_000 });
    await hideDevOverlay(page);
    await page.screenshot({ path: path.join(OUT, "admin-presets-1280.png") });
    await page.getByRole("link", { name: /^Edit KOTA-style/ }).first().click();
    await expect(page.getByTestId("scoring-panel")).toBeVisible({ timeout: 60_000 });
    await hideDevOverlay(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "admin-preset-form-1280.png") });
  } finally {
    await owner.cleanup();
  }
});

test.describe("the home page pictures", () => {
  let w: LiveWorld;
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    w = await createLiveWorld();
    await w.db.from("events").update({ status: "live" }).eq("id", w.eventId);
    await w.startHeat(w.heats[0]);
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    for (let i = 0; i < 5; i++) await w.db.from("events").insert({ organisation_id: w.orgId, timezone: "Africa/Cairo", name: `Open ${i + 1} ${w.org.run}`, slug: `shot-open-${i}-${w.org.run}`, status: "published", start_date: day(2 + i), end_date: day(3 + i) });
    for (let i = 0; i < 4; i++) await w.db.from("events").insert({ organisation_id: w.orgId, timezone: "Africa/Cairo", name: `Finished ${i + 1} ${w.org.run}`, slug: `shot-done-${i}-${w.org.run}`, status: "complete", start_date: day(-3 - i), end_date: day(-2 - i) });
  });
  test.afterAll(async () => {
    await w?.cleanup();
  });

  type State = "live" | "many" | "empty";
  const keepOnlyOurs = (state: State, run: string) => (page: import("@playwright/test").Page) =>
    page.evaluate(
      ([s, r, empty]) => {
        document.querySelectorAll<HTMLElement>('[data-testid$="-events"] > ul > li').forEach((li) => {
          const ours = li.textContent?.includes(r) ?? false;
          const live = li.querySelector('[data-status="live"]') !== null;
          if (!ours || (s === "live" && !live) || s === "empty") li.remove();
        });
        document.querySelectorAll<HTMLElement>('[data-testid$="-events"]').forEach((sec) => {
          if (!sec.querySelector("li")) sec.remove();
        });
        if (s === "empty") {
          const p = document.createElement("p");
          p.className = "home-empty";
          p.textContent = empty;
          document.querySelector(".home-hero")!.after(p);
        }
      },
      [state, run, "No public events right now"] as const,
    );

  for (const scheme of ["light", "dark"] as const) {
    for (const state of ["live", "many", "empty"] as const) {
      test(`home ${state} ${scheme} on a laptop`, async ({ browser }) => {
        test.setTimeout(120_000);
        const ctx = await browser.newContext({ viewport: { width: 1280, height: state === "many" ? 1500 : 900 }, colorScheme: scheme });
        const page = await ctx.newPage();
        await page.goto("/");
        await expect(page.getByTestId("landing-event").first()).toBeVisible({ timeout: 60_000 });
        await keepOnlyOurs(state, w.org.run)(page);
        await hideDevOverlay(page);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, `public-home-${state}-${scheme}-1280.png`), fullPage: true });
        await ctx.close();
      });
    }
    test(`home live ${scheme} on a phone`, async ({ browser }) => {
      test.setTimeout(120_000);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
      const page = await ctx.newPage();
      await page.goto("/");
      await expect(page.getByTestId("landing-event").first()).toBeVisible({ timeout: 60_000 });
      await keepOnlyOurs("live", w.org.run)(page);
      await hideDevOverlay(page);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `public-home-live-${scheme}-390.png`), fullPage: true });
      if (scheme === "light") await page.screenshot({ path: path.join(OUT, "public-home-390.png"), fullPage: true }); // the name the older pages use
      await ctx.close();
    });
  }
});
