import type { Page } from "@playwright/test";
import { test, expect } from "./base";
import { record } from "./cleanup";
import { createLiveWorld } from "./live-world";
import { createOrganiser } from "./organiser";

// The master trick base editor on throwaway organisations (docs/08 §1I). Each test saves (and some publish) real master versions on the hosted project:
// every version a test makes is written to the ledger and removed after its throwaway events, so the master base ends as it started. The tests run one
// after another because they share the one master base. Arrow, EKL and Demo are never opened.
test.describe.configure({ mode: "serial" });

type Org = Awaited<ReturnType<typeof createOrganiser>>;
const KEY = "big-air-vocabulary";

// These tests start from "the newest master version is the published one". When the platform owner has an unpublished draft open on the shared master base, the editor opens
// that draft, so the diffs and counts here would describe the owner's work, and nothing here must save over it: the tests step aside and say so.
test.beforeEach(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data } = await db.from("trick_vocabularies").select("version").is("organisation_id", null).is("event_id", null).eq("key", KEY).is("published_at", null).limit(1);
  test.skip((data ?? []).length > 0, "The master trick base has an unpublished draft (the owner's work in progress): publish or discard it first, then run these tests.");
});

async function newest(org: Org) {
  return (await org.db.from("trick_vocabularies").select("id, version, json, published_at").is("organisation_id", null).is("event_id", null).eq("key", KEY).order("version", { ascending: false }).limit(1).single()).data!;
}
/** Every master version above `from` goes into the ledger (and is removed at the end of this test). */
async function track(org: Org, from: number, mine: string[]) {
  const { data } = await org.db.from("trick_vocabularies").select("id").is("organisation_id", null).is("event_id", null).eq("key", KEY).gt("version", from);
  for (const r of data ?? []) if (!mine.includes(r.id)) {
    mine.push(r.id);
    record({ trickVersionId: r.id });
  }
}
async function removeVersions(org: Org, mine: string[]) {
  if (mine.length) await org.db.from("trick_vocabularies").delete().in("id", mine);
}
async function makeEvent(org: Org, name: string) {
  const { data: ev } = await org.db.from("events").insert({ organisation_id: org.orgId, name: `${name} ${org.run}`, slug: `e2e-tbe-${name.toLowerCase().replace(/\W+/g, "-")}-${org.run}`, status: "draft" }).select("id, trick_vocabulary_version").single();
  await org.db.from("divisions").insert({ event_id: ev!.id, name: "Pro Men", sort_order: 1 });
  return ev!;
}
async function saveAndPublish(page: Page) {
  await page.getByTestId("save-draft").click();
  await expect(page.getByTestId("editor-status")).toContainText("(draft, not published)");
  await page.getByTestId("publish").click();
  const diff = page.getByTestId("publish-diff");
  await expect(diff).toBeVisible();
  const summary = await page.getByTestId("publish-summary").innerText();
  await page.getByTestId("confirm-publish").click();
  await expect(page.getByTestId("editor-status")).toContainText("(published)");
  return summary;
}
/** The editor answers taps only once it has loaded in the browser (data-ready); a click before that is lost. */
async function editorReady(page: Page) {
  await expect(page.locator("[data-testid=trick-editor][data-ready=true]")).toBeVisible();
}
async function openTrickBaseTab(page: Page, eventId: string) {
  await page.goto(`/org/events/${eventId}/divisions`);
  await page.getByRole("tab", { name: "Trick base" }).click();
  await expect(page.getByTestId("trick-base-version")).toBeVisible();
}

