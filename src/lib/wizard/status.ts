import { copy } from "@/lib/ui-copy";

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

export interface StepInfo {
  key: "event" | "divisions" | "riders" | "officials" | "draw" | "schedule";
  label: string;
  /** Steps that arrive in a later release are shown but not clickable. */
  available: boolean;
  missing: string[];
}

/** Counts the later steps report on (read once by the wizard layout). */
export interface SetupCounts {
  /** Riders taking part (not withdrawn, declined or waiting) per division id. */
  ridersByDivision: Record<string, number>;
  judgeSeats: number;
  pendingSeats: number;
  /** "Pro Men needs 3 judges, 2 assigned" lines. */
  panelShortfalls: string[];
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

export function wizardSteps(event: EventStepInput | null, divisions: DivisionStepInput[], counts?: SetupCounts): StepInfo[] {
  return [
    { key: "event", label: copy.wizard.steps.event, available: true, missing: event ? eventStepMissing(event) : [] },
    { key: "divisions", label: copy.wizard.steps.divisions, available: true, missing: divisionsStepMissing(divisions) },
    { key: "riders", label: copy.wizard.steps.riders, available: true, missing: counts ? ridersStepMissing(divisions, counts) : [] },
    { key: "officials", label: copy.wizard.steps.officials, available: true, missing: counts ? officialsStepMissing(counts) : [] },
    { key: "draw", label: copy.wizard.steps.draw, available: false, missing: [] },
    { key: "schedule", label: copy.wizard.steps.schedule, available: false, missing: [] },
  ];
}
