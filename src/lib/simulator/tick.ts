import { armedStartMs } from "@/lib/live/flags";
import { publishHeatCore } from "@/lib/live/publish-core";
import { trickKit } from "@/lib/live/screen-model";
import type { AttemptRow, HeatRow, SlotRow } from "@/lib/live/types";
import { blockId } from "@/lib/trick-base";
import type { FamilyView } from "@/lib/trick-base/layout";
import type { Json } from "@/lib/supabase/database.types";
import { copy } from "@/lib/ui-copy";
import { attemptsDue, planAttempt, seedFrom, type SpotterRider } from "./attempts";
import { nextStep, runOrder, type PlanHeat } from "./autoplay";
import { fractionDone, remainingSec, sinceStartSec, timeIsUp, type HeatClock } from "./clock";
import { parseSimConfig } from "./config";
import { simErrorSentence } from "./errors";
import { planImpressionWrites, planScoreWrites, type JudgeSeat, type ModeContext } from "./judges";
import { uuidFrom } from "./random";
import { logLine, readEventOrder, readRunOrder, updateConfig } from "./io";
import { finishPublish } from "./publish-step";
import { attemptScenario } from "./scenario-runner";
import { isScenarioKey } from "./scenarios";
import { skipRefusal } from "./skip";
import { forgetContext, heatName, heatPlace, loadSnapshot, type SimDb, type Snapshot } from "./snapshot";
import type { SeatInfo } from "./types";
import { SIM_VIEW_LEAVE_GRACE_SEC, SIM_VIEW_SILENT_SEC } from "./view-hold";
import { withTickLock, type LockRpc } from "./tick-lock";

const T = copy.simulator;
const clockOf = (h: HeatRow): HeatClock => ({ status: h.status, startedAt: h.started_at, pausedAt: h.paused_at, pausedTotalSec: h.paused_total_sec, durationSec: h.duration_sec });

export type TickResult = { ok: true; busy?: boolean; playing: boolean; line: string; blocker: string | null } | { ok: false; message: string };

/** The blocks the division has switched on in its trick base. */
function enabledIds(view: FamilyView[]): string[] {
  return view.flatMap((v) => v.blocks.map(blockId));
}

interface HeatData {
  attempts: AttemptRow[];
  scores: Set<string>; // attemptId|seatId
  impressions: Set<string>; // entryId|seatId
  submitted: Set<string>; // seatId
}

async function loadHeatData(db: SimDb, heatId: string): Promise<HeatData> {
  const { service } = db;
  const [a, s, i, sh] = await Promise.all([
    service.from("trick_attempts").select("id, heat_id, entry_id, seq, client_key, direction, category_key, trick_name, trick_parts, status, created_by_seat, created_at, deleted_at, possible_duplicate_of, input_method, raw_text, updated_at").eq("heat_id", heatId).is("deleted_at", null).order("seq"),
    service.from("trick_scores").select("attempt_id, judge_seat_id").eq("heat_id", heatId),
    service.from("impression_scores").select("entry_id, judge_seat_id").eq("heat_id", heatId),
    service.from("judge_sheets").select("judge_seat_id, submitted_at, reopened_at").eq("heat_id", heatId),
  ]);
  return {
    attempts: (a.data ?? []) as AttemptRow[],
    scores: new Set((s.data ?? []).map((r) => `${r.attempt_id}|${r.judge_seat_id}`)),
    impressions: new Set((i.data ?? []).map((r) => `${r.entry_id}|${r.judge_seat_id}`)),
    submitted: new Set((sh.data ?? []).filter((r) => r.submitted_at && (!r.reopened_at || r.submitted_at > r.reopened_at)).map((r) => r.judge_seat_id)),
  };
}

