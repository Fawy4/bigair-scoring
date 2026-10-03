import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import kota from "../../presets/scoring/kota-best3-impression.json";
import { publishHeatCore } from "@/lib/live/publish-core";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Fix session 1 (audit A1a-3), after the migration: a whole heat through the real functions a phone and the head judge's console use, as signed-in users
// (not the service key, which skips the new checks): spotter → three judges (criteria) → end → Impression → Submit → head judge Review → Publish.
// Scores on the step must save and Publish must still work; an off-step value is refused on the way and the head judge's correction on the step is saved.
const crit = (h: number, e: number, t: number, x: number) => ({ height: h, extremity: e, technicality: t, execution: x });
/** The trick score the phone sends with the criteria: their mean, to two decimals. */
const mean = (c: ReturnType<typeof crit>) => Math.round(((c.height + c.extremity + c.technicality + c.execution) / 4) * 100) / 100;

describe.skipIf(!ENV_OK)("A whole heat through the real write functions, then Publish (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  let head: SupabaseClient;
  const judges = ["j1", "j2", "j3"] as const;
  const seat = { j1: () => f.ids.seat_j1, j2: () => f.ids.seat_j2, j3: () => f.ids.seat_j3 };

  beforeAll(async () => {
    f = await buildFixture();
    head = f.clients.head;
    d = await mkDivision(f, { name: "FlowDiv", seats: ["j1", "j2", "j3"], model: kota, riders: 1 });
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("spotter logs four attempts, judges score the three that landed, the Impression is given after the end, sheets submitted, reviewed and published", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(60) }, { riders: 1 });
    const entry = d.entries[0];

    // the spotter logs four attempts (the third crashed)
    const ids: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const r = await f.clients.spotter.rpc("add_attempt", { p_heat: h, p_entry: entry, p_client_key: key(), p_status: i === 3 ? "crashed" : "landed", p_trick_name: `Trick ${i}` });
      expect(codeOf(r)).toBe("");
      ids.push((r.data as { id: string }).id);
    }

    // each judge scores each landed attempt with four criteria on the 0.1 step
    const landed = [ids[0], ids[1], ids[3]];
    const marks = [crit(8.0, 7.5, 7.0, 8.0), crit(9.0, 8.5, 8.0, 7.5), crit(8.5, 8.0, 7.5, 8.5)];
    for (const [i, a] of landed.entries()) {
      for (const j of judges) {
        const r = await f.clients[j].rpc("submit_trick_score", { p_attempt: a, p_criteria: marks[i], p_score: mean(marks[i]), p_missed: false, p_flag: null, p_client_key: key(), p_client_rev: 1 });
        expect(codeOf(r), `${j} attempt ${i + 1}`).toBe("");
      }
    }
    const stored = (await f.s.from("trick_scores").select("id").eq("heat_id", h)).data ?? [];
    expect(stored).toHaveLength(9);

    // an off-step criterion (7.25) is refused with the step in the sentence, and the stored mark is unchanged
    const bad = await f.clients.j1.rpc("submit_trick_score", { p_attempt: landed[0], p_criteria: crit(7.25, 7.5, 7.0, 8.0), p_score: 7.44, p_missed: false, p_flag: null, p_client_key: key(), p_client_rev: 2 });
    expect(codeOf(bad)).toBe("SCORE_OFF_STEP: 0.1|7.2|7.3");
    const j1Mark = (await f.s.from("trick_scores").select("criteria").eq("attempt_id", landed[0]).eq("judge_seat_id", seat.j1())).data![0];
    expect(j1Mark.criteria).toMatchObject({ height: 8 });

    // time up: the head judge ends the heat; judges give the Impression and Submit
    expect(codeOf(await head.rpc("end_heat", { p_heat: h }))).toBe("");
    for (const [i, j] of judges.entries()) {
      expect(codeOf(await f.clients[j].rpc("submit_impression", { p_heat: h, p_entry: entry, p_value: [7.5, 7.0, 8.0][i], p_client_key: key(), p_client_rev: 1 }))).toBe("");
      expect(codeOf(await f.clients[j].rpc("submit_sheet", { p_heat: h }))).toBe("");
    }
    // an off-step Impression is refused for the head judge's own typed entry too
    expect(codeOf(await head.rpc("head_set_impression", { p_heat: h, p_entry: entry, p_seat: seat.j3(), p_value: 7.25, p_reason: "paper sheet" }))).toContain("SCORE_OFF_STEP");

    // the head judge corrects one criterion on the step: saved
    expect(codeOf(await head.rpc("head_set_trick_score", { p_attempt: landed[0], p_seat: seat.j1(), p_score: mean(crit(7.2, 7.5, 7.0, 8.0)), p_criteria: crit(7.2, 7.5, 7.0, 8.0), p_missed: false, p_reason: "paper sheet" }))).toBe("");

    // Review, then Publish: the snapshot is written
    expect(codeOf(await head.rpc("review_heat", { p_heat: h, p_override_reason: null }))).toBe("");
    const pub = await publishHeatCore({ user: head, service: f.s }, h, {});
    expect(pub.ok, JSON.stringify(pub)).toBe(true);
    const results = (await f.s.from("heat_results").select("place, total").eq("heat_id", h)).data ?? [];
    expect(results).toHaveLength(1);
    expect(results[0].place).toBe(1);
    expect(Number(results[0].total)).toBeGreaterThan(20);
    expect((await f.s.from("heats").select("status").eq("id", h).single()).data!.status).toBe("published");
  });
});
