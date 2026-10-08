// Internal helpers shared by expandFormat, recompute and the progression functions.
import type { RoundSpec } from "@/lib/schemas/format-template";
import type {
  Arrival,
  DivisionDraw,
  DrawHeat,
  DrawRound,
  HeatResultInput,
  HistoryEntry,
  IdentificationSchemeId,
  LadderWarning,
  LadderModifier,
  Slot,
  SlotSource,
} from "./types";

export const DEFAULT_SCHEME: IdentificationSchemeId = "vests-per-heat";
const VEST_SCHEMES: IdentificationSchemeId[] = ["vests-per-heat", "brand-launch-same-kites"];

export const isSeedFed = (spec: RoundSpec) => spec.entrantsFrom.every((s) => s.type === "seeds");

export const sourceRoundIds = (spec: RoundSpec): string[] => [
  ...new Set(spec.entrantsFrom.flatMap((s) => (s.type === "round_places" ? [s.round] : []))),
];

/** Where a rider finishing `place` in a heat of this round goes: a round id, "eliminated" or "final_placing". */
export function outcomeOf(spec: RoundSpec, place: number): string {
  let rest: string | undefined;
  for (const rule of spec.advance) {
    if (rule.places === "rest") rest = rule.to;
    else if (rule.places.includes(place)) return rule.to;
  }
  return rest ?? "eliminated";
}

export const seedNumber = (draw: DivisionDraw, entrantId: string): number => draw.seedOrder.indexOf(entrantId) + 1;

export function vestColourFor(draw: DivisionDraw, index: number): string | undefined {
  const scheme = draw.overrides.identification ?? DEFAULT_SCHEME;
  if (!VEST_SCHEMES.includes(scheme)) return undefined;
  const palette = draw.overrides.vestColours?.length ? draw.overrides.vestColours : draw.template.vestColours;
  return palette[index % palette.length];
}

/** Every slot of every heat of a round gets its palette colour by index. */
export function makeSlot(draw: DivisionDraw, index: number, part: Partial<Slot>): Slot {
  const vest = vestColourFor(draw, index);
  return { index, ...(vest ? { vestColour: vest } : {}), ...part };
}

/** The finished result of a heat, or the implicit one of a bye (the rider simply goes on). */
export function resultOf(draw: DivisionDraw, heat: DrawHeat): HeatResultInput | undefined {
  const stored = draw.results[heat.id];
  if (stored) return stored;
  const slot = heat.slots[0];
  if (heat.bye && slot?.entrantId) {
    const last = slot.history?.at(-1);
    return {
      ranked: [
        {
          entrantId: slot.entrantId,
          place: 1,
          total: last?.total ?? null,
          tieKeys: last?.tieKeys ?? [],
          ...(slot.modifier === "DNS" ? { modifier: "DNS" as LadderModifier } : {}),
        },
      ],
    };
  }
  return undefined;
}

export const roundComplete = (draw: DivisionDraw, round: DrawRound) => round.heats.every((h) => resultOf(draw, h) !== undefined);

/** Which cross-heat ranks go to `roundId`: the Final's tier (best first) or the Small final's tier (the next best). */
export function crossTier(cross: NonNullable<RoundSpec["crossHeat"]>, roundId: string): { start: number; count: number } | null {
  if (cross.to === roundId) return { start: 0, count: cross.advanceTop };
  if (cross.alsoTo?.to === roundId) return { start: cross.advanceTop, count: cross.alsoTo.count };
  return null;
}

/** All places that will arrive in `round`, in provisional order (place, then source round, then heat). */
export function sourceSlots(rounds: DrawRound[], spec: RoundSpec): SlotSource[] {
  const out: SlotSource[] = [];
  const order = (id: string) => rounds.findIndex((r) => r.id === id);
  for (const src of spec.entrantsFrom) {
    if (src.type !== "round_places") continue;
    const from = rounds.find((r) => r.id === src.round);
    if (!from) throw new Error(`Round ${spec.id} is fed by ${src.round}, which comes later or does not exist`);
    if (from.spec.crossHeat) {
      const tier = crossTier(from.spec.crossHeat, spec.id);
      if (!tier) continue;
      const k = Math.max(0, Math.min(tier.count, from.expectedEntrants - tier.start));
      for (let p = 1; p <= k; p++) out.push({ round: from.id, heat: 0, place: tier.start + p });
      continue;
    }
    for (const h of from.heats) for (const p of src.places) if (p <= h.slots.length) out.push({ round: from.id, heat: h.index, place: p });
  }
  return out.sort((a, b) => a.place - b.place || order(a.round) - order(b.round) || a.heat - b.heat);
}

