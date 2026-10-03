import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { drawProjection } from "../src/lib/draw/projection";
import { expandFormat } from "../src/lib/engine/ladder";
import { generatePin } from "../src/lib/join/pin";
import { encryptPin, tryPinKey } from "../src/lib/officials/pin-crypto";
import { parseFormatTemplate } from "../src/lib/schemas/format-template";
import { builtInSchemes } from "../src/lib/schemas/identification";
import { expect, test } from "./base";
import { record } from "./cleanup";
import { createOrganiser } from "./organiser";

/**
 * The manual's screenshots (docs/manual/img), retaken with `npm run manual:shots` after every change (docs/manual/README.md, the update rule).
 * Builds a throwaway organisation on the hosted project with a realistic event — three divisions, 24 riders, officials with PINs, locked draws, a run order —
 * photographs every setup screen, copies the event into a simulation and plays it at ×20 until a few heats are published, photographs the live and public
 * screens, then removes everything (the ledger in e2e/cleanup.ts is the backstop). Arrow, EKL and the Demo are never touched.
 * Runs only when MANUAL_SHOTS=1 (the npm script sets it), so the normal browser test run skips it.
 */
const OUT = path.join(process.cwd(), "docs", "manual", "img");
const LAPTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

const RIDERS: Array<[string, string, string, string]> = [
  ["Karim", "Hassan", "EG", "Arrow"], ["Lukas", "Brandt", "DE", "Core"], ["Mateo", "Silva", "BR", "Duotone"], ["Tom", "Hendriks", "NL", "North"],
  ["Youssef", "Nabil", "EG", "Arrow"], ["Jake", "Morris", "GB", "F-One"], ["Pierre", "Laurent", "FR", "Cabrinha"], ["Andrea", "Russo", "IT", "Ozone"],
  ["Diego", "Martín", "ES", "Naish"], ["Omar", "Farouk", "EG", "WOO"], ["Ryan", "Cole", "ZA", "Slingshot"], ["Felix", "Weber", "AT", "Core"],
  ["Mia", "Costa", "PT", "Duotone"], ["Noor", "Haddad", "JO", "Arrow"], ["Lena", "Vogt", "DE", "North"], ["Sofia", "Rossi", "IT", "F-One"],
  ["Hana", "Saleh", "EG", "Arrow"], ["Emma", "Visser", "NL", "Ozone"],
  ["Adam", "Mostafa", "EG", "Arrow"], ["Leo", "Dubois", "FR", "Cabrinha"], ["Nils", "Berg", "SE", "Naish"], ["Sami", "Khalil", "EG", "WOO"], ["Theo", "Klein", "DE", "Core"], ["Ziad", "Adel", "EG", "Arrow"],
];
const DIVISIONS = [
  { name: "Pro Men", riders: [0, 12], format: "heats4-top2-single-elim", description: "Open to all riders, 18 and over" },
  { name: "Pro Women", riders: [12, 18], format: "megaloop-women-6", description: "Open to all women riders" },
  { name: "Youth U16", riders: [18, 24], format: "single-final", description: "Born 2010 or later" },
];
const SEATS: Array<[string, "judge" | "head" | "spotter" | "announcer" | "observer"]> = [
  ["Judge 1 · Amr", "judge"], ["Judge 2 · Laura", "judge"], ["Judge 3 · Sven", "judge"], ["Head judge · Nadia", "head"], ["Spotter · Hamdy", "spotter"], ["Announcer · Max", "announcer"],
  ["Observer · Dina", "observer"],
];

async function shot(page: Page, name: string, size: { width: number; height: number }, settle = 600, hideNote = false, ready?: () => Promise<unknown>) {
  await page.setViewportSize(size);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(settle);
  if (ready) await ready();
  // the development server's own badge is not part of the product
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);
  // officials never see the organiser's Note button; it shows here only because an organiser holds the seat
  if (hideNote) await page.addStyleTag({ content: "[data-testid=note-button] { display: none !important; }" }).catch(() => undefined);
  await page.screenshot({ path: path.join(OUT, `${name}-${size.width}.png`) });
}

/** The development server restarts itself when it runs low on memory: a page that fails to load is asked for again. */
async function open(page: Page, url: string) {
  for (let i = 0; ; i++) {
    try {
      await page.goto(url, { timeout: 90_000 });
      return;
    } catch (e) {
      if (i >= 4) throw e;
      await page.waitForTimeout(8000);
    }
  }
}