/** The simulator's own logins: a virtual seat that is free gets its login (made once) so the seat acts like any phone. A seat a person holds is left alone. */
async function ensureVirtualSeats(db: SimDb, snap: Snapshot): Promise<void> {
  for (const seat of snap.seats) {
    if (seat.mode !== "virtual" || seat.person) continue;
    if (seat.boundUser && seat.boundUser === seat.virtualUser) continue;
    let user = seat.virtualUser;
    if (!user) {
      const made = await db.service.auth.admin.createUser({ email: `sim-${seat.id}@example.com`, email_confirm: true, user_metadata: { simulator: true, seat: seat.id } });
      if (made.error || !made.data.user) continue;
      user = made.data.user.id;
    }
    const bound = await db.service.rpc("sim_bind_virtual", { p_seat: seat.id, p_user: user });
    const ok = !bound.error && (bound.data as { ok?: boolean } | null)?.ok === true;
    if (ok) {
      seat.virtualUser = user;
      seat.boundUser = user;
      seat.person = false;
    }
  }
}

function planHeats(snap: Snapshot): PlanHeat[] {
  return snap.heats.map((h) => {
    const slots = snap.slots.filter((s) => s.heat_id === h.id);
    return {
      id: h.id,
      status: h.status,
      divisionSort: snap.ctx.divisions.find((d) => d.id === h.division_id)?.sortOrder ?? 0,
      roundSort: snap.ctx.rounds.find((r) => r.id === h.round_id)?.sort_order ?? 0,
      number: h.number,
      suffix: h.number_suffix,
      locked: snap.lockedDivisions.has(h.division_id),
      filled: slots.length > 0 && slots.every((s) => s.entry_id !== null || s.modifier === "DNS"),
    };
  });
}

const riding = (slots: SlotRow[]) => slots.filter((s) => s.entry_id && !s.modifier && !s.flagged_out).sort((a, b) => a.position - b.position);

/** Virtual spotters log attempts at the configured rate, through add_attempt like a phone does (or the organiser's practice path when the event has no spotter seat at all). */
async function spotterStep(db: SimDb, snap: Snapshot, heat: HeatRow, data: HeatData, fast = false): Promise<void> {
  const cfg = snap.control.config;
  const division = snap.ctx.divisions.find((d) => d.id === heat.division_id);
  const kit = trickKit(snap.ctx);
  if (!division || !kit) return;
  const cap = division.maxAttempts;
  const enabled = enabledIds(kit.viewFor(division));
  const spotters = snap.seats.filter((s) => s.role === "spotter" && !s.person);
  const noSpotterSeats = !snap.seats.some((s) => s.role === "spotter");
  if (!spotters.length && !noSpotterSeats) return; // the spotters are real people: they log
  // "Skip to end of heat": the officials act as if the heat were over, so every rider has all attempts logged now
  const fraction = fast ? 1 : fractionDone(clockOf(heat), snap.nowMs);
  const tie = cfg.tie?.heatId === heat.id ? new Set([cfg.tie.entryA, cfg.tie.entryB]) : null;
  const riders = riding(snap.slots.filter((s) => s.heat_id === heat.id));
  let budget = fast ? 400 : 8;
  let turn = data.attempts.length;
  for (const [index, slot] of riders.entries()) {
    const entryId = slot.entry_id as string;
    const mine = data.attempts.filter((a) => a.entry_id === entryId);
    const tied = tie?.has(entryId) ?? false;
    const perRider = tied ? Math.min(3, cap ?? 3) : cfg.attemptsPerRider;
    const due = fast ? attemptsDue({ fraction, perRider, cap, used: mine.length, riderIndex: index }) : Math.min(2, attemptsDue({ fraction, perRider, cap, used: mine.length, riderIndex: index }));
    let last: SpotterRider["last"] = mine.length ? lastOf(mine[mine.length - 1]) : null;
    for (let k = 0; k < due && budget > 0; k++) {
      const plan = planAttempt(seedFrom(`${heat.id}|${entryId}|${mine.length + k}`), kit.vocab, enabled, { entryId, used: mine.length + k, last }, { crashShare: tied ? 0 : cfg.crashShare, repeatShare: tied ? 0 : cfg.repeatShare }, cap);
      if (!plan) break;
      const trick = { name: plan.trickName, direction: plan.direction, category: plan.categoryKey, parts: plan.parts } as unknown as Json;
      const seat = spotters.length ? spotters[turn++ % spotters.length] : null;
      const res = seat
        ? await db.user.rpc("sim_add_attempt", { p_seat: seat.id, p_heat: heat.id, p_entry: entryId, p_trick: trick, p_status: plan.status })
        : await db.user.rpc("practice_add_attempt", { p_heat: heat.id, p_entry: entryId, p_trick: trick, p_status: plan.status });
      budget--;
      if (res.error) break;
      last = { trickName: plan.trickName, direction: plan.direction, categoryKey: plan.categoryKey, parts: plan.parts };
    }
  }
}

