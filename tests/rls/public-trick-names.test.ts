import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { key, mkDivision, mkHeat, ago, type LiveDivision } from "./live-helpers";
import { breakdownOf, mkLadder, publishLadderHeat, type Ladder } from "./public-helpers";

// Public scores – short trick names. What a visitor is sent per attempt: the trick ONLY for a division on "trick name + score", ONLY for a landed attempt whose
// score is in the result, never for a crash; nothing else from the spotter's lines. Everything runs in the fixture's own throwaway organisation.
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MODES = ["trick_score", "number_score", "score_only"] as const;

/** A stored breakdown with three attempts: a scored landing, a landing the panel has not scored, and a crash; each with a trick, a category and judge marks inside. */
const richBreakdown = (total: number): Record<string, unknown> => {
  const base = breakdownOf(total) as J;
  return {
    ...base,
    allAttempts: [
      { seq: 1, status: "landed", trickName: "Left ×2 Backroll", categoryKey: "rotation", score: 7, counted: true, repeatIndex: 0, priorCrashesSameTrick: 0, panel: { score: 7, unrounded: 7, judgeScores: [{ judgeId: "J1", score: 9.9 }], incomplete: false, missing: [], missedBy: [], outlier: false } },
      { seq: 2, status: "landed", trickName: "Right Frontroll", categoryKey: "rotation", score: null, counted: false, repeatIndex: 0, priorCrashesSameTrick: 0, panel: null },
      { seq: 3, status: "crashed", trickName: "Left Megaloop", categoryKey: "kiteloop", score: null, counted: false, repeatIndex: 0, priorCrashesSameTrick: 0, panel: null },
    ],
  };
};

