import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drawProjection } from "@/lib/draw/projection";
import { expandFormat, lockDraw, type DivisionDraw } from "@/lib/engine/ladder";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import { resetTarget } from "@/lib/reset/plan";
import { anonClient, ENV_OK, run, service, signedIn } from "./helpers";

// Reset event and Restore (docs/PLAN-phase-7a.md step 8d) on the hosted development project: throwaway organisations only.
const codeOf = (r: { error: { message: string } | null }): string => r.error?.message ?? "";

describe.skipIf(!ENV_OK)("Reset event and Restore (hosted development project)", () => {
  const s = service();
  const password = `Pw-${randomBytes(12).toString("hex")}`;
  const users: string[] = [];
  const orgs: string[] = [];
  const ids: Record<string, string> = {};
  let x: SupabaseClient; // organiser of orgX
  let y: SupabaseClient; // organiser of orgY
  let owner: SupabaseClient; // platform owner
  let staff: SupabaseClient; // platform staff, not inside the organisation

  const ins = async <T>(table: string, row: object): Promise<T & { id: string }> => {
    const { data, error } = await s.from(table).insert(row).select().single();
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    return data as T & { id: string };
  };
  const user = async (key: string) => {
    const email = `reset-${run}-${key}@example.com`;
    const { data, error } = await s.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    return { email, id: data.user.id };
  };

  /** An event with one division: 6 riders, a knockout (heats of 3, one advances, final of 2) saved the way the Draw step saves it, a seat, a run order. */
  const world = async (key: string, opts: { lock?: "organiser" | "service" | "none"; org?: string } = {}) => {
    const org = opts.org ?? ids.orgX;
    const ev = await ins<{ id: string }>("events", { organisation_id: org, name: `Reset ${key}`, slug: `reset-${key}-${run}`, status: "draft", timezone: "Africa/Cairo", start_date: "2026-11-01", end_date: "2026-11-02", settings: {} });
    const div = await ins<{ id: string }>("divisions", { event_id: ev.id, name: `Pro ${key}`, sort_order: 1 });
    const entries: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const rider = await ins<{ id: string }>("riders", { organisation_id: org, first_name: `R${i}`, last_name: key });
      entries.push((await ins<{ id: string }>("entries", { division_id: div.id, rider_id: rider.id, seed: i, status: "confirmed", source: "manual" })).id);
    }
    const template = parseFormatTemplate({
      id: "t", name: "Knockout", entrants: { min: 2, max: null }, timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 2, defaultBreakAfterRoundMin: 2 }, kind: "generator",
      generator: { type: "single_elimination", params: { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: "by_original_seed" } },
    });
    const draw = expandFormat(template, entries.map((id, i) => ({ id, name: `R${i + 1}` })), { identification: "name-callout" });
    await s.from("divisions").update({ draw: draw as never }).eq("id", div.id);
    const projection = drawProjection(draw);
    const roundIds = new Map<string, string>();
    for (const r of projection.rounds) roundIds.set(r.key, (await ins<{ id: string }>("rounds", { division_id: div.id, sort_order: r.sort_order, name: r.name, short_name: r.short_name, spec: r.spec })).id);
    const heats: Record<string, string> = {};
    for (const h of projection.heats) {
      heats[h.uid] = (await ins<{ id: string }>("heats", { round_id: roundIds.get(h.round_key)!, division_id: div.id, event_id: ev.id, number: h.number, draw_uid: h.uid, duration_sec: h.duration_sec, warm_up_sec: 0 })).id;
      for (const sl of h.slots) await ins("heat_slots", { heat_id: heats[h.uid], position: sl.position, entry_id: sl.entry_id, vest_colour: sl.vest_colour, source: sl.source });
    }
    const seat = await ins<{ id: string }>("judge_seats", { event_id: ev.id, name: "Judge", role: "judge", status: "active", active: true });
    const plan = await ins<{ id: string }>("schedule_plans", { event_id: ev.id, day: "2026-11-01", name: "Plan A", items: Object.values(heats).map((h, i) => ({ id: `i${i}`, kind: "heat", heatId: h })), anchors: { i0: "10:00" }, actual_starts: {}, hold: null, defaults: {}, active: true });
    if (opts.lock === "service") await s.from("divisions").update({ draw_locked_at: new Date().toISOString() }).eq("id", div.id);
    return { event: ev.id, slug: `reset-${key}-${run}`, division: div.id, entries, heats, template, draw, seat: seat.id, plan: plan.id, rounds: roundIds };
  };
  type World = Awaited<ReturnType<typeof world>>;

  /** Everything the draw would hand to reset_event for this world. */
  const draws = async (w: World) => {
    const { data } = await s.from("divisions").select("id, draw, draw_at_lock, draw_locked_at").eq("id", w.division).single();
    const source = (data!.draw_at_lock ?? data!.draw) as DivisionDraw;
    const t = resetTarget(source);
    return [{ division: w.division, draw: t.draw, projection: t.projection }];
  };

  /** Heat 1 of Round 1 has been played and published: attempts, scores, an Impression score, a penalty, a result, places, and its winner sits in the next round. */
  const play = async (w: World, opts: { hold?: boolean } = {}) => {
    const heat = Object.values(w.heats)[0];
    const [e1, e2] = [w.entries[0], w.entries[1]];
    await s.from("heats").update({ status: "running", started_at: new Date(Date.now() - 900_000).toISOString() }).eq("id", heat);
    const a1 = await ins<{ id: string }>("trick_attempts", { heat_id: heat, entry_id: e1, seq: 1, client_key: randomUUID(), status: "landed", trick_name: "Backroll" });
    await ins("trick_attempts", { heat_id: heat, entry_id: e2, seq: 2, client_key: randomUUID(), status: "crashed", trick_name: "Frontroll" });
    await ins("trick_scores", { attempt_id: a1.id, heat_id: heat, judge_seat_id: w.seat, score: 7.5, client_key: randomUUID(), client_rev: 1 });
    await ins("impression_scores", { heat_id: heat, entry_id: e1, judge_seat_id: w.seat, value: 6, client_key: randomUUID(), client_rev: 1 });
    await ins("penalties", { heat_id: heat, entry_id: e2, type: "INT", value: {}, reason: "test" });
    await ins("judge_sheets", { event_id: w.event, heat_id: heat, judge_seat_id: w.seat, submitted_at: new Date().toISOString() });
    await s.from("heats").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", heat);
    await s.from("heats").update({ status: "published", published_at: new Date().toISOString(), ...(opts.hold ? { publish_hold: true } : {}) }).eq("id", heat);
    await ins("heat_results", { heat_id: heat, entry_id: e1, place: 1, total: 7.5, version: 1 });
    await ins("heat_results", { heat_id: heat, entry_id: e2, place: 2, total: 0, version: 1 });
    await s.from("heat_slots").update({ place: 1, total: 7.5 }).eq("heat_id", heat).eq("entry_id", e1);
    // the winner takes a seat in the next round (what publishing does)
    const { data: later } = await s.from("heat_slots").select("id, heat_id").is("entry_id", null).in("heat_id", Object.values(w.heats)).limit(1);
    if (later?.[0]) await s.from("heat_slots").update({ entry_id: e1 }).eq("id", later[0].id);
    return heat;
  };
  const tables = ["trick_attempts", "trick_scores", "impression_scores", "penalties", "attempt_flags", "judge_sheets", "heat_decisions", "heat_results"] as const;
  const count = async (table: string, event: string) => ((await s.from(table).select("id").eq("event_id", event)).data ?? []).length;
  const reset = (c: SupabaseClient, w: World, over: { slug?: string; reason?: string | null; draws?: unknown } = {}, drawsList?: unknown) =>
    c.rpc("reset_event", { p_event: w.event, p_slug: over.slug ?? w.slug, p_reason: over.reason ?? null, p_draws: over.draws ?? drawsList });

  let main: World;
  beforeAll(async () => {
    ids.orgX = (await ins("organisations", { name: `Reset X ${run}`, slug: `reset-x-${run}` })).id;
    ids.orgY = (await ins("organisations", { name: `Reset Y ${run}`, slug: `reset-y-${run}` })).id;
    orgs.push(ids.orgX, ids.orgY);
    const ux = await user("x");
    const uy = await user("y");
    const uo = await user("owner");
    const us = await user("staff");
    await ins("memberships", { organisation_id: ids.orgX, user_id: ux.id, role: "owner" });
    await ins("memberships", { organisation_id: ids.orgY, user_id: uy.id, role: "owner" });
    await ins("platform_admins", { user_id: uo.id, role: "owner" });
    await ins("platform_admins", { user_id: us.id, role: "staff" });
    x = await signedIn(ux.email, password);
    y = await signedIn(uy.email, password);
    owner = await signedIn(uo.email, password);
    staff = await signedIn(us.email, password);
    main = await world("main", { lock: "none" });
    // the organiser locks the draw: that takes the copy
    const locked = await x.rpc("lock_division_draw", { p_division: main.division });
    expect(codeOf(locked)).toBe("");
  });
  afterAll(async () => {
    for (const o of orgs) await s.rpc("purge_organisation", { p_org: o });
    for (const id of users) await s.auth.admin.deleteUser(id);
  });

  describe("the copy of the draw", () => {
    it("lock_division_draw keeps the draw as it was when it was locked, and unlock clears it", async () => {
      const { data } = await s.from("divisions").select("draw, draw_at_lock, draw_locked_at").eq("id", main.division).single();
      expect(data!.draw_locked_at).not.toBeNull();
      expect(data!.draw_at_lock).toEqual(data!.draw);
      expect((data!.draw_at_lock as { status: string }).status).toBe("locked");
      await x.rpc("unlock_division_draw", { p_division: main.division, p_reason: "testing unlock" });
      expect((await s.from("divisions").select("draw_at_lock").eq("id", main.division).single()).data!.draw_at_lock).toBeNull();
      expect(codeOf(await x.rpc("lock_division_draw", { p_division: main.division }))).toBe("");
      expect((await s.from("divisions").select("draw_at_lock").eq("id", main.division).single()).data!.draw_at_lock).not.toBeNull();
    });
    it("locking after a heat has started leaves the copy empty; a cancelled heat that never started does not count", async () => {
      const late = await world("late", { lock: "none" });
      await s.from("heats").update({ status: "running", started_at: new Date().toISOString() }).eq("id", Object.values(late.heats)[0]);
      expect(codeOf(await x.rpc("lock_division_draw", { p_division: late.division }))).toBe("");
      expect((await s.from("divisions").select("draw_at_lock, draw_locked_at").eq("id", late.division).single()).data).toMatchObject({ draw_at_lock: null });
      const cancelled = await world("cancel", { lock: "none" });
      await s.from("heats").update({ status: "cancelled" }).eq("id", Object.values(cancelled.heats)[0]);
      expect(codeOf(await x.rpc("lock_division_draw", { p_division: cancelled.division }))).toBe("");
      expect((await s.from("divisions").select("draw_at_lock").eq("id", cancelled.division).single()).data!.draw_at_lock).not.toBeNull();
    });
    it("an organiser cannot write the copy by hand", async () => {
      const r = await x.from("divisions").update({ draw_at_lock: { status: "locked" } }).eq("id", main.division).select("id");
      expect(codeOf(r) + JSON.stringify(r.data ?? [])).toMatch(/DRAW_FUNCTION_ONLY|\[\]/);
      expect((await s.from("divisions").select("draw_at_lock, draw").eq("id", main.division).single()).data!.draw_at_lock).toEqual((await s.from("divisions").select("draw").eq("id", main.division).single()).data!.draw);
    });
  });

  describe("who may reset", () => {
    it("is refused for an organiser of another organisation, for staff outside an impersonation, and for visitors", async () => {
      const d = await draws(main);
      for (const [who, c] of [["other organisation", y], ["staff", staff], ["visitor", anonClient()]] as const) {
        const r = await reset(c, main, {}, d);
        expect(codeOf(r), who).toMatch(/NOT_ALLOWED|permission denied|not allowed/i);
      }
      const p = await y.rpc("reset_event_preview", { p_event: main.event });
      expect(codeOf(p)).toMatch(/NOT_ALLOWED/);
    });
    it("a wrong web address is refused, and nothing changes", async () => {
      const w = await world("slug", { lock: "none" });
      await x.rpc("lock_division_draw", { p_division: w.division });
      await play(w);
      const r = await reset(x, w, { slug: "not-the-address" }, await draws(w));
      expect(codeOf(r)).toMatch(/SLUG_MISMATCH/);
      expect(await count("trick_attempts", w.event)).toBe(2);
    });
    it("a projection that is not the starting draw is refused", async () => {
      const w = await world("badproj", { lock: "none" });
      await x.rpc("lock_division_draw", { p_division: w.division });
      expect(codeOf(await reset(x, w, { reason: "xxxxx" }, []))).toMatch(/BAD_PROJECTION/);
      const d = await draws(w);
      const tampered = [{ ...d[0], draw: { ...(d[0].draw as object), status: "draft" } }];
      expect(codeOf(await reset(x, w, { reason: "xxxxx" }, tampered))).toMatch(/BAD_PROJECTION/);
    });
  });

  describe("what it refuses", () => {
    it("a running or paused heat: named", async () => {
      const w = await world("running", { lock: "none" });
      await x.rpc("lock_division_draw", { p_division: w.division });
      const heat = Object.values(w.heats)[0];
      await s.from("heats").update({ status: "running", started_at: new Date().toISOString() }).eq("id", heat);
      expect(codeOf(await reset(x, w, {}, await draws(w)))).toMatch(/HEAT_RUNNING: Heat 1/);
      await s.from("heats").update({ status: "paused", paused_at: new Date().toISOString() }).eq("id", heat);
      expect(codeOf(await reset(x, w, {}, await draws(w)))).toMatch(/HEAT_RUNNING/);
      expect((await x.rpc("reset_event_preview", { p_event: w.event })).data.running).toBe("Heat 1");
    });
    it("a division locked before this change (no copy) names the division; unlock and lock again gives a copy when no heat started; with a started heat the copy stays empty and Reset still refuses", async () => {
      const w = await world("nocopy", { lock: "service" }); // locked with no copy, as every division locked before the migration
      expect((await s.from("divisions").select("draw_at_lock").eq("id", w.division).single()).data!.draw_at_lock).toBeNull();
      const direct = await reset(x, w, {}, [{ division: w.division, draw: lockDraw(w.draw), projection: drawProjection(lockDraw(w.draw)) }]);
      expect(codeOf(direct)).toMatch(/DRAW_COPY_MISSING: Pro nocopy/);
      const pv = (await x.rpc("reset_event_preview", { p_event: w.event })).data;
      expect(pv.divisions[0]).toMatchObject({ name: "Pro nocopy", drawn: true, has_copy: false, heat_left_scheduled: false });

      // unlock and lock again: the copy is taken, and Reset then works
      await x.rpc("unlock_division_draw", { p_division: w.division, p_reason: "take the copy" });
      await x.rpc("lock_division_draw", { p_division: w.division });
      expect(codeOf(await reset(x, w, {}, await draws(w)))).toBe("");

      // a heat has started: locking again leaves the copy empty and Reset refuses for good
      const v = await world("started", { lock: "service" });
      await s.from("heats").update({ status: "ended", started_at: new Date(Date.now() - 600_000).toISOString(), ended_at: new Date().toISOString() }).eq("id", Object.values(v.heats)[0]);
      await x.rpc("unlock_division_draw", { p_division: v.division, p_reason: "after the first heat" });
      await x.rpc("lock_division_draw", { p_division: v.division });
      expect((await s.from("divisions").select("draw_at_lock").eq("id", v.division).single()).data!.draw_at_lock).toBeNull();
      const again = await reset(x, v, {}, [{ division: v.division, draw: lockDraw(v.draw), projection: drawProjection(lockDraw(v.draw)) }]);
      expect(codeOf(again)).toMatch(/DRAW_COPY_MISSING: Pro started/);
      expect((await x.rpc("reset_event_preview", { p_event: v.event })).data.divisions[0]).toMatchObject({ has_copy: false, heat_left_scheduled: true });
    });
  });

  describe("the reason", () => {
    it("is needed only when a result was ever shown publicly", async () => {
      // published and not held: public
      const pub = await world("pub", { lock: "none" });
      await x.rpc("lock_division_draw", { p_division: pub.division });
      await play(pub);
      expect((await x.rpc("reset_event_preview", { p_event: pub.event })).data.ever_public).toBe(true);
      expect(codeOf(await reset(x, pub, {}, await draws(pub)))).toMatch(/REASON_REQUIRED/);
      expect(codeOf(await reset(x, pub, { reason: "abc" }, await draws(pub)))).toMatch(/REASON_REQUIRED/);

      // published but held and never released: not public, no reason
      const held = await world("held", { lock: "none" });
      await x.rpc("lock_division_draw", { p_division: held.division });
      await play(held, { hold: true });
      expect((await x.rpc("reset_event_preview", { p_event: held.event })).data.ever_public).toBe(false);
      expect(codeOf(await reset(x, held, {}, await draws(held)))).toBe("");

      // a heat that ran with live scores on is public too
      const live = await world("live", { lock: "none" });
      await x.rpc("lock_division_draw", { p_division: live.division });
      await s.from("events").update({ settings: { publicLiveScores: "live" } }).eq("id", live.event);
      await s.from("heats").update({ status: "ended", started_at: new Date(Date.now() - 600_000).toISOString(), ended_at: new Date().toISOString() }).eq("id", Object.values(live.heats)[0]);
      expect((await x.rpc("reset_event_preview", { p_event: live.event })).data.ever_public).toBe(true);
      await s.from("heats").update({ public_live: false }).eq("id", Object.values(live.heats)[0]);
      expect((await x.rpc("reset_event_preview", { p_event: live.event })).data.ever_public).toBe(false);

      // nothing published, live scores off
      const quiet = await world("quiet", { lock: "none" });
      await x.rpc("lock_division_draw", { p_division: quiet.division });
      expect((await x.rpc("reset_event_preview", { p_event: quiet.event })).data.ever_public).toBe(false);
    });
  });

  describe("what it does", () => {
    let w: World;
    let before: { attempts: string[]; results: string[]; entries: number; seats: number; plan: unknown; laterSeats: number };
    const snapshotOf = async (event: string, division: string) => ({
      attempts: ((await s.from("trick_attempts").select("id").eq("event_id", event)).data ?? []).map((r) => r.id as string).sort(),
      results: ((await s.from("heat_results").select("id").eq("event_id", event)).data ?? []).map((r) => r.id as string).sort(),
      entries: ((await s.from("entries").select("id").eq("division_id", division)).data ?? []).length,
      seats: ((await s.from("judge_seats").select("id").eq("event_id", event)).data ?? []).length,
      plan: (await s.from("schedule_plans").select("items, anchors").eq("event_id", event).single()).data,
      laterSeats: ((await s.from("heat_slots").select("id").eq("event_id", event).not("entry_id", "is", null)).data ?? []).length,
    });

    it("wipes everything that happened, puts the ladder back to its locked draw, keeps riders, officials and the run order, and writes one audit line and a snapshot", async () => {
      w = await world("reset", { lock: "none" });
      await x.rpc("lock_division_draw", { p_division: w.division });
      const heat = await play(w);
      // a re-run of the second heat of Round 1: cancelled, with its own run-order item
      const second = Object.values(w.heats)[1];
      await s.from("heats").update({ status: "ended", started_at: new Date(Date.now() - 600_000).toISOString(), ended_at: new Date().toISOString() }).eq("id", second);
      const { data: hh } = await s.from("heats").select("*").eq("id", second).single();
      await s.from("heats").update({ status: "cancelled", draw_uid: null }).eq("id", second);
      const rerun = await ins<{ id: string }>("heats", { round_id: hh!.round_id, division_id: w.division, event_id: w.event, number: hh!.number, number_suffix: "R", name: "Heat 2 re-run", duration_sec: hh!.duration_sec, draw_uid: hh!.draw_uid, rerun_of: second });
      await ins("heat_slots", { heat_id: rerun.id, position: 1, entry_id: w.entries[3] });
      await s.from("schedule_plans").update({ actual_starts: { i0: new Date().toISOString() }, hold: { since: new Date().toISOString() } }).eq("id", w.plan);
      await s.from("schedule_plans").update({ items: [...Object.values(w.heats).map((h, i) => ({ id: `i${i}`, kind: "heat", heatId: h })), { id: "irr", kind: "heat", heatId: rerun.id }] }).eq("id", w.plan);
      // a heat of a different kind of leftover: a flag, a tie decision
      await ins("heat_decisions", { event_id: w.event, heat_id: heat, kind: "tie", payload: { riderIds: [w.entries[0], w.entries[1]] }, reason: "test" });
      expect(await count("trick_attempts", w.event)).toBe(2);

      before = await snapshotOf(w.event, w.division);
      const preview = (await x.rpc("reset_event_preview", { p_event: w.event })).data;
      expect(preview.counts).toMatchObject({ attempts: 2, published_results: 1 });

      const res = await reset(x, w, { reason: "Practice published by mistake" }, await draws(w));
      expect(codeOf(res)).toBe("");
      expect(res.data).toMatchObject({ attempts: 2, published_results: 1, reruns: 1 });

      for (const t of tables) expect(await count(t, w.event), t).toBe(0);
      const { data: heats } = await s.from("heats").select("id, status, started_at, ended_at, published_at, publish_hold, draw_uid, rerun_of, number_suffix").eq("event_id", w.event);
      expect(heats).toHaveLength(Object.keys(w.heats).length); // the re-run is gone
      expect(heats!.every((h) => h.status === "scheduled" && !h.started_at && !h.ended_at && !h.published_at && !h.publish_hold && h.rerun_of === null && h.number_suffix === null)).toBe(true);
      expect(heats!.find((h) => h.id === second)!.draw_uid).not.toBeNull(); // the original has its draw id back
      // Round 1 keeps its riders; later seats are empty again
      const { data: slots } = await s.from("heat_slots").select("entry_id, place, total, heat_id").eq("event_id", w.event);
      expect(slots!.filter((sl) => sl.place !== null || sl.total !== null)).toHaveLength(0);
      expect(slots!.filter((sl) => sl.entry_id === null).length).toBeGreaterThan(0); // the later rounds' seats are empty again
      expect((await s.from("heat_slots").select("id").eq("event_id", w.event).not("entry_id", "is", null)).data).toHaveLength(6);
      // stays
      const after = await snapshotOf(w.event, w.division);
      expect(after.entries).toBe(before.entries);
      expect(after.seats).toBe(before.seats);
      const plan = (await s.from("schedule_plans").select("items, anchors, actual_starts, hold").eq("id", w.plan).single()).data!;
      expect(plan.actual_starts).toEqual({});
      expect(plan.hold).toBeNull();
      expect(plan.anchors).toEqual({ i0: "10:00" });
      expect((plan.items as Array<{ heatId: string }>).some((i) => i.heatId === rerun.id)).toBe(false);
      // the stored draw is the starting draw
      const { data: dv } = await s.from("divisions").select("draw, draw_at_lock").eq("id", w.division).single();
      expect(dv!.draw).toEqual(dv!.draw_at_lock);
      // one audit line, with the reason and the counts; and a snapshot the organiser can read
      const { data: audit } = await s.from("audit_log").select("action, reason, before, after").eq("event_id", w.event).eq("action", "event_reset");
      expect(audit).toHaveLength(1);
      expect(audit![0].reason).toBe("Practice published by mistake");
      expect(audit![0].before).toMatchObject({ attempts: 2, published_results: 1 });
      expect(audit![0].after).toMatchObject({ role: "organiser" });
      const snaps = await x.from("event_reset_snapshots").select("id, expires_at").eq("event_id", w.event);
      expect(snaps.data).toHaveLength(1);
      expect(Date.parse(snaps.data![0].expires_at)).toBeGreaterThan(Date.now() + 29 * 86_400_000);
      expect((await y.from("event_reset_snapshots").select("id").eq("event_id", w.event)).data ?? []).toHaveLength(0);
    });

    it("a platform owner may reset too, and the audit line says so", async () => {
      const o = await world("ownerreset", { lock: "none" });
      await x.rpc("lock_division_draw", { p_division: o.division });
      expect(codeOf(await reset(owner, o, {}, await draws(o)))).toBe("");
      const { data: audit } = await s.from("audit_log").select("after").eq("event_id", o.event).eq("action", "event_reset");
      expect(audit![0].after).toMatchObject({ role: "platform_owner" });
    });

    it("Restore: refused for an organiser and for staff, brought back exactly by an owner, deleted on use", async () => {
      const snap = (await s.from("event_reset_snapshots").select("id").eq("event_id", w.event).single()).data!.id;
      expect(codeOf(await x.rpc("restore_event_reset", { p_snapshot: snap }))).toMatch(/NOT_ALLOWED/);
      expect(codeOf(await staff.rpc("restore_event_reset", { p_snapshot: snap }))).toMatch(/NOT_ALLOWED/);
      const r = await owner.rpc("restore_event_reset", { p_snapshot: snap });
      expect(codeOf(r)).toBe("");
      const back = await snapshotOf(w.event, w.division);
      expect(back.attempts).toEqual(before.attempts);
      expect(back.results).toEqual(before.results);
      expect(back.laterSeats).toBe(before.laterSeats);
      expect(back.entries).toBe(before.entries);
      expect(await count("trick_scores", w.event)).toBe(1);
      expect(await count("impression_scores", w.event)).toBe(1);
      expect(await count("penalties", w.event)).toBe(1);
      expect(await count("judge_sheets", w.event)).toBe(1);
      expect(await count("heat_decisions", w.event)).toBe(1);
      const { data: heats } = await s.from("heats").select("id, status, rerun_of, number_suffix, draw_uid").eq("event_id", w.event);
      expect(heats).toHaveLength(Object.keys(w.heats).length + 1); // the re-run is back
      expect(heats!.filter((h) => h.status === "published")).toHaveLength(1);
      expect(heats!.find((h) => h.rerun_of !== null)).toMatchObject({ number_suffix: "R" });
      expect(heats!.find((h) => h.status === "cancelled")!.draw_uid).toBeNull();
      const plan = (await s.from("schedule_plans").select("items, hold, actual_starts").eq("id", w.plan).single()).data!;
      expect(plan.hold).not.toBeNull();
      expect((plan.items as unknown[]).length).toBe(Object.keys(w.heats).length + 1);
      expect((await s.from("event_reset_snapshots").select("id").eq("id", snap)).data).toHaveLength(0);
      expect((await s.from("audit_log").select("id").eq("event_id", w.event).eq("action", "event_reset_restored")).data).toHaveLength(1);
    });

    it("Restore is refused once a heat has started since the reset, and once the snapshot has expired", async () => {
      const a = await world("restart", { lock: "none" });
      await x.rpc("lock_division_draw", { p_division: a.division });
      await play(a);
      expect(codeOf(await reset(x, a, { reason: "practice only" }, await draws(a)))).toBe("");
      const snap = (await s.from("event_reset_snapshots").select("id").eq("event_id", a.event).single()).data!.id;
      await s.from("heats").update({ status: "running", started_at: new Date().toISOString() }).eq("id", Object.values(a.heats)[0]);
      expect(codeOf(await owner.rpc("restore_event_reset", { p_snapshot: snap }))).toMatch(/HEAT_STARTED/);

      const b = await world("expired", { lock: "none" });
      await x.rpc("lock_division_draw", { p_division: b.division });
      await play(b);
      expect(codeOf(await reset(x, b, { reason: "practice only" }, await draws(b)))).toBe("");
      const snapB = (await s.from("event_reset_snapshots").select("id").eq("event_id", b.event).single()).data!.id;
      await s.from("event_reset_snapshots").update({ expires_at: new Date(Date.now() - 86_400_000).toISOString() }).eq("id", snapB);
      expect(codeOf(await owner.rpc("restore_event_reset", { p_snapshot: snapB }))).toMatch(/SNAPSHOT_EXPIRED/);
      // an expired snapshot is removed by the next Reset or Restore call, and by the Health page's purge
      expect((await staff.rpc("purge_expired_reset_snapshots")).data).toBeGreaterThanOrEqual(1);
      expect((await s.from("event_reset_snapshots").select("id").eq("id", snapB)).data).toHaveLength(0);
      expect(codeOf(await x.rpc("purge_expired_reset_snapshots"))).toMatch(/NOT_ALLOWED/);
    });
  });
});