function lastOf(a: AttemptRow): SpotterRider["last"] {
  return { trickName: a.trick_name ?? "Jump", direction: a.direction === "right" ? "right" : "left", categoryKey: a.category_key, parts: ((a.trick_parts as object) ?? { direction: null, items: [] }) as never };
}

const needsImpression = (model: { heat: { impression: { required: boolean } | null } }) => Boolean(model.heat.impression && model.heat.impression.required !== false);

/** Virtual judges score what the spotters log, write their Impression / Variety scores when the heat is over, and submit their sheets once everything is in. */
async function judgeStep(db: SimDb, snap: Snapshot, heat: HeatRow, data: HeatData, ended: boolean, finishNow = false): Promise<void> {
  const cfg = snap.control.config;
  const division = snap.ctx.divisions.find((d) => d.id === heat.division_id);
  if (!division) return;
  const panel = snap.panels.get(heat.division_id) ?? [];
  const judges: JudgeSeat[] = panel.flatMap((p) => {
    const seat = snap.seats.find((s) => s.id === p.seatId);
    return seat && !seat.person ? [{ seatId: seat.id, seatNo: p.seatNo }] : [];
  });
  if (!judges.length) return;
  const dead = cfg.dead?.heatId === heat.id ? [cfg.dead.seatId] : [];
  const tieEntries: [string, string] | null = cfg.tie?.heatId === heat.id ? [cfg.tie.entryA, cfg.tie.entryB] : null;
  const clock = clockOf(heat);
  const mode: ModeContext = {
    mode: cfg.judgeMode,
    specialSeatNo: cfg.specialJudge,
    missShare: cfg.missShare,
    offlineSec: cfg.offlineSec,
    lateSec: cfg.lateSec,
    speed: snap.control.speed,
    heatEnded: ended,
    sinceStartSec: sinceStartSec(clock, snap.nowMs),
    heatDurationSec: heat.duration_sec,
    finishNow,
  };
  const ordinal = new Map(data.attempts.map((a) => [a.id, a.seq]));
  const writes = planScoreWrites({
    model: division.model,
    spread: cfg.spread,
    judges,
    attempts: data.attempts.map((a) => ({ id: a.id, entryId: a.entry_id, ordinal: ordinal.get(a.id) ?? 1, status: a.status, ageSec: (snap.nowMs - Date.parse(a.created_at)) / 1000 })),
    existing: data.scores,
    mode,
    deadSeatIds: dead,
    tieEntries,
    limit: 12,
  });
  for (const w of writes) {
    const res = await db.user.rpc("sim_submit_score", {
      p_seat: w.seatId,
      p_attempt: w.attemptId,
      p_criteria: (w.kind === "score" && w.criteria ? w.criteria : {}) as Json,
      p_score: (w.kind === "score" ? w.score : null) as never,
      p_missed: w.kind === "missed",
      p_client_key: uuidFrom(`score|${w.attemptId}|${w.seatId}`),
      p_client_rev: 1,
    });
    if (!res.error) data.scores.add(`${w.attemptId}|${w.seatId}`);
  }
  if (!ended) return;

  const heatRiders = riding(snap.slots.filter((s) => s.heat_id === heat.id)).map((s) => ({ entryId: s.entry_id as string }));
  const impressions = planImpressionWrites({ model: division.model, spread: cfg.spread, judges, riders: heatRiders, existing: data.impressions, deadSeatIds: dead, tieEntries }).slice(0, 15);
  for (const w of impressions) {
    const res = await db.user.rpc("sim_submit_impression", { p_seat: w.seatId, p_heat: heat.id, p_entry: w.entryId, p_value: w.value, p_client_key: uuidFrom(`impression|${heat.id}|${w.entryId}|${w.seatId}`), p_client_rev: 1 });
    if (!res.error) data.impressions.add(`${w.entryId}|${w.seatId}`);
  }

  // a judge submits once every landed attempt has a score from them (or a Missed) and every rider an Impression / Variety score
  const landed = data.attempts.filter((a) => a.status === "landed");
  for (const j of judges) {
    if (dead.includes(j.seatId) || data.submitted.has(j.seatId)) continue;
    const scored = division.model.trick.entry === "none" || landed.every((a) => data.scores.has(`${a.id}|${j.seatId}`));
    const impressed = !needsImpression(division.model) || heatRiders.every((r) => data.impressions.has(`${r.entryId}|${j.seatId}`));
    if (!scored || !impressed) continue;
    const res = await db.user.rpc("sim_submit_sheet", { p_seat: j.seatId, p_heat: heat.id });
    if (!res.error) data.submitted.add(j.seatId);
  }
}

