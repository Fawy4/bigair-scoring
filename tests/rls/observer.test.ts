import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, buildFixture, ENV_OK, signedIn, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// The Observer seat (a read-only official): it reads everything the head judge reads, live, and the database refuses every write it tries, through every
// function an official (or an organiser, or the simulator) can call and every table an official can write. Its one call that changes a row is touch_seat
// ("I am here"), which only moves its own last-seen time. It never sits on a panel, the simulator never plays it, and the public pages never show it.
const MODEL = {
  trick: { entry: "single", scale: { min: 0, max: 10, step: 0.1 } },
  panel: { minJudges: 2 },
  heat: { impression: { scale: { min: 0, max: 10, step: 0.5 }, weight: 1, label: "Variety", required: true }, maxAttemptsPerRider: 5 },
};

/** Every function an official, an organiser or the simulator can call (granted to signed-in users), except the platform owner's admin_* ones (refused by `is_platform_*`, tested in platform.test.ts) and the plain reads listed in READS. */
const READS = new Set([
  "am_i_head", // answers false for an observer (checked below)
  "attempt_counts",
  "server_now",
  "has_password",
  "platform_session",
  "public_platform_settings",
  "get_public_draw",
  "get_public_event",
  "get_public_events",
  "get_public_live_heat",
  "get_public_organisation",
  "get_public_results",
  "get_public_rules",
  "get_public_site",
  "get_public_timetable",
  "sim_live_heat", // the public live view of a simulation heat (an observer of that simulation may read it)
  "touch_seat", // the one write an observer makes: its own last-seen time (checked below)
]);

