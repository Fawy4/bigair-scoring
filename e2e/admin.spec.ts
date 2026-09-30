import { readFileSync } from "node:fs";
import { test, expect } from "./base";
import { createOrganiser, effectiveProductName } from "./organiser";

// Platform owner layer (/admin). Needs Supabase keys and the 4a-1c migration. Creates and removes its own logins and organisations.
type Organiser = Awaited<ReturnType<typeof createOrganiser>>;
let admin: Organiser;
let plain: Organiser;
const saved: Record<string, unknown> = {};

test.beforeAll(async () => {
  admin = await createOrganiser({ platformAdmin: "owner" });
  plain = await createOrganiser();
  const { data } = await admin.db.from("platform_settings").select("key, value");
  for (const r of data ?? []) saved[r.key] = r.value;
});
test.afterAll(async () => {
  // put the platform settings back exactly as they were: restore the old rows and remove the ones the tests added
  for (const [k, v] of Object.entries(saved)) await admin?.db.from("platform_settings").upsert({ key: k, value: v as never });
  const keep = Object.keys(saved);
  const { data: now } = await admin.db.from("platform_settings").select("key");
  for (const r of now ?? []) if (!keep.includes(r.key)) await admin.db.from("platform_settings").delete().eq("key", r.key);
  await admin?.cleanup();
  await plain?.cleanup();
});

test("a signed-out visitor is sent to the sign-in page", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/org\/login\?next=%2Fadmin/);
});

test("an organiser gets a plain 404 on every admin page and never sees the admin switch", async ({ page }) => {
  test.setTimeout(120_000); // a first visit to each page compiles it in dev mode
  await plain.signIn(page, "/org");
  await expect(page.getByRole("heading", { name: /events/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /admin$/ })).toHaveCount(0);
  for (const path of ["/admin", "/admin/settings", "/admin/presets", "/admin/audit", "/admin/health", "/admin/organisations/new"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByText("This page could not be found")).toBeVisible();
  }
});

