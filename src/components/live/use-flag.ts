"use client";

import { useMemo } from "react";
import { anyHeatStarted, flagHeatOf, flagWords, flagState, overlayArmedRow, pickFlagHeat, type FlagState } from "@/lib/live/flags";
import { nextHeat } from "@/lib/live/next-heat";
import { activePlanFor, heatLabel, heatTitle, livesFor, timetableOptions } from "@/lib/live/run-order";
import type { HeatRow, LiveContext } from "@/lib/live/types";
import type { FlagStripModel } from "./flag-strip";

/** Heats as every live screen should read them: a heat whose pre-start is over is running (from the armed moment), the same rule as the database. */
export function overlayHeats(heats: HeatRow[], nowServer: number): HeatRow[] {
  return heats.some((h) => h.status === "scheduled" && h.armed_at) ? heats.map((h) => overlayArmedRow(h, nowServer)) : heats;
}

/** The heat that most recently started, so the strip can say "Finished" after the screen's own rule has moved on. */
function lastStarted(heats: HeatRow[]): HeatRow | null {
  let best: HeatRow | null = null;
  for (const h of heats) if (h.started_at && h.status !== "cancelled" && (!best || Date.parse(h.started_at) > Date.parse(best.started_at!))) best = h;
  return best;
}

/**
 * The flag strip's model for a screen: the state (from the server clock), the words with "next: …" for the stopped flag, and the heat's name. Null when the event
 * has flags off, so the caller draws what it always drew. `current` is the heat the screen is on by its own rule; the heat in its pre-start wins over it.
 */
export function useFlagStrip(ctx: LiveContext, heats: HeatRow[], plans: Parameters<typeof activePlanFor>[0], current: HeatRow | null, nowServer: number): FlagStripModel | null {
  const settings = ctx.event.flags;
  const second = Math.floor(nowServer / 1000);
  const plan = useMemo(() => activePlanFor(plans, ctx.event.timezone, second * 1000), [plans, ctx.event.timezone, second]);
  const onHold = Boolean(plan?.plan.hold);
  const shown = settings.enabled ? pickFlagHeat(heats, current ?? lastStarted(heats), nowServer) : null;
  const state: FlagState | null = settings.enabled ? flagState({ settings, heat: shown ? flagHeatOf(shown) : null, nowMs: nowServer, onHold, anyHeatStarted: anyHeatStarted(heats, nowServer) }) : null;
  const stopped = state?.kind === "stopped";
  const next = useMemo(() => {
    if (!settings.enabled || !stopped || !plan) return null;
    const n = nextHeat(plan.plan, livesFor(ctx, heats, ctx.heatMeta), timetableOptions(plan, ctx.event.timezone, second * 1000));
    if (!n) return null;
    const row = heats.find((h) => h.id === n.heatId);
    const title = row ? heatTitle(ctx, row) : n.title;
    return n.startsAt ? `${title}, est. ${n.startsAt}` : title;
  }, [settings.enabled, stopped, plan, ctx, heats, second]);
  if (!state) return null;
  const words = flagWords(state, next);
  return { state, words, heatName: shown ? heatTitle(ctx, shown) : "", heatShort: shown ? heatLabel(shown) : "" };
}
