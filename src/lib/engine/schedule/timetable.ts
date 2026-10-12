import type { RunItem, SchedulePlan } from "@/lib/schemas/schedule";
import { localToUtc, toIso, utcToLocalHHMM } from "./time";
import type { HeatLive, RowStatus, Timetable, TimetableOptions, TimetableRow } from "./types";

const MIN = 60_000;

interface Entry {
  item: RunItem;
  live?: HeatLive;
  actualStart?: number;
}

/**
 * The running order with times (docs/04 §7.2, Decisions 8–12). One cursor walk:
 * done/live rows first in their actual order, then the un-started items in plan order.
 * - actual start (from the heat's server timestamp) wins; a running heat's end is start + duration + paused
 *   minutes, or "now" once it runs over;
 * - a pin means "not before": start = max(pin, previous end + break, now);
 * - break precedence: item → round (last heat of a round uses the round-end break) → plan default;
 *   an explicit break item replaces the previous automatic break;
 * - a hold shows every un-started row as "held" with no times.
 */
export function computeTimetable(plan: SchedulePlan, heats: HeatLive[], opts: TimetableOptions): Timetable {
  const { timezone, eventDay, defaults } = opts;
  const now = opts.now !== undefined ? Date.parse(opts.now) : undefined;
  const byHeat = new Map(heats.map((h) => [h.heatId, h]));
  const hhmm = (ms: number) => utcToLocalHHMM(ms, timezone);

  const entries: Entry[] = plan.items.map((item) => {
    if (item.kind === "heat") {
      const live = item.heatId ? byHeat.get(item.heatId) : undefined;
      return { item, live, actualStart: live?.startedAt ? Date.parse(live.startedAt) : undefined };
    }
    const at = plan.actualStarts[item.id];
    return { item, actualStart: at ? Date.parse(at) : undefined };
  });
  const started = entries.filter((e) => e.actualStart !== undefined).sort((a, b) => a.actualStart! - b.actualStart!);
  const ordered = [...started, ...entries.filter((e) => e.actualStart === undefined)];
  const lastPlanItem = plan.items[plan.items.length - 1]?.id;

  const rows: TimetableRow[] = [];
  let prevEnd: number | null = null;
  let prevBreak = 0;
  let nextMarked = false;

  ordered.forEach((e, idx) => {
    const { item, live } = e;
    const isLastRow = idx === ordered.length - 1;
    const pinHhmm = plan.anchors[item.id];
    const pin = pinHhmm ? localToUtc(eventDay, pinHhmm, timezone) : undefined;
    const warnings: string[] = [];
    let issue: TimetableRow["issue"] = null;
    const base = {
      itemId: item.id,
      kind: item.kind,
      label: item.kind === "heat" ? [live?.division, live?.round, live?.heat].filter(Boolean).join(" ") || item.id : item.label,
      ...(item.kind === "heat" ? { heatId: item.heatId, division: live?.division, round: live?.round, heat: live?.heat } : {}),
      pinned: pin !== undefined,
    };
    // length: the row's own, else the heat's (always stored with the heat), else none: a warning and no time, never an exception
    const given = item.kind === "note" ? 0 : (item.durationMin ?? live?.durationMin);
    const hasLength = given !== undefined && Number.isFinite(given) && (item.kind === "note" || given > 0);
    const duration = hasLength ? given : 0;
    const warmUpRaw = item.kind === "heat" ? (item.warmUpMin ?? live?.warmUpMin ?? 0) : 0;
    const warmUp = Number.isFinite(warmUpRaw) && warmUpRaw > 0 ? warmUpRaw : 0;
    // a heat row that points at nothing: its heat was removed from the draw after it was added
    const orphan = item.kind === "heat" && (!item.heatId || !live);

    const emit = (
      row: Pick<TimetableRow, "status" | "reason" | "walkover"> & { start: number | null; end: number | null; breakAfter: number | null },
    ) => {
      const startMs = row.start;
      const heatRow = item.kind === "heat";
      rows.push({
        ...base,
        durationMin: duration,
        warmUpMin: warmUp,
        warmUpStartUtc: heatRow && startMs !== null ? toIso(startMs - warmUp * MIN) : null,
        warmUpStart: heatRow && startMs !== null ? hhmm(startMs - warmUp * MIN) : null,
        startUtc: startMs === null ? null : toIso(startMs),
        endUtc: row.end === null ? null : toIso(row.end),
        start: startMs === null ? null : hhmm(startMs),
        end: row.end === null ? null : hhmm(row.end),
        breakAfterMin: row.breakAfter,
        status: row.status,
        ...(row.walkover ? { walkover: true } : {}),
        readyCallUtc: heatRow && startMs !== null ? toIso(startMs - defaults.readyCallMin * MIN) : null,
        readyCall: heatRow && startMs !== null ? hhmm(startMs - defaults.readyCallMin * MIN) : null,
        reason: row.reason,
        warnings,
        issue,
      });
    };

    const breakAfter = (): number => {
      if (item.kind !== "heat") return 0;
      const ignoreExplicit = item.id === lastPlanItem && !isLastRow; // a plan's trailing "0" is meaningless once other rows follow
      if (item.breakAfterMin !== undefined && !ignoreExplicit) return item.breakAfterMin;
      return live?.roundLast ? (live.breakAfterRoundMin ?? defaults.breakAfterRoundMin) : (live?.breakAfterHeatMin ?? defaults.breakAfterHeatMin);
    };

    // ── notes: zero-length markers, never move the cursor
    if (item.kind === "note") {
      const at = e.actualStart ?? (pin !== undefined ? Math.max(pin, prevEnd ?? pin) : prevEnd !== null ? prevEnd + prevBreak * MIN : null);
      const held = plan.hold && e.actualStart === undefined;
      emit({ start: held ? null : at, end: held ? null : at, breakAfter: null, status: held ? "held" : pin !== undefined ? "pinned" : "est", reason: held ? holdReason(plan, hhmm) : "Marker (takes no time)" });
      return;
    }

    // ── a row whose heat is gone (or was never linked): it takes no time, moves nothing and is never "next"
    if (orphan && e.actualStart === undefined) {
      issue = "no-heat";
      warnings.push(item.kind === "heat" && !item.heatId ? "This row is not linked to a heat yet. Take it out of the run order." : "This heat is no longer in the draw (the draw was changed after it was added). Take this row out of the run order.");
      emit({ start: null, end: null, breakAfter: null, status: "cancelled", reason: "Its heat is not in the draw any more: it takes no time" });
      return;
    }

    // ── no length anywhere: say so on the row, give it no time, and carry on with the rest of the day
    if (!hasLength) issue = "no-length";
    if (!hasLength) warnings.push(item.kind === "break" ? "No break length — set it on the row in the run order." : "No heat length — set it in Divisions → Format");

    // ── cancelled before it ever started: it takes no time and moves nothing
    if (live?.cancelled && e.actualStart === undefined) {
      emit({ start: null, end: null, breakAfter: null, status: "cancelled", reason: "Cancelled before it started: it takes no time" });
      return;
    }

    // ── started: actual times from the server
    if (e.actualStart !== undefined) {
      const start = e.actualStart;
      let end: number;
      let status: RowStatus;
      let reason: string;
      if (item.kind === "heat" && live?.walkover) {
        // a walkover takes no time and no break follows it: the heats after it move up, and the clock stays where the last ridden heat left it
        emit({ start, end: start, breakAfter: null, status: "done", reason: `Walkover at ${hhmm(start)}: nobody rode, so it takes no time`, walkover: true });
        return;
      }
      if (item.kind === "heat" && live) {
        if (live.endedAt) {
          end = Date.parse(live.endedAt);
          status = live.cancelled ? "cancelled" : "done";
          reason = live.cancelled ? `Started ${hhmm(start)}, cancelled ${hhmm(end)} (server time)` : `Started ${hhmm(start)}, ended ${hhmm(end)} (server time)`;
        } else {
          const projected = start + (duration + (live.pausedMin ?? 0)) * MIN;
          const over = now !== undefined && now > projected;
          end = over ? now : projected;
          status = "live";
          reason = over ? `Started ${hhmm(start)}; running over, so later rows slip until it ends` : `Started ${hhmm(start)}; ends about ${hhmm(end)}${live.pausedMin ? ` (${live.pausedMin} min paused)` : ""}`;
          if (over) warnings.push(`Running over its ${duration} min: later heats move back until it ends.`);
        }
      } else {
        end = start + duration * MIN;
        status = now !== undefined && now < end ? "live" : "done";
        reason = `Started ${hhmm(start)}`;
      }
      emit({ start, end, breakAfter: isLastRow ? null : breakAfter(), status, reason });
      prevEnd = end;
      prevBreak = breakAfter();
      return;
    }

    // ── un-started while on hold
    if (plan.hold) {
      emit({ start: null, end: null, breakAfter: isLastRow ? null : breakAfter(), status: "held", reason: holdReason(plan, hhmm) });
      return;
    }

    // ── un-started: projected
    // the warm-up happens after the break, so the heat starts (break + warm-up) after the previous one ends; nothing is projected into the past
    const earliest = prevEnd === null ? null : prevEnd + ((item.kind === "break" ? 0 : prevBreak) + warmUp) * MIN;
    const candidates = [earliest, pin, now === undefined ? undefined : now + warmUp * MIN].filter((x): x is number => x !== undefined && x !== null);
    if (candidates.length === 0 || (earliest === null && pin === undefined && now === undefined)) {
      warnings.push("No start time yet: pin the first item of the plan.");
      emit({ start: null, end: null, breakAfter: isLastRow ? null : breakAfter(), status: "est", reason: "Needs an anchor (pinned start time)" });
      prevEnd = null;
      return;
    }
    const start = Math.max(...candidates);
    const end = start + duration * MIN;
    const pushedByPrevious = pin !== undefined && earliest !== null && earliest > pin;
    if (pushedByPrevious) warnings.push(`Pinned for ${pinHhmm} but the previous heat finishes later, so it starts at ${hhmm(start)}.`);
    const pinnedHere = pin !== undefined && start === pin;
    let reason: string;
    if (pinnedHere) reason = `Pinned at ${pinHhmm}${earliest !== null && earliest < pin! ? ` (previous ends ${hhmm(prevEnd!)} + ${item.kind === "break" ? 0 : prevBreak} min break)` : ""}`;
    else if (pushedByPrevious) reason = `Pinned "not before ${pinHhmm}", pushed to ${hhmm(start)} because the previous heat ends ${hhmm(prevEnd!)} + ${prevBreak} min break`;
    else if (now !== undefined && start === now && (earliest === null || earliest < now)) reason = `Not before now (${hhmm(now)}): nothing runs in the past`;
    else if (item.kind === "break") reason = `Follows the previous heat directly (${hhmm(prevEnd!)}); a break item replaces the automatic break`;
    else reason = `Previous ends ${hhmm(prevEnd!)} + ${prevBreak} min break${warmUp > 0 ? ` + ${warmUp} min warm-up` : ""}`;

    let status: RowStatus = pinnedHere ? "pinned" : "est";
    if (item.kind === "heat" && !nextMarked) {
      status = "next";
      nextMarked = true;
    }
    emit({ start, end, breakAfter: isLastRow ? null : breakAfter(), status, reason });
    prevEnd = end;
    prevBreak = breakAfter();
  });

  const timed = rows.filter((r) => r.kind !== "note" && r.status !== "cancelled");
  const complete = timed.length > 0 && timed.every((r) => r.endUtc !== null);
  const finishUtc = complete ? timed.reduce((m, r) => (Date.parse(r.endUtc!) > Date.parse(m) ? r.endUtc! : m), timed[0].endUtc!) : null;
  return {
    rows,
    heatsLeft: rows.filter((r) => r.kind === "heat" && r.status !== "done" && r.status !== "cancelled").length,
    finishUtc,
    finish: finishUtc ? hhmm(Date.parse(finishUtc)) : null,
    warnings: rows.flatMap((r) => r.warnings.map((w) => `${r.label}: ${w}`)),
  };
}

function holdReason(plan: SchedulePlan, hhmm: (ms: number) => string): string {
  const since = plan.hold ? hhmm(Date.parse(plan.hold.since)) : "";
  return `Wind hold since ${since}${plan.hold?.reason ? ` (${plan.hold.reason})` : ""}: no time until the head judge resumes`;
}