test("the owner runs the platform: create, invite, rename, open as organiser, archive, delete", async ({ page }) => {
  test.setTimeout(240_000);
  const field = (label: string) => page.getByLabel(label, { exact: true });
  const slug = `e2e-new-${admin.run}`;
  admin.trackOrganisation(slug);

  await admin.signIn(page, "/admin");
  await expect(page.getByRole("heading", { name: "Organisations", exact: true })).toBeVisible();
  // the list shows the owner's own organisation with its columns
  const ownRow = page.getByRole("row").filter({ hasText: `E2E Big Air ${admin.run}` });
  await expect(ownRow).toContainText("Active");
  await expect(ownRow).toContainText("free");
  await expect(page.getByRole("columnheader", { name: "Events" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Last activity" })).toBeVisible();
  // the header switch is there for admins, and the organiser view names the organisation
  await expect(page.getByRole("link", { name: `Organiser view (E2E Big Air ${admin.run})` })).toBeVisible();

  // create
  await page.getByRole("link", { name: "Create organisation" }).click();
  await field("Organisation name").fill(`E2E New ${admin.run}`);
  await field("Web address (slug)").fill(slug);
  await field("Default time zone").selectOption("Europe/Berlin");
  await page.getByRole("button", { name: "Create organisation" }).click();
  await expect(page.getByRole("heading", { name: `E2E New ${admin.run}`, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/organisations\/[0-9a-f-]{36}/);

  // invite the first organiser without sending an email: a copyable link appears
  const invitee = `e2e-invitee-${admin.run}@example.com`;
  await field("Organiser's email").fill(invitee);
  await field("Send the sign-in email now").uncheck();
  await page.getByRole("button", { name: "Invite organiser" }).click();
  await expect(page.getByText("Copy this sign-in link")).toBeVisible();
  const link = await field("Sign-in link").inputValue();
  expect(link).toContain("/auth/confirm?token_hash=");
  await expect(page.getByRole("cell", { name: invitee })).toBeVisible();
  const { data: made } = await admin.db.auth.admin.listUsers({ perPage: 200 });
  const created = made.users.find((u) => u.email === invitee);
  expect(created).toBeTruthy();
  admin.trackUser(created!.id);

  // the invited organiser can really sign in with that link, and lands in their own organisation only
  const other = await page.context().browser()!.newContext({ baseURL: page.url().split("/admin")[0] });
  const otherPage = await other.newPage();
  await otherPage.goto(link);
  await expect(otherPage).toHaveURL(/\/org$/);
  await expect(otherPage.getByRole("heading", { name: `E2E New ${admin.run}: events` })).toBeVisible();
  expect(new URL(otherPage.url()).pathname).toBe("/org");
  const adminResponse = await otherPage.goto("/admin");
  expect(adminResponse?.status()).toBe(404);
  await other.close();

  // rename
  await field("Organisation name").fill(`E2E Renamed ${admin.run}`);
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Organisation renamed").first()).toBeVisible();

  // open as this organiser: banner, working organiser screens, back to admin
  await page.goto("/admin");
  const row = page.getByRole("row").filter({ hasText: `E2E Renamed ${admin.run}` });
  await row.getByRole("button", { name: "Open as this organiser" }).click();
  await expect(page).toHaveURL(/\/org$/);
  const banner = page.getByRole("status").filter({ hasText: "Viewing as" });
  await expect(banner).toContainText(`Viewing as E2E Renamed ${admin.run} — back to`);
  await expect(page.getByRole("heading", { name: `E2E Renamed ${admin.run}: events` })).toBeVisible();
  await page.goto("/org/settings"); // the banner stays on every organiser screen
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: /back to .* admin/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/org");
  await expect(page.getByRole("status").filter({ hasText: "Viewing as" })).toHaveCount(0);

  // the audit log shows it, for every organisation
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Audit log", exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Started viewing as organiser" }).filter({ hasText: `E2E Renamed ${admin.run}` }).first()).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Organisation created" }).filter({ hasText: `E2E Renamed ${admin.run}` }).first()).toBeVisible();

  // archive and unarchive (one confirmation each)
  await page.goto("/admin");
  await page.getByRole("row").filter({ hasText: `E2E Renamed ${admin.run}` }).getByRole("link", { name: "Manage" }).click();
  await page.getByRole("button", { name: "Archive organisation" }).click();
  await page.getByRole("button", { name: "Yes, archive" }).click();
  await expect(page.getByText("Archived", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Restore organisation" }).click();
  await page.getByRole("button", { name: "Yes, restore" }).click();
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();

  // delete: typing the slug is required
  const del = page.getByRole("button", { name: "Delete organisation permanently" });
  await expect(del).toBeDisabled();
  await field("Type the web address to confirm").fill("wrong");
  await expect(del).toBeDisabled();
  await field("Type the web address to confirm").fill(slug);
  await expect(del).toBeEnabled();
  await del.click();
  await page.getByRole("button", { name: "Yes, delete for good" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("row").filter({ hasText: slug })).toHaveCount(0);
});

test("an organisation with published results cannot be deleted, and says why", async ({ page }) => {
  test.setTimeout(120_000);
  // a division, a heat and a published result in the admin's own organisation
  const db = admin.db;
  const { data: ev } = await db.from("events").insert({ organisation_id: admin.orgId, name: `E2E Results ${admin.run}`, slug: `e2e-res-${admin.run}`, status: "published" }).select("id").single();
  const { data: div } = await db.from("divisions").insert({ event_id: ev!.id, name: "Pro", sort_order: 1 }).select("id").single();
  const { data: rider } = await db.from("riders").insert({ organisation_id: admin.orgId, first_name: "Ana", last_name: "E2E" }).select("id").single();
  const { data: entry } = await db.from("entries").insert({ division_id: div!.id, rider_id: rider!.id, seed: 1, status: "confirmed", source: "manual" }).select("id").single();
  const { data: round } = await db.from("rounds").insert({ division_id: div!.id, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} }).select("id").single();
  const { data: heat } = await db.from("heats").insert({ round_id: round!.id, division_id: div!.id, event_id: ev!.id, number: 1, duration_sec: 600, status: "ended" }).select("id").single();
  await db.from("heat_results").insert({ heat_id: heat!.id, entry_id: entry!.id, place: 1, total: 9 });

  await admin.signIn(page, "/admin");
  await page.getByRole("row").filter({ hasText: `E2E Big Air ${admin.run}` }).getByRole("link", { name: "Manage" }).click();
  await expect(page.getByText(/published results/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete organisation permanently" })).toBeDisabled();
});

test("platform settings: the product name replaces the built-in name on the public home page", async ({ page }) => {
  await admin.signIn(page, "/admin/settings");
  await expect(page.getByRole("heading", { name: "Platform settings", exact: true })).toBeVisible();
  const field = (label: string) => page.getByLabel(label, { exact: true });
  await expect(field("Tagline")).toHaveValue(/./);
  await field("Product name").fill(`Sendbook ${admin.run}`);
  await field("Tagline").fill(`Tagline ${admin.run}`);
  await page.getByRole("button", { name: "Save platform settings" }).click();
  await expect(page.getByText("Platform settings saved").first()).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: `Sendbook ${admin.run}`, level: 1 })).toBeVisible();
  await expect(page.getByText(`Tagline ${admin.run}`)).toBeVisible();
  await expect(page).toHaveTitle(`Sendbook ${admin.run}`);

  // put it back through the screen (which also refreshes the site's cached copy), so later tests see the built-in name at once
  await page.goto("/admin/settings");
  await field("Product name").fill(typeof saved.product_name === "string" ? saved.product_name : "");
  await field("Tagline").fill(typeof saved.tagline === "string" ? saved.tagline : "");
  await page.getByRole("button", { name: "Save platform settings" }).click();
  await expect(page.getByText("Platform settings saved").first()).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(await effectiveProductName());
});

test("master presets, audit log and health pages open", async ({ page }) => {
  await admin.signIn(page, "/admin/presets");
  await expect(page.getByRole("heading", { name: "Master presets", exact: true })).toBeVisible();
  for (const h of ["Scoring models", "Format templates", "Trick vocabulary", "Identification schemes"]) await expect(page.getByRole("heading", { name: h })).toBeVisible();
  await expect(page.getByRole("link", { name: /Edit/ }).first()).toBeVisible();
  await page.goto("/admin/health");
  await expect(page.getByRole("heading", { name: "Health", exact: true })).toBeVisible();
  await expect(page.getByText("Database: reachable")).toBeVisible();
  await expect(page.getByText(/Last publish:/)).toBeVisible();
  await expect(page.getByText(/Realtime: (Connected|Checking|Not connected)/)).toBeVisible();
});

test("master presets: edit makes a new draft version, and publishing makes it the default", async ({ page }) => {
  test.setTimeout(180_000);
  // a throwaway system preset (copied from a real one), so the real presets are never touched
  const key = `e2e-${admin.run}`;
  const base = JSON.parse(readFileSync("presets/scoring/club-quick-best2.json", "utf8"));
  const v1 = { ...base, id: key, name: "E2E model", version: 1 };
  const { error } = await admin.db.from("scoring_models").insert({ organisation_id: null, key, name: "E2E model", version: 1, json: v1, content_hash: "e2e", published_at: new Date().toISOString() });
  expect(error).toBeNull();
  try {
    await admin.signIn(page, `/admin/presets/scoring-models/${key}`);
    await expect(page.getByText("Default for new divisions: version 1")).toBeVisible({ timeout: 90_000 }); // the first visit compiles the page in dev mode

    // not JSON: refused in words, nothing saved
    await page.getByLabel("Preset JSON", { exact: true }).fill("{ not json");
    await page.getByRole("button", { name: "Save as new version" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("not valid JSON");
    // valid JSON that breaks the scoring model rules: refused with the reason
    await page.getByLabel("Preset JSON", { exact: true }).fill(JSON.stringify({ id: key, name: "Broken" }));
    await page.getByRole("button", { name: "Save as new version" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("That preset is not valid");

    // a real edit: becomes version 2, a draft; the default is still version 1
    await page.getByLabel("Preset JSON", { exact: true }).fill(JSON.stringify({ ...v1, name: "E2E model changed" }, null, 2));
    await page.getByRole("button", { name: "Save as new version" }).click();
    await expect(page.getByText("Saved as draft version 2").first()).toBeVisible();
    const row2 = page.getByRole("row").filter({ hasText: "v2" });
    await expect(row2).toContainText("Draft");
    await expect(page.getByText("Default for new divisions: version 1")).toBeVisible();

    // publish to all customers (one confirmation): version 2 becomes the default
    await row2.getByRole("button", { name: "Publish to all customers" }).click();
    await page.getByRole("button", { name: "Yes, publish" }).click();
    await expect(page.getByText("Default for new divisions: version 2")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "v1" })).toContainText("Published");
    // the stored version 2 carries its own number and the pinned key
    const { data } = await admin.db.from("scoring_models").select("version, json, published_at").eq("key", key).eq("version", 2).single();
    expect(data?.published_at).toBeTruthy();
    expect(data?.json).toMatchObject({ id: key, version: 2, name: "E2E model changed" });
  } finally {
    await admin.db.from("scoring_models").delete().eq("key", key);
  }
});

test("the public home page and the organisation page show published events only, labelled Organisation · Location · Date", async ({ page }) => {
  const db = admin.db;
  await db.from("events").insert([
    { organisation_id: admin.orgId, name: `E2E Public ${admin.run}`, slug: `e2e-pub-${admin.run}`, location: "El Gouna", start_date: "2099-05-05", end_date: "2099-05-07", status: "published" },
    { organisation_id: admin.orgId, name: `E2E Hidden ${admin.run}`, slug: `e2e-hid-${admin.run}`, location: "Nowhere", start_date: "2099-06-06", end_date: "2099-06-06", status: "draft" },
  ]);
  await page.goto("/");
  const card = page.getByRole("link", { name: new RegExp(`E2E Public ${admin.run}`) });
  await expect(card).toContainText(`E2E Big Air ${admin.run} · El Gouna · 5–7 May 2099`);
  await expect(page.getByText(`E2E Hidden ${admin.run}`)).toHaveCount(0);
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/e/e2e-pub-${admin.run}$`));
  await expect(page.getByRole("heading", { name: `E2E Public ${admin.run}` })).toBeVisible();

  await page.goto(`/o/e2e-${admin.run}`);
  await expect(page.getByRole("heading", { name: `E2E Big Air ${admin.run}`, level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upcoming events" })).toBeVisible();
  await expect(page.getByText(`E2E Public ${admin.run}`)).toBeVisible();
  await expect(page.getByText(`E2E Hidden ${admin.run}`)).toHaveCount(0);

  // archived organisations disappear from the public site but keep their data
  await db.from("organisations").update({ archived_at: new Date().toISOString() }).eq("id", admin.orgId);
  const gone = await page.goto(`/o/e2e-${admin.run}`);
  expect(gone?.status()).toBe(404);
  await page.goto("/");
  await expect(page.getByText(`E2E Public ${admin.run}`)).toHaveCount(0);
  await db.from("organisations").update({ archived_at: null }).eq("id", admin.orgId);
});

test("Create demo organisation: hidden while a demo exists, and builds the demo when there is none", async ({ page }) => {
  test.setTimeout(180_000);
  const { data: existing } = await admin.db.from("organisations").select("slug").in("slug", ["demo", "demo-org"]);
  await admin.signIn(page, "/admin");
  await expect(page.getByRole("heading", { name: "Organisations", exact: true })).toBeVisible();
  const button = page.getByRole("button", { name: "Create demo organisation" });
  if ((existing ?? []).length > 0) {
    await expect(button).toHaveCount(0); // a demo already exists: nothing to offer
    return;
  }
  await button.click();
  await page.getByRole("button", { name: "Yes, create it" }).click();
  await expect(page.getByRole("row").filter({ hasText: "/demo-org" })).toBeVisible({ timeout: 90_000 });
  await expect(button).toHaveCount(0);
  admin.trackOrganisation("demo-org"); // only reached on a project that had no demo: leave the project as it was
});

test("Move event to another organisation: the owner sees the action and can use it; staff only see who may", async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  const name = `E2E Movable ${admin.run}`;
  const { data: ev } = await admin.db.from("events").insert({ organisation_id: admin.orgId, name, slug: `e2e-mov-${admin.run}`, status: "draft" }).select("id").single();
  await admin.db.from("divisions").insert({ event_id: ev!.id, name: "Pro", sort_order: 1 });
  const from = `E2E Big Air ${admin.run}`;
  const to = `E2E Big Air ${plain.run}`;

  // staff: the events are listed, but the action is owner-only
  const staff = await createOrganiser({ platformAdmin: "staff" });
  try {
    const staffPage = await (await browser.newContext({ baseURL })).newPage();
    await staff.signIn(staffPage, `/admin/organisations/${admin.orgId}`);
    await expect(staffPage.getByRole("row").filter({ hasText: name })).toContainText("Only platform owners can move an event.");
    await expect(staffPage.getByRole("button", { name: "Move event to another organisation" })).toHaveCount(0);
  } finally {
    await staff.cleanup();
  }

  // owner: dropdown of the OTHER organisations, a confirmation naming both, then the event is gone from this organisation
  await admin.signIn(page, `/admin/organisations/${admin.orgId}`);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 90_000 });
  const select = row.getByRole("combobox");
  await expect(select.locator("option", { hasText: from })).toHaveCount(0); // not offered: it is the current organisation
  await expect(row.getByRole("button", { name: "Move event to another organisation" })).toBeDisabled(); // nothing chosen yet
  await select.selectOption({ label: to });
  await row.getByRole("button", { name: "Move event to another organisation" }).click();
  await expect(row.getByRole("group")).toContainText(`Move “${name}” from ${from} to ${to}?`);
  await row.getByRole("button", { name: "Yes, move it" }).click();
  await expect(page.getByText(`“${name}” moved to ${to}`).first()).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);
  const { data: moved } = await admin.db.from("events").select("organisation_id").eq("id", ev!.id).single();
  expect(moved?.organisation_id).toBe(plain.orgId);
  // and it shows in the audit log
  await page.goto("/admin/audit");
  await expect(page.getByRole("row").filter({ hasText: "Event moved to another organisation" }).filter({ hasText: name }).first()).toBeVisible();
});

test("Organisations list: test data is flagged, and every row has a ⋯ menu with Rename, Archive, Delete (owner) and Invite organiser", async ({ page }) => {
  test.setTimeout(240_000);
  const slug = `e2e-menu-${admin.run}`;
  const name = `E2E Menu ${admin.run}`;
  admin.trackOrganisation(slug);
  await admin.db.from("organisations").insert({ name, slug });

  await admin.signIn(page, "/admin");
  const row = () => page.getByRole("row").filter({ hasText: slug });
  await expect(row()).toBeVisible({ timeout: 90_000 });
  await expect(row()).toContainText("Test data"); // web address starts with e2e-
  await expect(page.getByRole("row").filter({ hasText: "arrow" }).filter({ hasNotText: "e2e-" }).getByText("Test data")).toHaveCount(0);

  const openMenu = async () => {
    await row().getByRole("button", { name: `More actions for ${name}` }).click();
    await expect(row().getByRole("menu")).toBeVisible();
  };

  // the menu lists the four actions
  await openMenu();
  for (const item of ["Rename", "Archive", "Delete", "Invite organiser"]) await expect(row().getByRole("menuitem", { name: item, exact: true })).toBeVisible();

  // Rename: one tap, one dialog
  await row().getByRole("menuitem", { name: "Rename", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(`Name: ${name}`);
  await dialog.getByLabel("Organisation name").fill(`${name} renamed`);
  await dialog.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Organisation renamed").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("row").filter({ hasText: `${name} renamed` })).toBeVisible();

  // Invite organiser: link only (no email), from the list
  const renamed = `${name} renamed`;
  const menuFor = () => row().getByRole("button", { name: `More actions for ${renamed}` });
  await menuFor().click();
  await row().getByRole("menuitem", { name: "Invite organiser", exact: true }).click();
  const invitee = `e2e-menu-invitee-${admin.run}@example.com`;
  await dialog.getByLabel("Organiser's email").fill(invitee);
  await dialog.getByLabel("Send the sign-in email now").uncheck();
  await dialog.getByRole("button", { name: "Invite organiser" }).click();
  await expect(dialog.getByText("Copy this sign-in link")).toBeVisible();
  const { data: made } = await admin.db.auth.admin.listUsers({ perPage: 200 });
  const created = made.users.find((u) => u.email === invitee);
  if (created) admin.trackUser(created.id);
  await dialog.getByRole("button", { name: "Close" }).click();

  // Archive and restore from the list
  await menuFor().click();
  await row().getByRole("menuitem", { name: "Archive", exact: true }).click();
  await dialog.getByRole("button", { name: "Archive organisation" }).click();
  await dialog.getByRole("button", { name: "Yes, archive" }).click();
  await expect(page.getByText("Organisation archived").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(row()).toContainText("Archived");
  await menuFor().click();
  await row().getByRole("menuitem", { name: "Restore", exact: true }).click();
  await dialog.getByRole("button", { name: "Restore organisation" }).click();
  await dialog.getByRole("button", { name: "Yes, restore" }).click();
  await expect(page.getByText("Organisation restored").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  // Delete (owner): typed web address, from the list
  await menuFor().click();
  await row().getByRole("menuitem", { name: "Delete", exact: true }).click();
  await dialog.getByLabel("Type the web address to confirm").fill(slug);
  await dialog.getByRole("button", { name: "Delete organisation permanently" }).click();
  await dialog.getByRole("button", { name: "Yes, delete for good" }).click();
  await expect(page.getByRole("row").filter({ hasText: slug })).toHaveCount(0, { timeout: 60_000 });
});

test("Organisations list: the ⋯ menu of platform staff has no Delete", async ({ page }) => {
  test.setTimeout(120_000);
  const staff = await createOrganiser({ platformAdmin: "staff" });
  try {
    await staff.signIn(page, "/admin");
    const row = page.getByRole("row").filter({ hasText: `e2e-${staff.run}` });
    await expect(row).toBeVisible({ timeout: 90_000 });
    await row.getByRole("button", { name: `More actions for E2E Big Air ${staff.run}` }).click();
    await expect(row.getByRole("menuitem", { name: "Rename", exact: true })).toBeVisible();
    await expect(row.getByRole("menuitem", { name: "Invite organiser", exact: true })).toBeVisible();
    await expect(row.getByRole("menuitem", { name: "Delete", exact: true })).toHaveCount(0);
  } finally {
    await staff.cleanup();
  }
});
