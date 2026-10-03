import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Fix session 1 (audit A1a-3), migration 20261019100000_fix_audit_1a_score_step.sql: a score that is not on the division's step is refused by the
// database itself, whichever way it arrives (a judge's function, the head judge's function, or a direct write to the table).
const MODEL = {
  trick: { entry: "single", scale: { min: 0, max: 10, step: 0.1 } },
  panel: { minJudges: 2 },
  heat: { impression: { scale: { min: 0, max: 10, step: 0.5 }, weight: 1, label: "Variety", required: true }, maxAttemptsPerRider: 7 },
};

describe.skipIf(!ENV_OK)("A score off the division's step is refused by the database (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  const att = async (heat: string, entry: string, seq: number) =>
    (await f.s.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq, status: "landed", trick_name: `Trick ${seq}`, client_key: key() }).select("id").single()).data!.id as string;
  const score = (attempt: string, value: number, rev = 1) =>
    f.clients.j1.rpc("submit_trick_score", { p_attempt: attempt, p_criteria: {}, p_score: value, p_missed: false, p_flag: null, p_client_key: key(), p_client_rev: rev });
  const imp = (heat: string, entry: string, value: number) => f.clients.j1.rpc("submit_impression", { p_heat: heat, p_entry: entry, p_value: value, p_client_key: key(), p_client_rev: 1 });
  const rows = async (table: string, heat: string) => (await f.s.from(table).select("*").eq("heat_id", heat)).data ?? [];

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "StepDiv", seats: ["j1", "j2"], model: MODEL });
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("a judge's typed 7.25 on a 0.1 step is refused and says the step and the two values next to it; 7.2 is stored", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(60) });
    const a = await att(h, d.entries[0], 1);
    expect(codeOf(await score(a, 7.25))).toBe("SCORE_OFF_STEP: 0.1|7.2|7.3");
    expect(await rows("trick_scores", h)).toHaveLength(0);
    expect(codeOf(await score(a, 7.2))).toBe("");
    expect(await rows("trick_scores", h)).toHaveLength(1);
    expect(codeOf(await score(a, 7.05, 2))).toContain("SCORE_OFF_STEP"); // an edit is checked too
    expect(Number((await rows("trick_scores", h))[0].score)).toBe(7.2);
  });

  it("a score outside the scale is refused and says the range", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(60) });
    const a = await att(h, d.entries[0], 1);
    expect(codeOf(await score(a, 10.5))).toBe("SCORE_OUT_OF_RANGE: 0|10");
    expect(codeOf(await score(a, -0.1))).toBe("SCORE_OUT_OF_RANGE: 0|10");
    expect(await rows("trick_scores", h)).toHaveLength(0);
  });

  it("an Impression / Variety score follows its own step (0.5 here)", async () => {
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) }); // judges score the Impression after the heat ends
    expect(codeOf(await imp(h, d.entries[0], 6.75))).toBe("SCORE_OFF_STEP: 0.5|6.5|7");
    expect(codeOf(await imp(h, d.entries[0], 7.3))).toContain("SCORE_OFF_STEP");
    expect(codeOf(await imp(h, d.entries[0], 11))).toBe("SCORE_OUT_OF_RANGE: 0|10");
    expect(await rows("impression_scores", h)).toHaveLength(0);
    expect(codeOf(await imp(h, d.entries[0], 6.5))).toBe("");
  });

  it("the head judge's typed scores (a correction, a sheet from paper) are refused the same way", async () => {
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) });
    const a = await att(h, d.entries[0], 1);
    const c = f.clients.head;
    expect(codeOf(await c.rpc("head_set_trick_score", { p_attempt: a, p_seat: f.ids.seat_j1, p_score: 7.25, p_criteria: {}, p_missed: false, p_reason: "paper sheet" }))).toBe("SCORE_OFF_STEP: 0.1|7.2|7.3");
    expect(codeOf(await c.rpc("head_set_impression", { p_heat: h, p_entry: d.entries[0], p_seat: f.ids.seat_j1, p_value: 7.25, p_reason: "paper sheet" }))).toBe("SCORE_OFF_STEP: 0.5|7|7.5");
    expect(await rows("trick_scores", h)).toHaveLength(0);
    expect(await rows("impression_scores", h)).toHaveLength(0);
    expect(codeOf(await c.rpc("head_set_trick_score", { p_attempt: a, p_seat: f.ids.seat_j1, p_score: 7.2, p_criteria: {}, p_missed: false, p_reason: "paper sheet" }))).toBe("");
  });

  it("a division whose model has no Impression scale is left as it was: nothing to check against", async () => {
    const none = await mkDivision(f, { name: "NoImpressionDiv", seats: ["j1", "j2"], model: { trick: { entry: "single", scale: { min: 0, max: 10, step: 0.1 } }, panel: { minJudges: 2 }, heat: {} } });
    const h = await mkHeat(f, none, { status: "ended", started_at: ago(900), ended_at: ago(300) });
    expect(codeOf(await imp(h, none.entries[0], 7.25))).toBe("");
  });

  it("a Missed / Absent mark needs no value and is never refused", async () => {
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) });
    const a = await att(h, d.entries[0], 1);
    expect(codeOf(await f.clients.head.rpc("head_set_trick_score", { p_attempt: a, p_seat: f.ids.seat_j1, p_score: null, p_criteria: {}, p_missed: true, p_reason: "Absent" }))).toBe("");
  });

  it("writing the table directly as a judge does not get round it", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(60) });
    const a = await att(h, d.entries[0], 1);
    const r = await f.clients.j1.from("trick_scores").insert({ attempt_id: a, heat_id: h, event_id: f.ids.evA1, judge_seat_id: f.ids.seat_j1, criteria: {}, score: 7.25, client_key: key(), client_rev: 1 });
    void r; // refused by the step check or by the row policy: either way nothing is stored
    expect(await rows("trick_scores", h)).toHaveLength(0);
  });
});
