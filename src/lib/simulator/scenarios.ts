/** The scenario buttons of the simulator (owner brief, 1 Oct 2026). Words for the labels live in ui-copy.ts; this file is the list and the small pure choices behind it. */

export const SCENARIO_KEYS = ["wind_hold", "dns", "duplicate", "judge_dies", "tie", "past_cap", "reopen", "plan_b", "out_of_attempts", "hold_final", "rerun"] as const;
export type ScenarioKey = (typeof SCENARIO_KEYS)[number];
export const isScenarioKey = (k: string): k is ScenarioKey => (SCENARIO_KEYS as readonly string[]).includes(k);

export interface ScenarioInfo {
  /** Waits (armed) until a heat is running. */
  needsRunningHeat: boolean;
  /** Needs riders who have not ridden yet: it waits for the start of the next heat. */
  needsFreshHeat: boolean;
}

export const SCENARIOS: Record<ScenarioKey, ScenarioInfo> = {
  wind_hold: { needsRunningHeat: false, needsFreshHeat: false },
  dns: { needsRunningHeat: true, needsFreshHeat: false },
  duplicate: { needsRunningHeat: true, needsFreshHeat: false },
  judge_dies: { needsRunningHeat: true, needsFreshHeat: false },
  tie: { needsRunningHeat: true, needsFreshHeat: true },
  past_cap: { needsRunningHeat: true, needsFreshHeat: false },
  reopen: { needsRunningHeat: false, needsFreshHeat: false },
  plan_b: { needsRunningHeat: false, needsFreshHeat: false },
  out_of_attempts: { needsRunningHeat: true, needsFreshHeat: false },
  hold_final: { needsRunningHeat: false, needsFreshHeat: false },
  rerun: { needsRunningHeat: true, needsFreshHeat: false },
};

export interface LogRow {
  scenario: string | null;
  kind: "info" | "scenario" | "scenario_failed" | "blocker" | "heat" | "reset";
  at: string;
  text: string;
  runNo: number;
}

export interface ChecklistRow {
  key: ScenarioKey;
  /** Exercised at least once (in any run: a Reset does not take the ticks away). */
  done: boolean;
  count: number;
  lastAt: string | null;
  lastText: string | null;
  failedText: string | null;
}

/** Every scenario with a tick when it has been exercised, how many times, and what it did last. A later failure does not undo a tick. */
export function checklistFromLog(rows: readonly LogRow[]): ChecklistRow[] {
  return SCENARIO_KEYS.map((key) => {
    const done = rows.filter((r) => r.scenario === key && r.kind === "scenario").sort((a, b) => a.at.localeCompare(b.at));
    const failed = rows.filter((r) => r.scenario === key && r.kind === "scenario_failed").sort((a, b) => a.at.localeCompare(b.at));
    const last = done.at(-1);
    return { key, done: done.length > 0, count: done.length, lastAt: last?.at ?? null, lastText: last?.text ?? null, failedText: failed.at(-1)?.text ?? null };
  });
}

export interface RiderNow {
  entryId: string;
  /** Attempts logged so far in the running heat. */
  used: number;
  riding: boolean;
  position: number;
}

/** The no-show: whoever has done the least. Null when nobody is riding. */
export function pickDnsRider(riders: readonly RiderNow[]): string | null {
  const riding = riders.filter((r) => r.riding);
  if (!riding.length) return null;
  return [...riding].sort((a, b) => a.used - b.used || a.position - b.position)[0].entryId;
}

/** Two riders who have not ridden yet, in seat order (a forced tie needs identical attempts, so it starts before either has one). Null when there are not two. */
export function pickTieRiders(riders: readonly RiderNow[]): [string, string] | null {
  const fresh = riders.filter((r) => r.riding && r.used === 0).sort((a, b) => a.position - b.position);
  return fresh.length >= 2 ? [fresh[0].entryId, fresh[1].entryId] : null;
}

/** The rider to run out of attempts: one already at the cap, else the one closest to it. Null without a cap or without a rider. */
export function pickCapRider(riders: readonly RiderNow[], cap: number | null): { entryId: string; atCap: boolean } | null {
  if (cap === null) return null;
  const riding = riders.filter((r) => r.riding);
  if (!riding.length) return null;
  const best = [...riding].sort((a, b) => b.used - a.used || a.position - b.position)[0];
  return { entryId: best.entryId, atCap: best.used >= cap };
}

/** The final: the last heat of the last round of its division. */
export function isFinalHeat(heatId: string, heats: ReadonlyArray<{ id: string; roundId: string; number: number }>, rounds: ReadonlyArray<{ id: string; sort: number }>): boolean {
  const heat = heats.find((h) => h.id === heatId);
  if (!heat) return false;
  const last = [...rounds].sort((a, b) => b.sort - a.sort)[0];
  if (!last || heat.roundId !== last.id) return false;
  const inLast = heats.filter((h) => h.roundId === last.id);
  return Math.max(...inLast.map((h) => h.number)) === heat.number;
}
