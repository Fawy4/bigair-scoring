// Test helpers for the timetable engine (not exported from index.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseScheduleDay, type ScheduleDay, type SchedulePlan } from "@/lib/schemas/schedule";
import { computeTimetable } from "./timetable";
import { localToUtc, toIso } from "./time";
import { resolveHeatRefs } from "./resolve";
import type { HeatLive, Timetable, TimetableOptions } from "./types";

export const DAY = "2026-10-03";
export const TZ = "Africa/Cairo";

/** The preset with heatRefs resolved to heatIds like "Women|Round 1|Heat 1". */
export function loadDay(): ScheduleDay {
  const json = JSON.parse(readFileSync(join(process.cwd(), "presets", "schedule", "kitemania-day2.json"), "utf8"));
  return resolveHeatRefs(parseScheduleDay(json), (r) => `${r.division}|${r.round}|${r.heat}`);
}

export const day = loadDay();
export const plan = (id: string): SchedulePlan => {
  const p = day.plans.find((x) => x.id === id);
  if (!p) throw new Error(`no plan ${id}`);
  return p;
};

/** ISO instant for a wall-clock time in Cairo on the event day. */
export const at = (hhmm: string, eventDay = DAY) => toIso(localToUtc(eventDay, hhmm, TZ));

export const opts = (now?: string): TimetableOptions => ({ timezone: TZ, eventDay: DAY, defaults: day.defaults, ...(now ? { now } : {}) });

/** One HeatLive per distinct heat across all plans; a round's "Final" is the last heat of its round. */
export function allHeats(): HeatLive[] {
  const seen = new Map<string, HeatLive>();
  for (const p of day.plans) {
    for (const item of p.items) {
      if (item.kind !== "heat" || seen.has(item.heatId!)) continue;
      const [division, round, heat] = item.heatId!.split("|");
      seen.set(item.heatId!, { heatId: item.heatId!, division, round, heat, roundLast: heat === "Final" });
    }
  }
  return [...seen.values()];
}

export const idOf = (itemId: string, p: SchedulePlan = plan("main")) => {
  const item = p.items.find((i) => i.id === itemId);
  if (!item || item.kind !== "heat") throw new Error(`no heat item ${itemId}`);
  return item.heatId!;
};

/** Marks the first `count` heat rows of a plan as finished exactly at their projected times. */
export function withActuals(p: SchedulePlan, count: number, heats = allHeats()): HeatLive[] {
  const baseline = computeTimetable(p, heats, opts()).rows.filter((r) => r.kind === "heat").slice(0, count);
  const byId = new Map(baseline.map((r) => [r.heatId!, r]));
  return heats.map((h) => (byId.has(h.heatId) ? { ...h, startedAt: byId.get(h.heatId)!.startUtc, endedAt: byId.get(h.heatId)!.endUtc } : h));
}

export const patch = (heats: HeatLive[], heatId: string, changes: Partial<HeatLive>): HeatLive[] =>
  heats.map((h) => (h.heatId === heatId ? { ...h, ...changes } : h));

export const starts = (t: Timetable) => t.rows.map((r) => r.start);
export const row = (t: Timetable, itemId: string) => {
  const r = t.rows.find((x) => x.itemId === itemId);
  if (!r) throw new Error(`no row ${itemId}`);
  return r;
};
