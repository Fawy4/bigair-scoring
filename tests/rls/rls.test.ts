import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, failed, run, anonClient, uuid, type Fixture } from "./helpers";

// Plain-language guide: each `it` below is one sentence about who may (or may not) do what.
// Join failures are returned ({ ok: false, error }) rather than raised, so the failure log survives for rate limiting.
const codeOf = (r: { error: { message: string } | null; data: unknown }): string => r.error?.message ?? (r.data as { error?: string } | null)?.error ?? "";

describe.skipIf(!ENV_OK)("Row Level Security (hosted development project)", () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await buildFixture();
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  // ------------------------------------------------------------------ coverage
  describe("coverage", () => {
    it("every table has RLS on, and every table except the service-only ones has policies", async () => {
      const { data, error } = await f.s.rpc("rls_coverage");
      expect(error).toBeNull();
      const rows = data as Array<{ table_name: string; rls_enabled: boolean; policy_count: number; anon_can_write: boolean; anon_can_select: boolean; authenticated_can_write: boolean }>;
      console.log("\nRLS COVERAGE (table | rls | policies | anon read | anon write | signed-in write)\n" +
        rows.map((r) => `${r.table_name.padEnd(20)} ${String(r.rls_enabled).padEnd(6)} ${String(r.policy_count).padEnd(3)} ${String(r.anon_can_select).padEnd(6)} ${String(r.anon_can_write).padEnd(6)} ${r.authenticated_can_write}`).join("\n"));
      expect(rows.length).toBeGreaterThanOrEqual(26);
      expect(rows.filter((r) => !r.rls_enabled)).toEqual([]);
      const serviceOnly = ["join_attempts", "form_attempts"];
      expect(rows.filter((r) => r.policy_count === 0 && !serviceOnly.includes(r.table_name))).toEqual([]);
      expect(rows.filter((r) => r.anon_can_write)).toEqual([]);
      expect(rows.find((r) => r.table_name === "join_attempts")).toMatchObject({ anon_can_select: false, authenticated_can_write: false });
      expect(rows.find((r) => r.table_name === "form_attempts")).toMatchObject({ anon_can_select: false, authenticated_can_write: false });
      expect(rows.find((r) => r.table_name === "presets")).toMatchObject({ rls_enabled: true, anon_can_select: false, anon_can_write: false });
    });
  });

  // ------------------------------------------------------------------ public visitors
  describe("a visitor who is not logged in", () => {
    it("sees published events but not draft ones", async () => {
      const { data } = await f.clients.anon.from("events").select("id").in("id", [f.ids.evA1, f.ids.evA2, f.ids.evB1]);
      expect((data ?? []).map((r) => r.id).sort()).toEqual([f.ids.evA1, f.ids.evB1].sort());
    });
    it("can never read the event join PIN hash", async () => {
      expect(failed(await f.clients.anon.from("events").select("join_pin_hash").eq("id", f.ids.evA1))).toMatch(/permission denied/i);
    });
    it("sees the structure of a published event but nothing of a draft event", async () => {
      expect(((await f.clients.anon.from("heats").select("id").eq("event_id", f.ids.evA1)).data ?? []).length).toBe(6);
      expect(((await f.clients.anon.from("divisions").select("id").eq("event_id", f.ids.evA2)).data ?? []).length).toBe(0);
    });
    it("cannot read private tables (riders, entries, seats, attempts, scores, audit, penalties)", async () => {
      for (const t of ["riders", "entries", "judge_seats", "trick_attempts", "trick_scores", "impression_scores", "penalties", "audit_log", "memberships", "join_attempts"]) {
        const r = await f.clients.anon.from(t).select("*").limit(5);
        expect(r.error ? "denied" : (r.data ?? []).length, t).toSatisfy((v: unknown) => v === "denied" || v === 0);
      }
    });
    it("sees rider names through the safe view but never email or phone", async () => {
      const ok = await f.clients.anon.from("v_entries").select("first_name,last_name,identifiers").eq("event_id", f.ids.evA1);
      expect(ok.data?.length).toBe(4);
      expect(failed(await f.clients.anon.from("v_entries").select("email"))).not.toBe("");
      expect(failed(await f.clients.anon.from("v_entries").select("phone"))).not.toBe("");
      expect(((await f.clients.anon.from("v_entries").select("id").eq("event_id", f.ids.evA2)).data ?? []).length).toBe(0);
    });
    it("cannot write anything", async () => {
      expect(failed(await f.clients.anon.from("events").insert({ organisation_id: f.ids.orgA, name: "x", slug: `x-${run}` }))).not.toBe("");
      expect(failed(await f.clients.anon.from("wind_calls").insert({ event_id: f.ids.evA1, status: "red" }))).not.toBe("");
      expect(failed(await f.clients.anon.rpc("add_attempt", { p_heat: f.ids.H1, p_entry: f.ids.e1, p_client_key: uuid(), p_status: "landed" }))).not.toBe("");
      expect(failed(await f.clients.anon.rpc("bind_seat_by_pin", { p_event: f.ids.evA1, p_pin: "123456", p_user: f.userIds.orgA, p_ip: "x" }))).toMatch(/permission denied/i);
    });
  });

  // ------------------------------------------------------------------ organisers
  describe("organisers", () => {
    it("organiser A reads and edits their own events, including drafts", async () => {
      expect(((await f.clients.orgA.from("events").select("id").eq("organisation_id", f.ids.orgA)).data ?? []).length).toBe(2);
      const up = await f.clients.orgA.from("divisions").update({ name: "Pro renamed" }).eq("id", f.ids.divA1).select();
      expect(up.data?.length).toBe(1);
      const add = await f.clients.orgA.from("divisions").insert({ event_id: f.ids.evA2, name: "Second", sort_order: 2 }).select();
      expect(add.error).toBeNull();
    });
    it("organiser A cannot see or change organiser B's data", async () => {
      expect(((await f.clients.orgA.from("riders").select("id").eq("organisation_id", f.ids.orgB)).data ?? []).length).toBe(0);
      expect(((await f.clients.orgB.from("riders").select("id").eq("organisation_id", f.ids.orgA)).data ?? []).length).toBe(0);
      expect(failed(await f.clients.orgA.from("divisions").insert({ event_id: f.ids.evB1, name: "intruder", sort_order: 9 }))).not.toBe("");
      const upd = await f.clients.orgA.from("events").update({ name: "hijack" }).eq("id", f.ids.evB1).select("id");
      expect(upd.data ?? []).toEqual([]);
    });
    it("an organiser reads riders' personal details for their own organisation only", async () => {
      const r = await f.clients.orgA.from("riders").select("email,phone").eq("organisation_id", f.ids.orgA);
      expect(r.data?.length).toBe(4);
    });
    it("organisers can read the seats but never the PIN or QR hashes", async () => {
      expect(((await f.clients.orgA.from("judge_seats").select("id,name,role").eq("event_id", f.ids.evA1)).data ?? []).length).toBe(7);
      expect(failed(await f.clients.orgA.from("judge_seats").select("pin_hash"))).toMatch(/permission denied/i);
      expect(failed(await f.clients.orgA.from("judge_seats").select("qr_token_hash"))).toMatch(/permission denied/i);
    });
    it("nobody inserts attempts or scores by writing to the tables directly", async () => {
      const row = { heat_id: f.ids.H1, entry_id: f.ids.e1, seq: 99, status: "landed", client_key: uuid() };
      expect(failed(await f.clients.orgA.from("trick_attempts").insert(row))).not.toBe("");
      expect(failed(await f.clients.spotter.from("trick_attempts").insert(row))).not.toBe("");
      expect(failed(await f.clients.head.from("trick_attempts").insert(row))).not.toBe("");
    });
    it("organisers can read the audit log of their events; the other organiser cannot", async () => {
      expect((await f.clients.orgA.from("audit_log").select("id").eq("event_id", f.ids.evA1).limit(1)).error).toBeNull();
      expect(((await f.clients.orgB.from("audit_log").select("id").eq("event_id", f.ids.evA1)).data ?? []).length).toBe(0);
    });
  });

  // ------------------------------------------------------------------ officials' visibility
  describe("officials can read only what their role needs", () => {
    it("a judge reads the heats of their own event only", async () => {
      expect(((await f.clients.j1.from("heats").select("id").eq("event_id", f.ids.evA1)).data ?? []).length).toBe(6);
      expect(((await f.clients.bJudge.from("heats").select("id").eq("event_id", f.ids.evA1)).data ?? []).length).toBe(6); // A1 is published, so public
      expect(((await f.clients.bJudge.from("divisions").select("id").eq("event_id", f.ids.evA2)).data ?? []).length).toBe(0); // draft of another org
      expect(((await f.clients.j1.from("divisions").select("id").eq("event_id", f.ids.evA2)).data ?? []).length).toBe(0);
    });
    it("a judge cannot see riders' contact details or other seats", async () => {
      expect(((await f.clients.j1.from("riders").select("id")).data ?? []).length).toBe(0);
      expect(((await f.clients.j1.from("judge_seats").select("id,name")).data ?? []).map((r) => r.id)).toEqual([f.ids.seat_j1]);
      expect(((await f.clients.head.from("judge_seats").select("id").eq("event_id", f.ids.evA1)).data ?? []).length).toBe(7);
    });
    it("a judge sees only their own marks; the head judge and announcer see all; the spotter none", async () => {
      for (const k of ["j1", "j2"] as const) expect((await f.clients[k].rpc("submit_trick_score", { p_attempt: f.ids.attH1, p_criteria: {}, p_score: 7.5, p_missed: false, p_flag: null, p_client_key: uuid(), p_client_rev: 1 })).error, k).toBeNull();
      expect(((await f.clients.j1.from("trick_scores").select("judge_seat_id").eq("attempt_id", f.ids.attH1)).data ?? []).map((r) => r.judge_seat_id)).toEqual([f.ids.seat_j1]);
      expect(((await f.clients.head.from("trick_scores").select("id").eq("attempt_id", f.ids.attH1)).data ?? []).length).toBe(2);
      expect(((await f.clients.announcer.from("trick_scores").select("id").eq("attempt_id", f.ids.attH1)).data ?? []).length).toBe(2);
      expect(((await f.clients.spotter.from("trick_scores").select("id").eq("attempt_id", f.ids.attH1)).data ?? []).length).toBe(0);
    });
    it("only the head judge (and organisers) can read the audit log", async () => {
      expect(((await f.clients.j1.from("audit_log").select("id").eq("event_id", f.ids.evA1)).data ?? []).length).toBe(0);
      expect(((await f.clients.head.from("audit_log").select("id").eq("event_id", f.ids.evA1)).data ?? []).length).toBeGreaterThan(0);
    });
    it("a revoked seat loses access immediately", async () => {
      expect(((await f.clients.revoked.from("trick_attempts").select("id").eq("heat_id", f.ids.H1)).data ?? []).length).toBe(0);
      expect(failed(await f.clients.revoked.rpc("submit_trick_score", { p_attempt: f.ids.attH1, p_criteria: {}, p_score: 5, p_missed: false, p_flag: null, p_client_key: uuid(), p_client_rev: 1 }))).not.toBe("");
    });
  });

  // ------------------------------------------------------------------ writing marks
  describe("judges' marks", () => {
    const mark = (c: keyof Fixture["clients"], attempt: string, score: number, rev = 1, key = uuid()) =>
      f.clients[c].rpc("submit_trick_score", { p_attempt: attempt, p_criteria: { height: score }, p_score: score, p_missed: false, p_flag: null, p_client_key: key, p_client_rev: rev });

    it("a panel judge can mark a live heat; an off-panel judge, spotter, announcer, revoked or other-event judge cannot", async () => {
      expect((await mark("j1", f.ids.attH1, 8.0, 2)).error).toBeNull();
      for (const c of ["j3", "spotter", "announcer", "revoked", "bJudge", "anon"] as const) expect(failed(await mark(c, f.ids.attH1, 6)), c).not.toBe("");
    });
    it("marks are refused before the heat starts; allowed while it runs and after it ended, however long ago, until the judge submits (the grace period is gone)", async () => {
      expect(failed(await mark("j1", f.ids.attH2, 6))).not.toBe("");   // scheduled
      expect((await mark("j1", f.ids.attH3, 6)).error).toBeNull();     // ended long ago: still open, the lock is Submit or review
      expect((await mark("j1", f.ids.attH5, 6)).error).toBeNull();     // timer expired long ago
      expect((await mark("j1", f.ids.attH4, 6)).error).toBeNull();     // timer expired 50 s ago
    });
    it("a judge cannot write a mark in another judge's name or delete marks", async () => {
      const spoof = await f.clients.j1.from("trick_scores").insert({ attempt_id: f.ids.attH1, judge_seat_id: f.ids.seat_j2, score: 1, client_key: uuid(), client_rev: 1 });
      expect(failed(spoof)).not.toBe("");
      await f.clients.j1.from("trick_scores").delete().eq("attempt_id", f.ids.attH1);
      expect(((await f.s.from("trick_scores").select("id").eq("attempt_id", f.ids.attH1)).data ?? []).length).toBe(2);
    });
    it("retries are harmless and stale (older) queued marks never overwrite newer ones", async () => {
      const key = uuid();
      await mark("j2", f.ids.attH1, 7.0, 10, key);
      await mark("j2", f.ids.attH1, 7.0, 10, key); // exact retry
      await mark("j2", f.ids.attH1, 2.0, 5);       // older edit arrives late
      const { data } = await f.s.from("trick_scores").select("score,version").eq("attempt_id", f.ids.attH1).eq("judge_seat_id", f.ids.seat_j2);
      expect(data).toHaveLength(1);
      expect(Number(data![0].score)).toBe(7);
      await mark("j2", f.ids.attH1, 7.5, 11);      // genuinely newer
      const after = await f.s.from("trick_scores").select("score,version").eq("attempt_id", f.ids.attH1).eq("judge_seat_id", f.ids.seat_j2);
      expect(Number(after.data![0].score)).toBe(7.5);
      expect(after.data![0].version).toBeGreaterThan(data![0].version);
    });
    it("impression marks are only accepted once the heat has ended", async () => {
      const imp = (heat: string) => f.clients.j1.rpc("submit_impression", { p_heat: heat, p_entry: f.ids.e1, p_value: 7, p_client_key: uuid(), p_client_rev: 1 });
      expect(failed(await imp(f.ids.H1))).not.toBe("");   // still running
      expect((await imp(f.ids.H4)).error).toBeNull();     // timer ended 50 s ago
      expect((await imp(f.ids.H5)).error).toBeNull();     // timer ended long ago: open until the judge submits
    });
    it("every change to a mark is audited with the seat that made it", async () => {
      const { data } = await f.s.from("audit_log").select("actor_seat_id,action,table_name").eq("event_id", f.ids.evA1).eq("table_name", "trick_scores").eq("actor_seat_id", f.ids.seat_j1);
      expect(data!.length).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------ attempts and the cap
  describe("attempts and the attempt cap (3 per rider in this division)", () => {
    const add = (c: keyof Fixture["clients"], entry: string, extra: object = {}, heat = f.ids.H1) =>
      f.clients[c].rpc("add_attempt", { p_heat: heat, p_entry: entry, p_client_key: uuid(), p_status: "landed", p_trick_name: "Backroll", ...extra });

    it("the spotter logs attempts; the 4th is refused with ATTEMPT_CAP_REACHED and nothing is inserted", async () => {
      for (let i = 0; i < 3; i++) expect((await add("spotter", f.ids.e2)).error).toBeNull();
      const fourth = await add("spotter", f.ids.e2);
      expect(fourth.error?.message).toContain("ATTEMPT_CAP_REACHED");
      const { count } = await f.s.from("trick_attempts").select("id", { count: "exact", head: true }).eq("heat_id", f.ids.H1).eq("entry_id", f.ids.e2);
      expect(count).toBe(3);
    });
    it("numbers attempts 1, 2, 3 per rider", async () => {
      const { data } = await f.s.from("trick_attempts").select("seq").eq("heat_id", f.ids.H1).eq("entry_id", f.ids.e2).order("seq");
      expect(data!.map((r) => r.seq)).toEqual([1, 2, 3]);
    });
    it("only the head judge (with a written reason) may go beyond the cap, and it is audited", async () => {
      expect((await add("spotter", f.ids.e2, { p_override_reason: "spotter says ok" })).error?.message).toMatch(/ATTEMPT_CAP_REACHED|NOT_ALLOWED/);
      expect((await add("head", f.ids.e2)).error?.message).toContain("ATTEMPT_CAP_REACHED");
      expect((await add("head", f.ids.e2, { p_override_reason: "  " })).error?.message).toContain("OVERRIDE_REASON_REQUIRED");
      const ok = await add("head", f.ids.e2, { p_override_reason: "Spotter missed the first jump" });
      expect(ok.error).toBeNull();
      const { data } = await f.s.from("audit_log").select("reason,action").eq("event_id", f.ids.evA1).eq("action", "attempt_cap_override");
      expect(data!.map((r) => r.reason)).toContain("Spotter missed the first jump");
    });
    it("phone counters come from the same count: 4 used of a cap of 3", async () => {
      const { data, error } = await f.clients.spotter.rpc("attempt_counts", { p_heat: f.ids.H1 });
      expect(error).toBeNull();
      expect((data as Array<{ entry_id: string; used: number; cap: number }>).find((r) => r.entry_id === f.ids.e2)).toMatchObject({ used: 4, cap: 3 });
    });
    it("deleting an attempt needs the head judge and a reason, frees a place, and never renumbers", async () => {
      const list = (await f.s.from("trick_attempts").select("id,seq").eq("heat_id", f.ids.H1).eq("entry_id", f.ids.e2).is("deleted_at", null).order("seq")).data!;
      expect(failed(await f.clients.spotter.rpc("delete_attempt", { p_attempt: list[0].id, p_reason: "dup" }))).not.toBe("");
      expect((await f.clients.head.rpc("delete_attempt", { p_attempt: list[0].id, p_reason: "" })).error?.message).toContain("REASON_REQUIRED");
      expect((await f.clients.head.rpc("delete_attempt", { p_attempt: list[0].id, p_reason: "Two spotters logged the same jump" })).error).toBeNull();
      expect((await add("spotter", f.ids.e2)).error?.message).toContain("ATTEMPT_CAP_REACHED"); // 3 left (incl. override) = cap
      expect((await f.clients.head.rpc("delete_attempt", { p_attempt: list[1].id, p_reason: "Wrong rider" })).error).toBeNull();
      const again = await add("spotter", f.ids.e2);
      expect(again.error).toBeNull();
      expect((again.data as { seq: number }).seq).toBeGreaterThan(4); // seq continues; deleted numbers are not reused
    });
    it("sending the same client_key twice creates one attempt (safe retries)", async () => {
      const key = uuid();
      const a = await f.clients.spotter.rpc("add_attempt", { p_heat: f.ids.H1, p_entry: f.ids.e1, p_client_key: key, p_status: "crashed" });
      const b = await f.clients.spotter.rpc("add_attempt", { p_heat: f.ids.H1, p_entry: f.ids.e1, p_client_key: key, p_status: "crashed" });
      expect(a.error).toBeNull();
      expect((b.data as { id: string }).id).toBe((a.data as { id: string }).id);
    });
    it("two phones racing for the last place: exactly one wins", async () => {
      expect((await add("spotter", f.ids.e3)).error).toBeNull();
      expect((await add("spotter", f.ids.e3)).error).toBeNull();
      const [x, y] = await Promise.all([add("spotter", f.ids.e3), add("head", f.ids.e3)]);
      expect([x.error, y.error].filter(Boolean)).toHaveLength(1);
      const { count } = await f.s.from("trick_attempts").select("id", { count: "exact", head: true }).eq("heat_id", f.ids.H1).eq("entry_id", f.ids.e3).is("deleted_at", null);
      expect(count).toBe(3);
    });
    it("refuses a heat that is not running, a rider who is not in the heat, and (by default) judges", async () => {
      expect((await add("spotter", f.ids.e1, {}, f.ids.H2)).error?.message).toContain("HEAT_NOT_RUNNING");
      expect((await add("spotter", f.ids.e4)).error?.message).toContain("RIDER_NOT_IN_HEAT");
      expect(failed(await add("j1", f.ids.e1))).not.toBe("");
    });
    it("judges may log attempts once the event setting judgesMayLogAttempts is on", async () => {
      await f.s.from("events").update({ settings: { publicLiveScores: "live", judgeGraceSec: 180, judgesMayLogAttempts: true } }).eq("id", f.ids.evA1);
      expect((await add("j1", f.ids.e1)).error).toBeNull();
      expect((await add("j3", f.ids.e1)).error?.message).toContain("ATTEMPT_CAP_REACHED"); // allowed to log (any judge seat of the event); rider e1 is simply at the cap of 3
      await f.s.from("events").update({ settings: { publicLiveScores: "live", judgeGraceSec: 180 } }).eq("id", f.ids.evA1);
    });
  });

  // ------------------------------------------------------------------ heat state machine
  describe("the heat timer and state machine (server time is truth)", () => {
    it("Start records the server time; a client-supplied start time is ignored", async () => {
      // the heat functions check the draw, the panel and the one-running-heat rule: make the shared fixture eligible
      await f.s.from("divisions").update({ draw_locked_at: new Date().toISOString() }).eq("id", f.ids.divA1);
      await f.s.from("scoring_models").update({ json: { heat: { duplicateWindowSec: 20 }, panel: { minJudges: 2 } } }).eq("id", f.ids.modelA1);
      await f.s.from("events").update({ settings: { publicLiveScores: "live", maxRunningHeats: 9 } }).eq("id", f.ids.evA1);
      const forged = await f.clients.head.from("heats").update({ started_at: "2020-01-01T00:00:00Z" }).eq("id", f.ids.H6);
      expect(forged.error).toBeNull();
      const r = await f.clients.head.rpc("start_heat", { p_heat: f.ids.H6 });
      expect(r.error).toBeNull();
      expect(Math.abs(Date.now() - new Date((r.data as { started_at: string }).started_at).getTime())).toBeLessThan(60_000);
    });
    it("pause and resume accumulate paused time on the server", async () => {
      const p = await f.clients.head.rpc("pause_heat", { p_heat: f.ids.H6 });
      expect((p.data as { paused_at: string }).paused_at).not.toBeNull();
      const r = await f.clients.head.rpc("resume_heat", { p_heat: f.ids.H6 });
      expect((r.data as { paused_at: string | null }).paused_at).toBeNull();
      expect((r.data as { paused_total_sec: number }).paused_total_sec).toBeGreaterThanOrEqual(0);
    });
    it("only the server can publish; illegal jumps are refused; spotters and judges cannot touch heats; nobody edits a heat's status by hand", async () => {
      expect(failed(await f.clients.head.from("heats").update({ status: "published" }).eq("id", f.ids.H6))).not.toBe("");
      expect(failed(await f.clients.head.from("heats").update({ status: "scheduled" }).eq("id", f.ids.H6))).not.toBe("");
      expect(failed(await f.clients.head.from("heats").update({ status: "ended" }).eq("id", f.ids.H6))).toContain("USE_HEAT_FUNCTIONS");
      for (const c of ["spotter", "j1", "announcer"] as const) expect(failed(await f.clients[c].rpc("end_heat", { p_heat: f.ids.H6 })), c).toContain("NOT_ALLOWED");
      expect((await f.clients.head.rpc("end_heat", { p_heat: f.ids.H6 })).error).toBeNull();
    });
    it("the head judge cannot edit the event or its divisions", async () => {
      expect(((await f.clients.head.from("divisions").update({ name: "x" }).eq("id", f.ids.divA1).select()).data ?? []).length).toBe(0);
    });
    it("published results cannot be changed or deleted, even by the server", async () => {
      const ins = await f.s.from("heat_results").insert({ heat_id: f.ids.H3, entry_id: f.ids.e1, place: 1, total: 20, version: 1, published_at: new Date().toISOString() }).select().single();
      expect(ins.error).toBeNull();
      expect(failed(await f.s.from("heat_results").update({ total: 99 }).eq("id", ins.data!.id))).toMatch(/append-only|immutable|not allowed/i);
      expect(failed(await f.s.from("heat_results").delete().eq("id", ins.data!.id))).toMatch(/append-only|immutable|not allowed/i);
      expect(((await f.clients.anon.from("heat_results").select("id").eq("heat_id", f.ids.H3)).data ?? []).length).toBe(1);
    });
    it("nobody can write to the audit log", async () => {
      expect(failed(await f.clients.head.from("audit_log").insert({ event_id: f.ids.evA1, action: "forged", table_name: "x" }))).not.toBe("");
      expect(failed(await f.s.from("audit_log").delete().eq("event_id", f.ids.evA1))).not.toBe("");
    });
  });

  // ------------------------------------------------------------------ joining
  describe("joining with a PIN or QR token", () => {
    const bind = (pin: string, user: string, ip = `ip-${run}`, event = f.ids.evA1) => f.s.rpc("bind_seat_by_pin", { p_event: event, p_pin: pin, p_user: user, p_ip: ip });
    let newUserId = "";
    let newClient: ReturnType<typeof anonClient>;
    it("PINs are stored hashed and unique within an event", async () => {
      expect((await f.s.rpc("set_seat_pin", { p_seat: f.ids.seat_spotter, p_pin: "482913" })).error).toBeNull();
      expect((await f.s.rpc("set_seat_pin", { p_seat: f.ids.seat_announcer, p_pin: "482913" })).error?.message).toContain("PIN_IN_USE");
      const raw = await f.s.from("judge_seats").select("pin_hash").eq("id", f.ids.seat_spotter).single();
      expect(raw.data!.pin_hash).not.toContain("482913");
    });
    it("a wrong PIN is refused; the right PIN binds the seat to a login", async () => {
      const u = await f.s.auth.admin.createUser({ email: `rls-${run}-newphone@example.com`, password: "Pw-newphone-123456", email_confirm: true });
      newUserId = u.data.user!.id;
      f.userIds.newphone = newUserId;
      expect(codeOf(await bind("000000", newUserId))).toBe("INVALID_PIN");
      const ok = await bind("482913", newUserId);
      expect(ok.error).toBeNull();
      expect(ok.data).toMatchObject({ role: "spotter", rebound: true });
      newClient = anonClient();
      await newClient.auth.signInWithPassword({ email: `rls-${run}-newphone@example.com`, password: "Pw-newphone-123456" });
      expect(((await newClient.from("judge_seats").select("id")).data ?? []).map((r) => r.id)).toEqual([f.ids.seat_spotter]);
    });
    it("rebinding cuts off the old phone and is audited", async () => {
      expect(((await f.clients.spotter.from("judge_seats").select("id")).data ?? []).length).toBe(0);
      expect(failed(await f.clients.spotter.rpc("add_attempt", { p_heat: f.ids.H1, p_entry: f.ids.e1, p_client_key: uuid(), p_status: "landed" }))).not.toBe("");
      const { data } = await f.s.from("audit_log").select("id").eq("event_id", f.ids.evA1).eq("table_name", "judge_seats").eq("row_id", f.ids.seat_spotter);
      expect(data!.length).toBeGreaterThan(0);
    });
    it("a locked seat refuses to be rebound", async () => {
      await f.s.from("judge_seats").update({ locked: true }).eq("id", f.ids.seat_spotter);
      expect(codeOf(await bind("482913", f.userIds.orgB))).toBe("SEAT_LOCKED");
      await f.s.from("judge_seats").update({ locked: false }).eq("id", f.ids.seat_spotter);
    });
    it("one login holds one seat per event: joining a second seat frees the first", async () => {
      await f.s.rpc("set_seat_pin", { p_seat: f.ids.seat_announcer, p_pin: "735190" });
      expect((await bind("735190", newUserId)).error).toBeNull();
      const { data } = await f.s.from("judge_seats").select("id,auth_user_id").in("id", [f.ids.seat_spotter, f.ids.seat_announcer]);
      expect(data!.find((r) => r.id === f.ids.seat_spotter)!.auth_user_id).toBeNull();
      expect(data!.find((r) => r.id === f.ids.seat_announcer)!.auth_user_id).toBe(newUserId);
    });
    it("QR tokens work once", async () => {
      await f.s.rpc("set_seat_qr", { p_seat: f.ids.seat_spotter, p_token: "tok-" + run, p_expires: new Date(Date.now() + 3600_000).toISOString() });
      const first = await f.s.rpc("bind_seat_by_token", { p_event: f.ids.evA1, p_token: "tok-" + run, p_user: newUserId, p_ip: `ip2-${run}` });
      expect(first.error).toBeNull();
      const second = await f.s.rpc("bind_seat_by_token", { p_event: f.ids.evA1, p_token: "tok-" + run, p_user: f.userIds.orgB, p_ip: `ip2-${run}` });
      expect(codeOf(second)).toBe("INVALID_TOKEN");
    });
    it("after 10 wrong tries from one address, even the right PIN is refused for a while", async () => {
      const ip = `ip-flood-${run}`;
      for (let i = 0; i < 10; i++) await bind("111111", newUserId, ip);
      expect(codeOf(await bind("735190", newUserId, ip))).toBe("RATE_LIMITED");
      expect(codeOf(await bind("735190", newUserId, `ip-other-${run}`))).toBe("");
    });
    it("a real anonymous phone session can be bound and stays bound", async () => {
      const phone = anonClient();
      const { data, error } = await phone.auth.signInAnonymously();
      expect(error?.message ?? "", "Anonymous sign-ins must be switched on (see docs/STATUS.md)").toBe("");
      if (data.user) (f.userIds as unknown as { __track: (id: string) => void }).__track(data.user.id); // removed by cleanup even if an assertion fails
      expect(data.user?.is_anonymous).toBe(true);
      await f.s.rpc("set_seat_pin", { p_seat: f.ids.seat_j3, p_pin: "246810" });
      expect((await bind("246810", data.user!.id, `ip3-${run}`)).error).toBeNull();
      expect(((await phone.from("judge_seats").select("id,role")).data ?? [])[0]).toMatchObject({ id: f.ids.seat_j3, role: "judge" });
    });
  });

  // ------------------------------------------------------------------ public live view
  describe("public live scores (polling function)", () => {
    const live = () => anonClient().rpc("get_public_live_heat", { p_heat: f.ids.H1 });
    it("returns attempts and marks by panel position, never by judge identity, when the event allows live scores", async () => {
      const { data, error } = await live();
      expect(error).toBeNull();
      const d = data as { allowed: boolean; attempts: unknown[]; scores: Array<Record<string, unknown>>; heat: { live_rev: number } };
      expect(d.allowed).toBe(true);
      expect(d.attempts.length).toBeGreaterThan(0);
      expect(d.scores.length).toBeGreaterThan(0);
      for (const sc of d.scores) {
        expect(sc).toHaveProperty("seat_no");
        expect(sc).not.toHaveProperty("judge_seat_id");
        expect(sc).not.toHaveProperty("edited_by");
      }
    });
    it("the live counter moves when a mark arrives, so pollers know to refresh", async () => {
      const before = (await live()).data as { heat: { live_rev: number } };
      await f.clients.j1.rpc("submit_trick_score", { p_attempt: f.ids.attH1, p_criteria: {}, p_score: 8.5, p_missed: false, p_flag: null, p_client_key: uuid(), p_client_rev: 99 });
      const after = (await live()).data as { heat: { live_rev: number } };
      expect(after.heat.live_rev).toBeGreaterThan(before.heat.live_rev);
    });
    it("returns nothing when live scores are 'after publish' or 'off', or the event is a draft", async () => {
      for (const mode of ["after_publish", "off"]) {
        await f.s.from("events").update({ settings: { publicLiveScores: mode } }).eq("id", f.ids.evA1);
        expect(((await live()).data as { allowed: boolean }).allowed, mode).toBe(false);
      }
      await f.s.from("events").update({ settings: { publicLiveScores: "live", judgeGraceSec: 180 } }).eq("id", f.ids.evA1);
      await f.s.from("events").update({ status: "draft" }).eq("id", f.ids.evA1);
      expect(((await live()).data as { allowed: boolean }).allowed).toBe(false);
      await f.s.from("events").update({ status: "published" }).eq("id", f.ids.evA1);
    });
  });

  // ------------------------------------------------------------------ presets
  describe("presets", () => {
    it("published system presets are readable by everyone; organisation presets by their members, the public only when a published event uses them", async () => {
      const sys = await f.s.from("scoring_models").insert({ organisation_id: null, key: `rls-${run}-system`, name: "sys", version: 1, json: {}, content_hash: "z", published_at: new Date().toISOString() }).select().single();
      expect(sys.error).toBeNull();
      expect(((await f.clients.anon.from("scoring_models").select("id").eq("id", sys.data!.id)).data ?? []).length).toBe(1);
      expect(((await f.clients.anon.from("scoring_models").select("id").eq("id", f.ids.modelA1)).data ?? []).length).toBe(1); // used by published A1
      expect(((await f.clients.anon.from("scoring_models").select("id").eq("id", f.ids.modelA2)).data ?? []).length).toBe(0); // used only by a draft
      expect(((await f.clients.orgB.from("scoring_models").select("id").eq("id", f.ids.modelA2)).data ?? []).length).toBe(0);
      expect(((await f.clients.orgA.from("scoring_models").select("id").eq("id", f.ids.modelA2)).data ?? []).length).toBe(1);
      expect(failed(await f.clients.orgA.from("scoring_models").update({ name: "tamper" }).eq("id", sys.data!.id))).toBe("");
      expect((await f.s.from("scoring_models").select("name").eq("id", sys.data!.id).single()).data!.name).toBe("sys");
    });
  });

  // ------------------------------------------------------------------ Phase 4a-1: organisation settings
  describe("organisation settings", () => {
    it("an owner renames their organisation and changes the slug and default time zone; the other organisation cannot", async () => {
      const mine = await f.clients.orgA.from("organisations").update({ name: `Renamed ${run}`, slug: `renamed-${run}`, settings: { defaultTimezone: "Europe/Berlin" } }).eq("id", f.ids.orgA);
      expect(failed(mine)).toBe("");
      const row = (await f.s.from("organisations").select("name, slug, settings").eq("id", f.ids.orgA).single()).data!;
      expect(row).toMatchObject({ name: `Renamed ${run}`, slug: `renamed-${run}`, settings: { defaultTimezone: "Europe/Berlin" } });

      await f.clients.orgB.from("organisations").update({ name: "hijacked", slug: `hijack-${run}` }).eq("id", f.ids.orgA);
      expect((await f.s.from("organisations").select("name").eq("id", f.ids.orgA).single()).data!.name).toBe(`Renamed ${run}`);
    });

    it("a time zone that does not exist and a slug that would break links are refused", async () => {
      expect(failed(await f.clients.orgA.from("organisations").update({ settings: { defaultTimezone: "Mars/Olympus" } }).eq("id", f.ids.orgA))).toContain("INVALID_TIMEZONE");
      expect(failed(await f.clients.orgA.from("organisations").update({ slug: "Not A Slug!" }).eq("id", f.ids.orgA))).not.toBe("");
      expect(failed(await f.clients.orgA.from("organisations").update({ slug: "rls-b-" + run }).eq("id", f.ids.orgA))).not.toBe(""); // already taken by the other organisation
    });

    it("a visitor cannot change or even read organisations", async () => {
      expect((await f.clients.anon.from("organisations").select("id")).data ?? []).toEqual([]);
      await f.clients.anon.from("organisations").update({ name: "anon" }).eq("id", f.ids.orgA);
      expect((await f.s.from("organisations").select("name").eq("id", f.ids.orgA).single()).data!.name).not.toBe("anon");
    });
  });

  // ------------------------------------------------------------------ Phase 4a-1: presets table
  describe("generic presets table", () => {
    const own = () => ({ organisation_id: f.ids.orgA, kind: "identification", key: `rls-${run}`, name: "Mine", version: 1, json: { hello: 1 }, content_hash: "h" });

    it("published system rows are readable by signed-in organisers, not by visitors; nobody but the server writes them", async () => {
      const sys = await f.s.from("presets").insert({ organisation_id: null, kind: "identification", key: `rls-${run}-sys`, name: "System", version: 1, json: {}, content_hash: "s", published_at: new Date().toISOString() }).select().single();
      expect(sys.error).toBeNull();
      expect(((await f.clients.orgB.from("presets").select("id").eq("id", sys.data!.id)).data ?? []).length).toBe(1);
      expect(failed(await f.clients.anon.from("presets").select("id"))).not.toBe("");
      expect(failed(await f.clients.orgA.from("presets").insert({ ...own(), organisation_id: null, key: `rls-${run}-x` }))).not.toBe("");
      await f.clients.orgA.from("presets").update({ name: "tamper" }).eq("id", sys.data!.id);
      await f.clients.orgA.from("presets").delete().eq("id", sys.data!.id);
      expect((await f.s.from("presets").select("name").eq("id", sys.data!.id).single()).data!.name).toBe("System");
      await f.s.from("presets").delete().eq("id", sys.data!.id);
    });

    it("an organisation's presets are visible and writable to its members only", async () => {
      const ins = await f.clients.orgA.from("presets").insert(own()).select().single();
      expect(failed(ins)).toBe("");
      const id = ins.data!.id;
      expect(((await f.clients.orgA.from("presets").select("id").eq("id", id)).data ?? []).length).toBe(1);
      expect(((await f.clients.orgB.from("presets").select("id").eq("id", id)).data ?? []).length).toBe(0);
      await f.clients.orgB.from("presets").update({ name: "tamper" }).eq("id", id);
      await f.clients.orgB.from("presets").delete().eq("id", id);
      expect((await f.s.from("presets").select("name").eq("id", id).single()).data!.name).toBe("Mine");
      expect(failed(await f.clients.orgB.from("presets").insert({ ...own(), key: `rls-${run}-b` }))).not.toBe(""); // B cannot write into A's organisation
      expect(failed(await f.clients.orgA.from("presets").insert(own()))).not.toBe(""); // same key + version twice
      expect(failed(await f.clients.orgA.from("presets").insert({ ...own(), version: 2 }))).toBe(""); // a new version is a new row
    });
  });

  // ------------------------------------------------------------------ Phase 4a-1: branding bucket
  describe("branding bucket (logos)", () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const upload = (c: Fixture["clients"]["orgA"], path: string, body: Buffer | Uint8Array = png, contentType = "image/png") =>
      c.storage.from("branding").upload(path, body, { contentType, upsert: true });
    const uploaded: string[] = [];

    it("a member uploads under their own organisation folder and the file is publicly readable", async () => {
      const path = `${f.ids.orgA}/logo-${run}.png`;
      expect(failed(await upload(f.clients.orgA, path))).toBe("");
      uploaded.push(path);
      const url = f.clients.anon.storage.from("branding").getPublicUrl(path).data.publicUrl;
      const res = await fetch(url);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/png");
    });

    it("nobody can write into another organisation's folder, and visitors cannot upload at all", async () => {
      expect(failed(await upload(f.clients.orgB, `${f.ids.orgA}/steal-${run}.png`))).not.toBe("");
      expect(failed(await upload(f.clients.orgA, `${f.ids.orgB}/steal-${run}.png`))).not.toBe("");
      expect(failed(await upload(f.clients.anon, `${f.ids.orgA}/anon-${run}.png`))).not.toBe("");
      expect(failed(await upload(f.clients.j1, `${f.ids.orgA}/judge-${run}.png`))).not.toBe(""); // an official is not a member
      expect(failed(await upload(f.clients.orgA, `loose-${run}.png`))).not.toBe(""); // no organisation folder
      expect(failed(await upload(f.clients.orgA, `not-a-uuid/loose-${run}.png`))).not.toBe("");
    });

    it("only images up to 2 MB are accepted", async () => {
      expect(failed(await upload(f.clients.orgA, `${f.ids.orgA}/page-${run}.html`, Buffer.from("<script>alert(1)</script>"), "text/html"))).not.toBe("");
      expect(failed(await upload(f.clients.orgA, `${f.ids.orgA}/vector-${run}.svg`, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml"))).not.toBe("");
      expect(failed(await upload(f.clients.orgA, `${f.ids.orgA}/huge-${run}.png`, new Uint8Array(2 * 1024 * 1024 + 1)))).not.toBe("");
    });

    it("another organisation cannot replace or delete a file", async () => {
      const path = `${f.ids.orgA}/logo-${run}.png`;
      expect(failed(await upload(f.clients.orgB, path))).not.toBe("");
      await f.clients.orgB.storage.from("branding").remove([path]);
      expect((await f.s.storage.from("branding").list(f.ids.orgA)).data?.map((o) => o.name)).toContain(`logo-${run}.png`);
      expect(failed(await f.clients.orgA.storage.from("branding").remove([path]))).toBe("");
      expect((await f.s.storage.from("branding").list(f.ids.orgA)).data?.map((o) => o.name)).not.toContain(`logo-${run}.png`);
    });

    it("cleanup", async () => {
      if (uploaded.length) await f.s.storage.from("branding").remove(uploaded);
    });
  });

  // ------------------------------------------------------------------ Phase 4a-1: divisions (draw columns, rules lock, delete guard)
  describe("divisions: draw, rules lock, delete guard", () => {
    it("an organiser stores a draw and locks it on their own division through the draw functions; another organiser cannot, and nobody can write it directly (Phase 4b)", async () => {
      const draw = { status: "draft", rounds: [], entrants: [] };
      const save = (c: typeof f.clients.orgA, d: object) => c.rpc("save_division_draw", { p_division: f.ids.divA2, p_draw: d as never, p_projection: { rounds: [], heats: [] } as never, p_action: "generate", p_audit: {} as never });
      expect(failed(await save(f.clients.orgA, draw))).toBe("");
      expect((await f.s.from("divisions").select("draw").eq("id", f.ids.divA2).single()).data!.draw).toEqual(draw);
      expect(failed(await f.clients.orgA.rpc("lock_division_draw", { p_division: f.ids.divA2 }))).toBe("");
      expect((await f.s.from("divisions").select("draw_locked_at").eq("id", f.ids.divA2).single()).data!.draw_locked_at).not.toBeNull();
      expect(failed(await save(f.clients.orgB, { hacked: true }))).toContain("NOT_ALLOWED");
      expect(failed(await f.clients.orgA.from("divisions").update({ draw: { hacked: true } }).eq("id", f.ids.divA2))).toContain("DRAW_FUNCTION_ONLY");
      await f.clients.orgB.from("divisions").update({ draw: { hacked: true } }).eq("id", f.ids.divA2);
      expect((await f.s.from("divisions").select("draw").eq("id", f.ids.divA2).single()).data!.draw).toEqual({ ...draw, status: "locked" });
    });

    it("scoring and format can be edited freely until a heat has started", async () => {
      expect(failed(await f.clients.orgA.from("divisions").update({ scoring_overrides: { heat: { maxAttemptsPerRider: 5 } } }).eq("id", f.ids.divA2))).toBe("");
    });

    it("once a heat has started, scoring and format are read-only (RULES_LOCKED), also for the server", async () => {
      const r = await f.clients.orgA.from("divisions").update({ scoring_overrides: { heat: { maxAttemptsPerRider: 9 } } }).eq("id", f.ids.divA1);
      expect(failed(r)).toContain("RULES_LOCKED");
      expect(failed(await f.s.from("divisions").update({ format_params: { x: 1 } }).eq("id", f.ids.divA1))).toContain("RULES_LOCKED");
      expect(failed(await f.clients.orgA.from("divisions").update({ name: "Pro (renamed)" }).eq("id", f.ids.divA1))).toBe(""); // other fields stay editable
    });

    it("unlocking needs an organiser of that event and a written reason, opens the lock, and is audited", async () => {
      expect(failed(await f.clients.anon.rpc("unlock_division_rules", { p_division: f.ids.divA1, p_reason: "please let me" }))).not.toBe("");
      expect(failed(await f.clients.orgB.rpc("unlock_division_rules", { p_division: f.ids.divA1, p_reason: "not my division" }))).toContain("NOT_ALLOWED");
      expect(failed(await f.clients.head.rpc("unlock_division_rules", { p_division: f.ids.divA1, p_reason: "head judge is not an organiser" }))).toContain("NOT_ALLOWED");
      expect(failed(await f.clients.orgA.rpc("unlock_division_rules", { p_division: f.ids.divA1, p_reason: "  ok " }))).toContain("REASON_REQUIRED");
      expect(failed(await f.clients.orgA.rpc("unlock_division_rules", { p_division: f.ids.divA1, p_reason: "Wrong cap entered before the heat" }))).toBe("");

      expect(failed(await f.clients.orgA.from("divisions").update({ scoring_overrides: { heat: { maxAttemptsPerRider: 3, note: "edited after unlock" } } }).eq("id", f.ids.divA1))).toBe("");
      const log = (await f.s.from("audit_log").select("action, reason, table_name").eq("event_id", f.ids.evA1).eq("table_name", "divisions")).data ?? [];
      expect(log.find((l) => l.action === "rules_unlocked")?.reason).toBe("Wrong cap entered before the heat");
      expect(log.filter((l) => l.action === "update").length).toBeGreaterThanOrEqual(1); // the edit after the unlock
    });

    it("a division with heats cannot be deleted directly; one without heats can (own organisation only)", async () => {
      expect(failed(await f.clients.orgA.from("divisions").delete().eq("id", f.ids.divA1))).toContain("DIVISION_HAS_HEATS");
      await f.clients.orgB.from("divisions").delete().eq("id", f.ids.divA2);
      expect(((await f.s.from("divisions").select("id").eq("id", f.ids.divA2)).data ?? []).length).toBe(1);
      const extra = await f.s.from("divisions").insert({ event_id: f.ids.evA2, name: "Scratch", sort_order: 9 }).select().single();
      expect(failed(await f.clients.orgA.from("divisions").delete().eq("id", extra.data!.id))).toBe("");
    });
  });

  // ------------------------------------------------------------------ Phase 4a-1: public registration
  describe("public rider registration (register_rider)", () => {
    const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const fields = (email: string, extra: object = {}) => ({ first_name: "Zed", last_name: "Rider", email, ...extra });
    const reg = (slug: string, division: string, flds: object, ident: object = {}, consent = true, ip = `ip-${run}-reg`) =>
      f.s.rpc("register_rider", { p_event_slug: slug, p_division: division, p_fields: flds, p_identifiers: ident, p_consent: consent, p_ip: ip });
    const setSettings = (patch: object, eventId = f.ids.evA1) =>
      f.s.from("events").select("settings").eq("id", eventId).single().then(({ data }) => f.s.from("events").update({ settings: { ...(data!.settings as object), ...patch } }).eq("id", eventId));
    const slugA1 = () => `rls-a1-${run}`;

    it("nobody but the server can call it (not visitors, not signed-in users, not organisers)", async () => {
      const args = { p_event_slug: slugA1(), p_division: f.ids.divA1, p_fields: fields("x@example.com"), p_identifiers: {}, p_consent: true, p_ip: "1.1.1.1" };
      for (const c of [f.clients.anon, f.clients.orgA, f.clients.j1]) expect(failed(await c.rpc("register_rider", args))).not.toBe("");
    });

    it("registration is closed by default and stays closed for a draft event", async () => {
      expect(codeOf(await reg(slugA1(), f.ids.divA1, fields("closed@example.com")))).toBe("REGISTRATION_CLOSED");
      await setSettings({ registrationOpen: true }, f.ids.evA2);
      expect(codeOf(await reg(`rls-a2-${run}`, f.ids.divA2, fields("draft@example.com")))).toBe("REGISTRATION_CLOSED");
      expect(codeOf(await reg("no-such-event-" + run, f.ids.divA1, fields("nobody@example.com")))).toBe("EVENT_NOT_FOUND");
    });

    it("when open it creates a rider and a self-registered entry that visitors cannot read", async () => {
      await setSettings({ registrationOpen: true });
      const ok = await reg(slugA1(), f.ids.divA1, fields("Zed@Example.com", { phone: "+201111", nationality: "EG" }), { vest_colour: "blue", admin: true, kite: { brand: "North" } });
      expect(ok.data).toEqual({ ok: true });
      const rider = (await f.s.from("riders").select("id, first_name, email, phone").eq("organisation_id", f.ids.orgA).ilike("email", "zed@example.com")).data!;
      expect(rider).toHaveLength(1);
      const entry = (await f.s.from("entries").select("status, source, consent_at, identifiers").eq("rider_id", rider[0].id)).data!;
      expect(entry).toHaveLength(1);
      expect(entry[0]).toMatchObject({ status: "registered", source: "self", identifiers: { vest_colour: "blue", kite: { brand: "North" } } });
      expect(entry[0].identifiers).not.toHaveProperty("admin"); // unknown keys are dropped
      expect(entry[0].consent_at).not.toBeNull();
      expect((await f.clients.anon.from("riders").select("id")).data ?? []).toEqual([]);
      expect((await f.clients.anon.from("entries").select("id")).data ?? []).toEqual([]);
      expect(((await f.clients.anon.from("v_entries").select("first_name").eq("first_name", "Zed")).data ?? []).length).toBe(0); // not public until confirmed
      expect(((await f.clients.orgB.from("riders").select("id").eq("id", rider[0].id)).data ?? []).length).toBe(0);
    });

    it("the same email again re-uses the rider, adds nothing twice, and never overwrites what is already known", async () => {
      const before = (await f.s.from("riders").select("id, phone").eq("organisation_id", f.ids.orgA).ilike("email", "ana@private.example.com")).data!;
      const entriesBefore = (await f.s.from("entries").select("id").eq("rider_id", before[0].id)).data!.length;
      expect(before).toHaveLength(1);
      const again = await reg(slugA1(), f.ids.divA1, fields("ANA@private.example.com", { phone: "+9999999" }), {}, true, `ip-${run}-again`);
      expect(again.data).toEqual({ ok: true }); // looks exactly like a new registration: no way to probe who is registered
      const after = (await f.s.from("riders").select("id, phone").eq("organisation_id", f.ids.orgA).ilike("email", "ana@private.example.com")).data!;
      expect(after).toHaveLength(1);
      expect(after[0].phone).toBe(before[0].phone);
      expect((await f.s.from("entries").select("id").eq("rider_id", before[0].id)).data!.length).toBe(entriesBefore);
    });

    it("the same email in another organisation is a different rider (one record per person per organisation)", async () => {
      await setSettings({ registrationOpen: true }, f.ids.evB1);
      expect((await reg(`rls-b1-${run}`, f.ids.divB1, fields("zed@example.com"), {}, true, `ip-${run}-b`)).data).toEqual({ ok: true });
      const riders = (await f.s.from("riders").select("organisation_id").ilike("email", "zed@example.com").in("organisation_id", [f.ids.orgA, f.ids.orgB])).data!;
      expect(riders.map((r) => r.organisation_id).sort()).toEqual([f.ids.orgA, f.ids.orgB].sort());
    });

    it("the closing date counts the whole closing day, in the event's time zone", async () => {
      await setSettings({ registrationOpen: true, registrationClosesOn: "2000-01-01" });
      expect(codeOf(await reg(slugA1(), f.ids.divA1, fields("late@example.com"), {}, true, `ip-${run}-late`))).toBe("REGISTRATION_CLOSED");
      await setSettings({ registrationOpen: true, registrationClosesOn: today() });
      expect((await reg(slugA1(), f.ids.divA1, fields("lastday@example.com"), {}, true, `ip-${run}-late2`)).data).toEqual({ ok: true });
      await setSettings({ registrationOpen: true, registrationClosesOn: null });
    });

    it("refuses missing consent, a bad email, a division of another event, and over-long text", async () => {
      expect(codeOf(await reg(slugA1(), f.ids.divA1, fields("c@example.com"), {}, false, `ip-${run}-v`))).toBe("CONSENT_REQUIRED");
      const bad = await reg(slugA1(), f.ids.divA1, fields("not-an-email"), {}, true, `ip-${run}-v`);
      expect(bad.data).toMatchObject({ ok: false, error: "INVALID_FIELDS", field: "email" });
      expect(codeOf(await reg(slugA1(), f.ids.divB1, fields("d@example.com"), {}, true, `ip-${run}-v`))).toBe("DIVISION_NOT_FOUND");
      expect((await reg(slugA1(), f.ids.divA1, fields("e@example.com", { sponsor: "x".repeat(101) }), {}, true, `ip-${run}-v2`)).data).toMatchObject({ ok: false, error: "INVALID_FIELDS" });
    });

    it("is rate limited per address: the sixth try within the hour is refused, another address is unaffected", async () => {
      const ip = `ip-${run}-flood`;
      for (let i = 0; i < 5; i++) expect(codeOf(await reg(slugA1(), f.ids.divA1, fields(`flood${i}@example.com`), {}, true, ip))).toBe("");
      expect(codeOf(await reg(slugA1(), f.ids.divA1, fields("flood5@example.com"), {}, true, ip))).toBe("RATE_LIMITED");
      expect(codeOf(await reg(slugA1(), f.ids.divA1, fields("other@example.com"), {}, true, `ip-${run}-calm`))).toBe("");
    });
  });

  // ------------------------------------------------------------------ Phase 4a-1: official self-add
  describe("official self-add (request_seat)", () => {
    const ask = (slug: string, name: string, role: string, ip = `ip-${run}-seat`) => f.s.rpc("request_seat", { p_event_slug: slug, p_name: name, p_role: role, p_ip: ip });

    it("nobody but the server can call it", async () => {
      for (const c of [f.clients.anon, f.clients.orgA, f.clients.j1]) {
        expect(failed(await c.rpc("request_seat", { p_event_slug: `rls-a1-${run}`, p_name: "Sneaky", p_role: "judge", p_ip: "1.1.1.1" }))).not.toBe("");
      }
    });

    it("creates a pending seat with no PIN and no access; organisers of that event see it, others do not", async () => {
      expect((await ask(`rls-a1-${run}`, "Pat Pending", "judge")).data).toEqual({ ok: true });
      const seat = (await f.s.from("judge_seats").select("id, status, role, active, scores, pin_hash, auth_user_id").eq("event_id", f.ids.evA1).eq("name", "Pat Pending")).data!;
      expect(seat).toHaveLength(1);
      expect(seat[0]).toMatchObject({ status: "pending", role: "judge", scores: false, pin_hash: null, auth_user_id: null });
      expect(((await f.clients.orgA.from("judge_seats").select("id").eq("id", seat[0].id)).data ?? []).length).toBe(1);
      expect(((await f.clients.orgB.from("judge_seats").select("id").eq("id", seat[0].id)).data ?? []).length).toBe(0);
      expect(((await f.clients.anon.from("judge_seats").select("id")).data ?? []).length).toBe(0);
      const join = await f.s.rpc("bind_seat_by_pin", { p_event: f.ids.evA1, p_pin: "123456", p_user: f.userIds.orgA, p_ip: `ip-${run}-pin` });
      expect(codeOf(join)).toBe("INVALID_PIN"); // a pending seat has no PIN to join with
    });

    it("pressing the button twice adds one seat; the head judge role cannot be requested; names are checked", async () => {
      await ask(`rls-a1-${run}`, "Dana Double", "spotter");
      await ask(`rls-a1-${run}`, "dana double", "spotter");
      expect(((await f.s.from("judge_seats").select("id").eq("event_id", f.ids.evA1).ilike("name", "dana double")).data ?? []).length).toBe(1);
      expect(codeOf(await ask(`rls-a1-${run}`, "Hank Head", "head"))).toBe("INVALID_ROLE");
      expect(codeOf(await ask(`rls-a1-${run}`, "X", "judge"))).toBe("INVALID_NAME");
      expect(codeOf(await ask("no-such-event-" + run, "Nora Nobody", "judge"))).toBe("EVENT_NOT_FOUND");
    });

    it("is rate limited per address and capped at 50 pending seats per event", async () => {
      const ip = `ip-${run}-seatflood`;
      for (let i = 0; i < 5; i++) expect(codeOf(await ask(`rls-b1-${run}`, `Flood ${i}`, "judge", ip))).toBe("");
      expect(codeOf(await ask(`rls-b1-${run}`, "Flood 5", "judge", ip))).toBe("RATE_LIMITED");
      const rows = Array.from({ length: 50 }, (_, i) => ({ event_id: f.ids.evB1, name: `Bulk ${i}`, role: "judge", status: "pending", active: true }));
      await f.s.from("judge_seats").insert(rows);
      expect(codeOf(await ask(`rls-b1-${run}`, "One too many", "judge", `ip-${run}-seatcap`))).toBe("TOO_MANY_PENDING");
    });

    it("the attempt log is unreadable to everyone but the server", async () => {
      for (const c of [f.clients.anon, f.clients.orgA, f.clients.j1]) {
        const r = await c.from("form_attempts").select("id").limit(1);
        expect(r.error ? "denied" : (r.data ?? []).length).toSatisfy((v: unknown) => v === "denied" || v === 0);
      }
      expect((await f.s.from("form_attempts").select("id", { count: "exact", head: true })).count).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------ regression: users with no seat in the event
  describe("a signed-in user with no seat or membership in an event cannot touch its attempts", () => {
    it("neither a judge of another event nor another organisation's organiser can add or delete attempts", async () => {
      const before = (await f.s.from("trick_attempts").select("id", { count: "exact", head: true }).eq("heat_id", f.ids.H1)).count;
      for (const [who, c] of [["judge of another event", f.clients.bJudge], ["other organiser", f.clients.orgB]] as const) {
        expect(failed(await c.rpc("add_attempt", { p_heat: f.ids.H1, p_entry: f.ids.e1, p_client_key: uuid(), p_status: "landed" })), `add: ${who}`).toContain("NOT_ALLOWED");
        expect(failed(await c.rpc("delete_attempt", { p_attempt: f.ids.attH1, p_reason: "not mine to delete" })), `delete: ${who}`).toContain("NOT_ALLOWED");
      }
      const after = (await f.s.from("trick_attempts").select("id", { count: "exact", head: true }).eq("heat_id", f.ids.H1)).count;
      expect(after).toBe(before);
      expect((await f.s.from("trick_attempts").select("deleted_at").eq("id", f.ids.attH1).single()).data!.deleted_at).toBeNull();
    });
  });

  // ------------------------------------------------------------------ publish hold (UX round)
  describe("publish hold: a published result can be held back from the public site and released later", () => {
    const hold = (c: Fixture["clients"]["orgA"], hold: boolean, reason: string | null = "Podium ceremony first") =>
      c.rpc("set_publish_hold", { p_heat: f.ids.H3, p_hold: hold, p_reason: reason });
    const publicRows = async () => ((await f.clients.anon.from("heat_results").select("id").eq("heat_id", f.ids.H3)).data ?? []).length;

    it("starts released: the public sees the published result", async () => {
      expect(await publicRows()).toBe(1);
    });

    it("visitors, judges, spotters and other organisations cannot hold or release", async () => {
      for (const [who, c] of [["anon", f.clients.anon], ["judge", f.clients.j1], ["spotter", f.clients.spotter], ["other organiser", f.clients.orgB]] as const) {
        expect(failed(await hold(c, true)), who).not.toBe("");
      }
      expect(await publicRows()).toBe(1);
    });

    it("editing the column directly does nothing, even for the organiser", async () => {
      await f.clients.orgA.from("heats").update({ publish_hold: true }).eq("id", f.ids.H3);
      expect((await f.s.from("heats").select("publish_hold").eq("id", f.ids.H3).single()).data!.publish_hold).toBe(false);
    });

    it("holding needs a reason; the organiser holds; the public no longer sees the result but organisers and officials do", async () => {
      expect(failed(await hold(f.clients.orgA, true, " "))).toContain("REASON_REQUIRED");
      expect(failed(await hold(f.clients.orgA, true))).toBe("");
      expect(await publicRows()).toBe(0);
      expect(((await f.clients.orgA.from("heat_results").select("id").eq("heat_id", f.ids.H3)).data ?? []).length).toBe(1);
      expect(((await f.clients.head.from("heat_results").select("id").eq("heat_id", f.ids.H3)).data ?? []).length).toBe(1);
    });

    it("the head judge releases it and the public sees it again; both steps are audited", async () => {
      expect(failed(await hold(f.clients.head, false, null))).toBe("");
      expect(await publicRows()).toBe(1);
      expect(failed(await hold(f.clients.head, true, "Hold for the podium"))).toBe("");
      expect(await publicRows()).toBe(0);
      expect(failed(await hold(f.clients.orgA, false, null))).toBe("");
      const log = (await f.s.from("audit_log").select("action, reason").eq("event_id", f.ids.evA1).eq("row_id", f.ids.H3).in("action", ["publish_hold", "publish_release"])).data ?? [];
      expect(log.map((l) => l.action).sort()).toEqual(["publish_hold", "publish_hold", "publish_release", "publish_release"]);
      expect(log.find((l) => l.reason === "Hold for the podium")).toBeTruthy();
    });
  });

  // ------------------------------------------------------------------ after everything above
  describe("after all the activity above", () => {
    it("a visitor and a rival organiser still see none of the private data that now exists", async () => {
      for (const t of ["riders", "entries", "judge_seats", "trick_attempts", "trick_scores", "impression_scores", "penalties", "audit_log", "join_attempts"]) {
        const r = await f.clients.anon.from(t).select("*").limit(5);
        expect(r.error ? "denied" : (r.data ?? []).length, `anon ${t}`).toSatisfy((v: unknown) => v === "denied" || v === 0);
      }
      for (const t of ["trick_attempts", "trick_scores", "impression_scores", "audit_log", "judge_seats"]) {
        const { count } = await f.s.from(t).select("id", { count: "exact", head: true }).eq("event_id", f.ids.evA1);
        expect(count, `service sees ${t}`).toBeGreaterThan(0); // the data really is there…
        const r = await f.clients.orgB.from(t).select("id").eq("event_id", f.ids.evA1);
        expect((r.data ?? []).length, `rival organiser ${t}`).toBe(0); // …and the rival cannot see it
      }
    });
  });
});
