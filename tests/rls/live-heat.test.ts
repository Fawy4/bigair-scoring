import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, heatRow, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Phase 5b step 1: the heat state machine through its functions only, on the server's clock. Each `it` is one plain sentence.
describe.skipIf(!ENV_OK)("Live heat: start, pause, resume, end, cancel, hold and shift (hosted development project)", () => {
  let f: Fixture;
  let ok: LiveDivision; // three judges, draw locked
  let small: LiveDivision; // two judges only
  let unlocked: LiveDivision;
  const setMax = async (n: number) => {
    await f.s.from("events").update({ settings: { publicLiveScores: "live", maxRunningHeats: n } }).eq("id", f.ids.evA1);
  };

  beforeAll(async () => {
    f = await buildFixture();
    ok = await mkDivision(f, { name: "LiveOk", seats: ["j1", "j2", "j3"] });
    small = await mkDivision(f, { name: "LiveSmall", seats: ["j1", "j2"] });
    unlocked = await mkDivision(f, { name: "LiveOpen", seats: ["j1", "j2", "j3"], locked: false });
    // the shared fixture's heats H1 (running) and H4 (running, time already up) are in this event: they count towards "one running heat"
    await f.s.from("heats").update({ status: "ended", ended_at: ago(10) }).in("id", [f.ids.H1, f.ids.H4, f.ids.H5]);
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("start is refused, in plain codes, for an unlocked draw, a panel of 2 when the model needs 3, a seat still waiting for a place, and a second running heat", async () => {
    await setMax(1);
    const h1 = await mkHeat(f, unlocked);
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h1 }))).toContain("DRAW_NOT_LOCKED");
    const h2 = await mkHeat(f, small);
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h2 }))).toMatch(/PANEL_TOO_SMALL: LiveSmall\|2\|3/);
    const h3 = await mkHeat(f, ok, {}, { placeholder: true });
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h3 }))).toContain("SEATS_NOT_FILLED");
    const h4 = await mkHeat(f, ok);
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h4 }))).toBe("");
    const h5 = await mkHeat(f, ok);
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h5 }))).toContain("HEAT_ALREADY_RUNNING");
    await setMax(2);
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h5 }))).toBe("");
    await setMax(1);
    await f.s.from("heats").update({ status: "ended" }).in("id", [h4, h5]);
  });

  it("a heat whose time is up no longer holds the running place, so the next heat can start", async () => {
    await setMax(1);
    const old = await mkHeat(f, ok, { status: "running", started_at: ago(900) });
    const next = await mkHeat(f, ok);
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: next }))).toBe("");
    await f.s.from("heats").update({ status: "ended" }).in("id", [old, next]);
  });

  it("the head judge and an organiser can start; a judge, a spotter, an announcer, a visitor and another organisation's people cannot", async () => {
    await setMax(5);
    const h = await mkHeat(f, ok);
    for (const who of ["j1", "spotter", "announcer", "orgB", "bJudge"] as const) expect(codeOf(await f.clients[who].rpc("start_heat", { p_heat: h })), who).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.anon.rpc("start_heat", { p_heat: h }))).not.toBe("");
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h }))).toBe("");
    const h2 = await mkHeat(f, ok);
    expect(codeOf(await f.clients.orgA.rpc("start_heat", { p_heat: h2 }))).toBe("");
    await f.s.from("heats").update({ status: "ended" }).in("id", [h, h2]);
  });

  it("the server stamps started_at; a client cannot write it, and nobody can move a heat's status by editing the row", async () => {
    await setMax(5);
    const h = await mkHeat(f, ok);
    const forged = await f.clients.head.from("heats").update({ started_at: ago(5000) }).eq("id", h);
    expect(codeOf(forged)).toBe("");
    expect((await heatRow(f, h)).started_at).toBeNull();
    expect(codeOf(await f.clients.head.from("heats").update({ status: "running" }).eq("id", h))).toContain("USE_HEAT_FUNCTIONS");
    expect(codeOf(await f.clients.orgA.from("heats").update({ status: "running" }).eq("id", h))).toContain("USE_HEAT_FUNCTIONS");
    expect((await heatRow(f, h)).status).toBe("scheduled");
    const before = Date.now();
    await f.clients.head.rpc("start_heat", { p_heat: h });
    const row = await heatRow(f, h);
    expect(row.status).toBe("running");
    expect(Math.abs(Date.parse(row.started_at!) - before)).toBeLessThan(15_000);
    await f.s.from("heats").update({ status: "ended" }).eq("id", h);
  });

  it("pause freezes the clock, resume adds the paused seconds, and the moves out of order are refused", async () => {
    await setMax(5);
    const h = await mkHeat(f, ok);
    expect(codeOf(await f.clients.head.rpc("pause_heat", { p_heat: h }))).toContain("ILLEGAL_HEAT_TRANSITION");
    await f.clients.head.rpc("start_heat", { p_heat: h });
    expect(codeOf(await f.clients.head.rpc("resume_heat", { p_heat: h }))).toContain("ILLEGAL_HEAT_TRANSITION");
    expect(codeOf(await f.clients.j1.rpc("pause_heat", { p_heat: h }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.head.rpc("pause_heat", { p_heat: h }))).toBe("");
    expect((await heatRow(f, h)).paused_at).not.toBeNull();
    await new Promise((r) => setTimeout(r, 2200));
    expect(codeOf(await f.clients.head.rpc("resume_heat", { p_heat: h }))).toBe("");
    const row = await heatRow(f, h);
    expect(row.status).toBe("running");
    expect(row.paused_at).toBeNull();
    expect(row.paused_total_sec).toBeGreaterThanOrEqual(2);
    expect(codeOf(await f.clients.head.rpc("end_heat", { p_heat: h }))).toBe("");
    expect((await heatRow(f, h)).ended_at).not.toBeNull();
    expect(codeOf(await f.clients.head.rpc("end_heat", { p_heat: h }))).toContain("ILLEGAL_HEAT_TRANSITION");
  });

  it("end_heat_if_due before the time is a no-op; after the time it ends the heat at its real end; a second call changes nothing", async () => {
    await setMax(5);
    const early = await mkHeat(f, ok, { status: "running", started_at: ago(60) });
    const r1 = await f.clients.j1.rpc("end_heat_if_due", { p_heat: early });
    expect(codeOf(r1)).toBe("");
    expect((await heatRow(f, early)).status).toBe("running");
    const late = await mkHeat(f, ok, { status: "running", started_at: ago(700) });
    expect(codeOf(await f.clients.spotter.rpc("end_heat_if_due", { p_heat: late }))).toBe("");
    const after = await heatRow(f, late);
    expect(after.status).toBe("ended");
    expect(Math.abs(Date.parse(after.ended_at!) - (Date.parse(after.started_at!) + 600_000))).toBeLessThan(2000); // ended at start + 600 s, not at "now"
    const again = await f.clients.j2.rpc("end_heat_if_due", { p_heat: late });
    expect(codeOf(again)).toBe("");
    expect((await heatRow(f, late)).ended_at).toBe(after.ended_at);
    expect(codeOf(await f.clients.bJudge.rpc("end_heat_if_due", { p_heat: late }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.anon.rpc("end_heat_if_due", { p_heat: late }))).not.toBe("");
    await f.s.from("heats").update({ status: "ended" }).eq("id", early);
  });

  it("a paused heat is never ended by the clock", async () => {
    await setMax(5);
    const h = await mkHeat(f, ok, { status: "paused", started_at: ago(3000), paused_at: ago(2000) });
    expect(codeOf(await f.clients.j1.rpc("end_heat_if_due", { p_heat: h }))).toBe("");
    expect((await heatRow(f, h)).status).toBe("paused");
    await f.s.from("heats").update({ status: "ended" }).eq("id", h);
  });

  it("cancel needs a reason, keeps the start of a heat that ran, and is audited; a published heat cannot be cancelled", async () => {
    await setMax(5);
    const h = await mkHeat(f, ok);
    await f.clients.head.rpc("start_heat", { p_heat: h });
    expect(codeOf(await f.clients.head.rpc("cancel_heat", { p_heat: h, p_reason: " " }))).toContain("REASON_REQUIRED");
    expect(codeOf(await f.clients.j1.rpc("cancel_heat", { p_heat: h, p_reason: "kite tangle" }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.head.rpc("cancel_heat", { p_heat: h, p_reason: "kite tangle" }))).toBe("");
    const row = await heatRow(f, h);
    expect(row.status).toBe("cancelled");
    expect(row.started_at).not.toBeNull();
    expect(row.ended_at).not.toBeNull();
    const lines = (await f.s.from("audit_log").select("action, reason, actor_user_id").eq("row_id", h).order("at")).data ?? [];
    expect(lines.map((l) => l.action)).toEqual(["heat_started", "heat_cancelled"]);
    expect(lines[1].reason).toBe("kite tangle");
    expect(lines[0].actor_user_id).toBe(f.userIds.head);
    const pub = await mkHeat(f, ok, { status: "published", started_at: ago(900), ended_at: ago(300), published_at: ago(100) });
    expect(codeOf(await f.clients.head.rpc("cancel_heat", { p_heat: pub, p_reason: "oops" }))).toContain("HEAT_PUBLISHED");
  });

  it("the server clock is available to every signed-in phone", async () => {
    const r = await f.clients.j1.rpc("server_now");
    expect(codeOf(r)).toBe("");
    expect(Math.abs(Date.parse(r.data as string) - Date.now())).toBeLessThan(60_000);
  });

  describe("hold, resume at and shift go through the functions only", () => {
    let plan: string;
    let inactive: string;
    beforeAll(async () => {
      plan = (await f.s.from("schedule_plans").insert({ event_id: f.ids.evA1, day: "2026-10-10", name: "Main", items: [], anchors: { a: "10:00" }, active: true }).select("id").single()).data!.id;
      inactive = (await f.s.from("schedule_plans").insert({ event_id: f.ids.evA1, day: "2026-10-10", name: "Other", items: [], anchors: {}, active: false }).select("id").single()).data!.id;
    });
    const planRow = async (id: string) => (await f.s.from("schedule_plans").select("hold, anchors, updated_at").eq("id", id).single()).data!;

    it("the head judge sets a hold and clears it with new pins, in one audited step", async () => {
      const since = new Date().toISOString();
      expect(codeOf(await f.clients.head.rpc("set_plan_hold", { p_plan: plan, p_hold: { since, reason: "wind dropped" }, p_reason: "wind dropped" }))).toBe("");
      expect((await planRow(plan)).hold).toMatchObject({ since, reason: "wind dropped" });
      expect(codeOf(await f.clients.head.rpc("set_plan_hold", { p_plan: plan, p_hold: null, p_anchors: { a: "10:00", b: "16:00" } }))).toBe("");
      const row = await planRow(plan);
      expect(row.hold).toBeNull();
      expect(row.anchors).toEqual({ a: "10:00", b: "16:00" });
      const lines = (await f.s.from("audit_log").select("action").eq("row_id", plan).like("action", "plan_hold%").order("at")).data ?? [];
      expect(lines.map((l) => l.action)).toEqual(["plan_hold_set", "plan_hold_cleared"]);
    });

    it("shift changes the pins; an organiser can too; judges, spotters and other organisations cannot", async () => {
      expect(codeOf(await f.clients.head.rpc("set_plan_anchors", { p_plan: plan, p_anchors: { a: "10:00", b: "16:10" } }))).toBe("");
      expect(codeOf(await f.clients.orgA.rpc("set_plan_anchors", { p_plan: plan, p_anchors: { a: "10:05", b: "16:10" } }))).toBe("");
      for (const who of ["j1", "spotter", "announcer", "orgB"] as const) {
        expect(codeOf(await f.clients[who].rpc("set_plan_anchors", { p_plan: plan, p_anchors: { z: "01:00" } })), who).toContain("NOT_ALLOWED");
        expect(codeOf(await f.clients[who].rpc("set_plan_hold", { p_plan: plan, p_hold: null })), who).toContain("NOT_ALLOWED");
      }
      expect((await planRow(plan)).anchors).toEqual({ a: "10:05", b: "16:10" });
    });

    it("the head seat still cannot write a plan row directly", async () => {
      const r = await f.clients.head.from("schedule_plans").update({ anchors: { x: "09:00" } }).eq("id", plan).select("id");
      expect(r.data ?? []).toHaveLength(0);
      expect((await planRow(plan)).anchors).toEqual({ a: "10:05", b: "16:10" });
    });

    it("only the active plan can be changed; a bad time or a stale copy changes nothing", async () => {
      expect(codeOf(await f.clients.head.rpc("set_plan_anchors", { p_plan: inactive, p_anchors: { a: "10:00" } }))).toContain("PLAN_NOT_ACTIVE");
      expect(codeOf(await f.clients.head.rpc("set_plan_anchors", { p_plan: plan, p_anchors: { a: "25:99" } }))).toContain("BAD_PLAN_VALUE");
      expect(codeOf(await f.clients.head.rpc("set_plan_hold", { p_plan: plan, p_hold: { reason: "no moment" } }))).toContain("BAD_PLAN_VALUE");
      expect(codeOf(await f.clients.head.rpc("set_plan_anchors", { p_plan: plan, p_anchors: { a: "11:00" }, p_expected: "2020-01-01T00:00:00Z" }))).toContain("PLAN_CHANGED");
      expect((await planRow(plan)).anchors).toEqual({ a: "10:05", b: "16:10" });
    });
  });
});
