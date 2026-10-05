import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import kota from "../../presets/scoring/kota-best3-impression.json";
import { drawProjection } from "@/lib/draw/projection";
import { divisionPlacings, expandFormat, type DivisionDraw } from "@/lib/engine/ladder";
import { updateConfig } from "@/lib/simulator/io";
import { pressScenario, reviveJudge } from "@/lib/simulator/scenario-runner";
import { simTick } from "@/lib/simulator/tick";
import { ENV_OK } from "./helpers";
import { codeOf } from "./live-helpers";
import { gounaTemplate, sharedFixture } from "./audit-1b-world";

// Fix heat length — the audit's rehearsal harness (audit-1b-rehearsal.test.ts), one run, with TWO heats given another length in the run order (R1's second heat 7 minutes,
// the Friday run order's third heat 4 minutes; the draw says otherwise): every heat's clock must match its run-order length at ×20, and the placings must agree with the
// published results. Original header follows. Audit 1b, part 8 — event-day rehearsal, fully virtual at ×20 (docs/AUDIT.md). The Arrow format (24 riders, 15 heats over two days, KOTA, 3 judges + a head judge
// who scores, 2 spotters, flags on with a 1:00 pre-start and a 1:00 last minute) is copied three times with "Run as simulation" and played from the first heat to
// the final with the whole-event auto-play, each run with another judge spread and scenario buttons pressed at random moments. After each run: the final placings
// agree with the published heat results and the ladder. Throwaway organisation only; the simulator's virtual logins are deleted afterwards.
// "tie", "judge_dies", "wind_hold" and "rerun" are left out: the first two block Publish until the head judge decides (a person, not this runner); the last two
// call server actions that need a Next request. They are exercised in the browser (simulator.spec.ts, live-console.spec.ts, publish-blockers tests).
const RUNS: Array<{ spread: "agree" | "normal" | "disagree"; scenarios: string[]; seed: number }> = [{ spread: "normal", scenarios: ["duplicate"], seed: 22 }];
const OVERRIDE = { R1_SECOND: 7 * 60, FRIDAY_THIRD: 4 * 60 };
const overridden: { seven?: string; four?: string } = {};
const expectedSec = new Map<string, number>(); // draw_uid -> the length the run order gives (the draw's own copy where the run order has none)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!ENV_OK)("Audit 1b — event-day rehearsal at ×20, three runs", () => {
  let source: string;
  const simEvents: string[] = [];
  const report: Record<string, unknown>[] = [];

  beforeAll(async () => {
    const f = await sharedFixture();
    const s = f.s;
    const today = "2026-10-08";
    source = (await s.from("events").insert({ organisation_id: f.ids.orgA, name: "Gouna rehearsal source", slug: `a1b-reh-${randomUUID().slice(0, 6)}`, status: "published", timezone: "Africa/Cairo", start_date: today, end_date: "2026-10-09", settings: { flags: { enabled: true, prestartSec: 60, lastMinuteSec: 60 }, maxRunningHeats: 1, publicLiveScores: "live" } as never }).select("id").single()).data!.id;
    const panel = (await s.from("panels").insert({ event_id: source, name: "Panel" }).select("id").single()).data!.id;
    let seatNo = 0;
    for (const [name, role, scores] of [["Judge 1", "judge", true], ["Judge 2", "judge", true], ["Judge 3", "judge", true], ["Head judge", "head", true], ["Spotter 1", "spotter", false], ["Spotter 2", "spotter", false]] as const) {
      const id = (await s.from("judge_seats").insert({ event_id: source, name, role, scores, status: "active", active: true }).select("id").single()).data!.id;
      if (scores) await s.from("panel_members").insert({ panel_id: panel, judge_seat_id: id, seat_no: ++seatNo });
    }
    const model = (await s.from("scoring_models").insert({ organisation_id: f.ids.orgA, key: `reh-${randomUUID().slice(0, 8)}`, name: "KOTA", version: 1, json: kota as never, content_hash: randomUUID() }).select("id").single()).data!.id;
    const div = (await s.from("divisions").insert({ event_id: source, name: "Pro", sort_order: 1, panel_id: panel, scoring_model_id: model, scoring_overrides: { heat: { maxAttemptsPerRider: 7 } } as never }).select("id").single()).data!.id;
    const riders = (await s.from("riders").insert(Array.from({ length: 24 }, (_, i) => ({ organisation_id: f.ids.orgA, first_name: `R${i + 1}`, last_name: "Rehearsal" }))).select("id, first_name")).data!;
    riders.sort((a, b) => Number(a.first_name.slice(1)) - Number(b.first_name.slice(1)));
    const entries = (await s.from("entries").insert(riders.map((r, i) => ({ division_id: div, rider_id: r.id, seed: i + 1, status: "confirmed", source: "manual" }))).select("id, seed")).data!.sort((a, b) => a.seed - b.seed);
    const draw = expandFormat(gounaTemplate(), entries.map((e, i) => ({ id: e.id, name: `R${i + 1}` })), { identification: "vests-per-heat" });
    expect(codeOf(await f.clients.orgA.rpc("save_division_draw", { p_division: div, p_draw: draw as never, p_projection: drawProjection(draw) as never, p_action: "generate", p_audit: { after: { summary: "rehearsal" } } as never }))).toBe("");
    expect(codeOf(await f.clients.orgA.rpc("lock_division_draw", { p_division: div }))).toBe("");
    const heats = (await s.from("heats").select("id, draw_uid, number, duration_sec").eq("division_id", div).order("number")).data!;
    const r1 = heats.filter((h) => h.draw_uid?.startsWith("R1"));
    const rest = heats.filter((h) => !h.draw_uid?.startsWith("R1"));
    for (const h of heats) expectedSec.set(h.draw_uid!, h.duration_sec);
    overridden.seven = r1[1].draw_uid!;
    overridden.four = rest[2].draw_uid!;
    expectedSec.set(overridden.seven!, OVERRIDE.R1_SECOND);
    expectedSec.set(overridden.four!, OVERRIDE.FRIDAY_THIRD);
    await s.from("schedule_plans").insert({ event_id: source, day: today, name: "Thursday", active: true, items: r1.map((h, i) => ({ id: `t${i}`, kind: "heat", heatId: h.id, ...(i === 1 ? { durationMin: OVERRIDE.R1_SECOND / 60 } : {}) })), anchors: { t0: "10:00" } });
    await s.from("schedule_plans").insert({ event_id: source, day: "2026-10-09", name: "Friday", active: true, items: rest.map((h, i) => ({ id: `f${i}`, kind: "heat", heatId: h.id, ...(i === 2 ? { durationMin: OVERRIDE.FRIDAY_THIRD / 60 } : {}) })), anchors: { f0: "10:00" } });
  }, 600_000);

  afterAll(async () => {
    if (!ENV_OK) return;
    const f = await sharedFixture();
    for (const ev of simEvents) {
      const { data } = await f.s.from("sim_seats").select("virtual_user").eq("event_id", ev);
      for (const r of data ?? []) if (r.virtual_user) await f.s.auth.admin.deleteUser(r.virtual_user).catch(() => undefined);
    }
    console.info("A1b 8 rehearsal:", JSON.stringify(report, null, 1));
    await f.cleanup();
  });

  for (const [n, run] of RUNS.entries()) {
    it(`run ${n + 1}: spread "${run.spread}", scenarios ${run.scenarios.join(", ")} — every heat published, nothing left armed or running, placings = results = ladder`, async () => {
      const f = await sharedFixture();
      const s = f.s;
      const cloned = await f.clients.orgA.rpc("clone_event_as_simulation", { p_event: source, p_name: `Rehearsal ${n + 1}` });
      expect(codeOf(cloned)).toBe("");
      const sim = (cloned.data as { event_id: string }).event_id;
      simEvents.push(sim);
      const { data: me } = await f.clients.orgA.auth.getUser();
      const db = { user: f.clients.orgA as never, service: s as never, userId: me.user!.id };
      await updateConfig(db, sim, (c) => ({ ...c, spread: run.spread, wholeEvent: true }));
      expect(codeOf(await f.clients.orgA.rpc("sim_set", { p_event: sim, p_patch: { speed: 20, state: "playing", blocker: null } }))).toBe("");

      // when each scenario button is pressed: at a random tick between 5 and 105 (a whole run is about 135 ticks)
      let x = run.seed;
      const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
      const pressAt = new Map(run.scenarios.map((k) => [k, 5 + Math.floor(rnd() * 100)]));
      const pressed: Record<string, string> = {};
      const blockers: string[] = [];
      const started = Date.now();
      let ticks = 0;
      let stuckSince: number | null = null;
      for (;;) {
        ticks++;
        for (const [k, at] of pressAt) {
          if (ticks === at) {
            const r = await pressScenario(db, sim, k);
            pressed[k] = r.ok ? (r.armed ? "armed" : "done") : `refused: ${r.message}`;
          }
        }
        const t = await simTick(db, sim);
        if (!t.ok) blockers.push(`tick: ${t.message}`);
        else if (t.blocker) {
          if (!blockers.includes(t.blocker)) blockers.push(t.blocker);
          stuckSince ??= Date.now();
          // the judge whose phone "died" comes back after a while, as on the beach
          if (Date.now() - stuckSince > 20_000) await reviveJudge(db, sim);
        } else stuckSince = null;
        const ctl = (await s.from("sim_control").select("state, blocker").eq("event_id", sim).single()).data!;
        if (ctl.state === "stopped") break;
        if (Date.now() - started > 45 * 60_000) break;
        if (stuckSince && Date.now() - stuckSince > 180_000) break;
        await sleep(800);
      }
      const heats = (await s.from("heats").select("id, status, draw_uid, armed_at, publish_hold").eq("event_id", sim)).data ?? [];
      const div = (await s.from("divisions").select("id, draw").eq("event_id", sim).single()).data!;
      const draw = div.draw as DivisionDraw;
      const results = (await s.from("heat_results").select("heat_id, entry_id, place, version").eq("event_id", sim)).data ?? [];
      const latest = new Map<string, number>();
      for (const r of results) latest.set(r.heat_id, Math.max(latest.get(r.heat_id) ?? 0, r.version));
      const winners = (uidPrefix: string) =>
        heats.filter((h) => h.draw_uid?.startsWith(uidPrefix) && h.status === "published").flatMap((h) => results.filter((r) => r.heat_id === h.id && r.version === latest.get(h.id) && r.place === 1).map((r) => r.entry_id)).sort();
      const ridersOf = async (uidPrefix: string) => {
        const ids = heats.filter((h) => h.draw_uid?.startsWith(uidPrefix) && h.status !== "cancelled").map((h) => h.id);
        return (((await s.from("heat_slots").select("entry_id").in("heat_id", ids)).data ?? []).map((r) => r.entry_id as string)).sort();
      };
      const owned = heats.filter((h) => h.draw_uid && h.status !== "cancelled");
      const placings = divisionPlacings(draw);
      const finalHeat = heats.find((h) => h.draw_uid === draw.rounds.at(-1)!.heats[0].uid && h.status !== "cancelled");
      const finalRes = results.filter((r) => r.heat_id === finalHeat?.id && r.version === latest.get(finalHeat!.id)).sort((a, b) => a.place - b.place);
      report.push({ run: n + 1, spread: run.spread, ticks, minutes: Math.round((Date.now() - started) / 6000) / 10, pressed, blockers, published: heats.filter((h) => h.status === "published").length, cancelled: heats.filter((h) => h.status === "cancelled").length });

      expect(owned, "one live heat per draw position").toHaveLength(15);
      expect(owned.every((h) => h.status === "published"), `every heat published (blockers: ${blockers.join(" | ")})`).toBe(true);
      expect(heats.filter((h) => h.armed_at)).toHaveLength(0);
      expect(heats.filter((h) => ["running", "paused"].includes(h.status))).toHaveLength(0);
      for (const [from, to] of [["R1", "R2"], ["R2", "SF"], ["SF", "F"]]) expect(await ridersOf(to), `${to} riders = ${from} winners`).toEqual(winners(from));
      expect(Object.keys(draw.results ?? {})).toHaveLength(15);
      // the champion and the runner-up of the placings are the final's 1st and 2nd
      expect(finalRes.map((r) => r.entry_id).slice(0, 2)).toEqual([1, 2].map((pl) => placings.find((p) => p.place === pl)?.entrantId));
      // every rider is placed exactly once
      expect(new Set(placings.map((p) => p.entrantId)).size).toBe(24);
      // every heat's clock matched its run-order length: the fast clock holds the run order's seconds (original) and ran them divided by 20; nobody ran past it
      const clocks = (await s.from("sim_clock").select("heat_id, original_sec, speed").eq("event_id", sim)).data ?? [];
      const rows = (await s.from("heats").select("id, draw_uid, duration_sec, extra_sec, started_at, ended_at, paused_total_sec").eq("event_id", sim)).data ?? [];
      const lengths: Record<string, unknown>[] = [];
      for (const h of rows.filter((x) => x.draw_uid && expectedSec.has(x.draw_uid))) {
        const c = clocks.find((k) => k.heat_id === h.id);
        const want = expectedSec.get(h.draw_uid!)!;
        lengths.push({ uid: h.draw_uid, runOrderSec: want, original: c?.original_sec, clockSec: h.duration_sec, extra: h.extra_sec });
        if (!c) continue; // a heat that was cancelled and re-run has no clock of its own
        expect(c.original_sec, `${h.draw_uid}: the fast clock holds the run-order length`).toBe(want);
        expect(c.speed).toBe(20);
        expect(h.duration_sec - h.extra_sec, `${h.draw_uid}: clock = run-order length / 20`).toBe(Math.max(3, Math.ceil(want / 20)));
        if (h.started_at && h.ended_at) expect((Date.parse(h.ended_at) - Date.parse(h.started_at)) / 1000, `${h.draw_uid}: ended no later than its clock`).toBeLessThanOrEqual(h.duration_sec + h.paused_total_sec + 2);
      }
      const seven = rows.find((x) => x.draw_uid === overridden.seven);
      const four = rows.find((x) => x.draw_uid === overridden.four);
      expect(seven!.duration_sec - seven!.extra_sec).toBe(21);
      expect(four!.duration_sec - four!.extra_sec).toBe(12);
      report.push({ lengths });
    }, 50 * 60_000);
  }
});
