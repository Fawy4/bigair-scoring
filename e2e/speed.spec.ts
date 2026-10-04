import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

/**
 * Speed measurement (Speed 1). Not part of the normal run: only with SPEED_MEASURE=1, against the production build served locally (`npx next start -p 3200`)
 * with scripts/measure/trace-fetch.cjs preloaded (SPEED_TRACE_FILE) so every database request the server makes is counted. A throwaway organisation with one
 * division of 24 riders and a 15-heat ladder, flags on, judges and a head seat, run as a simulation event. Arrow, EKL and Demo are never touched.
 *
 * Each step is timed from the click to the screen having settled (the thing the person waits for is visible), and the database calls the server made in that
 * window are counted. The result goes to speed-results/speed-<SPEED_LABEL>.json (not test-results, which every Playwright run empties). This sandbox reaches the hosted project through a proxy (about 0.3 s per round
 * trip), so the call COUNT, and how many of them wait for one another, is the number that carries over to the real host.
 */
const MEASURE = process.env.SPEED_MEASURE === "1";
const LABEL = process.env.SPEED_LABEL ?? "run";
const TRACE = process.env.SPEED_TRACE_FILE ?? "/tmp/claude-0/trace.jsonl";
const KNOCKOUT_24 = {
  generator: { params: { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: "by_original_seed" } },
  timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 2, defaultBreakAfterRoundMin: 2 },
  roundDurationMin: { SF: 10, F: 10 },
};

type Row = { step: string; confirmedMs?: number; trace?: string[]; ms: number; calls: number; sequential: number; spanMs: number; dbMs: number; scriptKB: number; note?: string; samples?: number[] };
const rows: Row[] = [];

function trace(from: number, to: number) {
  if (!existsSync(TRACE)) return [] as Array<{ t: number; ms: number; what: string }>;
  return readFileSync(TRACE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { t: number; ms: number; what: string })
    .filter((r) => r.t >= from && r.t <= to);
}
/** How many database requests ran one after another: requests that overlap in time count once (they were waiting side by side). */
function rounds(list: Array<{ t: number; ms: number }>) {
  const sorted = [...list].sort((a, b) => a.t - b.t);
  let n = 0;
  let end = -1;
  for (const r of sorted) {
    if (r.t >= end) n++;
    end = Math.max(end, r.t + r.ms);
  }
  return n;
}

