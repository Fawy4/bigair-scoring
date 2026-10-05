import { holdPlan, resumePlanAt } from "@/lib/live/heat-actions";
import { errorSentence } from "@/lib/live/errors";
import { isArmedNow } from "@/lib/live/flags";
import { rerunHeat } from "@/lib/live/head-actions";
import { publishHeatCore } from "@/lib/live/publish-core";
import { trickKit } from "@/lib/live/screen-model";
import type { AttemptRow, HeatRow } from "@/lib/live/types";
import { clockIn } from "@/lib/schedule/plans";
import type { Json } from "@/lib/supabase/database.types";
import { blockId } from "@/lib/trick-base";
import { copy } from "@/lib/ui-copy";
import { planAttempt, seedFrom } from "./attempts";
import { simErrorCode, simErrorSentence } from "./errors";
import { logLine, readRunOrder, updateConfig } from "./io";
import { finishPublish } from "./publish-step";
import { isFinalHeat, isScenarioKey, pickCapRider, pickDnsRider, pickTieRiders, SCENARIOS, type RiderNow, type ScenarioKey } from "./scenarios";
import { forgetContext, heatName, loadSnapshot, riderName, type SimDb, type Snapshot } from "./snapshot";

const T = copy.simulator;
const L = T.log;

export type ScenarioStatus = { status: "done"; text: string } | { status: "failed"; text: string } | { status: "wait" };

/** What a scenario may already know about the heat it works on (the tick has read it). */
interface Hint {
  heat?: HeatRow;
  data?: { attempts: AttemptRow[] };
}

const label = (key: ScenarioKey) => T.scenarios.items[key].label;

async function attemptsOf(db: SimDb, heatId: string): Promise<AttemptRow[]> {
  const { data } = await db.service
    .from("trick_attempts")
    .select("id, heat_id, entry_id, seq, client_key, direction, category_key, trick_name, trick_parts, status, created_by_seat, created_at, deleted_at, possible_duplicate_of, input_method, raw_text, updated_at")
    .eq("heat_id", heatId)
    .is("deleted_at", null)
    .order("seq");
  return (data ?? []) as AttemptRow[];
}

function ridersNow(snap: Snapshot, heat: HeatRow, attempts: AttemptRow[]): RiderNow[] {
  return snap.slots
    .filter((s) => s.heat_id === heat.id && s.entry_id)
    .map((s) => ({ entryId: s.entry_id as string, used: attempts.filter((a) => a.entry_id === s.entry_id).length, riding: !s.modifier && !s.flagged_out, position: s.position }));
}

/** One more attempt by a virtual spotter (or the organiser's practice path when the event has no spotter seat), through add_attempt. */
async function logAttempt(db: SimDb, snap: Snapshot, heat: HeatRow, entryId: string, attempts: AttemptRow[], opts: { seatId?: string | null; override?: string } = {}) {
  const division = snap.ctx.divisions.find((d) => d.id === heat.division_id);
  const kit = trickKit(snap.ctx);
  if (!division || !kit) return { error: { message: "NO_TRICK_BASE" } };
  const enabled = kit.viewFor(division).flatMap((v) => v.blocks.map(blockId));
  const mine = attempts.filter((a) => a.entry_id === entryId);
  const lastRow = mine[mine.length - 1];
  const last = lastRow ? { trickName: lastRow.trick_name ?? "Jump", direction: (lastRow.direction === "right" ? "right" : "left") as "left" | "right", categoryKey: lastRow.category_key, parts: ((lastRow.trick_parts as object) ?? { direction: null, items: [] }) as never } : null;
  const plan = planAttempt(seedFrom(`${heat.id}|${entryId}|${mine.length}|scenario`), kit.vocab, enabled, { entryId, used: mine.length, last }, { crashShare: 0, repeatShare: 0 }, null);
  if (!plan) return { error: { message: "NO_TRICK_BASE" } };
  const trick = { name: plan.trickName, direction: plan.direction, category: plan.categoryKey, parts: plan.parts } as unknown as Json;
  const seatId = opts.seatId === undefined ? virtualSpotter(snap)?.id ?? null : opts.seatId;
  const res = seatId
    ? await db.user.rpc("sim_add_attempt", { p_seat: seatId, p_heat: heat.id, p_entry: entryId, p_trick: trick, p_status: "landed", ...(opts.override ? { p_override_reason: opts.override } : {}) })
    : await db.user.rpc("practice_add_attempt", { p_heat: heat.id, p_entry: entryId, p_trick: trick, p_status: "landed" });
  if (!res.error) attempts.push(res.data as unknown as AttemptRow);
  return res;
}