/** Presses a simulator button until the panel shows the result: a tap made before the page's scripts have loaded does nothing, so it is tried again. */
async function pressUntil(page: Page, testId: string, done: () => Promise<boolean>) {
  for (let i = 0; i < 10; i++) {
    await page.getByTestId(testId).click();
    for (let j = 0; j < 10; j++) {
      if (await done()) return;
      await page.waitForTimeout(500);
    }
  }
  throw new Error(`${testId} did not take effect`);
}

test.skip(process.env.MANUAL_SHOTS !== "1", "run with npm run manual:shots");

test("manual screenshots", async ({ page, context, browser }) => {
  test.setTimeout(45 * 60_000);
  mkdirSync(OUT, { recursive: true });
  const org = await createOrganiser({ platformAdmin: "owner" });
  const db = org.db;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const must = <T extends Record<string, any>>(r: { data: T | T[] | null; error: { message: string } | null }, what: string): T => {
    if (r.error || r.data === null) throw new Error(`${what}: ${r.error?.message}`);
    return r.data as T;
  };
  const simIds: string[] = [];
  try {
    // ---------------------------------------------------------------- the event
    await db.from("organisations").update({ name: "Gouna Big Air (sample)" }).eq("id", org.orgId);
    const tz = "Africa/Cairo";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(Date.now() + 86_400_000));
    const lycra = builtInSchemes().find((s) => s.id === "vests-per-heat")!;
    const slug = `gouna-sample-${org.run}`;
    const event = must(
      await db
        .from("events")
        .insert({
          organisation_id: org.orgId,
          name: "Gouna Big Air (sample)",
          slug,
          status: "published",
          timezone: tz,
          start_date: today,
          end_date: tomorrow,
          location: "El Gouna, Egypt",
          settings: { publicLiveScores: "live", publicResultsOnPublish: true, readyCallMin: 15, livePollSec: 7, maxRunningHeats: 1, windCallBanner: true, registrationOpen: true, identification: { scheme: lycra, allowDivisionOverride: false } } as never,
          branding: { sponsors: [{ name: "Arrow" }, { name: "WOO Sports" }] } as never,
        })
        .select("id")
        .single(),
      "event",
    );
    const { data: model } = await db.from("scoring_models").select("id").is("organisation_id", null).eq("key", "legacy-kol-best3-variety").order("version", { ascending: false }).limit(1).single();

    // officials with PINs (the same encrypted PIN the Officials step makes), three judges on every panel
    const key = tryPinKey();
    if (!key) throw new Error("No PIN key on this machine (SUPABASE_SERVICE_ROLE_KEY or SEAT_PIN_KEY)");
    const seatIds: Record<string, string> = {};
    for (const [name, role] of SEATS) {
      const seat = must(await db.from("judge_seats").insert({ event_id: event.id, name, role, scores: false, status: "active", active: true }).select("id").single(), `seat ${name}`);
      seatIds[name] = seat.id;
      for (let i = 0; i < 8; i++) {
        const pin = generatePin();
        const { error } = await db.rpc("set_seat_pin", { p_seat: seat.id, p_pin: pin, p_enc: encryptPin(pin, key) });
        if (!error) break;
      }
    }
    const judges = SEATS.filter(([, r]) => r === "judge").map(([n]) => seatIds[n]);

    // three divisions: rules, riders, a locked draw made by the real draw engine
    const heatIds: string[] = [];
    let n = 0;
    for (const [i, d] of DIVISIONS.entries()) {
      const panel = must(await db.from("panels").insert({ event_id: event.id, name: d.name }).select("id").single(), "panel");
      let s = 0;
      for (const j of judges) await db.from("panel_members").insert({ panel_id: panel.id, judge_seat_id: j, seat_no: ++s });
      const { data: fmt } = await db.from("format_templates").select("id, json").is("organisation_id", null).eq("key", d.format).order("version", { ascending: false }).limit(1).single();
      const division = must(
        await db
          .from("divisions")
          .insert({ event_id: event.id, name: d.name, sort_order: i + 1, description: d.description, scoring_model_id: model!.id, scoring_overrides: { heat: { maxAttemptsPerRider: 7 } } as never, format_template_id: fmt!.id, panel_id: panel.id })
          .select("id")
          .single(),
        "division",
      );
      const entries: Array<{ id: string; name: string }> = [];
      for (let r = d.riders[0]; r < d.riders[1]; r++) {
        const [first, last, nat, sponsor] = RIDERS[r];
        const rider = must(await db.from("riders").insert({ organisation_id: org.orgId, first_name: first, last_name: last, nationality: nat, sponsor }).select("id").single(), "rider");
        const entry = must(await db.from("entries").insert({ division_id: division.id, rider_id: rider.id, seed: r - d.riders[0] + 1, status: "confirmed", source: "manual" }).select("id").single(), "entry");
        entries.push({ id: entry.id, name: `${first} ${last}` });
      }
      const template = parseFormatTemplate(fmt!.json);
      const draw = expandFormat(template, entries, { identification: "vests-per-heat" });
      const lockedAt = new Date().toISOString();
      await db.from("divisions").update({ draw: draw as never, draw_at_lock: draw as never, draw_locked_at: lockedAt }).eq("id", division.id);
      const projection = drawProjection(draw);
      const roundIds = new Map<string, string>();
      for (const r of projection.rounds) roundIds.set(r.key, must(await db.from("rounds").insert({ division_id: division.id, sort_order: r.sort_order, name: r.name, short_name: r.short_name, spec: r.spec as never }).select("id").single(), "round").id);
      for (const h of projection.heats) {
        const row = must(
          await db.from("heats").insert({ round_id: roundIds.get(h.round_key)!, division_id: division.id, event_id: event.id, number: h.number, draw_uid: h.uid, duration_sec: h.duration_sec, warm_up_sec: h.warm_up_sec }).select("id").single(),
          "heat",
        );
        heatIds.push(row.id);
        for (const slot of h.slots) await db.from("heat_slots").insert({ heat_id: row.id, position: slot.position, entry_id: slot.entry_id, vest_colour: slot.vest_colour, source: slot.source as never });
      }
      n += entries.length;
    }
    expect(n).toBe(24);

    // today's run order: every heat, a lunch break, the first heat pinned at the next half hour (so the day looks on time), active
    const nowCairo = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).split(":").map(Number);
    const firstMin = Math.min(23 * 60, Math.ceil((nowCairo[0] * 60 + nowCairo[1] + 20) / 30) * 30);
    const firstStart = `${String(Math.floor(firstMin / 60)).padStart(2, "0")}:${String(firstMin % 60).padStart(2, "0")}`;
    const items = heatIds.map((id, i) => ({ id: `i${i + 1}`, kind: "heat", heatId: id }));
    items.splice(Math.min(6, items.length), 0, { id: "lunch", kind: "break", label: "Lunch", durationMin: 45 } as never);
    must(await db.from("schedule_plans").insert({ event_id: event.id, day: today, name: "Plan A – Good wind", active: true, items: items as never, anchors: { i1: firstStart }, defaults: { breakAfterHeatMin: 2, breakAfterRoundMin: 5 } as never }).select("id").single(), "plan");
    must(await db.from("schedule_plans").insert({ event_id: event.id, day: today, name: "Plan B – Bad wind", active: false, items: items.filter((x) => x.kind !== "break") as never, anchors: { i1: "13:00" } }).select("id").single(), "plan B");

    // ---------------------------------------------------------------- organiser setup screens
    await org.signIn(page, "/org");
    await page.setViewportSize(LAPTOP);
    await expect(page.getByText("Gouna Big Air (sample)").first()).toBeVisible();
    await shot(page, "org-events", LAPTOP);
    const base = `/org/events/${event.id}`;
    for (const [step, name] of [["event", "org-event"], ["riders", "org-riders"], ["officials", "org-officials"], ["draw", "org-draw"], ["schedule", "org-run-order"], ["", "org-go-live"]] as const) {
      await open(page, `${base}/${step}`);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await shot(page, name, LAPTOP, 1200);
      await shot(page, name, PHONE, 1200);
    }
    // the Event step's "Public page" card (behind More settings)
    await open(page, `${base}/event`);
    await page.setViewportSize(LAPTOP);
    await expect(async () => {
      if (!(await page.getByTestId("public-page-settings").isVisible())) await page.getByTestId("advanced-toggle").click({ timeout: 3000 });
      await expect(page.getByTestId("public-page-settings")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);
    await page.getByTestId("public-page-settings").screenshot({ path: path.join(OUT, "org-event-public-page-1280.png") });
    await open(page, `${base}/divisions`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.setViewportSize(LAPTOP);
    // the first division's settings, scrolled so its tabs are at the top
    const tabs = page.getByRole("tablist").first();
    if (!(await tabs.isVisible().catch(() => false))) await page.getByRole("button", { name: /Edit scoring & format/ }).first().click();
    const toTabs = async () => {
      await page.getByRole("tablist").first().scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -140));
    };
    await toTabs();
    await shot(page, "org-divisions-scoring", LAPTOP, 1500);
    await page.setViewportSize(PHONE);
    await toTabs();
    await shot(page, "org-divisions-scoring", PHONE, 1200);
    await page.setViewportSize(LAPTOP);
    const formatTab = page.getByRole("tab", { name: "Format" }).first();
    if (await formatTab.isVisible().catch(() => false)) await formatTab.click();
    await toTabs();
    await shot(page, "org-divisions-format", LAPTOP, 1500);

    // signed-out pages: sign-in, the event's join tab and registration, the home page
    const visitor = await browser.newContext({ viewport: PHONE });
    const v = await visitor.newPage();
    await open(v, "/org/login");
    await shot(v, "org-login", PHONE);
    await open(v, `/e/${slug}/join`);
    await shot(v, "public-join", PHONE, 1200);
    await open(v, `/e/${slug}/register`);
    await shot(v, "public-register", PHONE, 1200);
    await open(v, "/");
    await shot(v, "public-home", PHONE, 1500);
    await visitor.close();

    // a second organiser of the sample organisation, so the organisation page shows Remove
    const second = await db.auth.admin.createUser({ email: `e2e-${org.run}-organiser2@example.com`, email_confirm: true });
    if (second.data.user) {
      org.trackUser(second.data.user.id);
      await db.from("memberships").insert({ organisation_id: org.orgId, user_id: second.data.user.id, role: "owner" });
    }

    // ---------------------------------------------------------------- admin (the feedback list shows only the sample event's note, never real notes)
    const { data: me } = await db.auth.admin.listUsers({ perPage: 1000 });
    const ownerId = me.users.find((u) => u.email === org.email)?.id;
    await db.from("feedback_notes").insert({ organisation_id: org.orgId, author_user_id: ownerId!, author_role: "organiser", event_id: event.id, page: `/org/events/${event.id}/schedule`, page_label: "Run order step", body: "The lunch break should move with the wind hold.", tag: "idea", organisation_name: "Gouna Big Air (sample)", event_name: "Gouna Big Air (sample)" } as never);
    for (const [url, name] of [[`/admin?q=${encodeURIComponent("Gouna Big Air")}`, "admin-organisations"], [`/admin/organisations/${org.orgId}`, "admin-organisation"], [`/admin/organisations/${org.orgId}#invite-h`, "admin-invite"], ["/admin/settings", "admin-settings"], [`/admin/feedback?event=${event.id}`, "admin-feedback"], ["/admin/health", "admin-health"]] as const) {
      await open(page, url);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      if (name === "admin-invite") await page.locator("#invite-h").scrollIntoViewIfNeeded().catch(() => undefined);
      if (name === "admin-invite") await page.evaluate(() => window.scrollBy(0, -16));
      if (name === "admin-organisation") await page.getByRole("heading", { name: "Organisers" }).scrollIntoViewIfNeeded().catch(() => undefined);
      if (name === "admin-organisation") await page.evaluate(() => window.scrollBy(0, -16));
      if (name === "admin-organisations") {
        const search = page.getByRole("searchbox").first();
        if (await search.isVisible().catch(() => false)) await search.fill("Gouna Big Air");
      }
      await shot(page, name, LAPTOP, 1500);
    }

    // ---------------------------------------------------------------- the simulation: results to show
    await page.setViewportSize(LAPTOP);
    await open(page, `${base}/simulate`);
    await page.getByTestId("clone-name").fill("Gouna Big Air (simulation)").catch(() => undefined);
    await page.getByTestId("run-as-simulation-button").click();
    await expect(page.getByTestId("clone-done")).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("clone-open").click();
    await expect(page.getByTestId("sim-console")).toBeVisible({ timeout: 60_000 });
    const simId = /events\/([0-9a-f-]{36})\/simulate/.exec(page.url())![1];
    simIds.push(simId);
    const simSlug = must(await db.from("events").select("slug").eq("id", simId).single(), "sim slug").slug as string;
    await pressUntil(page, "sim-speed-20", async () => (await page.getByTestId("sim-speed-20").getAttribute("aria-pressed")) === "true");
    await pressUntil(page, "sim-start", async () => (await page.getByTestId("sim-state").getAttribute("data-state")) === "playing");
    await expect(page.getByTestId("stat-heats")).toHaveText(/^([4-9]|\d\d) of \d+ heats published/, { timeout: 25 * 60_000 });
    // the next heat at normal speed (a speed change applies to heats that start afterwards): wait until it is on the water
    await pressUntil(page, "sim-speed-1", async () => (await page.getByTestId("sim-speed-1").getAttribute("aria-pressed")) === "true");
    const runningFull = async () => {
      const { data } = await db.from("heats").select("id, duration_sec").eq("event_id", simId).eq("status", "running");
      return (data ?? []).find((h) => h.duration_sec >= 300)?.id ?? null;
    };
    await expect.poll(runningFull, { timeout: 8 * 60_000, intervals: [3000] }).not.toBeNull();
    const liveHeat = (await runningFull())!;
    // the page ticks every 2 s but a tick holds the lock for 6 s, so the line says "Another tab…" between ticks even with one tab: take the picture on a real line
    await shot(page, "simulator", LAPTOP, 3000, false, () => expect(page.getByTestId("sim-line")).not.toHaveText(/Another tab/, { timeout: 30_000 }));

    // the virtual spotter logs a few attempts of the heat on the water; the head judge console and the announcer view
    await expect
      .poll(async () => (await db.from("trick_attempts").select("id", { count: "exact", head: true }).eq("heat_id", liveHeat)).count ?? 0, { timeout: 6 * 60_000, intervals: [5000] })
      .toBeGreaterThan(5);
    const head = await context.newPage();
    await open(head, `/head/${simId}`);
    await shot(head, "console-laptop", LAPTOP, 4000);
    await shot(head, "console-phone", PHONE, 3000);
    await open(head, `/head/${simId}?mode=announcer`);
    await shot(head, "announcer", LAPTOP, 3000);

    // judge 1 held by this login (the simulator steps aside for that seat): the judge's queue fills as the virtual spotter logs
    const { data: simSeatRows } = await db.from("judge_seats").select("id, name, role").eq("event_id", simId);
    const simSeats = (simSeatRows ?? []) as Array<{ id: string; name: string; role: string }>;
    const judge1 = simSeats.find((s) => s.role === "judge")!;
    const spotter = simSeats.find((s) => s.role === "spotter")!;
    const simTab = page;
    const judgeTab = await context.newPage();
    await open(judgeTab, `/org/events/${simId}/simulate/view?as=seat&seat=${judge1.id}`);
    await simTab.bringToFront();
    await judgeTab.bringToFront();
    await expect(judgeTab.getByText(/waiting|Attempt/).first()).toBeVisible({ timeout: 60_000 });
    await shot(judgeTab, "judge", PHONE, 3000, true);


    // the public pages of the simulation, for this login only (the View as door switches the preview on)
    const pub = await context.newPage();
    await open(pub, `/org/events/${simId}/simulate/view?as=live`);
    await shot(pub, "public-live", PHONE, 2500, true);
    await open(pub, `/e/${simSlug}`);
    await shot(pub, "public-event", PHONE, 2000, true);
    await shot(pub, "public-event", LAPTOP, 2000, true);
    await open(pub, `/screen/${simSlug}`);
    await shot(pub, "big-screen", LAPTOP, 2500, true);
    // the same page in Day colours (this browser's own choice, undone straight after)
    await pub.evaluate(() => window.localStorage.setItem("bigair-screen-mode", "day"));
    await pub.reload();
    await shot(pub, "big-screen-day", LAPTOP, 2500, true);
    await pub.evaluate(() => window.localStorage.removeItem("bigair-screen-mode"));

    // the spotter's screen: this login takes the spotter seat (judge 1 goes back to the simulator)
    await open(judgeTab, `/org/events/${simId}/simulate/view?as=seat&seat=${spotter.id}`);
    await shot(judgeTab, "spotter", PHONE, 3000, true);
    await judgeTab.close();

    // stop, end the heat that is on, and look at the published results
    await simTab.bringToFront();
    await simTab.getByTestId("sim-stop").click();
    await db.from("heats").update({ status: "ended" }).eq("event_id", simId).in("status", ["running", "paused"]);
    for (const [url, name, sizes] of [
      [`/e/${simSlug}/results`, "public-results", [PHONE, LAPTOP]],
      [`/e/${simSlug}/ladder`, "public-ladder", [PHONE, LAPTOP]],
      [`/e/${simSlug}/placings`, "public-placings", [PHONE]],
      [`/e/${simSlug}/rules`, "public-rules", [PHONE]],
    ] as const) {
      await open(pub, url);
      for (const size of sizes) await shot(pub, name, size, 2000, true);
    }
    const { data: published } = await db.from("heat_results").select("entry_id").eq("event_id", simId).eq("place", 1).limit(1).maybeSingle();
    if (published) {
      await open(pub, `/e/${simSlug}/riders/${published.entry_id}`);
      await shot(pub, "public-rider", PHONE, 2000, true);
    }
  } finally {
    for (const id of simIds) {
      const { data } = await db.from("sim_seats").select("virtual_user").eq("event_id", id);
      for (const r of data ?? []) if (r.virtual_user) await db.auth.admin.deleteUser(r.virtual_user).catch(() => undefined);
    }
    await org.cleanup();
  }
});

