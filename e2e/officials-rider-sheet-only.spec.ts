import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";

// 0.24.0 — officials see the Rider sheet only. Throwaway organisations (Arrow, EKL and Demo are never touched), phone size 390 × 844, ONE worker, no retries, on a production
// build. These phones carry NO test marker (`officialsOnly: true`): they are exactly what an official's phone is on the live site, so the server's test setting
// (SHOW_HIDDEN_OFFICIAL_VIEWS=1 in playwright.config.ts) must not open the Queue or the Trick list for them, whatever the phone had chosen before.
//   - a new phone and a phone that had chosen the Queue / the Trick list open on the Rider sheet with no switch, also after a reload; the head judge's Score tab and the
//     observer watching a judge show the Rider sheet too;
//   - a division scored by criteria: the same line with one box per criterion (names above the boxes, all on the screen), line by line, Missed moves on, a crash greys the
//     line, scores typed before the spotter logs settle onto the attempt, and the console's panel score is the one the Queue's write gives;
//   - five criteria wrap onto a second row with nothing off the screen;
//   - what the hidden views could do that the sheet could not: the spotter's Undo, and the judge's "Log an attempt" when the event allows it.
// In this sandbox the browser cannot open the Realtime socket, so the phones and the console follow through the 5-second fallback.
let w: LiveWorld;
const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});

type SeatKey = Parameters<LiveWorld["signInAs"]>[1];
async function phone(browser: Browser, key: SeatKey, path: string, o: { stored?: Record<string, string>; size?: { width: number; height: number } } = {}): Promise<Page> {
  const context = await browser.newContext({ viewport: o.size ?? { width: 390, height: 844 } });
  contexts.push(context);
  await installSupabaseProxy(context, { officialsOnly: true });
  // a phone that chose the Queue or the Trick list before 0.24.0 still has that choice in its storage
  if (o.stored)
    await context.addInitScript((kv: Record<string, string>) => {
      try {
        for (const [k, v] of Object.entries(kv)) window.localStorage.setItem(k, v);
      } catch {
        /* no storage on this page */
      }
    }, o.stored);
  const page = await context.newPage();
  await w.signInAs(page, key, path);
  return page;
}

/** A 3- or 5-criteria copy of the Kota model, in the throwaway organisation, on the world's division (every criterion in steps of 0.5). */
async function useCriteria(world: LiveWorld, list: Array<{ key: string; label: string }>) {
  const { data: base } = await world.db.from("scoring_models").select("json").is("organisation_id", null).eq("key", "kota-best3-impression").order("version", { ascending: false }).limit(1).single();
  const json = structuredClone(base!.json) as { trick: { criteria: unknown[] } } & Record<string, unknown>;
  const scale = { min: 0, max: 10, step: 0.5 };
  json.trick.criteria = list.map((c) => ({ key: c.key, label: c.label, weight: 1, scale }));
  (json.trick as unknown as { scale: unknown }).scale = scale;
  const { data: model, error } = await world.db.from("scoring_models").insert({ organisation_id: world.orgId, key: `e2e-crit-${world.org.run}`, name: "Criteria test", version: 1, json: json as never, content_hash: "e2e" }).select("id").single();
  if (error || !model) throw new Error(`model: ${error?.message}`);
  await world.db.from("divisions").update({ scoring_model_id: model.id }).eq("id", world.divisionId);
}

