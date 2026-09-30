import type { Page } from "@playwright/test";
import { test, expect, installSupabaseProxy } from "./base";
import { createOrganiser } from "./organiser";

// The owner's "done means" walk-through for Phase 4a-2, on a throwaway organisation (never Arrow, EKL or Demo).
const csv24 = ["First,Last,Nationality,Email,Seed", ...Array.from({ length: 24 }, (_, i) => `Rider${String(i + 1).padStart(2, "0")},Test,EG,r${i + 1}@example.com,${i + 1}`)].join("\n");

async function addSeat(page: Page, name: string, role: string) {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Role", { exact: true }).selectOption({ label: role });
  await page.getByTestId("add-seat").click();
  await expect(page.getByTestId("pin-box")).toBeVisible();
  const pin = (await page.getByTestId("pin-digits").innerText()).trim();
  expect(pin).toMatch(/^\d{6}$/);
  await page.getByTestId("pin-box-close").click();
  return pin;
}

test("acceptance: 24-rider CSV, every Rider label, drag and tap seeds, phone registration and approval, 5 officials with PINs, cards, regenerate, panels, local trick block, a Note and the export", async ({ page, browser }) => {
  test.setTimeout(600_000);
  const owner = await createOrganiser({ platformAdmin: "owner" });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await installSupabaseProxy(phone);
    const slug = `e2e-acc-${owner.run}`;
    const { data: model } = await owner.db.from("scoring_models").insert({ organisation_id: owner.orgId, key: `e2e-acc-${owner.run}`, name: "Three judges", version: 1, json: { panel: { minJudges: 3, maxJudges: 5 } }, content_hash: "x" }).select("id").single();
    const { data: ev } = await owner.db.from("events").insert({ organisation_id: owner.orgId, name: `Acceptance Cup ${owner.run}`, slug, status: "published", start_date: "2026-10-10", end_date: "2026-10-11", settings: { registrationOpen: true } }).select("id").single();
    const { data: div } = await owner.db.from("divisions").insert({ event_id: ev!.id, name: "Pro Men", sort_order: 1, scoring_model_id: model!.id, description: "Advanced riders" }).select("id").single();
    const eventId = ev!.id;

    // 1. paste a 24-rider CSV into Pro Men and see every Rider label
    await owner.signIn(page, `/org/events/${eventId}/riders?division=${div!.id}`);
    await page.getByLabel("Paste the rows here").fill(csv24);
    await page.getByTestId("csv-preview").click();
    await expect(page.getByTestId("csv-summary")).toContainText("24 riders ready to import, 0 rows with a problem");
    await page.getByTestId("csv-import").click();
    await expect(page.getByTestId("rider-row")).toHaveCount(24);
    await expect(page.getByTestId("rider-label-cell")).toHaveCount(24);
    await expect(page.getByTestId("rider-label-cell").nth(23)).toContainText("Rider24 Test");

    // 2. reorder seeds by drag and by tap
    const first = async () => (await page.getByTestId("rider-row").first().getByLabel(/^First name/).inputValue());
    await page.getByRole("button", { name: "Move Rider03 Test up" }).click();
    await expect.poll(async () => (await owner.db.from("entries").select("seed, riders(first_name)").eq("division_id", div!.id).eq("seed", 2).single()).data?.riders).toMatchObject({ first_name: "Rider03" });
    const handle = page.getByRole("button", { name: /^Drag .* to a new place$/ }).first();
    const target = page.getByTestId("rider-row").nth(2);
    const hb = (await handle.boundingBox())!;
    const tb = (await target.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 10, { steps: 4 });
    await page.mouse.move(tb.x + 20, tb.y + tb.height / 2 + 10, { steps: 12 });
    await page.mouse.up();
    await expect.poll(first).not.toBe("Rider01");

    // 3. register a rider from the phone on the public page, then approve
    const p = await phone.newPage();
    await p.goto(`/e/${slug}/register`);
    await p.getByRole("radio", { name: /Pro Men/ }).check();
    await p.getByLabel("First name", { exact: true }).fill("Phoebe");
    await p.getByLabel("Last name", { exact: true }).fill("Phone");
    await p.getByLabel("Email", { exact: true }).fill(`phoebe-${owner.run}@example.com`);
    await p.getByRole("checkbox").check();
    await p.getByTestId("registration-submit").click();
    await expect(p.getByText("Registered — awaiting confirmation")).toBeVisible();
    await page.reload();
    await page.getByTestId("registration").filter({ hasText: "Phoebe Phone" }).getByRole("button", { name: "Approve" }).click();
    await expect(page.getByTestId("rider-row")).toHaveCount(25);

    // 4. five officials, each PIN seen at creation; print the cards; regenerate one PIN
    await page.goto(`/org/events/${eventId}/officials`);
    const pins: Record<string, string> = {};
    for (const [name, role] of [["Judge 1", "Judge"], ["Judge 2", "Judge"], ["Judge 3", "Judge"], ["Head Judge", "Head judge"], ["Spotter 1", "Spotter"]] as const) pins[name] = await addSeat(page, name, role);
    const [cards] = await Promise.all([page.waitForEvent("popup"), page.getByTestId("print-cards").click()]);
    await expect(cards.getByTestId("card")).toHaveCount(5);
    for (const [name, pin] of Object.entries(pins)) await expect(cards.getByTestId("card").filter({ hasText: name }).getByTestId("card-pin")).toHaveText(pin);
    await cards.close();
    const judge2 = page.locator('[data-testid=seat-card][data-seat-name="Judge 2"]');
    await judge2.getByRole("button", { name: "Regenerate PIN" }).click();
    await judge2.getByRole("button", { name: "Yes, regenerate" }).click();
    await expect(page.getByTestId("pin-box")).toBeVisible();
    expect((await page.getByTestId("pin-digits").innerText()).trim()).not.toBe(pins["Judge 2"]);
    await page.getByTestId("pin-box-close").click();

    // 5. assign the judges to Pro Men: the "needs 3 judges" check turns green
    await expect(page.getByTestId("panel-warnings")).toContainText("Pro Men needs 3 judges, 1 assigned"); // the head judge who also scores is already on the panel
    await page.getByLabel("Judge 1: Pro Men").check();
    await expect(page.getByTestId("panel-warnings")).toContainText("Pro Men needs 3 judges, 2 assigned");
    await page.getByLabel("Judge 2: Pro Men").check();
    await expect(page.getByTestId("panel-ok")).toBeVisible();

    // 6. add a local trick block
    await page.goto(`/org/events/${eventId}/divisions`);
    await page.getByRole("tab", { name: "Trick base" }).click();
    await page.getByTestId("add-block").click();
    await page.getByLabel("Family", { exact: true }).selectOption({ label: "Base trick" });
    await page.getByLabel("Name of the block").fill("Sloth roll");
    await page.getByRole("button", { name: "Add block", exact: true }).click();
    await expect(page.getByTestId("block-base:local_sloth_roll")).toBeChecked();

    // 7. leave a Note from the Riders step, then export
    await page.goto(`/org/events/${eventId}/riders?division=${div!.id}`);
    await page.getByTestId("note-button").click();
    await page.getByLabel("What did you notice?").fill("Seed column too narrow on the phone");
    await page.getByLabel("Kind of note").selectOption({ label: "Layout" });
    await page.getByTestId("note-send").click();
    await expect(page.getByTestId("note-saved")).toBeVisible();
    await page.goto("/admin/feedback");
    await page.getByTestId("export-button").click();
    await expect(page.getByTestId("export-text")).toHaveValue(new RegExp(`\\[Riders step · Acceptance Cup ${owner.run} · Pro Men · owner\\] "Seed column too narrow on the phone"`));
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-download").click()]);
    expect(download.suggestedFilename()).toBe("FEEDBACK.md");
  } finally {
    await phone.close();
    await owner.cleanup();
  }
});