test("rename a block, publish with the diff, and see the new label on an event's Trick base tab after Update to latest", async ({ page }) => {
  test.setTimeout(240_000);
  const owner = await createOrganiser({ platformAdmin: "owner" });
  const mine: string[] = [];
  const start = (await newest(owner)).version;
  try {
    const old = await makeEvent(owner, "Old event");
    await owner.signIn(page, "/admin/presets/trick-base");
    await editorReady(page);
    await expect(page.getByTestId("trick-editor")).toBeVisible();
    const label = `Mega loop ${owner.run}`;
    await page.getByTestId("label-base:megaloop").fill(label);
    await expect(page.getByTestId("unsaved")).toBeVisible();
    // the key stays: existing events and stored attempts keep working
    await expect(page.getByTestId("key-base:megaloop")).toHaveText("megaloop");
    const summary = await saveAndPublish(page);
    await track(owner, start, mine);
    expect(summary).toContain("1 renamed");
    await expect(page.getByTestId(`history-${start + 1}`)).toContainText(owner.email);

    await openTrickBaseTab(page, old.id);
    await expect(page.getByTestId("trick-base-version")).toContainText(`version ${old.trick_vocabulary_version}`);
    await expect(page.getByTestId("block-row-base:megaloop")).not.toContainText(label); // the event keeps its version until asked
    await expect(page.getByTestId("update-summary")).toContainText("1 renamed");
    await expect(page.getByTestId("update-lines")).toContainText(`Renamed: Megaloop → ${label}`);
    await page.getByTestId("update-to-latest").getByRole("button", { name: "Update to latest" }).click();
    await page.getByRole("button", { name: "Yes, update" }).click();
    await expect(page.getByTestId("trick-base-version")).toContainText(`version ${start + 1}`);
    await expect(page.getByTestId("block-row-base:megaloop")).toContainText(label);
    expect((await owner.db.from("events").select("trick_vocabulary_version").eq("id", old.id).single()).data!.trick_vocabulary_version).toBe(start + 1);
  } finally {
    await track(owner, start, mine);
    await owner.cleanup();
    await removeVersions(owner, mine);
  }
});

test("add an alias and the spotter's typed text matches it", async ({ page }) => {
  test.setTimeout(300_000);
  const owner = await createOrganiser({ platformAdmin: "owner" });
  const mine: string[] = [];
  const start = (await newest(owner)).version;
  let world: Awaited<ReturnType<typeof createLiveWorld>> | null = null;
  try {
    await owner.signIn(page, "/admin/presets/trick-base");
    await editorReady(page);
    const input = page.getByTestId("alias-input-base:megaloop");
    await input.fill("megaboost");
    await input.press("Enter");
    await expect(page.getByTestId("alias-base:megaloop-megaboost")).toBeVisible();
    // a word another block already has is refused, in words
    await page.getByTestId("alias-input-base:frontroll").fill("loop");
    await page.getByTestId("alias-input-base:frontroll").press("Enter");
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("validation")).toContainText("“loop” is already an alias of Kiteloop.");
    await page.getByTestId("alias-base:frontroll-loop").getByRole("button").click();
    const summary = await saveAndPublish(page);
    await track(owner, start, mine);
    expect(summary).toContain("with changed aliases");

    // a new event starts on the published version: the spotter types the alias
    world = await createLiveWorld();
    await page.context().clearCookies();
    await world.signInAs(page, "spotter", "/seat");
    await world.startHeat(world.heats[0]);
    await expect(page.getByTestId("trick-builder")).toBeVisible({ timeout: 30_000 });
    await page.locator("#trick-text").fill("left megaboost");
    await page.locator("#trick-text").press("Enter");
    await expect(page.getByTestId("composed-name").locator("p.sr-only")).toHaveText("Left Megaloop");
  } finally {
    await track(owner, start, mine);
    await world?.cleanup();
    await owner.cleanup();
    await removeVersions(owner, mine);
  }
});

test("retire a block: absent from a new event, still there on an older one", async ({ page }) => {
  test.setTimeout(240_000);
  const owner = await createOrganiser({ platformAdmin: "owner" });
  const mine: string[] = [];
  const start = (await newest(owner)).version;
  try {
    const old = await makeEvent(owner, "Before retiring");
    await owner.signIn(page, "/admin/presets/trick-base");
    await editorReady(page);
    await page.getByTestId("retire-base:heart_attack").click();
    await expect(page.getByTestId("row-base:heart_attack")).toHaveAttribute("data-retired", "true");
    await expect(page.getByTestId("restore-base:heart_attack")).toBeVisible(); // never a hard delete once published
    await expect(page.getByTestId("remove-base:heart_attack")).toHaveCount(0);
    const summary = await saveAndPublish(page);
    await track(owner, start, mine);
    expect(summary).toContain("1 retired");

    const fresh = await makeEvent(owner, "After retiring");
    expect(fresh.trick_vocabulary_version).toBe(start + 1);
    await openTrickBaseTab(page, fresh.id);
    await expect(page.getByTestId("block-base:backroll")).toBeVisible();
    await expect(page.getByTestId("block-base:heart_attack")).toHaveCount(0);
    await openTrickBaseTab(page, old.id);
    await expect(page.getByTestId("block-base:heart_attack")).toBeVisible();
  } finally {
    await track(owner, start, mine);
    await owner.cleanup();
    await removeVersions(owner, mine);
  }
});

