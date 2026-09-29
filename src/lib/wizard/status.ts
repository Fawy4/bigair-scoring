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
  if (!e.name.trim()) out.push("Give the event a name.");
  if (!e.start_date || !e.end_date) out.push("Set the first and last day of the event.");
  if (!e.location?.trim()) out.push("Add the location.");
  return out;
}

export function divisionsStepMissing(divisions: DivisionStepInput[]): string[] {
  if (divisions.length === 0) return ["Add at least one division (for example Pro Men)."];
  const out: string[] = [];
  for (const d of divisions) {
    if (!d.scoring_model_id) out.push(`${d.name}: choose how it is scored.`);
    if (!d.format_template_id) out.push(`${d.name}: choose its format.`);
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

export function wizardSteps(event: EventStepInput | null, divisions: DivisionStepInput[]): StepInfo[] {
  return [
    { key: "event", label: "1. Event", available: true, missing: event ? eventStepMissing(event) : [] },
    { key: "divisions", label: "2. Divisions", available: true, missing: divisionsStepMissing(divisions) },
    { key: "riders", label: "3. Riders", available: false, missing: [] },
    { key: "officials", label: "4. Officials", available: false, missing: [] },
    { key: "draw", label: "5. Draw", available: false, missing: [] },
    { key: "schedule", label: "6. Run order & timetable", available: false, missing: [] },
  ];
}