export const sameSource = (a: SlotSource, b: SlotSource) => a.round === b.round && a.heat === b.heat && a.place === b.place;

export function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -Infinity) - (b[i] ?? -Infinity);
    if (d) return d;
  }
  return 0;
}

interface Scored {
  seed: number;
  total: number | null;
  tieKeys: number[];
  modifier?: LadderModifier;
}

/** Best first: DNS last, higher total first (no total last), higher tie-break keys, then the original seed. */
export function compareScore(a: Scored, b: Scored): number {
  const dns = Number(a.modifier === "DNS") - Number(b.modifier === "DNS");
  if (dns) return dns;
  if (a.total !== b.total) {
    if (a.total === null) return 1;
    if (b.total === null) return -1;
    return b.total - a.total;
  }
  return compareKeys(b.tieKeys, a.tieKeys) || a.seed - b.seed;
}

/** Orders arrivals by the round's `reseed` rule. */
export function orderArrivals(arrivals: Arrival[], reseed: RoundSpec["reseed"]): Arrival[] {
  const scored = (a: Arrival): Scored => ({ seed: a.originalSeed, total: a.total, tieKeys: a.tieKeys, modifier: a.modifier });
  const cmp = (a: Arrival, b: Arrival) => {
    if (reseed === "by_original_seed") return a.originalSeed - b.originalSeed;
    const dns = Number(a.modifier === "DNS") - Number(b.modifier === "DNS");
    if (reseed === "by_place_then_score") return dns || a.place - b.place || compareScore(scored(a), scored(b));
    return compareScore(scored(a), scored(b));
  };
  return [...arrivals].sort(cmp);
}

export interface CrossRanking {
  entrantId: string;
  seed: number;
  combined: number | null;
  tieKeys: number[];
  history: HistoryEntry[];
  modifier?: LadderModifier;
}

/** Points of one heat: the table's entry for the place, else heat size + 1 − place. */
export function heatPoints(entry: HistoryEntry, table?: number[]): number {
  if (entry.place === undefined) return 0;
  return table ? (table[entry.place - 1] ?? 0) : Math.max(0, (entry.size ?? entry.place) + 1 - entry.place);
}

/** Every round whose heats count towards a cross-heat ranking (its own and the `over` rounds) has been published. */
export function crossComplete(draw: DivisionDraw, round: DrawRound): boolean {
  const over = (round.spec.crossHeat?.over ?? []).map((id) => draw.rounds.find((r) => r.id === id)).filter((r): r is DrawRound => Boolean(r));
  return [...over, round].every((r) => roundComplete(draw, r));
}

/**
 * Ranking across all heats (pools, qualifying, round robin): best or sum of the rider's heat totals, or the sum of place points.
 * Ties: the tie-break keys of the deciding heat (the best single heat), then the original seed (Decision 7).
 */
export function rankAcross(draw: DivisionDraw, round: DrawRound): CrossRanking[] {
  const cross = round.spec.crossHeat;
  const combine = cross?.combine ?? "best";
  const over = (cross?.over ?? []).map((id) => draw.rounds.find((r) => r.id === id)).filter((r): r is DrawRound => Boolean(r));
  const rows = new Map<string, { history: HistoryEntry[]; modifier?: LadderModifier }>();
  for (const r of [...over, round]) {
    for (const h of r.heats) {
      const res = resultOf(draw, h);
      if (!res) continue;
      for (const e of res.ranked) {
        const slot = h.slots.find((s) => s.entrantId === e.entrantId);
        const entry: HistoryEntry = { round: r.id, heat: h.index, total: e.total, tieKeys: e.tieKeys ?? [], place: e.place, size: h.slots.length };
        const row = rows.get(e.entrantId) ?? { history: over.length > 0 ? [] : [...(slot?.history ?? [])] };
        row.history.push(entry);
        if (e.modifier === "DNS" || slot?.modifier === "DNS") row.modifier = "DNS";
        rows.set(e.entrantId, row);
      }
    }
  }
  const out: CrossRanking[] = [...rows.entries()].map(([entrantId, row]) => {
    const totals = row.history.filter((x) => x.total !== null) as Array<HistoryEntry & { total: number }>;
    const combined =
      combine === "points" ? (row.modifier === "DNS" ? 0 : row.history.reduce((s, x) => s + heatPoints(x, cross?.points), 0))
      : totals.length === 0 ? null
      : combine === "sum" ? totals.reduce((s, x) => s + x.total, 0)
      : Math.max(...totals.map((x) => x.total));
    const deciding = totals.reduce<(HistoryEntry & { total: number }) | undefined>((best, x) => (!best || x.total > best.total ? x : best), undefined);
    return { entrantId, seed: seedNumber(draw, entrantId), combined, tieKeys: deciding?.tieKeys ?? [], history: row.history, ...(row.modifier ? { modifier: row.modifier } : {}) };
  });
  return out.sort((a, b) => compareScore({ ...a, total: a.combined }, { ...b, total: b.combined }));
}

