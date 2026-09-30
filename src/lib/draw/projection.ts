import type { DivisionDraw, DrawHeat, DrawRound } from "@/lib/engine/ladder";

/** One row of `heat_slots` as `save_division_draw` takes it. */
export interface SlotRow {
  position: number;
  entry_id: string | null;
  vest_colour: string | null;
  source: unknown | null;
  modifier: "DNS" | null;
}

export interface HeatRow {
  uid: string;
  round_key: string;
  number: number;
  name: string | null;
  duration_sec: number;
  warm_up_sec: number;
  manual_override: boolean;
  slots: SlotRow[];
}

export interface RoundRow {
  key: string;
  sort_order: number;
  name: string;
  short_name: string;
  spec: Record<string, unknown>;
}

export interface DrawProjection {
  rounds: RoundRow[];
  heats: HeatRow[];
}

const slotRow = (slot: DrawHeat["slots"][number], index: number): SlotRow => ({
  position: index + 1,
  entry_id: slot.entrantId ?? null,
  vest_colour: slot.vestColour ?? null,
  source: slot.from ?? null,
  modifier: slot.modifier === "DNS" ? "DNS" : null,
});

/**
 * The tables a draw is stored in: `rounds`, `heats` and `heat_slots` (docs/06 decision 13: the engine's full draw is kept on the
 * division as JSON and projected to rows in one transaction). A heat that advances without riding has no row (Decision 5).
 * The same function serves a generated format, a custom ladder and a hand-edited draw, so nothing downstream needs a special case.
 */
export function drawProjection(draw: DivisionDraw): DrawProjection {
  const rounds = draw.rounds.map<RoundRow>((r: DrawRound, i) => ({
    key: r.id,
    sort_order: i + 1,
    name: r.name,
    short_name: r.shortName,
    spec: { ...r.spec, key: r.id, ...(r.explicit ? { explicit: true } : {}), ...(r.arranged ? { arranged: true } : {}), ...(r.limits ? { limits: r.limits } : {}) },
  }));
  const heats = draw.rounds.flatMap((r) =>
    r.heats
      .filter((h) => !h.bye && h.number !== null)
      .map<HeatRow>((h) => ({
        uid: h.uid ?? h.id,
        round_key: r.id,
        number: h.number!,
        name: h.name ?? null,
        duration_sec: Math.round(h.durationMin * 60),
        warm_up_sec: Math.round((h.warmUpMin ?? 0) * 60),
        manual_override: h.manualOverride,
        slots: h.slots.map(slotRow),
      })),
  );
  return { rounds, heats };
}
