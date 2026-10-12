import { divisionPlacings, placeholderText, provisionalSeat, type DivisionDraw, type DrawHeat, type DrawRound } from "@/lib/engine/ladder";
import { bestInk } from "@/lib/identification/label-style";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { copy } from "@/lib/ui-copy";
import { entryName } from "./schemes";
import type { PublicEntry, ResultsDivision, ResultsHeat } from "./types";

const L = copy.pub.ladder;

export type LadderState = "complete" | "live" | "scheduled";

export interface LadderRiderVM {
  entryId: string | null;
  name: string;
  /** The Lycra colour of the seat and its word (the word is always shown too). */
  hex: string | null;
  ink: string;
  colourWord: string | null;
  totalLabel: string;
  /** The seat waits for an earlier heat ("1st H1"). */
  placeholder: boolean;
  /** Somebody is on the way ("Sam · 1st H1 · seat pending"). */
  pending: boolean;
  walkover: boolean;
  /** In words, never a score: "Walkover" (went through without riding), "Did not start", "Out of the event"; null for a rider with a result or a seat still to ride. */
  note?: string | null;
}

export interface LadderHeatVM {
  id: string;
  /** The heat's row id in the results (links the card to its results tab). */
  heatId: string | null;
  name: string;
  state: LadderState;
  riders: LadderRiderVM[];
}

export interface LadderRoundVM {
  id: string;
  name: string;
  heats: LadderHeatVM[];
}

export const drawHeatName = (h: DrawHeat): string => h.name ?? (h.number !== null ? `Heat ${h.number}` : h.id);

const stateOf = (h: ResultsHeat | undefined): LadderState => (h?.status === "published" && !h.held ? "complete" : h && (h.status === "running" || h.status === "paused") ? "live" : "scheduled");

/**
 * The ladder of a division from its cleaned draw (the database removed everything not released): rounds as groups, heats as boxes, riders in their Lycra
 * colour with their totals, placeholders "1st H1", and "Sam · 1st H1 · seat pending" for a seat that is not dealt yet but whose heat is out. Pure.
 */
export function buildLadder(draw: DivisionDraw | null, division: Pick<ResultsDivision, "rounds"> | undefined, scheme: IdentificationScheme, decimals = 2): LadderRoundVM[] {
  if (!draw) return [];
  const dbHeat = new Map<string, ResultsHeat>();
  for (const r of division?.rounds ?? []) for (const h of r.heats) if (h.draw_uid) dbHeat.set(h.draw_uid, h);
  const colour = (key: string | undefined) => scheme.palette.find((c) => c.key === key);
  const nameOf = (id: string) => draw.entrants.find((e) => e.id === id)?.name ?? "Rider";
  return draw.rounds.map((round: DrawRound): LadderRoundVM => ({
    id: round.id,
    name: round.name,
    heats: round.heats.map((h): LadderHeatVM => {
      const row = dbHeat.get(h.uid ?? h.id);
      const state = h.bye ? "complete" : stateOf(row);
      const ranked = draw.results[h.id]?.ranked ?? [];
      return {
        id: h.id,
        heatId: row?.id ?? null,
        name: drawHeatName(h),
        state,
        riders: h.slots.map((s): LadderRiderVM => {
          const c = scheme.primary === "vest_colour" || scheme.fallbackPrimary === "vest_colour" ? colour(s.vestColour) : undefined;
          const style = { hex: c?.hex ?? null, ink: c ? bestInk(c.hex) : "#111111", colourWord: c?.label ?? null };
          if (s.entrantId) {
            const res = ranked.find((x) => x.entrantId === s.entrantId);
            const total = res?.total;
            const out = Boolean(draw.entrants.find((e) => e.id === s.entrantId)?.withdrawn);
            const note = state === "complete" && res?.walkover ? copy.walkover.word.walkover : res?.modifier === "DNS" || s.modifier === "DNS" ? (out ? copy.walkover.word.outOfEvent : copy.walkover.word.didNotStart) : null;
            return { entryId: s.entrantId, name: nameOf(s.entrantId), ...style, totalLabel: state === "complete" && total !== null && total !== undefined ? total.toFixed(decimals) : copy.live.result.noTotal, placeholder: false, pending: false, walkover: s.modifier === "DNS", note };
          }
          const coming = s.from ? provisionalSeat(draw, round, s) : null;
          if (coming) return { entryId: coming.entrantId, name: L.seatPending(coming.name, coming.placeholder), hex: null, ink: "#111111", colourWord: null, totalLabel: copy.live.result.noTotal, placeholder: true, pending: true, walkover: false, note: null };
          return { entryId: null, name: s.from ? placeholderText(draw, s.from, round.id) : copy.live.result.noTotal, hex: null, ink: "#111111", colourWord: null, totalLabel: copy.live.result.noTotal, placeholder: true, pending: false, walkover: false, note: null };
        }),
      };
    }),
  }));
}

export interface PlacingVM {
  place: number;
  label: string;
  shared: boolean;
  entryId: string;
  name: string;
  round: string;
}

/** Final places of a division as far as they are decided; riders knocked out in the same round share a place ("13="). Names come from the entries. */
export function buildPlacings(draw: DivisionDraw | null, entries: PublicEntry[]): PlacingVM[] {
  if (!draw) return [];
  return divisionPlacings(draw).map((p) => ({
    place: p.place,
    label: p.label,
    shared: p.shared,
    entryId: p.entrantId,
    name: entries.find((e) => e.id === p.entrantId) ? entryName(entries.find((e) => e.id === p.entrantId)) : (draw.entrants.find((e) => e.id === p.entrantId)?.name ?? "Rider"),
    round: p.round,
  }));
}

/** "Highest jump: 14.2 m — Sam Rivera (Backroll)", or null when no released attempt has a height. */
export function highestJumpLine(d: Pick<ResultsDivision, "highest_jump"> | undefined, entries: PublicEntry[]): string | null {
  const j = d?.highest_jump;
  if (!j) return null;
  const who = entryName(entries.find((e) => e.id === j.entry_id));
  return copy.pub.placings.highestJump(String(Math.round(Number(j.height_m) * 100) / 100), who, j.trick_name ?? "");
}
