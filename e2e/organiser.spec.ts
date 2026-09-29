import { test, expect } from "./base";
import { createOrganiser, PNG } from "./organiser";

// Needs Supabase keys in the environment and the Phase 4a-1 migration. Creates and removes its own organiser and organisation.
type Organiser = Awaited<ReturnType<typeof createOrganiser>>;
let org: Organiser;

test.beforeAll(async () => {
  org = await createOrganiser();
});
test.afterAll(async () => {
  await org?.cleanup();
});

test("organiser: settings, then the Event step", async ({ page }) => {
  test.setTimeout(180_000);
  await org.signIn(page, "/org/settings");
  await expect(page.getByRole("heading", { name: "Organisation settings" })).toBeVisible();

  // Settings: rename, new slug (with the warning), logo, time zone
  await page.getByLabel("Organisation name").fill(`Arrow ${org.run}`);
  await page.getByLabel("Web address (slug)").fill(`arrow-${org.run}`);
  await expect(page.getByText("Changing the web address changes your public links")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled(); // needs the confirmation first
  await page.getByLabel("I understand, change the address").check();
  await page.getByLabel("Organisation logo: choose an image file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByAltText("Organisation logo (current)")).toBeVisible();
  await page.getByLabel("Default time zone for new events").selectOption("Europe/Berlin");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Organisation settings saved").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Organisation name")).toHaveValue(`Arrow ${org.run}`);
  await expect(page.getByLabel("Web address (slug)")).toHaveValue(`arrow-${org.run}`);
  await expect(page.getByLabel("Default time zone for new events")).toHaveValue("Europe/Berlin");
  await expect(page.getByAltText("Organisation logo (current)")).toBeVisible();

  // a wrong file is refused in plain words and nothing is uploaded
  await page.getByLabel("Organisation logo: choose an image file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByRole("alert").filter({ hasText: "PNG, JPEG or WebP" })).toBeVisible();

  // Event step: the time zone is pre-filled from the organisation
  await page.goto("/org/events/new");
  await expect(page.getByLabel("Time zone", { exact: true })).toHaveValue("Europe/Berlin");
  await page.getByLabel("Event name").fill(`Arrow Big Air ${org.run}`);
  await expect(page.getByLabel("Web address (slug)")).toHaveValue(`arrow-big-air-${org.run}`);
  await page.getByLabel("Location").fill("El Gouna, Egypt");
  await page.getByLabel("First day").fill("2026-10-02");
  await page.getByLabel("Last day").fill("2026-10-04");
  await page.getByLabel("Time zone", { exact: true }).selectOption("Africa/Cairo");
  await page.getByLabel("Event logo: choose an image file").setInputFiles({ name: "event.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByAltText("Event logo (current)")).toBeVisible();
  await page.getByRole("button", { name: "+ Add sponsor" }).click();
  await page.getByLabel("Sponsor 1 name").fill("WOO");

  // identification: pick a preset and edit it, live preview of a rider chip
  await expect(page.getByTestId("rider-chip-primary")).toContainText("RED");
  await page.getByLabel("Start from a preset").selectOption({ label: "Bib / sail numbers" });
  await expect(page.getByTestId("rider-chip-primary")).toHaveText("14");
  await page.getByLabel("Start from a preset").selectOption({ label: "Coloured vests / lycras assigned per heat (DEFAULT)" });
  await page.getByLabel("Name of colour 1", { exact: true }).fill("Scarlet");
  await expect(page.getByTestId("rider-chip-primary")).toContainText("SCARLET");
  await page.getByLabel("Save this scheme as a preset").fill(`Arrow vests ${org.run}`);
  await page.getByRole("button", { name: "Save as preset" }).click();
  await expect(page.getByText(`Preset “Arrow vests ${org.run}” saved`).first()).toBeVisible();

  await page.getByLabel("Registration is open").check();
  await page.getByLabel("Published: the event is listed").check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/org\/events\/[0-9a-f-]{36}\/event$/);
  await expect(page.getByLabel("Event name")).toHaveValue(`Arrow Big Air ${org.run}`);
  await expect(page.getByLabel("Sponsor 1 name")).toHaveValue("WOO");
  await expect(page.getByTestId("rider-chip-primary")).toContainText("SCARLET");
  await expect(page.getByLabel("Registration is open")).toBeChecked();
  await expect(page.getByTestId("event-code")).toHaveText(`arrow-big-air-${org.run}`);
  await expect(page.getByRole("navigation", { name: "Organiser" })).toBeVisible();

  // the published event appears on the public home page and links to its join page
  await page.goto("/");
  const link = page.getByRole("link", { name: new RegExp(`Arrow Big Air ${org.run}`) });
  await expect(link).toHaveAttribute("href", `/e/arrow-big-air-${org.run}/join`);
});
