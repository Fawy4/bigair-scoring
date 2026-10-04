// Run-order editing (Phase 4b, docs/06 §Run order & timetable). Pure: every function returns a new plan and never reads a clock.
// A heat that has started or finished never moves: the timetable keeps it where it really ran (Decision 10), so the edit
// functions refuse to touch it and say why in plain words.
import type { RunItem, SchedulePlan } from "@/lib/schemas/schedule";
import type { HeatLive, Timetable, TimetableRow } from "./types";

export class RunOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunOrderError";
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A heat of the division draws, as the run order screen lists it. */
export interface HeatInfo {
  heatId: string;
  division: string;
  divisionId?: string;
  round: string;
  roundOrder: number;
  heat: string;
  number: number | null;
  durationMin: number;
  warmUpMin: number;
}

function startedIds(heats: readonly HeatLive[]): Set<string> {
  return new Set(heats.filter((h) => h.startedAt).map((h) => h.heatId));
}

function requireItem(plan: SchedulePlan, itemId: string): RunItem {
  const item = plan.items.find((i) => i.id === itemId);
  if (!item) throw new RunOrderError("That row is not in this plan.");
  return item;
}

function requireMovable(plan: SchedulePlan, itemId: string, heats: readonly HeatLive[], what: string): RunItem {
  const item = requireItem(plan, itemId);
  if (item.kind === "heat" && startedIds(heats).has(item.heatId!)) {
    throw new RunOrderError(`This heat has already started, so it stays where it ran and cannot be ${what}.`);
  }
  if (item.kind === "break" && plan.actualStarts[item.id]) {
    throw new RunOrderError(`This break has already started, so it cannot be ${what}.`);
  }
  return item;
}

/** A new id that does not exist in the plan yet, without randomness or the clock: prefix + the next free number. */
function nextId(plan: SchedulePlan, prefix: string): string {
  const used = new Set(plan.items.map((i) => i.id));
  let n = plan.items.length + 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

const clampIndex = (plan: SchedulePlan, index: number | undefined) => (index === undefined ? plan.items.length : Math.max(0, Math.min(index, plan.items.length)));

function withItems(plan: SchedulePlan, items: RunItem[]): SchedulePlan {
  const ids = new Set(items.map((i) => i.id));
  const anchors = Object.fromEntries(Object.entries(plan.anchors).filter(([id]) => ids.has(id)));
  const actualStarts = Object.fromEntries(Object.entries(plan.actualStarts).filter(([id]) => ids.has(id)));
  return { ...plan, items, anchors, actualStarts };
}

/** Put a heat into the run order (at the end, or at `index`). A heat can be in a plan only once. */
export function addHeatToPlan(plan: SchedulePlan, heatId: string, index?: number): SchedulePlan {
  if (plan.items.some((i) => i.kind === "heat" && i.heatId === heatId)) throw new RunOrderError("That heat is already in the run order.");
  const item: RunItem = { id: nextId(plan, "r"), kind: "heat", heatId };
  const items = [...plan.items];
  items.splice(clampIndex(plan, index), 0, item);
  return { ...plan, items };
}

/** Add several heats in the order given (for "Add all of Pro Men Round 1"). Heats already in the plan are skipped. */
export function addHeatsToPlan(plan: SchedulePlan, heatIds: readonly string[], index?: number): SchedulePlan {
  let next = plan;
  let at = clampIndex(plan, index);
  for (const id of heatIds) {
    if (next.items.some((i) => i.kind === "heat" && i.heatId === id)) continue;
    next = addHeatToPlan(next, id, at);
    at++;
  }
  return next;
}

export function addBreak(plan: SchedulePlan, brk: { label: string; durationMin: number }, index?: number): SchedulePlan {
  const label = brk.label.trim();
  if (!label) throw new RunOrderError("Give the break a name (lunch, briefing, wind hold).");
  if (!(brk.durationMin > 0)) throw new RunOrderError("A break needs a length of at least one minute.");
  const items = [...plan.items];
  items.splice(clampIndex(plan, index), 0, { id: nextId(plan, "b"), kind: "break", label, durationMin: brk.durationMin });
  return { ...plan, items };
}

export function addNote(plan: SchedulePlan, label: string, index?: number): SchedulePlan {
  const text = label.trim();
  if (!text) throw new RunOrderError("Write the note (for example 'Wind call 09:00').");
  const items = [...plan.items];
  items.splice(clampIndex(plan, index), 0, { id: nextId(plan, "n"), kind: "note", label: text });
  return { ...plan, items };
}

export function removeItem(plan: SchedulePlan, itemId: string, heats: readonly HeatLive[]): SchedulePlan {
  requireMovable(plan, itemId, heats, "taken out");
  return withItems(plan, plan.items.filter((i) => i.id !== itemId));
}

/** Move a row to a new position (0 = first). */
export function moveItem(plan: SchedulePlan, itemId: string, toIndex: number, heats: readonly HeatLive[]): SchedulePlan {
  const item = requireMovable(plan, itemId, heats, "moved");
  const rest = plan.items.filter((i) => i.id !== itemId);
  rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, item);
  return { ...plan, items: rest };
}