/**
 * The trick base pages (Master presets, the editor, its publish step, a family card, and an event's Trick base tab with "Update to latest"). Its own
 * throwaway organisation; it publishes one master version for the pictures and removes it (and the ledger is the backstop). `npm run manual:shots`
 * runs it with the rest; `npm run manual:shots -- -g "trick base"` runs it alone.
 */
test("manual screenshots: trick base", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  mkdirSync(OUT, { recursive: true });
  const org = await createOrganiser({ platformAdmin: "owner" });
  const db = org.db;
  const mine: string[] = [];
  const top = async () => (await db.from("trick_vocabularies").select("id, version").is("organisation_id", null).is("event_id", null).eq("key", "big-air-vocabulary").order("version", { ascending: false }).limit(1).single()).data!;
  const start = (await top()).version;
  const track = async () => {
    const { data } = await db.from("trick_vocabularies").select("id").is("organisation_id", null).is("event_id", null).eq("key", "big-air-vocabulary").gt("version", start);
    for (const r of data ?? []) if (!mine.includes(r.id)) {
      mine.push(r.id);
      record({ trickVersionId: r.id });
    }
  };
  try {
    const { data: event } = await db.from("events").insert({ organisation_id: org.orgId, name: "Gouna Big Air", slug: `gouna-tricks-${org.run}`, status: "draft", timezone: "Africa/Cairo" }).select("id").single();
    await db.from("divisions").insert({ event_id: event!.id, name: "Pro Men", sort_order: 1 });
    await db.from("trick_vocabularies").insert({ organisation_id: org.orgId, event_id: event!.id, key: "event-additions", json: { blocks: [{ family: "base", key: "local_sloth_roll", label: "Sloth roll", category: "rotation", status: "proposed" }] }, content_hash: "x" });

    await org.signIn(page, "/admin/presets");
    await page.getByTestId("open-trick-base").waitFor();
    await shot(page, "admin-presets", LAPTOP, 1200);

    await open(page, "/admin/presets/trick-base");
    await page.locator("[data-testid=trick-editor][data-ready=true]").waitFor(); // a tap before the page is live is lost
    await shot(page, "admin-trick-base", LAPTOP, 1500);
    await shot(page, "admin-trick-base", PHONE, 1500);

    // the owner's walk-through: rename, alias, move, add with aliases, retire
    await page.setViewportSize(LAPTOP);
    await page.getByTestId("label-base:megaloop").fill("Mega loop");
    await page.getByTestId("alias-input-base:megaloop").fill("megaboost");
    await page.getByTestId("alias-input-base:megaloop").press("Enter");
    await page.getByTestId("moveto-addon:tic_tac").selectOption({ label: "Grabs & landings" });
    await page.getByTestId("add-block-name-base").fill("Tornado");
    await page.getByTestId("add-block-base").click();
    await page.getByTestId("alias-input-base:tornado").fill("tornado roll");
    await page.getByTestId("alias-input-base:tornado").press("Enter");
    await page.getByTestId("save-draft").click();
    await page.getByTestId("validation").waitFor(); // "tornado" is still an alias of Late rotations
    await page.getByTestId("validation").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, "admin-trick-base-validation-1280.png") });
    await page.getByTestId("alias-addon:late_rotations-tornado").getByRole("button").click();
    await page.getByTestId("retire-base:heart_attack").click();
    // close-ups: the sticky Save bar and the Note button would sit over them
    await page.addStyleTag({ content: "[data-testid=editor-actions], [data-testid=note-button], nextjs-portal { visibility: hidden !important; }" });
    const card = page.getByTestId("family-card-base");
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: path.join(OUT, "admin-trick-base-family-1280.png") });
    await page.getByTestId("naming").screenshot({ path: path.join(OUT, "admin-trick-base-naming-1280.png") });
    await page.addStyleTag({ content: "[data-testid=editor-actions] { visibility: visible !important; }" });
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("editor-status")).toContainText("(draft, not published)");
    await track();
    await page.getByTestId("publish").click();
    await page.getByTestId("publish-diff").waitFor();
    await page.getByTestId("publish-diff").screenshot({ path: path.join(OUT, "admin-trick-base-publish-1280.png") });
    await page.getByTestId("confirm-publish").click();
    await expect(page.getByTestId("editor-status")).toContainText("(published)");
    await page.getByTestId("history").scrollIntoViewIfNeeded();
    await page.getByTestId("history").screenshot({ path: path.join(OUT, "admin-trick-base-history-1280.png") });

    // the organiser's Trick base tab: the event is still on the older version
    await open(page, `/org/events/${event!.id}/divisions`);
    await page.getByRole("tab", { name: "Trick base" }).click();
    await page.getByTestId("update-summary").waitFor();
    await shot(page, "org-divisions-trickbase", LAPTOP, 1200);
  } finally {
    await track();
    await org.cleanup();
    if (mine.length) await db.from("trick_vocabularies").delete().in("id", mine);
  }
});

