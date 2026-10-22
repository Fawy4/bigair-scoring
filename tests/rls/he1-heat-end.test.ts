import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// HE1 (0.25.0): the end of a heat takes nobody off the sheet. The spotter's writes are accepted on an ended, unpublished heat and refused once it is published (Re-open gives
// them back); a line logged after a judge has submitted reopens that judge's sheet; fixing an attempt resolves the flags about it. Hosted development project, throwaway data.
const MODEL = {
  trick: { entry: "single", scale: { min: 0, max: 10, step: 0.1 } },
  panel: { minJudges: 2 },
  heat: { impression: { scale: { min: 0, max: 10, step: 0.5 }, weight: 1, label: "Variety", required: true }, maxAttemptsPerRider: 7 },
};
const CRITERIA = {
  trick: {
    entry: "criteria",
    scale: { min: 0, max: 10, step: 0.5 },
    criteria: [
      { key: "height", label: "Height", weight: 1 },
      { key: "extremity", label: "Extremity", weight: 1 },
    ],
  },
  panel: { minJudges: 2 },
  heat: { maxAttemptsPerRider: 7 },
};

describe.skipIf(!ENV_OK)("HE1: the end of a heat (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  let crit: LiveDivision;
  const log = (who: "spotter" | "head" | "j1", heat: string, entry: string, status: "landed" | "crashed" = "landed", k = key()) =>
    f.clients[who].rpc("add_attempt", { p_heat: heat, p_entry: entry, p_client_key: k, p_status: status, p_direction: "left", p_category_key: null, p_trick_name: "Backroll", p_trick_parts: {}, p_height_m: null, p_input_method: "builder", p_raw_text: null, p_override_reason: null });
  const score = (who: "j1" | "j2", attempt: string, value = 7, rev = 1) => f.clients[who].rpc("submit_trick_score", { p_attempt: attempt, p_criteria: {}, p_score: value, p_missed: false, p_flag: null, p_client_key: key(), p_client_rev: rev });
  const critScore = (who: "j1" | "j2", attempt: string, rev = 1) => f.clients[who].rpc("submit_trick_score", { p_attempt: attempt, p_criteria: { height: 7, extremity: 8 }, p_score: 7.5, p_missed: false, p_flag: null, p_client_key: key(), p_client_rev: rev });
  const imp = (who: "j1" | "j2", heat: string, entry: string) => f.clients[who].rpc("submit_impression", { p_heat: heat, p_entry: entry, p_value: 6, p_client_key: key(), p_client_rev: 1 });
  const submit = (who: "j1" | "j2", heat: string) => f.clients[who].rpc("submit_sheet", { p_heat: heat });
  const att = async (heat: string, entry: string, seq: number, status: "landed" | "crashed" = "landed", seat?: string) =>
    (await f.s.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq, status, trick_name: `Trick ${seq}`, client_key: key(), ...(seat ? { created_by_seat: seat } : {}) }).select("id").single()).data!.id as string;
  const sheetOf = async (heat: string, seat: string) => (await f.s.from("judge_sheets").select("submitted_at, reopened_at, reopened_reason").eq("heat_id", heat).eq("judge_seat_id", seat).maybeSingle()).data;
  const stored = async (heat: string) => (await f.s.from("heats").select("status").eq("id", heat).single()).data!.status as string;

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "He1", seats: ["j1", "j2"], model: MODEL, riders: 2 });
    crit = await mkDivision(f, { name: "He1Crit", seats: ["j1", "j2"], model: CRITERIA, riders: 2 });
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  describe("the spotter after the end", () => {
    it("the clock at 0:00 (stored status still running): a new line, a correction and an undo are accepted", async () => {
      const h = await mkHeat(f, d, { status: "running", started_at: ago(700) }, { riders: 2 }); // 600 s long, started 700 s ago
      const a = await log("spotter", h, d.entries[0]);
      expect(codeOf(a)).toBe("");
      const k = (a.data as { client_key: string }).client_key;
      expect(codeOf(await f.clients.spotter.rpc("spotter_edit_attempt", { p_client_key: k, p_status: "crashed" }))).toBe("");
      expect(codeOf(await f.clients.spotter.rpc("undo_attempt", { p_attempt: (a.data as { id: string }).id }))).toBe("");
    });

    it("End heat pressed (status ended) and a heat under review: accepted", async () => {
      for (const status of ["ended", "under_review"]) {
        const h = await mkHeat(f, d, { status, started_at: ago(700), ended_at: ago(60) }, { riders: 2 });
        expect(codeOf(await log("spotter", h, d.entries[0]))).toBe("");
        expect(await stored(h)).toBe(status); // writing a line never moves the heat
      }
    });

    it("a paused heat is still the head judge's, as before", async () => {
      const h = await mkHeat(f, d, { status: "paused", started_at: ago(60), paused_at: ago(10) }, { riders: 2 });
      expect(codeOf(await log("spotter", h, d.entries[0]))).toContain("HEAT_NOT_RUNNING");
      expect(codeOf(await log("head", h, d.entries[0]))).toBe("");
    });

    it("once the heat is published the spotter's writes are refused (a new line, a correction, an undo) and the head judge's too", async () => {
      const h = await mkHeat(f, d, { status: "ended", started_at: ago(700), ended_at: ago(60) }, { riders: 2 });
      const a = await log("spotter", h, d.entries[0]);
      expect(codeOf(a)).toBe("");
      await f.s.from("heats").update({ status: "published", published_at: new Date().toISOString() }).eq("id", h);
      expect(codeOf(await log("spotter", h, d.entries[1]))).toContain("HEAT_PUBLISHED");
      expect(codeOf(await log("head", h, d.entries[1]))).toContain("HEAT_PUBLISHED");
      expect(codeOf(await f.clients.spotter.rpc("spotter_edit_attempt", { p_client_key: (a.data as { client_key: string }).client_key, p_status: "crashed" }))).toContain("HEAT_PUBLISHED");
      expect(codeOf(await f.clients.spotter.rpc("undo_attempt", { p_attempt: (a.data as { id: string }).id }))).toContain("HEAT_PUBLISHED");
      const rows = (await f.s.from("trick_attempts").select("id, status, deleted_at").eq("heat_id", h)).data ?? [];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "landed", deleted_at: null });
    });

    it("Re-open gives the spotter his writes back", async () => {
      const h = await mkHeat(f, d, { status: "published", started_at: ago(900), ended_at: ago(300), published_at: ago(100) }, { riders: 2 });
      expect(codeOf(await log("spotter", h, d.entries[0]))).toContain("HEAT_PUBLISHED");
      expect(codeOf(await f.clients.head.rpc("reopen_heat", { p_heat: h, p_reason: "a jump was missing" }))).toBe("");
      expect(await stored(h)).toBe("under_review");
      expect(codeOf(await log("spotter", h, d.entries[0]))).toBe("");
    });

    it("a heat that has not started, and a cancelled heat, still refuse", async () => {
      const waiting = await mkHeat(f, d, {}, { riders: 2 });
      const cancelled = await mkHeat(f, d, { status: "cancelled" }, { riders: 2 });
      expect(codeOf(await log("spotter", waiting, d.entries[0]))).toContain("HEAT_NOT_RUNNING");
      expect(codeOf(await log("spotter", cancelled, d.entries[0]))).toContain("HEAT_NOT_RUNNING");
    });

    it("the attempt cap still holds after the end", async () => {
      const h = await mkHeat(f, d, { status: "ended", started_at: ago(700), ended_at: ago(60) }, { riders: 2 });
      for (let n = 1; n <= 7; n++) expect(codeOf(await log("spotter", h, d.entries[0]))).toBe("");
      expect(codeOf(await log("spotter", h, d.entries[0]))).toContain("ATTEMPT_CAP_REACHED");
    });
  });

  describe("a line logged after a judge has submitted", () => {
    /** Two riders, one landed line each, both judges scored and gave Variety for both riders; judge 1 submitted. Heat has ended. */
    async function endedHeat(division: LiveDivision, criteria = false) {
      const h = await mkHeat(f, division, { status: "ended", started_at: ago(700), ended_at: ago(60) }, { riders: 2 });
      const a1 = await att(h, division.entries[0], 1);
      const a2 = await att(h, division.entries[1], 1);
      for (const who of ["j1", "j2"] as const) for (const a of [a1, a2]) expect(codeOf(criteria ? await critScore(who, a) : await score(who, a))).toBe("");
      return { h, a1, a2 };
    }

    it("reopens only the judge who had submitted; the console's rule counts him as not finished again; he scores the new line and submits again", async () => {
      const { h } = await endedHeat(d);
      for (const e of d.entries) await imp("j1", h, e);
      expect(codeOf(await submit("j1", h))).toBe("");
      const before = await sheetOf(h, f.ids.seat_j1);
      expect(before?.submitted_at).toBeTruthy();
      expect(before?.reopened_at).toBeNull();

      const late = await log("spotter", h, d.entries[0]);
      expect(codeOf(late)).toBe("");
      const lateId = (late.data as { id: string }).id;
      const after = (await sheetOf(h, f.ids.seat_j1))!;
      expect(after.reopened_at).toBeTruthy();
      expect(Date.parse(after.reopened_at!)).toBeGreaterThanOrEqual(Date.parse(after.submitted_at!)); // "reopened_at >= submitted_at" is what every screen reads as "not finished"
      expect(after.reopened_reason).toBe("New attempt to score");
      expect(await sheetOf(h, f.ids.seat_j2)).toBeNull(); // judge 2 never submitted: nothing to reopen

      // the judge can score the new line now, and Submit again works
      expect(codeOf(await score("j1", lateId, 6.5))).toBe("");
      expect(codeOf(await submit("j1", h))).toBe("");
      const again = (await sheetOf(h, f.ids.seat_j1))!;
      expect(Date.parse(again.submitted_at!)).toBeGreaterThan(Date.parse(again.reopened_at!));
      // the audit log says why
      const audit = (await f.s.from("audit_log").select("action, reason").eq("table_name", "judge_sheets").eq("action", "sheet_reopened_by_new_attempt")).data ?? [];
      expect(audit.length).toBeGreaterThan(0);
    });

    it("also in a division scored by criteria", async () => {
      const { h } = await endedHeat(crit, true);
      expect(codeOf(await submit("j1", h))).toBe(""); // this model has no Variety score
      const late = await log("spotter", h, crit.entries[0]);
      expect(codeOf(late)).toBe("");
      const s = (await sheetOf(h, f.ids.seat_j1))!;
      expect(Date.parse(s.reopened_at!)).toBeGreaterThanOrEqual(Date.parse(s.submitted_at!));
      expect(codeOf(await critScore("j1", (late.data as { id: string }).id))).toBe("");
    });

    it("a crash reopens nothing (judges never score a crash); correcting it to a landing does", async () => {
      const { h } = await endedHeat(d);
      for (const e of d.entries) await imp("j1", h, e);
      await submit("j1", h);
      const crash = await log("spotter", h, d.entries[0], "crashed");
      expect(codeOf(crash)).toBe("");
      expect((await sheetOf(h, f.ids.seat_j1))!.reopened_at).toBeNull();
      expect(codeOf(await f.clients.spotter.rpc("spotter_edit_attempt", { p_client_key: (crash.data as { client_key: string }).client_key, p_status: "landed" }))).toBe("");
      expect((await sheetOf(h, f.ids.seat_j1))!.reopened_at).toBeTruthy();
    });

    it("a heat under review: the line reopens the sheet there too (the judge can reach it again)", async () => {
      const { h } = await endedHeat(d);
      for (const e of d.entries) await imp("j1", h, e);
      await submit("j1", h);
      await f.s.from("heats").update({ status: "under_review" }).eq("id", h);
      const late = await log("spotter", h, d.entries[1]);
      expect(codeOf(late)).toBe("");
      expect(codeOf(await score("j1", (late.data as { id: string }).id))).toBe(""); // allowed: the sheet is reopened
    });

    it("a judge who has not submitted is not reopened (nothing to reopen) and a late line needs his score like any other", async () => {
      const { h } = await endedHeat(d);
      const late = await log("spotter", h, d.entries[0]);
      expect(await sheetOf(h, f.ids.seat_j1)).toBeNull();
      expect(codeOf(await score("j2", (late.data as { id: string }).id))).toBe("");
    });

    it("a published result is never touched: a published heat takes no line, so no sheet moves", async () => {
      const { h } = await endedHeat(d);
      for (const e of d.entries) await imp("j1", h, e);
      await submit("j1", h);
      const before = await sheetOf(h, f.ids.seat_j1);
      await f.s.from("heats").update({ status: "published", published_at: new Date().toISOString() }).eq("id", h);
      expect(codeOf(await log("spotter", h, d.entries[0]))).toContain("HEAT_PUBLISHED");
      expect(await sheetOf(h, f.ids.seat_j1)).toEqual(before);
    });
  });

  describe("fixing an attempt resolves the flags about it", () => {
    const flag = (attempt: string, kind: string) => f.clients.j1.rpc("submit_flag", { p_attempt: attempt, p_kind: kind, p_note: "I saw the board hit the water", p_client_key: key() });
    const open = async (attempt: string) => (await f.s.from("attempt_flags").select("kind, note, resolved_at, resolution").eq("attempt_id", attempt)).data ?? [];

    it("a crash flag is resolved when the line is switched to a crash (by the spotter, who did not need the head judge); the note is kept", async () => {
      const h = await mkHeat(f, d, { status: "ended", started_at: ago(700), ended_at: ago(60) }, { riders: 2 });
      const a = await log("spotter", h, d.entries[0]);
      const id = (a.data as { id: string }).id;
      expect(codeOf(await flag(id, "crash"))).toBe("");
      let rows = await open(id);
      expect(rows[0]).toMatchObject({ kind: "crash", note: "I saw the board hit the water", resolved_at: null });
      expect(codeOf(await f.clients.spotter.rpc("spotter_edit_attempt", { p_client_key: (a.data as { client_key: string }).client_key, p_status: "crashed" }))).toBe("");
      rows = await open(id);
      expect(rows[0].resolved_at).toBeTruthy();
      expect(rows[0].resolution).toContain("crashed");
    });

    it("a duplicate flag is resolved when the attempt is taken out; a wrong-rider flag when it moves to the other rider", async () => {
      const h = await mkHeat(f, d, { status: "ended", started_at: ago(700), ended_at: ago(60) }, { riders: 2 });
      const dup = (await log("head", h, d.entries[0])).data as { id: string };
      expect(codeOf(await flag(dup.id, "duplicate"))).toBe("");
      expect(codeOf(await f.clients.head.rpc("delete_attempt", { p_attempt: dup.id, p_reason: "same jump logged twice" }))).toBe("");
      expect((await open(dup.id))[0].resolved_at).toBeTruthy();

      const wrong = (await log("head", h, d.entries[0])).data as { id: string };
      expect(codeOf(await flag(wrong.id, "wrong_rider"))).toBe("");
      expect(codeOf(await f.clients.head.rpc("edit_attempt", { p_attempt: wrong.id, p_reason: "it was the other rider", p_entry: d.entries[1] }))).toBe("");
      expect((await open(wrong.id))[0].resolved_at).toBeTruthy();
    });

    it("a flag about something that was not fixed stays open", async () => {
      const h = await mkHeat(f, d, { status: "ended", started_at: ago(700), ended_at: ago(60) }, { riders: 2 });
      const a = (await log("spotter", h, d.entries[0])).data as { id: string };
      expect(codeOf(await flag(a.id, "other"))).toBe("");
      expect((await open(a.id))[0].resolved_at).toBeNull();
    });
  });
});
