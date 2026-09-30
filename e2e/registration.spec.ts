import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect, installSupabaseProxy } from "./base";
import { createOrganiser } from "./organiser";

type Org = Awaited<ReturnType<typeof createOrganiser>>;
const file = JSON.parse(readFileSync("presets/identification/schemes.json", "utf8")) as { palette: unknown; schemes: Array<{ id: string }> };
const scheme = (id: string) => ({ ...file.schemes.find((s) => s.id === id)!, palette: file.palette });

async function registrationEvent(org: Org, settings: Record<string, unknown> = {}, schemeId = "brand-launch-same-kites") {
  const slug = `e2e-reg-${org.run}`;
  const { data: ev } = await org.db
    .from("events")
    .insert({
      organisation_id: org.orgId,
      name: `Register Cup ${org.run}`,
      slug,
      status: "published",
      start_date: "2026-10-10",
      end_date: "2026-10-11",
      location: "El Gouna",
      settings: { registrationOpen: true, identification: { scheme: scheme(schemeId), basedOn: schemeId, allowDivisionOverride: false }, ...settings },
    })
    .select("id")
    .single();
  const { data: div } = await org.db.from("divisions").insert({ event_id: ev!.id, name: "Pro Men", sort_order: 1, description: "Advanced riders, 18 and over" }).select("id").single();
  await org.db.from("divisions").insert({ event_id: ev!.id, name: "Youth U16", sort_order: 2, description: "Under 16 on the day" });
  return { eventId: ev!.id, slug, divisionId: div!.id };
}

async function fillBasics(p: Page, email: string, first = "Rita") {
  await p.getByLabel("First name", { exact: true }).fill(first);
  await p.getByLabel("Last name", { exact: true }).fill("Rider");
  await p.getByLabel("Email", { exact: true }).fill(email);
}

test("Event step: registration open / closed, closing day and time, most riders per division, and the closed message are saved", async ({ page }) => {
  test.setTimeout(120_000);
  const org = await createOrganiser();
  try {
    const { eventId, slug } = await registrationEvent(org, { registrationOpen: false });
    await org.signIn(page, `/org/events/${eventId}/event`);
    const box = page.getByTestId("registration-settings");
    await expect(box.getByRole("radio", { name: "Closed" })).toBeChecked();
    await box.getByRole("radio", { name: "Open" }).check();
    await box.getByLabel(/^Closing day/).fill("2026-10-09");
    await box.getByLabel(/^Closing time/).fill("18:30");
    await box.getByLabel(/^Most riders per division/).fill("24");
    await box.getByLabel(/^Message shown when registration is closed/).fill("Registration is closed. Email us about a wild card.");
    await page.getByRole("button", { name: "Save event" }).click();
    await expect.poll(async () => (await org.db.from("events").select("settings").eq("id", eventId).single()).data?.settings).toMatchObject({
      registrationOpen: true,
      registrationClosesOn: "2026-10-09",
      registrationClosesTime: "18:30",
      registrationMaxPerDivision: 24,
      registrationClosedMessage: "Registration is closed. Email us about a wild card.",
    });
    await expect(box.getByTestId("slug-link")).toHaveAttribute("href", `/e/${slug}/register`);

    // a time without a day is refused in plain words
    await box.getByLabel(/^Closing day/).fill("");
    await page.getByRole("button", { name: "Save event" }).click();
    await expect(page.getByText("Choose the closing day as well as the time")).toBeVisible();
  } finally {
    await org.cleanup();
  }
});

