import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// The pre-start controls: Pause freezes the yellow (one pause state, console or simulator), "+1 min" adds exactly 60 s, the typed pre-start is 0:10 to 15:00, and a
// heat that goes back to "not started" never keeps a start sequence (Reset this heat).
describe.skipIf(!ENV_OK)("Flags: pre-start controls (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  const audit = async (heat: string, action: string) => (await f.s.from("audit_log").select("action, reason, at").eq("row_id", heat).eq("action", action)).data ?? [];
  const row = async (id: string) => (await f.s.from("heats").select("status, started_at, armed_at, prestart_sec, armed_paused_at, duration_sec, time_scale").eq("id", id).single()).data!;

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "PreDiv", seats: ["j1", "j2", "j3"] });
    await f.s.from("heats").update({ status: "ended", ended_at: ago(10) }).in("id", [f.ids.H1, f.ids.H4, f.ids.H5]);
    await f.s.from("events").update({ settings: { publicLiveScores: "live", maxRunningHeats: 1 } }).eq("id", f.ids.evA1);
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("the typed pre-start is 0:10 to 15:00 (or 0 = Start now); anything else is refused", async () => {
    const h = await mkHeat(f, d);
    for (const bad of [1, 9, 901, 5000]) expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: bad })), String(bad)).toContain("BAD_PRESTART");
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 900 }))).toBe("");
    expect((await row(h)).prestart_sec).toBe(900);
    await f.clients.head.rpc("abort_start", { p_heat: h });
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 10 }))).toBe("");
    await f.clients.head.rpc("abort_start", { p_heat: h });
  });

  it("+1 min adds exactly 60 seconds to the pre-start, repeatably, and records it; nothing else changes", async () => {
    const h = await mkHeat(f, d, { duration_sec: 777 });
    expect(codeOf(await f.clients.head.rpc("extend_prestart", { p_heat: h }))).toContain("NOTHING_ARMED");
    await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 90 });
    const before = await row(h);
    expect(codeOf(await f.clients.head.rpc("extend_prestart", { p_heat: h }))).toBe("");
    expect(codeOf(await f.clients.orgA.rpc("extend_prestart", { p_heat: h }))).toBe("");
    const after = await row(h);
    expect(after.prestart_sec).toBe(90 + 120);
    expect(after.armed_at).toBe(before.armed_at); // the start moment moves only because the length grew
    expect(after.duration_sec).toBe(777); // the heat length is not touched
    expect((await audit(h, "heat_prestart_extended")).length).toBe(2);
    await f.clients.head.rpc("abort_start", { p_heat: h });
  });

  it("who may press +1 min, Pause and Resume of a yellow: exactly whoever may press Start heat", async () => {
    const h = await mkHeat(f, d);
    await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 60 });
    for (const who of ["j1", "spotter", "announcer", "orgB", "bJudge", "anon"] as const) {
      for (const fn of ["extend_prestart", "pause_heat", "resume_heat"] as const) expect(codeOf(await f.clients[who].rpc(fn, { p_heat: h })), `${who} ${fn}`).not.toBe("");
    }
    expect((await row(h)).prestart_sec).toBe(60);
    expect((await row(h)).armed_paused_at).toBeNull();
    await f.clients.head.rpc("abort_start", { p_heat: h });
  });

  it("Pause freezes the countdown wherever it is; Resume carries on from the same remaining time; Start now, Abort and +1 min work while it is frozen", async () => {
    const h = await mkHeat(f, d);
    await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 30 });
    expect(codeOf(await f.clients.head.rpc("pause_heat", { p_heat: h }))).toBe("");
    const paused = await row(h);
    expect(paused.armed_paused_at).not.toBeNull();
    expect((await audit(h, "heat_prestart_paused")).length).toBe(1);
    // 100 s "pass" (the stored start is moved back): a frozen pre-start does not start the heat
    await f.s.from("heats").update({ armed_at: ago(100), armed_paused_at: ago(90) }).eq("id", h);
    expect((await row(h)).status).toBe("scheduled");
    expect(codeOf(await f.clients.head.rpc("extend_prestart", { p_heat: h }))).toBe("");
    expect(codeOf(await f.clients.head.rpc("pause_heat", { p_heat: h }))).toContain("ILLEGAL_HEAT_TRANSITION");
    // Resume: the start moment moves by the time it was frozen (90 s), so about 30 + 60 - 10 = 80 s of pre-start are left
    expect(codeOf(await f.clients.head.rpc("resume_heat", { p_heat: h }))).toBe("");
    const resumed = await row(h);
    expect(resumed.armed_paused_at).toBeNull();
    const left = (Date.parse(resumed.armed_at!) + resumed.prestart_sec! * 1000 - Date.now()) / 1000;
    expect(left).toBeGreaterThan(70);
    expect(left).toBeLessThan(90);
    expect((await audit(h, "heat_prestart_resumed")).length).toBe(1);
    // paused again: Start now and Abort still work
    await f.clients.head.rpc("pause_heat", { p_heat: h });
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h }))).toBe("");
    expect((await row(h)).status).toBe("running");
    await f.s.from("heats").update({ status: "ended", ended_at: ago(1) }).eq("id", h);
    const g = await mkHeat(f, d);
    await f.clients.head.rpc("arm_heat", { p_heat: g, p_prestart: 30 });
    await f.clients.head.rpc("pause_heat", { p_heat: g });
    expect(codeOf(await f.clients.head.rpc("abort_start", { p_heat: g }))).toBe("");
    const aborted = await row(g);
    expect(aborted.armed_at).toBeNull();
    expect(aborted.armed_paused_at).toBeNull();
  });

  it("Reset this heat: a reset heat is not started, flags show Stopped, and it never keeps a start sequence (even a stale one)", async () => {
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) });
    // an old start sequence left on the row would make the reset heat run again at once
    await f.s.from("heats").update({ armed_at: ago(2000), prestart_sec: 60 }).eq("id", h);
    const r = await f.clients.orgA.rpc("reset_heat", { p_heat: h, p_reason: "testing the reset", p_before: null, p_draw: null, p_seats: null });
    expect(codeOf(r)).toBe("");
    const after = await row(h);
    expect(after).toMatchObject({ status: "scheduled", started_at: null, armed_at: null, prestart_sec: null, armed_paused_at: null });
    const eff = (await f.s.rpc("heat_effective_status" as never, { p_heat: h } as never)).data;
    // (the private helper is not callable by clients: the public timetable tells the same)
    void eff;
    const t = (await f.clients.anon.rpc("get_public_timetable", { p_event: f.ids.evA1 })).data as { heats: Array<{ id: string; effective_status: string }> };
    expect(t.heats.find((x) => x.id === h)?.effective_status).toBe("scheduled");
  });

  it("the public timetable tells the page the frozen pre-start and the speed", async () => {
    const h = await mkHeat(f, d);
    await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 60 });
    await f.clients.head.rpc("pause_heat", { p_heat: h });
    const t = (await f.clients.anon.rpc("get_public_timetable", { p_event: f.ids.evA1 })).data as { heats: Array<{ id: string; armed_paused_at: string | null; time_scale: number; effective_status: string }> };
    const x = t.heats.find((y) => y.id === h)!;
    expect(x.armed_paused_at).not.toBeNull();
    expect(x.time_scale).toBe(1);
    expect(x.effective_status).toBe("scheduled");
    await f.clients.head.rpc("abort_start", { p_heat: h });
  });
});
