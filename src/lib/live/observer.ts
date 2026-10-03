import { copy } from "@/lib/ui-copy";
import type { LiveContext } from "./types";

/**
 * The Observer seat: a read-only official who looks at every official's screen. These pure helpers decide which screens the role switcher lists, which seat each
 * screen is drawn for, and which rows each screen shows (the same rows the database gives that official, so the observer sees exactly what they see).
 */

export type ObserverView =
  | { kind: "head-wide" }
  | { kind: "head-phone" }
  | { kind: "judge"; seatId: string }
  | { kind: "spotter"; seatId: string }
  | { kind: "announcer" }
  | { kind: "screen" }
  | { kind: "public" };

/** The size the screen is drawn at: a laptop (1280 px), a phone (390 px) or a big screen (16:9). */
export type FrameKind = "laptop" | "phone" | "tv";

export interface ObserverSeat {
  id: string;
  name: string;
  role: string;
  spotterEntries: string[];
  spotterColours: string[];
}

export interface ObserverViewItem {
  key: string;
  view: ObserverView;
  label: string;
  group: "head" | "judges" | "spotters" | "more";
  frame: FrameKind;
}

export function viewKey(v: ObserverView): string {
  return v.kind === "judge" || v.kind === "spotter" ? `${v.kind}:${v.seatId}` : v.kind;
}

export function parseViewKey(key: string | null | undefined): ObserverView | null {
  if (!key) return null;
  const [kind, seatId] = key.split(":");
  switch (kind) {
    case "head-wide":
    case "head-phone":
    case "announcer":
    case "screen":
    case "public":
      return seatId === undefined ? { kind } : null;
    case "judge":
    case "spotter":
      return seatId && /^[0-9a-zA-Z-]{1,64}$/.test(seatId) ? { kind, seatId } : null;
    default:
      return null;
  }
}

/** The judges in order: by their best place on any panel, then by the first panel they appear on. The head judge who also scores is one of them. */
export function judgeOrder(panels: readonly (readonly string[])[]): string[] {
  const best = new Map<string, number>();
  panels.forEach((p, pi) => p.forEach((id, i) => {
    const rank = i * 1000 + pi;
    if (!best.has(id) || best.get(id)! > rank) best.set(id, rank);
  }));
  return [...best.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

/** A seat already named like its label ("Judge 1", "Spotter 2") is not named twice ("Judge 1 · Judge 1"). */
function sameWord(name: string, prefix: string): boolean {
  const p = prefix.replace(/\s*·\s*$/, "").trim().toLowerCase();
  return name.trim().toLowerCase().startsWith(p);
}

/** Every screen the observer can switch to. */
export function observerViews(seats: readonly ObserverSeat[], panels: readonly (readonly string[])[]): ObserverViewItem[] {
  const V = copy.observer.views;
  const byId = new Map(seats.map((s) => [s.id, s]));
  const item = (view: ObserverView, label: string, group: ObserverViewItem["group"], frame: FrameKind): ObserverViewItem => ({ key: viewKey(view), view, label, group, frame });
  const judges = judgeOrder(panels)
    .map((id) => byId.get(id))
    .filter((s): s is ObserverSeat => Boolean(s && (s.role === "judge" || s.role === "head")));
  return [
    item({ kind: "head-wide" }, V.headWide, "head", "laptop"),
    item({ kind: "head-phone" }, V.headPhone, "head", "phone"),
    ...judges.map((s, i) => item({ kind: "judge", seatId: s.id }, sameWord(s.name, V.judge(i + 1, "")) ? s.name : V.judge(i + 1, s.name), "judges", "phone")),
    ...seats
      .filter((s) => s.role === "spotter")
      .sort((a, b) => a.name.localeCompare(b.name, "en"))
      .map((s) => item({ kind: "spotter", seatId: s.id }, sameWord(s.name, V.spotter("")) ? s.name : V.spotter(s.name), "spotters", "phone")),
    item({ kind: "announcer" }, V.announcer, "more", "phone"),
    item({ kind: "screen" }, V.screen, "more", "tv"),
    item({ kind: "public" }, V.public, "more", "phone"),
  ];
}

type SeatViewer = Extract<LiveContext["viewer"], { kind: "seat" }>;

/**
 * The viewer an observed screen is drawn for: that official's own seat (so the screen picks the same heat and shows the same rows), with the observer kept aside
 * in `observer`. The head judge console and the announcer use the event's head / announcer seat when there is one, otherwise the observer's own seat in that role.
 * Null when the seat asked for is not that kind of official (or is the observer itself).
 */
export function observedViewer(view: ObserverView, seats: readonly ObserverSeat[], observerSeatId: string): SeatViewer | null {
  const me = seats.find((s) => s.id === observerSeatId);
  const observer = { seatId: observerSeatId, name: me?.name ?? "" };
  const as = (s: ObserverSeat, role: SeatViewer["role"]): SeatViewer => ({ kind: "seat", seatId: s.id, name: s.name, role, spotterEntries: s.spotterEntries, spotterColours: s.spotterColours, observer });
  const fallback = (role: SeatViewer["role"]): SeatViewer => ({ kind: "seat", seatId: observerSeatId, name: observer.name, role, spotterEntries: [], spotterColours: [], observer });
  switch (view.kind) {
    case "head-wide":
    case "head-phone": {
      const head = seats.find((s) => s.role === "head");
      return head ? as(head, "head") : fallback("head");
    }
    case "announcer": {
      const a = seats.find((s) => s.role === "announcer");
      return a ? as(a, "announcer") : fallback("announcer");
    }
    case "judge": {
      const s = seats.find((x) => x.id === view.seatId && (x.role === "judge" || x.role === "head"));
      return s ? as(s, "judge") : null;
    }
    case "spotter": {
      const s = seats.find((x) => x.id === view.seatId && x.role === "spotter");
      return s ? as(s, "spotter") : null;
    }
    default:
      return null;
  }
}

interface MaskRows {
  scores: Array<{ judge_seat_id: string }>;
  impressions: Array<{ judge_seat_id: string }>;
  flags: Array<{ judge_seat_id: string }>;
  sheets: Array<{ judge_seat_id: string }>;
  decisions: unknown[];
}

/**
 * The rows of a heat as the observed official's phone gets them from the database: a judge reads only their own marks, flags and sheet; a spotter reads no
 * marks; the announcer reads every mark but no sheets, flags or decisions; the head judge reads everything. (The observer itself reads everything.)
 */
export function maskFor<T extends MaskRows>(snap: T, role: string, seatId: string): T {
  const own = <R extends { judge_seat_id: string }>(l: R[]) => l.filter((r) => r.judge_seat_id === seatId);
  switch (role) {
    case "judge":
      return { ...snap, scores: own(snap.scores), impressions: own(snap.impressions), flags: own(snap.flags), sheets: own(snap.sheets), decisions: [] };
    case "spotter":
      return { ...snap, scores: [], impressions: [], flags: [], sheets: [], decisions: [] };
    case "announcer":
      return { ...snap, flags: [], sheets: [], decisions: [] };
    default:
      return snap;
  }
}

/** An observer counts as watching while its phone has said "I am here" within this time (it says so every 30 seconds while a page is open). */
export const OBSERVER_SEEN_MS = 75_000;

export function watchingCount(seats: ReadonlyArray<{ role: string; last_seen_at: string | null }>, nowMs: number): number {
  return seats.filter((s) => s.role === "observer" && s.last_seen_at && nowMs - Date.parse(s.last_seen_at) <= OBSERVER_SEEN_MS).length;
}