const virtualSpotter = (snap: Snapshot) => snap.seats.find((s) => s.role === "spotter" && !s.person) ?? null;
const virtualHead = (snap: Snapshot) => snap.seats.find((s) => s.role === "head" && !s.person) ?? null;

const runningHeat = (snap: Snapshot): HeatRow | undefined => snap.heats.find((h) => h.status === "running" || h.status === "paused");

/** Records what a scenario did: a tick on the checklist when it is exercised, a plain line when it is only a first step. */
async function done(db: SimDb, snap: Snapshot, key: ScenarioKey, text: string, tick = true): Promise<ScenarioStatus> {
  await logLine(db, snap.eventId, tick ? "scenario" : "info", tick ? key : null, text);
  return { status: "done", text };
}
async function failed(db: SimDb, snap: Snapshot, key: ScenarioKey, why: string): Promise<ScenarioStatus> {
  const text = L.failed(label(key), why);
  await logLine(db, snap.eventId, "scenario_failed", key, text);
  return { status: "failed", text };
}

/** Fills a rider up to the division's cap with attempts a virtual spotter logs (the "out of attempts" state). */
async function fillToCap(db: SimDb, snap: Snapshot, heat: HeatRow, entryId: string, cap: number, attempts: AttemptRow[]): Promise<boolean> {
  for (let i = attempts.filter((a) => a.entry_id === entryId).length; i < cap; i++) {
    const r = await logAttempt(db, snap, heat, entryId, attempts);
    if (r.error) return false;
  }
  return true;
}

/**
 * Tries one scenario now. "wait" means it needs a moment that has not come (a running heat, riders who have not ridden, a final that is not published): the caller keeps
 * it armed. Everything it does goes through the same functions a person's screen uses, and what it did is written to the log (the checklist).
 */
