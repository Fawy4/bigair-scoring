import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, anonClient, type Fixture } from "./helpers";
import { codeOf } from "./live-helpers";

// The event simulator: every function is refused on an event that is not a simulation, and for anybody who is not an organiser of it; a copy is never public (its own
// organiser can preview it); a virtual seat acts through the same functions a phone uses; the fast clock divides the heat; Reset and delete work and touch only the copy.
describe.skipIf(!ENV_OK)("Simulator (hosted development project)", () => {
  let f: Fixture;
  let real: string; // a real (non-simulation) event of organisation A, not run yet
  let heat0: string;
  let spotterSeat0: string;
  let sim: string; // its copy
  let simSlug: string;
  let simHeat: string;
  let simEntry: string;
  const seats: Record<string, string> = {};
  const virtualUsers: string[] = [];

  beforeAll(async () => {
    f = await buildFixture();
    const s = f.s;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const must = async (p: PromiseLike<{ data: any; error: { message: string } | null }>, what: string): Promise<Record<string, any>> => {
      const r = await p;
      if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message}`);
      return r.data;
    };
    real = (await must(s.from("events").insert({ organisation_id: f.ids.orgA, name: "Sim source", slug: `rls-sim-src-${f.ids.orgA.slice(0, 6)}-${Date.now() % 100000}`, status: "published", timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11" }).select("id").single(), "event")).id;
    const panel = (await must(s.from("panels").insert({ event_id: real, name: "Panel" }).select("id").single(), "panel")).id;
    const division = (await must(s.from("divisions").insert({ event_id: real, name: "Pro", sort_order: 1, scoring_model_id: f.ids.modelA1, scoring_overrides: { heat: { maxAttemptsPerRider: 3 } } as never, panel_id: panel, draw_locked_at: new Date().toISOString() }).select("id").single(), "division")).id;
    const round = (await must(s.from("rounds").insert({ division_id: division, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} }).select("id").single(), "round")).id;
    const entries: string[] = [];
    for (let n = 1; n <= 3; n++) {
      const rider = (await must(s.from("riders").insert({ organisation_id: f.ids.orgA, first_name: `Sim${n}`, last_name: "Rider" }).select("id").single(), "rider")).id;
      entries.push((await must(s.from("entries").insert({ division_id: division, rider_id: rider, seed: n, status: "confirmed", source: "manual" }).select("id").single(), "entry")).id);
    }
    heat0 = (await must(s.from("heats").insert({ round_id: round, division_id: division, event_id: real, number: 1, duration_sec: 600 }).select("id").single(), "heat")).id;
    for (let p = 1; p <= 3; p++) await must(s.from("heat_slots").insert({ heat_id: heat0, position: p, entry_id: entries[p - 1] }).select("id").single(), "slot");
    let seatNo = 0;
    for (const [key, name, role] of [["j1", "Judge 1", "judge"], ["j2", "Judge 2", "judge"], ["j3", "Judge 3", "judge"], ["head", "Head", "head"], ["spotter", "Spotter", "spotter"]] as const) {
      const id = (await must(s.from("judge_seats").insert({ event_id: real, name, role, scores: role === "judge", status: "active", active: true }).select("id").single(), "seat")).id;
      if (role === "judge") await must(s.from("panel_members").insert({ panel_id: panel, judge_seat_id: id, seat_no: ++seatNo }).select("id").single(), "member");
      if (key === "spotter") spotterSeat0 = id;
    }
    const cloned = await f.clients.orgA.rpc("clone_event_as_simulation", { p_event: real, p_name: "Sim copy" });
    if (cloned.error) throw new Error(cloned.error.message);
    const made = cloned.data as { event_id: string; slug: string; seats: Array<{ seat_id: string; name: string }> };
    sim = made.event_id;
    simSlug = made.slug;
    for (const x of made.seats) seats[x.name] = x.seat_id;
    simHeat = (await must(s.from("heats").select("id").eq("event_id", sim).single(), "sim heat")).id;
    simEntry = (await must(s.from("heat_slots").select("entry_id").eq("heat_id", simHeat).eq("position", 1).single(), "sim slot")).entry_id as string;
  });

  afterAll(async () => {
    if (!f) return;
    for (const u of virtualUsers) await f.s.auth.admin.deleteUser(u).catch(() => undefined);
    await f.cleanup();
  });

  const fns = (event: string, seat: string, heat: string, entry: string) => ({
    sim_enable: { p_event: event },
    sim_stats: { p_event: event },
    sim_set: { p_event: event, p_patch: { speed: 5 } },
    sim_set_mode: { p_seat: seat, p_mode: "real" },
    sim_tick_lock: { p_event: event, p_ms: 1000 },
    sim_tick_begin: { p_event: event, p_ms: 1000 },
    sim_tick_end: { p_event: event, p_token: randomUUID() },
    sim_pause_heats: { p_event: event },
    sim_resume_heats: { p_event: event },
    sim_release_stale_views: { p_event: event, p_silent_sec: 90, p_leave_grace_sec: 6 },
    sim_log_add: { p_event: event, p_kind: "info", p_scenario: null, p_text: "x", p_data: {} },
        sim_view_as: { p_event: event, p_seat: seat },
    sim_live_heat: { p_heat: heat },
    sim_rebuild: { p_event: event, p_slug_confirm: "x" },
    sim_after_reset: { p_event: event },
    sim_delete: { p_event: event, p_slug_confirm: "x" },
    sim_add_attempt: { p_seat: seat, p_heat: heat, p_entry: entry, p_trick: { name: "x" }, p_status: "landed", p_client_key: randomUUID(), p_override_reason: null },
    sim_submit_score: { p_seat: seat, p_attempt: randomUUID(), p_criteria: {}, p_score: 5, p_missed: false, p_client_key: randomUUID(), p_client_rev: 1 },
    sim_submit_impression: { p_seat: seat, p_heat: heat, p_entry: entry, p_value: 5, p_client_key: randomUUID(), p_client_rev: 1 },
    sim_submit_sheet: { p_seat: seat, p_heat: heat },
  });

  it("every simulator function is refused on an event that is not a simulation", async () => {
    const e = await f.s.from("heat_slots").select("entry_id").eq("heat_id", f.ids.H1).limit(1).single();
    const args = fns(f.ids.evA1, f.ids.seat_spotter, f.ids.H1, e.data!.entry_id as string);
    for (const [name, a] of Object.entries(args)) {
      if (name === "sim_submit_score") continue; // the attempt is looked up first
      const r = await f.clients.orgA.rpc(name as never, a as never);
      expect(codeOf(r), name).toContain("NOT_A_SIMULATION");
    }
    const score = await f.clients.orgA.rpc("sim_submit_score", { ...args.sim_submit_score, p_attempt: f.ids.attH1 } as never);
    expect(codeOf(score)).toContain("NOT_A_SIMULATION");
  });

  it("and for everybody who is not an organiser of the simulation: another organisation, a judge, a spotter, a visitor", async () => {
    const e = simEntry;
    const args = fns(sim, seats["Spotter"], simHeat, e);
    for (const who of ["orgB", "j1", "spotter", "head"] as const) {
      for (const [name, a] of Object.entries(args)) {
        if (name === "sim_submit_score") continue;
        const r = await f.clients[who].rpc(name as never, a as never);
        expect(codeOf(r), `${who} ${name}`).toMatch(/NOT_ALLOWED/);
      }
    }
    for (const [name, a] of Object.entries(args)) {
      const r = await f.clients.anon.rpc(name as never, a as never);
      expect(codeOf(r), `anon ${name}`).toMatch(/permission denied|not found|Could not find/i);
    }
    // cloning is for organisers of the source too
    expect(codeOf(await f.clients.orgB.rpc("clone_event_as_simulation", { p_event: real }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.j1.rpc("clone_event_as_simulation", { p_event: real }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.anon.rpc("clone_event_as_simulation", { p_event: real }))).toMatch(/permission denied/i);
  });

  it("binding a login to a seat is the server's alone", async () => {
    expect(codeOf(await f.clients.orgA.rpc("sim_bind_virtual", { p_seat: seats["Spotter"], p_user: f.userIds.orgA }))).toMatch(/permission denied/i);
  });

  it("the simulator's tables are for the event's organisers only, and the saved starting point is for nobody's browser", async () => {
    expect((await f.clients.orgA.from("sim_control").select("event_id").eq("event_id", sim)).data?.length).toBe(1);
    expect((await f.clients.orgB.from("sim_control").select("event_id").eq("event_id", sim)).data ?? []).toHaveLength(0);
    expect((await f.clients.orgB.from("sim_log").select("id").eq("event_id", sim)).data ?? []).toHaveLength(0);
    expect((await f.clients.orgB.from("sim_seats").select("seat_id").eq("event_id", sim)).data ?? []).toHaveLength(0);
    expect(codeOf(await f.clients.orgA.from("sim_baseline").select("event_id"))).toMatch(/permission denied/i);
    expect(codeOf(await f.clients.orgA.from("sim_clock").select("heat_id"))).toMatch(/permission denied/i);
    expect(codeOf(await f.clients.anon.from("sim_control").select("event_id"))).toMatch(/permission denied/i);
  });

  it("a copy has the same divisions, riders, officials (no PINs yet), locked draw and heats; the source is untouched and an already-run event is refused", async () => {
    const count = async (table: string, event: string) => (await f.s.from(table).select("id", { count: "exact", head: true }).eq("event_id", event)).count;
    for (const t of ["divisions", "entries", "heats", "heat_slots", "judge_seats", "panel_members"]) expect(await count(t, sim), t).toBe(await count(t, real));
    expect((await f.s.from("events").select("is_simulation, simulation_of, status").eq("id", sim).single()).data).toMatchObject({ is_simulation: true, simulation_of: real });
    expect((await f.s.from("events").select("is_simulation").eq("id", real).single()).data?.is_simulation).toBe(false);
    expect((await f.s.from("divisions").select("draw_locked_at").eq("event_id", sim).single()).data?.draw_locked_at).not.toBeNull();
    expect((await f.s.from("judge_seats").select("pin_hash").eq("event_id", sim)).data?.every((r) => r.pin_hash === null)).toBe(true);
    // the copy points at its own riders' seats, never the source's
    const srcEntries = (await f.s.from("entries").select("id").eq("event_id", real)).data!.map((r) => r.id);
    const simEntries = (await f.s.from("entries").select("id").eq("event_id", sim)).data!.map((r) => r.id);
    expect(simEntries.some((id) => srcEntries.includes(id))).toBe(false);
    expect(codeOf(await f.clients.orgA.rpc("clone_event_as_simulation", { p_event: f.ids.evA1 }))).toContain("SOURCE_ALREADY_RUN");
  });

  it("a simulation is never public: not to a visitor, not to another organiser; its own organiser may preview it", async () => {
    const visitor = await anonClient().rpc("get_public_site", { p_slug: simSlug });
    expect((visitor.data as { found: boolean }).found).toBe(false);
    expect(((await anonClient().rpc("get_public_results", { p_event: sim })).data as { allowed: boolean }).allowed).toBe(false);
    expect(((await f.clients.orgB.rpc("get_public_site", { p_slug: simSlug })).data as { found: boolean }).found).toBe(false);
    expect(((await f.clients.j1.rpc("get_public_results", { p_event: sim })).data as { allowed: boolean }).allowed).toBe(false);
    expect(((await f.clients.orgA.rpc("get_public_site", { p_slug: simSlug })).data as { found: boolean }).found).toBe(true);
    expect(((await f.clients.orgA.rpc("get_public_results", { p_event: sim })).data as { allowed: boolean }).allowed).toBe(true);
    const list = await anonClient().rpc("get_public_events", { p_limit: 100 });
    expect(((list.data ?? []) as Array<{ slug: string }>).some((e) => e.slug === simSlug)).toBe(false);
    // the real event is as public as before
    expect(((await anonClient().rpc("get_public_results", { p_event: f.ids.evA1 })).data as { allowed: boolean }).allowed).toBe(true);
  });

  it("virtual seats act through the same functions a phone uses; a seat a person holds is left alone", async () => {
    const mk = async (tag: string) => {
      const { data, error } = await f.s.auth.admin.createUser({ email: `rls-sim-${tag.replace(/\W/g, "")}-${randomUUID().slice(0, 6)}@example.com`, email_confirm: true });
      if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
      virtualUsers.push(data.user.id);
      return data.user.id;
    };
    for (const name of Object.keys(seats)) {
      const r = await f.s.rpc("sim_bind_virtual", { p_seat: seats[name], p_user: await mk(name) });
      expect((r.data as { ok: boolean }).ok, name).toBe(true);
    }
    expect(codeOf(await f.clients.orgA.rpc("sim_set", { p_event: sim, p_patch: { speed: 10 } }))).toBe("");
    // the fast clock: the heat's length is divided when it starts, and the original is kept
    expect(codeOf(await f.clients.orgA.rpc("start_heat", { p_heat: simHeat }))).toBe("");
    expect((await f.s.from("heats").select("duration_sec").eq("id", simHeat).single()).data?.duration_sec).toBe(60);
    expect((await f.s.from("sim_clock").select("original_sec, speed").eq("heat_id", simHeat).single()).data).toEqual({ original_sec: 600, speed: 10 });
    // the real heat is untouched
    expect((await f.s.from("heats").select("duration_sec, status").eq("id", heat0).single()).data).toEqual({ duration_sec: 600, status: "scheduled" });
    // a spotter logs through add_attempt, as the seat
    const a = await f.clients.orgA.rpc("sim_add_attempt", { p_seat: seats["Spotter"], p_heat: simHeat, p_entry: simEntry, p_trick: { name: "Backroll", direction: "left" }, p_status: "landed", p_client_key: randomUUID(), p_override_reason: null });
    expect(codeOf(a)).toBe("");
    const att = a.data as unknown as { id: string; created_by_seat: string };
    expect(att.created_by_seat).toBe(seats["Spotter"]);
    // the cap of 3 holds for a virtual spotter exactly as for a phone
    for (let i = 0; i < 2; i++) expect(codeOf(await f.clients.orgA.rpc("sim_add_attempt", { p_seat: seats["Spotter"], p_heat: simHeat, p_entry: simEntry, p_trick: { name: `T${i}` }, p_status: "landed", p_client_key: randomUUID(), p_override_reason: null }))).toBe("");
    expect(codeOf(await f.clients.orgA.rpc("sim_add_attempt", { p_seat: seats["Spotter"], p_heat: simHeat, p_entry: simEntry, p_trick: { name: "extra" }, p_status: "landed", p_client_key: randomUUID(), p_override_reason: null }))).toContain("ATTEMPT_CAP_REACHED");
    // judges score through submit_trick_score
    for (const j of ["Judge 1", "Judge 2", "Judge 3"]) expect(codeOf(await f.clients.orgA.rpc("sim_submit_score", { p_seat: seats[j], p_attempt: att.id, p_criteria: {}, p_score: 6.5, p_missed: false, p_client_key: randomUUID(), p_client_rev: 1 })), j).toBe("");
    expect((await f.s.from("trick_scores").select("id", { count: "exact", head: true }).eq("attempt_id", att.id)).count).toBe(3);
    // a seat set to real, or taken by a person, is refused
    expect(codeOf(await f.clients.orgA.rpc("sim_set_mode", { p_seat: seats["Judge 3"], p_mode: "real" }))).toBe("");
    expect(codeOf(await f.clients.orgA.rpc("sim_submit_score", { p_seat: seats["Judge 3"], p_attempt: att.id, p_criteria: {}, p_score: 6.5, p_missed: false, p_client_key: randomUUID(), p_client_rev: 2 }))).toContain("SEAT_IS_REAL");
    await f.clients.orgA.rpc("sim_set_mode", { p_seat: seats["Judge 3"], p_mode: "virtual" });
    // the live view for the preview works for the organiser only (and only where the event shows live scores at all)
    await f.s.from("events").update({ settings: { publicLiveScores: "live" } as never }).eq("id", sim);
    expect(((await f.clients.orgA.rpc("sim_live_heat", { p_heat: simHeat })).data as { allowed: boolean }).allowed).toBe(true);
    expect(codeOf(await f.clients.orgB.rpc("sim_live_heat", { p_heat: simHeat }))).toContain("NOT_ALLOWED");
  });

  it("View as gives one seat to the organiser's own sign-in, one at a time", async () => {
    const r = await f.clients.orgA.rpc("sim_view_as", { p_event: sim, p_seat: seats["Judge 1"] });
    expect((r.data as { ok: boolean }).ok).toBe(true);
    expect((await f.s.from("judge_seats").select("auth_user_id").eq("id", seats["Judge 1"]).single()).data?.auth_user_id).toBe(f.userIds.orgA);
    await f.clients.orgA.rpc("sim_view_as", { p_event: sim, p_seat: seats["Judge 2"] });
    expect((await f.s.from("judge_seats").select("auth_user_id").eq("id", seats["Judge 1"]).single()).data?.auth_user_id).toBeNull();
    await f.clients.orgA.rpc("sim_view_as", { p_event: sim, p_seat: null });
    expect((await f.s.from("judge_seats").select("auth_user_id").eq("id", seats["Judge 2"]).single()).data?.auth_user_id).toBeNull();
  });

  it("Polish 2: a View-as seat goes back to the simulator — when its tab closes (after a short grace for a reload), when it goes quiet, or when Virtual is chosen", async () => {
    const org = f.clients.orgA;
    const holder = async (seat: string) => (await f.s.from("judge_seats").select("auth_user_id").eq("id", seats[seat]).single()).data?.auth_user_id ?? null;
    const release = (grace = 0, silent = 90) => org.rpc("sim_release_stale_views", { p_event: sim, p_silent_sec: silent, p_leave_grace_sec: grace });
    expect(codeOf(await org.rpc("sim_view_as", { p_event: sim, p_seat: seats["Judge 1"] }))).toBe("");
    expect((await f.s.from("sim_seats").select("viewed_by").eq("seat_id", seats["Judge 1"]).single()).data?.viewed_by).toBe(f.userIds.orgA);
    // the tab beats; nobody else's beat or leave does anything
    expect((await org.rpc("sim_view_beat", { p_event: sim })).data).toBe(true);
    expect((await f.clients.orgB.rpc("sim_view_beat", { p_event: sim })).data).toBe(false);
    expect((await f.clients.j1.rpc("sim_view_leave", { p_event: sim })).data).toBe(false);
    // a fresh tab is kept
    expect((await release(6)).data).toEqual([]);
    expect(await holder("Judge 1")).toBe(f.userIds.orgA);
    // a reload: leave, then beat again → kept
    await org.rpc("sim_view_leave", { p_event: sim });
    await new Promise((r) => setTimeout(r, 1100));
    await org.rpc("sim_view_beat", { p_event: sim });
    expect((await release(0)).data).toEqual([]);
    expect(await holder("Judge 1")).toBe(f.userIds.orgA);
    // the tab closes: leave, no beat → given back
    await org.rpc("sim_view_leave", { p_event: sim });
    await new Promise((r) => setTimeout(r, 1100));
    expect((await release(0)).data).toEqual(["Judge 1"]);
    expect(await holder("Judge 1")).toBeNull();
    expect((await f.s.from("sim_seats").select("viewed_by").eq("seat_id", seats["Judge 1"]).single()).data?.viewed_by).toBeNull();
    // a tab that went quiet (a phone asleep) → given back
    await org.rpc("sim_view_as", { p_event: sim, p_seat: seats["Judge 2"] });
    await f.s.from("sim_seats").update({ view_seen_at: new Date(Date.now() - 200_000).toISOString() }).eq("seat_id", seats["Judge 2"]);
    expect((await release(6, 90)).data).toEqual(["Judge 2"]);
    expect(await holder("Judge 2")).toBeNull();
    // Virtual gives the seat back at once, from View as and from a phone that joined with the PIN
    await org.rpc("sim_view_as", { p_event: sim, p_seat: seats["Judge 2"] });
    expect(codeOf(await org.rpc("sim_set_mode", { p_seat: seats["Judge 2"], p_mode: "virtual" }))).toBe("");
    expect(await holder("Judge 2")).toBeNull();
    await f.s.from("judge_seats").update({ auth_user_id: f.userIds.j1 }).eq("id", seats["Judge 3"]);
    expect(codeOf(await org.rpc("sim_set_mode", { p_seat: seats["Judge 3"], p_mode: "virtual" }))).toBe("");
    expect(await holder("Judge 3")).toBeNull();
    // only the event's organisers may give seats back; never on a real event
    expect(codeOf(await f.clients.orgB.rpc("sim_release_stale_views", { p_event: sim, p_silent_sec: 90, p_leave_grace_sec: 6 }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.j1.rpc("sim_release_stale_views", { p_event: sim, p_silent_sec: 90, p_leave_grace_sec: 6 }))).toContain("NOT_ALLOWED");
    expect(codeOf(await org.rpc("sim_release_stale_views", { p_event: f.ids.evA1, p_silent_sec: 90, p_leave_grace_sec: 6 }))).toContain("NOT_A_SIMULATION");
  });

  it("Polish 2: the simulator's Pause pauses the heat clock (marked 'simulator'); Resume resumes only what it paused; the console's own Resume clears the mark", async () => {
    const org = f.clients.orgA;
    const row = async () => (await f.s.from("heats").select("status, paused_reason, paused_at").eq("id", simHeat).single()).data!;
    // a heat on the water with plenty of time left
    await f.s.from("heats").update({ status: "running", started_at: new Date().toISOString(), paused_at: null, paused_total_sec: 0, duration_sec: 600, ended_at: null }).eq("id", simHeat);
    expect(codeOf(await f.clients.orgB.rpc("sim_pause_heats", { p_event: sim }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.head.rpc("sim_pause_heats", { p_event: sim }))).toContain("NOT_ALLOWED");
    expect(codeOf(await org.rpc("sim_pause_heats", { p_event: f.ids.evA1 }))).toContain("NOT_A_SIMULATION");
    expect((await org.rpc("sim_pause_heats", { p_event: sim })).data).toBe(1);
    expect(await row()).toMatchObject({ status: "paused", paused_reason: "simulator" });
    expect((await row()).paused_at).not.toBeNull();
    // nobody sets or clears the mark by hand
    await org.from("heats").update({ paused_reason: null } as never).eq("id", simHeat);
    expect((await row()).paused_reason).toBe("simulator");
    expect((await org.rpc("sim_resume_heats", { p_event: sim })).data).toBe(1);
    expect(await row()).toMatchObject({ status: "running", paused_reason: null });
    // the head judge's own pause is theirs: the simulator's Resume leaves it
    expect(codeOf(await org.rpc("pause_heat", { p_heat: simHeat }))).toBe("");
    expect((await org.rpc("sim_resume_heats", { p_event: sim })).data).toBe(0);
    expect(await row()).toMatchObject({ status: "paused", paused_reason: null });
    expect(codeOf(await org.rpc("resume_heat", { p_heat: simHeat }))).toBe("");
    // paused by the simulator, resumed on the console: the mark goes with it
    await org.rpc("sim_pause_heats", { p_event: sim });
    expect(codeOf(await org.rpc("resume_heat", { p_heat: simHeat }))).toBe("");
    expect(await row()).toMatchObject({ status: "running", paused_reason: null });
  });

  it("Polish 2: a step gives the tick lock back when it is done, so the next step of the same page runs; a second step at the same moment is busy", async () => {
    const org = f.clients.orgA;
    const first = (await org.rpc("sim_tick_begin", { p_event: sim, p_ms: 30000 })).data as string | null;
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect((await org.rpc("sim_tick_begin", { p_event: sim, p_ms: 30000 })).data).toBeNull(); // a second tab while the step works
    expect((await org.rpc("sim_tick_end", { p_event: sim, p_token: randomUUID() })).data).toBe(false); // not its lock
    expect((await org.rpc("sim_tick_end", { p_event: sim, p_token: first })).data).toBe(true);
    const second = (await org.rpc("sim_tick_begin", { p_event: sim, p_ms: 30000 })).data as string | null;
    expect(second).toMatch(/^[0-9a-f-]{36}$/); // the page's next step runs at once
    expect((await org.rpc("sim_tick_end", { p_event: sim, p_token: second })).data).toBe(true);
  });

  it("Reset is the general one: a copy has the draw copy it needs; refused while a heat runs; then the simulator's own leftovers go and the panel starts again", async () => {
    // the copy of a locked division carries the draw it was locked with, so the general Reset can return to it
    const preview = await f.clients.orgA.rpc("reset_event_preview", { p_event: sim });
    expect(codeOf(preview)).toBe("");
    expect((preview.data as { divisions: Array<{ has_copy: boolean; drawn: boolean }> }).divisions.every((d) => !d.drawn || d.has_copy)).toBe(true);
    expect(((await f.clients.orgA.rpc("sim_stats", { p_event: sim })).data as { has_baseline: boolean }).has_baseline).toBe(true);
    // while a heat is running the general Reset refuses, and the simulator's own step does not run on a started event
    expect(codeOf(await f.clients.orgA.rpc("reset_event", { p_event: sim, p_slug: simSlug, p_reason: "Simulator reset", p_draws: [] }))).toContain("HEAT_RUNNING");
    expect(codeOf(await f.clients.orgA.rpc("sim_after_reset", { p_event: sim }))).toContain("NOT_RESET");
    expect(codeOf(await f.clients.orgB.rpc("sim_after_reset", { p_event: sim }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.orgA.rpc("end_heat", { p_heat: simHeat }))).toBe("");
    await f.s.from("wind_calls").insert({ event_id: sim, status: "red", message: "x" });
    expect(codeOf(await f.clients.orgA.rpc("reset_event", { p_event: sim, p_slug: "nope", p_reason: "Simulator reset", p_draws: [] }))).toContain("SLUG_MISMATCH");
    const r = await f.clients.orgA.rpc("reset_event", { p_event: sim, p_slug: simSlug, p_reason: "Simulator reset", p_draws: [] });
    expect(codeOf(r)).toBe("");
    expect((r.data as { attempts: number }).attempts).toBe(3);
    expect(codeOf(await f.clients.orgA.rpc("sim_after_reset", { p_event: sim }))).toBe("");
    expect((await f.s.from("trick_attempts").select("id", { count: "exact", head: true }).eq("event_id", sim)).count).toBe(0);
    expect((await f.s.from("trick_scores").select("id", { count: "exact", head: true }).eq("event_id", sim)).count).toBe(0);
    expect((await f.s.from("heats").select("status, started_at, ended_at, duration_sec").eq("id", simHeat).single()).data).toEqual({ status: "scheduled", started_at: null, ended_at: null, duration_sec: 600 });
    expect((await f.s.from("heat_slots").select("id", { count: "exact", head: true }).eq("heat_id", simHeat)).count).toBe(3);
    expect((await f.s.from("wind_calls").select("id", { count: "exact", head: true }).eq("event_id", sim)).count).toBe(0);
    expect((await f.s.from("sim_clock").select("heat_id", { count: "exact", head: true }).eq("event_id", sim)).count).toBe(0);
    expect((await f.s.from("sim_control").select("run_no, state").eq("event_id", sim).single()).data).toEqual({ run_no: 2, state: "stopped" });
    expect((await f.s.from("heats").select("status").eq("id", heat0).single()).data?.status).toBe("scheduled");
    expect(spotterSeat0).toBeTruthy();
  });

  it("an event with no starting draw copy is rebuilt: everything played goes and every draw is unlocked for the server to draw again", async () => {
    const { data: ev } = await f.s.from("events").insert({ organisation_id: f.ids.orgA, name: "Own sim 2", slug: `rls-own-sim2-${Date.now() % 1000000}`, status: "published", is_simulation: true }).select("id, slug").single();
    expect(codeOf(await f.clients.orgA.rpc("sim_enable", { p_event: ev!.id }))).toBe("");
    expect(codeOf(await f.clients.orgB.rpc("sim_rebuild", { p_event: ev!.id, p_slug_confirm: ev!.slug }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.orgA.rpc("sim_rebuild", { p_event: ev!.id, p_slug_confirm: "nope" }))).toContain("SLUG_MISMATCH");
    expect(codeOf(await f.clients.orgA.rpc("sim_rebuild", { p_event: ev!.id, p_slug_confirm: ev!.slug }))).toBe("");
    expect(codeOf(await f.clients.orgA.rpc("sim_rebuild", { p_event: f.ids.evA1, p_slug_confirm: "x" }))).toContain("NOT_A_SIMULATION");
  });

  it("delete: only a copy, with the typed address, by its organiser; the source stays", async () => {
    expect(codeOf(await f.clients.orgA.rpc("sim_delete", { p_event: sim, p_slug_confirm: "nope" }))).toContain("SLUG_MISMATCH");
    expect(codeOf(await f.clients.orgB.rpc("sim_delete", { p_event: sim, p_slug_confirm: simSlug }))).toContain("NOT_ALLOWED");
    const r = await f.clients.orgA.rpc("sim_delete", { p_event: sim, p_slug_confirm: simSlug });
    expect(codeOf(r)).toBe("");
    expect(((r.data as { users: string[] }).users ?? []).length).toBe(5);
    expect((await f.s.from("events").select("id").eq("id", sim)).data).toHaveLength(0);
    expect((await f.s.from("events").select("id").eq("id", real)).data).toHaveLength(1);
    expect((await f.s.from("audit_log").select("id", { count: "exact", head: true }).eq("event_id", sim)).count).toBe(0);
  });

  it("the Demo-style simulation event (not a copy) cannot be deleted by this function", async () => {
    const { data } = await f.s.from("events").insert({ organisation_id: f.ids.orgA, name: "Own sim", slug: `rls-own-sim-${Date.now() % 1000000}`, status: "published", is_simulation: true }).select("id, slug").single();
    expect(codeOf(await f.clients.orgA.rpc("sim_delete", { p_event: data!.id, p_slug_confirm: data!.slug }))).toContain("NOT_A_COPY");
  });
});
