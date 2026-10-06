import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { codeOf, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Fix: the heat clock runs the RUN ORDER's length. The run order's `durationMin` of a heat's row (active plan) is the one source; heats.duration_sec of a heat that has not
// started follows it, is read again when the start sequence begins, and a heat in no plan (or whose row has no length) keeps the draw's own copy. Started heats never change.
describe.skipIf(!ENV_OK)("heat length follows the run order (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  let plan: string;
  const heatRow = async (id: string) => (await f.s.from("heats").select("status, started_at, duration_sec, draw_duration_sec, armed_at, prestart_sec, extra_sec").eq("id", id).single()).data!;
  const planItems = async () => (await f.s.from("schedule_plans").select("items").eq("id", plan).single()).data!.items as Array<Record<string, unknown>>;
  const setPlan = async (items: unknown[], active = true) => {
    const r = await f.s.from("schedule_plans").update({ items: items as never, active }).eq("id", plan);
    if (r.error) throw new Error(r.error.message);
  };
  const setLength = async (itemId: string, minutes: number | null) => {
    const items = (await planItems()).map((i) => {
      if (i.id !== itemId) return i;
      const rest = { ...i };
      delete rest.durationMin;
      return minutes === null ? rest : { ...rest, durationMin: minutes };
    });
    await setPlan(items);
  };

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "LenDiv", seats: ["j1", "j2", "j3"], locked: true });
    // the fixture's own heats must not hold the water
    await f.s.from("heats").update({ status: "ended", ended_at: new Date().toISOString() }).in("id", [f.ids.H1, f.ids.H4, f.ids.H5]);
    await f.s.from("events").update({ settings: { publicLiveScores: "live", maxRunningHeats: 1 } }).eq("id", f.ids.evA1);
    plan = (await f.s.from("schedule_plans").insert({ event_id: f.ids.evA1, name: "Len plan", day: "2026-10-11", active: true, items: [] }).select("id").single()).data!.id;
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("a length typed on the run order row is what the un-started heat carries at once, and what the clock runs when it starts", async () => {
    const h = await mkHeat(f, d, { duration_sec: 600 });
    await setPlan([{ id: "r1", kind: "heat", heatId: h, durationMin: 6 }]);
    expect((await heatRow(h)).duration_sec).toBe(360);
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h }))).toBe("");
    const after = await heatRow(h);
    expect(after.status).toBe("running");
    expect(after.duration_sec).toBe(360);
    await f.s.from("heats").update({ status: "ended" }).eq("id", h);
  });

  it("a length changed again before the start is the one read at the start (decimal minutes to the second)", async () => {
    const h = await mkHeat(f, d, { duration_sec: 600 });
    await setPlan([{ id: "r2", kind: "heat", heatId: h, durationMin: 6 }]);
    await setLength("r2", 7.5);
    expect((await heatRow(h)).duration_sec).toBe(450);
    // a write that did not go through the plan trigger (the heat row edited by hand) is still corrected at the start
    await f.s.from("heats").update({ duration_sec: 123 }).eq("id", h);
    expect(codeOf(await f.clients.orgA.rpc("start_heat", { p_heat: h }))).toBe("");
    expect((await heatRow(h)).duration_sec).toBe(450);
    await f.s.from("heats").update({ status: "ended" }).eq("id", h);
  });

  it("a heat in no run order, and a row without a length of its own, keep the heat's own copy", async () => {
    const lone = await mkHeat(f, d, { duration_sec: 540 });
    const plain = await mkHeat(f, d, { duration_sec: 420 });
    await setPlan([{ id: "r3", kind: "heat", heatId: plain }]);
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: lone }))).toBe("");
    expect((await heatRow(lone)).duration_sec).toBe(540);
    await f.s.from("heats").update({ status: "ended" }).eq("id", lone);
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: plain }))).toBe("");
    expect((await heatRow(plain)).duration_sec).toBe(420);
    await f.s.from("heats").update({ status: "ended" }).eq("id", plain);
  });

  it("clearing the row's length gives the draw's length back; a plan that is not the active one changes nothing", async () => {
    const h = await mkHeat(f, d, { duration_sec: 600 });
    await setPlan([{ id: "r4", kind: "heat", heatId: h, durationMin: 4 }]);
    expect(await heatRow(h)).toMatchObject({ duration_sec: 240, draw_duration_sec: 600 });
    await setLength("r4", null);
    expect(await heatRow(h)).toMatchObject({ duration_sec: 600, draw_duration_sec: null });
    await setPlan([{ id: "r4", kind: "heat", heatId: h, durationMin: 4 }], false);
    expect((await heatRow(h)).duration_sec).toBe(600);
  });

  it("a heat that has started, ended or been published is never changed by a run order edit; +1 min works on top of the length it started with", async () => {
    const h = await mkHeat(f, d, { duration_sec: 600 });
    await setPlan([{ id: "r5", kind: "heat", heatId: h, durationMin: 5 }]);
    expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h }))).toBe("");
    await setLength("r5", 9);
    expect((await heatRow(h)).duration_sec).toBe(300);
    expect(codeOf(await f.clients.head.rpc("extend_heat", { p_heat: h }))).toBe("");
    await setLength("r5", 2);
    expect(await heatRow(h)).toMatchObject({ status: "running", duration_sec: 360, extra_sec: 60 });
    await f.s.from("heats").update({ status: "ended" }).eq("id", h);
    await setLength("r5", 3);
    expect((await heatRow(h)).duration_sec).toBe(360);
    await f.s.from("heats").update({ status: "published" }).eq("id", h);
    await setLength("r5", 8);
    expect((await heatRow(h)).duration_sec).toBe(360);
  });

  it("the start sequence (arm) reads the run order's length too, and an armed heat keeps it", async () => {
    const h = await mkHeat(f, d, { duration_sec: 600 });
    await setPlan([{ id: "r6", kind: "heat", heatId: h, durationMin: 6 }]);
    await f.s.from("heats").update({ duration_sec: 600 }).eq("id", h); // the copy is stale, as on a draw that was generated before the edit
    const armed = await f.clients.head.rpc("arm_heat", { p_heat: h, p_prestart: 30 });
    expect(codeOf(armed)).toBe("");
    expect((await heatRow(h)).duration_sec).toBe(360);
    await setLength("r6", 3);
    expect((await heatRow(h)).duration_sec).toBe(360);
    await f.clients.head.rpc("abort_start", { p_heat: h });
    await f.s.from("heats").update({ status: "cancelled" }).eq("id", h);
  });

  it("a deleted run order gives the heats of its rows their draw length back", async () => {
    const h = await mkHeat(f, d, { duration_sec: 600 });
    const p2 = (await f.s.from("schedule_plans").insert({ event_id: f.ids.evA1, name: "Gone", day: "2026-10-12", active: true, items: [{ id: "g1", kind: "heat", heatId: h, durationMin: 3 }] }).select("id").single()).data!.id;
    expect((await heatRow(h)).duration_sec).toBe(180);
    await f.s.from("schedule_plans").delete().eq("id", p2);
    expect((await heatRow(h)).duration_sec).toBe(600);
  });
  it("in a simulation at every speed the clock is the run order's length divided by the speed; an aborted start sequence stays scaled from the new length", async () => {
    await f.s.from("events").update({ is_simulation: true }).eq("id", f.ids.evA1);
    try {
      for (const speed of [5, 10, 20]) {
        await f.s.from("sim_control").upsert({ event_id: f.ids.evA1, speed });
        const h = await mkHeat(f, d, { duration_sec: 600 });
        await setPlan([{ id: `s${speed}`, kind: "heat", heatId: h, durationMin: 6 }]);
        expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h })), `x${speed}`).toBe("");
        expect((await heatRow(h)).duration_sec, `x${speed}`).toBe(Math.ceil(360 / speed));
        expect((await f.s.from("sim_clock").select("original_sec, speed").eq("heat_id", h).single()).data, `x${speed}`).toEqual({ original_sec: 360, speed });
        await f.s.from("heats").update({ status: "ended" }).eq("id", h);
      }
      await f.s.from("sim_control").upsert({ event_id: f.ids.evA1, speed: 10 });
      const h2 = await mkHeat(f, d, { duration_sec: 600 });
      await setPlan([{ id: "s2", kind: "heat", heatId: h2, durationMin: 6 }]);
      expect(codeOf(await f.clients.head.rpc("arm_heat", { p_heat: h2, p_prestart: 60 }))).toBe("");
      expect((await heatRow(h2)).duration_sec).toBe(36);
      expect(codeOf(await f.clients.head.rpc("abort_start", { p_heat: h2 }))).toBe("");
      await setLength("s2", 3);
      expect((await heatRow(h2)).duration_sec).toBe(18);
      expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h2 }))).toBe("");
      expect((await heatRow(h2)).duration_sec).toBe(18);
      expect((await f.s.from("sim_clock").select("original_sec").eq("heat_id", h2).single()).data?.original_sec).toBe(180);
      await f.s.from("heats").update({ status: "ended" }).eq("id", h2);
    } finally {
      await f.s.from("sim_control").delete().eq("event_id", f.ids.evA1);
      await f.s.from("events").update({ is_simulation: false }).eq("id", f.ids.evA1);
    }
  });
});
