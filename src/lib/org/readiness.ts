import { shortDay } from "@/lib/schedule/plans";
import { copy } from "@/lib/ui-copy";
import type { SetupCounts } from "@/lib/wizard/status";

export type CheckState = "done" | "attention" | "not_started";

export interface ReadinessCheck {
  id: string;
  state: CheckState;
  sentence: string;
  /** The set-up step page that fixes it. */
  fixHref: string;
  fixStep: "divisions" | "riders" | "officials" | "draw" | "schedule";
}

export interface Readiness {
  checks: ReadinessCheck[];
  /** Every check is green. */
  ready: boolean;
  /** First check that is not green, in checklist order. */
  firstOpen: ReadinessCheck | null;
  openCount: number;
}

export interface ReadinessInput {
  eventId: string;
  divisions: Array<{ id: string; name: string; scoring_model_id: string | null }>;
  counts: SetupCounts;
}

const T = copy.readiness;

/** The Go live checklist: one row per check, in the order a person fixes things (riders, judges, draw, run order, PINs). Pure. */
export function readiness({ eventId, divisions, counts }: ReadinessInput): Readiness {
  const href = (step: ReadinessCheck["fixStep"]) => `/org/events/${eventId}/${step}`;
  const checks: ReadinessCheck[] = [];
  const add = (id: string, state: CheckState, sentence: string, fixStep: ReadinessCheck["fixStep"]) => checks.push({ id, state, sentence, fixStep, fixHref: href(fixStep) });

  if (divisions.length === 0) add("divisions", "not_started", T.divisions.none, "divisions");

  for (const d of divisions) {
    const n = counts.ridersByDivision[d.id] ?? 0;
    if (n > 0) add(`riders:${d.id}`, "done", T.riders.ok(d.name, n), "riders");
    else add(`riders:${d.id}`, "attention", T.riders.none(d.name), "riders");
  }

  for (const d of divisions) {
    const panel = counts.panels?.find((p) => p.id === d.id);
    if (!d.scoring_model_id || (panel && !panel.hasScoringModel)) {
      add(`judges:${d.id}`, "attention", T.judges.noRules(d.name), "divisions");
      continue;
    }
    const need = panel?.minJudges ?? 0;
    const have = panel?.assigned ?? 0;
    if (have >= need && need > 0) add(`judges:${d.id}`, "done", T.judges.ok(d.name, have, need), "officials");
    else add(`judges:${d.id}`, "attention", T.judges.short(d.name, have, need), "officials");
  }

  for (const d of divisions) {
    if ((counts.ridersByDivision[d.id] ?? 0) === 0) continue; // asked for riders first
    if (!(counts.drawn ?? []).includes(d.id)) add(`draw:${d.id}`, "not_started", T.draw.none(d.name), "draw");
    else if (!(counts.locked ?? []).includes(d.id)) add(`draw:${d.id}`, "attention", T.draw.notLocked(d.name), "draw");
    else add(`draw:${d.id}`, "done", T.draw.locked(d.name), "draw");
  }

  if (counts.activePlanToday) add("run-order", "done", T.runOrder.ok, "schedule");
  else if (counts.activePlan) add("run-order", "attention", counts.today && counts.activePlanDays?.length ? T.runOrder.otherDayNamed(shortDay(counts.today), counts.activePlanDays.map(shortDay)) : T.runOrder.otherDay, "schedule");
  else add("run-order", (counts.planCount ?? 0) > 0 ? "attention" : "not_started", (counts.planCount ?? 0) > 0 ? (counts.today ? T.runOrder.noneActiveNamed(shortDay(counts.today)) : T.runOrder.otherDay) : T.runOrder.none, "schedule");
  // the Fix of "No run order active for today" opens the Run order step on today (Polish 2, item 14)
  const runOrder = checks.find((c) => c.id === "run-order");
  if (runOrder && runOrder.state !== "done" && counts.today) runOrder.fixHref = `${runOrder.fixHref}?day=${counts.today}`;

  const seats = counts.seatCount ?? counts.judgeSeats + counts.pendingSeats;
  const noPin = counts.seatsWithoutPin ?? 0;
  if (seats === 0) add("pins", "not_started", T.pins.none, "officials");
  else if (noPin > 0) add("pins", "attention", T.pins.missing(noPin), "officials");
  else add("pins", "done", T.pins.ok(seats), "officials");

  const open = checks.filter((c) => c.state !== "done");
  return { checks, ready: open.length === 0, firstOpen: open[0] ?? null, openCount: open.length };
}
