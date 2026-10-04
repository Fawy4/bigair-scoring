import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startingCopy, startingTarget } from "@/lib/reset/plan";
import type { DivisionDraw } from "@/lib/engine/ladder";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, heatRow, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";
import { buildGouna, type GounaWorld } from "./audit-1b-world";

// Audit 1b, part 3b — the flags and the start sequence on the server's clock (the pure half is src/lib/live/audit-1b-flags.test.ts). docs/AUDIT.md, A1b-n.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

describe.skipIf(!ENV_OK)("Audit 1b — flags and the start sequence (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  let offset = 0; // server clock minus this machine's
  const serverNow = () => Date.now() + offset;
  /** Waits until the server's clock reads `ms` (epoch). */
  const untilServer = (ms: number) => sleep(ms - serverNow());
  const audit = async (heat: string) => (await f.s.from("audit_log").select("action, reason, at").eq("row_id", heat).order("at")).data ?? [];
  const settings = { publicLiveScores: "live", maxRunningHeats: 1, flags: { enabled: true, prestartSec: 60, lastMinuteSec: 60 } };
  const clean = async () => {
    await f.s.from("events").update({ settings }).eq("id", f.ids.evA1);
    await f.s.from("heats").update({ armed_at: null, prestart_sec: null, armed_paused_at: null }).eq("event_id", f.ids.evA1).not("armed_at", "is", null);
    await f.s.from("heats").update({ status: "ended", ended_at: ago(1) }).eq("event_id", f.ids.evA1).in("status", ["running", "paused"]);
  };

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "Flags1b", seats: ["j1", "j2", "j3"] });
    await f.s.from("judge_seats").update({ scores: true }).eq("id", f.ids.seat_head);
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const sent = Date.now();
      const { data } = await f.s.rpc("server_now");
      const got = Date.now();
      if (got - sent < best) {
        best = got - sent;
        offset = Date.parse(data as string) - (sent + got) / 2;
      }
    }
    await clean();
  }, 300_000);
  afterEach(clean);
  afterAll(async () => {
    await f?.cleanup();
  });

  it("Start now and Abort pressed together 0.3 s after 0:00: exactly one outcome — the heat started at the armed moment; Abort refused; one 'heat_started' line, no abort line", async () => {
    for (let round = 0; round < 3; round++) {
      await clean();
      const h = await mkHeat(f, d);
      expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 10 }))).toBe("");
      const armed = await heatRow(f, h);
      const zero = Date.parse(armed.armed_at!) + 10_000;
      await untilServer(zero + 300);
      const [start, abort] = await Promise.all([f.clients.head.rpc("start_heat", { p_heat: h }), f.clients.orgA.rpc("abort_start", { p_heat: h })]);
      expect(codeOf(start)).toBe("");
      expect(codeOf(abort)).toContain("NOTHING_ARMED");
      const row = await heatRow(f, h);
      expect(row.status).toBe("running");
      expect(Date.parse(row.started_at!)).toBe(zero);
      const lines = await audit(h);
      expect(lines.filter((l) => l.action === "heat_started")).toHaveLength(1);
      expect(lines.filter((l) => l.action === "heat_start_aborted")).toHaveLength(0);
    }
  }, 180_000);

  it("Start now and Abort pressed together 0.3 s BEFORE 0:00: the heat ends up started exactly once (whichever came first), and the audit log says which", async () => {
    const outcomes: string[] = [];
    for (let round = 0; round < 3; round++) {
      await clean();
      const h = await mkHeat(f, d);
      expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 10 }))).toBe("");
      const zero = Date.parse((await heatRow(f, h)).armed_at!) + 10_000;
      await untilServer(zero - 300);
      const [start, abort] = await Promise.all([f.clients.head.rpc("start_heat", { p_heat: h }), f.clients.orgA.rpc("abort_start", { p_heat: h })]);
      const row = await heatRow(f, h);
      const lines = (await audit(h)).map((l) => l.action).filter((a) => a !== "heat_armed");
      // never both refused, never two starts
      expect(lines.filter((a) => a === "heat_started").length).toBeLessThanOrEqual(1);
      if (codeOf(start) === "") expect(row.status).toBe("running");
      outcomes.push(`start:${codeOf(start) || "ok"} abort:${codeOf(abort) || "ok"} → ${row.status} [${lines.join(",")}]`);
      // A1b-6: when Abort lands first, the Start now press becomes a plain Start heat: the heat starts at once with no yellow (see docs/AUDIT.md)
      // (the audit lines are stamped with each transaction's start time, so the Start that waited for the Abort's lock can be listed first: A1b-6)
      if (codeOf(abort) === "" && codeOf(start) === "") {
        expect([...lines].sort()).toEqual(["heat_start_aborted", "heat_started"]);
        expect(row.status).toBe("running");
      }
    }
    console.info("A1b 3b race before 0:00:", outcomes);
  }, 180_000);

  it("the console phone dies during the yellow: at 0:00 the write gate opens with nobody pressing; the first official phone writes the start down at exactly the armed moment; the Flag view (public timetable) and the judges agree to the millisecond", async () => {
    const h = await mkHeat(f, d);
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 10 }))).toBe("");
    const zero = Date.parse((await heatRow(f, h)).armed_at!) + 10_000;
    await untilServer(zero + 1500);
    // a spotter logs before anybody wrote the start down
    expect(codeOf(await f.clients.spotter.rpc("add_attempt", { p_heat: h, p_entry: d.entries[0], p_client_key: key(), p_status: "landed", p_trick_name: "Backroll" }))).toBe("");
    const pub = (await f.clients.anon.rpc("get_public_timetable", { p_event: f.ids.evA1 })).data as { heats: Array<{ id: string; started_at: string; effective_status: string }> };
    const ph = pub.heats.find((x) => x.id === h)!;
    expect(ph.effective_status).toBe("running");
    expect(Date.parse(ph.started_at)).toBe(zero);
    // a judge phone reaches 0:00 and asks; a second phone asks too
    expect(codeOf(await f.clients.j1.rpc("start_armed_if_due", { p_heat: h }))).toBe("");
    expect(codeOf(await f.clients.j2.rpc("start_armed_if_due", { p_heat: h }))).toBe("");
    const row = await heatRow(f, h);
    expect(row.status).toBe("running");
    expect(Date.parse(row.started_at!)).toBe(zero);
    expect((await audit(h)).filter((l) => l.action === "heat_started")).toHaveLength(1);
  }, 120_000);

  it("flags switched off while the yellow is up: the start is cancelled and nothing is left armed; nothing can arm while off", async () => {
    const h = await mkHeat(f, d);
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 60 }))).toBe("");
    expect(codeOf(await f.s.from("events").update({ settings: { ...settings, flags: { ...settings.flags, enabled: false } } }).eq("id", f.ids.evA1))).toBe("");
    expect(await heatRow(f, h)).toMatchObject({ status: "scheduled", armed_at: null, prestart_sec: null });
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 60 }))).toContain("FLAGS_OFF");
  });

  // A1b-18: the same trigger clears armed_at but not armed_paused_at, which breaks the heats_armed_pair check. With a FROZEN yellow (Pause during the pre-start)
  // the whole settings save is refused: the organiser cannot switch Flags off (the Event step's Save fails) and the heat stays armed.
  it.fails("A1b-18: flags switched off while the yellow is frozen: the save goes through and nothing is left armed", async () => {
    const h = await mkHeat(f, d);
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 60 }))).toBe("");
    expect(codeOf(await f.clients.head.rpc("pause_heat", { p_heat: h }))).toBe("");
    expect(codeOf(await f.clients.orgA.from("events").update({ settings: { ...settings, flags: { ...settings.flags, enabled: false } } }).eq("id", f.ids.evA1))).toBe("");
    const r = (await f.s.from("heats").select("armed_at, armed_paused_at").eq("id", h).single()).data!;
    expect(r).toEqual({ armed_at: null, armed_paused_at: null });
  });
  it("A1b-18 today: with a frozen yellow, switching Flags off is refused by the database (heats_armed_pair) and the heat stays armed", async () => {
    const h = await mkHeat(f, d);
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 60 }))).toBe("");
    expect(codeOf(await f.clients.head.rpc("pause_heat", { p_heat: h }))).toBe("");
    const res = await f.clients.orgA.from("events").update({ settings: { ...settings, flags: { ...settings.flags, enabled: false } } }).eq("id", f.ids.evA1);
    expect(codeOf(res)).toMatch(/heats_armed_pair|check constraint/);
    expect((await f.s.from("events").select("settings").eq("id", f.ids.evA1).single()).data!.settings).toMatchObject({ flags: { enabled: true } });
    expect((await heatRow(f, h)).armed_at).not.toBeNull();
  });

  // A1b-1: the trigger that cancels an armed start when flags go off does not look at the clock. A heat whose pre-start is already over but whose start nobody
  // wrote down yet (every official phone asleep, or within the second before one asks) is "running" for every screen and every write gate — and switching flags
  // off then silently turns it back into a heat that never started, with its attempts and scores on a "not started" heat.
  it.fails("A1b-1: flags off after 0:00 but before the start is written down keeps the heat running from the armed moment", async () => {
    const h = await mkHeat(f, d);
    await f.s.from("heats").update({ armed_at: ago(40), prestart_sec: 10 }).eq("id", h);
    await f.s.from("events").update({ settings: { ...settings, flags: { ...settings.flags, enabled: false } } }).eq("id", f.ids.evA1);
    const row = await heatRow(f, h);
    expect(row.status).toBe("running");
    expect(row.started_at).not.toBeNull();
  });
  it("A1b-1 today: the heat that was running for 30 s is back to 'not started' and the attempt logged in it stays on a not-started heat", async () => {
    const h = await mkHeat(f, d);
    await f.s.from("heats").update({ armed_at: ago(40), prestart_sec: 10 }).eq("id", h);
    expect(codeOf(await f.clients.spotter.rpc("add_attempt", { p_heat: h, p_entry: d.entries[0], p_client_key: key(), p_status: "landed", p_trick_name: "Backroll" }))).toBe("");
    await f.s.from("events").update({ settings: { ...settings, flags: { ...settings.flags, enabled: false } } }).eq("id", f.ids.evA1);
    const row = await heatRow(f, h);
    expect(row).toMatchObject({ status: "scheduled", started_at: null, armed_at: null });
    expect(((await f.s.from("trick_attempts").select("id").eq("heat_id", h)).data ?? []).length).toBe(1);
  });

  it("pause inside the last minute and resume with 20 s left: the clock carries on from 20 s (the pause is rounded up to whole seconds, so never less)", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(580), duration_sec: 600 });
    expect(codeOf(await f.clients.head.rpc("pause_heat", { p_heat: h }))).toBe("");
    await sleep(3000);
    expect(codeOf(await f.clients.head.rpc("resume_heat", { p_heat: h }))).toBe("");
    const row = (await f.s.from("heats").select("started_at, paused_total_sec, duration_sec").eq("id", h).single()).data!;
    const left = row.duration_sec * 1000 - (serverNow() - Date.parse(row.started_at!) - row.paused_total_sec * 1000);
    expect(left).toBeGreaterThan(18_000);
    expect(left).toBeLessThan(22_500);
  }, 60_000);

  it("Start on two heats at once (two heads): exactly one starts; the other is refused 'a heat is already running'", async () => {
    const a = await mkHeat(f, d);
    const b = await mkHeat(f, d);
    const [ra, rb] = await Promise.all([f.clients.head.rpc("start_heat", { p_heat: a }), f.clients.orgA.rpc("start_heat", { p_heat: b })]);
    const codes = [codeOf(ra), codeOf(rb)];
    expect(codes.filter((c) => c === "")).toHaveLength(1);
    expect(codes.find((c) => c !== "")).toContain("HEAT_ALREADY_RUNNING");
  });

  it("Arm on two heats at once: exactly one yellow", async () => {
    const a = await mkHeat(f, d);
    const b = await mkHeat(f, d);
    const [ra, rb] = await Promise.all([f.clients.head.rpc("arm_heat", { p_heat: a, p_prestart: 60 }), f.clients.orgA.rpc("arm_heat", { p_heat: b, p_prestart: 60 })]);
    expect([codeOf(ra), codeOf(rb)].filter((c) => c === "")).toHaveLength(1);
  });

  // A1b-2: the "is a heat on the water?" check of every reset only looks at status running/paused. An armed heat is 'scheduled' (yellow, or green but not yet
  // written down), so Reset this division / Reset event / Clear actual times go through, and the armed columns survive the reset (they are cleared only when the
  // status changes to scheduled, and it already is): the heat goes green by itself after the reset.
  it.fails("A1b-2: Reset this division during the yellow is refused (or at least leaves nothing armed)", async () => {
    const g = await gouna();
    const h = await g.heatByUid(g.uids[0][0]);
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h.id, p_prestart: 60 }))).toBe("");
    const res = await f.clients.orgA.rpc("reset_division", { p_division: g.div, p_item: await itemOf(g) as never, p_reason: "audit 1b" });
    const row = await heatRow(f, h.id);
    expect(codeOf(res) !== "" || row.armed_at === null).toBe(true);
  }, 300_000);
  it("A1b-2 today: Reset this division during the yellow succeeds and the heat stays armed", async () => {
    const g = await gouna();
    const h = await g.heatByUid(g.uids[0][1]);
    expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h.id, p_prestart: 60 }))).toBe("");
    expect(codeOf(await f.clients.orgA.rpc("reset_division", { p_division: g.div, p_item: await itemOf(g) as never, p_reason: "audit 1b" }))).toBe("");
    expect((await heatRow(f, h.id)).armed_at).not.toBeNull();
  }, 300_000);

  let g1: GounaWorld | null = null;
  const gouna = async () => (g1 ??= await buildGouna({ fixture: f, name: "Gouna flags" }));
  const itemOf = async (g: GounaWorld) => {
    const dv = (await f.s.from("divisions").select("id, draw, draw_at_lock, draw_locked_at").eq("id", g.div).single()).data!;
    const current = dv.draw as unknown as DivisionDraw;
    const t = startingTarget(startingCopy({ draw: current, draw_at_lock: dv.draw_at_lock as unknown as DivisionDraw | null, draw_locked_at: dv.draw_locked_at }), current);
    return { division: dv.id, draw: t.draw, projection: t.projection };
  };
});