/** The tap alternative to dragging: one step up (-1) or down (+1). Rows that cannot move stay where they are. */
export function nudgeItem(plan: SchedulePlan, itemId: string, direction: -1 | 1, heats: readonly HeatLive[]): SchedulePlan {
  const at = plan.items.findIndex((i) => i.id === itemId);
  if (at < 0) throw new RunOrderError("That row is not in this plan.");
  const to = at + direction;
  if (to < 0 || to >= plan.items.length) return plan;
  return moveItem(plan, itemId, to, heats);
}

/** Pin a start ("not before"; Decision 8), or remove the pin with `null`. A heat that has started cannot be pinned. */
export function setPin(plan: SchedulePlan, itemId: string, hhmm: string | null, heats: readonly HeatLive[]): SchedulePlan {
  requireMovable(plan, itemId, heats, "pinned");
  const anchors = { ...plan.anchors };
  if (hhmm === null) delete anchors[itemId];
  else {
    if (!HHMM.test(hhmm)) throw new RunOrderError("A start time looks like 10:30 (24-hour clock).");
    anchors[itemId] = hhmm;
  }
  return { ...plan, anchors };
}

/** Length of one row in minutes (heat length or break length). An empty value (`null`) goes back to the round's length. */
export function setDuration(plan: SchedulePlan, itemId: string, minutes: number | null, heats: readonly HeatLive[]): SchedulePlan {
  const item = requireMovable(plan, itemId, heats, "changed");
  if (item.kind === "note") throw new RunOrderError("A note takes no time.");
  if (minutes !== null && !(minutes > 0)) throw new RunOrderError("A length needs at least one minute.");
  const next: RunItem = item.kind === "break" ? { ...item, durationMin: minutes ?? item.durationMin } : { ...item, ...(minutes === null ? {} : { durationMin: minutes }) };
  if (item.kind === "heat" && minutes === null) delete (next as { durationMin?: number }).durationMin;
  return { ...plan, items: plan.items.map((i) => (i.id === itemId ? next : i)) };
}

/** Minutes of break after a heat. Explicit, so it replaces the automatic break (Decision 12); `null` goes back to the automatic one. */
export function setBreakAfter(plan: SchedulePlan, itemId: string, minutes: number | null, heats: readonly HeatLive[]): SchedulePlan {
  const item = requireItem(plan, itemId);
  if (item.kind !== "heat") throw new RunOrderError("Only a heat has a break after it (a break row is itself the break).");
  if (minutes !== null && !(minutes >= 0)) throw new RunOrderError("A break cannot be negative.");
  void heats; // the break after a heat that has run still counts for the heats after it, so it may be edited
  const next = { ...item };
  if (minutes === null) delete next.breakAfterMin;
  else next.breakAfterMin = minutes;
  return { ...plan, items: plan.items.map((i) => (i.id === itemId ? next : i)) };
}