const THREE = [
  { key: "height", label: "Height" },
  { key: "extremity", label: "Extremity" },
  { key: "technicality", label: "Technicality" },
];
const line = (p: Page, n: number) => p.locator(`[data-testid="sheet-line"][data-line="${n}"]`);
const crit = (p: Page, n: number, key: string) => line(p, n).locator(`[data-testid="line-criterion"][data-criterion="${key}"]`);
const fill = async (p: Page, n: number, key: string, text: string) => {
  const box = crit(p, n, key);
  await box.click();
  await box.fill(text);
  await box.blur();
};
const noViewSwitch = async (p: Page) => {
  await expect(p.getByTestId("view-switch")).toHaveCount(0);
  await expect(p.getByTestId("view-queue")).toHaveCount(0);
  await expect(p.getByTestId("spot-view-list")).toHaveCount(0);
};
const within = async (p: Page, l: Locator, width = 390) => {
  const b = (await l.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(width + 0.5);
  void p;
};
const notes = async (heat: string) => (await w.db.from("pending_scores").select("slot, score, missed, criteria, judge_seat_id").eq("heat_id", heat).order("slot")).data ?? [];
const attempt = async (heat: string, entry: string, seq: number, status: "landed" | "crashed" = "landed") =>
  (await w.db.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq, status, trick_name: `Trick ${seq}`, client_key: crypto.randomUUID() }).select("id").single()).data!.id as string;

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------
test("every official opens on the Rider sheet with no switch: a new phone and a phone that chose the Queue or the Trick list before, also after a reload; the head judge's Score tab and the observer too", async ({ browser }) => {
  test.setTimeout(900_000);
  w = await createLiveWorld({ headScores: true });
  const H = w.heats[0];
  await w.startHeat(H);

  // ---- judges: a new phone, and a phone that had chosen the Queue
  const jNew = await phone(browser, "j1", `/judge/${w.eventId}`);
  const jOld = await phone(browser, "j2", `/judge/${w.eventId}`, { stored: { "bigair.judgeView": "queue" } });
  for (const p of [jNew, jOld]) {
    await expect(p.getByTestId("rider-sheet")).toBeVisible({ timeout: 40_000 });
    await expect(p.getByTestId("sheet-line")).toHaveCount(7);
    await expect(p.getByTestId("queue-card")).toHaveCount(0);
    await expect(p.getByTestId("all-scored")).toHaveCount(0);
    await noViewSwitch(p);
    await p.reload();
    await expect(p.getByTestId("rider-sheet")).toBeVisible({ timeout: 40_000 });
    await expect(p.getByTestId("all-scored")).toHaveCount(0);
    await noViewSwitch(p);
  }

  // ---- spotters: a new phone, and a phone that had chosen the Trick list
  const sNew = await phone(browser, "spotter", `/spot/${w.eventId}`);
  const sOld = await phone(browser, "spotter2", `/spot/${w.eventId}`, { stored: { "bigair.spotterView": "list" } });
  for (const p of [sNew, sOld]) {
    await expect(p.getByTestId("spotter-sheet")).toBeVisible({ timeout: 40_000 });
    await expect(p.getByTestId("trick-builder")).toHaveCount(0);
    await noViewSwitch(p);
    await p.reload();
    await expect(p.getByTestId("spotter-sheet")).toBeVisible({ timeout: 40_000 });
    await expect(p.getByTestId("trick-builder")).toHaveCount(0);
    await noViewSwitch(p);
  }

  // ---- the head judge who also scores: the Score tab is a judge's screen, whatever the phone chose before
  const head = await phone(browser, "head", `/head/${w.eventId}`, { stored: { "bigair.judgeView": "queue" } });
  await head.getByRole("tab", { name: "Score" }).click({ timeout: 60_000 });
  await expect(head.getByTestId("rider-sheet")).toBeVisible({ timeout: 40_000 });
  await expect(head.getByTestId("all-scored")).toHaveCount(0);
  await noViewSwitch(head);

  // ---- the observer watching Judge 1 sees the Rider sheet (the observer's own phone had chosen the Queue)
  const { data: u, error } = await w.db.auth.admin.createUser({ email: `e2e-${w.org.run}-obs@example.com`, password: `Pw-${w.org.run}-live`, email_confirm: true });
  if (error || !u.user) throw new Error(`observer login: ${error?.message}`);
  w.org.trackUser(u.user.id);
  await w.db.from("judge_seats").insert({ event_id: w.eventId, name: "Observer", role: "observer", scores: false, auth_user_id: u.user.id, status: "active", active: true });
  const obsContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  contexts.push(obsContext);
  await installSupabaseProxy(obsContext, { officialsOnly: true });
  await obsContext.addInitScript(() => {
    try {
      window.localStorage.setItem("bigair.judgeView", "queue");
    } catch {
      /* no storage on this page */
    }
  });
  const obs = await obsContext.newPage();
  const link = await w.db.auth.admin.generateLink({ type: "magiclink", email: `e2e-${w.org.run}-obs@example.com` });
  await obs.goto(`/auth/confirm?token_hash=${link.data.properties!.hashed_token}&type=magiclink&next=${encodeURIComponent(`/observe/${w.eventId}/screen?view=judge:${w.seats.j1.id}`)}`);
  await expect(obs.getByTestId("observed-screen")).toBeAttached({ timeout: 60_000 });
  await expect(obs.getByTestId("rider-sheet")).toBeVisible({ timeout: 40_000 });
  await expect(obs.getByTestId("all-scored")).toHaveCount(0);
  await noViewSwitch(obs);
});

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------
test("a division with three criteria: names above the boxes, line by line, Missed moves on, a crash greys the line, scores typed before the spotter logs settle onto the attempt, and the console shows the Queue's panel score", async ({ browser }) => {
  test.setTimeout(900_000);
  w = await createLiveWorld({ model: "kota-best3-impression" });
  await useCriteria(w, THREE);
  const H = w.heats[0];
  const [red, blue] = w.entries;
  // only Red and Blue ride
  await w.db.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", H).not("entry_id", "in", `(${red},${blue})`);
  await w.startHeat(H);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`);
  const j2 = await phone(browser, "j2", `/judge/${w.eventId}`);
  const j3 = await phone(browser, "j3", `/judge/${w.eventId}`);
  const head = await phone(browser, "head", `/head/${w.eventId}`, { size: { width: 1500, height: 1000 } });
  await head.locator(`[data-testid="order-row"][data-heat="${H}"]`).click({ timeout: 60_000 });

  // ---- the line: the same line as before, with a box per criterion; the names sit above their boxes and every box is on the screen
  await expect(j1.getByTestId("rider-sheet")).toBeVisible({ timeout: 40_000 });
  await noViewSwitch(j1);
  await expect(j1.getByTestId("line-score")).toHaveCount(0); // no single box
  for (let n = 1; n <= 7; n++) await expect(line(j1, n).getByTestId("line-criterion")).toHaveCount(3);
  await expect(line(j1, 1).getByTestId("line-missed")).toBeVisible();
  await expect(line(j1, 1).getByTestId("line-flag")).toBeVisible();
  for (const c of THREE) {
    const name = line(j1, 1).locator(`[data-testid="criterion"][data-criterion="${c.key}"] [data-testid="criterion-name"]`);
    await expect(name).toHaveText(c.label);
    const nb = (await name.boundingBox())!;
    const bb = (await crit(j1, 1, c.key).boundingBox())!;
    expect(nb.y + nb.height).toBeLessThanOrEqual(bb.y + 1); // the name is above its box
    expect(Math.abs(nb.x + nb.width / 2 - (bb.x + bb.width / 2))).toBeLessThan(3); // centred on it
    expect(bb.width).toBeGreaterThanOrEqual(56); // never smaller than the single score box (w-14)
    expect(bb.height).toBeGreaterThanOrEqual(44);
    await within(j1, crit(j1, 1, c.key));
    await expect(crit(j1, 1, c.key)).toHaveAttribute("aria-label", `${c.label} for attempt 1`);
  }
  const order = await line(j1, 1).locator('[data-testid="line-criterion"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-criterion")));
  expect(order).toEqual(THREE.map((c) => c.key)); // the division's order

  // ---- line by line: line 2 waits until line 1 has every criterion
  await expect(line(j1, 2)).toHaveAttribute("data-waits", "true");
  await expect(line(j1, 1)).not.toHaveAttribute("data-waits", "true");
  await fill(j1, 1, "technicality", "7"); // any order
  await fill(j1, 1, "height", "6.5");
  await expect(line(j1, 2)).toHaveAttribute("data-waits", "true"); // two of three: still line 1
  expect(await notes(H)).toEqual([]); // a line that is not complete is not sent
  await crit(j1, 1, "height").click(); // between two steps: the pad's own sentence, nothing kept
  await crit(j1, 1, "height").fill("7.25");
  await expect(line(j1, 1).getByTestId("line-refusal")).toContainText("That score is not on the 0.5 step. Use 7 or 7.5.", { timeout: 15_000 });
  await crit(j1, 1, "height").blur();
  await expect(crit(j1, 1, "height")).toHaveValue("6.5");
  await fill(j1, 1, "extremity", "8");
  await expect.poll(async () => (await notes(H)).length, { timeout: 30_000 }).toBe(1);
  const first = (await notes(H))[0];
  expect(first.criteria).toEqual({ height: 6.5, extremity: 8, technicality: 7 });
  expect(Number(first.score)).toBeCloseTo(7.17, 2);
  await expect(line(j1, 2)).not.toHaveAttribute("data-waits", "true", { timeout: 15_000 }); // line 1 is done, line 2 opens
  await expect(line(j1, 3)).toHaveAttribute("data-waits", "true");

  // Missed moves on
  await line(j1, 2).getByTestId("line-missed").click();
  await expect(line(j1, 3)).not.toHaveAttribute("data-waits", "true", { timeout: 15_000 });
  await expect.poll(async () => (await notes(H)).map((n) => [n.slot, n.missed]), { timeout: 30_000 }).toEqual([[1, false], [2, true]]);

  // line 3 typed ahead too (it will meet a crash)
  await fill(j1, 3, "height", "5");
  await fill(j1, 3, "extremity", "5");
  await fill(j1, 3, "technicality", "5");
  await expect.poll(async () => (await notes(H)).length, { timeout: 30_000 }).toBe(3);

  // a reload keeps the waiting line (it is on the server) and the half-typed line (it is on the phone)
  await fill(j1, 4, "height", "9");
  await j1.reload();
  await expect(crit(j1, 1, "height")).toHaveValue("6.5", { timeout: 40_000 });
  await expect(crit(j1, 1, "extremity")).toHaveValue("8.0");
  await expect(crit(j1, 1, "technicality")).toHaveValue("7.0");
  await expect(crit(j1, 4, "height")).toHaveValue("9.0");
  await expect(crit(j1, 4, "extremity")).toHaveValue("");

  // ---- the other two judges type line 1 ahead too
  const marks = { j2: { height: "7", extremity: "8.5", technicality: "7.5" }, j3: { height: "6", extremity: "7", technicality: "7" } };
  for (const [p, m] of [[j2, marks.j2], [j3, marks.j3]] as const) {
    await expect(p.getByTestId("rider-sheet")).toBeVisible({ timeout: 40_000 });
    for (const [k, v] of Object.entries(m)) await fill(p, 1, k, v);
  }
  await expect.poll(async () => (await notes(H)).filter((n) => n.slot === 1).length, { timeout: 40_000 }).toBe(3);

  // ---- the spotter logs a landing, a landing and a crash: the notes settle onto the attempts, the crash discards line 3's note
  const a1 = await attempt(H, red, 1);
  const a2 = await attempt(H, red, 2);
  const a3 = await attempt(H, red, 3, "crashed");
  const scores = async (judge: "j1" | "j2" | "j3", id: string) => (await w.db.from("trick_scores").select("score, missed, criteria").eq("attempt_id", id).eq("judge_seat_id", w.seats[judge].id)).data ?? [];
  await expect.poll(async () => (await scores("j1", a1)).length, { timeout: 40_000 }).toBe(1);
  const s1 = (await scores("j1", a1))[0];
  expect(s1.criteria).toEqual({ height: 6.5, extremity: 8, technicality: 7 });
  expect(Number(s1.score)).toBeCloseTo(7.17, 2);
  expect((await scores("j1", a2))[0]).toMatchObject({ missed: true, score: null });
  expect(await scores("j1", a3)).toEqual([]);
  expect((await notes(H)).filter((n) => n.judge_seat_id === w.seats.j1.id)).toEqual([]);
  await expect(line(j1, 1)).toContainText("Trick 1", { timeout: 40_000 });
  await expect(crit(j1, 1, "height")).toHaveValue("6.5");
  await expect(crit(j1, 1, "technicality")).toHaveValue("7.0");
  await expect(line(j1, 2).getByTestId("line-missed")).toHaveAttribute("aria-pressed", "true");
  await expect(line(j1, 3)).toHaveAttribute("data-kind", "crash"); // the crash greys the line: no boxes
  await expect(line(j1, 3).getByTestId("line-criterion")).toHaveCount(0);
  await expect(line(j1, 3).getByTestId("line-crash")).toContainText("Crash");
  await expect(line(j1, 4)).not.toHaveAttribute("data-waits", "true"); // line 4 is the line that takes typing now

  // ---- the console: Red's attempt 1 scored on the Rider sheet and Blue's attempt 1 scored with the Queue's own write (the same marks) give the same panel score
  const b1 = await attempt(H, blue, 1);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const as = async (key: "j1" | "j2" | "j3"): Promise<SupabaseClient> => {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const r = await c.auth.signInWithPassword({ email: w.seats[key].email, password: `Pw-${w.org.run}-live` });
    if (r.error) throw new Error(`judge login: ${r.error.message}`);
    return c;
  };
  for (const key of ["j1", "j2", "j3"] as const) {
    const sheetScore = (await scores(key, a1))[0];
    if (!sheetScore) {
      await expect.poll(async () => (await scores(key, a1)).length, { timeout: 40_000 }).toBe(1);
    }
    const mine = (await scores(key, a1))[0];
    const c = await as(key);
    const res = await c.rpc("submit_trick_score", { p_attempt: b1, p_criteria: mine.criteria as never, p_score: Number(mine.score), p_missed: false, p_flag: null as never, p_client_key: crypto.randomUUID(), p_client_rev: Date.now() });
    expect(res.error?.message ?? "").toBe("");
  }
  const panelOf = (rider: string) => head.locator('[data-testid="matrix-row"]').filter({ hasText: rider }).filter({ hasText: "Trick 1" }).getByTestId("matrix-panel");
  await expect(panelOf("red")).not.toHaveText(/—|incomplete/i, { timeout: 60_000 });
  await expect(panelOf("blue")).not.toHaveText(/—|incomplete/i, { timeout: 60_000 });
  const redPanel = (await panelOf("red").innerText()).trim();
  const bluePanel = (await panelOf("blue").innerText()).trim();
  expect(redPanel).toBe(bluePanel);
  expect(redPanel).toBe("7.17");
  // and every judge's cell on the two rows reads the same
  const cells = async (rider: string) => head.locator('[data-testid="matrix-row"]').filter({ hasText: rider }).filter({ hasText: "Trick 1" }).getByTestId("matrix-cell").allInnerTexts();
  expect(await cells("red")).toEqual(await cells("blue"));
  console.log(`panel score on the console: Rider sheet ${redPanel}, Queue write ${bluePanel}`);
});

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------
test("with five criteria the boxes wrap onto a second row and nothing is off the screen; a long name is shortened and the whole name is in the box's label", async ({ browser }) => {
  test.setTimeout(600_000);
  w = await createLiveWorld({ model: "kota-best3-impression" });
  await useCriteria(w, [...THREE, { key: "execution", label: "Execution" }, { key: "flow", label: "Creativity and flow of the whole jump" }]);
  await w.startHeat(w.heats[0]);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`);
  await expect(j1.getByTestId("rider-sheet")).toBeVisible({ timeout: 40_000 });
  await noViewSwitch(j1);
  for (const n of [1, 7]) {
    await expect(line(j1, n).getByTestId("line-criterion")).toHaveCount(5);
    const ys = new Set<number>();
    for (const key of ["height", "extremity", "technicality", "execution", "flow"]) {
      const b = (await crit(j1, n, key).boundingBox())!;
      ys.add(Math.round(b.y));
      await within(j1, crit(j1, n, key));
      expect(b.width).toBeGreaterThanOrEqual(56);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    expect(ys.size).toBe(2); // two rows
  }
  // the long name is cut with an ellipsis; the whole name is in the box's accessible label
  const longName = line(j1, 1).locator('[data-criterion="flow"] [data-testid="criterion-name"]');
  expect(await longName.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  expect(await longName.evaluate((e) => getComputedStyle(e).textOverflow)).toBe("ellipsis");
  await expect(crit(j1, 1, "flow")).toHaveAttribute("aria-label", "Creativity and flow of the whole jump for attempt 1");
  // the page itself does not scroll sideways
  expect(await j1.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------
test("what the hidden views could do is not lost: the spotter takes back the attempt just logged with Undo on the Rider sheet, and a judge logs an attempt from the Rider sheet when the event allows it", async ({ browser }) => {
  test.setTimeout(600_000);
  w = await createLiveWorld({ headScores: false });
  const H = w.heats[0];
  const red = w.entries[0];
  const { data: ev } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  await w.db.from("events").update({ settings: { ...(ev!.settings as object), judgesMayLogAttempts: true } as never }).eq("id", w.eventId);
  await w.startHeat(H);
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`);
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`);
  await expect(spotter.getByTestId("spotter-sheet")).toBeVisible({ timeout: 40_000 });
  const rows = async () => (await w.db.from("trick_attempts").select("seq, deleted_at, status").eq("heat_id", H).eq("entry_id", red).order("seq")).data ?? [];

  // ---- Undo: log a crash on line 1, then take it back within the 10 seconds; the audit line is the Trick list's ("attempt_undone")
  const l1 = spotter.locator('[data-testid="spotter-line"][data-line="1"]');
  await l1.getByTestId("line-crash").click();
  await expect.poll(async () => (await rows()).length, { timeout: 40_000 }).toBe(1);
  await expect(l1.getByTestId("line-undo")).toBeVisible({ timeout: 30_000 });
  await l1.getByTestId("line-undo").click();
  await expect.poll(async () => (await rows())[0]?.deleted_at ?? null, { timeout: 40_000 }).not.toBeNull();
  await expect(l1).toHaveAttribute("data-state", "active", { timeout: 40_000 });
  await expect(l1.getByTestId("line-undo")).toHaveCount(0);
  const audit = await w.db.from("audit_log").select("action").eq("event_id", w.eventId).eq("action", "attempt_undone");
  expect((audit.data ?? []).length).toBe(1);
  // Undo is offered for ten seconds only: a line logged a while ago has none
  await l1.getByTestId("line-crash").click();
  await expect(l1.getByTestId("line-undo")).toBeVisible({ timeout: 40_000 });
  await expect(l1.getByTestId("line-undo")).toHaveCount(0, { timeout: 30_000 });

  // ---- a judge logs an attempt from the Rider sheet (the event allows it)
  await expect(j1.getByTestId("rider-sheet")).toBeVisible({ timeout: 40_000 });
  await j1.getByTestId("rider-tile").nth(1).click();
  await j1.getByTestId("log-for-rider").click();
  await expect(j1.getByTestId("judge-logger")).toBeVisible();
  await j1.locator('[data-block="direction:left"]').click();
  await j1.locator('[data-block="base:backroll"]').click();
  await j1.getByTestId("log-button").click();
  await expect.poll(async () => (await w.db.from("trick_attempts").select("trick_name").eq("heat_id", H).eq("entry_id", w.entries[1])).data?.length, { timeout: 40_000 }).toBe(1);
});
