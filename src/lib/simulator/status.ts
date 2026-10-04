import { copy } from "@/lib/ui-copy";
import { remainingSec, type HeatClock } from "./clock";
import { checklistFromLog, type LogRow } from "./scenarios";
import { heatName, heatPlace, loadSnapshot, type SimDb, type Snapshot } from "./snapshot";
import { simErrorCode, simErrorSentence } from "./errors";
import { settingsFrom } from "./settings-from";
import { heldByOf } from "./view-hold";
import type { LogLine, NowView, SeatView, SimStats, SimStatus } from "./types";

const T = copy.simulator;

export type StatusResult = { kind: "ok"; status: SimStatus } | { kind: "not_simulation" } | { kind: "needs_setup" } | { kind: "denied" } | { kind: "error"; message: string };

const clockOf = (h: Snapshot["heats"][number]): HeatClock => ({ status: h.status, startedAt: h.started_at, pausedAt: h.paused_at, pausedTotalSec: h.paused_total_sec, durationSec: h.duration_sec });

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.ceil(s % 60) % 60).padStart(2, "0")}`;

/** The sentence under the Start button: what the simulation is doing right now (read, not acted on). */
export function statusLine(snap: Snapshot, now: NowView, blocker: string | null): string {
  const L = T.play.lines;
  if (snap.control.state === "stopped") return now.heatId ? now.label ?? L.idle : L.idle;
  if (snap.control.state === "paused") return now.label ? L.paused(now.label) : L.idle;
  if (blocker) return L.stoppedAtBlocker(blocker);
  if (!now.heatId || !now.label) return L.idle;
  if (now.status === "running") return L.playing(now.label, fmt(now.remainingSec ?? 0));
  if (now.status === "paused") return L.paused(now.label);
  return L.review(now.label);
}

/** Everything the panel shows, read as the organiser (the database refuses anyone else). */
export async function loadSimStatus(db: SimDb, eventId: string): Promise<StatusResult> {
  // Everything is asked for at the same time (one round, not four). The organiser check (`sim_stats`) travels with the rest and is looked at first: nothing that was read is
  // shown unless it passed.
  const extras = Promise.all([
    db.service.from("events").select("simulation_of, created_at").eq("id", eventId).maybeSingle(),
    db.service.from("sim_log").select("id, at, kind, scenario, text, run_no").eq("event_id", eventId).order("at", { ascending: false }).limit(400),
    db.service.from("schedule_plans").select("name, active, day").eq("event_id", eventId),
    db.service.from("judge_seats").select("id, name").eq("event_id", eventId).eq("role", "observer").eq("active", true).eq("status", "active").order("name"),
    db.service.from("sim_seats").select("seat_id, viewed_by, view_seen_at").eq("event_id", eventId),
    db.service.from("sim_control").select("settings_from_at").eq("event_id", eventId).maybeSingle(),
  ]);
  const [stats, snap] = await Promise.all([db.user.rpc("sim_stats", { p_event: eventId }), loadSnapshot(db, eventId)]);
  if (stats.error) {
    const code = simErrorCode(stats.error.message);
    if (code === "NOT_A_SIMULATION") return { kind: "not_simulation" };
    if (code === "NOT_ALLOWED") return { kind: "denied" };
    return { kind: "error", message: simErrorSentence(stats.error.message) };
  }
  if (!snap) return { kind: "needs_setup" };

  const [eventRes, logRes, plansRes, { data: observerRows }, { data: views }, controlRes] = await extras;
  const sourceId = eventRes.data?.simulation_of ?? null;
  const source = sourceId ? (await db.service.from("events").select("name").eq("id", sourceId).maybeSingle()).data : null;
  const logRows = (logRes.data ?? []) as Array<{ id: string; at: string; kind: LogRow["kind"]; scenario: string | null; text: string; run_no: number }>;
  const checklist = checklistFromLog(logRows.map((r) => ({ scenario: r.scenario, kind: r.kind, at: r.at, text: r.text, runNo: r.run_no })));
  const log: LogLine[] = logRows.slice(0, 40).map((r) => ({ id: r.id, at: r.at, kind: r.kind, scenario: r.scenario, text: r.text }));

  const live = snap.heats.find((h) => ["running", "paused", "ended", "under_review"].includes(h.status));
  const now: NowView = live
    ? { heatId: live.id, label: heatPlace(live, snap.ctx), status: live.status, remainingSec: live.status === "running" || live.status === "paused" ? remainingSec(clockOf(live), snap.nowMs) : 0 }
    : { heatId: null, label: null, status: null, remainingSec: null };

  const seenOf = new Map((views ?? []).filter((v) => v.viewed_by === db.userId && v.view_seen_at).map((v) => [v.seat_id, Math.max(0, Math.round((snap.nowMs - Date.parse(v.view_seen_at!)) / 1000))] as const));
  const seats: SeatView[] = snap.seats.map((s) => {
    const heldBy = heldByOf(s, db.userId);
    return { id: s.id, name: s.name, role: s.role, seatNo: s.seatNo, mode: s.mode, heldBy, viewSeenSec: heldBy === "you" ? (seenOf.get(s.id) ?? null) : null };
  });

  const entryIds = new Set(snap.slots.map((s) => s.entry_id).filter((x): x is string => Boolean(x)));
  const riders = snap.ctx.riders
    .filter((r) => entryIds.has(r.entryId))
    .map((r) => ({ entryId: r.entryId, name: r.name, divisionName: snap.ctx.divisions.find((d) => d.id === r.divisionId)?.name ?? "" }))
    .sort((a, b) => a.divisionName.localeCompare(b.divisionName) || a.name.localeCompare(b.name));

  const plans = plansRes.data ?? [];
  const active = plans.find((p) => p.active);
  const other = plans.find((p) => !p.active && p.day === active?.day);
  const cfg = snap.control.config;
  const deadSeat = cfg.dead ? snap.seats.find((s) => s.id === cfg.dead!.seatId) : null;

  return {
    kind: "ok",
    status: {
      event: { id: eventId, name: snap.event.name, slug: snap.event.slug, timezone: snap.event.timezone, isCopy: Boolean(eventRes.data?.simulation_of) },
      control: snap.control,
      stats: stats.data as unknown as SimStats,
      seats,
      observers: observerRows ?? [],
      riders,
      now,
      line: statusLine(snap, now, snap.control.blocker),
      checklist,
      log,
      armed: cfg.armed,
      windHeld: cfg.windHeld,
      deadJudge: deadSeat?.name ?? null,
      finalHeld: Boolean(cfg.finalHeldHeat),
      planNames: { active: active?.name ?? null, other: other?.name ?? null },
      settingsFrom: settingsFrom({ eventName: source?.name ?? null, at: controlRes.data?.settings_from_at ?? null, createdAt: eventRes.data?.created_at ?? null, timezone: snap.event.timezone }),
    },
  };
}

export { heatName };
