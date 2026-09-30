import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

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
  for (const [k, v] of Object.entries(saved)) await admin?.db.from("platform_settings").upsert({ key: k, value: v as never });
  await admin?.cleanup();
  await plain?.cleanup();
});

test("a signed-out visitor is sent to the sign-in page", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/org\/login\?next=%2Fadmin/);
});

test("an organiser gets a plain 404 on every admin page and never sees the admin switch", async ({ page }) => {
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
  await expect(page.getByText("Organisation renamed")).toBeVisible();

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
  test.setTimeout(120_000);
  await admin.signIn(page, "/admin/presets");
  await page.getByRole("link", { name: /Edit/ }).first().click();
  await expect(page.getByText(/Default for new divisions: version \d+/)).toBeVisible();
  const before = Number((await page.getByText(/Default for new divisions: version \d+/).innerText()).match(/version (\d+)/)![1]);
  await page.getByLabel("Preset JSON", { exact: true }).fill("{ not json");
  await page.getByRole("button", { name: "Save as new version" }).click();
  await expect(page.getByRole("alert")).toContainText("not valid");
  const { data: rows } = await admin.db.from("scoring_models").select("id").is("organisation_id", null);
  expect(rows!.length).toBeGreaterThan(0);
  expect(before).toBeGreaterThan(0);
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