export async function attemptScenario(db: SimDb, snap: Snapshot, key: ScenarioKey, hint: Hint = {}): Promise<ScenarioStatus> {
  const cfg = snap.control.config;
  const info = SCENARIOS[key];
  const heat = hint.heat ?? runningHeat(snap);
  if (info.needsRunningHeat && !heat) return { status: "wait" };

  switch (key) {
    case "wind_hold": {
      const order = await readRunOrder(db, snap);
      const live = runningHeat(snap);
      if (!cfg.windHeld) {
        if (live?.status === "running") await db.user.rpc("pause_heat", { p_heat: live.id });
        if (order.planId && !order.hold) {
          const r = await holdPlan(order.planId, "Simulator: wind hold");
          if (!r.ok) return failed(db, snap, key, r.message);
        }
        await db.user.rpc("set_wind_call", { p_event: snap.eventId, p_status: "red", p_message: "Wind hold" });
        await updateConfig(db, snap.eventId, (c) => ({ ...c, windHeld: true }));
        forgetContext(snap.eventId);
        return done(db, snap, key, L.windHold(live ? heatName(live) : null), false);
      }
      const at = clockIn(snap.event.timezone, snap.nowMs);
      if (order.planId && order.hold) {
        const r = await resumePlanAt(order.planId, at);
        if (!r.ok) return failed(db, snap, key, r.message);
      }
      if (live?.status === "paused") await db.user.rpc("resume_heat", { p_heat: live.id });
      await db.user.rpc("set_wind_call", { p_event: snap.eventId, p_status: "green", p_message: "Back on" });
      await updateConfig(db, snap.eventId, (c) => ({ ...c, windHeld: false }));
      forgetContext(snap.eventId);
      return done(db, snap, key, L.windResume(at, live ? heatName(live) : null));
    }

    case "dns": {
      const h = heat as HeatRow;
      const attempts = hint.data?.attempts ?? (await attemptsOf(db, h.id));
      const entry = pickDnsRider(ridersNow(snap, h, attempts));
      if (!entry) return failed(db, snap, key, L.noRiders);
      const r = await db.user.rpc("set_rider_status", { p_heat: h.id, p_entry: entry, p_modifier: "DNS", p_reason: "Simulator: did not show up" });
      if (r.error) return failed(db, snap, key, simErrorSentence(r.error.message));
      return done(db, snap, key, L.dns(riderName(snap.ctx, entry), heatName(h)));
    }

    case "duplicate": {
      const h = heat as HeatRow;
      const attempts = hint.data?.attempts ?? (await attemptsOf(db, h.id));
      const division = snap.ctx.divisions.find((d) => d.id === h.division_id);
      const cap = division?.maxAttempts ?? null;
      const tieIds = cfg.tie?.heatId === h.id ? [cfg.tie.entryA, cfg.tie.entryB] : [];
      const rider = ridersNow(snap, h, attempts).filter((r) => r.riding && !tieIds.includes(r.entryId) && (cap === null || r.used + 2 <= cap)).sort((a, b) => a.used - b.used)[0];
      if (!rider) return failed(db, snap, key, L.noRiders);
      const first = virtualSpotter(snap) ?? virtualHead(snap);
      if (!first) return failed(db, snap, key, L.noSpotter);
      const second = snap.seats.find((s) => !s.person && s.id !== first.id && (s.role === "spotter" || s.role === "head")) ?? null;
      const a = await logAttempt(db, snap, h, rider.entryId, attempts, { seatId: first.id });
      if (a.error) return failed(db, snap, key, simErrorSentence(a.error.message));
      // the second spotter calls the same jump a moment later (the same trick, as a second pair of eyes would)
      const before = attempts.length;
      const b = await logAttempt(db, snap, h, rider.entryId, attempts.slice(0, before - 1), { seatId: second?.id ?? null });
      if (b.error) return failed(db, snap, key, simErrorSentence(b.error.message));
      const flagged = Boolean((b.data as unknown as { possible_duplicate_of?: string | null } | null)?.possible_duplicate_of);
      return done(db, snap, key, L.duplicate(riderName(snap.ctx, rider.entryId), flagged));
    }

    case "judge_dies": {
      const h = heat as HeatRow;
      const panel = snap.panels.get(h.division_id) ?? [];
      const virtual = panel.filter((p) => snap.seats.some((s) => s.id === p.seatId && !s.person));
      const pick = virtual.find((p) => p.seatNo === cfg.specialJudge) ?? virtual[0];
      if (!pick) return failed(db, snap, key, L.noJudge);
      const seat = snap.seats.find((s) => s.id === pick.seatId)!;
      await updateConfig(db, snap.eventId, (c) => ({ ...c, dead: { heatId: h.id, seatId: seat.id } }));
      return done(db, snap, key, L.judgeDies(seat.name, heatName(h)));
    }

    case "tie": {
      const h = heat as HeatRow;
      const attempts = hint.data?.attempts ?? (await attemptsOf(db, h.id));
      const pair = pickTieRiders(ridersNow(snap, h, attempts));
      if (!pair) return { status: "wait" };
      await updateConfig(db, snap.eventId, (c) => ({ ...c, tie: { heatId: h.id, entryA: pair[0], entryB: pair[1] } }));
      return done(db, snap, key, L.tie(riderName(snap.ctx, pair[0]), riderName(snap.ctx, pair[1]), heatName(h)));
    }

    case "past_cap":
    case "out_of_attempts": {
      const h = heat as HeatRow;
      const division = snap.ctx.divisions.find((d) => d.id === h.division_id);
      const cap = division?.maxAttempts ?? null;
      if (cap === null) return failed(db, snap, key, L.noCap);
      const attempts = hint.data?.attempts ?? (await attemptsOf(db, h.id));
      const tieIds = cfg.tie?.heatId === h.id ? [cfg.tie.entryA, cfg.tie.entryB] : [];
      const pick = pickCapRider(ridersNow(snap, h, attempts).filter((r) => !tieIds.includes(r.entryId)), cap);
      if (!pick) return failed(db, snap, key, L.noRiders);
      if (!(await fillToCap(db, snap, h, pick.entryId, cap, attempts))) return failed(db, snap, key, L.noSpotter);
      const name = riderName(snap.ctx, pick.entryId);
      if (key === "out_of_attempts") return done(db, snap, key, L.outOfAttempts(name, cap));
      // one attempt too many: the database refuses it
      const spotter = virtualSpotter(snap);
      const extra = await logAttempt(db, snap, h, pick.entryId, attempts, { seatId: spotter?.id ?? null });
      if (!extra.error) return failed(db, snap, key, "The extra attempt was accepted, which is a bug.");
      if (simErrorCode(extra.error.message) !== "ATTEMPT_CAP_REACHED") return failed(db, snap, key, simErrorSentence(extra.error.message));
      await logLine(db, snap.eventId, "info", null, L.pastCapRefused(name, cap, cap));
      const head = virtualHead(snap);
      let text = L.pastCapRefused(name, cap, cap);
      if (head) {
        const over = await logAttempt(db, snap, h, pick.entryId, attempts, { seatId: head.id, override: "Simulator: the rider was in the air at the horn" });
        if (!over.error) text = `${text} ${L.pastCapAdded(name)}`;
      }
      return done(db, snap, key, text);
    }

    case "reopen": {
      const published = snap.heats.filter((h) => h.status === "published").sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))[0];
      if (!published) return failed(db, snap, key, L.noPublished);
      const re = await db.user.rpc("reopen_heat", { p_heat: published.id, p_reason: "Simulator: re-open test" });
      if (re.error) return failed(db, snap, key, simErrorSentence(re.error.message));
      const result = await publishHeatCore({ user: db.user, service: db.service }, published.id, {});
      if (!result.ok) return failed(db, snap, key, `${heatName(published)} was re-opened but could not be published again yet: ${result.message}`);
      await finishPublish(db, snap, published, result.version);
      return done(db, snap, key, L.reopen(heatName(published), result.version));
    }

    case "plan_b": {
      const { data } = await db.service.from("schedule_plans").select("id, day, name, items, anchors, defaults, active").eq("event_id", snap.eventId);
      const plans = data ?? [];
      const active = plans.find((p) => p.active);
      if (!active) return failed(db, snap, key, L.noPlan);
      const others = plans.filter((p) => p.id !== active.id && p.day === active.day);
      const target = /plan b/i.test(active.name) ? others.find((p) => /plan a/i.test(p.name)) ?? others[0] : others.find((p) => /plan b/i.test(p.name)) ?? null;
      let to = target;
      if (!to) {
        const made = await db.user
          .from("schedule_plans")
          .insert({ event_id: snap.eventId, day: active.day, name: "Plan B", items: active.items, anchors: active.anchors, defaults: active.defaults, actual_starts: {}, active: false })
          .select("id, day, name, items, anchors, defaults, active")
          .single();
        if (made.error || !made.data) return failed(db, snap, key, simErrorSentence(made.error?.message));
        to = made.data;
        await logLine(db, snap.eventId, "info", null, L.planMade(to.name));
      }
      const r = await db.user.rpc("activate_schedule_plan", { p_plan: to.id });
      if (r.error) return failed(db, snap, key, simErrorSentence(r.error.message));
      forgetContext(snap.eventId);
      return done(db, snap, key, L.planSwitch(active.name, to.name));
    }

    case "hold_final": {
      if (cfg.finalHeldHeat) {
        const heatId = cfg.finalHeldHeat;
        const r = await db.user.rpc("set_publish_hold", { p_heat: heatId, p_hold: false });
        if (r.error) return failed(db, snap, key, simErrorSentence(r.error.message));
        await updateConfig(db, snap.eventId, (c) => ({ ...c, finalHeldHeat: null }));
        const h = snap.heats.find((x) => x.id === heatId);
        return done(db, snap, key, L.holdFinalReleased(h ? heatName(h) : "The final"));
      }
      // the final may already be published: hold it now
      const finals = snap.heats
        .filter((h) => h.status === "published" && isFinalHeat(h.id, snap.heats.filter((x) => x.division_id === h.division_id && x.status !== "cancelled").map((x) => ({ id: x.id, roundId: x.round_id, number: x.number })), snap.ctx.rounds.filter((r) => r.division_id === h.division_id).map((r) => ({ id: r.id, sort: r.sort_order }))))
        .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
      const final = finals[0];
      if (!final) {
        await logLine(db, snap.eventId, "info", null, L.holdFinalArmed);
        return { status: "wait" };
      }
      const r = await db.user.rpc("set_publish_hold", { p_heat: final.id, p_hold: true, p_reason: "Simulator: held for the prize-giving" });
      if (r.error) return failed(db, snap, key, simErrorSentence(r.error.message));
      await updateConfig(db, snap.eventId, (c) => ({ ...c, finalHeldHeat: final.id }));
      return done(db, snap, key, L.holdFinalHeld(heatName(final)), false);
    }

    case "abort_start": {
      if (!snap.settings.flags.enabled) return failed(db, snap, key, errorSentence("FLAGS_OFF"));
      const yellow = snap.heats.find((h) => isArmedNow(h, snap.nowMs));
      if (!yellow) return { status: "wait" };
      const r = await db.user.rpc("abort_start", { p_heat: yellow.id });
      if (r.error) return failed(db, snap, key, simErrorSentence(r.error.message));
      // a person's Abort makes the simulator leave the heat alone; the virtual head judge's own Abort is part of the run, so the simulator raises the yellow again
      await updateConfig(db, snap.eventId, (c) => ({ ...c, noArm: null }));
      forgetContext(snap.eventId);
      return done(db, snap, key, L.abortStart(heatName(yellow)));
    }
    case "rerun": {
      const h = heat as HeatRow;
      const r = await rerunHeat({ heatId: h.id, reason: "Simulator: kite tangle", leaveOut: {} });
      if (!r.ok) return failed(db, snap, key, r.message);
      forgetContext(snap.eventId);
      return done(db, snap, key, L.rerun(heatName(h), `${heatName(h)} re-run`));
    }
  }
}