/** Warm-up before one heat (overrides the division's and the round's). `null` goes back to theirs. */
export function setWarmUp(plan: SchedulePlan, itemId: string, minutes: number | null, heats: readonly HeatLive[]): SchedulePlan {
  const item = requireMovable(plan, itemId, heats, "changed");
  if (item.kind !== "heat") throw new RunOrderError("Only a heat has a warm-up.");
  if (minutes !== null && !(minutes >= 0)) throw new RunOrderError("A warm-up cannot be negative.");
  const next = { ...item };
  if (minutes === null) delete next.warmUpMin;
  else next.warmUpMin = minutes;
  return { ...plan, items: plan.items.map((i) => (i.id === itemId ? next : i)) };
}

export function renameItem(plan: SchedulePlan, itemId: string, label: string): SchedulePlan {
  const item = requireItem(plan, itemId);
  if (item.kind === "heat") throw new RunOrderError("A heat is named in the Draw step.");
  const text = label.trim();
  if (!text) throw new RunOrderError("The name cannot be empty.");
  return { ...plan, items: plan.items.map((i) => (i.id === itemId ? { ...item, label: text } : i)) };
}

/** Heats that are in no row of the plan yet, grouped by division and round in draw order (the left-hand list). */
/**
 * "Clear this plan": every heat that has not started goes back to "Heats not in the run order"; breaks and notes go; hand-set pins go with their heats. A heat in
 * `stay` (started, ended or published) keeps its place, and so does a break that already started. The plan itself remains, empty or with only those.
 */
export function clearPlan(plan: SchedulePlan, stay: ReadonlySet<string>): { plan: SchedulePlan; heatsRemoved: number; otherRemoved: number; heatsStay: number } {
  const keep = (i: RunItem) => (i.kind === "heat" ? stay.has(i.heatId!) : Boolean(plan.actualStarts[i.id]));
  const kept = plan.items.filter(keep);
  const gone = plan.items.filter((i) => !keep(i));
  return {
    plan: withItems(plan, kept),
    heatsRemoved: gone.filter((i) => i.kind === "heat").length,
    otherRemoved: gone.filter((i) => i.kind !== "heat").length,
    heatsStay: kept.filter((i) => i.kind === "heat").length,
  };
}

export interface UnscheduledGroup {
  division: string;
  round: string;
  heats: HeatInfo[];
}

export function unscheduledHeats(allHeats: readonly HeatInfo[], plan: SchedulePlan): UnscheduledGroup[] {
  const used = new Set(plan.items.flatMap((i) => (i.kind === "heat" ? [i.heatId!] : [])));
  const groups: UnscheduledGroup[] = [];
  const divisionOrder: string[] = [];
  for (const h of allHeats) if (!divisionOrder.includes(h.division)) divisionOrder.push(h.division);
  const sorted = [...allHeats].filter((h) => !used.has(h.heatId)).sort((a, b) => divisionOrder.indexOf(a.division) - divisionOrder.indexOf(b.division) || a.roundOrder - b.roundOrder || (a.number ?? 0) - (b.number ?? 0));
  for (const h of sorted) {
    const g = groups.find((x) => x.division === h.division && x.round === h.round);
    if (g) g.heats.push(h);
    else groups.push({ division: h.division, round: h.round, heats: [h] });
  }
  return groups;
}

/** A copy of a plan under a new name: same order, pins, lengths and breaks; nothing has started in it; it is not active. */
export function duplicatePlan(plans: readonly SchedulePlan[], planId: string, name: string): SchedulePlan[] {
  const source = plans.find((p) => p.id === planId);
  if (!source) throw new RunOrderError("That plan does not exist.");
  const title = name.trim();
  if (!title) throw new RunOrderError("Name the new plan (for example 'Plan B – Bad wind').");
  if (plans.some((p) => p.name.trim().toLowerCase() === title.toLowerCase())) throw new RunOrderError("Another plan already has that name.");
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan";
  let id = slug;
  for (let n = 2; plans.some((p) => p.id === id); n++) id = `${slug}-${n}`;
  const copy: SchedulePlan = {
    id,
    name: title,
    active: false,
    items: structuredClone(source.items),
    anchors: { ...source.anchors },
    actualStarts: {},
  };
  return [...plans, copy];
}

