import { copy } from "@/lib/ui-copy";
import { readiness } from "@/lib/org/readiness";

/** Plain-language "what's missing" for each wizard step (docs/06 §1: unfinished steps say what is missing). */
export interface EventStepInput {
  name: string;
  slug: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  status: string;
}

export interface DivisionStepInput {
  id: string;
  name: string;
  scoring_model_id: string | null;
  format_template_id: string | null;
}

export function eventStepMissing(e: EventStepInput): string[] {
  const out: string[] = [];
  if (!e.name.trim()) out.push(copy.wizard.missing.name);
  if (!e.start_date || !e.end_date) out.push(copy.wizard.missing.dates);
  if (!e.location?.trim()) out.push(copy.wizard.missing.location);
  return out;
}

export function divisionsStepMissing(divisions: DivisionStepInput[]): string[] {
  if (divisions.length === 0) return [copy.wizard.missing.noDivisions];
  const out: string[] = [];
  for (const d of divisions) {
    if (!d.scoring_model_id) out.push(copy.wizard.missing.scoring(d.name));
    if (!d.format_template_id) out.push(copy.wizard.missing.format(d.name));
  }
  return out;
}

export type StepState = "done" | "attention" | "not_started";

export interface StepInfo {
  key: "event" | "divisions" | "riders" | "officials" | "draw" | "schedule" | "golive";
  label: string;
  /** Steps that arrive in a later release are shown but not clickable. */
  available: boolean;
  missing: string[];
  /** not_started: nothing entered; attention: something entered and something missing; done: nothing missing. */
  state: StepState;
  /** One line for the rail: the first missing item plus "(+N more)", or what is set. */
  reason: string;
}

/** Counts the later steps report on (read once by the wizard layout). */
export interface SetupCounts {
  /** Riders taking part (not withdrawn, declined or waiting) per division id. */
  ridersByDivision: Record<string, number>;
  judgeSeats: number;
  pendingSeats: number;
  /** "Pro Men needs 3 judges, 2 assigned" lines. */
  panelShortfalls: string[];
  /** Division ids that have a draw / a locked draw, and whether any plan is active (Draw and Run order steps). */
  drawn?: string[];
  locked?: string[];
  activePlan?: boolean;
  /** A plan is active for today (event time zone). */
  activePlanToday?: boolean;
  /** All seats of the event, whatever their role or status; and plans of any kind. */
  seatCount?: number;
  planCount?: number;
  /** Active seats whose PIN cannot be shown (made before PINs were stored). */
  seatsWithoutPin?: number;
  /** Judges assigned to each division's panel against what its scoring rules ask for. */
  panels?: Array<{ id: string; name: string; minJudges: number; assigned: number; hasScoringModel: boolean }>;
}

export function ridersStepMissing(divisions: DivisionStepInput[], counts: SetupCounts): string[] {
  return divisions.filter((d) => (counts.ridersByDivision[d.id] ?? 0) === 0).map((d) => copy.wizard.missing.noRiders(d.name));
}

export function officialsStepMissing(counts: SetupCounts): string[] {
  const out: string[] = [];
  if (counts.judgeSeats === 0) out.push(copy.wizard.missing.noJudges);
  if (counts.pendingSeats > 0) out.push(copy.wizard.missing.seatsWaiting(counts.pendingSeats));
  return [...out, ...counts.panelShortfalls];
}

export function drawStepMissing(divisions: DivisionStepInput[], counts: SetupCounts): string[] {
  const out: string[] = [];
  for (const d of divisions) {
    if ((counts.ridersByDivision[d.id] ?? 0) === 0) continue;
    if (!(counts.drawn ?? []).includes(d.id)) out.push(copy.wizard.missing.noDraw(d.name));
    else if (!(counts.locked ?? []).includes(d.id)) out.push(copy.wizard.missing.drawNotLocked(d.name));
  }
  return out;
}

export function scheduleStepMissing(counts: SetupCounts): string[] {
  return counts.activePlan ? [] : [copy.wizard.missing.noPlan];
}

function oneLine(key: string, missing: string[], state: StepState): string {
  if (missing.length > 0) return missing[0] + (missing.length > 1 ? copy.wizard.more(missing.length - 1) : "");
  return state === "done" ? copy.wizard.reasonDone[key] : copy.wizard.reasonEmpty[key];
}

function stepOf(key: StepInfo["key"], missing: string[], entered: boolean): StepInfo {
  const state: StepState = !entered ? "not_started" : missing.length > 0 ? "attention" : "done";
  return { key, label: copy.wizard.stepNames[key], available: true, missing, state, reason: oneLine(key, missing, state) };
}

export function wizardSteps(event: EventStepInput | null, divisions: DivisionStepInput[], counts?: SetupCounts): StepInfo[] {
  const c = counts;
  const anyRiders = c ? Object.values(c.ridersByDivision).some((n) => n > 0) : false;
  const seatCount = c ? (c.seatCount ?? c.judgeSeats + c.pendingSeats) : 0;
  const drawStarted = (c?.drawn ?? []).length > 0;
  const planEntered = c ? Boolean(c.activePlan) || (c.planCount ?? 0) > 0 : false;
  const eventEntered = event ? Boolean(event.name.trim() || event.start_date || event.end_date || event.location?.trim()) : false;

  const steps = [
    stepOf("event", event ? eventStepMissing(event) : [], eventEntered),
    stepOf("divisions", divisionsStepMissing(divisions), divisions.length > 0),
    stepOf("riders", c ? ridersStepMissing(divisions, c) : [], anyRiders),
    stepOf("officials", c ? officialsStepMissing(c) : [], seatCount > 0),
    stepOf("draw", c ? drawStepMissing(divisions, c) : [], drawStarted),
    stepOf("schedule", c ? scheduleStepMissing(c) : [], planEntered),
  ];

  // Go live: green when the readiness checklist is all green; not started until the Draw step has started.
  const r = c ? readiness({ eventId: "", divisions, counts: c }) : null;
  const goLive: StepInfo = !r || !drawStarted
    ? { key: "golive", label: copy.wizard.stepNames.golive, available: true, missing: [], state: "not_started", reason: copy.wizard.reasonEmpty.golive }
    : r.ready
      ? { key: "golive", label: copy.wizard.stepNames.golive, available: true, missing: [], state: "done", reason: copy.wizard.reasonDone.golive }
      : { key: "golive", label: copy.wizard.stepNames.golive, available: true, missing: r.checks.filter((x) => x.state !== "done").map((x) => x.sentence), state: "attention", reason: r.firstOpen!.sentence + (r.openCount > 1 ? copy.wizard.more(r.openCount - 1) : "") };
  return [...steps, goLive];
}