export type PressResult = { ok: true; armed: boolean; text: string } | { ok: false; message: string };

/** The button: do it now when it can be done, otherwise keep it armed until its moment; pressing an armed scenario again cancels it. */
export async function pressScenario(db: SimDb, eventId: string, rawKey: string): Promise<PressResult> {
  if (!isScenarioKey(rawKey)) return { ok: false, message: T.generic };
  const key = rawKey;
  const snap = await loadSnapshot(db, eventId);
  if (!snap) return { ok: false, message: T.errors.SIM_NOT_ENABLED() };
  const armed = snap.control.config.armed;
  if (armed.includes(key)) {
    await updateConfig(db, eventId, (c) => ({ ...c, armed: c.armed.filter((k) => k !== key) }));
    return { ok: true, armed: false, text: "" };
  }
  const r = await attemptScenario(db, snap, key);
  if (r.status === "done") return { ok: true, armed: false, text: r.text };
  if (r.status === "failed") return { ok: false, message: r.text };
  await updateConfig(db, eventId, (c) => ({ ...c, armed: [...c.armed.filter((k) => k !== key), key] }));
  return { ok: true, armed: true, text: T.scenarios.armedNote(label(key)) };
}

/** "Judge's phone is back": the judge whose phone died catches up and submits. */
export async function reviveJudge(db: SimDb, eventId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const snap = await loadSnapshot(db, eventId);
  if (!snap) return { ok: false, message: T.errors.SIM_NOT_ENABLED() };
  const dead = snap.control.config.dead;
  if (!dead) return { ok: true };
  const seat = snap.seats.find((s) => s.id === dead.seatId);
  await updateConfig(db, eventId, (c) => ({ ...c, dead: null }));
  await logLine(db, eventId, "info", null, L.judgeBack(seat?.name ?? "The judge"));
  return { ok: true };
}
