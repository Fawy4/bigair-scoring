import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Phase 5c step 4: what the head judge (or an organiser) may change, and who may not. Every change asks for a reason and writes an audit line.
const MODEL = {
  trick: { entry: "single", scale: { min: 0, max: 10, step: 0.1 } },
  panel: { minJudges: 2 },
  heat: { impression: { scale: { min: 0, max: 10, step: 0.5 }, weight: 1, label: "Variety", required: true }, maxAttemptsPerRider: 2 },
};

describe.skipIf(!ENV_OK)("Head judge functions (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  const att = async (heat: string, entry: string, seq: number, status: "landed" | "crashed" = "landed", extra: object = {}) =>
    (await f.s.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq, status, trick_name: `Trick ${seq}`, client_key: key(), ...extra }).select("id").single()).data!.id as string;
  const score = (who: "j1" | "j2", attempt: string, value: number, rev = 1) =>
    f.clients[who].rpc("submit_trick_score", { p_attempt: attempt, p_criteria: {}, p_score: value, p_missed: false, p_flag: null, p_client_key: key(), p_client_rev: rev });
  const audit = async (event: string, action: string) => (await f.s.from("audit_log").select("action, actor_user_id, before, after, reason").eq("event_id", event).eq("action", action).order("at")).data ?? [];
  const scoreRow = async (attempt: string, seat: string) => (await f.s.from("trick_scores").select("*").eq("attempt_id", attempt).eq("judge_seat_id", seat).maybeSingle()).data;
  const ended = () => mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) }, { riders: 3 });

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "HeadDiv", seats: ["j1", "j2"], model: MODEL });
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  // ---------------------------------------------------------------- who may
  it("every head function is refused for a judge, a spotter, an announcer and another organisation's organiser", async () => {
    const h = await ended();
    const a = await att(h, d.entries[0], 1);
    const b = await att(h, d.entries[0], 2);
    const calls = (who: "j1" | "spotter" | "announcer" | "orgB") => {
      const c = f.clients[who];
      return [
        c.rpc("review_heat", { p_heat: h, p_override_reason: "x y z" }),
        c.rpc("head_set_trick_score", { p_attempt: a, p_seat: f.ids.seat_j1, p_score: 7, p_criteria: {}, p_missed: false, p_reason: "paper sheet" }),
        c.rpc("head_set_impression", { p_heat: h, p_entry: d.entries[0], p_seat: f.ids.seat_j1, p_value: 7, p_reason: "paper sheet" }),
        c.rpc("edit_attempt", { p_attempt: a, p_reason: "wrong trick", p_trick_name: "Other" }),
        c.rpc("merge_attempts", { p_keep: a, p_drop: b, p_choices: {}, p_reason: "same trick" }),
        c.rpc("set_rider_status", { p_heat: h, p_entry: d.entries[0], p_modifier: "DNS", p_reason: "not here" }),
        c.rpc("add_penalty", { p_heat: h, p_entry: d.entries[0], p_type: "INT", p_reason: "blocked a rider" }),
        c.rpc("flag_out", { p_heat: h, p_entries: [d.entries[0]], p_reason: "flag out" }),
        c.rpc("decide_tie", { p_heat: h, p_rider_ids: [d.entries[0], d.entries[1]], p_reason: "judges agree" }),
        c.rpc("reopen_heat", { p_heat: h, p_reason: "fix a score" }),
      ];
    };
    for (const who of ["j1", "spotter", "announcer", "orgB"] as const) {
      for (const r of await Promise.all(calls(who))) expect(codeOf(await r)).toContain("NOT_ALLOWED");
    }
    expect(await audit(f.ids.evA1, "score_edited")).toHaveLength(0);
  });

  it("a reason is required where the plan says so", async () => {
    const h = await ended();
    const a = await att(h, d.entries[0], 1);
    const b = await att(h, d.entries[0], 2);
    const c = f.clients.head;
    const blank = " ";
    for (const r of [
      await c.rpc("head_set_trick_score", { p_attempt: a, p_seat: f.ids.seat_j1, p_score: 7, p_criteria: {}, p_missed: false, p_reason: blank }),
      await c.rpc("head_set_impression", { p_heat: h, p_entry: d.entries[0], p_seat: f.ids.seat_j1, p_value: 7, p_reason: blank }),
      await c.rpc("edit_attempt", { p_attempt: a, p_reason: blank, p_trick_name: "x" }),
      await c.rpc("merge_attempts", { p_keep: a, p_drop: b, p_choices: {}, p_reason: blank }),
      await c.rpc("set_rider_status", { p_heat: h, p_entry: d.entries[0], p_modifier: "DNS", p_reason: blank }),
      await c.rpc("add_penalty", { p_heat: h, p_entry: d.entries[0], p_type: "INT", p_reason: blank }),
      await c.rpc("decide_tie", { p_heat: h, p_rider_ids: [d.entries[0], d.entries[1]], p_reason: blank }),
      await c.rpc("reopen_heat", { p_heat: h, p_reason: blank }),
    ]) expect(codeOf(r)).toContain("REASON_REQUIRED");
    expect((await f.s.from("trick_attempts").select("deleted_at, trick_name").eq("id", b).single()).data).toMatchObject({ deleted_at: null });
  });

  // ---------------------------------------------------------------- scores
  it("the head judge edits a score with a reason: the old and the new value are in the audit log, and a late older edit from the judge does not undo it", async () => {
    const h = await ended();
    const a = await att(h, d.entries[0], 1);
    await score("j1", a, 7.5, 100);
    const r = await f.clients.head.rpc("head_set_trick_score", { p_attempt: a, p_seat: f.ids.seat_j1, p_score: 8.0, p_criteria: {}, p_missed: false, p_reason: "paper sheet" });
    expect(codeOf(r)).toBe("");
    const row = await scoreRow(a, f.ids.seat_j1);
    expect(Number(row!.score)).toBe(8);
    expect(row!.version).toBe(2);
    expect(row!.edit_reason).toBe("paper sheet");
    expect(row!.edited_by).toBe(f.userIds.head);
    const lines = (await audit(f.ids.evA1, "score_edited")).filter((l) => (l.after as { attempt_id?: string }).attempt_id === a);
    expect(lines).toHaveLength(1);
    expect(Number((lines[0].before as { score: number }).score)).toBe(7.5);
    expect(Number((lines[0].after as { score: number }).score)).toBe(8);
    expect(lines[0].reason).toBe("paper sheet");
    expect(lines[0].actor_user_id).toBe(f.userIds.head);
    await score("j1", a, 6.0, 900); // the judge's phone sends an older edit late
    expect(Number((await scoreRow(a, f.ids.seat_j1))!.score)).toBe(8);
  });

  it("the head judge can write a score a judge never gave, mark a judge absent for one attempt (Missed, reason Absent), and an organiser can too", async () => {
    const h = await ended();
    const a = await att(h, d.entries[0], 1);
    expect(codeOf(await f.clients.head.rpc("head_set_trick_score", { p_attempt: a, p_seat: f.ids.seat_j2, p_score: 6.5, p_criteria: {}, p_missed: false, p_reason: "paper sheet" }))).toBe("");
    expect(Number((await scoreRow(a, f.ids.seat_j2))!.score)).toBe(6.5);
    expect(codeOf(await f.clients.orgA.rpc("head_set_trick_score", { p_attempt: a, p_seat: f.ids.seat_j1, p_score: null, p_criteria: {}, p_missed: true, p_reason: "Absent" }))).toBe("");
    expect(await scoreRow(a, f.ids.seat_j1)).toMatchObject({ missed: true, score: null, edit_reason: "Absent" });
  });

  it("a seat that is not on the panel, a crashed attempt and a published heat are refused", async () => {
    const h = await ended();
    const a = await att(h, d.entries[0], 1);
    const crash = await att(h, d.entries[0], 2, "crashed");
    expect(codeOf(await f.clients.head.rpc("head_set_trick_score", { p_attempt: a, p_seat: f.ids.seat_j3, p_score: 7, p_criteria: {}, p_missed: false, p_reason: "paper sheet" }))).toContain("NOT_ON_PANEL");
    expect(codeOf(await f.clients.head.rpc("head_set_trick_score", { p_attempt: crash, p_seat: f.ids.seat_j1, p_score: 7, p_criteria: {}, p_missed: false, p_reason: "paper sheet" }))).toContain("NOT_SCORABLE");
    const pub = await mkHeat(f, d, { status: "published", started_at: ago(900), ended_at: ago(300), published_at: ago(100) }, { riders: 2 });
    const pa = await att(pub, d.entries[0], 1);
    expect(codeOf(await f.clients.head.rpc("head_set_trick_score", { p_attempt: pa, p_seat: f.ids.seat_j1, p_score: 7, p_criteria: {}, p_missed: false, p_reason: "paper sheet" }))).toContain("HEAT_PUBLISHED");
  });

  it("the head judge types an Impression / Variety score from a paper sheet: it is audited and a judge's late older edit does not undo it", async () => {
    const h = await ended();
    expect(codeOf(await f.clients.head.rpc("head_set_impression", { p_heat: h, p_entry: d.entries[0], p_seat: f.ids.seat_j1, p_value: 7.5, p_reason: "paper sheet" }))).toBe("");
    const rows = (await f.s.from("impression_scores").select("value").eq("heat_id", h).eq("judge_seat_id", f.ids.seat_j1)).data ?? [];
    expect(rows.map((r) => Number(r.value))).toEqual([7.5]);
    await f.clients.j1.rpc("submit_impression", { p_heat: h, p_entry: d.entries[0], p_value: 3, p_client_key: key(), p_client_rev: 900 });
    expect(Number(((await f.s.from("impression_scores").select("value").eq("heat_id", h).eq("judge_seat_id", f.ids.seat_j1)).data ?? [])[0].value)).toBe(7.5);
    const lines = (await audit(f.ids.evA1, "impression_set")).filter((l) => l.reason === "paper sheet");
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------- attempts
  it("Edit: rider, trick and landed / crashed; moving to another rider takes that rider's next attempt number; every edit is audited with its reason", async () => {
    const h = await ended();
    const a = await att(h, d.entries[0], 1);
    await att(h, d.entries[1], 1);
    const r = await f.clients.head.rpc("edit_attempt", { p_attempt: a, p_reason: "wrong rider", p_entry: d.entries[1], p_trick_name: "Backroll", p_trick_parts: { items: [] }, p_category: "rotation", p_direction: "right" });
    expect(codeOf(r)).toBe("");
    const row = (await f.s.from("trick_attempts").select("entry_id, seq, trick_name, category_key, direction").eq("id", a).single()).data!;
    expect(row).toMatchObject({ entry_id: d.entries[1], seq: 2, trick_name: "Backroll", category_key: "rotation", direction: "right" });
    expect((await audit(f.ids.evA1, "attempt_edited")).some((l) => l.reason === "wrong rider")).toBe(true);
  });

  it("moving an attempt to a rider who is out of attempts is allowed for the head judge with a reason and audited as a cap override; an organiser may not while the event has a head judge", async () => {
    const h = await ended();
    const a = await att(h, d.entries[0], 1);
    await att(h, d.entries[1], 1);
    await att(h, d.entries[1], 2); // the cap is 2
    expect(codeOf(await f.clients.orgA.rpc("edit_attempt", { p_attempt: a, p_reason: "wrong rider", p_entry: d.entries[1] }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.head.rpc("edit_attempt", { p_attempt: a, p_reason: "wrong rider", p_entry: d.entries[1] }))).toBe("");
    expect((await f.s.from("trick_attempts").select("seq, entry_id").eq("id", a).single()).data).toMatchObject({ entry_id: d.entries[1], seq: 3 });
    expect((await audit(f.ids.evA1, "attempt_cap_override")).some((l) => l.reason === "wrong rider")).toBe(true);
  });

  it("switching a crash to a landing resolves the judge's 'That was a landing' flag", async () => {
    const h = await ended();
    const crash = await att(h, d.entries[0], 1, "crashed");
    const flag = await f.s.from("attempt_flags").insert({ event_id: f.ids.evA1, heat_id: h, attempt_id: crash, judge_seat_id: f.ids.seat_j1, kind: "landed", client_key: key() }).select("id").single();
    expect(codeOf(await f.clients.head.rpc("edit_attempt", { p_attempt: crash, p_reason: "it was a landing", p_status: "landed" }))).toBe("");
    const fl = (await f.s.from("attempt_flags").select("resolved_at, resolution").eq("id", flag.data!.id).single()).data!;
    expect(fl.resolved_at).toBeTruthy();
    expect(fl.resolution).toBeTruthy();
    expect((await f.s.from("trick_attempts").select("status").eq("id", crash).single()).data!.status).toBe("landed");
  });

  it("Merge keeps the first logged attempt; scores of the other move over for judges who have none there; where both scored the first one stays unless the head judge chooses", async () => {
    const h = await ended();
    const first = await att(h, d.entries[0], 1);
    const second = await att(h, d.entries[0], 2);
    await score("j1", first, 7.5, 1);
    await score("j1", second, 7.0, 1);
    await score("j2", second, 8.0, 1);
    expect(codeOf(await f.clients.head.rpc("merge_attempts", { p_keep: first, p_drop: second, p_choices: {}, p_reason: "same trick twice" }))).toBe("");
    expect(Number((await scoreRow(first, f.ids.seat_j1))!.score)).toBe(7.5);
    expect(Number((await scoreRow(first, f.ids.seat_j2))!.score)).toBe(8);
    expect((await f.s.from("trick_attempts").select("deleted_at").eq("id", second).single()).data!.deleted_at).toBeTruthy();
    expect((await f.s.from("trick_attempts").select("deleted_at").eq("id", first).single()).data!.deleted_at).toBeNull();
    expect((await audit(f.ids.evA1, "attempt_merged")).some((l) => l.reason === "same trick twice")).toBe(true);
  });

  it("Merge with the head judge's choice takes the other attempt's score; two different riders cannot be merged", async () => {
    const h = await ended();
    const first = await att(h, d.entries[0], 1);
    const second = await att(h, d.entries[0], 2);
    const other = await att(h, d.entries[1], 1);
    await score("j1", first, 7.5, 1);
    await score("j1", second, 7.0, 1);
    expect(codeOf(await f.clients.head.rpc("merge_attempts", { p_keep: first, p_drop: other, p_choices: {}, p_reason: "oops" }))).toContain("NOT_SAME_RIDER");
    expect(codeOf(await f.clients.head.rpc("merge_attempts", { p_keep: first, p_drop: second, p_choices: { [f.ids.seat_j1]: "drop" }, p_reason: "second was right" }))).toBe("");
    expect(Number((await scoreRow(first, f.ids.seat_j1))!.score)).toBe(7);
  });

  // ---------------------------------------------------------------- riders
  it("DNS, DNF and DSQ are set on the rider's seat and can be cleared; Interference is a penalty row that can be taken back; both are audited", async () => {
    const h = await ended();
    for (const m of ["DNS", "DNF", "DSQ"]) {
      expect(codeOf(await f.clients.head.rpc("set_rider_status", { p_heat: h, p_entry: d.entries[0], p_modifier: m, p_reason: "status test" }))).toBe("");
      expect((await f.s.from("heat_slots").select("modifier").eq("heat_id", h).eq("entry_id", d.entries[0]).single()).data!.modifier).toBe(m);
    }
    expect(codeOf(await f.clients.head.rpc("set_rider_status", { p_heat: h, p_entry: d.entries[0], p_modifier: null, p_reason: "back in" }))).toBe("");
    expect((await f.s.from("heat_slots").select("modifier").eq("heat_id", h).eq("entry_id", d.entries[0]).single()).data!.modifier).toBeNull();
    expect(codeOf(await f.clients.head.rpc("set_rider_status", { p_heat: h, p_entry: d.entries[0], p_modifier: "WRONG", p_reason: "bad" }))).toContain("BAD_MODIFIER");
    const pen = await f.clients.head.rpc("add_penalty", { p_heat: h, p_entry: d.entries[1], p_type: "INT", p_reason: "blocked a rider" });
    expect(codeOf(pen)).toBe("");
    const id = (pen.data as { id: string }).id;
    expect((await f.s.from("penalties").select("type").eq("heat_id", h)).data).toHaveLength(1);
    expect(codeOf(await f.clients.head.rpc("remove_penalty", { p_penalty: id, p_reason: "mistake" }))).toBe("");
    expect((await f.s.from("penalties").select("type").eq("heat_id", h)).data).toHaveLength(0);
    expect((await audit(f.ids.evA1, "rider_status_set")).length).toBeGreaterThanOrEqual(4);
  });

  it("flag-out needs a format that has it, and no more riders than the format's count", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(120) }, { riders: 3 });
    expect(codeOf(await f.clients.head.rpc("flag_out", { p_heat: h, p_entries: [d.entries[2]], p_reason: "flag out" }))).toContain("FLAG_OUT_NOT_AVAILABLE");
    await f.s.from("divisions").update({ draw: { template: { flagOut: { rounds: ["R1"], atMin: 5, count: 1 } }, rounds: [], results: {} } }).eq("id", d.div);
    expect(codeOf(await f.clients.head.rpc("flag_out", { p_heat: h, p_entries: [d.entries[1], d.entries[2]], p_reason: "flag out" }))).toContain("FLAG_OUT_TOO_MANY");
    expect(codeOf(await f.clients.head.rpc("flag_out", { p_heat: h, p_entries: [d.entries[2]], p_reason: "flag out" }))).toBe("");
    expect((await f.s.from("heat_slots").select("flagged_out").eq("heat_id", h).eq("entry_id", d.entries[2]).single()).data!.flagged_out).toBe(true);
    expect((await f.s.from("heat_slots").select("flagged_out").eq("heat_id", h).eq("entry_id", d.entries[0]).single()).data!.flagged_out).toBe(false);
    await f.s.from("divisions").update({ draw: null }).eq("id", d.div);
  });

  // ---------------------------------------------------------------- ties and flags
  it("a tie decision is recorded with its reason, read by the head judge and the organiser only, and can never be edited or deleted", async () => {
    const h = await ended();
    expect(codeOf(await f.clients.head.rpc("decide_tie", { p_heat: h, p_rider_ids: [d.entries[0]], p_reason: "just one" }))).toContain("BAD_TIE");
    expect(codeOf(await f.clients.head.rpc("decide_tie", { p_heat: h, p_rider_ids: [d.entries[0], f.ids.eB], p_reason: "other division" }))).toContain("RIDER_NOT_IN_HEAT");
    expect(codeOf(await f.clients.head.rpc("decide_tie", { p_heat: h, p_rider_ids: [d.entries[0], d.entries[1]], p_reason: "judges agree" }))).toBe("");
    const rows = (await f.clients.head.from("heat_decisions").select("kind, payload, reason, by_user").eq("heat_id", h)).data ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "tie", reason: "judges agree", by_user: f.userIds.head });
    expect(((await f.clients.orgA.from("heat_decisions").select("id").eq("heat_id", h)).data ?? []).length).toBe(1);
    for (const who of ["j1", "spotter", "announcer", "orgB", "anon"] as const) expect(((await f.clients[who].from("heat_decisions").select("id").eq("heat_id", h)).data ?? []).length).toBe(0);
    const upd = await f.s.from("heat_decisions").update({ reason: "changed" }).eq("heat_id", h);
    expect(upd.error).toBeTruthy();
    const del = await f.s.from("heat_decisions").delete().eq("heat_id", h);
    expect(del.error).toBeTruthy();
  });

  it("the head judge resolves a flag; a judge cannot", async () => {
    const h = await ended();
    const a = await att(h, d.entries[0], 1);
    const fl = (await f.s.from("attempt_flags").insert({ event_id: f.ids.evA1, heat_id: h, attempt_id: a, judge_seat_id: f.ids.seat_j1, kind: "other", client_key: key() }).select("id").single()).data!.id;
    expect(codeOf(await f.clients.j1.rpc("resolve_flag", { p_flag: fl, p_resolution: "checked" }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.head.rpc("resolve_flag", { p_flag: fl, p_resolution: "checked" }))).toBe("");
    expect((await f.s.from("attempt_flags").select("resolved_at, resolution").eq("id", fl).single()).data).toMatchObject({ resolution: "checked" });
  });

  // ---------------------------------------------------------------- the cap
  it("past the cap: the head judge with a reason works; an organiser with a reason works only when the event has no active head judge; nobody gets past without a reason", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(120) }, { riders: 2 });
    const add = (who: "head" | "orgA" | "spotter", reason: string | null) =>
      f.clients[who].rpc("add_attempt", { p_heat: h, p_entry: d.entries[0], p_client_key: key(), p_status: "landed", p_trick_name: "Extra", p_override_reason: reason });
    await att(h, d.entries[0], 1);
    await att(h, d.entries[0], 2); // at the cap of 2
    expect(codeOf(await add("head", null))).toContain("ATTEMPT_CAP_REACHED");
    expect(codeOf(await add("spotter", "please"))).toContain("ATTEMPT_CAP_REACHED");
    expect(codeOf(await add("head", " "))).toContain("OVERRIDE_REASON_REQUIRED");
    expect(codeOf(await add("head", "kite tangle"))).toBe("");
    expect(codeOf(await add("orgA", "kite tangle"))).toContain("NOT_ALLOWED"); // the event has a head judge
    await f.s.from("judge_seats").update({ active: false }).eq("id", f.ids.seat_head);
    try {
      expect(codeOf(await add("orgA", null))).toContain("ATTEMPT_CAP_REACHED");
      expect(codeOf(await add("orgA", "no head judge today"))).toBe("");
    } finally {
      await f.s.from("judge_seats").update({ active: true }).eq("id", f.ids.seat_head);
    }
    expect((await audit(f.ids.evA1, "attempt_cap_override")).some((l) => l.reason === "kite tangle")).toBe(true);
  });

  // ---------------------------------------------------------------- review and re-open
  it("moving to review needs every panel judge to have submitted, or a reason; after that judges are locked", async () => {
    const h = await ended();
    await f.clients.head.rpc("set_rider_status", { p_heat: h, p_entry: d.entries[0], p_modifier: "DNS", p_reason: "not here" });
    expect(codeOf(await f.clients.head.rpc("review_heat", { p_heat: h }))).toContain("SHEETS_NOT_SUBMITTED");
    for (const e of d.entries.slice(1)) {
      await f.clients.j1.rpc("submit_impression", { p_heat: h, p_entry: e, p_value: 6, p_client_key: key(), p_client_rev: 1 });
    }
    expect(codeOf(await f.clients.j1.rpc("submit_sheet", { p_heat: h }))).toBe("");
    expect(codeOf(await f.clients.head.rpc("review_heat", { p_heat: h }))).toContain("SHEETS_NOT_SUBMITTED"); // j2 has not
    expect(codeOf(await f.clients.head.rpc("review_heat", { p_heat: h, p_override_reason: "Judge 2 left the beach" }))).toBe("");
    expect((await f.s.from("heats").select("status").eq("id", h).single()).data!.status).toBe("under_review");
    const a = await att(h, d.entries[1], 1);
    expect(codeOf(await score("j2", a, 7))).toContain("SHEET_LOCKED");
    expect((await audit(f.ids.evA1, "heat_under_review")).some((l) => l.reason === "Judge 2 left the beach")).toBe(true);
  });

  it("Re-open takes a published heat back to review, stamps reopened_at and needs a reason; an unpublished heat cannot be re-opened", async () => {
    const pub = await mkHeat(f, d, { status: "published", started_at: ago(900), ended_at: ago(300), published_at: ago(100) }, { riders: 2 });
    expect(codeOf(await f.clients.head.rpc("reopen_heat", { p_heat: pub, p_reason: "a score was wrong" }))).toBe("");
    const row = (await f.s.from("heats").select("status, reopened_at").eq("id", pub).single()).data!;
    expect(row.status).toBe("under_review");
    expect(row.reopened_at).toBeTruthy();
    expect((await audit(f.ids.evA1, "heat_reopened")).some((l) => l.reason === "a score was wrong")).toBe(true);
    const ended1 = await ended();
    expect(codeOf(await f.clients.head.rpc("reopen_heat", { p_heat: ended1, p_reason: "no need" }))).toContain("ILLEGAL_HEAT_TRANSITION");
  });
});