test("manual screenshots: releases", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  mkdirSync(OUT, { recursive: true });
  const { PRODUCT_VERSION } = await import("../src/lib/product-version");
  const { parseReleases } = await import("../src/lib/releases/releases");
  const { readFileSync } = await import("node:fs");
  const current = parseReleases(readFileSync(path.join(process.cwd(), "docs", "RELEASES.md"), "utf8")).find((r) => r.version === PRODUCT_VERSION)!;
  const org = await createOrganiser({ platformAdmin: "owner" });
  const db = org.db;
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  const me = users.users.find((u) => u.email === org.email)!.id;
  try {
    await db.from("organisations").update({ name: "Gouna Big Air (sample)" }).eq("id", org.orgId);
    // two checks ticked for the picture, only ones nobody has ticked; every tick this login made is removed at the end (the owner's real ticks stay)
    const { data: taken } = await db.from("release_check_ticks").select("check_key").eq("version", PRODUCT_VERSION);
    const free = current.checks.filter((c) => !(taken ?? []).some((t) => t.check_key === c.key)).slice(0, 2);
    await org.signIn(page, "/admin/releases");
    await page.getByTestId("release-current").waitFor();
    for (const c of free) {
      const box = page.locator(`[data-testid=release-check][data-key="${c.key}"] input`);
      await expect(async () => {
        if (!(await box.isChecked())) await box.check();
        const { data } = await db.from("release_check_ticks").select("check_key").eq("version", PRODUCT_VERSION).eq("check_key", c.key);
        expect(data).toHaveLength(1);
      }).toPass({ timeout: 30_000 });
    }
    await open(page, "/admin/releases");
    await shot(page, "admin-releases", LAPTOP, 1500);
    await shot(page, "admin-releases", PHONE, 1500);
    await open(page, "/admin/health");
    await shot(page, "admin-health", LAPTOP, 1500);
    await open(page, `/admin?q=${encodeURIComponent("Gouna Big Air")}`);
    const search = page.getByRole("searchbox").first();
    if (await search.isVisible().catch(() => false)) await search.fill("Gouna Big Air");
    await shot(page, "admin-organisations", LAPTOP, 1500);
  } finally {
    await db.from("release_check_ticks").delete().eq("ticked_by", me);
    await org.cleanup();
  }
});

