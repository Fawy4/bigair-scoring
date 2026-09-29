import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, failed, run, service, anonClient, uuid, type Fixture } from "./helpers";

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
      expect(rows.length).toBeGreaterThanOrEqual(24);
      expect(rows.filter((r) => !r.rls_enabled)).toEqual([]);
      const serviceOnly = ["join_attempts"];
      expect(rows.filter((r) => r.policy_count === 0 && !serviceOnly.includes(r.table_name))).toEqual([]);
      expect(rows.filter((r) => r.anon_can_write)).toEqual([]);
      expect(rows.find((r) => r.table_name === "join_attempts")).toMatchObject({ anon_can_select: false, authenticated_can_write: false });
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
    it("marks are refused before the heat starts and after the grace period, allowed inside the grace period", async () => {
      expect(failed(await mark("j1", f.ids.attH2, 6))).not.toBe("");   // scheduled
      expect(failed(await mark("j1", f.ids.attH3, 6))).not.toBe("");   // ended long ago
      expect(failed(await mark("j1", f.ids.attH5, 6))).not.toBe("");   // timer expired past grace
      expect((await mark("j1", f.ids.attH4, 6)).error).toBeNull();     // timer expired 50 s ago, grace 180 s
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
    it("impression marks are only accepted once the heat has ended (inside the grace period)", async () => {
      const imp = (heat: string) => f.clients.j1.rpc("submit_impression", { p_heat: heat, p_entry: f.ids.e1, p_value: 7, p_client_key: uuid(), p_client_rev: 1 });
      expect(failed(await imp(f.ids.H1))).not.toBe("");   // still running
      expect((await imp(f.ids.H4)).error).toBeNull();     // timer ended 50 s ago
      expect(failed(await imp(f.ids.H5))).not.toBe("");   // past grace
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
      const r = await f.clients.head.from("heats").update({ status: "running", started_at: "2020-01-01T00:00:00Z" }).eq("id", f.ids.H6).select("status,started_at").single();
      expect(r.error).toBeNull();
      expect(Math.abs(Date.now() - new Date(r.data!.started_at).getTime())).toBeLessThan(60_000);
    });
    it("pause and resume accumulate paused time on the server", async () => {
      const p = await f.clients.head.from("heats").update({ status: "paused" }).eq("id", f.ids.H6).select("status,paused_at").single();
      expect(p.data!.paused_at).not.toBeNull();
      const r = await f.clients.head.from("heats").update({ status: "running" }).eq("id", f.ids.H6).select("status,paused_at,paused_total_sec").single();
      expect(r.data!.paused_at).toBeNull();
      expect(r.data!.paused_total_sec).toBeGreaterThanOrEqual(0);
    });
    it("only the server can publish; illegal jumps are refused; spotters and judges cannot touch heats", async () => {
      expect(failed(await f.clients.head.from("heats").update({ status: "published" }).eq("id", f.ids.H6))).not.toBe("");
      expect(failed(await f.clients.head.from("heats").update({ status: "scheduled" }).eq("id", f.ids.H6))).not.toBe("");
      for (const c of ["spotter", "j1", "announcer"] as const) expect(((await f.clients[c].from("heats").update({ status: "ended" }).eq("id", f.ids.H6).select()).data ?? []).length, c).toBe(0);
      expect((await f.clients.head.from("heats").update({ status: "ended" }).eq("id", f.ids.H6)).error).toBeNull();
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
      expect(data.user?.is_anonymous).toBe(true);
      await f.s.rpc("set_seat_pin", { p_seat: f.ids.seat_j3, p_pin: "246810" });
      expect((await bind("246810", data.user!.id, `ip3-${run}`)).error).toBeNull();
      expect(((await phone.from("judge_seats").select("id,role")).data ?? [])[0]).toMatchObject({ id: f.ids.seat_j3, role: "judge" });
      await f.s.auth.admin.deleteUser(data.user!.id);
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
    it("system presets are readable by everyone; organisation presets by their members, the public only when a published event uses them", async () => {
      const sys = await f.s.from("scoring_models").insert({ organisation_id: null, key: `rls-${run}-system`, name: "sys", version: 1, json: {}, content_hash: "z" }).select().single();
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
