import type { BrowserContext, FrameLocator, Page } from "@playwright/test";
import { closePhones, expect, installSupabaseProxy, test } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";

/**
 * The Observer seat, on a throwaway organisation's simulation (the Demo, Arrow and EKL are never touched): the organiser adds an Observer on the Officials step,
 * a phone joins with its PIN and flips through every official's screen while the simulator plays at ×10. Judge 1's scores arrive on the observed judge screen,
 * every control of every observed screen is disabled, a write sent with the observer's own sign-in is refused by the database, switching the seat off ends
 * the view at once, and the simulator's View as… opens the observer view.
 */
async function removeSimulatorUsers(w: LiveWorld, eventIds: string[]) {
  for (const id of eventIds) {
    const { data } = await w.db.from("sim_seats").select("virtual_user").eq("event_id", id);
    for (const r of data ?? []) if (r.virtual_user) await w.db.auth.admin.deleteUser(r.virtual_user).catch(() => undefined);
  }
}

async function makeSimulation(page: Page, w: LiveWorld): Promise<string> {
  await w.org.signIn(page, `/org/events/${w.eventId}/simulate`);
  await page.getByTestId("run-as-simulation-button").click();
  await expect(page.getByTestId("clone-done")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("clone-open").click();
  await expect(page.getByTestId("sim-console")).toBeVisible({ timeout: 60_000 });
  return /events\/([0-9a-f-]{36})\/simulate/.exec(page.url())![1];
}

async function startAt(page: Page, speed: 1 | 5 | 10 | 20) {
  await expect(async () => {
    await page.getByTestId(`sim-speed-${speed}`).click({ timeout: 5_000 });
    await expect(page.getByTestId(`sim-speed-${speed}`)).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  await expect(async () => {
    if ((await page.getByTestId("sim-state").getAttribute("data-state")) !== "playing") await page.getByTestId("sim-start").click({ timeout: 5_000 });
    await expect(page.getByTestId("sim-state")).toHaveAttribute("data-state", "playing", { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
}

/** The observer's own sign-in, read from the phone's cookies (the same token its browser sends). */
async function accessTokenOf(phone: BrowserContext): Promise<string> {
  const cookies = await phone.cookies();
  const parts = cookies.filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  let raw = parts.map((c) => c.value).join("");
  if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice(7), "base64url").toString("utf8");
  return (JSON.parse(decodeURIComponent(raw)) as { access_token: string }).access_token;
}

/**
 * Every control of an observed screen is disabled (a disabled fieldset disables everything inside it). Counted in the page's own document, dialogs and menus
 * included; the Next.js dev-mode badge lives in its own shadow root and is not part of the screen.
 */
async function expectAllDisabled(frame: FrameLocator, hasControls = true) {
  await expect(frame.getByTestId("observed-screen")).toBeAttached({ timeout: 60_000 });
  const enabled = () =>
    frame.locator("body").evaluate((b) => [...b.ownerDocument.querySelectorAll("button:enabled, input:enabled, select:enabled, textarea:enabled")].map((e) => e.outerHTML.slice(0, 160)));
  await expect.poll(enabled, { timeout: 15_000 }).toEqual([]);
  if (hasControls) expect(await frame.locator("body").evaluate((b) => b.ownerDocument.querySelectorAll("button").length)).toBeGreaterThan(0);
}

test("an Observer joins with its PIN, flips through every official's screen on a running simulation, sees Judge 1's scores land, and cannot change anything", async ({ page, browser }) => {
  test.setTimeout(900_000);
  const w = await createLiveWorld();
  const simIds: string[] = [];
  const phones: BrowserContext[] = [];
  try {
    const simId = await makeSimulation(page, w);
    simIds.push(simId);
    const simSlug = (await w.db.from("events").select("slug").eq("id", simId).single()).data!.slug as string;

    // the organiser adds an Observer on the Officials step of the simulation, like any seat: it gets its own PIN
    const org = await page.context().newPage();
    await org.goto(`/org/events/${simId}/officials`);
    await org.getByLabel("Name", { exact: true }).fill("Sponsor guest");
    await org.getByLabel("Role", { exact: true }).selectOption({ label: "Observer" });
    await expect(org.getByTestId("observer-help")).toContainText("can change nothing");
    await org.getByTestId("add-seat").click();
    await expect(org.getByTestId("pin-box")).toBeVisible({ timeout: 60_000 });
    const pin = (await org.getByTestId("pin-digits").innerText()).trim();
    await org.getByTestId("pin-box-close").click();
    const observerSeat = (await w.db.from("judge_seats").select("id, scores").eq("event_id", simId).eq("role", "observer").single()).data!;
    expect(observerSeat.scores).toBe(false);
    expect(((await w.db.from("panel_members").select("id").eq("judge_seat_id", observerSeat.id)).data ?? []).length).toBe(0);
    expect(((await w.db.from("sim_seats").select("seat_id").eq("seat_id", observerSeat.id)).data ?? []).length).toBe(0); // never played by the simulator

    // a phone joins with the PIN and lands on the observer view
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    phones.push(phone);
    await installSupabaseProxy(phone);
    const p = await phone.newPage();
    await p.goto(`/e/${simSlug}/join?role=observer#join-pin`);
    await expect(p.getByTestId("joining-as")).toHaveText("Observer");
    await p.getByLabel("Your 6-digit PIN").fill(pin);
    await p.getByRole("button", { name: "Join", exact: true }).click();
    await expect(p).toHaveURL(new RegExp(`/observe/${simId}`), { timeout: 60_000 });
    await expect(p.getByTestId("observer-strip")).toHaveText("Observing — read only");

    // the simulation runs at ×10
    await startAt(page, 10);
    const j1 = (await w.db.from("judge_seats").select("id").eq("event_id", simId).eq("name", "Judge 1").single()).data!.id as string;
    await expect.poll(async () => (await w.db.from("heats").select("id").eq("event_id", simId).in("status", ["running", "paused"])).data?.length ?? 0, { timeout: 120_000 }).toBeGreaterThan(0);

    const switcher = p.getByTestId("observer-switcher");
    const keys = await switcher.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(keys).toEqual(expect.arrayContaining(["head-wide", "head-phone", `judge:${j1}`, "announcer", "screen", "public"]));
    expect(keys.filter((k) => k.startsWith("judge:"))).toHaveLength(3);
    expect(keys.some((k) => k.startsWith("spotter:"))).toBe(true);
    const labels = await switcher.locator("option").allTextContents();
    expect(labels.join("|")).not.toContain("Sponsor guest"); // an observer never shows as an official
    const frame = p.frameLocator("[data-testid=observer-frame]");

    // Judge 1: that judge's own scores arrive as the simulator gives them
    await switcher.selectOption(`judge:${j1}`);
    await expect(p.getByTestId("observer-frame")).toHaveAttribute("data-view", `judge:${j1}`);
    await expectAllDisabled(frame);
    const landed = frame.locator('[data-testid=history-row]:not([data-status="crashed"])');
    await expect.poll(() => landed.count(), { timeout: 240_000 }).toBeGreaterThan(0);
    const scoredByJ1 = (await w.db.from("trick_scores").select("id", { count: "exact", head: true }).eq("event_id", simId).eq("judge_seat_id", j1)).count ?? 0;
    expect(scoredByJ1).toBeGreaterThan(0);
    await expectAllDisabled(frame);
    // a tap on a score row does nothing (no correction opens)
    const pads = await frame.getByTestId("score-pad").count();
    const caption = await frame.getByTestId("pad-caption").allTextContents();
    await landed.first().click({ force: true });
    await p.waitForTimeout(500);
    expect(await frame.getByTestId("score-pad").count()).toBe(pads);
    expect(await frame.getByTestId("pad-caption").allTextContents()).toEqual(caption);

    // every other screen, live and read only
    for (const key of keys.filter((k) => k !== `judge:${j1}`)) {
      await switcher.selectOption(key);
      await expect(p.getByTestId("observer-frame")).toHaveAttribute("data-view", key);
      if (key === "screen" || key === "public") {
        await expect(frame.locator("body")).toContainText(/\S/, { timeout: 60_000 });
        await expect(frame.getByText("not found", { exact: false })).toHaveCount(0);
        continue;
      }
      await expectAllDisabled(frame, key !== "announcer"); // the announcer's screen is read only by design: it has no buttons at all
      if (key === "head-wide") {
        await expect(frame.getByTestId("head-page")).toHaveAttribute("data-layout", "wide", { timeout: 60_000 });
        await expect(frame.getByTestId("observers-watching")).toHaveText("1 observer watching", { timeout: 60_000 });
        await expect(frame.getByTestId("judge-row")).toHaveCount(3); // the observer is not one of the judges
      }
      if (key.startsWith("spotter:")) await expect(frame.getByTestId("feed-line").first()).toBeAttached({ timeout: 120_000 });
    }

    // the database refuses a write sent with the observer's own sign-in
    const token = await accessTokenOf(phone);
    // the heat the simulator played (at ×10 it may have ended by now: the role is refused before the heat's state is looked at)
    const live = (await w.db.from("heats").select("id").eq("event_id", simId).not("started_at", "is", null).order("started_at", { ascending: false }).limit(1).single()).data!.id as string;
    const attempt = (await w.db.from("trick_attempts").select("id").eq("heat_id", live).limit(1).single()).data!.id as string;
    const call = (fn: string, body: object) =>
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    for (const [fn, body] of [
      ["pause_heat", { p_heat: live }],
      ["submit_trick_score", { p_attempt: attempt, p_criteria: {}, p_score: 9.9, p_missed: false, p_flag: null, p_client_key: crypto.randomUUID(), p_client_rev: 1 }],
      ["add_attempt", { p_heat: live, p_entry: w.entries[0], p_client_key: crypto.randomUUID(), p_status: "landed", p_trick_name: "Backroll" }],
      ["set_wind_call", { p_event: simId, p_status: "red", p_message: "x" }],
    ] as const) {
      const res = await call(fn, body);
      expect(res.status, fn).toBeGreaterThanOrEqual(400);
      expect(await res.text(), fn).toContain("NOT_ALLOWED");
    }
    expect(((await w.db.from("trick_scores").select("id").eq("judge_seat_id", observerSeat.id)).data ?? []).length).toBe(0);

    // the organiser switches the seat off: the view ends at once
    await w.db.from("judge_seats").update({ active: false }).eq("id", observerSeat.id);
    await expect(p.getByTestId("observer-revoked")).toBeVisible({ timeout: 30_000 });
    await expect(p.getByTestId("observer-frame")).toHaveCount(0);
    await w.db.from("judge_seats").update({ active: true }).eq("id", observerSeat.id);

    // the simulator's View as… opens the observer view too
    await page.reload();
    await expect(page.getByTestId("sim-console")).toBeVisible({ timeout: 60_000 });
    const [view] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId(`view-observer-${observerSeat.id}`).click()]);
    await view.waitForLoadState("domcontentloaded");
    await expect(view).toHaveURL(new RegExp(`/observe/${simId}`), { timeout: 60_000 });
    await expect(view.getByTestId("observer-strip")).toBeVisible();
    await view.close();
    await page.getByTestId("sim-stop").click();
  } finally {
    await closePhones(phones);
    await removeSimulatorUsers(w, simIds);
    await w.cleanup();
  }
});
