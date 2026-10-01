import { readFileSync } from "node:fs";
import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

const file = JSON.parse(readFileSync("presets/identification/schemes.json", "utf8")) as { palette: unknown; schemes: Array<{ id: string }> };
const scheme = (id: string) => ({ ...file.schemes.find((s) => s.id === id)!, palette: file.palette });

test("each division can use the event's identification (default) or its own scheme; the Riders step follows the division's effective scheme", async ({ page }) => {
  test.setTimeout(180_000);
  const org = await createOrganiser();
  try {
    const { data: ev } = await org.db
      .from("events")
      .insert({ organisation_id: org.orgId, name: `Ident Cup ${org.run}`, slug: `e2e-ident-${org.run}`, status: "draft", settings: { identification: { scheme: scheme("name-callout"), basedOn: "name-callout", allowDivisionOverride: false } } })
      .select("id")
      .single();
    const ids: Record<string, string> = {};
    for (const [i, n] of ["Pro Men", "Pro Women"].entries()) ids[n] = (await org.db.from("divisions").insert({ event_id: ev!.id, name: n, sort_order: i + 1 }).select("id").single()).data!.id;
    for (const n of ["Pro Men", "Pro Women"]) {
      const { data: r } = await org.db.from("riders").insert({ organisation_id: org.orgId, first_name: n.split(" ")[1], last_name: "Rider", email: `${n.replace(" ", "")}-${org.run}@example.com` }).select("id").single();
      await org.db.from("entries").insert({ division_id: ids[n], rider_id: r!.id, seed: 1, status: "confirmed", source: "manual" });
    }
    await org.signIn(page, `/org/events/${ev!.id}/divisions`);

    // the event's switch is off: the division says so and offers no choice
    // the first division is open when the page loads
    await page.getByRole("tab", { name: "Rider label" }).click();
    await expect(page.getByTestId("division-identification")).toContainText("The event uses: Name call-out");
    await expect(page.getByTestId("division-identification")).toContainText("does not allow a different scheme per division");
    await expect(page.getByRole("radio", { name: "This division has its own" })).toHaveCount(0);

    // switch the event's setting on (what the Event step's tick box saves)
    await org.db.from("events").update({ settings: { identification: { scheme: scheme("name-callout"), basedOn: "name-callout", allowDivisionOverride: true } } }).eq("id", ev!.id);
    await page.reload();
    // the first division is open when the page loads
    await page.getByRole("tab", { name: "Rider label" }).click();
    await expect(page.getByRole("radio", { name: "Use the event’s identification" })).toBeChecked();

    // own scheme: bib numbers, with an edited palette name
    await page.getByRole("radio", { name: "This division has its own" }).check();
    await page.getByTestId("advanced-toggle").click(); // the editor is behind "More settings"
    await page.locator("#ident-preset").selectOption({ label: "Bib / sail numbers" });
    await page.getByRole("button", { name: "Save this division’s Rider label" }).click();
    await expect.poll(async () => (await org.db.from("divisions").select("identification").eq("id", ids["Pro Men"]).single()).data?.identification).toMatchObject({ scheme: { id: "bib-numbers", primary: "bib_number" } });
    expect((await org.db.from("divisions").select("identification").eq("id", ids["Pro Women"]).single()).data?.identification).toBeNull();

    // the Riders step uses each division's effective scheme
    await page.goto(`/org/events/${ev!.id}/riders?division=${ids["Pro Men"]}`);
    await expect(page.getByTestId("scheme-line")).toContainText("Bib / sail numbers");
    await expect(page.getByTestId("scheme-line")).toContainText("this division’s own");
    await expect(page.getByRole("columnheader", { name: "Bib", exact: true })).toBeVisible();
    await page.goto(`/org/events/${ev!.id}/riders?division=${ids["Pro Women"]}`);
    await expect(page.getByTestId("scheme-line")).toContainText("Name call-out");
    await expect(page.getByTestId("scheme-line")).toContainText("the event’s");
    await expect(page.getByRole("columnheader", { name: "Bib", exact: true })).toHaveCount(0);

    // and back to the event's identification
    await page.goto(`/org/events/${ev!.id}/divisions`);
    // the first division is open when the page loads
    await page.getByRole("tab", { name: "Rider label" }).click();
    await page.getByRole("radio", { name: "Use the event’s identification" }).check();
    await page.getByTestId("division-identification-save").click();
    await expect.poll(async () => (await org.db.from("divisions").select("identification").eq("id", ids["Pro Men"]).single()).data?.identification).toBeNull();
  } finally {
    await org.cleanup();
  }
});

test("the Event step's 'Will riders wear coloured lycras?' picks Name call-out for No", async ({ page }) => {
  const org = await createOrganiser();
  try {
    await org.signIn(page, "/org/events/new");
    await expect(page.getByRole("radio", { name: /No/ }).first()).toBeChecked();
    await page.getByTestId("advanced-toggle").click();
    await expect(page.locator("#ident-preset")).toHaveValue("name-callout");
  } finally {
    await org.cleanup();
  }
});
