import type { Page } from "@playwright/test";
import { test, expect, installSupabaseProxy } from "./base";
import { createOrganiser } from "./organiser";

type Org = Awaited<ReturnType<typeof createOrganiser>>;

async function publishedEvent(org: Org, extra: Record<string, unknown> = {}) {
  const slug = `e2e-off-${org.run}`;
  const { data: ev } = await org.db.from("events").insert({ organisation_id: org.orgId, name: `Officials Cup ${org.run}`, slug, status: "published", start_date: "2026-10-10", end_date: "2026-10-11", ...extra }).select("id").single();
  return { eventId: ev!.id, slug };
}

async function addSeat(page: Page, name: string, role: "Judge" | "Head judge" | "Spotter" | "Announcer" = "Judge") {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Role", { exact: true }).selectOption({ label: role });
  await page.getByTestId("add-seat").click();
  await expect(page.getByTestId("pin-box")).toBeVisible();
  const pin = (await page.getByTestId("pin-digits").innerText()).trim();
  expect(pin).toMatch(/^\d{6}$/);
  await page.getByTestId("pin-box-close").click();
  await expect(page.getByTestId("pin-box")).toHaveCount(0);
  return pin;
}

const seatCard = (page: Page, name: string) => page.locator(`[data-testid=seat-card][data-seat-name="${name}"]`);

async function joinWithPin(page: Page, slug: string, pin: string) {
  await page.goto(`/e/${slug}/join`);
  await page.getByLabel("Your 6-digit PIN").fill(pin);
  await page.getByRole("button", { name: "Join", exact: true }).click();
}

test("a seat: the PIN is shown in full once, afterwards behind Show PIN; regenerate kills the old PIN and signs the phone out", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const org = await createOrganiser();
  const phoneA = await browser.newContext();
  const phoneB = await browser.newContext();
  try {
    await installSupabaseProxy(phoneA);
    await installSupabaseProxy(phoneB);
    const { eventId, slug } = await publishedEvent(org);
    await org.signIn(page, `/org/events/${eventId}/officials`);
    await expect(page.getByRole("heading", { name: "Step 4: Officials" })).toBeVisible();

    // create: PIN in a large box with Copy and a share link
    await page.getByLabel("Name", { exact: true }).fill("Judge One");
    await page.getByTestId("add-seat").click();
    await expect(page.getByTestId("pin-box")).toBeVisible();
    const pin = (await page.getByTestId("pin-digits").innerText()).trim();
    expect(pin).toMatch(/^\d{6}$/);
    await expect(page.getByTestId("pin-copy")).toBeVisible();
    const share = await page.getByTestId("pin-share").getAttribute("href");
    expect(share).toContain("https://wa.me/?text=");
    expect(decodeURIComponent(share!)).toContain(pin);
    expect(decodeURIComponent(share!)).toContain(`/e/${slug}/join`);
    await page.getByTestId("pin-box-close").click();

    // afterwards: never on the page until "Show PIN" is tapped
    const card = seatCard(page, "Judge One");
    await expect(card).toBeVisible();
    await expect(page.locator("body")).not.toContainText(pin);
    await card.getByTestId("show-pin").click();
    await expect(card.getByTestId("shown-pin")).toHaveText(pin);
    await card.getByTestId("show-pin").click();
    await expect(card.getByTestId("shown-pin")).toHaveCount(0);
    // the database keeps only a hash and an encrypted value, never the PIN itself
    const { data: row } = await org.db.from("judge_seats").select("pin_hash, pin_enc").eq("event_id", eventId).single();
    expect(JSON.stringify(row)).not.toContain(pin);

    // a phone joins with the PIN and shows as connected
    const a = await phoneA.newPage();
    await joinWithPin(a, slug, pin);
    await expect(a).toHaveURL(/\/seat$/);
    await expect(a.getByText("Judge One")).toBeVisible();
    await page.reload();
    await expect(seatCard(page, "Judge One").getByTestId("seat-seen")).toContainText("Connected");

    // regenerate (one confirmation): a new PIN, the old one refused, the old phone signed out
    await card.getByRole("button", { name: "Regenerate PIN" }).click();
    await card.getByRole("button", { name: "Yes, regenerate" }).click();
    await expect(page.getByTestId("pin-box")).toBeVisible();
    const fresh = (await page.getByTestId("pin-digits").innerText()).trim();
    expect(fresh).toMatch(/^\d{6}$/);
    expect(fresh).not.toBe(pin);
    await page.getByTestId("pin-box-close").click();
    await a.goto("/seat");
    await expect(a.getByText("Not connected")).toBeVisible();

    const b = await phoneB.newPage();
    await joinWithPin(b, slug, pin);
    await expect(b.locator("p[role=alert]")).toContainText("not recognised"); // the old PIN is refused on the join page
    await joinWithPin(b, slug, fresh);
    await expect(b).toHaveURL(/\/seat$/);
    await expect(b.getByText("Judge One")).toBeVisible();
  } finally {
    await phoneA.close();
    await phoneB.close();
    await org.cleanup();
  }
});

