import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, key } from "./live-helpers";

// HE1 (0.25.0): "Start the next heat" — the notice, Stop, the switch, and every rule that stops the sequence from starting by itself. Hosted development project, throwaway data:
// each test builds its own small event (a published heat, then heats that wait) so the heats of one test never block another.
const MODEL = {
  trick: { entry: "single", scale: { min: 0, max: 10, step: 0.1 } },
  panel: { minJudges: 2 },
  heat: { maxAttemptsPerRider: 7 },
};

describe.skipIf(!ENV_OK)("HE1: Start the next heat (hosted development project)", () => {
  let f: Fixture;
  let modelId: string;
  let n = 0;

  beforeAll(async () => {
    f = await buildFixture();
    const m = await f.s.from("scoring_models").insert({ organisation_id: f.ids.orgA, key: `he1-${key().slice(0, 8)}`, name: "He1 model", version: 1, json: MODEL as never, content_hash: key() }).select("id").single();
    if (m.error) throw new Error(m.error.message);
    modelId = m.data!.id;
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  interface World {
    ev: string;
    prev: string; // a published heat
    next: string; // the heat that waits, two riders
    after: string; // the one after it
    plan: string;
  }
  async function world(settings: object = { startNextHeat: "after_publish", flags: { enabled: true, prestartSec: 15 } }): Promise<World> {
    const must = (r: { data: unknown; error: { message: string } | null }, what: string): { id: string } => {
      if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message}`);
      return r.data as { id: string };
    };
    const s = f.s;
    const today = new Date().toISOString().slice(0, 10);
    n++;
    const ev = must(await s.from("events").insert({ organisation_id: f.ids.orgA, name: `He1 ${n}`, slug: `he1-${f.ids.orgA.slice(0, 6)}-${n}-${key().slice(0, 4)}`, status: "published", timezone: "Africa/Cairo", start_date: today, end_date: today, settings: settings as never }).select("id").single(), "event").id;
    const panel = must(await s.from("panels").insert({ event_id: ev, name: "P" }).select("id").single(), "panel").id;
    let no = 0;
    for (const who of ["j1", "j2"] as const) {
      const seat = must(await s.from("judge_seats").insert({ event_id: ev, name: who, role: "judge", scores: true, auth_user_id: f.userIds[who], status: "active", active: true }).select("id").single(), "seat").id;
      must(await s.from("panel_members").insert({ panel_id: panel, judge_seat_id: seat, seat_no: ++no }).select("id").single(), "member");
    }
    for (const [who, role] of [["head", "head"], ["spotter", "spotter"]] as const) must(await s.from("judge_seats").insert({ event_id: ev, name: who, role, scores: false, auth_user_id: f.userIds[who], status: "active", active: true }).select("id").single(), "seat");
    const div = must(await s.from("divisions").insert({ event_id: ev, name: "Pro", sort_order: 1, scoring_model_id: modelId, panel_id: panel, draw_locked_at: new Date().toISOString() }).select("id").single(), "division").id;
    const round = must(await s.from("rounds").insert({ division_id: div, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} }).select("id").single(), "round").id;
    const entries: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const rider = must(await s.from("riders").insert({ organisation_id: f.ids.orgA, first_name: `R${i}`, last_name: "He1" }).select("id").single(), "rider").id;
      entries.push(must(await s.from("entries").insert({ division_id: div, rider_id: rider, seed: i, status: "confirmed", source: "manual" }).select("id").single(), "entry").id);
    }
    const heat = async (number: number, patch: object) => {
      const id = must(await s.from("heats").insert({ round_id: round, division_id: div, event_id: ev, number, duration_sec: 600, warm_up_sec: 0, ...patch }).select("id").single(), "heat").id;
      for (const [p, e] of [[1, entries[0]], [2, entries[1]]] as const) await s.from("heat_slots").insert({ heat_id: id, position: p, entry_id: e });
      return id;
    };
    const prev = await heat(1, { status: "published", started_at: ago(1500), ended_at: ago(900), published_at: ago(800) });
    const next = await heat(2, {});
    const after = await heat(3, {});
    const plan = must(await s.from("schedule_plans").insert({ event_id: ev, day: today, name: "Main", active: true, items: [{ id: "i1", kind: "heat", heatId: prev }, { id: "i2", kind: "heat", heatId: next }, { id: "i3", kind: "heat", heatId: after }] as never, anchors: {} }).select("id").single(), "plan").id;
    return { ev, prev, next, after, plan };
  }
  const plan = (heat: string, mode = "after_publish", at: string | null = null) => f.clients.head.rpc("plan_auto_start", { p_heat: heat, p_mode: mode, p_heat_start_at: at as never });
  const row = async (heat: string) => (await f.s.from("heats").select("status, armed_at, prestart_sec, auto_start_at, auto_start_mode").eq("id", heat).single()).data!;
  const due = (heat: string) => f.s.from("heats").update({ auto_start_at: ago(1) }).eq("id", heat); // the notice ran out (service role; the guard allows it)
  const tick = async (ev: string, who: "spotter" | "head" = "spotter") => (await f.clients[who].rpc("auto_start_if_due", { p_event: ev })).data as { started: string | null; blocked: string | null };
  const audit = async (ev: string, action: string) => (await f.s.from("audit_log").select("action, reason").eq("event_id", ev).eq("action", action)).data ?? [];

  it("after Publish: the notice is set 10 s ahead, a second call changes nothing, and nothing starts before it has run out", async () => {
    const w = await world();
    const r = await plan(w.next);
    expect(codeOf(r)).toBe("");
    const a = await row(w.next);
    expect(a.auto_start_mode).toBe("after_publish");
    const ahead = Date.parse(a.auto_start_at!) - Date.now();
    expect(ahead).toBeGreaterThan(5_000);
    expect(ahead).toBeLessThanOrEqual(11_000);
    expect(codeOf(await plan(w.next))).toBe("");
    expect((await row(w.next)).auto_start_at).toBe(a.auto_start_at);
    expect((await tick(w.ev)).started).toBeNull();
    expect((await row(w.next)).armed_at).toBeNull();
  });

  it("when the notice has run out the heat's normal start sequence begins (flags and clock), by whichever official's phone asks first; it is written to the audit log", async () => {
    const w = await world();
    await plan(w.next);
    await due(w.next);
    const out = await tick(w.ev, "spotter");
    expect(out.started).toBe(w.next);
    const a = await row(w.next);
    expect(a).toMatchObject({ status: "scheduled", prestart_sec: 15, auto_start_at: null, auto_start_mode: null });
    expect(a.armed_at).toBeTruthy();
    expect((await audit(w.ev, "heat_auto_started"))[0].reason).toContain("after Publish");
    expect((await audit(w.ev, "heat_armed"))[0].reason).toContain("Started by itself");
    expect((await tick(w.ev, "head")).started).toBeNull(); // the second phone changes nothing
  });

  it("flags off: the heat simply starts (Start heat)", async () => {
    const w = await world({ startNextHeat: "after_publish", flags: { enabled: false } });
    await plan(w.next);
    await due(w.next);
    expect((await tick(w.ev)).started).toBe(w.next);
    expect((await row(w.next)).status).toBe("running");
  });

  it("Stop ends the notice and nothing starts; the head judge can still start by hand", async () => {
    const w = await world();
    await plan(w.next);
    expect(codeOf(await f.clients.head.rpc("stop_auto_start", { p_heat: w.next }))).toBe("");
    expect((await row(w.next)).auto_start_at).toBeNull();
    expect((await audit(w.ev, "auto_start_stopped")).length).toBeGreaterThan(0);
    expect((await audit(w.ev, "auto_start_planned")).length).toBeGreaterThan(0);
    expect((await tick(w.ev)).started).toBeNull();
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: w.next, p_prestart: 15 }))).toBe("");
  });

  it("pressing Start heat sequence by hand during the notice ends the notice", async () => {
    const w = await world();
    await plan(w.next);
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: w.next, p_prestart: 15 }))).toBe("");
    const a = await row(w.next);
    expect(a.auto_start_at).toBeNull();
    expect(a.armed_at).toBeTruthy();
  });

  describe("it never starts", () => {
    it("while the previous heat is unpublished (running, ended, under review or in its pre-start)", async () => {
      for (const patch of [{ status: "running", started_at: ago(60) }, { status: "ended", started_at: ago(700), ended_at: ago(60) }, { status: "under_review", started_at: ago(700), ended_at: ago(60) }]) {
        const w = await world();
        await f.s.from("heats").update(patch).eq("id", w.prev);
        expect(codeOf(await plan(w.next))).toContain("AUTO_START_BLOCKED: PREVIOUS_NOT_PUBLISHED");
      }
      const w = await world();
      await f.clients.head.rpc("arm_heat", { p_heat: w.after, p_prestart: 15 });
      expect(codeOf(await plan(w.next))).toContain("PREVIOUS_NOT_PUBLISHED");
    });

    it("while the run order is on Hold — also when the Hold starts during the notice (the notice ends, nothing starts, the audit log says why)", async () => {
      const w = await world();
      await f.s.from("schedule_plans").update({ hold: { since: new Date().toISOString() } }).eq("id", w.plan);
      expect(codeOf(await plan(w.next))).toContain("HOLD");
      await f.s.from("schedule_plans").update({ hold: null }).eq("id", w.plan);
      expect(codeOf(await plan(w.next))).toBe("");
      await f.s.from("schedule_plans").update({ hold: { since: new Date().toISOString() } }).eq("id", w.plan);
      await due(w.next);
      const out = await tick(w.ev);
      expect(out).toEqual({ started: null, blocked: "HOLD" });
      expect(await row(w.next)).toMatchObject({ armed_at: null, auto_start_at: null });
      expect((await audit(w.ev, "auto_start_blocked"))[0].reason).toContain("on hold");
    });

    it("while a wind call of Stop or Hold is on; Lets go and Clear do not stop it", async () => {
      const w = await world();
      for (const status of ["red", "amber"]) {
        await f.s.from("wind_calls").insert({ event_id: w.ev, status });
        expect(codeOf(await plan(w.next))).toContain("WIND_CALL");
      }
      await f.s.from("wind_calls").insert({ event_id: w.ev, status: "green" });
      expect(codeOf(await plan(w.next))).toBe("");
      await f.s.from("wind_calls").insert({ event_id: w.ev, status: "red" });
      await due(w.next);
      expect((await tick(w.ev)).blocked).toBe("WIND_CALL");
      expect((await row(w.next)).armed_at).toBeNull();
    });

    it("when the heat has an empty seat (its rider is still to be decided) or only one rider rides (the walkover is not decided)", async () => {
      const w = await world();
      await f.s.from("heat_slots").update({ entry_id: null, source: { from: "1st R1 H1" } as never }).eq("heat_id", w.next).eq("position", 2);
      expect(codeOf(await plan(w.next))).toContain("SEATS_NOT_FILLED");
      await f.s.from("heat_slots").update({ entry_id: null, modifier: "DNS" }).eq("heat_id", w.next).eq("position", 2); // a seat marked as not starting is a decided seat…
      expect(codeOf(await plan(w.next))).toContain("WALKOVER_UNDECIDED"); // …but one rider alone is the head judge's Walkover to give
    });

    it("when auto start is off for the event (manual, or the head judge's switch), or the mode is not the event's", async () => {
      const manual = await world({ flags: { enabled: true, prestartSec: 15 } }); // no setting = by hand, the default of every event
      expect(codeOf(await plan(manual.next))).toContain("AUTO_START_OFF");
      const w = await world();
      expect(codeOf(await plan(w.next, "run_order", new Date(Date.now() + 20_000).toISOString()))).toContain("AUTO_START_OFF");
      expect(codeOf(await plan(w.next))).toBe("");
      // the switch: off ends a running notice and refuses a new one; on gives it back
      expect(codeOf(await f.clients.head.rpc("set_auto_start", { p_event: w.ev, p_on: false }))).toBe("");
      expect((await row(w.next)).auto_start_at).toBeNull();
      expect(codeOf(await plan(w.next))).toContain("AUTO_START_OFF");
      expect(codeOf(await f.clients.head.rpc("set_auto_start", { p_event: w.ev, p_on: true }))).toBe("");
      expect(codeOf(await plan(w.next))).toBe("");
      expect((await audit(w.ev, "auto_start_switched")).map((a) => a.reason)).toEqual(expect.arrayContaining(["Auto start switched off", "Auto start switched on"]));
    });

    it("when the notice runs out after the head judge switched auto start off by another route (the event's setting)", async () => {
      const w = await world();
      await plan(w.next);
      await f.s.from("events").update({ settings: { startNextHeat: "after_publish", autoStartOff: true, flags: { enabled: true, prestartSec: 15 } } as never }).eq("id", w.ev);
      await due(w.next);
      expect((await tick(w.ev)).blocked).toBe("OFF");
      expect((await row(w.next)).armed_at).toBeNull();
    });
  });

  describe("at the run order time", () => {
    const runOrder = { startNextHeat: "run_order", flags: { enabled: true, prestartSec: 15 } };

    it("too early: refused until the sequence is due within 10 s; then the notice holds so that the heat itself begins at its time", async () => {
      const w = await world(runOrder);
      const heatStart = Date.now() + 60_000;
      expect(codeOf(await plan(w.next, "run_order", new Date(heatStart).toISOString()))).toContain("AUTO_START_TOO_EARLY"); // the sequence is due at +45 s
      const soon = Date.now() + 22_000; // 15 s of yellow: the sequence is due at +7 s, so the notice is the full 10 s
      expect(codeOf(await plan(w.next, "run_order", new Date(soon).toISOString()))).toBe("");
      const a = await row(w.next);
      expect(a.auto_start_mode).toBe("run_order");
      const ahead = Date.parse(a.auto_start_at!) - Date.now();
      expect(ahead).toBeGreaterThan(8_000);
      expect(ahead).toBeLessThanOrEqual(11_000);
    });

    it("the sequence starts at (run order time − pre-start), so the heat itself begins at its time", async () => {
      const w = await world(runOrder);
      const heatStart = Date.now() + 28_000; // due at +13 s: more than 12 s away, refused; ask again a moment later in the real flow
      expect(codeOf(await plan(w.next, "run_order", new Date(heatStart).toISOString()))).toContain("AUTO_START_TOO_EARLY");
      const t = Date.now() + 25_000; // due at +10 s exactly
      expect(codeOf(await plan(w.next, "run_order", new Date(t).toISOString()))).toBe("");
      const at = Date.parse((await row(w.next)).auto_start_at!);
      expect(Math.abs(at - (t - 15_000))).toBeLessThan(2_500);
      await due(w.next);
      expect((await tick(w.ev)).started).toBe(w.next);
      expect((await audit(w.ev, "heat_auto_started"))[0].reason).toContain("run order time");
    });

    it("a head judge who is late gets the full 10 s notice and then the sequence (never earlier than the notice)", async () => {
      const w = await world(runOrder);
      expect(codeOf(await plan(w.next, "run_order", new Date(Date.now() - 120_000).toISOString()))).toBe("");
      const ahead = Date.parse((await row(w.next)).auto_start_at!) - Date.now();
      expect(ahead).toBeGreaterThan(8_000);
    });
  });

  describe("who may", () => {
    it("only the head judge or an organiser plans, stops or switches; every official may ask whether a notice is due; a visitor may not", async () => {
      const w = await world();
      expect(codeOf(await f.clients.spotter.rpc("plan_auto_start", { p_heat: w.next, p_mode: "after_publish", p_heat_start_at: null as never }))).toContain("NOT_ALLOWED");
      expect(codeOf(await f.clients.j1.rpc("set_auto_start", { p_event: w.ev, p_on: false }))).toContain("NOT_ALLOWED");
      expect(codeOf(await plan(w.next))).toBe("");
      expect(codeOf(await f.clients.spotter.rpc("stop_auto_start", { p_heat: w.next }))).toContain("NOT_ALLOWED");
      expect(codeOf(await f.clients.spotter.rpc("auto_start_if_due", { p_event: w.ev }))).toBe("");
      expect(codeOf(await f.clients.anon.rpc("auto_start_if_due", { p_event: w.ev }))).not.toBe("");
      expect(codeOf(await f.clients.orgB.rpc("auto_start_if_due", { p_event: w.ev }))).toContain("NOT_ALLOWED");
      expect(codeOf(await f.clients.orgA.rpc("set_auto_start", { p_event: w.ev, p_on: true }))).toBe("");
    });

    it("nobody edits the notice by hand", async () => {
      const w = await world();
      await plan(w.next);
      const before = await row(w.next);
      await f.clients.orgA.from("heats").update({ auto_start_at: ago(5) }).eq("id", w.next);
      expect((await row(w.next)).auto_start_at).toBe(before.auto_start_at);
    });
  });
});