test("accept a proposal: edit its name and aliases, choose the family, it goes into a new draft", async ({ page }) => {
  test.setTimeout(240_000);
  const owner = await createOrganiser({ platformAdmin: "owner" });
  const mine: string[] = [];
  const start = (await newest(owner)).version;
  try {
    const ev = await makeEvent(owner, "Proposals");
    const key = `local_e2e_${owner.run}`;
    await owner.db.from("trick_vocabularies").insert({ organisation_id: owner.orgId, event_id: ev.id, key: "event-additions", json: { blocks: [{ family: "base", key, label: `E2E roll ${owner.run}`, category: "rotation", status: "proposed" }] }, content_hash: "x" });
    await owner.signIn(page, "/admin/tricks"); // the old address still leads here
    await editorReady(page);
    await expect(page).toHaveURL(/\/admin\/presets\/trick-base/);
    const row = page.getByTestId("proposal").filter({ hasText: `E2E roll ${owner.run}` });
    await expect(row).toContainText(`Proposals ${owner.run}`);
    await row.getByTestId("proposal-accept").click();
    await row.getByTestId("proposal-label").fill(`Sloth roll ${owner.run}`);
    await row.getByTestId(`alias-input-proposal-${key}`).fill(`sloth ${owner.run}`);
    await row.getByTestId(`alias-input-proposal-${key}`).press("Enter");
    await row.getByTestId("proposal-family").selectOption({ label: "Add-ons" });
    await row.getByTestId("proposal-accept-confirm").click();
    await expect(page.getByTestId("proposal").filter({ hasText: `E2E roll ${owner.run}` })).toHaveCount(0);
    await track(owner, start, mine);

    const draft = await newest(owner);
    expect(draft.version).toBe(start + 1);
    expect(draft.published_at).toBeNull(); // published with the next "Publish to all customers"
    const json = draft.json as { baseTricks: Array<{ key: string; label: string; aliases: string[] }>; families: Array<{ key: string; blocks: string[] }> };
    expect(json.baseTricks.find((b) => b.key === key)).toMatchObject({ label: `Sloth roll ${owner.run}`, aliases: [`sloth ${owner.run}`] });
    expect(json.families.find((f) => f.key === "addon")!.blocks).toContain(`base:${key}`);
    await expect(page.getByTestId(`label-base:${key}`)).toHaveValue(`Sloth roll ${owner.run}`);
    const { data: own } = await owner.db.from("trick_vocabularies").select("json").eq("event_id", ev.id).eq("key", "event-additions").single();
    expect((own!.json as { blocks: Array<{ status: string }> }).blocks[0].status).toBe("accepted");
  } finally {
    await track(owner, start, mine);
    await owner.cleanup();
    await removeVersions(owner, mine);
  }
});

test("dismiss a proposal with a reason the organiser sees", async ({ page }) => {
  test.setTimeout(180_000);
  const owner = await createOrganiser({ platformAdmin: "owner" });
  try {
    const ev = await makeEvent(owner, "Dismissed");
    const key = `local_e2e_d_${owner.run}`;
    await owner.db.from("trick_vocabularies").insert({ organisation_id: owner.orgId, event_id: ev.id, key: "event-additions", json: { blocks: [{ family: "addon", key, label: `E2E spin ${owner.run}`, category: null, status: "proposed" }] }, content_hash: "x" });
    await owner.signIn(page, "/admin/presets/trick-base");
    await editorReady(page);
    const row = page.getByTestId("proposal").filter({ hasText: `E2E spin ${owner.run}` });
    await row.getByTestId("proposal-dismiss").click();
    await row.getByTestId("proposal-reason").fill("Same as Board spin");
    await row.getByTestId("proposal-dismiss-confirm").click();
    await expect(page.getByTestId("proposal").filter({ hasText: `E2E spin ${owner.run}` })).toHaveCount(0);
    await openTrickBaseTab(page, ev.id);
    await expect(page.getByTestId(`block-row-addon:${key}`)).toContainText("not added to the master base: Same as Board spin");
  } finally {
    await owner.cleanup();
  }
});