test("Print cards: one printable page for all seats or for one, with the PIN in big digits and a QR code; printing changes no PIN", async ({ page }) => {
  test.setTimeout(180_000);
  const org = await createOrganiser();
  try {
    const { eventId } = await publishedEvent(org);
    await org.signIn(page, `/org/events/${eventId}/officials`);
    const pins: Record<string, string> = {};
    for (const [name, role] of [["Head Honcho", "Head judge"], ["Judge Two", "Judge"], ["Spot Three", "Spotter"]] as const) pins[name] = await addSeat(page, name, role);

    const [all] = await Promise.all([page.waitForEvent("popup"), page.getByTestId("print-cards").click()]);
    await expect(all.getByTestId("card")).toHaveCount(3);
    await expect(all.getByTestId("card-qr")).toHaveCount(3);
    for (const [name, pin] of Object.entries(pins)) await expect(all.getByTestId("card").filter({ hasText: name }).getByTestId("card-pin")).toHaveText(pin);
    await expect(all.getByTestId("card").first()).toContainText("Officials Cup");
    await expect(all.getByTestId("card").filter({ hasText: "Judge Two" })).toContainText("Judge");
    await all.close();

    // one seat
    const [one] = await Promise.all([page.waitForEvent("popup"), seatCard(page, "Judge Two").getByRole("link", { name: "Print card" }).click()]);
    await expect(one.getByTestId("card")).toHaveCount(1);
    await expect(one.getByTestId("card-pin")).toHaveText(pins["Judge Two"]);
    await one.close();

    // printing did not change anybody's PIN
    const card = seatCard(page, "Judge Two");
    await card.getByTestId("show-pin").click();
    await expect(card.getByTestId("shown-pin")).toHaveText(pins["Judge Two"]);
  } finally {
    await org.cleanup();
  }
});

test("self-add from the join page appears pending; approve gives a PIN that joins; decline removes it; a filled hidden field adds nothing", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const org = await createOrganiser();
  const phone = await browser.newContext();
  try {
    await installSupabaseProxy(phone);
    const { eventId, slug } = await publishedEvent(org);
    const p = await phone.newPage();
    await p.goto(`/e/${slug}/join`);
    await p.getByText("Not on the list? Add your name").click();
    await p.getByLabel("Your name", { exact: true }).fill("Sally Self");
    await p.getByLabel("Role you would like").selectOption({ label: "Spotter" });
    await p.getByLabel(/^Phone/).fill("+20 100 555 0199");
    await p.getByRole("button", { name: "Ask to be added" }).click();
    await expect(p.getByText("Sent: waiting for the organiser")).toBeVisible();
    // again with another name, to decline later
    await p.getByRole("button", { name: "Add another name" }).click();
    await p.getByLabel("Your name", { exact: true }).fill("Dan Decline");
    await p.getByRole("button", { name: "Ask to be added" }).click();
    await expect(p.getByText("Sent: waiting for the organiser")).toBeVisible();
    // a script fills the hidden field: looks like success, stores nothing
    await p.getByRole("button", { name: "Add another name" }).click();
    await p.getByLabel("Your name", { exact: true }).fill("Bot Botson");
    await p.locator("#self-website").fill("http://spam.test", { force: true });
    await p.getByRole("button", { name: "Ask to be added" }).click();
    await expect(p.getByText("Sent: waiting for the organiser")).toBeVisible();

    const { data: rows } = await org.db.from("judge_seats").select("name, status, role, pin_hash").eq("event_id", eventId).order("name");
    expect(rows!.map((r) => r.name)).toEqual(["Dan Decline", "Sally Self"]);
    expect(rows!.every((r) => r.status === "pending" && r.pin_hash === null)).toBe(true);

    // pending seats cannot join
    await joinWithPin(p, slug, "123456");
    await expect(p.locator("p[role=alert]")).toContainText("not recognised");

    await org.signIn(page, `/org/events/${eventId}/officials`);
    const pending = page.getByTestId("pending-seat");
    await expect(pending).toHaveCount(2);
    await expect(pending.filter({ hasText: "Sally Self" })).toContainText("Spotter");
    await expect(pending.filter({ hasText: "Sally Self" })).toContainText("+20 100 555 0199");
    await expect(page.getByRole("link", { name: /4\. Officials/ }).first()).toBeVisible();

    await pending.filter({ hasText: "Dan Decline" }).getByRole("button", { name: "Decline" }).click();
    await expect(pending).toHaveCount(1);
    await pending.filter({ hasText: "Sally Self" }).getByRole("button", { name: "Approve and make PIN" }).click();
    await expect(page.getByTestId("pin-box")).toBeVisible();
    const pin = (await page.getByTestId("pin-digits").innerText()).trim();
    await page.getByTestId("pin-box-close").click();
    await expect(page.getByTestId("pending-seat")).toHaveCount(0);
    await expect(seatCard(page, "Sally Self")).toBeVisible();

    await joinWithPin(p, slug, pin);
    await expect(p).toHaveURL(/\/seat$/);
    await expect(p.getByText("Sally Self")).toBeVisible();

    // an archived event refuses the join page's form like an unknown event
    await org.db.from("events").update({ archived_at: new Date().toISOString() }).eq("id", eventId);
    await p.goto(`/e/${slug}/join`);
    await p.getByText("Not on the list? Add your name").click();
    await p.getByLabel("Your name", { exact: true }).fill("Late Larry");
    await p.getByRole("button", { name: "Ask to be added" }).click();
    await expect(p.locator("p[role=alert]")).toContainText("not taking requests");
  } finally {
    await phone.close();
    await org.cleanup();
  }
});