/** The virtual head judge: merges a double-logged attempt, moves the heat to review when every sheet is in, publishes when nothing blocks, and releases the result. */
async function headStep(db: SimDb, snap: Snapshot, heat: HeatRow, data: HeatData): Promise<string> {
  const headSeat = snap.seats.find((s) => s.role === "head");
  const name = heatName(heat);
  if (headSeat?.person) return T.play.lines.waitHead(name);
  const panel = snap.panels.get(heat.division_id) ?? [];
  const waiting = panel.map((p) => snap.seats.find((s) => s.id === p.seatId)).filter((s): s is SeatInfo => Boolean(s?.person) && !data.submitted.has(s!.id));
  // the same attempt logged twice: merge, keeping the first logged
  if (heat.status === "ended") {
    for (const dup of data.attempts.filter((a) => a.possible_duplicate_of)) {
      const keep = data.attempts.find((a) => a.id === dup.possible_duplicate_of);
      if (!keep || dup.possible_duplicate_of === null) continue;
      const first = Date.parse(keep.created_at) <= Date.parse(dup.created_at) ? keep : dup;
      const second = first === keep ? dup : keep;
      const res = await db.user.rpc("merge_attempts", { p_keep: first.id, p_drop: second.id, p_choices: {} as Json, p_reason: "Simulator: the same trick was logged twice" });
      if (!res.error) await logLine(db, snap.eventId, "info", null, T.log.merged(snap.ctx.riders.find((r) => r.entryId === dup.entry_id)?.name ?? "a rider"));
    }
  }
  const allIn = panel.length > 0 && panel.every((p) => data.submitted.has(p.seatId));
  if (heat.status === "ended" && allIn) await db.user.rpc("review_heat", { p_heat: heat.id });
  if (waiting.length && !allIn) {
    // a real judge has not submitted yet: nothing to publish past
    return T.play.lines.waitJudges(name, waiting.map((s) => s.name).join(", "));
  }

  const result = await publishHeatCore({ user: db.user, service: db.service }, heat.id, {});
  if (result.ok) {
    await finishPublish(db, snap, heat, result.version);
    return T.play.lines.publishing(name);
  }
  if (result.code === "PUBLISH_BLOCKED" && result.blockers?.length) {
    const text = result.blockers.map((b) => b.text).join(" · ");
    if (snap.control.blocker !== text) {
      await db.user.rpc("sim_set", { p_event: snap.eventId, p_patch: { blocker: text } });
      await logLine(db, snap.eventId, "blocker", null, T.log.blocker(name, text));
    }
    return T.play.lines.stoppedAtBlocker(text);
  }
  const why = result.message;
  if (snap.control.blocker !== why) {
    await db.user.rpc("sim_set", { p_event: snap.eventId, p_patch: { blocker: why } });
    await logLine(db, snap.eventId, "blocker", null, T.log.blocker(name, why));
  }
  return T.play.lines.stoppedAtBlocker(why);
}

/** One step of the auto-play, as the organiser. Safe to call from any tab: one step at a time, and each step gives the lock back when it is done (Polish 2, item 4b). */
export async function simTick(db: SimDb, eventId: string): Promise<TickResult> {
  const lock: LockRpc = {
    begin: async (ms) => {
      const r = await db.user.rpc("sim_tick_begin", { p_event: eventId, p_ms: ms });
      if (r.error) throw new Error(r.error.message);
      return (r.data as string | null) ?? null;
    },
    end: async (token) => {
      const r = await db.user.rpc("sim_tick_end", { p_event: eventId, p_token: token });
      return !r.error && Boolean(r.data);
    },
  };
  try {
    const r = await withTickLock(lock, () => tickInside(db, eventId));
    return r.busy ? { ok: true, busy: true, playing: true, line: T.play.lines.busy, blocker: null } : r.value;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? simErrorSentence(e.message) : T.generic };
  }
}

