// Test helpers for the ladder engine (not exported from index.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFormatTemplate, type FormatTemplate } from "@/lib/schemas/format-template";
import { applyHeatResult } from "./progress";
import type { DivisionDraw, DrawHeat, Entrant, HeatResultInput, RankedEntry } from "./types";

export function loadFormat(name: string, patch?: (json: any) => void): FormatTemplate {
  const json = JSON.parse(readFileSync(join(process.cwd(), "presets", "formats", `${name}.json`), "utf8"));
  patch?.(json);
  return parseFormatTemplate(json);
}

/** Entrants "r1".."rN"; the array order is the seed order. */
export function makeEntrants(n: number, decorate?: (seed: number) => Partial<Entrant>): Entrant[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, name: `Rider ${i + 1}`, ...decorate?.(i + 1) }));
}

export const seedOf = (id: string) => Number(id.slice(1));

export function round(draw: DivisionDraw, id: string) {
  const r = draw.rounds.find((x) => x.id === id);
  if (!r) throw new Error(`no round ${id}`);
  return r;
}

export function heat(draw: DivisionDraw, id: string): DrawHeat {
  for (const r of draw.rounds) for (const h of r.heats) if (h.id === id) return h;
  throw new Error(`no heat ${id}`);
}

/** Seed numbers per heat of a round (placeholders show as 0). */
export function seeds(draw: DivisionDraw, roundId: string): number[][] {
  return round(draw, roundId).heats.map((h) => h.slots.map((s) => s.seed ?? 0));
}

/** Slot shape per heat of a round: "seed", "DNS" walkover, or "H2p1" placeholder. */
export function shape(draw: DivisionDraw, roundId: string): string[][] {
  return round(draw, roundId).heats.map((h) =>
    h.slots.map((s) => (s.seed ? String(s.seed) : s.modifier === "DNS" ? "WO" : `H${s.from?.heat}p${s.from?.place}`)),
  );
}

export const heatSizes = (draw: DivisionDraw, roundId: string) => round(draw, roundId).heats.map((h) => h.slots.length);

/** Rank the riders of a heat with `score(seed)` (higher wins), ties by tieKeys then lower seed. */
export function resultBy(
  h: DrawHeat,
  score: (seed: number, heatId: string) => number | { total: number; tieKeys?: number[] },
): HeatResultInput {
  const rows = h.slots
    .filter((s) => s.entrantId && s.modifier !== "DNS")
    .map((s) => {
      const v = score(s.seed!, h.id);
      const o = typeof v === "number" ? { total: v, tieKeys: [] as number[] } : { total: v.total, tieKeys: v.tieKeys ?? [] };
      return { id: s.entrantId!, seed: s.seed!, ...o };
    })
    .sort((a, b) => b.total - a.total || compareKeys(b.tieKeys, a.tieKeys) || a.seed - b.seed);
  const ranked: RankedEntry[] = rows.map((r, i) => ({ entrantId: r.id, place: i + 1, total: r.total, tieKeys: r.tieKeys }));
  for (const s of h.slots) {
    if (s.entrantId && s.modifier === "DNS") ranked.push({ entrantId: s.entrantId, place: ranked.length + 1, total: null, modifier: "DNS" });
  }
  return { ranked };
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Lower seed number wins: total = 100 − seed. */
export const bySeed = (seed: number) => 100 - seed;

export function publish(draw: DivisionDraw, heatId: string, score: Parameters<typeof resultBy>[1] = bySeed): DivisionDraw {
  const res = applyHeatResult(draw, heatId, resultBy(heat(draw, heatId), score));
  if (res.conflict) throw new Error(`unexpected conflict: ${res.conflict.message}`);
  return res.draw;
}

export function publishRound(draw: DivisionDraw, roundId: string, score?: Parameters<typeof resultBy>[1]): DivisionDraw {
  let d = draw;
  for (const h of round(d, roundId).heats) if (!h.bye) d = publish(d, h.id, score);
  return d;
}

/** Publish every round in order (lower seed wins every heat). */
export function publishAll(draw: DivisionDraw, score?: Parameters<typeof resultBy>[1]): DivisionDraw {
  let d = draw;
  for (const r of draw.rounds) d = publishRound(d, r.id, score);
  return d;
}
