import { breakCountdown, type HeatLive } from "@/lib/engine/schedule";
import type { ScheduleDefaults, SchedulePlan } from "@/lib/schemas/schedule";

/** The pre-start length the database gives a simulated heat: the setting at x1, divided by the speed (never under 3 s) above. Same rule as private.sim_arm_clock. */
export function scaledPrestartSec(prestartSec: number, speed: number): number {
  if (speed <= 1 || prestartSec === 0) return prestartSec;
  return Math.max(3, Math.ceil(prestartSec / speed));
}

/**
 * When the next heat of the active run order starts, for the auto-play: the console's own break countdown (end of the last heat + break + warm-up, the gap divided by the
 * speed), so the console, the Flag view and the Follow the heat screen all read the same moment. Null when there is nothing to wait for (no run order, no heat has finished,
 * a heat is on the water): the auto-play then arms at once, as it always did.
 */
export function breakStartFor(plan: SchedulePlan | null, heats: HeatLive[], opts: { timezone: string; eventDay: string; defaults: ScheduleDefaults; nowMs: number; speed: number }): { heatId: string; startMs: number } | null {
  const info = breakCountdown(plan, heats, { timezone: opts.timezone, eventDay: opts.eventDay, defaults: opts.defaults, now: new Date(opts.nowMs).toISOString(), timeScale: opts.speed });
  return info.kind === "break" ? { heatId: info.heatId, startMs: Date.parse(info.startUtc) } : null;
}

export type ArmDecision = { kind: "now" } | { kind: "wait"; armAtMs: number; startMs: number };

/**
 * Arm now, or wait. With the flags on the yellow must END at the plan's start: arm at start minus the pre-start, never earlier. With the flags off there is no yellow and the
 * heat starts at the plan's start. A heat the plan says is already due (or whose pre-start is longer than the wait) goes at once.
 */
export function armDecision(input: { startMs: number | null; nowMs: number; prestartSec: number; flagsOn: boolean }): ArmDecision {
  if (input.startMs === null) return { kind: "now" };
  const armAtMs = input.flagsOn ? input.startMs - input.prestartSec * 1000 : input.startMs;
  return armAtMs > input.nowMs ? { kind: "wait", armAtMs, startMs: input.startMs } : { kind: "now" };
}