describe.skipIf(!ENV_OK)("Public trick names: what the public functions send per attempt (hosted development project)", () => {
  let f: Fixture;
  const ladders = {} as Record<(typeof MODES)[number], Ladder>;
  let held: Ladder;
  const anon = () => f.clients.anon;
  const results = async (c = anon()): Promise<J> => {
    const { data, error } = await c.rpc("get_public_results", { p_event: f.ids.evA1 });
    if (error) throw new Error(error.message);
    return data as J;
  };
  const heatOf = (res: J, id: string): J => res.divisions.flatMap((d: J) => d.rounds.flatMap((r: J) => r.heats)).find((h: J) => h.id === id);
  const attemptsOf = (res: J, l: Ladder, uid = "R1-H1"): J[][] => heatOf(res, l.heats[uid]).results.map((r: J) => r.breakdown.allAttempts);

  beforeAll(async () => {
    f = await buildFixture();
    for (const mode of MODES) {
      ladders[mode] = await mkLadder(f, { name: `Trick ${mode}`, live: { spectatorAttemptDisplay: mode } });
      await publishLadderHeat(f, ladders[mode], "R1-H1");
      await f.s.from("heat_results").update({ breakdown: richBreakdown(20) as never }).eq("heat_id", ladders[mode].heats["R1-H1"]);
    }
    // a division on "trick name + score" whose result is held back: nothing of it is readable
    held = await mkLadder(f, { name: "Trick held", live: { spectatorAttemptDisplay: "trick_score" } });
    await publishLadderHeat(f, held, "R1-H1", { hold: true });
    await f.s.from("heat_results").update({ breakdown: richBreakdown(20) as never }).eq("heat_id", held.heats["R1-H1"]);
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("trick name + score: the trick only for the landed attempt whose score is in; none for the unscored landing, none for the crash", async () => {
    const res = await results();
    const rows = attemptsOf(res, ladders.trick_score);
    expect(rows.length).toBeGreaterThan(0);
    for (const attempts of rows) expect(attempts.map((a) => a.trickName)).toEqual(["Left ×2 Backroll", null, null]);
  });

  it("the category of a trick is not sent at all", async () => {
    const res = await results();
    for (const mode of MODES) for (const attempts of attemptsOf(res, ladders[mode])) expect(attempts.every((a) => a.categoryKey === null)).toBe(true);
  });

  it("attempt number + score and scores only: no trick at all, for any attempt", async () => {
    const res = await results();
    for (const mode of ["number_score", "score_only"] as const) {
      const rows = attemptsOf(res, ladders[mode]);
      expect(rows.length).toBeGreaterThan(0);
      for (const attempts of rows) expect(attempts.every((a) => a.trickName === null), mode).toBe(true);
    }
  });

  it("a division that never stored the choice is on attempt number + score: no trick", async () => {
    await f.s.from("divisions").update({ live_settings: {} }).eq("id", ladders.number_score.div);
    const res = await results();
    expect(res.divisions.find((d: J) => d.id === ladders.number_score.div).attempt_display).toBe("number_score");
    for (const attempts of attemptsOf(res, ladders.number_score)) expect(attempts.every((a) => a.trickName === null)).toBe(true);
  });

  it("nothing but the panel's facts comes with an attempt: no judge marks, seat, edits, flags or notes", async () => {
    const res = await results();
    const allowed = new Set(["seq", "status", "trickName", "categoryKey", "score", "counted", "panelScore", "ignored", "repeatIndex"]);
    for (const mode of MODES) {
      for (const attempts of attemptsOf(res, ladders[mode])) for (const a of attempts) expect(Object.keys(a).filter((k) => !allowed.has(k))).toEqual([]);
    }
    expect(JSON.stringify(res)).not.toMatch(/judgeScores|missedBy|outlier|created_by_seat|raw_text|edit_reason/);
  });

  it("a result that is held back sends nothing, trick or not", async () => {
    const res = await results();
    expect(heatOf(res, held.heats["R1-H1"]).results).toEqual([]);
  });

  it("a visitor signed in as another organisation's organiser reads the same restricted answer as anyone", async () => {
    const res = await results(f.clients.orgB);
    for (const attempts of attemptsOf(res, ladders.number_score)) expect(attempts.every((a) => a.trickName === null)).toBe(true);
    for (const attempts of attemptsOf(res, ladders.trick_score)) expect(attempts.map((a) => a.trickName)).toEqual(["Left ×2 Backroll", null, null]);
  });

  it("the event's own organiser still reads the full names (the results CSV and the printable results need them); a crash still carries none", async () => {
    const res = await results(f.clients.orgA);
    for (const mode of MODES) for (const attempts of attemptsOf(res, ladders[mode])) expect(attempts.map((a) => a.trickName)).toEqual(["Left ×2 Backroll", null, null]);
  });

  describe("the live-heat function a visitor can call", () => {
    let d: LiveDivision;
    const heats = {} as Record<(typeof MODES)[number], string>;

    beforeAll(async () => {
      d = await mkDivision(f, { name: "Live trick names", seats: ["j1", "j2", "j3"], riders: 2 });
      for (const mode of MODES) {
        // one running heat per setting (the setting belongs to the division, so each gets a division of its own)
        const div = mode === "trick_score" ? d : await mkDivision(f, { name: `Live ${mode}`, seats: ["j1", "j2", "j3"], riders: 2 });
        await f.s.from("divisions").update({ live_settings: { spectatorAttemptDisplay: mode, publicLiveScores: "live" } }).eq("id", div.div);
        const h = await mkHeat(f, div, { status: "running", started_at: ago(60) }, { riders: 2 });
        heats[mode] = h;
        const rows = [
          { seq: 1, status: "landed", trick_name: "Left ×2 Backroll", direction: "left", category_key: "rotation" },
          { seq: 2, status: "crashed", trick_name: "Right Megaloop", direction: "right", category_key: "kiteloop" },
          { seq: 3, status: "landed", trick_name: "Frontroll", direction: "left", category_key: "rotation" },
        ];
        for (const r of rows) {
          const { error } = await f.s.from("trick_attempts").insert({ heat_id: h, entry_id: div.entries[0], client_key: key(), raw_text: "typed words", ...r });
          if (error) throw new Error(error.message);
        }
      }
    });

    it("sends no trick, side or category for any attempt, in any setting, scored or not, crash or not; and no score at all", async () => {
      for (const mode of MODES) {
        const { data, error } = await anon().rpc("get_public_live_heat", { p_heat: heats[mode] });
        expect(error).toBeNull();
        const live = data as J;
        expect(live.allowed, `${mode}: the event must show live scores for this test`).toBe(true);
        expect(live.attempts.length).toBe(3);
        for (const a of live.attempts) {
          expect([a.trick_name, a.direction, a.category_key], mode).toEqual([null, null, null]);
        }
        expect(live.scores).toBeUndefined();
        expect(live.impressions).toBeUndefined();
        expect(JSON.stringify(live)).not.toMatch(/typed words|raw_text|client_key|created_by_seat|edit_reason/);
      }
    });

    it("sends the attempts in the order they were logged, with only the facts the page counts on", async () => {
      const live = (await anon().rpc("get_public_live_heat", { p_heat: heats.trick_score })).data as J;
      expect(live.attempts.map((a: J) => a.seq)).toEqual([1, 2, 3]);
      expect(live.attempts.map((a: J) => a.status)).toEqual(["landed", "crashed", "landed"]);
      expect(new Set(Object.keys(live.attempts[0]))).toEqual(new Set(["id", "entry_id", "seq", "direction", "category_key", "trick_name", "status", "height_m", "possible_duplicate_of", "created_at"]));
    });

    it("the server-side live view (service role only) is not reachable by a visitor", async () => {
      const res = await anon().rpc("get_live_heat_for_server", { p_heat: heats.trick_score });
      expect(res.error).not.toBeNull();
    });
  });
});
