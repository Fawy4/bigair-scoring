import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createOrganiser } from "./organiser";
import { createLiveWorld } from "./live-world";
import { builtInSchemes } from "../src/lib/schemas/identification";
import type { BrowserContext } from "@playwright/test";

// Seat colours follow the event's own list (Red, Black, White), in the organiser's order. Throwaway organisations only; Arrow, EKL and Demo are never touched. One worker, no retries.
const base = builtInSchemes().find((s) => s.id === "vests-per-heat")!;
const rbw = { ...base, palette: ["red", "black", "white"].map((k) => base.palette.find((c) => c.key === k)!) };
const pad = (n: number) => String(n).padStart(2, "0");
const KNOCKOUT = {
  generator: { params: { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: "by_original_seed" } },
  timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 2, defaultBreakAfterRoundMin: 2 },
};

test("Draw page: a 12-rider division at 3 per heat shows RED, BLACK, WHITE with names in every Round 1 heat; a hand move takes the new seat's colour; the tag never covers the label", async ({ page }) => {
  test.setTimeout(300_000);
  const org = await createOrganiser();
  try {
    const { data: ev } = await org.db
      .from("events")
      .insert({ organisation_id: org.orgId, name: `E2E Seats ${org.run}`, slug: `e2e-sc-${org.run}`, status: "published", timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11", settings: { identification: { scheme: rbw, allowDivisionOverride: false } } as never })
      .select("id")
      .single();
    const { data: fmt } = await org.db.from("format_templates").select("id").is("organisation_id", null).eq("key", "heats4-top2-single-elim").order("version", { ascending: false }).limit(1).single();
    const { data: model } = await org.db.from("scoring_models").select("id").is("organisation_id", null).limit(1).single();
    const { data: div } = await org.db.from("divisions").insert({ event_id: ev!.id, name: "Pro Men", sort_order: 1, scoring_model_id: model!.id, format_template_id: fmt!.id, format_params: KNOCKOUT as never }).select("id").single();
    const { data: riders } = await org.db.from("riders").insert(Array.from({ length: 12 }, (_, i) => ({ organisation_id: org.orgId, first_name: `Rider${pad(i + 1)}`, last_name: "Test" }))).select("id, first_name");
    const sorted = riders!.sort((a, b) => a.first_name.localeCompare(b.first_name));
    await org.db.from("entries").insert(sorted.map((r, i) => ({ event_id: ev!.id, division_id: div!.id, rider_id: r.id, seed: i + 1, status: "confirmed", source: "manual" })));

    await page.setViewportSize({ width: 1440, height: 900 });
    await org.signIn(page, `/org/events/${ev!.id}/draw?division=${div!.id}`);
    await page.getByRole("button", { name: "Generate draw" }).click();
    await expect(page.getByTestId("heat-card").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("seat-colour-sentence")).toHaveText("Seat colours follow the event's list: Red, Black, White.");
    await expect(page.getByTestId("seat-colour-stale")).toHaveCount(0);

    const round1 = page.getByTestId("round-column").first();
    const heats = round1.getByTestId("heat-card");
    await expect(heats).toHaveCount(4);
    const words = async () => heats.evaluateAll((els) => els.map((h) => [...h.querySelectorAll('[data-testid="seat"]')].map((s) => ({ colour: s.querySelector('[data-testid="rider-label-text"]')?.textContent, name: s.querySelector('[data-testid="rider-label-name"]')?.textContent }))));
    for (const h of await words()) {
      expect(h.map((s) => s.colour)).toEqual(["RED", "BLACK", "WHITE"]);
      for (const s of h) expect(s.name).toMatch(/^Rider\d\d Test$/);
    }

    // a rider moved by hand wears the colour of the seat he lands in (tap the rider, then tap the seat)
    await heats.nth(0).getByTestId("seat").nth(0).getByRole("button").first().click();
    await heats.nth(1).getByTestId("seat").nth(2).getByRole("button").first().click();
    await page.getByRole("button", { name: /^(move here|swap with)/i }).first().click();
    await expect(round1.getByTestId("seat-by-hand").first()).toBeVisible({ timeout: 30_000 });
    for (const h of await words()) expect(h.map((s) => s.colour)).toEqual(["RED", "BLACK", "WHITE"]);
    // the tag sits under the label: it does not overlap the colour block or the name
    const seat = round1.locator('[data-testid="seat"]', { has: page.getByTestId("seat-by-hand") }).first();
    const tag = (await seat.getByTestId("seat-by-hand").boundingBox())!;
    for (const id of ["rider-label-primary", "rider-label-name"]) {
      const b = (await seat.getByTestId(id).boundingBox())!;
      expect(tag.y >= b.y + b.height - 1 || tag.x >= b.x + b.width - 1 || tag.x + tag.width <= b.x + 1, `tag clear of ${id}`).toBe(true);
    }
    // the stored heat seats (what the judge, spotter, head judge and public pages read) carry the same colours
    const { data: slots } = await org.db.from("heat_slots").select("position, vest_colour, heats!inner(division_id, round_id)").eq("heats.division_id", div!.id);
    expect(new Set((slots ?? []).map((s) => `${s.position}:${s.vest_colour}`)).size).toBeLessThanOrEqual(4);
    for (const s of slots ?? []) expect(["red", "black", "white"][s.position - 1]).toBe(s.vest_colour);
  } finally {
    await org.cleanup();
  }
});

test("a division with its own list uses its own, and the Draw page says so", async ({ page }) => {
  test.setTimeout(240_000);
  const org = await createOrganiser();
  try {
    const own = { ...base, palette: ["green", "orange", "pink"].map((k) => base.palette.find((c) => c.key === k)!) };
    const { data: ev } = await org.db
      .from("events")
      .insert({ organisation_id: org.orgId, name: `E2E Own ${org.run}`, slug: `e2e-so-${org.run}`, status: "published", timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11", settings: { identification: { scheme: rbw, allowDivisionOverride: true } } as never })
      .select("id")
      .single();
    const { data: fmt } = await org.db.from("format_templates").select("id").is("organisation_id", null).eq("key", "heats4-top2-single-elim").order("version", { ascending: false }).limit(1).single();
    const { data: model } = await org.db.from("scoring_models").select("id").is("organisation_id", null).limit(1).single();
    const { data: div } = await org.db.from("divisions").insert({ event_id: ev!.id, name: "Own List", sort_order: 1, scoring_model_id: model!.id, format_template_id: fmt!.id, format_params: KNOCKOUT as never, identification: { scheme: own } as never }).select("id").single();
    const { data: riders } = await org.db.from("riders").insert(Array.from({ length: 6 }, (_, i) => ({ organisation_id: org.orgId, first_name: `Rider${pad(i + 1)}`, last_name: "Test" }))).select("id, first_name");
    await org.db.from("entries").insert(riders!.map((r, i) => ({ event_id: ev!.id, division_id: div!.id, rider_id: r.id, seed: i + 1, status: "confirmed", source: "manual" })));
    await org.signIn(page, `/org/events/${ev!.id}/draw?division=${div!.id}`);
    await page.getByRole("button", { name: "Generate draw" }).click();
    await expect(page.getByTestId("heat-card").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("seat-colour-sentence")).toHaveText("Seat colours follow this division's own list: Green, Orange, Pink.");
    const first = page.getByTestId("round-column").first().getByTestId("heat-card").first();
    await expect(first.getByTestId("rider-label-text")).toHaveText(["GREEN", "ORANGE", "PINK"]);
  } finally {
    await org.cleanup();
  }
});

test("the judge's phone shows the same colour words and names in a heat of three", async ({ browser }) => {
  test.setTimeout(240_000);
  const w = await createLiveWorld();
  const contexts: BrowserContext[] = [];
  try {
    await w.db.from("events").update({ settings: { publicLiveScores: "live", maxRunningHeats: 1, flags: { enabled: false }, identification: { scheme: rbw, allowDivisionOverride: false } } as never }).eq("id", w.eventId);
    await w.db.from("heat_slots").delete().eq("heat_id", w.heats[0]).eq("position", 4);
    for (const [i, c] of ["red", "black", "white"].entries()) await w.db.from("heat_slots").update({ vest_colour: c }).eq("heat_id", w.heats[0]).eq("position", i + 1);
    await w.startHeat(w.heats[0]);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    contexts.push(context);
    await installSupabaseProxy(context);
    const phone = await context.newPage();
    await w.signInAs(phone, "j1", `/judge/${w.eventId}`);
    await expect(phone.getByTestId("all-scored")).toBeVisible({ timeout: 30_000 });
    await phone.getByRole("button", { name: /rider sheet/i }).click();
    const tiles = phone.getByRole("group", { name: "Riders" }).getByRole("button");
    await expect(tiles).toHaveCount(3, { timeout: 30_000 });
    await expect(tiles.nth(0)).toContainText(/RED\s*Sam Rivera/);
    await expect(tiles.nth(1)).toContainText(/BLACK\s*Noor Haddad/);
    await expect(tiles.nth(2)).toContainText(/WHITE\s*Lena Vogt/);
    await expect(phone.getByText(/YELLOW|BLUE|NOT SET/)).toHaveCount(0);
  } finally {
    await closePhones(contexts);
    await w.cleanup();
  }
});
