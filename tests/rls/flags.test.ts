import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, signedIn, type Fixture } from "./helpers";
import { ago, codeOf, heatRow, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Flags: the start sequence on the server's clock. Arm, Start now (Start heat on an armed heat) and Abort are allowed to exactly whoever may press Start heat,
// and refused to everyone else, an Observer included. The heat is running once now >= armed_at + prestart_sec; the write gates open at green, never at the yellow.
describe.skipIf(!ENV_OK)("Flags: arm, start now, abort (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  let obs: SupabaseClient;
  const users: string[] = [];
  const setSettings = async (settings: object) => {
    await f.s.from("events").update({ settings }).eq("id", f.ids.evA1);
  };
  const ended = async (...ids: string[]) => {
    await f.s.from("heats").update({ status: "ended", armed_at: null, prestart_sec: null, ended_at: ago(1) }).in("id", ids);
  };
  const audit = async (heat: string, action: string) => (await f.s.from("audit_log").select("action, reason, at").eq("row_id", heat).eq("action", action)).data ?? [];

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "FlagDiv", seats: ["j1", "j2", "j3"] });
    await f.s.from("heats").update({ status: "ended", ended_at: ago(10) }).in("id", [f.ids.H1, f.ids.H4, f.ids.H5]);
    const password = `Pw-${randomBytes(12).toString("hex")}`;
    const email = `rls-flag-obs-${randomBytes(4).toString("hex")}@example.com`;
    const { data, error } = await f.s.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    obs = await signedIn(email, password);
    const seat = await f.s.from("judge_seats").insert({ event_id: f.ids.evA1, name: "Guest", role: "observer", scores: false, auth_user_id: data.user.id, status: "active", active: true }).select("id").single();
    if (seat.error) throw new Error(seat.error.message);
    await setSettings({ publicLiveScores: "live", maxRunningHeats: 1 });
  });
  afterEach(async () => {
    await setSettings({ publicLiveScores: "live", maxRunningHeats: 1 });
    // nothing stays armed or running between tests (one heat at a time)
    await f.s.from("heats").update({ armed_at: null, prestart_sec: null }).eq("event_id", f.ids.evA1).not("armed_at", "is", null);
    await f.s.from("heats").update({ status: "ended", ended_at: ago(1) }).eq("event_id", f.ids.evA1).in("status", ["running", "paused"]);
  });
  afterAll(async () => {
    for (const u of users) await f?.s.auth.admin.deleteUser(u);
    await f?.cleanup();
  });

  it("every event has the Flags card switched on after the migration (and a new settings object reads as on)", async () => {
    const { data } = await f.s.from("events").select("settings");
    const withFlagsOff = (data ?? []).filter((e) => (e.settings as { flags?: { enabled?: boolean } } | null)?.flags?.enabled === false);
    expect(withFlagsOff.length).toBe(0);
  });

  it("arming raises the yellow: the heat stays scheduled, with the arming time and the pre-start length on the server", async () => {
    const h = await mkHeat(f, d);
    const before = Date.now();
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 60 }))).toBe("");
    const row = await heatRow(f, h);
    expect(row.status).toBe("scheduled");
    expect(row.started_at).toBeNull();
    expect(row.prestart_sec).toBe(60);
    expect(Math.abs(Date.parse(row.armed_at!) - before)).toBeLessThan(15_000);
    expect((await audit(h, "heat_armed")).length).toBe(1);
    await f.s.from("heats").update({ armed_at: null, prestart_sec: null }).eq("id", h);
  });

  it("while the yellow runs no judge or spotter may write (the gate opens at green)", async () => {
    const h = await mkHeat(f, d);
    await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 60 });
    const [e] = d.entries;
    const r = await f.clients.spotter.rpc("add_attempt", { p_heat: h, p_entry: e, p_client_key: crypto.randomUUID(), p_status: "landed", p_trick_name: "Backroll" });
    expect(codeOf(r)).not.toBe("");
    await f.s.from("heats").update({ armed_at: null, prestart_sec: null }).eq("id", h);
  });

  it("the heat is running once now >= armed_at + pre-start, and its start time is exactly that moment", async () => {
    const h = await mkHeat(f, d);
    // armed 90 s ago with a 60 s pre-start: the heat has been running for 30 s without anybody pressing anything
    const armedAt = ago(90);
    await f.s.from("heats").update({ armed_at: armedAt, prestart_sec: 60 }).eq("id", h);
    const [e] = d.entries;
    const r = await f.clients.spotter.rpc("add_attempt", { p_heat: h, p_entry: e, p_client_key: crypto.randomUUID(), p_status: "landed", p_trick_name: "Backroll" });
    expect(codeOf(r)).toBe("");
    expect(codeOf(await f.clients.j1.rpc("start_armed_if_due", { p_heat: h }))).toBe("");
    const row = await heatRow(f, h);
    expect(row.status).toBe("running");
    expect(Date.parse(row.started_at!)).toBe(Date.parse(armedAt) + 60_000);
    // a second call changes nothing
    await f.clients.head.rpc("start_armed_if_due", { p_heat: h });
    expect((await heatRow(f, h)).started_at).toBe(row.started_at);
    expect((await audit(h, "heat_started")).length).toBe(1);
    await ended(h);
  });

  it("Start now during the yellow: green at once; a heat armed for 0 seconds starts at once", async () => {
    const h = await mkHeat(f, d);
    await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 120 });
    const before = Date.now();
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h }))).toBe("");
    const row = await heatRow(f, h);
    expect(row.status).toBe("running");
    expect(Math.abs(Date.parse(row.started_at!) - before)).toBeLessThan(15_000);
    await ended(h);
    const z = await mkHeat(f, d);
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: z, p_prestart: 0 }))).toBe("");
    expect((await heatRow(f, z)).status).toBe("running");
    await ended(z);
  });

  it("Abort during the yellow: back to red, the heat not started, the audit log has the abort and the time", async () => {
    const h = await mkHeat(f, d);
    await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 60 });
    expect(codeOf(await f.clients.head.rpc("abort_start", { p_heat: h }))).toBe("");
    const row = await heatRow(f, h);
    expect(row.status).toBe("scheduled");
    expect(row.armed_at).toBeNull();
    expect(row.prestart_sec).toBeNull();
    expect(row.started_at).toBeNull();
    const lines = await audit(h, "heat_start_aborted");
    expect(lines.length).toBe(1);
    expect(Math.abs(Date.parse(lines[0].at as string) - Date.now())).toBeLessThan(30_000);
    // armed again after an abort works
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 30 }))).toBe("");
    await f.s.from("heats").update({ armed_at: null, prestart_sec: null }).eq("id", h);
  });

  it("refusals: another heat armed or running, nothing armed to abort, arming twice, flags off, a bad length", async () => {
    const a = await mkHeat(f, d);
    const b = await mkHeat(f, d);
    expect(codeOf(await f.clients.head.rpc("abort_start", { p_heat: a }))).toContain("NOTHING_ARMED");
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: a, p_prestart: 901 }))).toContain("BAD_PRESTART");
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: a, p_prestart: 60 }))).toBe("");
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: a, p_prestart: 60 }))).toContain("ALREADY_ARMED");
    // one heat at a time: an armed heat holds the water
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: b, p_prestart: 60 }))).toContain("HEAT_ALREADY_RUNNING");
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: b }))).toContain("HEAT_ALREADY_RUNNING");
    await f.clients.head.rpc("abort_start", { p_heat: a });
    // a running heat blocks arming too
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: a }))).toBe("");
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: b, p_prestart: 60 }))).toContain("HEAT_ALREADY_RUNNING");
    await ended(a);
    // flags off
    await setSettings({ publicLiveScores: "live", maxRunningHeats: 1, flags: { enabled: false } });
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: b, p_prestart: 60 }))).toContain("FLAGS_OFF");
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: b }))).toBe("");
    await ended(b);
    await setSettings({ publicLiveScores: "live", maxRunningHeats: 1 });
  });

  it("switching the flags off cancels a start that is armed (and says so in the audit log)", async () => {
    const h = await mkHeat(f, d);
    await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 60 });
    await setSettings({ publicLiveScores: "live", maxRunningHeats: 1, flags: { enabled: false } });
    const row = await heatRow(f, h);
    expect(row.armed_at).toBeNull();
    expect((await audit(h, "heat_start_aborted")).length).toBe(1);
    await setSettings({ publicLiveScores: "live", maxRunningHeats: 1 });
  });

  it("the default pre-start is the event's setting (60 s without one)", async () => {
    const h = await mkHeat(f, d);
    await f.clients.head.rpc("arm_heat", { p_heat: h });
    expect((await heatRow(f, h)).prestart_sec).toBe(60);
    await f.clients.head.rpc("abort_start", { p_heat: h });
    await setSettings({ publicLiveScores: "live", maxRunningHeats: 1, flags: { enabled: true, prestartSec: 90 } });
    await f.clients.head.rpc("arm_heat", { p_heat: h });
    expect((await heatRow(f, h)).prestart_sec).toBe(90);
    await f.clients.head.rpc("abort_start", { p_heat: h });
    await setSettings({ publicLiveScores: "live", maxRunningHeats: 1 });
  });

  it("pause and end of an armed heat that is already green write the start down first", async () => {
    const h = await mkHeat(f, d);
    await f.s.from("heats").update({ armed_at: ago(70), prestart_sec: 60 }).eq("id", h);
    expect(codeOf(await f.clients.head.rpc("pause_heat", { p_heat: h }))).toBe("");
    const row = await heatRow(f, h);
    expect(row.status).toBe("paused");
    expect(row.started_at).not.toBeNull();
    await f.clients.head.rpc("resume_heat", { p_heat: h });
    expect(codeOf(await f.clients.head.rpc("end_heat", { p_heat: h }))).toBe("");
    expect((await heatRow(f, h)).status).toBe("ended");
  });

  it("the armed columns cannot be edited by hand, by anyone", async () => {
    const h = await mkHeat(f, d);
    for (const who of ["head", "orgA"] as const) {
      await f.clients[who].from("heats").update({ armed_at: ago(100), prestart_sec: 10 }).eq("id", h);
      expect((await heatRow(f, h)).armed_at, who).toBeNull();
    }
  });

  it("only whoever may press Start heat may arm, start now and abort; everybody else is refused, observers included", async () => {
    const h = await mkHeat(f, d);
    const refuse = async (who: string, c: SupabaseClient) => {
      for (const [fn, args] of [
        ["arm_heat", { p_heat: h, p_prestart: 60 }],
        ["abort_start", { p_heat: h }],
        ["start_heat", { p_heat: h }],
      ] as const) {
        expect(codeOf(await c.rpc(fn, args as never)), `${who} ${fn}`).not.toBe("");
      }
    };
    for (const who of ["j1", "spotter", "announcer", "orgB", "bJudge", "revoked", "anon"] as const) await refuse(who, f.clients[who]);
    await refuse("observer", obs);
    expect((await heatRow(f, h)).armed_at).toBeNull();
    expect((await heatRow(f, h)).status).toBe("scheduled");
    // the observer may not write the start down either
    await f.s.from("heats").update({ armed_at: ago(90), prestart_sec: 60 }).eq("id", h);
    expect(codeOf(await obs.rpc("start_armed_if_due", { p_heat: h }))).toContain("NOT_ALLOWED");
    expect((await heatRow(f, h)).status).toBe("scheduled");
    await f.s.from("heats").update({ armed_at: null, prestart_sec: null }).eq("id", h);
    // the head judge and an organiser: all three calls work
    for (const who of ["head", "orgA"] as const) {
      const x = await mkHeat(f, d);
      expect(codeOf(await f.clients[who].rpc("arm_heat", { p_heat: x, p_prestart: 60 })), who).toBe("");
      expect(codeOf(await f.clients[who].rpc("abort_start", { p_heat: x })), who).toBe("");
      expect(codeOf(await f.clients[who].rpc("arm_heat", { p_heat: x, p_prestart: 60 })), who).toBe("");
      expect(codeOf(await f.clients[who].rpc("start_heat", { p_heat: x })), who).toBe("");
      await ended(x);
    }
  });

  it("the public timetable tells the page the armed columns and the flag settings, with the armed heat's start moment", async () => {
    const h = await mkHeat(f, d);
    await f.s.from("heats").update({ armed_at: ago(90), prestart_sec: 60 }).eq("id", h);
    const r = await f.clients.anon.rpc("get_public_timetable", { p_event: f.ids.evA1 });
    const t = r.data as { allowed: boolean; flags: { enabled?: boolean }; heats: Array<{ id: string; armed_at: string | null; prestart_sec: number | null; started_at: string | null; effective_status: string }> };
    expect(t.allowed).toBe(true);
    const row = t.heats.find((x) => x.id === h)!;
    expect(row.effective_status).toBe("running");
    expect(row.prestart_sec).toBe(60);
    expect(Date.parse(row.started_at!)).toBe(Date.parse(row.armed_at!) + 60_000);
    await f.s.from("heats").update({ armed_at: null, prestart_sec: null }).eq("id", h);
  });
});