/** Riders that will be eliminated by a round, structurally (from heat sizes; independent of what has been published). */
export function eliminatedCount(round: DrawRound): number {
  const cross = round.spec.crossHeat;
  if (cross) return cross.to === "final_placing" ? 0 : Math.max(0, round.expectedEntrants - Math.min(cross.advanceTop + (cross.alsoTo?.count ?? 0), round.expectedEntrants));
  let n = 0;
  for (const h of round.heats) for (let p = 1; p <= h.slots.length; p++) if (outcomeOf(round.spec, p) === "eliminated") n++;
  return n;
}

// ── identification ──────────────────────────────────────────────────────────────

const lower = (s: unknown) => String(s ?? "").trim().toLowerCase();

interface Primary {
  key: string;
  text: string;
  what: string;
}

function primaryOf(scheme: IdentificationSchemeId, e: { name?: string; identifiers?: import("./types").EntrantIdentifiers }): Primary | undefined {
  if (scheme === "name-callout") return e.name?.trim() ? { key: lower(e.name), text: e.name.trim(), what: "name" } : undefined;
  const id = e.identifiers;
  if (!id) return undefined;
  switch (scheme) {
    case "fixed-lycra-per-rider":
      return id.vest_colour ? { key: lower(id.vest_colour), text: lower(id.vest_colour), what: "lycra colour" } : undefined;
    case "bib-numbers":
      return id.bib !== undefined && id.bib !== "" ? { key: lower(id.bib), text: String(id.bib), what: "bib number" } : undefined;
    case "kites-no-vests": {
      const k = id.kite;
      if (!k?.brand) return undefined;
      const colours = k.colours ? ` · ${k.colours}` : "";
      return {
        key: `${lower(k.brand)}|${lower(k.size)}|${lower(k.colours)}`,
        text: `${k.brand}${k.model ? ` ${k.model}` : ""}${k.size !== undefined ? ` ${k.size}` : ""}${colours}`,
        what: "kite",
      };
    }
    default:
      return undefined; // vests are assigned per heat slot, so they cannot clash
  }
}

/** One warning per heat and clashing identifier: two riders in the same heat cannot be told apart on the water. */
export function identifierWarnings(draw: DivisionDraw): LadderWarning[] {
  const scheme = draw.overrides.identification ?? DEFAULT_SCHEME;
  const byId = new Map(draw.entrants.map((e) => [e.id, e]));
  const out: LadderWarning[] = [];
  for (const round of draw.rounds) {
    for (const h of round.heats) {
      const groups = new Map<string, { p: Primary; names: string[] }>();
      for (const s of h.slots) {
        const e = s.entrantId && s.modifier !== "DNS" ? byId.get(s.entrantId) : undefined;
        const p = e && primaryOf(scheme, e);
        if (!e || !p) continue;
        const g = groups.get(p.key) ?? { p, names: [] };
        g.names.push(e.name);
        groups.set(p.key, g);
      }
      for (const { p, names } of groups.values()) {
        if (names.length < 2) continue;
        out.push({
          type: "duplicate_identifier",
          round: round.id,
          heatId: h.id,
          message: `Heat ${h.number ?? h.id} has ${names.length} riders with the same ${p.what} (${p.text}): ${names.join(", ")}`,
          suggestion: "Swap one of these riders into another heat.",
        });
      }
    }
  }
  return out;
}

export function refreshIdentifierWarnings(draw: DivisionDraw): void {
  draw.warnings = [...draw.warnings.filter((w) => w.type !== "duplicate_identifier"), ...identifierWarnings(draw)];
}