test("public registration: branding, division levels, gear for the scheme, a photo shrunk on the phone, then the organiser approves", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const org = await createOrganiser();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await installSupabaseProxy(phone);
    const { eventId, slug, divisionId } = await registrationEvent(org);
    const p = await phone.newPage();
    await p.goto(`/e/${slug}/register`);
    await expect(p.getByRole("heading", { name: `Register Cup ${org.run}` })).toBeVisible();
    await expect(p.getByText("Advanced riders, 18 and over")).toBeVisible(); // the division's level
    await expect(p.getByText("Under 16 on the day")).toBeVisible();

    await p.getByRole("radio", { name: /Pro Men/ }).check();
    await fillBasics(p, `rita-${org.run}@example.com`);
    await p.getByLabel("Phone (WhatsApp)").fill("+20 100 123 4567");
    await p.getByLabel("Nationality").fill("Egypt");
    await p.getByLabel("Sponsor").fill("Arrow");
    await p.getByLabel("WOO ID (optional)").fill("W-123");
    // the brand-launch scheme asks for kite size and colours, the rash guard colour and a photo
    await p.getByLabel("Kite size (m)").fill("9");
    await p.getByLabel("Kite colours").fill("blue/white");
    await p.getByLabel("Rash guard colour").selectOption({ label: "Green" });

    // a big photo is shrunk on the phone to under 2 MB before it is sent
    const big = await p.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 3000;
      c.height = 2000;
      const g = c.getContext("2d")!;
      for (let y = 0; y < 2000; y += 4) for (let x = 0; x < 3000; x += 4) { g.fillStyle = `rgb(${(x * 7 + y) % 256},${(y * 5 + x) % 256},${(x + y * 3) % 256})`; g.fillRect(x, y, 4, 4); }
      return c.toDataURL("image/png").split(",")[1];
    });
    const bigBuffer = Buffer.from(big, "base64");
    await p.getByTestId("photo-input").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: bigBuffer });
    await expect(p.getByTestId("photo-ready")).toBeVisible();
    const kb = Number(/\((\d+) KB\)/.exec(await p.getByTestId("photo-ready").innerText())![1]);
    expect(kb).toBeLessThan(2048);

    // consent is needed
    await expect(p.getByTestId("registration-submit")).toBeDisabled();
    await p.getByRole("checkbox").check();
    await p.getByTestId("registration-submit").click();
    await expect(p.getByText("Registered — awaiting confirmation")).toBeVisible();

    const { data: rider } = await org.db.from("riders").select("id, first_name, email, phone, nationality, sponsor, woo_id, photo_url").eq("organisation_id", org.orgId).eq("email", `rita-${org.run}@example.com`).single();
    expect(rider).toMatchObject({ first_name: "Rita", phone: "+20 100 123 4567", nationality: "Egypt", sponsor: "Arrow", woo_id: "W-123" });
    expect(rider!.photo_url).toMatch(new RegExp(`^${org.orgId}/reg/[0-9a-f-]{36}\\.jpg$`));
    const { data: entry } = await org.db.from("entries").select("status, source, consent_at, identifiers, division_id").eq("rider_id", rider!.id).single();
    expect(entry).toMatchObject({ status: "registered", source: "self", division_id: divisionId, identifiers: { kite: { size: "9", colours: "blue/white" }, rashguard_colour: "green" } });
    expect(entry!.consent_at).not.toBeNull();
    const stored = await org.db.storage.from("rider-photos").download(rider!.photo_url!);
    expect(stored.data!.size).toBeLessThan(2 * 1024 * 1024);
    expect(stored.data!.type).toBe("image/jpeg");
    const b64 = Buffer.from(await stored.data!.arrayBuffer()).toString("base64");
    const dims = await p.evaluate(async (data) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${data}`)).blob());
      return { w: bmp.width, h: bmp.height };
    }, b64);
    expect(Math.max(dims.w, dims.h)).toBeLessThanOrEqual(1200); // shrunk on the phone from 3000 × 2000
    expect(Math.abs(dims.w / dims.h - 1.5)).toBeLessThan(0.02); // and the shape is kept
    await org.db.storage.from("rider-photos").remove([rider!.photo_url!]);

    // the organiser sees it waiting and approves it
    await org.signIn(page, `/org/events/${eventId}/riders?division=${divisionId}`);
    await expect(page.getByTestId("registration")).toContainText("Rita Rider");
    await expect(page.getByTestId("registration")).toContainText("Egypt");
    await page.getByTestId("registration").getByRole("button", { name: "Approve" }).click();
    await expect(page.getByTestId("rider-row")).toHaveCount(1);
    expect((await org.db.from("entries").select("status").eq("rider_id", rider!.id).single()).data!.status).toBe("confirmed");
  } finally {
    await phone.close();
    await org.cleanup();
  }
});

test("public registration: closed shows the organiser's message, full says ask the organiser, archived and draft events are not found, a filled hidden field adds nothing", async ({ browser }) => {
  test.setTimeout(240_000);
  const org = await createOrganiser();
  const phone = await browser.newContext();
  try {
    await installSupabaseProxy(phone);
    const { eventId, slug, divisionId } = await registrationEvent(org, { registrationOpen: false, registrationClosedMessage: "Registration is closed. Email us about a wild card." }, "name-callout");
    const p = await phone.newPage();

    // closed: the organiser's message and no form
    await p.goto(`/e/${slug}/register`);
    await expect(p.getByTestId("registration-closed")).toContainText("Registration is closed");
    await expect(p.getByTestId("registration-closed")).toContainText("Email us about a wild card.");
    await expect(p.getByTestId("registration-form")).toHaveCount(0);

    // open, but the closing moment passed a minute ago: closed again
    const past = new Date(Date.now() - 2 * 60_000);
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(past);
    const g = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    const setSettings = async (patch: Record<string, unknown>) => {
      const { data } = await org.db.from("events").select("settings").eq("id", eventId).single();
      await org.db.from("events").update({ settings: { ...(data!.settings as object), ...patch } }).eq("id", eventId);
    };
    await setSettings({ registrationOpen: true, registrationClosesOn: `${g.year}-${g.month}-${g.day}`, registrationClosesTime: `${g.hour}:${g.minute}` });
    await p.goto(`/e/${slug}/register`);
    await expect(p.getByTestId("registration-closed")).toBeVisible();
    await setSettings({ registrationOpen: true, registrationClosesOn: null, registrationClosesTime: null });

    // the hidden field: looks like success, stores nothing
    await p.goto(`/e/${slug}/register`);
    await p.getByRole("radio", { name: /Pro Men/ }).check();
    await fillBasics(p, `bot-${org.run}@example.com`, "Bot");
    await p.getByRole("checkbox").check();
    await p.locator("#reg-website").fill("http://spam.test", { force: true });
    await p.getByTestId("registration-submit").click();
    await expect(p.getByText("Registered — awaiting confirmation")).toBeVisible();
    expect((await org.db.from("riders").select("id").eq("organisation_id", org.orgId).eq("email", `bot-${org.run}@example.com`)).data).toEqual([]);

    // a maximum per division: the next rider sees "Full"
    await setSettings({ registrationMaxPerDivision: 1 });
    await p.goto(`/e/${slug}/register`);
    await p.getByRole("radio", { name: /Pro Men/ }).check();
    await fillBasics(p, `one-${org.run}@example.com`, "One");
    await p.getByRole("checkbox").check();
    await p.getByTestId("registration-submit").click();
    await expect(p.getByText("Registered — awaiting confirmation")).toBeVisible();
    await p.goto(`/e/${slug}/register`);
    await expect(p.getByRole("radio", { name: /Pro Men — full, ask the organiser/ })).toBeDisabled();
    await expect(p.getByRole("radio", { name: /Youth U16/ })).toBeEnabled(); // other divisions are not affected
    await org.db.from("entries").update({ status: "withdrawn" }).eq("division_id", divisionId);
    await p.goto(`/e/${slug}/register`);
    await expect(p.getByRole("radio", { name: "Pro Men" })).toBeEnabled(); // a withdrawn rider does not count
    await setSettings({ registrationMaxPerDivision: null });

    // archived and draft events are not found
    await org.db.from("events").update({ archived_at: new Date().toISOString() }).eq("id", eventId);
    await p.goto(`/e/${slug}/register`);
    await expect(p.getByText("This page could not be found")).toBeVisible();
    await org.db.from("events").update({ archived_at: null, status: "draft" }).eq("id", eventId);
    await p.goto(`/e/${slug}/register`);
    await expect(p.getByText("This page could not be found")).toBeVisible();
  } finally {
    await phone.close();
    await org.cleanup();
  }
});

test("public registration: the sixth try from one address in an hour is refused politely", async ({ browser }) => {
  test.setTimeout(300_000);
  const org = await createOrganiser();
  const phone = await browser.newContext();
  try {
    await installSupabaseProxy(phone);
    const { slug } = await registrationEvent(org, {}, "name-callout");
    const p = await phone.newPage();
    for (let i = 1; i <= 6; i++) {
      await p.goto(`/e/${slug}/register`);
      await p.getByRole("radio", { name: /Pro Men/ }).check();
      await fillBasics(p, `flood${i}-${org.run}@example.com`, `Flood${i}`);
      await p.getByRole("checkbox").check();
      await p.getByTestId("registration-submit").click();
      if (i < 6) await expect(p.getByText("Registered — awaiting confirmation")).toBeVisible();
      else await expect(p.getByTestId("registration-error")).toContainText("Too many tries");
    }
  } finally {
    await phone.close();
    await org.cleanup();
  }
});
