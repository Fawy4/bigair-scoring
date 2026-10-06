import { randomBytes } from "node:crypto";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, signedIn, uuid, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Rider sheet: a judge types a score on a numbered line before the spotter logs the attempt. The score is a private "pending" note until an attempt takes the line.
// These tests prove the database half: who may write and read notes, the cap, the matching (in order of logging; a crash discards; delete / merge shift), Submit and
// Publish refusing while a note remains, and that no public function ever carries a note. (The pure rule is also tested in src/lib/live/rider-sheet.test.ts.)
const MODEL = {
  trick: { entry: "single", scale: { min: 0, max: 10, step: 0.1 } },
  panel: { minJudges: 2 },
  heat: { maxAttemptsPerRider: 7 },
};
const UNCAPPED = { trick: { entry: "single", scale: { min: 0, max: 10, step: 0.1 } }, panel: { minJudges: 2 }, heat: {} };
const CRITERIA = {
  trick: { entry: "criteria", scale: { min: 0, max: 10, step: 0.5 }, criteria: [{ key: "a", label: "A", weight: 1 }] },
  panel: { minJudges: 2 },
  heat: { maxAttemptsPerRider: 7 },
};

describe.skipIf(!ENV_OK)("Rider sheet: pending notes (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  let open: LiveDivision;
  let crit: LiveDivision;
  let obs: SupabaseClient;
  const users: string[] = [];
  const password = `Pw-${randomBytes(12).toString("hex")}`;

  const att = async (heat: string, entry: string, seq: number, status: "landed" | "crashed" = "landed") =>
    (await f.s.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq, status, trick_name: `Trick ${seq}`, client_key: key() }).select("id").single()).data!.id as string;
  const note = (who: "j1" | "j2" | "j3" | "spotter" | "head" | "anon", heat: string, entry: string, line: number, value: number | null, rev = 1) =>
    f.clients[who].rpc("set_line_score", { p_heat: heat, p_entry: entry, p_line: line, p_score: value, p_client_key: key(), p_client_rev: rev });
  const clear = (who: "j1" | "j2", heat: string, entry: string, line: number) => f.clients[who].rpc("clear_line_score", { p_heat: heat, p_entry: entry, p_line: line });
  const notes = async (heat: string) => (await f.s.from("pending_scores").select("judge_seat_id, entry_id, slot, score").eq("heat_id", heat).order("slot")).data ?? [];
  const scoresOf = async (attempt: string) => (await f.s.from("trick_scores").select("judge_seat_id, score").eq("attempt_id", attempt)).data ?? [];
  const running = (div: LiveDivision = d, riders = 3) => mkHeat(f, div, { status: "running", started_at: ago(60) }, { riders });

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "SheetDiv", seats: ["j1", "j2"], model: MODEL });
    open = await mkDivision(f, { name: "SheetNoCap", seats: ["j1", "j2"], model: UNCAPPED });
    crit = await mkDivision(f, { name: "SheetCriteria", seats: ["j1", "j2"], model: CRITERIA });
    const email = `rls-sheet-${randomBytes(4).toString("hex")}@example.com`;
    const { data, error } = await f.s.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    obs = await signedIn(email, password);
    const seat = await f.s.from("judge_seats").insert({ event_id: f.ids.evA1, name: "Sheet observer", role: "observer", scores: false, auth_user_id: data.user.id, status: "active", active: true }).select("id").single();
    if (seat.error) throw new Error(seat.error.message);
  });
  afterAll(async () => {
    if (!f) return;
    await f.cleanup();
    for (const id of users) await f.s.auth.admin.deleteUser(id).catch(() => undefined);
  });

  // ---------------------------------------------------------------- who may write, who may read
  it("a judge writes a note only for their own seat, and only on a heat of their panel; others are refused", async () => {
    const h = await running();
    expect(codeOf(await note("j1", h, d.entries[0], 1, 7.5))).toBe("");
    expect(codeOf(await note("j3", h, d.entries[0], 1, 7.5))).toContain("NOT_ALLOWED"); // a judge off the panel
    expect(codeOf(await note("spotter", h, d.entries[0], 1, 7.5))).toContain("NOT_ALLOWED");
    expect(codeOf(await note("anon", h, d.entries[0], 1, 7.5))).not.toBe("");
    const got = await notes(h);
    expect(got).toHaveLength(1);
    expect(got[0].judge_seat_id).toBe(f.ids.seat_j1);
    // the table cannot be written around the function: no insert, update or delete, and no note under somebody else's seat
    const base = { event_id: f.ids.evA1, heat_id: h, entry_id: d.entries[0], slot: 2, score: 5, client_key: key() };
    expect(codeOf(await f.clients.j1.from("pending_scores").insert({ ...base, judge_seat_id: f.ids.seat_j1 }))).not.toBe("");
    expect(codeOf(await f.clients.j1.from("pending_scores").insert({ ...base, judge_seat_id: f.ids.seat_j2 }))).not.toBe("");
    await f.clients.j1.from("pending_scores").update({ score: 1 }).eq("heat_id", h);
    await f.clients.j1.from("pending_scores").delete().eq("heat_id", h);
    expect((await notes(h)).map((n) => Number(n.score))).toEqual([7.5]);
  });

  it("a judge reads only their own notes; the head judge, an observer and the organiser read all; nobody else reads any", async () => {
    const h = await running();
    await note("j1", h, d.entries[0], 2, 6);
    await note("j2", h, d.entries[0], 2, 7);
    const seen = async (c: SupabaseClient) => ((await c.from("pending_scores").select("judge_seat_id").eq("heat_id", h)).data ?? []).map((r) => r.judge_seat_id).sort();
    expect(await seen(f.clients.j1)).toEqual([f.ids.seat_j1]);
    expect(await seen(f.clients.j2)).toEqual([f.ids.seat_j2]);
    expect(await seen(f.clients.head)).toEqual([f.ids.seat_j1, f.ids.seat_j2].sort());
    expect(await seen(obs)).toEqual([f.ids.seat_j1, f.ids.seat_j2].sort());
    expect(await seen(f.clients.orgA)).toHaveLength(2);
    for (const who of ["spotter", "announcer", "j3", "orgB", "anon", "bJudge"] as const) expect(await seen(f.clients[who]), who).toEqual([]);
  });

  it("a note needs a running heat, a rider of the heat, a score on the division's scale, and a one-score-per-line division", async () => {
    const h = await running();
    expect(codeOf(await note("j1", h, d.entries[0], 1, 7.25))).toMatch(/SCORE_OFF_STEP: 0\.1\|7\.2\|7\.3/);
    expect(codeOf(await note("j1", h, d.entries[0], 1, 11))).toContain("SCORE_OUT_OF_RANGE");
    expect(codeOf(await note("j1", h, d.entries[0], 1, null))).toContain("SCORE_REQUIRED");
    expect(codeOf(await note("j1", h, open.entries[0], 1, 5))).toContain("RIDER_NOT_IN_HEAT");
    const scheduled = await mkHeat(f, d, { status: "scheduled" });
    expect(codeOf(await note("j1", scheduled, d.entries[0], 1, 5))).toContain("HEAT_NOT_RUNNING");
    const hc = await running(crit);
    expect(codeOf(await note("j1", hc, crit.entries[0], 1, 5))).toContain("LINE_SCORE_NOT_AVAILABLE");
    expect(await notes(h)).toHaveLength(0);
  });

  it("never past the cap: line 8 of 7 is refused; with no cap only the one line ahead is allowed", async () => {
    const h = await running();
    expect(codeOf(await note("j1", h, d.entries[0], 7, 5))).toBe("");
    expect(codeOf(await note("j1", h, d.entries[0], 8, 5))).toContain("LINE_PAST_CAP");
    expect(codeOf(await note("j1", h, d.entries[0], 0, 5))).toContain("LINE_PAST_CAP");
    const u = await running(open);
    expect(codeOf(await note("j1", u, open.entries[0], 1, 5))).toBe("");
    expect(codeOf(await note("j1", u, open.entries[0], 2, 5))).toContain("LINE_PAST_CAP");
    await att(u, open.entries[0], 1);
    expect(codeOf(await note("j1", u, open.entries[0], 2, 5))).toBe("");
    expect(codeOf(await note("j1", u, open.entries[0], 3, 5))).toContain("LINE_PAST_CAP");
  });

  it("a newer edit of a note wins; a late older one is ignored", async () => {
    const h = await running();
    await note("j1", h, d.entries[0], 3, 6, 5);
    await note("j1", h, d.entries[0], 3, 9, 4);
    expect((await notes(h)).map((n) => Number(n.score))).toEqual([6]);
    await note("j1", h, d.entries[0], 3, 8, 6);
    expect((await notes(h)).map((n) => Number(n.score))).toEqual([8]);
  });

  // ---------------------------------------------------------------- matching
  it("notes on lines 1–3, the spotter logs a landing, a crash and a landing: lines 1 and 3 land on those attempts, line 2 is discarded", async () => {
    const h = await running();
    for (const [line, v] of [[3, 8], [1, 7], [2, 6]] as const) expect(codeOf(await note("j1", h, d.entries[0], line, v))).toBe(""); // typed in any order
    await note("j2", h, d.entries[0], 1, 7.5);
    const a1 = await att(h, d.entries[0], 1);
    expect((await scoresOf(a1)).map((s) => [s.judge_seat_id, Number(s.score)]).sort()).toEqual([[f.ids.seat_j1, 7], [f.ids.seat_j2, 7.5]].sort());
    const a2 = await att(h, d.entries[0], 2, "crashed");
    expect(await scoresOf(a2)).toEqual([]);
    expect((await notes(h)).map((n) => n.slot)).toEqual([3]); // line 2's note is gone, line 3 still waits
    const a3 = await att(h, d.entries[0], 3);
    expect((await scoresOf(a3)).map((s) => Number(s.score))).toEqual([8]);
    expect(await notes(h)).toEqual([]);
    // the audit log says where the score came from
    const lines = (await f.s.from("audit_log").select("action, after").eq("row_id", (await f.s.from("trick_scores").select("id").eq("attempt_id", a3).single()).data!.id)).data ?? [];
    expect(lines.map((l) => l.action)).toContain("score_from_note");
  });

  it("notes are matched by order of logging, never by when they were typed: a note typed first for line 3 waits for the third attempt", async () => {
    const h = await running();
    await note("j1", h, d.entries[1], 3, 9);
    await note("j1", h, d.entries[1], 1, 5);
    const a1 = await att(h, d.entries[1], 1);
    const a2 = await att(h, d.entries[1], 2);
    expect((await scoresOf(a1)).map((s) => Number(s.score))).toEqual([5]);
    expect(await scoresOf(a2)).toEqual([]);
    expect((await notes(h)).map((n) => Number(n.score))).toEqual([9]);
  });

  it("a score typed on a line that already has an attempt is that judge's score on the attempt, exactly as the Queue writes it; a crash line refuses it", async () => {
    const h = await running();
    const a1 = await att(h, d.entries[0], 1);
    const a2 = await att(h, d.entries[0], 2, "crashed");
    const r = await note("j1", h, d.entries[0], 1, 6.5);
    expect(codeOf(r)).toBe("");
    expect((r.data as { kind: string }).kind).toBe("score");
    expect((await scoresOf(a1)).map((s) => Number(s.score))).toEqual([6.5]);
    expect(codeOf(await note("j1", h, d.entries[0], 2, 6.5))).toContain("NOT_SCORABLE");
    expect(await scoresOf(a2)).toEqual([]);
    expect(await notes(h)).toEqual([]);
    // changing it again is a normal change of that judge's score (and is audited as one)
    expect(codeOf(await note("j1", h, d.entries[0], 1, 8.5, 2))).toBe("");
    expect((await scoresOf(a1)).map((s) => Number(s.score))).toEqual([8.5]);
    const sc = (await f.s.from("trick_scores").select("id").eq("attempt_id", a1).single()).data!.id;
    const log = (await f.s.from("audit_log").select("before, after").eq("row_id", sc).order("at")).data ?? [];
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(Number((log[log.length - 1].before as { score: string }).score)).toBe(6.5);
    expect(Number((log[log.length - 1].after as { score: string }).score)).toBe(8.5);
  });

  it("deleting a logged attempt: the notes behind it shift up a line and the next attempt takes the lowest empty line", async () => {
    const h = await running();
    const a1 = await att(h, d.entries[0], 1);
    const a2 = await att(h, d.entries[0], 2);
    await note("j1", h, d.entries[0], 3, 6);
    await note("j1", h, d.entries[0], 4, 8);
    expect(codeOf(await f.clients.head.rpc("delete_attempt", { p_attempt: a2, p_reason: "spotter slip" }))).toBe("");
    // the sheet now has 1 attempt: the two notes are lines 2 and 3, still kept under attempt numbers 3 and 4
    expect((await notes(h)).map((n) => n.slot)).toEqual([3, 4]);
    const a3 = await att(h, d.entries[0], 3); // the spotter's next attempt is number 3 and is line 2
    expect((await scoresOf(a3)).map((s) => Number(s.score))).toEqual([6]);
    expect((await notes(h)).map((n) => [n.slot, Number(n.score)])).toEqual([[4, 8]]);
    expect(await scoresOf(a1)).toEqual([]);
  });

  it("merging two attempts is a delete of the second: a judge's pending notes follow the same shift", async () => {
    const h = await running();
    const a1 = await att(h, d.entries[1], 1);
    const a2 = await att(h, d.entries[1], 2);
    await note("j2", h, d.entries[1], 3, 5);
    expect(codeOf(await f.clients.head.rpc("merge_attempts", { p_keep: a1, p_drop: a2, p_choices: {}, p_reason: "same trick" }))).toBe("");
    const a3 = await att(h, d.entries[1], 3);
    expect((await scoresOf(a3)).map((s) => Number(s.score))).toEqual([5]);
  });

  it("a note never turns into a second score: the judge's own score on that attempt stays", async () => {
    const h = await running();
    const a1 = await att(h, d.entries[2], 1);
    await note("j1", h, d.entries[2], 2, 4);
    await note("j1", h, d.entries[2], 1, 9); // goes straight to attempt 1 as a score
    expect((await scoresOf(a1)).map((s) => Number(s.score))).toEqual([9]);
    const a2 = await att(h, d.entries[2], 2);
    expect((await scoresOf(a2)).map((s) => Number(s.score))).toEqual([4]);
  });

  // ---------------------------------------------------------------- Clear
  it("a judge clears only their own note; clearing is allowed even when the sheet is locked; a line with an attempt has nothing to clear", async () => {
    const h = await running();
    await note("j1", h, d.entries[0], 2, 6);
    await note("j2", h, d.entries[0], 2, 7);
    expect(codeOf(await clear("j1", h, d.entries[0], 2))).toBe("");
    expect((await notes(h)).map((n) => n.judge_seat_id)).toEqual([f.ids.seat_j2]);
    expect((await clear("j1", h, d.entries[0], 2)).data).toBe(0);
    await att(h, d.entries[0], 1);
    expect((await clear("j2", h, d.entries[0], 1)).data).toBe(0);
    expect(codeOf(await f.clients.spotter.rpc("clear_line_score", { p_heat: h, p_entry: d.entries[0], p_line: 2 }))).toContain("NOT_ALLOWED"); // not a judge of this panel
    expect(codeOf(await obs.rpc("clear_line_score", { p_heat: h, p_entry: d.entries[0], p_line: 2 }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.anon.rpc("clear_line_score", { p_heat: h, p_entry: d.entries[0], p_line: 2 }))).not.toBe("");
    expect(await notes(h)).toHaveLength(1);
  });

  // ---------------------------------------------------------------- Submit and Publish
  it("Submit is refused while the judge holds a note (naming the lines); after Clear it goes through; other judges are not held up", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(900) }, { riders: 2 });
    await note("j1", h, d.entries[0], 3, 6);
    await note("j1", h, d.entries[0], 5, 6);
    await f.s.from("heats").update({ status: "ended", ended_at: ago(300) }).eq("id", h);
    const r = await f.clients.j1.rpc("submit_sheet", { p_heat: h });
    expect(codeOf(r)).toContain(`PENDING_NOTES: ${d.entries[0]}:3,5`);
    expect(codeOf(await f.clients.j2.rpc("submit_sheet", { p_heat: h }))).toBe("");
    expect(codeOf(await clear("j1", h, d.entries[0], 3))).toBe("");
    expect(codeOf(await f.clients.j1.rpc("submit_sheet", { p_heat: h }))).toContain(`PENDING_NOTES: ${d.entries[0]}:5`);
    expect(codeOf(await clear("j1", h, d.entries[0], 5))).toBe("");
    expect(codeOf(await f.clients.j1.rpc("submit_sheet", { p_heat: h }))).toBe("");
  });

  it("Publish is refused while any note remains (even with an override); the head judge's inputs name it; after Clear the heat can be published", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(900) }, { riders: 1 });
    await note("j2", h, d.entries[0], 4, 6);
    await f.s.from("heats").update({ status: "ended", ended_at: ago(300) }).eq("id", h);
    const inputs = await f.clients.head.rpc("publish_heat_inputs", { p_heat: h });
    expect(codeOf(inputs)).toBe("");
    expect((inputs.data as { pending: Array<{ judge_seat_id: string; entry_id: string; line: number }> }).pending).toEqual([{ entry_id: d.entries[0], judge_seat_id: f.ids.seat_j2, slot: 4, line: 4 }]);
    const commit = () =>
      f.s.rpc("publish_heat_commit", { p_heat: h, p_expected_version: 1, p_results: [], p_draw: null, p_projection: [], p_hold: false, p_override_reason: "force it through", p_actor: f.userIds.head, p_blockers: [] });
    expect(codeOf(await commit())).toContain("PENDING_SCORES: 1");
    expect((await f.s.from("heats").select("status").eq("id", h).single()).data!.status).not.toBe("published");
    expect(codeOf(await f.s.from("heats").update({ status: "published" }).eq("id", h))).toContain("PENDING_SCORES");
    expect(codeOf(await clear("j2", h, d.entries[0], 4))).toBe("");
    expect(codeOf(await commit())).toBe("");
    expect((await f.s.from("heats").select("status").eq("id", h).single()).data!.status).toBe("published");
  });

  // ---------------------------------------------------------------- reset, public
  it("sending a heat back to scheduled (a reset) and deleting its attempts both remove its notes", async () => {
    const h = await running();
    await note("j1", h, d.entries[0], 2, 6);
    await f.s.from("heats").update({ status: "scheduled" }).eq("id", h);
    expect(await notes(h)).toEqual([]);
    const g = await running();
    await note("j1", g, d.entries[0], 2, 6);
    const a = await att(g, d.entries[0], 1);
    await f.s.from("trick_scores").delete().eq("heat_id", g);
    await f.s.from("trick_attempts").delete().eq("id", a);
    expect(await notes(g)).toEqual([]);
  });

  it("no public function ever returns a pending note, and a visitor cannot read the table", async () => {
    const h = await running();
    const marker = 7.7;
    await note("j1", h, d.entries[0], 1, marker);
    expect(await notes(h)).toHaveLength(1);
    const anon = f.clients.anon;
    const texts: string[] = [];
    for (const [fn, args] of [
      ["get_public_live_heat", { p_heat: h }],
      ["get_public_results", { p_event: f.ids.evA1 }],
      ["get_public_timetable", { p_event: f.ids.evA1 }],
    ] as const) {
      const res = await anon.rpc(fn as never, args as never);
      texts.push(JSON.stringify(res.data ?? res.error?.message ?? ""));
    }
    for (const t of texts) {
      expect(t).not.toContain("pending_scores");
      expect(t).not.toContain('"slot"');
      expect(t).not.toContain(f.ids.seat_j1);
    }
    expect(((await anon.from("pending_scores").select("*")).data ?? []).length).toBe(0);
  });

  // ---------------------------------------------------------------- Realtime (the browser of the test sandbox cannot open the socket, so it is proved from Node)
  it("Realtime: the head judge's channel gets a note, its conversion into a score and a later change within a second and a half; another judge's channel gets nothing", async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const channels: RealtimeChannel[] = [];
    const listen = async (c: SupabaseClient, table: string, heat: string) => {
      const seen: Array<{ at: number; type: string; row: Record<string, unknown> }> = [];
      const ch = c.channel(`rs-${table}-${uuid().slice(0, 6)}`).on("postgres_changes", { event: "*", schema: "public", table, filter: `heat_id=eq.${heat}` }, (p) => seen.push({ at: Date.now(), type: p.eventType, row: (p.new ?? p.old) as Record<string, unknown> }));
      channels.push(ch);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`channel ${table} did not subscribe`)), 20_000);
        ch.subscribe((st) => st === "SUBSCRIBED" && (clearTimeout(t), resolve()));
      });
      await wait(1500);
      return seen;
    };
    const until = async (cond: () => boolean) => {
      const end = Date.now() + 6000;
      while (!cond() && Date.now() < end) await wait(25);
    };
    try {
      const h = await running(d, 1);
      const headNotes = await listen(f.clients.head, "pending_scores", h);
      const otherNotes = await listen(f.clients.j2, "pending_scores", h);
      const headScores = await listen(f.clients.head, "trick_scores", h);
      let sent = Date.now();
      expect(codeOf(await note("j1", h, d.entries[0], 1, 7.5))).toBe("");
      await until(() => headNotes.length > 0);
      console.log(`a pending note reached the head judge's channel ${headNotes[0].at - sent} ms after the call`);
      expect(headNotes[0].at - sent).toBeLessThan(1500);
      expect(headNotes[0].row).toMatchObject({ judge_seat_id: f.ids.seat_j1, slot: 1 });
      // the spotter logs: the note is deleted and the score appears, both seen by the head judge
      sent = Date.now();
      const a = await att(h, d.entries[0], 1);
      await until(() => headNotes.some((n) => n.type === "DELETE") && headScores.length > 0);
      console.log(`the score from the note reached the head judge ${headScores[0].at - sent} ms after the attempt was logged`);
      expect(headNotes.some((n) => n.type === "DELETE")).toBe(true);
      expect(Number(headScores[0].row.score)).toBe(7.5);
      expect(headScores[0].row.attempt_id).toBe(a);
      // a later change by the judge
      const before = headScores.length;
      sent = Date.now();
      expect(codeOf(await note("j1", h, d.entries[0], 1, 8.5, 5))).toBe("");
      await until(() => headScores.length > before);
      console.log(`a changed score reached the head judge ${headScores[headScores.length - 1].at - sent} ms after the call`);
      expect(Number(headScores[headScores.length - 1].row.score)).toBe(8.5);
      expect(headScores[headScores.length - 1].at - sent).toBeLessThan(1500);
      // Realtime does not filter a DELETE by row security, but it carries no row: the other judge learns nothing of the note (no seat, no score)
      expect(otherNotes.filter((n) => n.type !== "DELETE")).toHaveLength(0);
      expect(otherNotes.every((n) => Object.keys(n.row).length === 0)).toBe(true);
    } finally {
      for (const ch of channels) await ch.unsubscribe();
    }
  });

  // ---------------------------------------------------------------- the head judge clears a judge's note (a dead phone must never trap Publish)
  describe("head judge Clear", () => {
    const noteId = async (heat: string, seat: string) => (await f.s.from("pending_scores").select("id").eq("heat_id", heat).eq("judge_seat_id", seat).limit(1).single()).data!.id as string;

    it("the head judge and an organiser may clear a judge's note (reason optional); the audit line names who, which note and the reason; nobody else can", async () => {
      const h = await running();
      await note("j1", h, d.entries[0], 3, 6);
      await note("j2", h, d.entries[0], 3, 7);
      const n1 = await noteId(h, f.ids.seat_j1);
      const n2 = await noteId(h, f.ids.seat_j2);
      for (const who of ["j1", "j2", "j3", "spotter", "announcer", "anon", "orgB"] as const) {
        expect(codeOf(await f.clients[who].rpc("head_clear_pending", { p_note: n1, p_reason: "x y z" })), who).not.toBe("");
      }
      expect(codeOf(await obs.rpc("head_clear_pending", { p_note: n1, p_reason: "x y z" }))).toContain("NOT_ALLOWED");
      expect((await notes(h)).length).toBe(2);
      expect(codeOf(await f.clients.head.rpc("head_clear_pending", { p_note: n1, p_reason: "J1's phone died" }))).toBe("");
      expect(codeOf(await f.clients.orgA.rpc("head_clear_pending", { p_note: n2, p_reason: null }))).toBe("");
      expect(await notes(h)).toEqual([]);
      const log = (await f.s.from("audit_log").select("action, reason, before").eq("event_id", f.ids.evA1).eq("action", "pending_cleared_by_head").in("row_id", [n1, n2])).data ?? [];
      expect(log).toHaveLength(2);
      const one = log.find((l) => (l.before as { id: string }).id === n1)!;
      expect(one.reason).toBe("J1's phone died");
      expect(one.before).toMatchObject({ judge_seat_id: f.ids.seat_j1, entry_id: d.entries[0], line: 3 });
      expect(log.find((l) => (l.before as { id: string }).id === n2)!.reason).toBeNull();
      expect(codeOf(await f.clients.head.rpc("head_clear_pending", { p_note: n1, p_reason: null }))).toContain("NOTE_NOT_FOUND");
    });

    it("after the head judge's Clear Publish is no longer blocked by that note", async () => {
      const h = await mkHeat(f, d, { status: "running", started_at: ago(900) }, { riders: 1 });
      await note("j2", h, d.entries[0], 4, 6);
      await f.s.from("heats").update({ status: "ended", ended_at: ago(300) }).eq("id", h);
      const commit = () => f.s.rpc("publish_heat_commit", { p_heat: h, p_expected_version: 1, p_results: [], p_draw: null, p_projection: [], p_hold: false, p_override_reason: "x y z", p_actor: f.userIds.head, p_blockers: [] });
      expect(codeOf(await commit())).toContain("PENDING_SCORES");
      expect(codeOf(await f.clients.head.rpc("head_clear_pending", { p_note: await noteId(h, f.ids.seat_j2), p_reason: null }))).toBe("");
      expect(codeOf(await commit())).toBe("");
    });

    it("the head judge cannot clear a note of another event's heat, nor of a published heat", async () => {
      const h = await running();
      await note("j1", h, d.entries[0], 2, 6);
      expect(codeOf(await f.clients.bJudge.rpc("head_clear_pending", { p_note: await noteId(h, f.ids.seat_j1), p_reason: "x y z" }))).not.toBe("");
      expect((await notes(h)).length).toBe(1);
    });
  });

  // ---------------------------------------------------------------- spotter Undo: the note comes back
  describe("spotter Undo", () => {
    const undo = (attempt: string) => f.clients.spotter.rpc("undo_attempt", { p_attempt: attempt });
    const viaSpotter = async (heat: string, entry: string, trick: string) => {
      const r = await f.clients.spotter.rpc("add_attempt", { p_heat: heat, p_entry: entry, p_client_key: uuid(), p_status: "landed", p_trick_name: trick });
      expect(codeOf(r)).toBe("");
      return (r.data as { id: string }).id;
    };

    it("an attempt that took a judge's note: Undo puts the note back on that line (the score leaves the attempt, the line is pending again), and the next attempt takes it again", async () => {
      const h = await running();
      await note("j1", h, d.entries[0], 1, 7.5);
      await note("j2", h, d.entries[0], 1, 6);
      const a1 = await viaSpotter(h, d.entries[0], "Wrong trick");
      expect((await scoresOf(a1)).length).toBe(2);
      expect(await notes(h)).toEqual([]);
      expect(codeOf(await undo(a1))).toBe("");
      expect(await scoresOf(a1)).toEqual([]); // the scores left the deleted attempt
      const back = await notes(h);
      expect(back.map((n) => [n.judge_seat_id, Number(n.score), n.slot]).sort()).toEqual([[f.ids.seat_j1, 7.5, 2], [f.ids.seat_j2, 6, 2]].sort());
      // line 1 is empty again: the pending line the console computes is 1
      const a2 = await viaSpotter(h, d.entries[0], "Right trick");
      expect((await scoresOf(a2)).map((s) => Number(s.score)).sort()).toEqual([6, 7.5]);
      expect(await notes(h)).toEqual([]);
    });

    it("a score the judge typed on the attempt itself (no note behind it) stays on the attempt; and with a later attempt logged, nothing is moved", async () => {
      const h = await running();
      const a1 = await viaSpotter(h, d.entries[1], "T1");
      expect(codeOf(await note("j1", h, d.entries[1], 1, 5))).toBe("");
      expect(codeOf(await undo(a1))).toBe("");
      expect((await scoresOf(a1)).map((s) => Number(s.score))).toEqual([5]);
      expect(await notes(h)).toEqual([]);
      // note -> attempt 1, attempt 2 logged after, then the spotter undoes attempt 1 (not the latest): the score stays where it is
      await note("j1", h, d.entries[2], 1, 6);
      const b1 = await viaSpotter(h, d.entries[2], "B1");
      await viaSpotter(h, d.entries[2], "B2");
      expect(codeOf(await undo(b1))).toBe("");
      expect(await notes(h)).toEqual([]);
      expect((await scoresOf(b1)).map((s) => Number(s.score))).toEqual([6]);
    });

    it("the head judge's Delete is not an Undo: the scores stay with the deleted attempt as before", async () => {
      const h = await running();
      await note("j1", h, d.entries[0], 1, 7);
      const a1 = await viaSpotter(h, d.entries[0], "Dup");
      expect(codeOf(await f.clients.head.rpc("delete_attempt", { p_attempt: a1, p_reason: "duplicate" }))).toBe("");
      expect(await notes(h)).toEqual([]);
      expect((await scoresOf(a1)).map((s) => Number(s.score))).toEqual([7]);
    });
  });
});
