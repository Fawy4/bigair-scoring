import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, signedIn, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Rider sheet in a division scored by criteria (0.24.0): one box per criterion on each line. The judge's whole line is sent once every criterion has a value
// (set_line_criteria); until the attempt exists it is that judge's private note, which settles onto the attempt as the same score the Queue writes.
const CRITERIA = {
  trick: {
    entry: "criteria",
    scale: { min: 0, max: 10, step: 0.5 },
    criteria: [
      { key: "height", label: "Height", weight: 1 },
      { key: "extremity", label: "Extremity", weight: 1 },
      { key: "technicality", label: "Technicality", weight: 1 },
    ],
  },
  panel: { minJudges: 2 },
  heat: { maxAttemptsPerRider: 7 },
};
const SINGLE = { trick: { entry: "single", scale: { min: 0, max: 10, step: 0.1 } }, panel: { minJudges: 2 }, heat: { maxAttemptsPerRider: 7 } };
const C1 = { height: 7, extremity: 8, technicality: 6.5 };
const S1 = 7.17;

describe.skipIf(!ENV_OK)("Rider sheet: criteria lines (hosted development project)", () => {
  let f: Fixture;
  let crit: LiveDivision;
  let single: LiveDivision;
  let obs: SupabaseClient;
  const users: string[] = [];
  const password = `Pw-${randomBytes(12).toString("hex")}`;

  const att = async (heat: string, entry: string, seq: number, status: "landed" | "crashed" = "landed") =>
    (await f.s.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq, status, trick_name: `Trick ${seq}`, client_key: key() }).select("id").single()).data!.id as string;
  const line = (who: "j1" | "j2" | "j3" | "spotter" | "head" | "anon" | "bJudge", heat: string, entry: string, n: number, criteria: object | null, score: number | null, rev = 1) =>
    f.clients[who].rpc("set_line_criteria", { p_heat: heat, p_entry: entry, p_line: n, p_criteria: criteria as never, p_score: score as never, p_client_key: key(), p_client_rev: rev });
  const notes = async (heat: string) => (await f.s.from("pending_scores").select("judge_seat_id, entry_id, slot, score, missed, criteria").eq("heat_id", heat).order("slot")).data ?? [];
  const scoresOf = async (attempt: string) => (await f.s.from("trick_scores").select("judge_seat_id, score, missed, criteria").eq("attempt_id", attempt)).data ?? [];
  const running = (div: LiveDivision = crit) => mkHeat(f, div, { status: "running", started_at: ago(60) }, { riders: 3 });

  beforeAll(async () => {
    f = await buildFixture();
    crit = await mkDivision(f, { name: "CritSheet", seats: ["j1", "j2"], model: CRITERIA });
    single = await mkDivision(f, { name: "CritSheetSingle", seats: ["j1", "j2"], model: SINGLE });
    const email = `rls-crit-${randomBytes(4).toString("hex")}@example.com`;
    const { data, error } = await f.s.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    obs = await signedIn(email, password);
    const seat = await f.s.from("judge_seats").insert({ event_id: f.ids.evA1, name: "Crit observer", role: "observer", scores: false, auth_user_id: data.user.id, status: "active", active: true }).select("id").single();
    if (seat.error) throw new Error(seat.error.message);
  });
  afterAll(async () => {
    if (!f) return;
    await f.cleanup();
  });

  it("only that judge's own seat writes a criteria line: another seat, an observer, another event's official and a visitor are refused", async () => {
    const h = await running();
    const e = crit.entries[0];
    expect(codeOf(await line("j1", h, e, 1, C1, S1))).toBe("");
    expect(codeOf(await line("j3", h, e, 1, C1, S1))).toContain("NOT_ALLOWED"); // a judge off the panel
    expect(codeOf(await line("spotter", h, e, 1, C1, S1))).toContain("NOT_ALLOWED");
    expect(codeOf(await line("bJudge", h, e, 1, C1, S1))).not.toBe(""); // another event's official
    expect(codeOf(await line("anon", h, e, 1, C1, S1))).not.toBe(""); // a visitor
    const o = await obs.rpc("set_line_criteria", { p_heat: h, p_entry: e, p_line: 1, p_criteria: C1 as never, p_score: S1, p_client_key: key(), p_client_rev: 1 });
    expect(codeOf(o)).not.toBe(""); // an observer
    // a second judge's call writes only that judge's own note, never the first judge's
    expect(codeOf(await line("j2", h, e, 1, { ...C1, height: 9 }, 7.83))).toBe("");
    const got = await notes(h);
    expect(got.map((n) => n.judge_seat_id).sort()).toEqual([f.ids.seat_j1, f.ids.seat_j2].sort());
    expect(got.find((n) => n.judge_seat_id === f.ids.seat_j1)?.criteria).toEqual(C1);
    // the table cannot be written around the function
    const base = { event_id: f.ids.evA1, heat_id: h, entry_id: e, slot: 2, score: 5, criteria: C1, client_key: key() };
    expect(codeOf(await f.clients.j2.from("pending_scores").insert({ ...base, judge_seat_id: f.ids.seat_j1 } as never))).not.toBe("");
    expect(codeOf(await f.clients.j1.from("pending_scores").insert({ ...base, judge_seat_id: f.ids.seat_j1 } as never))).not.toBe("");
  });

  it("a line needs every criterion, each on its own range and step, a running heat, and a division scored by criteria", async () => {
    const h = await running();
    const e = crit.entries[0];
    expect(codeOf(await line("j1", h, e, 1, { height: 7, extremity: 8 }, 7.5))).toContain("SCORE_REQUIRED"); // a criterion missing
    expect(codeOf(await line("j1", h, e, 1, C1, null))).toContain("SCORE_REQUIRED");
    expect(codeOf(await line("j1", h, e, 1, null, S1))).toContain("SCORE_REQUIRED");
    expect(codeOf(await line("j1", h, e, 1, { ...C1, height: 7.25 }, S1))).toMatch(/SCORE_OFF_STEP/); // a score between two steps
    expect(codeOf(await line("j1", h, e, 1, { ...C1, height: 11 }, S1))).toContain("SCORE_OUT_OF_RANGE");
    expect(codeOf(await line("j1", h, e, 8, C1, S1))).toContain("LINE_PAST_CAP");
    const scheduled = await mkHeat(f, crit, { status: "scheduled" });
    expect(codeOf(await line("j1", scheduled, e, 1, C1, S1))).toContain("HEAT_NOT_RUNNING");
    const hs = await running(single);
    expect(codeOf(await line("j1", hs, single.entries[0], 1, C1, S1))).toContain("LINE_SCORE_NOT_AVAILABLE");
    expect(await notes(h)).toHaveLength(0);
    expect(await notes(hs)).toHaveLength(0);
  });

  it("a line typed before the spotter logs waits as the judge's note and settles onto the attempt as the same criteria score the Queue writes", async () => {
    const h = await running();
    const [e1] = crit.entries;
    expect(codeOf(await line("j1", h, e1, 1, C1, S1))).toBe("");
    // the same values entered through the Queue's own function on another rider's attempt
    const q = await att(h, crit.entries[1], 1);
    expect(codeOf(await f.clients.j1.rpc("submit_trick_score", { p_attempt: q, p_criteria: C1 as never, p_score: S1, p_missed: false, p_flag: null as never, p_client_key: key(), p_client_rev: 1 }))).toBe("");
    const a = await att(h, e1, 1);
    const sheet = await scoresOf(a);
    const queue = await scoresOf(q);
    expect(sheet).toHaveLength(1);
    expect(sheet[0]).toEqual(queue[0]);
    expect(Number(sheet[0].score)).toBe(S1);
    expect(sheet[0].criteria).toEqual(C1);
    expect(await notes(h)).toHaveLength(0);
  });

  it("a line typed after the attempt exists is the Queue's own score; a crash discards a waiting line; Missed works in a criteria division", async () => {
    const h = await running();
    const e = crit.entries[0];
    const a1 = await att(h, e, 1);
    expect(codeOf(await line("j1", h, e, 1, C1, S1))).toBe("");
    expect((await scoresOf(a1)).map((s) => s.criteria)).toEqual([C1]);
    // an edit of the same line by a newer revision replaces it; an older one does not
    expect(codeOf(await line("j1", h, e, 1, { ...C1, height: 9 }, 7.83, 5))).toBe("");
    expect(codeOf(await line("j1", h, e, 1, C1, S1, 4))).toBe("");
    expect(Number((await scoresOf(a1))[0].score)).toBe(7.83);
    // a waiting line meets a crash: discarded
    expect(codeOf(await line("j1", h, e, 2, C1, S1))).toBe("");
    const a2 = await att(h, e, 2, "crashed");
    expect(await scoresOf(a2)).toHaveLength(0);
    expect(await notes(h)).toHaveLength(0);
    expect(codeOf(await line("j1", h, e, 2, C1, S1))).toContain("NOT_SCORABLE");
    // Missed on a waiting line and on a line that has its attempt
    const miss = (n: number) => f.clients.j1.rpc("set_line_missed", { p_heat: h, p_entry: e, p_line: n, p_client_key: key(), p_client_rev: 900 });
    expect(codeOf(await miss(3))).toBe("");
    const a3 = await att(h, e, 3);
    expect((await scoresOf(a3)).map((s) => [s.missed, s.score])).toEqual([[true, null]]);
    const a4 = await att(h, e, 4);
    expect(codeOf(await miss(4))).toBe("");
    expect((await scoresOf(a4)).map((s) => s.missed)).toEqual([true]);
  });
});