async function tickInside(db: SimDb, eventId: string): Promise<TickResult> {
  // a View-as tab that was closed (or went quiet) gives its seat back first, so the simulator plays it again in this very tick
  const released = await db.user.rpc("sim_release_stale_views", { p_event: eventId, p_silent_sec: SIM_VIEW_SILENT_SEC, p_leave_grace_sec: SIM_VIEW_LEAVE_GRACE_SEC });
  const names = (released.data as string[] | null) ?? [];
  if (names.length) await logLine(db, eventId, "info", null, T.roles.givenBack(names.join(", ")));
  const snap = await loadSnapshot(db, eventId);
  if (!snap) return { ok: false, message: T.errors.SIM_NOT_ENABLED() };
  if (snap.control.state !== "playing") return { ok: true, playing: false, line: T.play.lines.idle, blocker: snap.control.blocker };
  await ensureVirtualSeats(db, snap);
  let line: string;
  try {
    line = await step(db, snap);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? simErrorSentence(e.message) : T.generic };
  }
  await db.user.rpc("sim_set", { p_event: eventId, p_patch: { tick: true } });
  const fresh = await db.service.from("sim_control").select("state, blocker").eq("event_id", eventId).maybeSingle();
  return { ok: true, playing: fresh.data?.state === "playing", line, blocker: fresh.data?.blocker ?? null };
}

