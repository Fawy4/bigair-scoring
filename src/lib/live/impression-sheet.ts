import type { LabelModel } from "@/lib/identification/rider-label";

/** A rider on the head judge's Impression / Variety sheet for one judge (Polish 2, item 6). */
export interface SheetRider {
  id: string;
  word: string;
  /** The rider's Rider label (the event's identification scheme): the bar of this rider is drawn from it. */
  label: LabelModel;
  /** What is stored now: a score, Absent, or nothing. */
  now: { state: "done" | "missing" | "absent"; value: number | null };
}
/** What the head judge typed for a rider and has not saved yet: a score, or Absent. */
export type SheetDraft = { value: number | null; missed: boolean };

/** The rider after `from` (in seat order, wrapping round) that still has nothing — stored or typed — or null when every rider has something. */
export function nextOpenRider(riders: SheetRider[], drafts: Record<string, SheetDraft>, from: string): string | null {
  const i = riders.findIndex((r) => r.id === from);
  for (let k = 1; k <= riders.length; k++) {
    const r = riders[(i + k) % riders.length];
    if (!drafts[r.id] && r.now.state === "missing") return r.id;
  }
  return null;
}
