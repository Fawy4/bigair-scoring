import path from "node:path";
import { expect, test } from "./base";
import { createOrganiser } from "./organiser";
import { builtInSchemes } from "../src/lib/schemas/identification";

/**
 * The manual's pictures of the event's Lycra colour list and of the Draw page's seats (retaken with `npm run manual:shots`). A throwaway organisation; Arrow, EKL and Demo are
 * never touched. Runs only when MANUAL_SHOTS=1.
 */
test.skip(process.env.MANUAL_SHOTS !== "1", "set MANUAL_SHOTS=1 (npm run manual:shots) to retake the manual's pictures");
const OUT = path.join(process.cwd(), "docs", "manual", "img");
const hideDevOverlay = (page: import("@playwright/test").Page) => page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);
const base = builtInSchemes().find((s) => s.id === "vests-per-heat")!;
const rbw = { ...base, palette: ["red", "black", "white"].map((k) => base.palette.find((c) => c.key === k)!) };

test("the Rider identification card with Red, Black, White, and the Draw page's seats", async ({ page }) => {
  test.setTimeout(300_000);
  const org = await createOrganiser();
  try {
    const { data: ev } = await org.db
      .from("events")
      .insert({ organisation_id: org.orgId, name: `Manual Seats ${org.run}`, slug: `man-sc-${org.run}`, status: "published", timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11", settings: { identification: { scheme: rbw, basedOn: "vests-per-heat", allowDivisionOverride: false } } as never })
      .select("id")
      .single();
    const { data: fmt } = await org.db.from("format_templates").select("id").is("organisation_id", null).eq("key", "heats4-top2-single-elim").order("version", { ascending: false }).limit(1).single();
    const { data: model } = await org.db.from("scoring_models").select("id").is("organisation_id", null).limit(1).single();
    const params = { generator: { params: { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: "by_original_seed" } } };
    const { data: div } = await org.db.from("divisions").insert({ event_id: ev!.id, name: "Big Air Open", sort_order: 1, scoring_model_id: model!.id, format_template_id: fmt!.id, format_params: params as never }).select("id").single();
    const names = ["Robert Ghitulescu", "Omar Hassan", "Lena Vogt", "Noor Haddad", "Sam Rivera", "Mia Costa", "Tariq Boulos", "Ana Silva", "Yara Nabil", "Karim Adel", "Julia Berg", "Ali Samir"];
    const { data: riders } = await org.db.from("riders").insert(names.map((n) => ({ organisation_id: org.orgId, first_name: n.split(" ")[0], last_name: n.split(" ")[1] }))).select("id, first_name");
    await org.db.from("entries").insert(names.map((n, i) => ({ event_id: ev!.id, division_id: div!.id, rider_id: riders!.find((r) => r.first_name === n.split(" ")[0])!.id, seed: i + 1, status: "confirmed", source: "manual" })));

    await page.setViewportSize({ width: 1280, height: 1700 });
    await org.signIn(page, `/org/events/${ev!.id}/event`);
    await expect(page.getByRole("button", { name: /more settings/ })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: /more settings/ }).click();
    const vest = page.locator("#ident-vest");
    await expect(vest).toBeVisible({ timeout: 30_000 });
    await hideDevOverlay(page);
    await vest.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const card = page.getByText("Rider identification", { exact: true }).first().locator("xpath=ancestor::*[.//input[@type='color']][1]");
    await card.screenshot({ path: path.join(OUT, "org-event-lycra-colours-1280.png") });

    await page.goto(`/org/events/${ev!.id}/draw?division=${div!.id}`);
    await page.getByRole("button", { name: "Generate draw" }).click();
    await expect(page.getByTestId("heat-card").first()).toBeVisible({ timeout: 60_000 });
    // one heat changed by hand, so the tag under the seat is in the picture
    await page.getByTestId("heat-card").nth(0).getByTestId("seat").nth(0).getByRole("button").first().click();
    await page.getByTestId("heat-card").nth(1).getByTestId("seat").nth(2).getByRole("button").first().click();
    await page.getByRole("button", { name: /^(move here|swap with)/i }).first().click();
    await expect(page.getByTestId("seat-by-hand").first()).toBeVisible({ timeout: 30_000 });
    await hideDevOverlay(page);
    await page.waitForTimeout(500);
    const col0 = page.getByTestId("round-column").first();
    await page.setViewportSize({ width: 1280, height: 1500 });
    await col0.scrollIntoViewIfNeeded();
    await col0.screenshot({ path: path.join(OUT, "org-draw-seat-colours-1280.png") });
  } finally {
    await org.cleanup();
  }
});
