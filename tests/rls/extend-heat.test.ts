import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Polish 4, F: "+1 min" on a RUNNING heat. Exactly 60 s more on what is left, repeatable, only a head seat or the organiser, refused on a heat that is not running,
// written to the audit log, and a heat that goes back to "not started" gets its own length back.
describe.skipIf(!ENV_OK)("+1 min on a running heat (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  const audit = async (heat: string) => (await f.s.from("audit_log").select("action, reason").eq("row_id", heat).eq("action", "heat_extended")).data ?? [];
  const row = async (id: string) => (await f.s.from("heats").select("status, started_at, duration_sec, extra_sec, paused_total_sec, time_scale").eq("id", id).single()).data!;
  const endMs = (r: { started_at: string | null; duration_sec: number; paused_total_sec: number }) => Date.parse(r.started_at!) + (r.duration_sec + r.paused_total_sec) * 1000;
  const run = async (h: string) => {
    await f.s.from("heats").update({ status: "running", started_at: ago(560) }).eq("id", h); // 0:40 left on a 10-minute heat
  };

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "ExtDiv", seats: ["j1", "j2", "j3"] });
    await f.s.from("heats").update({ status: "ended", ended_at: ago(10) }).in("id", [f.ids.H1, f.ids.H4, f.ids.H5]);
    await f.s.from("events").update({ settings: { publicLiveScores: "live", maxRunningHeats: 1 } }).eq("id", f.ids.evA1);
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("adds exactly 60 seconds to the end, as often as pressed (no cap), by the head seat or the organiser, and changes nothing else", async () => {
    const h = await mkHeat(f, d, { duration_sec: 600 });
    await run(h);
    const before = await row(h);
    expect(codeOf(await f.clients.head.rpc("extend_heat", { p_heat: h }))).toBe("");
    expect(codeOf(await f.clients.orgA.rpc("extend_heat", { p_heat: h }))).toBe("");
    for (let i = 0; i < 3; i++) expect(codeOf(await f.clients.head.rpc("extend_heat", { p_heat: h }))).toBe("");
    const after = await row(h);
    expect(endMs(after) - endMs(before)).toBe(5 * 60_000);
    expect(after.started_at).toBe(before.started_at);
    expect(after.paused_total_sec).toBe(before.paused_total_sec);
    expect(after.extra_sec).toBe(300);
    expect(after.status).toBe("running");
  });

  it("is written to the audit log with who and the new end", async () => {
    const h = await mkHeat(f, d, { duration_sec: 600 });
    await run(h);
    await f.clients.head.rpc("extend_heat", { p_heat: h });
    const lines = await audit(h);
    expect(lines).toHaveLength(1);
    expect(lines[0].reason).toMatch(/^\+1 min by .+ at \d\d:\d\d:\d\d, heat now ends \d\d:\d\d:\d\d$/);
  });

  it("is refused for everybody who is not a head seat or the organiser", async () => {
    const h = await mkHeat(f, d, { duration_sec: 600 });
    await run(h);
    for (const who of ["j1", "spotter", "announcer", "orgB", "bJudge", "anon"] as const) expect(codeOf(await f.clients[who].rpc("extend_heat", { p_heat: h })), who).not.toBe("");
    expect((await row(h)).extra_sec).toBe(0);
    expect(await audit(h)).toHaveLength(0);
  });

  it("is refused on a heat that is not running: not started, paused, ended, and one whose time is up", async () => {
    const h = await mkHeat(f, d, { duration_sec: 600 });
    expect(codeOf(await f.clients.head.rpc("extend_heat", { p_heat: h }))).toContain("HEAT_NOT_RUNNING"); // not started
    await run(h);
    await f.s.from("heats").update({ status: "paused", paused_at: new Date().toISOString() }).eq("id", h);
    expect(codeOf(await f.clients.head.rpc("extend_heat", { p_heat: h }))).toContain("HEAT_NOT_RUNNING"); // paused
    await f.s.from("heats").update({ status: "ended", ended_at: ago(5) }).eq("id", h);
    expect(codeOf(await f.clients.head.rpc("extend_heat", { p_heat: h }))).toContain("HEAT_NOT_RUNNING"); // ended
    const late = await mkHeat(f, d, { duration_sec: 600 });
    await f.s.from("heats").update({ status: "running", started_at: ago(700) }).eq("id", late);
    expect(codeOf(await f.clients.head.rpc("extend_heat", { p_heat: late }))).toContain("HEAT_NOT_RUNNING"); // 0:00 reached
    expect((await row(h)).extra_sec).toBe(0);
    expect(await audit(h)).toHaveLength(0);
  });

  it("a simulation at x10 adds 6 seconds (60 s of heat time)", async () => {
    const h = await mkHeat(f, d, { duration_sec: 60 });
    await f.s.from("heats").update({ time_scale: 10 }).eq("id", h);
    await f.s.from("heats").update({ status: "running", started_at: ago(54) }).eq("id", h);
    const before = await row(h);
    expect(codeOf(await f.clients.head.rpc("extend_heat", { p_heat: h }))).toBe("");
    expect(endMs(await row(h)) - endMs(before)).toBe(6_000);
  });

  it("an organiser cannot move the added time by hand, and a heat that goes back to not started gets its own length back", async () => {
    const h = await mkHeat(f, d, { duration_sec: 600 });
    await run(h);
    await f.clients.head.rpc("extend_heat", { p_heat: h });
    await f.clients.orgA.from("heats").update({ extra_sec: 0 }).eq("id", h);
    expect((await row(h)).extra_sec).toBe(60);
    await f.s.from("heats").update({ status: "ended", ended_at: ago(5) }).eq("id", h);
    expect((await row(h)).duration_sec).toBe(660); // an ended heat keeps what it really ran
    await f.s.from("heats").update({ status: "scheduled", started_at: null, ended_at: null }).eq("id", h);
    const reset = await row(h);
    expect(reset.duration_sec).toBe(600);
    expect(reset.extra_sec).toBe(0);
  });
});