describe.skipIf(!ENV_OK)("Observer seat (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  let obs: SupabaseClient;
  let obsUser: string;
  let obsSeat: string;
  let running: string; // a running heat with attempts, both judges' scores
  let ended: string; // an ended heat with scores, impressions, a sheet, a flag and a tie decision
  let attR: string;
  let attE1: string;
  let attE2: string;
  let flagId: string;
  let penaltyId: string;
  let planId: string;
  const users: string[] = [];
  const password = `Pw-${randomBytes(12).toString("hex")}`;

  const att = async (heat: string, entry: string, seq: number, extra: object = {}) =>
    (await f.s.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq, status: "landed", trick_name: `Trick ${seq}`, client_key: key(), ...extra }).select("id").single()).data!.id as string;
  const score = (who: "j1" | "j2", attempt: string, value: number) =>
    f.clients[who].rpc("submit_trick_score", { p_attempt: attempt, p_criteria: {}, p_score: value, p_missed: false, p_flag: null, p_client_key: key(), p_client_rev: 1 });
  const ok = (r: { error: { message: string } | null }, what: string) => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
  };
  const newUser = async (tag: string) => {
    const email = `rls-obs-${tag}-${randomBytes(4).toString("hex")}@example.com`;
    const { data, error } = await f.s.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    return { id: data.user.id, client: await signedIn(email, password) };
  };

  /** Everything in event A1 an official's call could change, read with the service key. Only the observer's own last-seen time is left out. */
  const world = async () => {
    const ev = f.ids.evA1;
    const t = async (table: string, order = "id") => (await f.s.from(table).select("*").eq("event_id", ev).order(order)).data ?? [];
    const seats = ((await f.s.from("judge_seats").select("*").eq("event_id", ev).order("id")).data ?? []).map((s) => (s.id === obsSeat ? { ...s, last_seen_at: null, updated_at: null } : s));
    return JSON.stringify({
      events: (await f.s.from("events").select("*").eq("id", ev)).data,
      heats: await t("heats"),
      slots: await t("heat_slots"),
      attempts: await t("trick_attempts"),
      scores: await t("trick_scores"),
      impressions: await t("impression_scores"),
      sheets: await t("judge_sheets"),
      flags: await t("attempt_flags"),
      penalties: await t("penalties"),
      decisions: await t("heat_decisions"),
      wind: await t("wind_calls"),
      plans: await t("schedule_plans"),
      divisions: await t("divisions"),
      panels: await t("panel_members"),
      entries: await t("entries"),
      results: await t("heat_results"),
      seats,
    });
  };

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "ObsDiv", seats: ["j1", "j2"], model: MODEL });
    const u = await newUser("watch");
    obsUser = u.id;
    obs = u.client;
    const seat = await f.s.from("judge_seats").insert({ event_id: f.ids.evA1, name: "Sponsor guest", role: "observer", scores: false, auth_user_id: obsUser, status: "active", active: true }).select("id").single();
    ok(seat, "observer seat");
    obsSeat = seat.data!.id;

    running = await mkHeat(f, d, { status: "running", started_at: ago(60) });
    attR = await att(running, d.entries[0], 1);
    ok(await score("j1", attR, 7.5), "score j1");
    ok(await score("j2", attR, 6.5), "score j2");

    ended = await mkHeat(f, d, { status: "running", started_at: ago(120) });
    attE1 = await att(ended, d.entries[0], 1);
    attE2 = await att(ended, d.entries[1], 1);
    for (const a of [attE1, attE2]) {
      ok(await score("j1", a, 7), "score");
      ok(await score("j2", a, 7), "score");
    }
    const fl = await f.clients.j1.rpc("submit_flag", { p_attempt: attE1, p_kind: "crash", p_note: null, p_client_key: key() });
    ok(fl, "flag");
    flagId = (fl.data as { id: string }).id;
    ok(await f.clients.head.rpc("end_heat", { p_heat: ended }), "end");
    for (const e of d.entries) {
      ok(await f.clients.j1.rpc("submit_impression", { p_heat: ended, p_entry: e, p_value: 6, p_client_key: key(), p_client_rev: 1 }), "imp");
    }
    ok(await f.clients.j1.rpc("submit_sheet", { p_heat: ended }), "sheet");
    ok(await f.clients.head.rpc("decide_tie", { p_heat: ended, p_rider_ids: [d.entries[0], d.entries[1]], p_reason: "judges agree" }), "tie");
    const pen = await f.clients.head.rpc("add_penalty", { p_heat: ended, p_entry: d.entries[2], p_type: "INT", p_reason: "blocked a rider" });
    ok(pen, "penalty");
    penaltyId = ((await f.s.from("penalties").select("id").eq("heat_id", ended).single()).data as { id: string }).id;
    const plan = await f.s.from("schedule_plans").insert({ event_id: f.ids.evA1, day: "2026-10-10", name: "Plan A", items: [], anchors: {}, active: true }).select("id").single();
    ok(plan, "plan");
    planId = plan.data!.id;
  });

  afterAll(async () => {
    if (!f) return;
    await f.cleanup();
    for (const id of users) await f.s.auth.admin.deleteUser(id).catch(() => undefined);
  });

  // ---------------------------------------------------------------- what an observer reads
  it("reads every judge's scores, Impression / Variety scores, sheets, flags, decisions and the audit log, like the head judge", async () => {
    const n = async (c: SupabaseClient, table: string, heat: string) => ((await c.from(table).select("id").eq("heat_id", heat)).data ?? []).length;
    expect(await n(obs, "trick_scores", running)).toBe(2);
    expect(await n(f.clients.head, "trick_scores", running)).toBe(2);
    expect(await n(f.clients.j1, "trick_scores", running)).toBe(1); // a judge still reads only their own
    for (const table of ["trick_scores", "impression_scores", "judge_sheets", "attempt_flags", "heat_decisions", "penalties", "trick_attempts", "heat_slots"]) {
      expect(await n(obs, table, ended), table).toBe(await n(f.clients.head, table, ended));
      expect(await n(obs, table, ended), table).toBeGreaterThan(0);
    }
    expect(((await obs.from("audit_log").select("id").eq("event_id", f.ids.evA1).limit(5)).data ?? []).length).toBeGreaterThan(0);
    const seats = (await obs.from("judge_seats").select("id, name, role, last_seen_at").eq("event_id", f.ids.evA1)).data ?? [];
    expect(seats.map((s) => s.id)).toEqual(expect.arrayContaining([f.ids.seat_j1, f.ids.seat_j2, f.ids.seat_head, f.ids.seat_spotter]));
    // the PIN columns stay unreadable
    expect(codeOf(await obs.from("judge_seats").select("pin_hash").eq("event_id", f.ids.evA1))).not.toBe("");
    // another event: nothing
    expect(((await obs.from("heats").select("id").eq("event_id", f.ids.evB1)).data ?? []).length).toBe(0);
    expect((await obs.rpc("am_i_head", { p_event: f.ids.evA1 })).data).toBe(false);
  });

  it("the head judge sees the observer seat and when it was last seen (for “2 observers watching”)", async () => {
    expect(codeOf(await obs.rpc("touch_seat"))).toBe("");
    const row = (await f.clients.head.from("judge_seats").select("id, role, last_seen_at").eq("id", obsSeat).single()).data;
    expect(row?.role).toBe("observer");
    expect(Date.now() - Date.parse(row!.last_seen_at as string)).toBeLessThan(60_000);
  });

  // ---------------------------------------------------------------- what an observer cannot do
  it("every function an official can call is refused for an observer, and nothing changes", async () => {
    const before = await world();
    const ck = () => randomUUID();
    const p = d.entries;
    const calls: Record<string, Record<string, unknown>> = {
      activate_schedule_plan: { p_plan: planId },
      abort_start: { p_heat: running },
      arm_heat: { p_heat: running, p_prestart: 30 },
      start_armed_if_due: { p_heat: running },
      add_attempt: { p_heat: running, p_entry: p[0], p_client_key: ck(), p_status: "landed", p_trick_name: "Backroll" },
      add_penalty: { p_heat: ended, p_entry: p[0], p_type: "INT", p_reason: "blocked a rider" },
      ask_usage: { p_org: f.ids.orgA },
      cancel_heat: { p_heat: running, p_reason: "kite tangle" },
      clear_plan_actuals: { p_plan: planId },
      clone_event_as_simulation: { p_event: f.ids.evA1, p_name: "copy" },
      decide_tie: { p_heat: ended, p_rider_ids: [p[1], p[0]], p_reason: "judges agree" },
      delete_attempt: { p_attempt: attR, p_reason: "test it" },
      delete_event: { p_event: f.ids.evA1, p_slug_confirm: "x" },
      edit_attempt: { p_attempt: attR, p_reason: "wrong trick", p_trick_name: "Other" },
      end_heat: { p_heat: running },
      end_heat_if_due: { p_heat: running },
      ensure_division_panel: { p_division: d.div },
      flag_out: { p_heat: running, p_entries: [p[0]], p_reason: "flag out" },
      get_seat_contacts: { p_event: f.ids.evA1 },
      head_set_impression: { p_heat: ended, p_entry: p[0], p_seat: f.ids.seat_j1, p_value: 7, p_reason: "paper sheet" },
      head_set_trick_score: { p_attempt: attE1, p_seat: f.ids.seat_j1, p_score: 2, p_criteria: {}, p_missed: false, p_reason: "paper sheet" },
      head_submit_sheet: { p_heat: ended, p_seat: f.ids.seat_j2, p_reason: "paper sheet" },
      import_riders: { p_division: d.div, p_rows: [{ first: "Ivy", last: "Obs" }] },
      lock_division_draw: { p_division: d.div },
      merge_attempts: { p_keep: attE1, p_drop: attE2, p_choices: {}, p_reason: "same trick" },
      pause_heat: { p_heat: running },
      practice_add_attempt: { p_heat: running, p_entry: p[0], p_trick: { name: "Backroll" }, p_status: "landed" },
      purge_expired_reset_snapshots: {},
      remove_penalty: { p_penalty: penaltyId, p_reason: "mistake" },
      reopen_heat: { p_heat: ended, p_reason: "fix a score" },
      reopen_sheet: { p_heat: ended, p_seat: f.ids.seat_j1, p_reason: "let me fix it" },
      rerun_heat: { p_heat: ended, p_new_heat: randomUUID(), p_suffix: "R", p_name: "Re-run", p_reason: "kite tangle", p_leave_out: {} },
      reset_division: { p_division: d.div, p_reason: "xxxxx", p_item: {} },
      reset_division_preview: { p_division: d.div },
      reset_event: { p_event: f.ids.evA1, p_slug: "x", p_reason: "xxxxx", p_draws: [] },
      reset_event_preview: { p_event: f.ids.evA1 },
      reset_heat: { p_heat: ended, p_reason: "xxxxx", p_before: null, p_draw: null, p_seats: null },
      reset_heat_preview: { p_heat: ended },
      resolve_flag: { p_flag: flagId, p_resolution: "checked" },
      restore_event_reset: { p_snapshot: randomUUID() },
      resume_heat: { p_heat: running },
      review_heat: { p_heat: ended, p_override_reason: "x y z" },
      save_division_draw: { p_division: d.div, p_draw: {}, p_projection: {}, p_action: "save", p_audit: {} },
      set_division_panel: { p_division: d.div, p_seat_ids: [f.ids.seat_j1, f.ids.seat_j2, obsSeat] },
      set_draw_walkover: { p_division: d.div, p_entry: p[0], p_draw: {} },
      set_entry_order: { p_division: d.div, p_entry_ids: [p[2], p[1], p[0]], p_shuffle_seed: 1 },
      set_event_archived: { p_event: f.ids.evA1, p_archived: true },
      set_heat_public_live: { p_heat: running, p_value: false },
      set_plan_anchors: { p_plan: planId, p_anchors: { a: "10:00" } },
      set_plan_hold: { p_plan: planId, p_hold: { since: new Date().toISOString(), reason: "wind dropped" } },
      set_publish_hold: { p_heat: ended, p_hold: true, p_reason: "prize giving" },
      set_rider_status: { p_heat: running, p_entry: p[0], p_modifier: "DNS", p_reason: "not here" },
      set_seat_scores: { p_seat: obsSeat, p_scores: true },
      set_wind_call: { p_event: f.ids.evA1, p_status: "red", p_message: "no wind" },
      sim_add_attempt: { p_seat: f.ids.seat_spotter, p_heat: running, p_entry: p[0], p_trick: { name: "Backroll" }, p_status: "landed", p_client_key: ck() },
      sim_after_reset: { p_event: f.ids.evA1 },
      sim_delete: { p_event: f.ids.evA1, p_slug_confirm: "x" },
      sim_enable: { p_event: f.ids.evA1 },
      sim_log_add: { p_event: f.ids.evA1, p_kind: "note", p_scenario: "x", p_text: "x", p_data: {} },
      sim_pause_heats: { p_event: f.ids.evA1 },
      sim_rebuild: { p_event: f.ids.evA1, p_slug_confirm: "x" },
      sim_release_stale_views: { p_event: f.ids.evA1, p_silent_sec: 1, p_leave_grace_sec: 1 },
      sim_resume_heats: { p_event: f.ids.evA1 },
      sim_set: { p_event: f.ids.evA1, p_patch: { speed: 10 } },
      sim_set_mode: { p_seat: f.ids.seat_j1, p_mode: "real" },
      sim_stats: { p_event: f.ids.evA1 },
      sim_submit_impression: { p_seat: f.ids.seat_j1, p_heat: ended, p_entry: p[0], p_value: 5, p_client_key: ck(), p_client_rev: 9 },
      sim_submit_score: { p_seat: f.ids.seat_j1, p_attempt: attR, p_criteria: {}, p_score: 1, p_missed: false, p_client_key: ck(), p_client_rev: 9 },
      sim_submit_sheet: { p_seat: f.ids.seat_j2, p_heat: ended },
      sim_tick_begin: { p_event: f.ids.evA1, p_ms: 1000 },
      sim_tick_end: { p_event: f.ids.evA1, p_token: randomUUID() },
      sim_tick_lock: { p_event: f.ids.evA1, p_ms: 1000 },
      sim_view_as: { p_event: f.ids.evA1, p_seat: f.ids.seat_j1 },
      sim_view_beat: { p_event: f.ids.evA1 },
      sim_view_leave: { p_event: f.ids.evA1 },
      start_heat: { p_heat: running },
      submit_flag: { p_attempt: attR, p_kind: "crash", p_note: null, p_client_key: ck() },
      submit_impression: { p_heat: ended, p_entry: p[0], p_value: 3, p_client_key: ck(), p_client_rev: 900 },
      submit_sheet: { p_heat: ended },
      submit_trick_score: { p_attempt: attR, p_criteria: {}, p_score: 1, p_missed: false, p_flag: null, p_client_key: ck(), p_client_rev: 900 },
      undo_attempt: { p_attempt: attR },
      unlock_division_draw: { p_division: d.div, p_reason: "let me in please" },
      unlock_division_rules: { p_division: d.div, p_reason: "please let me" },
      update_event_trick_base: { p_event: f.ids.evA1 },
    };
    const accepted: string[] = [];
    for (const [name, args] of Object.entries(calls)) {
      const r = await obs.rpc(name as never, args as never);
      const refused = Boolean(r.error) || (r.data && typeof r.data === "object" && (r.data as { ok?: unknown }).ok === false) || name === "sim_view_beat" || name === "sim_view_leave";
      if (!refused) accepted.push(name);
    }
    // sim_view_beat / sim_view_leave only touch the View-as rows the caller itself holds (it holds none): the world below proves nothing changed
    expect(accepted).toEqual([]);
    expect(await world()).toBe(before);
  });

  it("the list above is every function a signed-in person may call (a new function must be added to it)", async () => {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    const ref = process.env.SUPABASE_PROJECT_REF;
    if (!token || !ref) return; // the list needs the management API; the refusals above still ran
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') order by 1" }),
    });
    const names = ((await res.json()) as Array<{ proname: string }>).map((r) => r.proname).filter((n) => !n.startsWith("admin_") && !READS.has(n));
    const src = (await import("node:fs")).readFileSync(new URL(import.meta.url), "utf8");
    const missing = names.filter((n) => !src.includes(`      ${n}: {`));
    expect(missing).toEqual([]);
  });

  it("no table an official writes accepts a write from an observer", async () => {
    const before = await world();
    const tries = [
      obs.from("trick_scores").insert({ attempt_id: attR, heat_id: running, judge_seat_id: obsSeat, score: 5, client_rev: 1 } as never),
      obs.from("trick_scores").update({ score: 1 } as never).eq("attempt_id", attR),
      obs.from("trick_scores").delete().eq("attempt_id", attR),
      obs.from("impression_scores").insert({ heat_id: ended, entry_id: d.entries[0], judge_seat_id: obsSeat, value: 5, client_rev: 1 } as never),
      obs.from("impression_scores").update({ value: 1 } as never).eq("heat_id", ended),
      obs.from("trick_attempts").insert({ heat_id: running, entry_id: d.entries[0], seq: 9, status: "landed", client_key: key() } as never),
      obs.from("trick_attempts").update({ trick_name: "x" } as never).eq("id", attR),
      obs.from("heats").update({ status: "paused" } as never).eq("id", running),
      obs.from("heat_slots").update({ modifier: "DNS" } as never).eq("heat_id", running),
      obs.from("penalties").insert({ heat_id: running, entry_id: d.entries[0], type: "INT" } as never),
      obs.from("penalties").delete().eq("heat_id", ended),
      obs.from("wind_calls").insert({ event_id: f.ids.evA1, status: "red" } as never),
      obs.from("judge_sheets").insert({ heat_id: ended, judge_seat_id: obsSeat, submitted_at: new Date().toISOString() } as never),
      obs.from("attempt_flags").update({ resolved_at: new Date().toISOString() } as never).eq("id", flagId),
      obs.from("heat_decisions").insert({ heat_id: ended, kind: "tie", payload: {} } as never),
      obs.from("judge_seats").update({ role: "head" } as never).eq("id", obsSeat),
      obs.from("judge_seats").update({ name: "x" } as never).eq("id", f.ids.seat_j1),
      obs.from("schedule_plans").update({ name: "x" } as never).eq("id", planId),
      obs.from("events").update({ name: "x" } as never).eq("id", f.ids.evA1),
      obs.from("divisions").update({ name: "x" } as never).eq("id", d.div),
      obs.from("panel_members").insert({ panel_id: d.panel, judge_seat_id: obsSeat, seat_no: 9 } as never),
    ];
    for (const t of tries) await t; // each is refused by row security or a missing grant (an update that matches no row changes nothing)
    expect(await world()).toBe(before);
  });

  it("touch_seat moves only the observer's own last-seen time", async () => {
    const before = await world();
    expect(codeOf(await obs.rpc("touch_seat"))).toBe("");
    expect(await world()).toBe(before);
  });

  // ---------------------------------------------------------------- panels, the simulator, the public pages
  it("an observer never sits on a panel: the organiser's panel function and a direct insert are both refused", async () => {
    expect(codeOf(await f.clients.orgA.rpc("set_division_panel", { p_division: d.div, p_seat_ids: [f.ids.seat_j1, f.ids.seat_j2, obsSeat] }))).not.toBe("");
    expect(codeOf(await f.s.from("panel_members").insert({ panel_id: d.panel, judge_seat_id: obsSeat, seat_no: 9 }).select("id"))).toContain("OBSERVER_NOT_ON_PANEL");
    // a seat on a panel cannot be turned into an observer either
    expect(codeOf(await f.s.from("judge_seats").update({ role: "observer" }).eq("id", f.ids.seat_j1).select("id"))).toContain("OBSERVER_NOT_ON_PANEL");
    expect(((await f.s.from("panel_members").select("id").eq("judge_seat_id", obsSeat)).data ?? []).length).toBe(0);
    // "scores" stays off
    expect(codeOf(await f.clients.orgA.rpc("set_seat_scores", { p_seat: obsSeat, p_scores: true }))).not.toBe("");
    expect((await f.s.from("judge_seats").select("scores").eq("id", obsSeat).single()).data?.scores).toBe(false);
  });

  it("an organiser can add an observer seat; several observers are allowed", async () => {
    const a = await f.clients.orgA.from("judge_seats").insert({ event_id: f.ids.evA1, name: "Journalist", role: "observer", status: "active", active: true }).select("id").single();
    const b = await f.clients.orgA.from("judge_seats").insert({ event_id: f.ids.evA1, name: "Trainee", role: "observer", status: "active", active: true }).select("id").single();
    expect(codeOf(a)).toBe("");
    expect(codeOf(b)).toBe("");
    await f.s.from("judge_seats").delete().in("id", [a.data!.id, b.data!.id]);
  });

  it("the public pages never name an observer", async () => {
    const anon = anonClient();
    const site = await anon.rpc("get_public_site", { p_slug: (await f.s.from("events").select("slug").eq("id", f.ids.evA1).single()).data!.slug });
    const results = await anon.rpc("get_public_results", { p_event: f.ids.evA1 });
    const timetable = await anon.rpc("get_public_timetable", { p_event: f.ids.evA1 });
    for (const r of [site, results, timetable]) expect(JSON.stringify(r.data ?? null)).not.toContain("Sponsor guest");
  });

  it("revoking is immediate: seat off, or a new PIN, and the observer reads nothing", async () => {
    expect(((await obs.from("trick_scores").select("id").eq("heat_id", running)).data ?? []).length).toBe(2);
    ok(await f.clients.orgA.from("judge_seats").update({ active: false }).eq("id", obsSeat).select("id"), "seat off");
    expect(((await obs.from("trick_scores").select("id").eq("heat_id", running)).data ?? []).length).toBe(0);
    expect(((await obs.from("heat_decisions").select("id").eq("heat_id", ended)).data ?? []).length).toBe(0);
    expect(((await obs.from("judge_seats").select("id").eq("event_id", f.ids.evA1).neq("id", obsSeat)).data ?? []).length).toBe(0);
    ok(await f.clients.orgA.from("judge_seats").update({ active: true }).eq("id", obsSeat).select("id"), "seat on");
    expect(((await obs.from("trick_scores").select("id").eq("heat_id", running)).data ?? []).length).toBe(2);
    // a new PIN signs the phone out, even while a heat runs (an observer holds nothing a heat needs)
    const r = await f.s.rpc("regenerate_seat_pin", { p_seat: obsSeat, p_pin: String(100000 + Math.floor(Math.random() * 899999)), p_enc: "x" });
    expect((r.data as { ok: boolean }).ok).toBe(true);
    expect(((await obs.from("trick_scores").select("id").eq("heat_id", running)).data ?? []).length).toBe(0);
    ok(await f.s.from("judge_seats").update({ auth_user_id: obsUser }).eq("id", obsSeat).select("id"), "re-bind");
  });

  describe("on a simulation", () => {
    let real: string;
    let sim: string;
    let simSlug: string;
    let simObserver: string;
    let simObs: SupabaseClient;

    beforeAll(async () => {
      const s = f.s;
      const one = async (p: PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<{ id: string }> => {
        const r = await p;
        if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message}`);
        return r.data as { id: string };
      };
      real = (await one(s.from("events").insert({ organisation_id: f.ids.orgA, name: "Obs sim source", slug: `rls-obs-src-${randomBytes(3).toString("hex")}`, status: "published", timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11" }).select("id").single(), "event")).id;
      const panel = (await one(s.from("panels").insert({ event_id: real, name: "Panel" }).select("id").single(), "panel")).id;
      const division = (await one(s.from("divisions").insert({ event_id: real, name: "Pro", sort_order: 1, scoring_model_id: f.ids.modelA1, panel_id: panel, draw_locked_at: new Date().toISOString() }).select("id").single(), "division")).id;
      const round = (await one(s.from("rounds").insert({ division_id: division, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} }).select("id").single(), "round")).id;
      const heat = (await one(s.from("heats").insert({ round_id: round, division_id: division, event_id: real, number: 1, duration_sec: 600 }).select("id").single(), "heat")).id;
      void heat;
      let no = 0;
      for (const [name, role] of [["Judge 1", "judge"], ["Judge 2", "judge"], ["Spotter", "spotter"], ["Watcher", "observer"]] as const) {
        const id = (await one(s.from("judge_seats").insert({ event_id: real, name, role, status: "active", active: true }).select("id").single(), "seat")).id;
        if (role === "judge") await one(s.from("panel_members").insert({ panel_id: panel, judge_seat_id: id, seat_no: ++no }).select("id").single(), "member");
      }
      const cloned = await f.clients.orgA.rpc("clone_event_as_simulation", { p_event: real, p_name: "Obs sim" });
      ok(cloned, "clone");
      const made = cloned.data as { event_id: string; slug: string; seats: Array<{ seat_id: string; name: string }> };
      sim = made.event_id;
      simSlug = made.slug;
      simObserver = made.seats.find((x) => x.name === "Watcher")!.seat_id;
      const u = await newUser("sim");
      simObs = u.client;
      ok(await s.from("judge_seats").update({ auth_user_id: u.id }).eq("id", simObserver).select("id"), "bind");
    });
    afterAll(async () => {
      await f.s.from("events").delete().in("id", [sim, real].filter(Boolean));
    });

    it("the copy keeps the observer seat, and the simulator never plays it", async () => {
      expect(((await f.s.from("judge_seats").select("id").eq("id", simObserver).eq("role", "observer")).data ?? []).length).toBe(1);
      expect(((await f.s.from("sim_seats").select("seat_id").eq("seat_id", simObserver)).data ?? []).length).toBe(0);
      expect(((await f.s.from("sim_seats").select("seat_id").eq("event_id", sim)).data ?? []).length).toBe(3);
      // a direct insert is ignored too
      await f.s.from("sim_seats").insert({ seat_id: simObserver, event_id: sim, mode: "virtual" });
      expect(((await f.s.from("sim_seats").select("seat_id").eq("seat_id", simObserver)).data ?? []).length).toBe(0);
    });

    it("its observer sees the simulation's public pages (the preview) but cannot drive the simulator", async () => {
      const site = await simObs.rpc("get_public_site", { p_slug: simSlug });
      expect((site.data as { found?: boolean } | null)?.found).toBe(true);
      const anonSite = await anonClient().rpc("get_public_site", { p_slug: simSlug });
      expect((anonSite.data as { found?: boolean } | null)?.found).not.toBe(true);
      for (const [name, args] of [
        ["sim_set", { p_event: sim, p_patch: { speed: 10 } }],
        ["sim_stats", { p_event: sim }],
        ["sim_tick_lock", { p_event: sim, p_ms: 1000 }],
        ["sim_view_as", { p_event: sim, p_seat: simObserver }],
        ["sim_pause_heats", { p_event: sim }],
      ] as const) {
        expect(codeOf(await simObs.rpc(name as never, args as never)), name).toContain("NOT_ALLOWED");
      }
    });

    it("the organiser's View as can hold the observer seat", async () => {
      const r = await f.clients.orgA.rpc("sim_view_as", { p_event: sim, p_seat: simObserver });
      expect((r.data as { ok?: boolean; role?: string }).role).toBe("observer");
      ok(await f.clients.orgA.rpc("sim_view_as", { p_event: sim, p_seat: null as never }), "release");
    });
  });
});