async function step(db: SimDb, snap: Snapshot): Promise<string> {
  const whole = snap.control.config.wholeEvent;
  const order = whole ? await readEventOrder(db, snap.eventId).then((o) => ({ heatIds: o.heatIds, held: o.held, hold: false })) : { ...(await readRunOrder(db, snap)), held: new Set<string>() };
  const ordered = runOrder(planHeats(snap), order.heatIds);
  // the whole event: a plan on hold holds only its own heats
  if (whole) order.hold = order.held.has(ordered.find((h) => h.status === "scheduled")?.id ?? "");
  const byId = new Map(snap.heats.map((h) => [h.id, h]));
  const live = ordered.find((p) => ["running", "paused", "ended", "under_review"].includes(p.status));
  if (live) {
    let heat = byId.get(live.id)!;
    const name = heatName(heat);
    if (heat.status === "running" && timeIsUp(clockOf(heat), snap.nowMs)) {
      const ended = await db.user.rpc("end_heat_if_due", { p_heat: heat.id });
      if (!ended.error && ended.data) heat = { ...heat, status: (ended.data as { status: string }).status, ended_at: (ended.data as { ended_at: string | null }).ended_at };
    }
    if (heat.status === "paused") return T.play.lines.paused(name);
    const data = await loadHeatData(db, heat.id);
    if (heat.status === "running") {
      // Pause may have been pressed (on the console or the panel) since this step began: the officials look again before each move
      if (await pausedNow(db, snap.eventId)) return T.play.lines.paused(name);
      await processArmed(db, snap, heat, data);
      if (await pausedNow(db, snap.eventId)) return T.play.lines.paused(name);
      await spotterStep(db, await refreshConfig(db, snap), heat, data);
      if (await pausedNow(db, snap.eventId)) return T.play.lines.paused(name);
      await judgeStep(db, snap, heat, await loadHeatData(db, heat.id), false);
      return T.play.lines.playing(name, formatLeft(remainingSec(clockOf(heat), snap.nowMs)));
    }
    // ended or under review
    await judgeStep(db, snap, heat, data, true);
    const after = await loadHeatData(db, heat.id);
    // "Skip to end of heat" left this heat for the head judge: the virtual one waits for the Publish press
    if (snap.control.config.reviewHold === heat.id && heat.status === "under_review") return T.play.lines.reviewHeld(name);
    return headStep(db, snap, heat, after);
  }

  // Flags: a heat in its yellow. The virtual officials wait for green (they log and score only while Running or Last minute); when the pre-start is over the start is
  // written down at the armed moment, and the "Abort the start" scenario, if pressed, aborts it here.
  const yellow = snap.heats.find((h) => h.status === "scheduled" && h.armed_at);
  if (yellow) {
    const name = heatName(yellow);
    // the pre-start is frozen (Pause on the console or the simulator): nothing moves until Resume
    if (yellow.armed_paused_at) return T.play.lines.yellowPaused(name);
    const startMs = armedStartMs({ status: yellow.status, armedAt: yellow.armed_at ?? null, prestartSec: yellow.prestart_sec ?? null });
    if (startMs !== null && snap.nowMs < startMs) {
      if (snap.control.config.armed.includes("abort_start")) {
        const r = await attemptScenario(db, snap, "abort_start");
        if (r.status !== "wait") await updateConfig(db, snap.eventId, (c) => ({ ...c, armed: c.armed.filter((k) => k !== "abort_start") }));
        if (r.status === "done") return r.text;
      }
      return T.play.lines.yellow(name, formatLeft((startMs - snap.nowMs) / 1000));
    }
    await db.user.rpc("start_armed_if_due", { p_heat: yellow.id });
    forgetContext(snap.eventId);
    return T.play.lines.starting(name);
  }

  const next = nextStep({ ordered, hold: order.hold, maxRunning: snap.event.maxRunningHeats });
  if (next.kind === "finished") {
    await db.user.rpc("sim_set", { p_event: snap.eventId, p_patch: { state: "stopped", blocker: null } });
    await logLine(db, snap.eventId, "heat", null, whole ? T.log.wholeComplete : T.log.complete);
    if (whole) await updateConfig(db, snap.eventId, (c) => ({ ...c, wholeEvent: false }));
    return whole ? T.play.lines.wholeFinished : T.play.lines.finished;
  }
  if (next.kind === "wait") {
    const h = next.heatId ? byId.get(next.heatId) : undefined;
    if (next.reason === "hold") return T.play.lines.hold;
    if (next.reason === "not_ready" && h) return T.play.lines.notReady(heatName(h));
    return T.play.lines.idle;
  }
  const heat = byId.get(next.heatId)!;
  // Pause may have been pressed since this step began: the head judge's console or the simulator's own Pause stops the arming too
  if (await pausedNow(db, snap.eventId)) return T.play.lines.idle;
  // with the flags on the officials follow the sequence: the yellow first, the heat starts by itself at 0:00 of the pre-start
  const started = snap.settings.flags.enabled ? await db.user.rpc("arm_heat", { p_heat: heat.id }) : await db.user.rpc("start_heat", { p_heat: heat.id });
  // the head judge raised the yellow herself in the meantime: her sequence stands, the simulator only follows it
  if (started.error && /ALREADY_ARMED/.test(started.error.message)) return T.play.lines.starting(heatName(heat));
  if (started.error) {
    const why = simErrorSentence(started.error.message);
    if (snap.control.blocker !== why) {
      await db.user.rpc("sim_set", { p_event: snap.eventId, p_patch: { blocker: why } });
      await logLine(db, snap.eventId, "blocker", null, T.log.blocker(heatName(heat), why));
    }
    return T.play.lines.stoppedAtBlocker(why);
  }
  if (snap.control.blocker) await db.user.rpc("sim_set", { p_event: snap.eventId, p_patch: { blocker: null } });
  await logLine(db, snap.eventId, "heat", null, T.log.heatStarted(heatPlace(heat, snap.ctx), snap.control.speed));
  forgetContext(snap.eventId);
  return T.play.lines.starting(heatName(heat));
}

/** True when the simulator is no longer playing (Pause or Stop pressed meanwhile). */
async function pausedNow(db: SimDb, eventId: string): Promise<boolean> {
  const { data } = await db.service.from("sim_control").select("state").eq("event_id", eventId).maybeSingle();
  return !!data && data.state !== "playing";
}

async function refreshConfig(db: SimDb, snap: Snapshot): Promise<Snapshot> {
  const { data } = await db.service.from("sim_control").select("config").eq("event_id", snap.eventId).maybeSingle();
  return { ...snap, control: { ...snap.control, config: parseSimConfig(data?.config) } };
}

