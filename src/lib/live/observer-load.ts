import { loadLiveContext } from "./context";
import type { ObserverSeat } from "./observer";
import type { LiveContext } from "./types";
import { createClient } from "@/lib/supabase/server";

export interface ObserverPageData {
  ctx: LiveContext;
  observerSeatId: string;
  seats: ObserverSeat[];
  /** The judges of each division's panel, in panel order. */
  panels: string[][];
}

/**
 * What every observer page needs, read as the observer (row security gives an observer what it gives the head judge). `kind` says where to send anybody else:
 * "join" for a person with no seat here, "own" for an official with another role (their own screen).
 */
export async function loadObserver(eventId: string): Promise<{ ok: true; data: ObserverPageData } | { ok: false; kind: "join" | "own"; role?: string }> {
  const db = await createClient();
  const ctx = await loadLiveContext(eventId, db);
  if (!ctx) return { ok: false, kind: "join" };
  if (ctx.viewer.kind !== "seat" || ctx.viewer.role !== "observer") return { ok: false, kind: "own", role: ctx.viewer.kind === "seat" ? ctx.viewer.role : "organiser" };
  const { data: rows } = await db.from("judge_seats").select("id, name, role, spotter_assignment").eq("event_id", eventId).eq("active", true).eq("status", "active").order("created_at");
  const seats: ObserverSeat[] = (rows ?? []).map((s) => {
    const sa = (s.spotter_assignment ?? {}) as { entries?: unknown; colours?: unknown };
    return {
      id: s.id,
      name: s.name,
      role: s.role,
      spotterEntries: Array.isArray(sa.entries) ? sa.entries.filter((x): x is string => typeof x === "string") : [],
      spotterColours: Array.isArray(sa.colours) ? sa.colours.filter((x): x is string => typeof x === "string") : [],
    };
  });
  return { ok: true, data: { ctx, observerSeatId: ctx.viewer.seatId, seats, panels: ctx.divisions.map((d) => d.panelSeatIds) } };
}

/** Where an official who is not an observer belongs. */
export function ownScreen(eventId: string, role: string | undefined): string {
  if (role === "judge") return `/judge/${eventId}`;
  if (role === "spotter") return `/spot/${eventId}`;
  if (role === "head" || role === "organiser") return `/head/${eventId}`;
  return "/seat?card=1";
}
