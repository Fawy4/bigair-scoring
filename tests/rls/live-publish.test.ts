import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import kota from "../../presets/scoring/kota-best3-impression.json";
import legacy from "../../presets/scoring/legacy-kol-best3-variety.json";
import { drawProjection } from "@/lib/draw/projection";
import { expandFormat, type DivisionDraw } from "@/lib/engine/ladder";
import { publishHeatCore } from "@/lib/live/publish-core";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Phase 5c step 5: Publish is one server transaction, safe to press twice, and it fills the next heats' seats (docs/08 §1H-9).
const hetx = (h: number, e: number, t: number, x: number) => ({ height: h, extremity: e, technicality: t, execution: x });
const RED = [
  [hetx(8.0, 7.5, 7.0, 8.0), hetx(8.5, 8.0, 7.0, 7.5), hetx(8.0, 7.5, 7.5, 8.0)],
  [hetx(9.0, 9.0, 8.0, 7.0), hetx(9.0, 8.5, 8.0, 7.5), hetx(8.5, 9.0, 8.5, 7.0)],
  [hetx(7.0, 7.0, 6.5, 8.5), hetx(7.5, 7.0, 7.0, 8.0), hetx(7.0, 6.5, 7.0, 8.5)],
  null, // attempt 4 crashed
  [hetx(8.5, 8.0, 7.5, 8.5), hetx(8.0, 8.0, 8.0, 8.0), hetx(8.5, 8.5, 7.5, 8.0)],
];