test("panels: tick the judges of a division and the 'needs 3 judges' check turns green; it warns but never blocks", async ({ page }) => {
  test.setTimeout(240_000);
  const org = await createOrganiser();
  try {
    const { eventId } = await publishedEvent(org);
    const { data: model } = await org.db.from("scoring_models").insert({ organisation_id: org.orgId, key: `e2e-three-${org.run}`, name: "Three judges", version: 1, json: { panel: { minJudges: 3, maxJudges: 5 } }, content_hash: "x" }).select("id").single();
    const { data: div } = await org.db.from("divisions").insert({ event_id: eventId, name: "Pro Men", sort_order: 1, scoring_model_id: model!.id }).select("id").single();
    await org.signIn(page, `/org/events/${eventId}/officials`);
    for (const n of ["Judge A", "Judge B", "Judge C"]) await addSeat(page, n);
    await addSeat(page, "Head Hal", "Head judge");

    await expect(page.getByTestId("panel-warnings")).toContainText("Pro Men needs 3 judges, 0 assigned");
    await expect(page.getByRole("link", { name: /4\. Officials/ }).first()).toBeVisible();
    await page.getByLabel("Judge A: Pro Men").check();
    await page.getByLabel("Judge B: Pro Men").check();
    await expect(page.getByTestId("panel-warnings")).toContainText("Pro Men needs 3 judges, 2 assigned");
    await page.getByLabel("Judge C: Pro Men").check();
    await expect(page.getByTestId("panel-ok")).toBeVisible();
    await expect(page.getByTestId("panel-warnings")).toHaveCount(0);
    await expect.poll(async () => ((await org.db.from("panel_members").select("seat_no").eq("event_id", eventId).order("seat_no")).data ?? []).map((x) => x.seat_no).join(",")).toBe("1,2,3");

    // untick one: it warns again, nothing is blocked
    await page.getByLabel("Judge C: Pro Men").uncheck();
    await expect(page.getByTestId("panel-warnings")).toContainText("needs 3 judges, 2 assigned");

    // the head judge who also scores is on every panel
    await page.getByLabel("Judge C: Pro Men").check();
    const head = seatCard(page, "Head Hal");
    await head.getByLabel("Head judge also scores").uncheck();
    await head.getByLabel("Head judge also scores").check();
    await expect(page.getByLabel("Head Hal: Pro Men")).toBeChecked();
    expect((await org.db.from("divisions").select("panel_id").eq("id", div!.id).single()).data!.panel_id).not.toBeNull();
  } finally {
    await org.cleanup();
  }
});

test("regenerate is refused while that seat's heat runs, with a plain sentence, and nobody is signed out", async ({ page }) => {
  test.setTimeout(180_000);
  const org = await createOrganiser();
  try {
    const { eventId } = await publishedEvent(org);
    const { data: div } = await org.db.from("divisions").insert({ event_id: eventId, name: "Pro Men", sort_order: 1 }).select("id").single();
    const { data: round } = await org.db.from("rounds").insert({ division_id: div!.id, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} }).select("id").single();
    await org.db.from("heats").insert({ round_id: round!.id, division_id: div!.id, event_id: eventId, number: 3, duration_sec: 600, status: "running", started_at: new Date().toISOString() });
    await org.signIn(page, `/org/events/${eventId}/officials`);
    const pin = await addSeat(page, "Head Hal", "Head judge");
    // the head judge is connected (bound to this login for the test)
    const { data: me } = await org.db.auth.admin.listUsers({ perPage: 200 });
    const userId = me!.users.find((u) => u.email === org.email)!.id;
    await org.db.from("judge_seats").update({ auth_user_id: userId }).eq("event_id", eventId);

    const card = seatCard(page, "Head Hal");
    await card.getByRole("button", { name: "Regenerate PIN" }).click();
    await card.getByRole("button", { name: "Yes, regenerate" }).click();
    await expect(page.locator("[role=alert]").filter({ hasText: "Wait until Heat 3 ends, or end the heat first." })).toBeVisible();
    const { data: seat } = await org.db.from("judge_seats").select("auth_user_id").eq("event_id", eventId).single();
    expect(seat!.auth_user_id).toBe(userId);
    await card.getByTestId("show-pin").click();
    await expect(card.getByTestId("shown-pin")).toHaveText(pin); // the PIN did not change
  } finally {
    await org.cleanup();
  }
});