test.describe("speed", () => {
  test.skip(!MEASURE, "measurement only (SPEED_MEASURE=1)");

  test("organiser, simulator and head console timings", async ({ page }) => {
    test.setTimeout(Number(process.env.SPEED_TIMEOUT ?? 900_000));
    mkdirSync("speed-results", { recursive: true });
    const org = await createOrganiser();
    try {
      const db = org.db;
      const one = <T extends { id: string }>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
        if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message}`);
        return r.data;
      };
      const many = <T>(r: { data: T[] | null; error: { message: string } | null }, what: string): T[] => {
        if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message}`);
        return r.data;
      };
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
      const event = one(
        await db
          .from("events")
          .insert({
            organisation_id: org.orgId,
            name: `Speed ${org.run}`,
            slug: `e2e-speed-${org.run}`,
            status: "published",
            timezone: "Africa/Cairo",
            start_date: today,
            end_date: today,
            is_simulation: true,
            settings: { publicLiveScores: "live", maxRunningHeats: 1, flags: { enabled: true, prestartSec: 10, lastMinuteSec: 10 } } as never,
          })
          .select("id")
          .single(),
        "event",
      );
      const eventId = event.id;
      const { data: model } = await db.from("scoring_models").select("id").is("organisation_id", null).eq("key", "legacy-kol-best3-variety").order("version", { ascending: false }).limit(1).single();
      const { data: fmt } = await db.from("format_templates").select("id").is("organisation_id", null).eq("key", "heats4-top2-single-elim").order("version", { ascending: false }).limit(1).single();
      const panel = one(await db.from("panels").insert({ event_id: eventId, name: "Panel 1" }).select("id").single(), "panel");
      const division = one(
        await db
          .from("divisions")
          .insert({ event_id: eventId, name: "Open", sort_order: 1, scoring_model_id: model!.id, scoring_overrides: { heat: { maxAttemptsPerRider: 7 } } as never, panel_id: panel.id, format_template_id: fmt!.id, format_params: KNOCKOUT_24 as never })
          .select("id")
          .single(),
        "division",
      );
      const riders = many(await db.from("riders").insert(Array.from({ length: 24 }, (_, i) => ({ organisation_id: org.orgId, first_name: `Rider${String(i + 1).padStart(2, "0")}`, last_name: "Speed", nationality: "EG" }))).select("id, first_name"), "riders");
      riders.sort((a, b) => a.first_name.localeCompare(b.first_name));
      many(await db.from("entries").insert(riders.map((r, i) => ({ event_id: eventId, division_id: division.id, rider_id: r.id, seed: i + 1, status: "confirmed", source: "manual" }))).select("id"), "entries");
      const seats: Record<string, string> = {};
      for (const [key, name, role] of [["j1", "Judge 1", "judge"], ["j2", "Judge 2", "judge"], ["j3", "Judge 3", "judge"], ["head", "Head judge", "head"], ["sp", "Spotter 1", "spotter"]] as const) {
        const { data: u } = await db.auth.admin.createUser({ email: `e2e-${org.run}-${key}@example.com`, password: `Pw-${org.run}-speed`, email_confirm: true });
        org.trackUser(u.user!.id);
        seats[key] = one(await db.from("judge_seats").insert({ event_id: eventId, name, role, scores: role === "judge", auth_user_id: u.user!.id, status: "active", active: true }).select("id").single(), key).id;
      }
      for (const [i, key] of ["j1", "j2", "j3"].entries()) await db.from("panel_members").insert({ panel_id: panel.id, judge_seat_id: seats[key], seat_no: i + 1 });

      await page.setViewportSize({ width: 1440, height: 900 });
      /** Waits for something in the page with a look on every frame, so what is measured is the screen and not Playwright's own retry interval (which backs off to half a second). */
      const until = <A>(fn: (a: A) => boolean, arg: A) => page.waitForFunction(fn as (a: unknown) => boolean, arg, { polling: "raf", timeout: 90_000 });
      const byId = (id: string) => `[data-testid="${id}"]`;

      /** One measurement: do the action, wait for the screen to be ready, count what the server asked the database for in between. */
      async function step(name: string, action: () => Promise<unknown>, ready: () => Promise<unknown>, note?: string, confirmed?: () => Promise<unknown>): Promise<Row> {
        const perf0 = await page.evaluate(() => performance.now());
        const t0 = Date.now();
        await action();
        await ready();
        const t1 = Date.now();
        const scriptBytes = await page.evaluate((from) => performance.getEntriesByType("resource").filter((e) => e.startTime >= from && /\.js(\?|$)/.test(e.name)).reduce((n, e) => n + ((e as PerformanceResourceTiming).transferSize || 0), 0), perf0);
        let confirmedMs: number | undefined;
        if (confirmed) {
          await confirmed();
          confirmedMs = Date.now() - t0;
        }
        const calls = trace(t0 - 5, confirmed ? t0 + (confirmedMs ?? 0) : t1);
        const row: Row = { step: name, confirmedMs, ms: t1 - t0, calls: calls.length, sequential: rounds(calls), spanMs: calls.length ? Math.max(...calls.map((c) => c.t + c.ms)) - Math.min(...calls.map((c) => c.t)) : 0, dbMs: calls.reduce((s, c) => s + c.ms, 0), scriptKB: Math.round(scriptBytes / 1024), note, trace: calls.map((c) => `+${c.t - t0} ms, ${c.ms} ms: ${c.what}`) };
        rows.push(row);
        console.log(`SPEED ${LABEL} | ${name} | ${row.ms} ms | ${row.calls} db calls, ${row.sequential} one after another | script ${row.scriptKB} kB`);
        return row;
      }
      await org.signIn(page, `/org/events/${eventId}/draw`);
      await expect(page.getByRole("heading", { name: "Draw" }).first()).toBeVisible({ timeout: 60_000 });
      // the draw: generated here (not measured), the clock starts at Lock draw
      await page.getByRole("button", { name: "Generate draw" }).click();
      await expect(page.getByTestId("heat-card").first()).toBeVisible({ timeout: 60_000 });
      await page.waitForLoadState("networkidle");

      const skipNav = process.env.SPEED_SKIP_NAV === "1";
      // navigation: Draw → Event → Divisions → Riders → Officials → Run order → Go live, three laps
      const stops: Array<[string, string, string]> = [
        ["Draw → Event", "event", "event"],
        ["Event → Divisions", "divisions", "divisions"],
        ["Divisions → Riders", "riders", "riders"],
        ["Riders → Officials", "officials", "officials"],
        ["Officials → Run order", "schedule", "schedule"],
        ["Run order → Go live", "golive", ""],
      ];
      // lap 0 warms the server (first use of every route in the process) and is not reported; laps 1 to 3 give the median
      const lapsOf = new Map<string, Row[]>();
      for (const lap of skipNav ? [] : [0, 1, 2, 3]) {
        for (const [name, key, path] of stops) {
          const target = path ? new RegExp(`/org/events/${eventId}/${path}(\\?.*)?$`) : new RegExp(`/org/events/${eventId}(\\?.*)?$`);
          const r = await step(
            name,
            () => page.getByTestId(`rail-${key}`).click(),
            () => until(([pattern, railSel]) => new RegExp(pattern).test(location.pathname + location.search) && Boolean(document.querySelector("main h1")) && document.querySelector(railSel)?.getAttribute("aria-current") === "step", [target.source, byId(`rail-${key}`)] as [string, string]),
          );
          rows.pop();
          if (lap > 0) lapsOf.set(name, [...(lapsOf.get(name) ?? []), r]);
          await page.waitForLoadState("networkidle");
        }
        await page.goto(`/org/events/${eventId}/draw`);
        await expect(page.getByTestId("heat-card").first()).toBeVisible({ timeout: 60_000 });
        await page.waitForLoadState("networkidle");
      }
      for (const [, list] of lapsOf) {
        const sorted = [...list].sort((a, b) => a.ms - b.ms);
        rows.push({ ...sorted[Math.floor(sorted.length / 2)], samples: list.map((x) => x.ms) });
      }

      // Save on the Event step
      await page.goto(`/org/events/${eventId}/event`);
      await expect(page.getByRole("button", { name: "Save event" })).toBeVisible({ timeout: 60_000 });
      await page.waitForLoadState("networkidle");
      const saves: Row[] = [];
      for (let i = 0; i < (skipNav ? 0 : 3); i++) {
        await page.locator("#ev-name").fill(`Speed ${org.run} ${i}`);
        saves.push(await step("Save on the Event step", () => page.getByRole("button", { name: "Save event" }).click(), () => until(() => !document.body.innerText.includes("● Unsaved changes"), null)));
        await page.waitForLoadState("networkidle");
      }
      if (saves.length) rows.splice(rows.length - 3, 3, { ...saves[1], samples: saves.map((s) => s.ms).sort((a, b) => a - b) });

      // Lock draw
      await page.goto(`/org/events/${eventId}/draw`);
      await expect(page.getByTestId("heat-card").first()).toBeVisible({ timeout: 60_000 });
      await page.waitForLoadState("networkidle");
      await step("Lock draw", () => page.getByRole("button", { name: "Lock draw" }).click(), () => until(() => /locked/i.test(document.querySelector('[data-testid="draw-status"]')?.textContent ?? ""), null));
      await page.waitForLoadState("networkidle");

      console.log("SPEED-MARK plan");
      // the run order of today: every heat, in order (what the Run order step saves)
      const { data: heats } = await db.from("heats").select("id, number, round_id, rounds(sort_order)").eq("event_id", eventId);
      const ordered = (heats ?? []).sort((a, b) => ((a.rounds as unknown as { sort_order: number }).sort_order - (b.rounds as unknown as { sort_order: number }).sort_order) || a.number - b.number);
      expect(ordered).toHaveLength(15);
      one(await db.from("schedule_plans").insert({ event_id: eventId, day: today, name: "Main", active: true, items: ordered.map((h, i) => ({ id: `i${i + 1}`, kind: "heat", heatId: h.id })), anchors: { i1: "10:00" } }).select("id").single(), "plan");

      console.log("SPEED-MARK sim");
      const skipSim = process.env.SPEED_SKIP_SIM === "1";
      // Simulator: set up, then speed ×1 → ×10 (three times)
      if (!skipSim) {
        await page.goto(`/org/events/${eventId}/simulate`);
        const setup = page.getByRole("button", { name: /set up the simulator|enable/i }).first();
        if (await setup.isVisible({ timeout: 20_000 }).catch(() => false)) await setup.click();
        await expect(page.getByTestId("sim-speed-10")).toBeVisible({ timeout: 90_000 }); // this page polls every second: no "network idle" here
        const speeds: Row[] = [];
        for (let i = 0; i < 3; i++) {
          await page.getByTestId("sim-speed-1").click();
          await expect(page.getByTestId("sim-speed-1")).toHaveAttribute("aria-pressed", "true", { timeout: 60_000 });
          await page.waitForTimeout(2500);
          speeds.push(await step("Simulator speed ×1 → ×10", () => page.getByTestId("sim-speed-10").click(), () => until(() => document.querySelector('[data-testid="sim-speed-10"]')?.getAttribute("aria-pressed") === "true", null), "ready = the ×10 button is pressed; confirmed = the database holds speed 10 (looked at every 50 ms, each look costs a round trip here)", async () => {
            for (let n = 0; n < 200; n++) {
              if ((await db.from("sim_control").select("speed").eq("event_id", eventId).single()).data?.speed === 10) return;
              await new Promise((r) => setTimeout(r, 50));
            }
          }));
        }
        rows.splice(rows.length - 3, 3, { ...speeds[1], samples: speeds.map((s) => s.ms).sort((a, b) => a - b) });
        await page.getByTestId("sim-speed-1").click();
        await page.waitForTimeout(2500);

        console.log("SPEED-MARK head");
      }

      // Head console: a heat ended with every score in (for Publish), and the first heat for Start / Pause
      const first = ordered[0].id;
      const second = ordered[1].id;
      const warm = ordered[2].id;
      /** A heat that has ended with every judge's score, Impression and sheet in, ready to publish. */
      async function endedWithScores(heat: string) {
        const { data: slots } = await db.from("heat_slots").select("entry_id, position").eq("heat_id", heat).order("position");
        await db.from("heats").update({ status: "ended", started_at: new Date(Date.now() - 900_000).toISOString(), ended_at: new Date(Date.now() - 300_000).toISOString() }).eq("id", heat);
        for (const [p, s] of (slots ?? []).entries()) {
          if (!s.entry_id) continue;
          const a = one(await db.from("trick_attempts").insert({ heat_id: heat, entry_id: s.entry_id, seq: 1, status: "landed", trick_name: "Left Backroll", direction: "left", client_key: crypto.randomUUID() }).select("id").single(), "attempt");
          for (const key of ["j1", "j2", "j3"]) {
            await db.from("trick_scores").insert({ attempt_id: a.id, judge_seat_id: seats[key], score: 8 - p * 0.5, client_key: crypto.randomUUID(), client_rev: 1 });
            await db.from("impression_scores").insert({ heat_id: heat, entry_id: s.entry_id, judge_seat_id: seats[key], value: 6, client_key: crypto.randomUUID(), client_rev: 1 });
          }
        }
        for (const key of ["j1", "j2", "j3"]) await db.from("judge_sheets").upsert({ event_id: eventId, heat_id: heat, judge_seat_id: seats[key], submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });
      }
      await endedWithScores(first);
      await endedWithScores(warm);

      await page.goto(`/head/${eventId}`);
      const orderRow = (id: string) => page.locator(`[data-testid="order-row"][data-heat="${id}"]`);
      await orderRow(second).waitFor({ state: "attached", timeout: 90_000 });
      await orderRow(second).click();
      await expect(page.getByTestId("start")).toBeEnabled({ timeout: 30_000 });
      await page.waitForTimeout(3500);
      await step("Start heat sequence", () => page.getByTestId("start").click(), () => until(() => Boolean(document.querySelector('[data-testid="abort-start"]')), null), "ready = the yellow strip and the abort button are on screen; confirmed = the database has answered", () => until(() => /yellow, .* to the start/.test(document.querySelector('[data-testid="control-message"]')?.textContent ?? ""), null));
      await page.waitForTimeout(1500);
      await expect(page.getByTestId("pause")).toBeEnabled({ timeout: 15_000 });
      await step("Pause", () => page.getByTestId("pause").click(), () => until(() => Boolean(document.querySelector('[data-testid="resume"]')), null), "ready = the Resume button is on screen; confirmed = the database has answered", () => until(() => / paused\./.test(document.querySelector('[data-testid="control-message"]')?.textContent ?? ""), null));
      await page.waitForTimeout(1500);

      // one Publish first to warm the server (its first call in a new process loads the scoring engine); the measured one is the second
      await orderRow(warm).click();
      await expect(page.getByTestId("publish")).toBeEnabled({ timeout: 60_000 });
      await page.getByTestId("publish").click();
      await expect(page.getByTestId("console-dialog")).toContainText("Publish this result?", { timeout: 30_000 });
      await page.getByTestId("dialog-save").click();
      await expect(page.getByTestId("console-dialog")).toHaveCount(0, { timeout: 90_000 });
      await orderRow(first).click();
      await expect(page.getByTestId("publish")).toBeEnabled({ timeout: 60_000 });
      await page.waitForTimeout(3500);
      await page.getByTestId("publish").click();
      await expect(page.getByTestId("console-dialog")).toContainText("Publish this result?", { timeout: 30_000 });
      await step("Publish", () => page.getByTestId("dialog-save").click(), () => until(() => !document.querySelector('[data-testid="console-dialog"]') && document.querySelector<HTMLButtonElement>('[data-testid="reopen"]')?.disabled === false, null), "from the confirm click until the console shows the heat as published (Re-open is on)");
      const published = await db.from("heats").select("status").eq("id", first).single();
      expect(published.data?.status).toBe("published");
    } finally {
      await page.context().unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
      writeFileSync(`speed-results/speed-${LABEL}.json`, JSON.stringify(rows, null, 2));
      await org.cleanup();
    }
  });
});