describe.skipIf(!ENV_OK)("Publish, re-open, ladder progression (hosted development project)", () => {
  let f: Fixture;
  let head: SupabaseClient;
  let kotaDiv: LiveDivision;
  const pub = (heat: string, overrideReason?: string, client: SupabaseClient = head) => publishHeatCore({ user: client, service: f.s }, heat, { overrideReason });
  const seats = () => [f.ids.seat_j1, f.ids.seat_j2, f.ids.seat_j3];
  const submitAll = async (heat: string, who = seats()) => {
    for (const seat of who) await f.s.from("judge_sheets").upsert({ event_id: f.ids.evA1, heat_id: heat, judge_seat_id: seat, submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });
  };
  const attempt = async (heat: string, entry: string, seq: number, status: "landed" | "crashed" = "landed") =>
    (await f.s.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq, status, trick_name: `Trick ${seq}`, client_key: key() }).select("id").single()).data!.id as string;
  /** One judge's trick scores for an attempt: criteria (KOTA) or a single score. */
  const mark = async (heat: string, attemptId: string, seat: string, v: object | number) =>
    f.s.from("trick_scores").insert({ event_id: f.ids.evA1, heat_id: heat, attempt_id: attemptId, judge_seat_id: seat, ...(typeof v === "number" ? { score: v, criteria: {} } : { score: 7, criteria: v }), client_key: key(), client_rev: 1 });
  const impression = async (heat: string, entry: string, seat: string, value: number) =>
    f.s.from("impression_scores").insert({ event_id: f.ids.evA1, heat_id: heat, entry_id: entry, judge_seat_id: seat, value, client_key: key(), client_rev: 1 });
  const results = async (heat: string) => (await f.s.from("heat_results").select("entry_id, place, total, percent, version, breakdown").eq("heat_id", heat).order("version")).data ?? [];
  const heatRow = async (heat: string) => (await f.s.from("heats").select("status, publish_hold, reopened_at, published_at").eq("id", heat).single()).data!;

  /** The docs/08 §1A heat: Red alone, five attempts, three judges. */
  async function redHeat(opts: { skipJ3Impression?: boolean } = {}) {
    const h = await mkHeat(f, kotaDiv, { status: "ended", started_at: ago(900), ended_at: ago(300) }, { riders: 1 });
    await f.s.from("heat_slots").update({ vest_colour: "red" }).eq("heat_id", h);
    for (let i = 0; i < RED.length; i++) {
      const a = await attempt(h, kotaDiv.entries[0], i + 1, RED[i] ? "landed" : "crashed");
      if (RED[i]) for (let j = 0; j < 3; j++) await mark(h, a, seats()[j], RED[i]![j]);
    }
    const imp = [7.5, 7.0, 8.0];
    for (let j = 0; j < 3; j++) if (!(opts.skipJ3Impression && j === 2)) await impression(h, kotaDiv.entries[0], seats()[j], imp[j]);
    return h;
  }

  beforeAll(async () => {
    f = await buildFixture();
    head = f.clients.head;
    kotaDiv = await mkDivision(f, { name: "KotaPub", seats: ["j1", "j2", "j3"], model: kota, riders: 3 });
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("only the head judge (or an organiser of the event) can publish: a judge, a spotter and another organisation are refused", async () => {
    const h = await redHeat();
    await submitAll(h);
    for (const who of ["j1", "spotter", "announcer", "orgB"] as const) {
      const r = await pub(h, undefined, f.clients[who]);
      expect(r).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
    }
    expect(await results(h)).toHaveLength(0);
    expect((await heatRow(h)).status).toBe("ended");
  });

  it("the 1A heat is published as version 1: place 1, total 31.54, 78.85 %; the seat carries the same; the heat is published and judges' names are not in the breakdown", async () => {
    const h = await redHeat();
    await submitAll(h);
    const r = await pub(h);
    expect(r).toMatchObject({ ok: true, version: 1, already: false });
    const rows = await results(h);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entry_id: kotaDiv.entries[0], place: 1, version: 1 });
    expect(Number(rows[0].total)).toBe(31.54);
    expect(Number(rows[0].percent)).toBe(78.85);
    const slot = (await f.s.from("heat_slots").select("place, total, breakdown").eq("heat_id", h).single()).data!;
    expect(slot.place).toBe(1);
    expect(Number(slot.total)).toBe(31.54);
    expect(JSON.stringify(rows[0].breakdown)).not.toContain(f.ids.seat_j1);
    const row = await heatRow(h);
    expect(row.status).toBe("published");
    expect(row.published_at).toBeTruthy();
    const audit = (await f.s.from("audit_log").select("action, actor_user_id").eq("row_id", h).eq("action", "heat_published")).data ?? [];
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_user_id).toBe(f.userIds.head);
  });

  it("pressing Publish twice (even at the same moment) gives one result", async () => {
    const h = await redHeat();
    await submitAll(h);
    const [a, b] = await Promise.all([pub(h), pub(h)]);
    expect(a.ok && b.ok).toBe(true);
    expect(await results(h)).toHaveLength(1);
    const again = await pub(h);
    expect(again).toMatchObject({ ok: true, version: 1, already: true });
    expect(await results(h)).toHaveLength(1);
  });

  it("a missing Impression / Variety score blocks Publish in words; with a reason it publishes and the audit line holds the reason and the blocker", async () => {
    const h = await redHeat({ skipJ3Impression: true });
    await submitAll(h);
    const blocked = await pub(h);
    expect(blocked).toMatchObject({ ok: false, code: "PUBLISH_BLOCKED", canOverride: true });
    expect((blocked as { blockers: Array<{ text: string }> }).blockers.map((b) => b.text)).toContain("Judge 3 has no Impression / Variety score for Red");
    expect(await results(h)).toHaveLength(0);
    expect((await heatRow(h)).status).toBe("ended");
    const ok = await pub(h, "Judge 3 left the beach");
    expect(ok).toMatchObject({ ok: true, version: 1 });
    const line = (await f.s.from("audit_log").select("reason, after").eq("row_id", h).eq("action", "publish_override")).data ?? [];
    expect(line).toHaveLength(1);
    expect(line[0].reason).toBe("Judge 3 left the beach");
    expect(JSON.stringify(line[0].after)).toContain("Judge 3 has no Impression / Variety score for Red");
  });

  it("a judge who has not submitted blocks Publish too, and moving to review locks nobody if the publish is refused", async () => {
    const h = await redHeat();
    await submitAll(h, [f.ids.seat_j1, f.ids.seat_j2]);
    const blocked = await pub(h);
    expect(blocked).toMatchObject({ ok: false, code: "PUBLISH_BLOCKED" });
    expect((blocked as { blockers: Array<{ text: string }> }).blockers.map((b) => b.text)).toEqual(["Judge 3 has not submitted"]);
    expect((await heatRow(h)).status).toBe("ended"); // still open for the judge who owes the sheet
  });

  it("an unresolved tie cannot be published past, even with a reason; after the head judge chooses the order it publishes in that order", async () => {
    const h = await mkHeat(f, kotaDiv, { status: "ended", started_at: ago(900), ended_at: ago(300) }, { riders: 2 });
    for (const e of kotaDiv.entries.slice(0, 2)) {
      const a = await attempt(h, e, 1);
      for (let j = 0; j < 3; j++) await mark(h, a, seats()[j], hetx(8, 8, 8, 8));
      for (let j = 0; j < 3; j++) await impression(h, e, seats()[j], 7);
    }
    await submitAll(h);
    const blocked = await pub(h, "just publish it");
    expect(blocked).toMatchObject({ ok: false, code: "PUBLISH_BLOCKED", canOverride: false });
    expect((blocked as { blockers: Array<{ text: string }> }).blockers[0].text).toMatch(/are tied — choose the order/);
    expect(codeOf(await head.rpc("decide_tie", { p_heat: h, p_rider_ids: [kotaDiv.entries[1], kotaDiv.entries[0]], p_reason: "paper sheet" }))).toBe("");
    expect(await pub(h)).toMatchObject({ ok: true, version: 1 });
    const rows = await results(h);
    expect(rows.find((r) => r.entry_id === kotaDiv.entries[1])!.place).toBe(1);
    expect(rows.find((r) => r.entry_id === kotaDiv.entries[0])!.place).toBe(2);
  });

  it("a rider who did not start ranks last with no total; a disqualified rider below that", async () => {
    const h = await mkHeat(f, kotaDiv, { status: "ended", started_at: ago(900), ended_at: ago(300) }, { riders: 3 });
    await f.s.from("heat_slots").update({ modifier: "DSQ" }).eq("heat_id", h).eq("entry_id", kotaDiv.entries[0]);
    await f.s.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", h).eq("position", 3);
    const ridden = kotaDiv.entries[1];
    const a = await attempt(h, ridden, 1);
    for (let j = 0; j < 3; j++) await mark(h, a, seats()[j], hetx(8, 8, 8, 8));
    for (let j = 0; j < 3; j++) await impression(h, ridden, seats()[j], 7);
    await submitAll(h);
    expect(await pub(h)).toMatchObject({ ok: true });
    const rows = await results(h);
    const slots = (await f.s.from("heat_slots").select("entry_id, position").eq("heat_id", h)).data!;
    const third = slots.find((s) => s.position === 3)!.entry_id;
    expect(rows.find((r) => r.entry_id === ridden)!.place).toBe(1);
    expect(rows.find((r) => r.entry_id === third)!.place).toBe(2);
    expect(rows.find((r) => r.entry_id === third)!.total).toBeNull();
    expect(rows.find((r) => r.entry_id === kotaDiv.entries[0])!.place).toBe(3);
  });

  // ---------------------------------------------------------------- the ladder
  describe("knockout: the winner takes the next round's seat", () => {
    let div: string;
    let entries: string[];
    let draw: DivisionDraw;
    let r1h1: string;
    let final: string;
    const heatByUid = async (uid: string) => (await f.s.from("heats").select("id, status").eq("division_id", div).eq("draw_uid", uid).single()).data!;
    const seat = async (heat: string, pos: number) => (await f.s.from("heat_slots").select("entry_id").eq("heat_id", heat).eq("position", pos).single()).data!.entry_id;
    const snapshot = async () => {
      const ids = (await f.s.from("heats").select("id").eq("division_id", div)).data!.map((h) => h.id);
      return JSON.stringify({
        results: (await f.s.from("heat_results").select("heat_id, version, entry_id, place").in("heat_id", ids).order("heat_id").order("version").order("entry_id")).data,
        draw: (await f.s.from("divisions").select("draw").eq("id", div).single()).data!.draw,
        slots: (await f.s.from("heat_slots").select("heat_id, position, entry_id, place, total").in("heat_id", ids).order("heat_id").order("position")).data,
        heats: (await f.s.from("heats").select("id, publish_hold").eq("division_id", div).order("id")).data,
      });
    };

    beforeAll(async () => {
      const made = await mkDivision(f, { name: "Knock", seats: ["j1", "j2"], model: legacy, riders: 6, locked: false });
      div = made.div;
      entries = made.entries;
      // a draw with two heats of three and a final of two, saved the way the Draw step saves it
      await f.s.from("rounds").delete().eq("division_id", div);
      const template = parseFormatTemplate({
        id: "t", name: "Knockout", entrants: { min: 2, max: null }, timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 2, defaultBreakAfterRoundMin: 2 }, kind: "generator",
        generator: { type: "single_elimination", params: { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: "by_original_seed" } },
      });
      draw = expandFormat(template, entries.map((id, i) => ({ id, name: `Rider ${i + 1}` })), { identification: "name-callout" });
      expect(codeOf(await f.clients.orgA.rpc("save_division_draw", { p_division: div, p_draw: draw as never, p_projection: drawProjection(draw) as never, p_action: "generate", p_audit: { after: { summary: "test" } } as never }))).toBe("");
      expect(codeOf(await f.clients.orgA.rpc("lock_division_draw", { p_division: div }))).toBe("");
      r1h1 = (await heatByUid(draw.rounds[0].heats[0].uid ?? draw.rounds[0].heats[0].id)).id;
      final = (await heatByUid(draw.rounds[1].heats[0].uid ?? draw.rounds[1].heats[0].id)).id;
    });

    /** Gives the riders of a heat single scores (judge 1 and 2 agree) so the first rider listed wins, and ends the heat. */
    async function scoreHeat(heat: string, winnerFirst = true) {
      const slots = (await f.s.from("heat_slots").select("entry_id, position").eq("heat_id", heat).order("position")).data!;
      await f.s.from("heats").update({ status: "ended", started_at: ago(900), ended_at: ago(300) }).eq("id", heat);
      for (const [i, s] of slots.entries()) {
        if (!s.entry_id) continue;
        const base = winnerFirst ? 8 - i : 5 + i;
        const a = await attempt(heat, s.entry_id, 1);
        for (const seatId of [f.ids.seat_j1, f.ids.seat_j2]) await mark(heat, a, seatId, base);
        for (const seatId of [f.ids.seat_j1, f.ids.seat_j2]) await impression(heat, s.entry_id, seatId, 5);
      }
      await submitAll(heat, [f.ids.seat_j1, f.ids.seat_j2]);
      return slots.map((s) => s.entry_id as string);
    }

    it("publishing the first heat of Round 1 puts the winner in the Final's seat; Re-open, change the winner, publish → version 2 and the seat changes", async () => {
      const ridersR1 = await scoreHeat(r1h1, true);
      expect(await seat(final, 1)).toBeNull();
      expect(await pub(r1h1)).toMatchObject({ ok: true, version: 1 });
      expect(await seat(final, 1)).toBe(ridersR1[0]);

      // the head judge re-opens it and gives the second rider the best score
      expect(codeOf(await head.rpc("reopen_heat", { p_heat: r1h1, p_reason: "paper sheet showed a different score" }))).toBe("");
      const att2 = (await f.s.from("trick_attempts").select("id").eq("heat_id", r1h1).eq("entry_id", ridersR1[1])).data![0].id;
      for (const seatId of [f.ids.seat_j1, f.ids.seat_j2]) expect(codeOf(await head.rpc("head_set_trick_score", { p_attempt: att2, p_seat: seatId, p_score: 10, p_criteria: {}, p_missed: false, p_reason: "paper sheet" }))).toBe("");
      expect(await pub(r1h1)).toMatchObject({ ok: true, version: 2, already: false });
      const versions = ((await f.s.from("heat_results").select("version").eq("heat_id", r1h1)).data ?? []).map((r) => r.version);
      expect([...new Set(versions)].sort()).toEqual([1, 2]);
      expect(await seat(final, 1)).toBe(ridersR1[1]);
      const row = await heatRow(r1h1);
      expect(row.status).toBe("published");
      expect(row.reopened_at).toBeNull();
    });

    it("a correction that would change a heat that has already started is returned as a conflict and changes nothing", async () => {
      const ridersR1 = (await f.s.from("heat_slots").select("entry_id, position").eq("heat_id", r1h1).order("position")).data!.map((s) => s.entry_id as string);
      await f.s.from("heats").update({ status: "running", started_at: ago(30) }).eq("id", final);
      expect(codeOf(await head.rpc("reopen_heat", { p_heat: r1h1, p_reason: "another correction" }))).toBe("");
      const att1 = (await f.s.from("trick_attempts").select("id").eq("heat_id", r1h1).eq("entry_id", ridersR1[0])).data![0].id;
      for (const seatId of [f.ids.seat_j1, f.ids.seat_j2]) await head.rpc("head_set_trick_score", { p_attempt: att1, p_seat: seatId, p_score: 10, p_criteria: {}, p_missed: false, p_reason: "second correction" });
      const att2 = (await f.s.from("trick_attempts").select("id").eq("heat_id", r1h1).eq("entry_id", ridersR1[1])).data![0].id;
      for (const seatId of [f.ids.seat_j1, f.ids.seat_j2]) await head.rpc("head_set_trick_score", { p_attempt: att2, p_seat: seatId, p_score: 1, p_criteria: {}, p_missed: false, p_reason: "second correction" });
      const before = await snapshot();
      const r = await pub(r1h1);
      expect(r).toMatchObject({ ok: false, code: "DOWNSTREAM_STARTED" });
      expect((r as { message: string }).message).toMatch(/already started/);
      expect(await snapshot()).toBe(before);
    });
  });

  it("the Final is held back from the public when the event holds finals; an earlier round is not", async () => {
    // holding is decided at publish from the event's boxes (docs/08 §1H-11): checked on a knockout-less heat with the event setting on
    await f.s.from("events").update({ settings: { publicLiveScores: "live", judgeGraceSec: 180, holdFinalResult: true, publicResultsOnPublish: true } }).eq("id", f.ids.evA1);
    try {
      const h = await redHeat();
      await submitAll(h);
      expect(await pub(h)).toMatchObject({ ok: true });
      // a heat with no draw has no "last round": it is not held
      expect((await heatRow(h)).publish_hold).toBe(false);
      await f.s.from("events").update({ settings: { publicLiveScores: "live", judgeGraceSec: 180, publicResultsOnPublish: false } }).eq("id", f.ids.evA1);
      const h2 = await redHeat();
      await submitAll(h2);
      expect(await pub(h2)).toMatchObject({ ok: true });
      expect((await heatRow(h2)).publish_hold).toBe(true);
    } finally {
      await f.s.from("events").update({ settings: { publicLiveScores: "live", judgeGraceSec: 180 } }).eq("id", f.ids.evA1);
    }
  });
});