const formatLeft = (s: number) => `${Math.floor(s / 60)}:${String(Math.ceil(s % 60) % 60).padStart(2, "0")}`;

/** Scenarios that were waiting for a running heat are tried now, in the order they were pressed. */
async function processArmed(db: SimDb, snap: Snapshot, heat: HeatRow, data: HeatData): Promise<void> {
  for (const key of snap.control.config.armed) {
    if (!isScenarioKey(key)) continue;
    const r = await attemptScenario(db, snap, key, { heat, data });
    if (r.status === "wait") continue;
    await updateConfig(db, snap.eventId, (c) => ({ ...c, armed: c.armed.filter((k) => k !== key) }));
  }
}

/** One step of a button on the panel, with the auto-play's lock: the auto-play may be half-way through a step, so wait for it a moment rather than refuse. */
async function withSimLock<T>(db: SimDb, eventId: string, run: () => Promise<T>, busy: T): Promise<T> {
  const lock: LockRpc = {
    begin: async (ms) => {
      const r = await db.user.rpc("sim_tick_begin", { p_event: eventId, p_ms: ms });
      if (r.error) throw new Error(r.error.message);
      return (r.data as string | null) ?? null;
    },
    end: async (token) => !(await db.user.rpc("sim_tick_end", { p_event: eventId, p_token: token })).error,
  };
  for (let tries = 0; tries < 20; tries++) {
    const r = await withTickLock(lock, run);
    if (!r.busy) return r.value;
    await new Promise((ok) => setTimeout(ok, 500));
  }
  return busy;
}

type PanelResult = { ok: true; text: string } | { ok: false; message: string };
const failedText = (e: unknown): PanelResult => ({ ok: false, message: e instanceof Error ? simErrorSentence(e.message) : T.generic });

/**
 * "Skip to end of heat": fast-forwards the virtual officials to the end of the heat on the water. The virtual spotters log every rider's attempts now and the virtual
 * judges score all of them now. Then the heat ends (the clock reads 0:00, the flag goes red) and, when every sheet is in, goes to review. It is never published:
 * that is "End heat and publish". Real people are waited for, as always.
 */
export async function skipToEnd(db: SimDb, eventId: string): Promise<PanelResult> {
  try {
    return await withSimLock<PanelResult>(db, eventId, () => skipInside(db, eventId), { ok: false, message: T.play.lines.busy });
  } catch (e) {
    return failedText(e);
  }
}

/** "End heat and publish": the old Skip to end. Ends the heat on the water now, the virtual judges finish and submit, the virtual head judge publishes if nothing blocks. */
export async function endAndPublish(db: SimDb, eventId: string): Promise<PanelResult> {
  try {
    return await withSimLock<PanelResult>(db, eventId, () => endAndPublishInside(db, eventId), { ok: false, message: T.play.lines.busy });
  } catch (e) {
    return failedText(e);
  }
}

