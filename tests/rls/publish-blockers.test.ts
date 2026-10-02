import legacy from "../../presets/scoring/legacy-kol-best3-variety.json";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publishHeatCore } from "@/lib/live/publish-core";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Polish 2, item 1: the blocker list names the judge and the exact thing; the head judge's Absent on an Impression / Variety score; and decision P2-1 —
// a judge whose missing scores the head judge has all settled with Absent counts as submitted for Publish (database and server agree).
// the legacy preset (one score per trick, Variety 0–10) with every judge required, two judges and two decimals
const MODEL = { ...legacy, panel: { ...legacy.panel, minJudges: 2, requireAllJudges: true, decimals: 2 }, heat: { ...legacy.heat, impression: { ...legacy.heat.impression, required: true } } };

describe.skipIf(!ENV_OK)("What blocks Publish, and the head judge's Absent (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  const J1 = () => f.ids.seat_j1;
  const J2 = () => f.ids.seat_j2;
  const att = async (heat: string, entry: string, seq: number, status: "landed" | "crashed" = "landed") =>
    (await f.s.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq, status, trick_name: `Trick ${seq}`, client_key: key() }).select("id").single()).data!.id as string;
  const mark = (heat: string, attempt: string, seat: string, score: number) =>
    f.s.from("trick_scores").insert({ event_id: f.ids.evA1, heat_id: heat, attempt_id: attempt, judge_seat_id: seat, score, criteria: {}, client_key: key(), client_rev: 1 });
  const imp = (heat: string, entry: string, seat: string, value: number) =>
    f.s.from("impression_scores").insert({ event_id: f.ids.evA1, heat_id: heat, entry_id: entry, judge_seat_id: seat, value, client_key: key(), client_rev: 1 });
  const submit = (heat: string, seat: string) =>
    f.s.from("judge_sheets").upsert({ event_id: f.ids.evA1, heat_id: heat, judge_seat_id: seat, submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });
  const pub = (heat: string, reason?: string) => publishHeatCore({ user: f.clients.head, service: f.s }, heat, { overrideReason: reason });
  const status = async (heat: string) => (await f.s.from("heats").select("status").eq("id", heat).single()).data!.status;

  /** One rider, two landed attempts; J1 scored everything and submitted; J2 scored attempt 1 only, no Impression / Variety score, never submitted. */
  async function heatWithGaps() {
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) }, { riders: 1 });
    const a1 = await att(h, d.entries[0], 1);
    const a2 = await att(h, d.entries[0], 2);
    for (const a of [a1, a2]) await mark(h, a, J1(), 7);
    await mark(h, a1, J2(), 7.5);
    await imp(h, d.entries[0], J1(), 7);
    await submit(h, J1());
    return { h, a1, a2 };
  }

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "Blockers", seats: ["j1", "j2"], model: MODEL, riders: 2 });
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("the blocker list names the judge and the exact thing, each with where to fix it", async () => {
    const { h, a2 } = await heatWithGaps();
    const r = await pub(h);
    expect(r).toMatchObject({ ok: false, code: "PUBLISH_BLOCKED", canOverride: true });
    const items = (r as { blockers: Array<{ kind: string; text: string; target?: object }> }).blockers;
    const word = items[0].text.split(":")[0]; // the seat's name
    expect(items.map((i) => i.text)).toEqual([
      `${word}: sheet not submitted — 1 attempt unscored, 1 Impression / Variety score missing`,
      `${word}: score for L1 Blockers, attempt 2 missing`,
      `${word}: Impression / Variety score for L1 Blockers missing`,
    ]);
    expect(items[1].target).toEqual({ kind: "score", seatId: J2(), attemptId: a2 });
    expect(items[2].target).toEqual({ kind: "impression", seatId: J2(), entryId: d.entries[0] });
  });

  it("only the head judge (or an organiser) can mark an Impression / Variety score Absent; a judge, a spotter and another organisation are refused", async () => {
    const { h } = await heatWithGaps();
    for (const who of ["j1", "j2", "spotter", "orgB"] as const) {
      const r = await f.clients[who].rpc("head_set_impression", { p_heat: h, p_entry: d.entries[0], p_seat: J2(), p_value: null as never, p_reason: "Absent", p_missed: true });
      expect(codeOf(r)).toContain("NOT_ALLOWED");
    }
    expect((await f.s.from("impression_scores").select("id").eq("heat_id", h).eq("judge_seat_id", J2())).data).toEqual([]);
  });

  it("a judge cannot send an empty Impression / Variety score (only the head judge marks Absent)", async () => {
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(30) }, { riders: 1 });
    const r = await f.clients.j2.rpc("submit_impression", { p_heat: h, p_entry: d.entries[0], p_value: null as never, p_client_key: key(), p_client_rev: 1 });
    expect(codeOf(r)).toMatch(/SCORE_REQUIRED|IMPRESSION_NOT_OPEN|HEAT_LOCKED|NOT_ALLOWED/);
    expect((await f.s.from("impression_scores").select("id").eq("heat_id", h)).data).toEqual([]);
  });

  it("the head judge marks every missing score of J2 Absent → J2's sheet counts as submitted; Publish goes through with no reason and the Absent mark is not counted", async () => {
    const { h, a2 } = await heatWithGaps();
    const head = f.clients.head;
    expect(codeOf(await head.rpc("head_set_trick_score", { p_attempt: a2, p_seat: J2(), p_score: null as never, p_criteria: {}, p_missed: true, p_reason: "Absent" }))).toBe("");
    // one gap left: still blocked, and the database agrees (moving to review asks for a reason)
    expect(await pub(h)).toMatchObject({ ok: false, code: "PUBLISH_BLOCKED" });
    expect(codeOf(await head.rpc("review_heat", { p_heat: h }))).toContain("SHEETS_NOT_SUBMITTED");
    const absent = await head.rpc("head_set_impression", { p_heat: h, p_entry: d.entries[0], p_seat: J2(), p_value: null as never, p_reason: "Absent", p_missed: true });
    expect(codeOf(absent)).toBe("");
    expect(absent.data).toMatchObject({ missed: true, value: null });
    const audit = (await f.s.from("audit_log").select("action, reason").eq("event_id", f.ids.evA1).eq("action", "impression_set").eq("row_id", (absent.data as { id: string }).id)).data ?? [];
    expect(audit).toEqual([{ action: "impression_set", reason: "Absent" }]);
    // the database alone now lets the heat move to review without a reason
    expect(codeOf(await head.rpc("review_heat", { p_heat: h }))).toBe("");
    const r = await pub(h);
    expect(r).toMatchObject({ ok: true, version: 1 });
    expect(await status(h)).toBe("published");
    const row = (await f.s.from("heat_results").select("total").eq("heat_id", h).single()).data!;
    // tricks: attempt 1 (7 + 7.5) / 2 = 7.25, attempt 2 J1 only = 7.00 → 14.25; Impression: J1 only = 7.00 → 21.25
    expect(Number(row.total)).toBe(21.25);
  });

  it("a judge's late Impression / Variety score does not overwrite the head judge's Absent", async () => {
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(5) }, { riders: 1 });
    expect(codeOf(await f.clients.head.rpc("head_set_impression", { p_heat: h, p_entry: d.entries[0], p_seat: J2(), p_value: null as never, p_reason: "Absent", p_missed: true }))).toBe("");
    await f.clients.j2.rpc("submit_impression", { p_heat: h, p_entry: d.entries[0], p_value: 6, p_client_key: key(), p_client_rev: Date.now() });
    expect((await f.s.from("impression_scores").select("value, missed").eq("heat_id", h).eq("judge_seat_id", J2()).single()).data).toEqual({ value: null, missed: true });
  });

  it("a typed-in score is not an Absent: the judge who never submitted still holds Publish back (a reason publishes past it)", async () => {
    const { h, a2 } = await heatWithGaps();
    const head = f.clients.head;
    await head.rpc("head_set_trick_score", { p_attempt: a2, p_seat: J2(), p_score: 7, p_criteria: {}, p_missed: false, p_reason: "paper sheet" });
    await head.rpc("head_set_impression", { p_heat: h, p_entry: d.entries[0], p_seat: J2(), p_value: 7, p_reason: "paper sheet" });
    const r = await pub(h);
    expect(r).toMatchObject({ ok: false, code: "PUBLISH_BLOCKED" });
    expect((r as { blockers: Array<{ text: string }> }).blockers.map((b) => b.text)[0]).toMatch(/: sheet not submitted — every score is in$/);
    expect(codeOf(await head.rpc("review_heat", { p_heat: h }))).toContain("SHEETS_NOT_SUBMITTED");
    expect(await pub(h, "J2 handed in paper")).toMatchObject({ ok: true });
  });

  it("an Absent on a rider who did not start counts nothing, and that rider is never missing", async () => {
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) }, { riders: 2 });
    await f.s.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", h).eq("entry_id", d.entries[1]);
    const a1 = await att(h, d.entries[0], 1);
    await mark(h, a1, J1(), 8);
    await imp(h, d.entries[0], J1(), 8);
    await submit(h, J1());
    // J2 never scored anything: Absent on the one landed attempt and the one riding rider's Impression score
    await f.clients.head.rpc("head_set_trick_score", { p_attempt: a1, p_seat: J2(), p_score: null as never, p_criteria: {}, p_missed: true, p_reason: "Absent" });
    await f.clients.head.rpc("head_set_impression", { p_heat: h, p_entry: d.entries[0], p_seat: J2(), p_value: null as never, p_reason: "Absent", p_missed: true });
    expect(await pub(h)).toMatchObject({ ok: true });
  });
});
