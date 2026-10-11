import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, signedIn, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Rider sheets: (1) the spotter's seat corrects the attempts it logged until the heat is published, with an audit line in words, and everybody else is refused;
// (2) Missed on a line the spotter has not logged yet becomes "no score from that judge" on the attempt that takes the line.
const MODEL = { trick: { entry: "single", scale: { min: 0, max: 10, step: 0.1 } }, panel: { minJudges: 2 }, heat: { maxAttemptsPerRider: 7 } };

describe.skipIf(!ENV_OK)("Rider sheets: spotter corrections and Missed notes (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  let obs: SupabaseClient;
  let spotter2: SupabaseClient;
  let bSpotter: SupabaseClient;
  const users: string[] = [];
  const password = `Pw-${randomBytes(12).toString("hex")}`;

  const seatUser = async (label: string, event: string, role: "spotter" | "observer"): Promise<SupabaseClient> => {
    const email = `rls-sp-${label}-${randomBytes(4).toString("hex")}@example.com`;
    const { data, error } = await f.s.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    const seat = await f.s.from("judge_seats").insert({ event_id: event, name: `Sheet ${label}`, role, scores: false, auth_user_id: data.user.id, status: "active", active: true });
    if (seat.error) throw new Error(seat.error.message);
    return signedIn(email, password);
  };
  const running = (riders = 3) => mkHeat(f, d, { status: "running", started_at: ago(60) }, { riders });
  // the spotter logs through the same function the phone uses
  const log = async (who: SupabaseClient, heat: string, entry: string, over: Record<string, unknown> = {}) => {
    const k = key();
    const r = await who.rpc("add_attempt", { p_heat: heat, p_entry: entry, p_client_key: k, p_status: "landed", p_trick_name: "Backroll", p_direction: "left", p_category_key: "loop", ...over });
    if (r.error) throw new Error(r.error.message);
    return { k, id: (r.data as { id: string }).id };
  };
  const edit = (who: SupabaseClient, k: string, args: Record<string, unknown>) => who.rpc("spotter_edit_attempt", { p_client_key: k, ...args });
  const row = async (id: string) => (await f.s.from("trick_attempts").select("trick_name, direction, status, category_key, trick_parts, seq").eq("id", id).single()).data!;
  const audit = async (id: string) => (await f.s.from("audit_log").select("action, before, after").eq("row_id", id).eq("action", "attempt_edited_by_spotter")).data ?? [];

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "SpotSheet", seats: ["j1", "j2"], model: MODEL });
    obs = await seatUser("observer", f.ids.evA1, "observer");
    spotter2 = await seatUser("spotter2", f.ids.evA1, "spotter");
    bSpotter = await seatUser("bspotter", f.ids.evB1, "spotter");
  });
  afterAll(async () => {
    if (!f) return;
    await f.cleanup();
    for (const id of users) await f.s.auth.admin.deleteUser(id).catch(() => undefined);
  });

  it("the spotter changes the trick, the direction and the crash of an attempt it logged, and it is the same attempt every time", async () => {
    const h = await running();
    const a = await log(f.clients.spotter, h, d.entries[0]);
    expect(codeOf(await edit(f.clients.spotter, a.k, { p_set_trick: true, p_trick_name: "Right Frontroll", p_trick_parts: { direction: "right", items: [{ id: "base:frontroll" }] }, p_category: "loop", p_direction: "right" }))).toBe("");
    expect(await row(a.id)).toMatchObject({ trick_name: "Right Frontroll", direction: "right", status: "landed", seq: 1 });
    expect(codeOf(await edit(f.clients.spotter, a.k, { p_status: "crashed" }))).toBe("");
    expect(await row(a.id)).toMatchObject({ trick_name: "Right Frontroll", status: "crashed" }); // the typed trick is kept on a crash
    expect(codeOf(await edit(f.clients.spotter, a.k, { p_status: "landed" }))).toBe("");
    expect(await row(a.id)).toMatchObject({ status: "landed" });
    const all = (await f.s.from("trick_attempts").select("id").eq("heat_id", h).eq("entry_id", d.entries[0])).data ?? [];
    expect(all).toHaveLength(1); // never a second attempt
  });

  it("the judges' scores stay on the attempt when it is corrected, also when it becomes a crash", async () => {
    const h = await running();
    const a = await log(f.clients.spotter, h, d.entries[0]);
    expect(codeOf(await f.clients.j1.rpc("submit_trick_score", { p_attempt: a.id, p_criteria: {}, p_score: 7.5, p_missed: false, p_flag: null, p_client_key: key(), p_client_rev: 1 }))).toBe("");
    await edit(f.clients.spotter, a.k, { p_set_trick: true, p_trick_name: "Megaloop", p_trick_parts: { direction: null, items: [] }, p_category: null });
    await edit(f.clients.spotter, a.k, { p_status: "crashed" });
    const scores = (await f.s.from("trick_scores").select("score, judge_seat_id").eq("attempt_id", a.id)).data ?? [];
    expect(scores.map((s) => Number(s.score))).toEqual([7.5]);
  });

  it("every change leaves an audit line with the attempt before and after; a repeat that changes nothing leaves none", async () => {
    const h = await running();
    const a = await log(f.clients.spotter, h, d.entries[0]);
    await edit(f.clients.spotter, a.k, { p_set_trick: true, p_trick_name: "Frontroll", p_trick_parts: { direction: null, items: [] }, p_category: "loop", p_direction: "right" });
    const lines = await audit(a.id);
    expect(lines).toHaveLength(1);
    expect((lines[0].before as { trick_name: string }).trick_name).toBe("Backroll");
    expect((lines[0].after as { trick_name: string; direction: string }).trick_name).toBe("Frontroll");
    expect((lines[0].after as { direction: string }).direction).toBe("right");
    await edit(f.clients.spotter, a.k, { p_direction: "right" });
    expect(await audit(a.id)).toHaveLength(1);
  });

  it("refused: a judge (even one allowed to log), the head judge, an observer, another spotter, another event's spotter, the organiser of another organisation and a visitor", async () => {
    const h = await running();
    const a = await log(f.clients.spotter, h, d.entries[0]);
    const before = await row(a.id);
    for (const [who, c] of [
      ["judge", f.clients.j1],
      ["off-panel judge", f.clients.j3],
      ["head", f.clients.head],
      ["observer", obs],
      ["second spotter", spotter2],
      ["another event's spotter", bSpotter],
      ["another event's judge", f.clients.bJudge],
      ["another organisation", f.clients.orgB],
      ["announcer", f.clients.announcer],
      ["visitor", f.clients.anon],
    ] as const) {
      expect(codeOf(await edit(c, a.k, { p_status: "crashed", p_direction: "right" })), who).not.toBe("");
    }
    expect(codeOf(await edit(spotter2, a.k, { p_status: "crashed" }))).toContain("NOT_ALLOWED");
    expect(codeOf(await edit(f.clients.j1, a.k, { p_status: "crashed" }))).toContain("NOT_ALLOWED");
    expect(await row(a.id)).toEqual(before);
    expect(await audit(a.id)).toHaveLength(0);
  });

  it("a spotter cannot touch an attempt another seat logged (the head judge's, a second spotter's)", async () => {
    const h = await running();
    const byHead = await log(f.clients.head, h, d.entries[0]);
    const bySecond = await log(spotter2, h, d.entries[1]);
    expect(codeOf(await edit(f.clients.spotter, byHead.k, { p_status: "crashed" }))).toContain("NOT_ALLOWED");
    expect(codeOf(await edit(f.clients.spotter, bySecond.k, { p_status: "crashed" }))).toContain("NOT_ALLOWED");
    expect(codeOf(await edit(spotter2, bySecond.k, { p_status: "crashed" }))).toBe("");
  });

  it("allowed until the heat is published, refused after; a deleted or unknown attempt is not found; bad values are named", async () => {
    const h = await running();
    const a = await log(f.clients.spotter, h, d.entries[0]);
    await f.s.from("heats").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", h);
    expect(codeOf(await edit(f.clients.spotter, a.k, { p_direction: "right" }))).toBe(""); // ended: still allowed (the head judge reviews after)
    await f.s.from("heats").update({ status: "published" }).eq("id", h);
    expect(codeOf(await edit(f.clients.spotter, a.k, { p_direction: "left" }))).toContain("HEAT_PUBLISHED");
    expect(codeOf(await edit(f.clients.spotter, key(), { p_direction: "left" }))).toContain("ATTEMPT_NOT_FOUND");
    const h2 = await running();
    const b = await log(f.clients.spotter, h2, d.entries[0]);
    expect(codeOf(await edit(f.clients.spotter, b.k, { p_status: "flying" }))).toContain("BAD_STATUS");
    expect(codeOf(await edit(f.clients.spotter, b.k, { p_direction: "up" }))).toContain("BAD_DIRECTION");
    await f.clients.spotter.rpc("undo_attempt", { p_attempt: b.id });
    expect(codeOf(await edit(f.clients.spotter, b.k, { p_direction: "left" }))).toContain("ATTEMPT_NOT_FOUND");
  });

  it("the table cannot be written around the function: a spotter's direct update is refused", async () => {
    const h = await running();
    const a = await log(f.clients.spotter, h, d.entries[0]);
    await f.clients.spotter.from("trick_attempts").update({ trick_name: "Hacked" }).eq("id", a.id);
    expect((await row(a.id)).trick_name).toBe("Backroll");
  });

  // ---------------------------------------------------------------- Missed on a line the spotter has not logged
  const missed = (who: "j1" | "j2" | "j3" | "spotter" | "head" | "anon", heat: string, entry: string, line: number, rev = 1) =>
    f.clients[who].rpc("set_line_missed", { p_heat: heat, p_entry: entry, p_line: line, p_client_key: key(), p_client_rev: rev });
  const note = (heat: string, entry: string, line: number, value: number, rev = 1) =>
    f.clients.j1.rpc("set_line_score", { p_heat: heat, p_entry: entry, p_line: line, p_score: value, p_client_key: key(), p_client_rev: rev });
  const notes = async (heat: string) => (await f.s.from("pending_scores").select("slot, score, missed, judge_seat_id").eq("heat_id", heat).order("slot")).data ?? [];
  const scoresOf = async (attempt: string) => (await f.s.from("trick_scores").select("judge_seat_id, score, missed").eq("attempt_id", attempt)).data ?? [];

  it("Missed on an empty line is a note; the attempt that takes the line gets 'Missed' from that judge, and the other judge's score is untouched", async () => {
    const h = await running();
    await note(h, d.entries[0], 1, 7);
    expect(codeOf(await missed("j1", h, d.entries[0], 2))).toBe("");
    expect(codeOf(await f.clients.j2.rpc("set_line_score", { p_heat: h, p_entry: d.entries[0], p_line: 2, p_score: 6, p_client_key: key(), p_client_rev: 1 }))).toBe("");
    expect((await notes(h)).map((n) => n.missed)).toEqual([false, true, false]);
    const a1 = await log(f.clients.spotter, h, d.entries[0]);
    const a2 = await log(f.clients.spotter, h, d.entries[0]);
    expect(await scoresOf(a1.id)).toEqual([{ judge_seat_id: f.ids.seat_j1, score: 7, missed: false }]);
    const two = await scoresOf(a2.id);
    expect(two).toHaveLength(2);
    expect(two.find((s) => s.judge_seat_id === f.ids.seat_j1)).toMatchObject({ score: null, missed: true });
    expect(two.find((s) => s.judge_seat_id === f.ids.seat_j2)).toMatchObject({ score: 6, missed: false });
    expect(await notes(h)).toHaveLength(0);
  });

  it("typing a score over a Missed note (and Missed over a score) replaces it, newest edit wins", async () => {
    const h = await running();
    await missed("j1", h, d.entries[0], 1, 5);
    await note(h, d.entries[0], 1, 8, 6);
    expect((await notes(h))[0]).toMatchObject({ missed: false, score: 8 });
    await missed("j1", h, d.entries[0], 1, 7);
    expect((await notes(h))[0]).toMatchObject({ missed: true });
    await note(h, d.entries[0], 1, 4, 3); // late and older: ignored
    expect((await notes(h))[0]).toMatchObject({ missed: true });
  });

  it("Missed on a line that already has its attempt is the Queue's Missed; a crash line takes none; a crash discards a Missed note", async () => {
    const h = await running();
    const a = await log(f.clients.spotter, h, d.entries[0]);
    expect(codeOf(await missed("j1", h, d.entries[0], 1))).toBe("");
    expect(await scoresOf(a.id)).toEqual([{ judge_seat_id: f.ids.seat_j1, score: null, missed: true }]);
    const c = await log(f.clients.spotter, h, d.entries[0], { p_status: "crashed" });
    expect(codeOf(await missed("j1", h, d.entries[0], 2))).toContain("NOT_SCORABLE");
    await missed("j1", h, d.entries[0], 3);
    await log(f.clients.spotter, h, d.entries[0], { p_status: "crashed" });
    expect(await notes(h)).toHaveLength(0);
    expect(await scoresOf(c.id)).toEqual([]);
  });

  it("who may mark Missed, and where: a judge of the panel only, within the cap, with a running heat", async () => {
    const h = await running();
    expect(codeOf(await missed("j3", h, d.entries[0], 1))).toContain("NOT_ALLOWED");
    expect(codeOf(await missed("spotter", h, d.entries[0], 1))).toContain("NOT_ALLOWED");
    expect(codeOf(await missed("anon", h, d.entries[0], 1))).not.toBe("");
    expect(codeOf(await missed("j1", h, d.entries[0], 8))).toContain("LINE_PAST_CAP");
    expect(codeOf(await missed("j1", h, d.entries[0], 0))).toContain("LINE_PAST_CAP");
    const scheduled = await mkHeat(f, d, { status: "scheduled" });
    expect(codeOf(await missed("j1", scheduled, d.entries[0], 1))).toContain("HEAT_NOT_RUNNING");
    expect(await notes(h)).toHaveLength(0);
  });

  it("a Missed note holds back Submit and Publish exactly like a score note, and clearing it frees them", async () => {
    const h = await running();
    await missed("j1", h, d.entries[0], 2);
    await f.s.from("heats").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", h);
    expect(codeOf(await f.clients.j1.rpc("submit_sheet", { p_heat: h }))).toContain("PENDING_NOTES");
    expect(codeOf(await f.clients.j1.rpc("clear_line_score", { p_heat: h, p_entry: d.entries[0], p_line: 2 }))).toBe("");
    expect(await notes(h)).toHaveLength(0);
  });

  it("a note of either kind is read by its judge and the head judge only", async () => {
    const h = await running();
    await missed("j1", h, d.entries[0], 1);
    const seen = async (c: SupabaseClient) => ((await c.from("pending_scores").select("missed").eq("heat_id", h)).data ?? []).length;
    expect(await seen(f.clients.j1)).toBe(1);
    expect(await seen(f.clients.head)).toBe(1);
    for (const c of [f.clients.j2, f.clients.spotter, f.clients.anon, f.clients.bJudge]) expect(await seen(c)).toBe(0);
  });
});
