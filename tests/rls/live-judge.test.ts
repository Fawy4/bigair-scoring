import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Phase 5b step 3: judges, their sheets and flags. A judge's marks lock at Submit or at review; the head judge can reopen one sheet.
const MODEL = {
  trick: { entry: "single", scale: { min: 0, max: 10, step: 0.1 } },
  panel: { minJudges: 2 },
  heat: { impression: { scale: { min: 0, max: 10, step: 0.5 }, weight: 1, label: "Variety", required: true }, maxAttemptsPerRider: 7 },
};

describe.skipIf(!ENV_OK)("Judges: marks, Submit, reopen, flags (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  let none: LiveDivision; // a model without an impression
  const att = async (heat: string, entry: string, seq: number, status: "landed" | "crashed" = "landed") =>
    (await f.s.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq, status, trick_name: `Trick ${seq}`, client_key: key() }).select("id").single()).data!.id as string;
  const score = (who: "j1" | "j2" | "j3" | "spotter" | "head" | "anon", attempt: string, value = 7, rev = 1, ck = key()) =>
    f.clients[who].rpc("submit_trick_score", { p_attempt: attempt, p_criteria: {}, p_score: value, p_missed: false, p_flag: null, p_client_key: ck, p_client_rev: rev });
  const imp = (who: "j1" | "j2" | "j3", heat: string, entry: string, value = 6.5, rev = 1) => f.clients[who].rpc("submit_impression", { p_heat: heat, p_entry: entry, p_value: value, p_client_key: key(), p_client_rev: rev });
  const rows = async (table: string, heat: string) => (await f.s.from(table).select("*").eq("heat_id", heat)).data ?? [];

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "JudgeDiv", seats: ["j1", "j2"], model: MODEL });
    none = await mkDivision(f, { name: "NoImpression", seats: ["j1", "j2"], model: { trick: { entry: "single", scale: { min: 0, max: 10, step: 0.1 } }, panel: { minJudges: 2 }, heat: {} } });
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("a judge cannot read another judge's scores; the head judge and the organiser can", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(60) });
    const a = await att(h, d.entries[0], 1);
    expect(codeOf(await score("j1", a, 7.5))).toBe("");
    expect(codeOf(await score("j2", a, 6.0))).toBe("");
    const mine = (await f.clients.j1.from("trick_scores").select("score, judge_seat_id").eq("attempt_id", a)).data ?? [];
    expect(mine).toHaveLength(1);
    expect(mine[0].judge_seat_id).toBe(f.ids.seat_j1);
    expect(((await f.clients.head.from("trick_scores").select("score").eq("attempt_id", a)).data ?? []).length).toBe(2);
    expect(((await f.clients.orgA.from("trick_scores").select("score").eq("attempt_id", a)).data ?? []).length).toBe(2);
    expect(((await f.clients.orgB.from("trick_scores").select("score").eq("attempt_id", a)).data ?? []).length).toBe(0);
  });

  it("a judge off the panel, a spotter and a visitor are refused", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(60) });
    const a = await att(h, d.entries[0], 1);
    expect(codeOf(await score("j3", a))).toContain("NOT_ALLOWED");
    expect(codeOf(await score("spotter", a))).toContain("NOT_ALLOWED");
    expect(codeOf(await score("anon", a))).not.toBe("");
    expect(await rows("trick_scores", h)).toHaveLength(0);
  });

  it("judges never score a crash: the database refuses it", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(60) });
    const crash = await att(h, d.entries[0], 1, "crashed");
    expect(codeOf(await score("j1", crash))).toContain("NOT_SCORABLE");
    expect(await rows("trick_scores", h)).toHaveLength(0);
  });

  it("sending the same score again changes nothing; an older edit arriving late is ignored; a newer one wins", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(60) });
    const a = await att(h, d.entries[0], 1);
    const ck = key();
    expect(codeOf(await score("j1", a, 7.0, 100, ck))).toBe("");
    expect(codeOf(await score("j1", a, 7.0, 100, ck))).toBe(""); // a retry whose answer was lost
    let r = await rows("trick_scores", h);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ score: 7, version: 1 });
    await score("j1", a, 8.0, 300);
    await score("j1", a, 6.0, 200); // older edit, late
    r = await rows("trick_scores", h);
    expect(r).toHaveLength(1);
    expect(Number(r[0].score)).toBe(8);
  });

  it("Missed is an answer: no score, and it does not block anything", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(60) });
    const a = await att(h, d.entries[0], 1);
    const r = await f.clients.j1.rpc("submit_trick_score", { p_attempt: a, p_criteria: {}, p_score: null, p_missed: true, p_flag: null, p_client_key: key(), p_client_rev: 1 });
    expect(codeOf(r)).toBe("");
    expect((await rows("trick_scores", h))[0]).toMatchObject({ missed: true, score: null });
  });

  it("an Impression / Variety score is not accepted while the heat is running", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(60) });
    expect(codeOf(await imp("j1", h, d.entries[0]))).toContain("IMPRESSION_NOT_OPEN");
  });

  it("an ended heat takes marks from anyone who has not submitted: there is no grace period any more, only the lock", async () => {
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(7200), ended_at: ago(6600) });
    const a = await att(h, d.entries[0], 1);
    expect(codeOf(await score("j1", a, 7.5))).toBe(""); // an hour and a half after the end
    expect(codeOf(await imp("j1", h, d.entries[0]))).toBe("");
  });

  it("Submit is refused while a riding rider has no Impression / Variety score from this judge, and a rider who did not start does not need one", async () => {
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) });
    await f.s.from("heat_slots").update({ modifier: "DNS" }).eq("heat_id", h).eq("entry_id", d.entries[2]);
    expect(codeOf(await f.clients.j1.rpc("submit_sheet", { p_heat: h }))).toMatch(/IMPRESSION_MISSING: 2/);
    await imp("j1", h, d.entries[0]);
    expect(codeOf(await f.clients.j1.rpc("submit_sheet", { p_heat: h }))).toMatch(/IMPRESSION_MISSING: 1/);
    await imp("j1", h, d.entries[1]);
    const ok = await f.clients.j1.rpc("submit_sheet", { p_heat: h });
    expect(codeOf(ok)).toBe("");
    expect((ok.data as { submitted_at: string }).submitted_at).toBeTruthy();
  });

  it("a model without an impression needs none: Submit works at once; a heat that is still running cannot be submitted", async () => {
    const h = await mkHeat(f, none, { status: "ended", started_at: ago(900), ended_at: ago(300) });
    expect(codeOf(await f.clients.j2.rpc("submit_sheet", { p_heat: h }))).toBe("");
    const live = await mkHeat(f, none, { status: "running", started_at: ago(30) });
    expect(codeOf(await f.clients.j2.rpc("submit_sheet", { p_heat: live }))).toContain("IMPRESSION_NOT_OPEN");
  });

  it("after Submit the judge's marks are locked (SHEET_LOCKED); the other judge is not affected; pressing Submit twice is harmless", async () => {
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) }, { riders: 2 });
    const a = await att(h, d.entries[0], 1);
    for (const e of d.entries.slice(0, 2)) await imp("j1", h, e);
    expect(codeOf(await score("j1", a, 7))).toBe("");
    const first = await f.clients.j1.rpc("submit_sheet", { p_heat: h });
    expect(codeOf(first)).toBe("");
    expect(codeOf(await f.clients.j1.rpc("submit_sheet", { p_heat: h }))).toBe("");
    expect((await rows("judge_sheets", h))).toHaveLength(1);
    expect(codeOf(await score("j1", a, 9, 999))).toContain("SHEET_LOCKED");
    expect(codeOf(await imp("j1", h, d.entries[0], 9, 999))).toContain("SHEET_LOCKED");
    expect(codeOf(await score("j2", a, 6))).toBe("");
    // the table itself cannot be written around the functions
    const direct = await f.clients.j1.from("trick_scores").update({ score: 9.9 }).eq("attempt_id", a).select("score");
    expect(Number((direct.data ?? [])[0]?.score ?? 7)).toBe(7);
  });

  it("the head judge reopens one judge's sheet with a reason; nobody else can; the judge can write again and Submit locks it once more", async () => {
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) }, { riders: 1 });
    const a = await att(h, d.entries[0], 1);
    await imp("j1", h, d.entries[0]);
    await f.clients.j1.rpc("submit_sheet", { p_heat: h });
    expect(codeOf(await f.clients.j1.rpc("reopen_sheet", { p_heat: h, p_seat: f.ids.seat_j1, p_reason: "let me fix it" }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.spotter.rpc("reopen_sheet", { p_heat: h, p_seat: f.ids.seat_j1, p_reason: "x y z" }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.head.rpc("reopen_sheet", { p_heat: h, p_seat: f.ids.seat_j1, p_reason: " " }))).toContain("REASON_REQUIRED");
    expect(codeOf(await f.clients.head.rpc("reopen_sheet", { p_heat: h, p_seat: f.ids.seat_j1, p_reason: "paper sheet differs" }))).toBe("");
    expect(codeOf(await score("j1", a, 8.5, 50))).toBe("");
    expect(codeOf(await f.clients.j1.rpc("submit_sheet", { p_heat: h }))).toBe("");
    expect(codeOf(await score("j1", a, 9.5, 60))).toContain("SHEET_LOCKED");
    const lines = (await f.s.from("audit_log").select("action, reason").eq("action", "sheet_reopened").eq("event_id", f.ids.evA1)).data ?? [];
    expect(lines.some((l) => l.reason === "paper sheet differs")).toBe(true);
  });

  it("once the head judge moves the heat to review, a judge's marks lock, unless that sheet was reopened", async () => {
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) }, { riders: 1 });
    const a = await att(h, d.entries[0], 1);
    expect(codeOf(await score("j2", a, 6.5, 1))).toBe("");
    await f.s.from("heats").update({ status: "under_review" }).eq("id", h);
    expect(codeOf(await score("j2", a, 9, 2))).toContain("SHEET_LOCKED");
    expect(codeOf(await f.clients.head.rpc("reopen_sheet", { p_heat: h, p_seat: f.ids.seat_j2, p_reason: "late score" }))).toBe("");
    expect(codeOf(await score("j2", a, 9, 3))).toBe("");
    expect(codeOf(await score("j1", a, 9, 3))).toContain("SHEET_LOCKED"); // j1's sheet was never reopened
    await f.s.from("heats").update({ status: "published", published_at: new Date().toISOString() }).eq("id", h);
    expect(codeOf(await score("j1", a, 9.5, 4))).toContain("SHEET_LOCKED"); // published: still locked for a sheet nobody reopened
  });

  describe("flags", () => {
    it("a judge flags a crash on a landed attempt and a landing on a crashed one; the wrong way round is refused; a retry of the same tap is one flag", async () => {
      const h = await mkHeat(f, d, { status: "running", started_at: ago(60) });
      const landed = await att(h, d.entries[0], 1);
      const crashed = await att(h, d.entries[0], 2, "crashed");
      const ck = key();
      expect(codeOf(await f.clients.j1.rpc("submit_flag", { p_attempt: landed, p_kind: "crash", p_note: null, p_client_key: ck }))).toBe("");
      expect(codeOf(await f.clients.j1.rpc("submit_flag", { p_attempt: landed, p_kind: "crash", p_note: null, p_client_key: ck }))).toBe("");
      expect(codeOf(await f.clients.j1.rpc("submit_flag", { p_attempt: landed, p_kind: "landed", p_note: null, p_client_key: key() }))).toContain("FLAG_NOT_APPLICABLE");
      expect(codeOf(await f.clients.j1.rpc("submit_flag", { p_attempt: crashed, p_kind: "crash", p_note: null, p_client_key: key() }))).toContain("FLAG_NOT_APPLICABLE");
      expect(codeOf(await f.clients.j1.rpc("submit_flag", { p_attempt: crashed, p_kind: "landed", p_note: "I saw it land", p_client_key: key() }))).toBe("");
      expect(codeOf(await f.clients.j1.rpc("submit_flag", { p_attempt: landed, p_kind: "other", p_note: null, p_client_key: key() }))).toBe("");
      expect((await rows("attempt_flags", h)).length).toBe(3);
    });

    it("flags are readable by their author, the head judge and the organiser; not by another judge, an announcer or another organisation", async () => {
      const h = await mkHeat(f, d, { status: "running", started_at: ago(60) });
      const crashed = await att(h, d.entries[0], 1, "crashed");
      await f.clients.j1.rpc("submit_flag", { p_attempt: crashed, p_kind: "landed", p_note: null, p_client_key: key() });
      const seen = async (who: "j1" | "j2" | "head" | "orgA" | "orgB" | "announcer" | "spotter") => ((await f.clients[who].from("attempt_flags").select("id").eq("heat_id", h)).data ?? []).length;
      expect(await seen("j1")).toBe(1);
      expect(await seen("head")).toBe(1);
      expect(await seen("orgA")).toBe(1);
      expect(await seen("j2")).toBe(0);
      expect(await seen("announcer")).toBe(0);
      expect(await seen("spotter")).toBe(0);
      expect(await seen("orgB")).toBe(0);
    });

    it("an off-panel judge and a visitor cannot flag; a locked sheet cannot flag; the tables cannot be written around the functions", async () => {
      const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) }, { riders: 1 });
      const a = await att(h, d.entries[0], 1, "crashed");
      expect(codeOf(await f.clients.j3.rpc("submit_flag", { p_attempt: a, p_kind: "landed", p_note: null, p_client_key: key() }))).toContain("NOT_ALLOWED");
      expect(codeOf(await f.clients.anon.rpc("submit_flag", { p_attempt: a, p_kind: "landed", p_note: null, p_client_key: key() }))).not.toBe("");
      await imp("j1", h, d.entries[0]);
      await f.clients.j1.rpc("submit_sheet", { p_heat: h });
      expect(codeOf(await f.clients.j1.rpc("submit_flag", { p_attempt: a, p_kind: "landed", p_note: null, p_client_key: key() }))).toContain("SHEET_LOCKED");
      const direct = await f.clients.j1.from("attempt_flags").insert({ event_id: f.ids.evA1, heat_id: h, attempt_id: a, judge_seat_id: f.ids.seat_j1, kind: "other", client_key: key() });
      expect(codeOf(direct)).not.toBe("");
      const sheet = await f.clients.j1.from("judge_sheets").insert({ event_id: f.ids.evA1, heat_id: h, judge_seat_id: f.ids.seat_j2, submitted_at: new Date().toISOString() });
      expect(codeOf(sheet)).not.toBe("");
    });
  });
});