/** Exactly one plan of the day is active. */
export function activate(plans: readonly SchedulePlan[], planId: string): SchedulePlan[] {
  if (!plans.some((p) => p.id === planId)) throw new RunOrderError("That plan does not exist.");
  return plans.map((p) => ({ ...p, active: p.id === planId }));
}

/** The active plan cannot be deleted (there must always be one); the last plan of a day cannot be either. */
export function deletePlan(plans: readonly SchedulePlan[], planId: string): SchedulePlan[] {
  const plan = plans.find((p) => p.id === planId);
  if (!plan) throw new RunOrderError("That plan does not exist.");
  if (plan.active) throw new RunOrderError("This plan is active. Activate another plan first.");
  return plans.filter((p) => p.id !== planId);
}

/** Change the length of ONE heat that has not started (the organiser's live override; the head judge gets the same in Phase 5). */
export function changeHeatLength(plan: SchedulePlan, heatId: string, minutes: number, heats: readonly HeatLive[]): SchedulePlan {
  const item = plan.items.find((i) => i.kind === "heat" && i.heatId === heatId);
  if (!item) throw new RunOrderError("That heat is not in this plan.");
  return setDuration(plan, item.id, minutes, heats);
}

// ── the run order as the header and exports show it ─────────────────────────────

/** "5 + 10 min" or "10 min" */
export const lengthText = (warmUpMin: number, durationMin: number) => (warmUpMin > 0 ? `${warmUpMin} + ${durationMin} min` : `${durationMin} min`);

export interface ExportRow {
  division: string;
  session: string;
  warmUp: string;
  start: string;
  duration: string;
  end: string;
  break: string;
  kind: TimetableRow["kind"];
}

/** The noticeboard layout: Division / Session / Start / Duration / End / Break (plus Warm-up when any heat has one). */
export function timetableExportRows(t: Timetable): { showWarmUp: boolean; rows: ExportRow[] } {
  const showWarmUp = t.rows.some((r) => r.kind === "heat" && r.warmUpMin > 0);
  // a row whose heat is gone is not printed on a noticeboard; a heat with no length prints without one
  const rows = t.rows.filter((r) => r.issue !== "no-heat").map<ExportRow>((r) => ({
    kind: r.kind,
    division: r.kind === "heat" ? (r.division ?? "") : "",
    session: r.kind === "heat" ? [r.round, r.heat].filter(Boolean).join(" · ") : r.label,
    warmUp: r.kind === "heat" && r.warmUpStart && r.warmUpMin > 0 ? r.warmUpStart : "",
    start: r.start ?? "",
    duration: r.kind === "note" || r.issue === "no-length" ? "" : String(r.durationMin),
    end: r.kind === "note" ? "" : (r.end ?? ""),
    break: r.breakAfterMin === null || r.kind !== "heat" ? "" : String(r.breakAfterMin),
  }));
  return { showWarmUp, rows };
}

/** Total time of a ladder for the format preview: "15 heats · 5 + 10 min · about 4 h with 2-minute breaks". */
export function ladderTime(heatsMin: Array<{ warmUpMin: number; durationMin: number; breakAfterMin: number }>): { heats: number; totalMin: number; breaksMin: number } {
  const total = heatsMin.reduce((s, h, i) => s + h.warmUpMin + h.durationMin + (i < heatsMin.length - 1 ? h.breakAfterMin : 0), 0);
  const breaks = heatsMin.reduce((s, h, i) => s + (i < heatsMin.length - 1 ? h.breakAfterMin : 0), 0);
  return { heats: heatsMin.length, totalMin: total, breaksMin: breaks };
}

/** "about 4 h" — to the nearest half hour, plain words. */
export function aboutHours(totalMin: number): string {
  const halves = Math.max(1, Math.round(totalMin / 30));
  const hours = halves / 2;
  return `${hours} h`;
}
