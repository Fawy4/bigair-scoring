import type { HeatRow } from "@/lib/live/types";
import { effectiveSetting } from "@/lib/live/visibility";
import { copy } from "@/lib/ui-copy";
import { updateConfig, logLine } from "./io";
import { isFinalHeat } from "./scenarios";
import { heatName, type SimDb, type Snapshot } from "./snapshot";

const T = copy.simulator;

/**
 * After a publish: the line in the log, the scenarios that were about this heat forget it, and the result is released to the public pages (publishing alone holds it
 * back unless the event shows results at once). The final is kept back when the "publish hold on the final" scenario is waiting, or the event holds finals.
 */
export async function finishPublish(db: SimDb, snap: Snapshot, heat: HeatRow, version: number): Promise<void> {
  const name = heatName(heat);
  const { data: row } = await db.service.from("heats").select("publish_hold").eq("id", heat.id).maybeSingle();
  await db.user.rpc("sim_set", { p_event: snap.eventId, p_patch: { blocker: null } });
  await logLine(db, snap.eventId, "heat", null, T.log.heatPublished(name, version));

  const division = snap.ctx.divisions.find((d) => d.id === heat.division_id);
  const rounds = snap.ctx.rounds.filter((r) => r.division_id === heat.division_id).map((r) => ({ id: r.id, sort: r.sort_order }));
  const inDivision = snap.heats.filter((h) => h.division_id === heat.division_id && h.status !== "cancelled").map((h) => ({ id: h.id, roundId: h.round_id, number: h.number }));
  const isFinal = isFinalHeat(heat.id, inDivision, rounds);
  const config = (await db.service.from("sim_control").select("config").eq("event_id", snap.eventId).maybeSingle()).data?.config as { armed?: string[] } | null;
  const scenarioHold = isFinal && (config?.armed ?? []).includes("hold_final");
  const settingHold = isFinal && effectiveSetting(division?.live.holdFinalResult ?? null, snap.settings.holdFinalResult);
  let held = Boolean(row?.publish_hold);

  if (scenarioHold && !held) {
    const r = await db.user.rpc("set_publish_hold", { p_heat: heat.id, p_hold: true, p_reason: "Simulator: held for the prize-giving" });
    held = !r.error;
  }
  if (scenarioHold || settingHold) {
    await updateConfig(db, snap.eventId, (c) => ({ ...c, armed: c.armed.filter((k) => k !== "hold_final"), finalHeldHeat: heat.id }));
    await logLine(db, snap.eventId, "info", null, T.log.holdFinalHeld(name));
  } else if (held) {
    const r = await db.user.rpc("set_publish_hold", { p_heat: heat.id, p_hold: false });
    if (!r.error) await logLine(db, snap.eventId, "info", null, T.log.released(name));
  }
  await updateConfig(db, snap.eventId, (c) => ({ ...c, tie: c.tie?.heatId === heat.id ? null : c.tie, dead: c.dead?.heatId === heat.id ? null : c.dead }));
}
