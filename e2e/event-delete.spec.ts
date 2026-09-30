import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

// Delete or archive an event: organisers in the Event step, owners in the admin events table.
// Needs Supabase keys and the event delete/archive migration. Everything created here is removed by the afterAll hook
// (and, as a backstop, by the global teardown).
type Organiser = Awaited<ReturnType<typeof createOrganiser>>;
let organiser: Organiser;
let owner: Organiser;
let staff: Organiser;

test.beforeAll(async () => {
  organiser = await createOrganiser();
  owner = await createOrganiser({ platformAdmin: "owner" });
  staff = await createOrganiser({ platformAdmin: "staff" });
});
test.afterAll(async () => {
  await Promise.allSettled([organiser?.cleanup(), owner?.cleanup(), staff?.cleanup()]);
});

/** An event with a division, an entry and a heat; `published` adds a published result line, which makes it permanent. */
async function makeEvent(o: Organiser, key: string, opts: { published?: boolean } = {}) {
  const db = o.db;
  const slug = `e2e-${key}-${o.run}`;
  const { data: ev, error } = await db.from("events").insert({ organisation_id: o.orgId, name: `E2E ${key} ${o.run}`, slug, status: opts.published ? "published" : "draft" }).select("id").single();
  if (error) throw new Error(error.message);
  const { data: div } = await db.from("divisions").insert({ event_id: ev.id, name: "Pro", sort_order: 1 }).select("id").single();
  const { data: rider } = await db.from("riders").insert({ organisation_id: o.orgId, first_name: "Ana", last_name: key }).select("id").single();
  const { data: entry } = await db.from("entries").insert({ division_id: div!.id, rider_id: rider!.id, seed: 1, status: "confirmed", source: "manual" }).select("id").single();
  const { data: round } = await db.from("rounds").insert({ division_id: div!.id, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} }).select("id").single();
  const { data: heat } = await db.from("heats").insert({ round_id: round!.id, division_id: div!.id, event_id: ev.id, number: 1, duration_sec: 600, status: opts.published ? "ended" : "scheduled" }).select("id").single();
  if (opts.published) await db.from("heat_results").insert({ heat_id: heat!.id, entry_id: entry!.id, place: 1, total: 9 });
  return { id: ev.id, slug, name: `E2E ${key} ${o.run}` };
}

test("organiser: delete an event with the web address typed; with published results only Archive is offered", async ({ page }) => {
  test.setTimeout(240_000);
  const clean = await makeEvent(organiser, "del");
  const permanent = await makeEvent(organiser, "perm", { published: true });
  const typed = page.getByLabel("Type the event's web address to confirm");

  // no published results: Delete is possible, but only with the exact address
  await organiser.signIn(page, `/org/events/${clean.id}/event`);
  await expect(page.getByRole("heading", { name: "Delete or archive this event" })).toBeVisible({ timeout: 90_000 });
  const del = page.getByRole("button", { name: "Delete event", exact: true });
  await expect(del).toBeDisabled();
  await typed.fill("wrong");
  await expect(del).toBeDisabled();
  await typed.fill(clean.slug);
  await expect(del).toBeEnabled();
  await del.click();
  await expect(page.getByRole("group", { name: "Delete event" })).toContainText(`Really delete “${clean.name}” and everything in it?`);
  await page.getByRole("button", { name: "Yes, delete for good" }).click();
  await expect(page).toHaveURL(/\/org$/, { timeout: 60_000 });
  const { data: gone } = await organiser.db.from("events").select("id").eq("id", clean.id);
  expect(gone).toEqual([]);
  const { data: leftovers } = await organiser.db.from("divisions").select("id").eq("event_id", clean.id);
  expect(leftovers).toEqual([]);
  await expect(page.getByText(clean.name)).toHaveCount(0);

  // published results: Delete is refused with the reason, Archive is offered
  await page.goto(`/org/events/${permanent.id}/event`);
  await expect(page.getByText(/has published results/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete event", exact: true })).toBeDisabled();
  await expect(typed).toBeDisabled();
  await page.getByRole("button", { name: "Archive event" }).click();
  await page.getByRole("button", { name: "Yes, archive" }).click();
  await expect(page.getByRole("button", { name: "Restore event" })).toBeVisible();

  // archived: hidden from the organiser's list (with a way to show it) and from the public site; all data kept
  await page.goto("/org");
  await expect(page.getByText(permanent.name)).toHaveCount(0);
  await page.getByRole("link", { name: "Show archived events (1)" }).click();
  await expect(page.getByText(permanent.name)).toBeVisible();
  await expect(page.getByText("Archived", { exact: false }).first()).toBeVisible();
  await page.goto("/");
  await expect(page.getByText(permanent.name)).toHaveCount(0);
  const kept = await organiser.db.from("heat_results").select("id").eq("event_id", permanent.id);
  expect(kept.data).toHaveLength(1);

  // restore
  await page.goto(`/org/events/${permanent.id}/event`);
  await page.getByRole("button", { name: "Restore event" }).click();
  await page.getByRole("button", { name: "Yes, restore" }).click();
  await expect(page.getByRole("button", { name: "Archive event" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText(permanent.name)).toBeVisible();
});

test("owner: Delete event and Archive event are in the admin events table; staff only see who may", async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);
  const clean = await makeEvent(owner, "owndel");
  const permanent = await makeEvent(owner, "ownperm", { published: true });
  await owner.signIn(page, `/admin/organisations/${owner.orgId}`);

  const cleanRow = page.getByRole("row").filter({ hasText: clean.name });
  const permRow = page.getByRole("row").filter({ hasText: permanent.name });
  await expect(cleanRow).toBeVisible({ timeout: 90_000 });
  await expect(cleanRow.getByRole("button", { name: "Delete event", exact: true })).toBeDisabled();
  await expect(cleanRow.getByRole("button", { name: "Archive event" })).toBeVisible();
  // permanent: Delete stays disabled and says why
  await expect(permRow).toContainText("has published results");
  await expect(permRow.getByLabel("Type the event's web address to confirm")).toBeDisabled();
  await expect(permRow.getByRole("button", { name: "Delete event", exact: true })).toBeDisabled();

  // owner deletes the clean one: the row disappears and the database has nothing left of it
  await cleanRow.getByLabel("Type the event's web address to confirm").fill(clean.slug);
  await cleanRow.getByRole("button", { name: "Delete event", exact: true }).click();
  await cleanRow.getByRole("button", { name: "Yes, delete for good" }).click();
  await expect(page.getByRole("row").filter({ hasText: clean.name })).toHaveCount(0, { timeout: 60_000 });
  expect((await owner.db.from("events").select("id").eq("id", clean.id)).data).toEqual([]);
  // and the audit log has it
  await page.goto("/admin/audit");
  await expect(page.getByRole("row").filter({ hasText: "Event deleted" }).filter({ hasText: `E2E Big Air ${owner.run}` }).first()).toBeVisible();

  // staff: the table lists the events but the actions are owner-only
  const staffPage = await (await browser.newContext({ baseURL })).newPage();
  await staff.signIn(staffPage, `/admin/organisations/${owner.orgId}`);
  await expect(staffPage.getByRole("row").filter({ hasText: permanent.name })).toContainText("Only platform owners can", { timeout: 90_000 });
  await expect(staffPage.getByRole("button", { name: "Delete event", exact: true })).toHaveCount(0);
});
