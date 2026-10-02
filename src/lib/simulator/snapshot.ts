import { loadLiveContext } from "@/lib/live/context";
import { HEAT_COLUMNS, SLOT_COLUMNS, type HeatRow, type LiveContext, type SlotRow } from "@/lib/live/types";
import { parseEventSettings, type EventSettings } from "@/lib/schemas/event-settings";
import type { createClient } from "@/lib/supabase/server";
import type { createServiceClient } from "@/lib/supabase/service";
import { whoJoins } from "./autoplay";
import { parseSimConfig } from "./config";
import type { SeatInfo, SeatRole, SimControlView } from "./types";

export type UserDb = Awaited<ReturnType<typeof createClient>>;
export type ServiceDb = ReturnType<typeof createServiceClient>;
/** The organiser (signed in: row security and the database's own checks decide) and the server (the service key: reads only what the organiser has been let in to). */
export interface SimDb {
  user: UserDb;
  service: ServiceDb;
  /** The signed-in organiser. */
  userId: string;
}

// The parts of the live context that do not change during a run (divisions with their rules, riders, trick base, run orders) are read once in a while, not every tick.
const CTX_TTL_MS = 30_000;
const ctxCache = new Map<string, { at: number; ctx: LiveContext }>();
export const forgetContext = (eventId: string) => void ctxCache.delete(eventId);

async function context(db: SimDb, eventId: string): Promise<LiveContext | null> {
  const hit = ctxCache.get(eventId);
  if (hit && Date.now() - hit.at < CTX_TTL_MS) return hit.ctx;
  const ctx = await loadLiveContext(eventId, db.user);
  if (ctx) ctxCache.set(eventId, { at: Date.now(), ctx });
  return ctx;
}

export interface Snapshot {
  /** The server's clock, in milliseconds. */
  nowMs: number;
  eventId: string;
  event: LiveContext["event"];
  settings: EventSettings;
  control: SimControlView;
  ctx: LiveContext;
  heats: HeatRow[];
  slots: SlotRow[];
  seats: SeatInfo[];
  lockedDivisions: Set<string>;
  /** Each division's panel in seat order: position 1, 2, 3 … */
  panels: Map<string, Array<{ seatId: string; seatNo: number }>>;
}

/** Everything one tick or one scenario needs to know, read fresh (heats, seats, state) or from a short-lived cache (rules, riders). Null when the simulator is not set up. */
export async function loadSnapshot(db: SimDb, eventId: string): Promise<Snapshot | null> {
  const { service } = db;
  const [ctx, controlRes, heatsRes, slotsRes, seatsRes, simSeatsRes, divisionsRes, membersRes, nowRes, eventRes] = await Promise.all([
    context(db, eventId),
    service.from("sim_control").select("speed, state, config, blocker, run_no, last_tick_at").eq("event_id", eventId).maybeSingle(),
    service.from("heats").select(HEAT_COLUMNS).eq("event_id", eventId),
    service.from("heat_slots").select(SLOT_COLUMNS).eq("event_id", eventId),
    service.from("judge_seats").select("id, name, role, active, status, auth_user_id").eq("event_id", eventId).eq("active", true).eq("status", "active"),
    service.from("sim_seats").select("seat_id, mode, virtual_user").eq("event_id", eventId),
    service.from("divisions").select("id, draw_locked_at, panel_id").eq("event_id", eventId),
    service.from("panel_members").select("panel_id, judge_seat_id, seat_no").eq("event_id", eventId).order("seat_no"),
    db.user.rpc("server_now"),
    service.from("events").select("settings").eq("id", eventId).maybeSingle(),
  ]);
  if (!ctx || !controlRes.data) return null;
  const c = controlRes.data;
  const simBy = new Map((simSeatsRes.data ?? []).map((s) => [s.seat_id, s]));
  const members = membersRes.data ?? [];
  const seatNoOf = new Map(members.map((m) => [m.judge_seat_id, m.seat_no]));
  const panels = new Map<string, Array<{ seatId: string; seatNo: number }>>();
  for (const d of divisionsRes.data ?? []) {
    panels.set(
      d.id,
      members.filter((m) => m.panel_id === d.panel_id).map((m, i) => ({ seatId: m.judge_seat_id, seatNo: i + 1 })),
    );
  }
  const seats: SeatInfo[] = (seatsRes.data ?? []).flatMap((s) => {
    const sim = simBy.get(s.id);
    if (!sim) return [];
    const mode = sim.mode === "real" ? "real" : "virtual";
    const person = whoJoins({ mode, boundUser: s.auth_user_id, virtualUser: sim.virtual_user }) === "person";
    return [{ id: s.id, name: s.name, role: s.role as SeatRole, mode, boundUser: s.auth_user_id, virtualUser: sim.virtual_user, seatNo: seatNoOf.get(s.id) ?? null, person }];
  });
  const nowIso = typeof nowRes.data === "string" ? nowRes.data : new Date().toISOString();
  return {
    nowMs: Date.parse(nowIso),
    eventId,
    event: ctx.event,
    settings: parseEventSettings(eventRes.data?.settings),
    control: { speed: c.speed, state: c.state as SimControlView["state"], config: parseSimConfig(c.config), blocker: c.blocker, runNo: c.run_no, lastTickAt: c.last_tick_at },
    ctx,
    heats: (heatsRes.data ?? []) as HeatRow[],
    slots: (slotsRes.data ?? []) as SlotRow[],
    seats,
    lockedDivisions: new Set((divisionsRes.data ?? []).filter((d) => d.draw_locked_at).map((d) => d.id)),
    panels,
  };
}

/** "Heat 3", or the name the organiser (or a re-run) gave it. */
export function heatName(h: Pick<HeatRow, "name" | "number" | "number_suffix">): string {
  return h.name?.trim() || `Heat ${h.number}${h.number_suffix ?? ""}`;
}

/** "Pro Men · Round 1 · Heat 3": where the heat is. */
export function heatPlace(h: HeatRow, ctx: LiveContext): string {
  const division = ctx.divisions.find((d) => d.id === h.division_id)?.name;
  const round = ctx.rounds.find((r) => r.id === h.round_id);
  return [division, round?.short_name || round?.name, heatName(h)].filter(Boolean).join(" · ");
}

export const riderName = (ctx: LiveContext, entryId: string): string => ctx.riders.find((r) => r.entryId === entryId)?.name ?? "A rider";
