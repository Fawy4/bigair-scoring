import { z } from "zod";

/** View as…: each role's real screen for a simulation event, opened from the panel in a new tab (docs: simulator, owner brief 1 Oct 2026). */

export type ViewTarget =
  | { kind: "spectator" }
  | { kind: "live" }
  | { kind: "results" }
  | { kind: "ladder" }
  | { kind: "rider"; entryId: string }
  | { kind: "screen" }
  | { kind: "seat"; seatId: string }
  | { kind: "head-organiser" };

const Uuid = z.string().uuid();

/** The address of the "View as" door for one target. The door prepares the view (the preview, or giving a seat to the organiser's sign-in) and moves on to the real screen. */
export function viewHref(eventId: string, t: ViewTarget): string {
  const q = new URLSearchParams({ as: t.kind });
  if (t.kind === "rider") q.set("entry", t.entryId);
  if (t.kind === "seat") q.set("seat", t.seatId);
  return `/org/events/${eventId}/simulate/view?${q.toString()}`;
}

export function parseView(params: URLSearchParams): ViewTarget | null {
  const as = params.get("as");
  switch (as) {
    case "spectator":
    case "live":
    case "results":
    case "ladder":
    case "screen":
    case "head-organiser":
      return { kind: as };
    case "rider": {
      const entry = Uuid.safeParse(params.get("entry"));
      return entry.success ? { kind: "rider", entryId: entry.data } : null;
    }
    case "seat": {
      const seat = Uuid.safeParse(params.get("seat"));
      return seat.success ? { kind: "seat", seatId: seat.data } : null;
    }
    default:
      return null;
  }
}

/** Where the door finally sends the tab. An official goes to the screen of their role. */
export function destinationOf(t: ViewTarget, ev: { id: string; slug: string }, role?: "judge" | "head" | "spotter" | "announcer"): string {
  switch (t.kind) {
    case "spectator":
      return `/e/${ev.slug}`;
    case "live":
      return `/e/${ev.slug}/live`;
    case "results":
      return `/e/${ev.slug}/results`;
    case "ladder":
      return `/e/${ev.slug}/ladder`;
    case "rider":
      return `/e/${ev.slug}/riders/${t.entryId}`;
    case "screen":
      return `/screen/${ev.slug}`;
    case "head-organiser":
      return `/head/${ev.id}`;
    case "seat":
      if (role === "spotter") return `/spot/${ev.id}`;
      if (role === "head") return `/head/${ev.id}`;
      if (role === "announcer") return `/head/${ev.id}?mode=announcer`;
      return `/judge/${ev.id}`;
  }
}

/** The public pages read a simulation event only for its own organiser while the preview is on. */
export function needsPreviewCookie(t: ViewTarget): boolean {
  return t.kind !== "seat" && t.kind !== "head-organiser";
}

export type SeatRole = "judge" | "head" | "spotter" | "announcer";
export interface SeatLite {
  id: string;
  name: string;
  role: SeatRole;
  /** Place on the panel, for judges. */
  seatNo: number | null;
}

const ROLE_ORDER: SeatRole[] = ["judge", "spotter", "head", "announcer"];

/** The officials as groups of buttons: judges by their place on the panel, then spotters, the head judge and the announcer; an empty group is left out. */
export function seatGroups(seats: readonly SeatLite[]): Array<{ role: SeatRole; seats: SeatLite[] }> {
  return ROLE_ORDER.flatMap((role) => {
    const list = seats.filter((s) => s.role === role).sort((a, b) => (a.seatNo ?? 99) - (b.seatNo ?? 99) || a.name.localeCompare(b.name));
    return list.length ? [{ role, seats: list }] : [];
  });
}
