import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who Ask Sendbook answers. Signed-in platform admins and organisers, and PIN seats bound to the event the question is about; a visitor only when the
 * public flag is on. Read with the service key (the caller is already known from their own session), so nothing here trusts what the browser says
 * except which event and organisation it is looking at — and both are checked against the person's rights.
 */

export type AskRole = "owner" | "staff" | "organiser" | "head" | "judge" | "spotter" | "announcer" | "visitor";

export type Requester =
  | { kind: "admin"; role: "owner" | "staff"; userId: string; organisationId: string | null; eventId: string | null; seatId: null }
  | { kind: "organiser"; role: "organiser"; userId: string; organisationId: string; eventId: string | null; seatId: null }
  | { kind: "seat"; role: "head" | "judge" | "spotter" | "announcer"; userId: string; organisationId: string; eventId: string; seatId: string }
  | { kind: "visitor"; role: "visitor"; userId: null; organisationId: string | null; eventId: string | null; seatId: null };

export type AccessRefusal = "signed_out" | "no_seat" | "not_allowed";
export type AccessResult = { ok: true; requester: Requester } | { ok: false; reason: AccessRefusal };

export interface AskTarget {
  /** The event the screen belongs to (from the address). */
  eventId: string | null;
  /** The organisation the organiser screens have open (their cookie), used when no event is open. Ignored unless they are a member of it. */
  organisationId?: string | null;
  /** ASK_SENDBOOK_PUBLIC=1: visitors may ask (the route limits them per address). */
  publicAllowed?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- works with the typed app client and the plain one of the RLS tests
type Client = SupabaseClient<any, any, any>;

async function eventOrganisation(s: Client, eventId: string): Promise<string | null> {
  const { data } = await s.from("events").select("organisation_id").eq("id", eventId).maybeSingle();
  return (data as { organisation_id: string } | null)?.organisation_id ?? null;
}

export async function authorizeAsk(s: Client, user: { id: string; is_anonymous?: boolean | null } | null, target: AskTarget): Promise<AccessResult> {
  const eventId = target.eventId ?? null;

  if (!user) {
    if (!target.publicAllowed) return { ok: false, reason: "signed_out" };
    const org = eventId ? await eventOrganisation(s, eventId) : null;
    return { ok: true, requester: { kind: "visitor", role: "visitor", userId: null, organisationId: org, eventId: org ? eventId : null, seatId: null } };
  }

  // a PIN seat (an anonymous session) is only ever a seat
  if (user.is_anonymous) return seatAccess(s, user.id, eventId);

  const { data: admin } = await s.from("platform_admins").select("role").eq("user_id", user.id).maybeSingle();
  const adminRole = (admin as { role: "owner" | "staff" } | null)?.role ?? null;
  const eventOrg = eventId ? await eventOrganisation(s, eventId) : null;
  if (eventId && !eventOrg) return { ok: false, reason: "not_allowed" };

  if (adminRole) {
    return { ok: true, requester: { kind: "admin", role: adminRole, userId: user.id, organisationId: eventOrg ?? target.organisationId ?? null, eventId, seatId: null } };
  }

  const { data: rows } = await s.from("memberships").select("organisation_id").eq("user_id", user.id).order("created_at");
  const mine = ((rows ?? []) as Array<{ organisation_id: string }>).map((r) => r.organisation_id);
  // a login that holds a seat of this event (officials may join with a login of their own) asks as that seat
  if (eventOrg && !mine.includes(eventOrg)) {
    const seat = await seatAccess(s, user.id, eventId);
    return seat.ok ? seat : { ok: false, reason: "not_allowed" };
  }
  if (mine.length === 0) return { ok: false, reason: "not_allowed" };
  if (eventOrg) {
    return { ok: true, requester: { kind: "organiser", role: "organiser", userId: user.id, organisationId: eventOrg, eventId, seatId: null } };
  }
  const org = target.organisationId && mine.includes(target.organisationId) ? target.organisationId : mine[0];
  return { ok: true, requester: { kind: "organiser", role: "organiser", userId: user.id, organisationId: org, eventId: null, seatId: null } };
}

/** The seat this login holds on the event: switched on and active, or refused. */
async function seatAccess(s: Client, userId: string, eventId: string | null): Promise<AccessResult> {
  if (!eventId) return { ok: false, reason: "no_seat" };
  const { data } = await s.from("judge_seats").select("id, role, event_id, events(organisation_id)").eq("event_id", eventId).eq("auth_user_id", userId).eq("active", true).eq("status", "active").limit(1).maybeSingle();
  const seat = data as { id: string; role: "head" | "judge" | "spotter" | "announcer"; event_id: string; events: { organisation_id: string } | null } | null;
  if (!seat?.events) return { ok: false, reason: "no_seat" };
  return { ok: true, requester: { kind: "seat", role: seat.role, userId, organisationId: seat.events.organisation_id, eventId: seat.event_id, seatId: seat.id } };
}
