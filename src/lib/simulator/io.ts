import { parseSimConfig, type SimConfig } from "./config";
import type { SimDb, Snapshot } from "./snapshot";

/** One line in the simulator's log: the running commentary (info, heat, blocker) and the checklist (scenario, scenario_failed). Never fails the caller. */
export async function logLine(db: SimDb, eventId: string, kind: "info" | "scenario" | "scenario_failed" | "blocker" | "heat" | "reset", scenario: string | null, text: string, data: Record<string, unknown> = {}): Promise<void> {
  await db.user.rpc("sim_log_add", { p_event: eventId, p_kind: kind, p_scenario: scenario as never, p_text: text, p_data: data as never });
}

/** Reads the settings again, changes them, saves them: scenarios and ticks may overlap, so nobody works from an old copy. */
export async function updateConfig(db: SimDb, eventId: string, change: (c: SimConfig) => SimConfig): Promise<SimConfig> {
  const { data } = await db.service.from("sim_control").select("config").eq("event_id", eventId).maybeSingle();
  const next = change(parseSimConfig(data?.config));
  await db.user.rpc("sim_set", { p_event: eventId, p_patch: { config: next } as never });
  return next;
}

/** The active run order of the day: the heats in its order, whether it is on hold, and which plan it is. Read fresh (a hold can be set from the head console). */
export async function readRunOrder(db: SimDb, snap: Pick<Snapshot, "eventId" | "event" | "nowMs">): Promise<{ heatIds: string[] | null; hold: boolean; planId: string | null; planName: string | null }> {
  const { data } = await db.service.from("schedule_plans").select("id, day, name, items, hold, active").eq("event_id", snap.eventId).eq("active", true);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: snap.event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(snap.nowMs));
  const plan = (data ?? []).find((p) => p.day === today) ?? [...(data ?? [])].sort((a, b) => a.day.localeCompare(b.day))[0];
  if (!plan) return { heatIds: null, hold: false, planId: null, planName: null };
  const items = (Array.isArray(plan.items) ? plan.items : []) as Array<{ kind?: string; heatId?: string }>;
  return { heatIds: items.flatMap((i) => (i.kind === "heat" && i.heatId ? [i.heatId] : [])), hold: Boolean(plan.hold), planId: plan.id, planName: plan.name };
}