/**
 * The Observer seat: the Officials step with Observer chosen, the observer's view (head judge console on a laptop, Judge 1 and the spotter on a phone), the
 * head judge's “1 observer watching” and the simulator's View as… card. Its own throwaway organisation and simulation, played at ×20 for live scores.
 * `npm run manual:shots -- -g "observer"` runs it alone.
 */
test("manual screenshots: observer", async ({ page, browser }) => {
  test.setTimeout(15 * 60_000);
  mkdirSync(OUT, { recursive: true });
  const { createLiveWorld } = await import("./live-world");
  const { installSupabaseProxy } = await import("./base");
  const w = await createLiveWorld();
  const db = w.db;
  let simId: string | null = null;
  const watcher = await browser.newContext();
  try {
    await installSupabaseProxy(watcher);
    await w.org.signIn(page, `/org/events/${w.eventId}/simulate`);
    await page.getByTestId("run-as-simulation-button").click();
    await expect(page.getByTestId("clone-done")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("clone-open").click();
    await expect(page.getByTestId("sim-console")).toBeVisible({ timeout: 60_000 });
    simId = /events\/([0-9a-f-]{36})\/simulate/.exec(page.url())![1];

    // the Officials step, Observer chosen (the seat itself is made with its own login, for the pictures)
    await open(page, `/org/events/${simId}/officials`);
    await page.getByLabel("Name", { exact: true }).fill("Observer · Dina (sponsor)");
    await page.getByLabel("Role", { exact: true }).selectOption({ label: "Observer" });
    await page.getByTestId("observer-help").waitFor();
    await shot(page, "org-officials-observer", LAPTOP, 800);
    const email = `e2e-${w.org.run}-observer@example.com`;
    const { data: u } = await db.auth.admin.createUser({ email, password: `Pw-${w.org.run}-obs`, email_confirm: true });
    w.org.trackUser(u.user!.id);
    const { data: seat } = await db.from("judge_seats").insert({ event_id: simId, name: "Dina (sponsor)", role: "observer", auth_user_id: u.user!.id, status: "active", active: true }).select("id").single();

    // play at ×5 until Judge 1 has scores in the running heat (slow enough that the heat is still on for the pictures)
    await open(page, `/org/events/${simId}/simulate`);
    await pressUntil(page, "sim-speed-5", async () => (await page.getByTestId("sim-speed-5").getAttribute("aria-pressed")) === "true");
    await pressUntil(page, "sim-start", async () => (await page.getByTestId("sim-state").getAttribute("data-state")) === "playing");
    const j1 = (await db.from("judge_seats").select("id").eq("event_id", simId).eq("name", "Judge 1").single()).data!.id as string;
    await expect.poll(async () => (await db.from("trick_scores").select("id", { count: "exact", head: true }).eq("judge_seat_id", j1)).count ?? 0, { timeout: 240_000 }).toBeGreaterThan(2);

    // the observer's own login
    const o = await watcher.newPage();
    const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email });
    await o.goto(`/auth/confirm?token_hash=${link!.properties!.hashed_token}&type=magiclink&next=${encodeURIComponent(`/observe/${simId}?view=head-wide`)}`);
    const frame = o.frameLocator("[data-testid=observer-frame]");
    const hideBadge = async () => {
      for (const f of o.frames()) await f.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);
    };
    await o.setViewportSize(LAPTOP);
    await frame.getByTestId("head-page").waitFor({ timeout: 90_000 });
    await o.waitForTimeout(2500);
    await hideBadge();
    await shot(o, "observer-head", LAPTOP, 500);
    await o.setViewportSize(PHONE);
    await o.getByTestId("observer-switcher").selectOption(`judge:${j1}`);
    await frame.getByTestId("history-row").first().waitFor({ timeout: 90_000 });
    await o.waitForTimeout(1500);
    await hideBadge();
    await shot(o, "observer-judge", PHONE, 500);
    const spotter = (await db.from("judge_seats").select("id").eq("event_id", simId).eq("role", "spotter").order("name").limit(1).single()).data!.id as string;
    await o.getByTestId("observer-switcher").selectOption(`spotter:${spotter}`);
    await frame.getByTestId("feed").waitFor({ timeout: 90_000 });
    await o.waitForTimeout(1500);
    await hideBadge();
    await shot(o, "observer-spotter", PHONE, 500);

    // the head judge's column: "1 observer watching" (the organiser's console reads the same)
    await page.setViewportSize(LAPTOP);
    await open(page, `/head/${simId}`);
    await page.getByTestId("observers-watching").waitFor({ timeout: 90_000 });
    await page.addStyleTag({ content: "nextjs-portal, [data-testid=note-button] { display: none !important; }" });
    await page.getByTestId("judges").screenshot({ path: path.join(OUT, "console-observers-1280.png") });

    // the simulator's View as… card with the Observer row
    await open(page, `/org/events/${simId}/simulate`);
    await page.getByTestId(`view-observer-${seat!.id}`).waitFor({ timeout: 60_000 });
    await page.addStyleTag({ content: "nextjs-portal, [data-testid=note-button] { display: none !important; }" });
    await page.getByTestId("sim-viewas").screenshot({ path: path.join(OUT, "simulator-viewas-observer-1280.png") });
    await page.getByTestId("sim-stop").click().catch(() => undefined);
  } finally {
    await watcher.close().catch(() => undefined);
    if (simId) {
      const { data } = await db.from("sim_seats").select("virtual_user").eq("event_id", simId);
      for (const r of data ?? []) if (r.virtual_user) await db.auth.admin.deleteUser(r.virtual_user).catch(() => undefined);
    }
    await w.cleanup();
  }
});
