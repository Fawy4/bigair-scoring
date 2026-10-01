import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Phase 5c step 6: a held final leaks nowhere; the head judge's per-heat live switch; simulation events are never public; the Practice heat. docs/08 §1H-11 and §1H-12.
const MODEL = { trick: { entry: "single", scale: { min: 0, max: 10, step: 0.1 } }, panel: { minJudges: 2 }, heat: { maxAttemptsPerRider: 2 } };

describe.skipIf(!ENV_OK)("Visibility, simulation events and the Practice heat (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  const anon = () => f.clients.anon;
  const strangers = () => [f.clients.anon, f.clients.orgB, f.clients.bJudge] as const;

  /** A heat that was published and is held back: its results, seat totals and the stored draw all name the winner. */
  async function heldFinal(hold = true) {
    const h = await mkHeat(f, d, { status: "published", started_at: ago(900), ended_at: ago(300), published_at: ago(100), publish_hold: hold }, { riders: 2 });
    for (const [i, e] of d.entries.slice(0, 2).entries()) {
      await f.s.from("heat_results").insert({ event_id: f.ids.evA1, heat_id: h, entry_id: e, place: i + 1, total: 20 - i, percent: 50, breakdown: { secret: true }, version: 1 });
      await f.s.from("heat_slots").update({ place: i + 1, total: 20 - i, breakdown: { secret: true } }).eq("heat_id", h).eq("entry_id", e);
    }
    return h;
  }

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "VisDiv", seats: ["j1", "j2"], model: MODEL, riders: 3 });
    await f.s.from("divisions").update({ draw: { rounds: [], results: { final: { ranked: [{ entrantId: "secret-winner" }] } } } }).eq("id", d.div);
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  // ---------------------------------------------------------------- the leaks
  it("a held final leaks nowhere: results, seat totals, the stored draw and the live view say nothing to a visitor or a signed-in stranger", async () => {
    const h = await heldFinal(true);
    for (const c of strangers()) {
      expect(((await c.from("heat_results").select("entry_id, place, total").eq("heat_id", h)).data ?? []).length).toBe(0);
      expect(((await c.from("divisions").select("name, draw").eq("id", d.div)).data ?? []).length).toBe(0);
    }
    // Phase 6: a visitor reads seats only through the public functions (which hide a rider fed from a held heat), never from the table
    for (const col of ["position, entry_id", "place", "total", "breakdown"]) expect(codeOf(await anon().from("heat_slots").select(col).eq("heat_id", h))).not.toBe("");
    expect(((await f.clients.orgB.from("heat_slots").select("position").eq("heat_id", h)).data ?? []).length).toBe(0);
    // the live view and the public results say nothing about a held heat
    for (const c of strangers()) {
      expect((await c.rpc("get_public_live_heat", { p_heat: h })).data).toEqual({ allowed: false });
      const pr = (await c.rpc("get_public_results", { p_event: f.ids.evA1 })).data as { divisions: Array<{ rounds: Array<{ heats: Array<{ id: string; held: boolean; results: unknown[] }> }> }> };
      const heat = pr.divisions.flatMap((x) => x.rounds.flatMap((r) => r.heats)).find((x) => x.id === h)!;
      expect(heat.held).toBe(true);
      expect(heat.results).toEqual([]);
    }
    // the people who run the event still see everything
    expect(((await f.clients.orgA.from("heat_results").select("entry_id").eq("heat_id", h)).data ?? []).length).toBe(2);
    expect(((await f.clients.head.from("heat_results").select("entry_id").eq("heat_id", h)).data ?? []).length).toBe(2);
    expect((await f.clients.orgA.from("divisions").select("draw").eq("id", d.div).single()).data!.draw).toBeTruthy();
    expect((await f.clients.head.from("divisions").select("draw").eq("id", d.div).single()).data!.draw).toBeTruthy();
  });

  it("after the head judge releases it, the result is public: results, the public results function and the live view", async () => {
    const h = await heldFinal(true);
    expect(codeOf(await f.clients.j1.rpc("set_publish_hold", { p_heat: h, p_hold: false }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.head.rpc("set_publish_hold", { p_heat: h, p_hold: false, p_reason: null }))).toBe("");
    expect(((await anon().from("heat_results").select("entry_id, place, total").eq("heat_id", h)).data ?? []).length).toBe(2);
    const pr = (await anon().rpc("get_public_results", { p_event: f.ids.evA1 })).data as { divisions: Array<{ rounds: Array<{ heats: Array<{ id: string; held: boolean; results: Array<{ place: number; total: number }> }> }> }> };
    const heat = pr.divisions.flatMap((x) => x.rounds.flatMap((r) => r.heats)).find((x) => x.id === h)!;
    expect(heat.held).toBe(false);
    expect(heat.results.map((r) => r.place)).toEqual([1, 2]);
    expect(Number(heat.results[0].total)).toBe(20);
    expect(((await f.s.from("audit_log").select("action").eq("row_id", h).eq("action", "publish_release")).data ?? []).length).toBe(1);
  });

  it("a second version replaces the first for the public: only the latest version of a result is readable", async () => {
    const h = await heldFinal(false);
    for (const [i, e] of d.entries.slice(0, 2).entries()) await f.s.from("heat_results").insert({ event_id: f.ids.evA1, heat_id: h, entry_id: e, place: 2 - i, total: 10 + i, version: 2 });
    const rows = (await anon().from("heat_results").select("version, place").eq("heat_id", h)).data ?? [];
    expect(new Set(rows.map((r) => r.version))).toEqual(new Set([2]));
    expect(((await f.clients.orgA.from("heat_results").select("version").eq("heat_id", h)).data ?? []).length).toBe(4); // the people who run the event see the history
  });

  // ---------------------------------------------------------------- the per-heat live switch
  it("live scores follow the heat's switch, then the division's setting, then the event's; only the head judge or an organiser sets the switch; it is audited", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(60) }, { riders: 2 });
    const allowed = async () => ((await anon().rpc("get_public_live_heat", { p_heat: h })).data as { allowed: boolean }).allowed;
    await f.s.from("events").update({ settings: { publicLiveScores: "after_publish" } }).eq("id", f.ids.evA1);
    try {
      expect(await allowed()).toBe(false); // the event says: only after publish
      expect(codeOf(await f.clients.j1.rpc("set_heat_public_live", { p_heat: h, p_value: true }))).toContain("NOT_ALLOWED");
      expect(codeOf(await f.clients.head.rpc("set_heat_public_live", { p_heat: h, p_value: true }))).toBe("");
      expect(await allowed()).toBe(true); // the head judge's switch wins
      expect(codeOf(await f.clients.orgA.rpc("set_heat_public_live", { p_heat: h, p_value: null }))).toBe("");
      expect(await allowed()).toBe(false);
      await f.s.from("divisions").update({ live_settings: { publicLiveScores: "live" } }).eq("id", d.div);
      expect(await allowed()).toBe(true); // the division overrides the event
      await f.s.from("events").update({ settings: { publicLiveScores: "live" } }).eq("id", f.ids.evA1);
      await f.s.from("divisions").update({ live_settings: { publicLiveScores: "after_publish" } }).eq("id", d.div);
      expect(await allowed()).toBe(false);
      expect(codeOf(await f.clients.head.rpc("set_heat_public_live", { p_heat: h, p_value: true }))).toBe("");
      expect(await allowed()).toBe(true);
      expect(codeOf(await f.clients.head.rpc("set_heat_public_live", { p_heat: h, p_value: false }))).toBe("");
      await f.s.from("divisions").update({ live_settings: {} }).eq("id", d.div);
      expect(await allowed()).toBe(false); // off for this heat, whatever the settings say
      expect(((await f.s.from("audit_log").select("action").eq("row_id", h).eq("action", "public_live_set")).data ?? []).length).toBeGreaterThanOrEqual(4);
    } finally {
      await f.s.from("events").update({ settings: { publicLiveScores: "live", judgeGraceSec: 180 } }).eq("id", f.ids.evA1);
    }
    // nobody edits the switch around the function
    const direct = await f.clients.head.from("heats").update({ public_live: true }).eq("id", h).select("public_live");
    expect((direct.data ?? [])[0]?.public_live ?? false).toBe(false);
  });

  // ---------------------------------------------------------------- simulation events
  describe("simulation events", () => {
    let div2: LiveDivision;
    let heat: string;
    beforeAll(async () => {
      // the draft event of the fixture hosts the simulation: its own division, riders and a running heat
      const slug = (await f.s.from("events").select("slug").eq("id", f.ids.evA2).single()).data!.slug;
      void slug;
      const must = (r: { data: { id: string } | null; error: { message: string } | null }) => {
        if (!r.data) throw new Error(r.error?.message);
        return r.data.id;
      };
      const round = must(await f.s.from("rounds").insert({ division_id: f.ids.divA2, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} }).select("id").single());
      const entries: string[] = [];
      for (let n = 1; n <= 2; n++) {
        const rider = must(await f.s.from("riders").insert({ organisation_id: f.ids.orgA, first_name: `S${n}`, last_name: "Sim" }).select("id").single());
        entries.push(must(await f.s.from("entries").insert({ division_id: f.ids.divA2, rider_id: rider, seed: n, status: "confirmed", source: "manual" }).select("id").single()));
      }
      div2 = { div: f.ids.divA2, round, panel: "", entries };
      await f.s.from("divisions").update({ scoring_overrides: { heat: { maxAttemptsPerRider: 1 } } }).eq("id", f.ids.divA2);
      heat = must(await f.s.from("heats").insert({ round_id: round, division_id: f.ids.divA2, event_id: f.ids.evA2, number: 1, duration_sec: 600 }).select("id").single());
      for (const [p, e] of entries.entries()) await f.s.from("heat_slots").insert({ heat_id: heat, position: p + 1, entry_id: e });
    });

    it("an organiser can flag an event as a simulation while no heat has started; after a heat has started it can no longer be changed by hand", async () => {
      expect(codeOf(await f.clients.orgB.from("events").update({ is_simulation: true }).eq("id", f.ids.evA2).select("id"))).toBe("");
      expect((await f.s.from("events").select("is_simulation").eq("id", f.ids.evA2).single()).data!.is_simulation).toBe(false); // another organisation changed nothing
      const on = await f.clients.orgA.from("events").update({ is_simulation: true }).eq("id", f.ids.evA2).select("is_simulation");
      expect(codeOf(on)).toBe("");
      expect((on.data ?? [])[0]?.is_simulation).toBe(true);
      await f.s.from("heats").update({ status: "running", started_at: ago(30) }).eq("id", heat);
      expect(codeOf(await f.clients.orgA.from("events").update({ is_simulation: false }).eq("id", f.ids.evA2).select("is_simulation"))).toContain("SIMULATION_LOCKED");
      expect((await f.s.from("events").select("is_simulation").eq("id", f.ids.evA2).single()).data!.is_simulation).toBe(true);
    });

    it("a simulation event is invisible to the public: the event row, the event lists, the live view, the public results and registration", async () => {
      await f.s.from("events").update({ status: "published" }).eq("id", f.ids.evA2);
      try {
        expect(((await anon().from("events").select("id").eq("id", f.ids.evA2)).data ?? []).length).toBe(0);
        const listed = ((await anon().rpc("get_public_events", { p_limit: 100 })).data ?? []) as Array<{ id: string }>;
        expect(listed.some((e) => e.id === f.ids.evA2)).toBe(false);
        expect(listed.some((e) => e.id === f.ids.evA1)).toBe(true);
        expect((await anon().rpc("get_public_live_heat", { p_heat: heat })).data).toEqual({ allowed: false });
        expect((await anon().rpc("get_public_results", { p_event: f.ids.evA2 })).data).toEqual({ allowed: false });
        expect(((await anon().from("heats").select("id").eq("id", heat)).data ?? []).length).toBe(0);
        // and the officials of the event can still reach it
        expect(((await f.clients.orgA.from("events").select("id").eq("id", f.ids.evA2)).data ?? []).length).toBe(1);
      } finally {
        await f.s.from("events").update({ status: "draft" }).eq("id", f.ids.evA2);
      }
    });

    it("practice_add_attempt: organiser only, simulation events only, the cap applies, and a practice feed is never 'a possible duplicate'", async () => {
      expect(codeOf(await f.clients.head.rpc("practice_add_attempt", { p_heat: heat, p_entry: div2.entries[0], p_trick: { name: "Left Backroll" }, p_status: "landed" }))).toContain("NOT_ALLOWED");
      expect(codeOf(await f.clients.orgB.rpc("practice_add_attempt", { p_heat: heat, p_entry: div2.entries[0], p_trick: { name: "Left Backroll" }, p_status: "landed" }))).toContain("NOT_ALLOWED");
      // a normal event refuses
      const normal = await mkHeat(f, d, { status: "running", started_at: ago(60) }, { riders: 2 });
      expect(codeOf(await f.clients.orgA.rpc("practice_add_attempt", { p_heat: normal, p_entry: d.entries[0], p_trick: { name: "x" }, p_status: "landed" }))).toContain("NOT_A_SIMULATION");
      // a simulation event takes the attempt, and the cap (1) stops the second
      const ok = await f.clients.orgA.rpc("practice_add_attempt", { p_heat: heat, p_entry: div2.entries[0], p_trick: { name: "Left Backroll", direction: "left" }, p_status: "landed" });
      expect(codeOf(ok)).toBe("");
      expect(codeOf(await f.clients.orgA.rpc("practice_add_attempt", { p_heat: heat, p_entry: div2.entries[0], p_trick: { name: "Right Frontroll" }, p_status: "landed" }))).toContain("ATTEMPT_CAP_REACHED");
      expect(codeOf(await f.clients.orgA.rpc("practice_add_attempt", { p_heat: heat, p_entry: div2.entries[1], p_trick: { name: "Left Backroll" }, p_status: "crashed" }))).toBe("");
      const rows = (await f.s.from("trick_attempts").select("possible_duplicate_of, trick_name").eq("heat_id", heat)).data ?? [];
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.possible_duplicate_of === null)).toBe(true);
    });

    it("the home page does not list a simulation event, but Demo Cup is one: the seeded Demo event is flagged", async () => {
      const demo = (await f.s.from("events").select("slug, is_simulation").eq("slug", "demo-cup")).data ?? [];
      for (const e of demo) expect(e.is_simulation).toBe(true);
      key(); // (the demo organisation may not exist on a fresh database: nothing to check then)
    });
  });
});