async function skipInside(db: SimDb, eventId: string): Promise<PanelResult> {
  const snap = await loadSnapshot(db, eventId);
  if (!snap) return { ok: false, message: T.errors.SIM_NOT_ENABLED() };
  await ensureVirtualSeats(db, snap);
  const refusal = skipRefusal({ state: snap.control.state, heats: snap.heats.map((h) => ({ status: h.status, armed: Boolean(h.armed_at) })) });
  if (refusal) return { ok: false, message: refusal === "paused" ? T.skip.paused : refusal === "inYellow" ? T.skip.inYellow : T.skip.noHeat };
  let heat = snap.heats.find((h) => h.status === "running")!;
  const name = heatName(heat);
  const fast = { ...snap, nowMs: snap.nowMs };
  await spotterStep(db, fast, heat, await loadHeatData(db, heat.id), true);
  // a few rounds, each writes what is left (scores) until nothing changes
  for (let round = 0; round < 8; round++) {
    const before = await loadHeatData(db, heat.id);
    const written = before.scores.size; // judgeStep adds what it writes to `before`, so the count is taken first
    await judgeStep(db, fast, heat, before, false, true);
    const after = await loadHeatData(db, heat.id);
    if (after.scores.size === written) break;
  }
  // the clock jumps to 0:00: the heat ends now, as the head judge's End heat does (the flag goes red)
  const ended = await db.user.rpc("end_heat", { p_heat: heat.id });
  if (ended.error) return { ok: false, message: simErrorSentence(ended.error.message) };
  heat = { ...heat, status: "ended", ended_at: (ended.data as { ended_at: string | null } | null)?.ended_at ?? heat.ended_at };
  // the virtual judges finish (Impression scores, sheets) and the heat goes to review; the virtual head judge does NOT publish: that is the other button
  for (let round = 0; round < 8; round++) {
    const before = await loadHeatData(db, heat.id);
    const had = [before.scores.size, before.impressions.size, before.submitted.size];
    await judgeStep(db, fast, heat, before, true, true);
    const after = await loadHeatData(db, heat.id);
    if (after.scores.size === had[0] && after.impressions.size === had[1] && after.submitted.size === had[2]) break;
  }
  const final = await loadHeatData(db, heat.id);
  const panel = snap.panels.get(heat.division_id) ?? [];
  const allIn = panel.length > 0 && panel.every((p) => final.submitted.has(p.seatId));
  let inReview = false;
  if (allIn) {
    const review = await db.user.rpc("review_heat", { p_heat: heat.id });
    inReview = !review.error;
  }
  await updateConfig(db, eventId, (c) => ({ ...c, reviewHold: heat.id }));
  await logLine(db, eventId, "heat", null, T.log.fastForwarded(heatPlace(heat, snap.ctx)));
  forgetContext(eventId);
  return { ok: true, text: inReview ? T.skip.done(name) : T.skip.doneWaiting(name) };
}

async function endAndPublishInside(db: SimDb, eventId: string): Promise<PanelResult> {
  const snap = await loadSnapshot(db, eventId);
  if (!snap) return { ok: false, message: T.errors.SIM_NOT_ENABLED() };
  await ensureVirtualSeats(db, snap);
  // a heat still in its yellow starts at once (Start now), so that the skip has a heat to end and the flag lands on red
  const yellow = snap.heats.find((h) => h.status === "scheduled" && h.armed_at);
  if (yellow && !snap.heats.some((h) => h.status === "running" || h.status === "paused")) {
    const r = await db.user.rpc("start_heat", { p_heat: yellow.id });
    if (r.error) return { ok: false, message: simErrorSentence(r.error.message) };
    snap.heats = snap.heats.map((h) => (h.id === yellow.id ? { ...h, ...(r.data as unknown as Partial<HeatRow>) } : h));
  }
  let heat = snap.heats.find((h) => h.status === "running" || h.status === "paused") ?? snap.heats.find((h) => h.status === "ended" || h.status === "under_review");
  if (!heat) return { ok: false, message: T.endPublish.noHeat };
  const name = heatName(heat);
  if (heat.status === "running" || heat.status === "paused") {
    const ended = await db.user.rpc("end_heat", { p_heat: heat.id });
    if (ended.error) return { ok: false, message: simErrorSentence(ended.error.message) };
    heat = { ...heat, status: "ended", ended_at: (ended.data as { ended_at: string | null } | null)?.ended_at ?? heat.ended_at };
  }
  // the virtual judges finish: a few rounds, each writes what is left (scores, Impression / Variety scores) and submits
  for (let round = 0; round < 8; round++) {
    const before = await loadHeatData(db, heat.id);
    const had = [before.scores.size, before.impressions.size, before.submitted.size]; // judgeStep adds what it writes to `before`, so the counts are taken first
    await judgeStep(db, snap, heat, before, true, true);
    const after = await loadHeatData(db, heat.id);
    if (after.scores.size === had[0] && after.impressions.size === had[1] && after.submitted.size === had[2]) break;
  }
  if (snap.control.config.reviewHold === heat.id) await updateConfig(db, eventId, (c) => ({ ...c, reviewHold: null }));
  const line = await headStep(db, snap, heat, await loadHeatData(db, heat.id));
  await logLine(db, eventId, "heat", null, T.log.endedAndPublished(heatPlace(heat, snap.ctx)));
  forgetContext(eventId);
  return { ok: true, text: `${T.endPublish.done(name)} ${line}` };
}
