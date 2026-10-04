import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

// Polish 4, items 1, 2 and 4: the organisation's own presets (rename, delete, update from a division), hiding built-ins, and the Load… menu staying on screen.
// A throwaway organisation with its own event; no built-in preset is changed.
test("rename, delete (refused when in use), update from a division, hide and show hidden, and a Load… menu that opens fully on screen", async ({ page }) => {
  test.setTimeout(240_000);
  const org = await createOrganiser();
  try {
    const { data: base } = await org.db.from("scoring_models").select("json").is("organisation_id", null).eq("key", "overall-impression").order("version", { ascending: false }).limit(1).single();
    const mine = (key: string, name: string) => ({ organisation_id: org.orgId, key, name, version: 1, json: { ...(base!.json as object), id: key, name, version: 1 }, content_hash: key });
    const a = (await org.db.from("scoring_models").insert(mine(`e2e-${org.run}-a`, "Club A")).select("id").single()).data!.id;
    await org.db.from("scoring_models").insert(mine(`e2e-${org.run}-b`, "Club B"));
    const { data: ev } = await org.db.from("events").insert({ organisation_id: org.orgId, name: "Preset Cup", slug: `e2e-pm-${org.run}`, status: "draft" }).select("id").single();
    const names = ["Pro Men", "Pro Women", "Juniors", "Masters", "Kids", "Open", "Seniors", "Girls", "Boys", "Veterans", "Rookies", "Twintip", "Foil", "Last one"];
    const ids: string[] = [];
    for (const [i, n] of names.entries()) ids.push((await org.db.from("divisions").insert({ event_id: ev!.id, name: n, sort_order: i + 1, ...(i < 2 ? { scoring_model_id: a } : {}) }).select("id").single()).data!.id);
    // Pro Men uses Club A with one changed number; Pro Women loaded Club A as it is
    await org.db.from("divisions").update({ scoring_overrides: { heat: { maxAttemptsPerRider: 4 } } }).eq("id", ids[0]);

    await org.signIn(page, `/org/events/${ev!.id}/divisions`);
    const panel = page.getByTestId("scoring-panel");
    const menu = () => panel.getByTestId("load-menu");
    const open = async () => {
      if (!(await menu().getByRole("menu").isVisible())) await menu().getByRole("button", { name: "Load…" }).click();
    };

    // ---- rename: the new name is in the menu and in the database
    await open();
    await expect(menu().getByRole("menuitem", { name: "Club B" })).toBeVisible();
    await menu().getByRole("button", { name: "Manage Club B" }).click();
    await menu().getByRole("button", { name: "Rename", exact: true }).click();
    await menu().getByLabel("New name").fill("Club B renamed");
    await menu().getByRole("button", { name: "Save name" }).click();
    await expect(menu().getByRole("menuitem", { name: "Club B renamed" })).toBeVisible();
    expect((await org.db.from("scoring_models").select("name").eq("key", `e2e-${org.run}-b`).single()).data?.name).toBe("Club B renamed");

    // ---- delete is refused while a division uses the preset: it names the division, with a Learn more link
    await menu().getByRole("button", { name: "Manage Club A" }).click();
    await menu().getByRole("button", { name: "Delete", exact: true }).click();
    await menu().getByRole("button", { name: "Yes, delete" }).click();
    await expect(menu().getByTestId("preset-note")).toContainText("used by Pro Men in Preset Cup");
    await expect(menu().getByTestId("preset-note").getByTestId("learn-more")).toBeVisible();
    expect((await org.db.from("scoring_models").select("id").eq("key", `e2e-${org.run}-a`)).data).toHaveLength(1);

    // ---- delete is allowed when no division uses it
    await menu().getByRole("button", { name: "Manage Club B renamed" }).click();
    await menu().getByRole("button", { name: "Delete", exact: true }).click();
    await menu().getByRole("button", { name: "Yes, delete" }).click();
    await expect(menu().getByRole("menuitem", { name: "Club B renamed" })).toHaveCount(0);
    expect((await org.db.from("scoring_models").select("id").eq("key", `e2e-${org.run}-b`)).data).toHaveLength(0);

    // ---- update from this division: the preset gets the division's settings as its next version; the division that loaded version 1 keeps it
    await menu().getByRole("button", { name: "Manage Club A" }).click();
    await menu().getByRole("button", { name: "Update preset from this division" }).click();
    await menu().getByLabel("Reason (optional)").fill("after the trial heats");
    await menu().getByRole("button", { name: "Yes, update the preset" }).click();
    await expect(menu().getByTestId("preset-note")).toContainText("now has this division’s settings (version 2)");
    const rows = (await org.db.from("scoring_models").select("id, version, json").eq("key", `e2e-${org.run}-a`).order("version")).data!;
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
    expect((rows[1].json as { heat: { maxAttemptsPerRider: number } }).heat.maxAttemptsPerRider).toBe(4);
    expect(rows[0].id).toBe(a);
    expect((rows[0].json as { heat: { maxAttemptsPerRider?: number } }).heat.maxAttemptsPerRider).not.toBe(4); // version 1 as it was
    const after = (await org.db.from("divisions").select("name, scoring_model_id").in("id", [ids[0], ids[1]]).order("sort_order")).data!;
    expect(after[0].scoring_model_id).toBe(rows[1].id); // Pro Men now uses version 2
    expect(after[1].scoring_model_id).toBe(a); // Pro Women is unchanged
    const logged = (await org.db.from("audit_log").select("reason").eq("organisation_id", org.orgId).eq("action", "preset_updated_from_division")).data!;
    expect(logged.map((l) => l.reason)).toEqual(["after the trial heats"]);

    // ---- hide a built-in: gone from this menu; Show hidden brings it back; the DEFAULT cannot be hidden
    const club = "Club quick: single score per trick, best 2 count";
    await expect(menu().getByRole("menuitem", { name: club })).toBeVisible();
    await menu().getByRole("button", { name: `Manage ${club}` }).click();
    await menu().getByRole("button", { name: "Hide", exact: true }).click();
    await expect(menu().getByRole("menuitem", { name: club })).toHaveCount(0);
    await expect(menu().getByRole("menuitem", { name: "Show hidden (1)" })).toBeVisible();
    await page.reload();
    await page.getByTestId("scoring-panel").getByTestId("load-menu").getByRole("button", { name: "Load…" }).click();
    await expect(menu().getByRole("menuitem", { name: club })).toHaveCount(0); // remembered
    await menu().getByRole("menuitem", { name: "Show hidden (1)" }).click();
    await expect(menu().getByRole("menuitem", { name: club })).toBeVisible();
    await menu().getByRole("button", { name: `Manage ${club}` }).click();
    await menu().getByRole("button", { name: "Show", exact: true }).click();
    await expect(menu().getByRole("menuitem", { name: "Show hidden (1)" })).toHaveCount(0);
    await expect(menu().getByRole("menuitem", { name: club })).toBeVisible();
    const kota = "KOTA-style: best 3 tricks + impression (DEFAULT)";
    await menu().getByRole("button", { name: `Manage ${kota}` }).click();
    await expect(menu().getByRole("button", { name: "Hide", exact: true })).toHaveCount(0);
    await expect(menu().getByTestId(`preset-actions-scoring_model-kota-best3-impression`)).toContainText("DEFAULT");
    await page.keyboard.press("Escape");

    // ---- the menu opens fully on screen when the button is near the bottom of the screen (last division, page scrolled)
    page.setDefaultTimeout(15_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "Close" }).first().click();
    await page.locator("ol > li").last().locator("button[aria-expanded]").last().click();
    const last = page.getByTestId("scoring-panel");
    await expect(last).toBeVisible();
    const button = last.getByTestId("load-menu").getByRole("button", { name: "Load…" });
    await button.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const b = [...document.querySelectorAll<HTMLElement>('[data-testid="load-menu"] button')].find((x) => x.textContent?.includes("Load…"))!;
      window.scrollBy(0, b.getBoundingClientRect().top - (window.innerHeight - 90));
    });
    const box = (await button.boundingBox())!;
    expect(box.y).toBeGreaterThan(900 - 150);
    await button.click();
    const panelEl = last.getByTestId("load-menu").getByRole("menu");
    await expect(panelEl).toHaveAttribute("data-placement", "up");
    const items = last.getByTestId("load-menu").getByRole("menuitem");
    const count = await items.count();
    expect(count).toBeGreaterThan(8);
    for (let i = 0; i < count; i++) {
      const b = (await items.nth(i).boundingBox())!;
      expect(b.y, `entry ${i} top`).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height, `entry ${i} bottom`).toBeLessThanOrEqual(900);
      expect(b.x, `entry ${i} left`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `entry ${i} right`).toBeLessThanOrEqual(1280);
    }
    // and nothing paints over the last entry (it is not clipped by a parent)
    const covered = await page.evaluate(() => {
      const els = [...document.querySelectorAll<HTMLElement>('[data-testid="load-menu"] [role="menuitem"]')];
      return els.filter((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return !hit || !el.contains(hit);
      }).length;
    });
    expect(covered).toBe(0);
  } finally {
    await org.cleanup();
  }
});
